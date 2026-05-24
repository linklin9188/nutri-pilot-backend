// Supabase Edge Function — GET /functions/v1/supplier-inventory-check?sku_id=<uuid>
//
// TICKET TELEPOT-20260524-028 第 4 步 Phase 2 §A (Backend 第 2 棒).
// Returns the realtime stock count for a supplier SKU. Phase 2 骨架版:
//   - 大多数 SKU 没有真 supplier API 文档 → 走 mock 分支 (suppliers.api_base_url IS NULL
//     或 supplier_inventory_cache.is_mock = true), 直接返 cache 现有数据.
//   - 拿到 API 文档后 supplier 行 fill api_base_url + sku 行 fill inventory_check_endpoint_path,
//     这条 fn 自动切真 API 路径, 前端 0 改动 (contract 不变).
//
// Response contract (前端 verify-ingredients / shopping-list / home 都用同一 shape):
//   {
//     "sku_id":         "<uuid>",
//     "stock_count":    <integer>,
//     "is_mock":        <boolean>,                    // mock 还是真 API 来源
//     "last_synced_at": "<ISO-8601>",
//     "cached":         <boolean>,                    // true = 命中 TTL cache, false = 本次刷
//     "mock_reason":    "api_pending_docs",           // 仅 mock 路径返
//     "fallback_reason":"api_error",                  // 仅真 API 失败 fallback 路径返
//     "source":         "live_api"                    // 仅真 API 成功路径返
//   }
//
// 错误:
//   400 — sku_id 缺失 / 不是 uuid
//   404 — sku 不存在
//   405 — method 不是 GET / OPTIONS
//
// Deploy: supabase functions deploy supplier-inventory-check --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_MOCK_STOCK = 50;
const API_TIMEOUT_MS = 5000;

interface CacheRow {
  stock_count: number;
  is_mock: boolean;
  last_synced_at: string;
  ttl_seconds: number;
}

interface SkuRow {
  id: string;
  active: boolean;
  inventory_check_endpoint_path: string | null;
  sku_external_id: string | null;
  supplier_id: string | null;
  suppliers: {
    api_base_url: string | null;
    api_auth_type: string | null;
    api_auth_credentials_encrypted: string | null;
  } | null;
}

async function upsertCache(
  skuId: string,
  stockCount: number,
  isMock: boolean,
  ttlSeconds = 300,
): Promise<string> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("supplier_inventory_cache")
    .upsert(
      {
        sku_id:         skuId,
        stock_count:    stockCount,
        is_mock:        isMock,
        last_synced_at: nowIso,
        ttl_seconds:    ttlSeconds,
      },
      { onConflict: "sku_id" },
    );
  if (error) {
    console.error("[supplier-inventory-check] cache upsert failed:", error.message);
  }
  return nowIso;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET")     return json({ error: "Method not allowed" }, 405);

  const url   = new URL(req.url);
  const skuId = url.searchParams.get("sku_id");
  if (!skuId)             return json({ error: "sku_id query param required" }, 400);
  if (!UUID_RE.test(skuId)) return json({ error: "sku_id must be a valid uuid" }, 400);

  // 1) check cache first — TTL hit → return immediately
  const { data: cacheRow, error: cacheErr } = await supabase
    .from("supplier_inventory_cache")
    .select("stock_count, is_mock, last_synced_at, ttl_seconds")
    .eq("sku_id", skuId)
    .maybeSingle();

  if (cacheErr) {
    console.error("[supplier-inventory-check] cache read failed:", cacheErr.message);
  }

  const cache = cacheRow as CacheRow | null;
  if (cache) {
    const lastSyncMs = new Date(cache.last_synced_at).getTime();
    const expiresAt  = lastSyncMs + (cache.ttl_seconds ?? 300) * 1000;
    if (Number.isFinite(lastSyncMs) && expiresAt > Date.now()) {
      return json({
        sku_id:         skuId,
        stock_count:    cache.stock_count,
        is_mock:        cache.is_mock,
        last_synced_at: cache.last_synced_at,
        cached:         true,
      });
    }
  }

  // 2) cache miss / stale → look up SKU + supplier config
  const { data: skuRow, error: skuErr } = await supabase
    .from("supplier_skus")
    .select(`
      id,
      active,
      inventory_check_endpoint_path,
      sku_external_id,
      supplier_id,
      suppliers:suppliers!supplier_skus_supplier_id_fkey (
        api_base_url,
        api_auth_type,
        api_auth_credentials_encrypted
      )
    `)
    .eq("id", skuId)
    .maybeSingle();

  if (skuErr) {
    console.error("[supplier-inventory-check] sku read failed:", skuErr.message);
    return json({ error: "sku read failed", detail: skuErr.message }, 500);
  }
  if (!skuRow) return json({ error: "SKU not found" }, 404);

  const sku    = skuRow as unknown as SkuRow;
  const apiUrl = sku.suppliers?.api_base_url ?? null;

  // 3a) mock branch — no real supplier API yet, or cache row已经标 is_mock
  //     条件: supplier 没填 api_base_url, 或 cache 已存在且 is_mock=true (老板未升级到真 API)
  const isMockMode = !apiUrl || (cache?.is_mock === true);

  if (isMockMode) {
    const stockCount  = cache?.stock_count ?? DEFAULT_MOCK_STOCK;
    const syncedAtIso = await upsertCache(skuId, stockCount, true);
    return json({
      sku_id:         skuId,
      stock_count:    stockCount,
      is_mock:        true,
      last_synced_at: syncedAtIso,
      cached:         false,
      mock_reason:    "api_pending_docs",
    });
  }

  // 3b) live API branch — supplier 给了文档, 拼 URL + 加 auth header + fetch
  // TODO: integrate live API — 当前没真 supplier API 可测, 代码骨架完整但实测靠 supplier 接入后再验
  try {
    const endpointPath = sku.inventory_check_endpoint_path ?? "";
    const externalId   = sku.sku_external_id ?? "";
    const fullUrl      = `${apiUrl}${endpointPath}`.replace(
      "{sku_external_id}",
      encodeURIComponent(externalId),
    );

    const headers: Record<string, string> = { "Accept": "application/json" };
    const authType  = sku.suppliers?.api_auth_type ?? "none";
    const authCreds = sku.suppliers?.api_auth_credentials_encrypted ?? "";
    if (authType === "bearer" && authCreds) {
      headers["Authorization"] = `Bearer ${authCreds}`;
    } else if (authType === "api_key_header" && authCreds) {
      headers["X-API-Key"] = authCreds;
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const apiResp    = await fetch(fullUrl, { headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!apiResp.ok) {
      throw new Error(`supplier API HTTP ${apiResp.status}`);
    }

    const apiData = await apiResp.json() as { stock?: number; stock_count?: number; quantity?: number };
    const stockCount = Number(
      apiData.stock_count ?? apiData.stock ?? apiData.quantity ?? 0,
    );
    if (!Number.isFinite(stockCount)) {
      throw new Error("supplier API returned non-numeric stock");
    }

    const syncedAtIso = await upsertCache(skuId, stockCount, false);
    return json({
      sku_id:         skuId,
      stock_count:    stockCount,
      is_mock:        false,
      last_synced_at: syncedAtIso,
      cached:         false,
      source:         "live_api",
    });
  } catch (e) {
    console.error("[supplier-inventory-check] live API failed:", (e as Error).message);
    // fallback: 用 cache 现有数据 (即便已过 TTL — 比报错强)
    if (cache) {
      return json({
        sku_id:          skuId,
        stock_count:     cache.stock_count,
        is_mock:         cache.is_mock,
        last_synced_at:  cache.last_synced_at,
        cached:          true,
        fallback_reason: "api_error",
      });
    }
    // 完全没 cache 也没 API — 最后保底返 mock 默认值
    const syncedAtIso = await upsertCache(skuId, DEFAULT_MOCK_STOCK, true);
    return json({
      sku_id:          skuId,
      stock_count:     DEFAULT_MOCK_STOCK,
      is_mock:         true,
      last_synced_at:  syncedAtIso,
      cached:          false,
      fallback_reason: "api_error",
      mock_reason:     "api_pending_docs",
    });
  }
});
