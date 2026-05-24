// Supabase Edge Function — POST /functions/v1/supplier-order-track
//
// TICKET TELEPOT-20260524-028 第 4 步 Phase 2 §B (Backend 第 2 棒).
// 用户点"一键下单" → 后台记日志 + 返回供货商订购页 URL → 前端 redirect.
// 故意不让后台抓供货商页面 (避免跨域 / 长尾抓取问题), 跳转纯前端.
//
// Body JSON:
//   {
//     "sku_id":         "<uuid>",                  // 必填
//     "source_dish_id": "<uuid | null>",           // 可选 — 用户从哪个菜的"立即下单"按钮点的
//     "source_page":    "verify-ingredients | home | weekly",
//     "user_id":        "<string | null>"          // 可选 — anon-first, 没登录也允许
//   }
//
// Response:
//   200 { ok: true,  redirect_url: "<order_url>", log_id: "<uuid>" }
//   400 { ok: false, error: "sku_id required" }
//   404 { ok: false, error: "SKU not found or inactive" }
//
// Deploy: supabase functions deploy supplier-order-track --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TrackBody {
  sku_id?: string;
  source_dish_id?: string | null;
  source_page?: string | null;
  user_id?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  let body: TrackBody;
  try {
    body = await req.json() as TrackBody;
  } catch (_e) {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const skuId = body.sku_id;
  if (!skuId)                return json({ ok: false, error: "sku_id required" }, 400);
  if (!UUID_RE.test(skuId))  return json({ ok: false, error: "sku_id must be a valid uuid" }, 400);

  const sourceDishId = body.source_dish_id ?? null;
  const sourcePage   = body.source_page ?? null;
  const userId       = body.user_id ?? null;
  const userAgent    = req.headers.get("user-agent") ?? null;

  // dish id 校验 (允许 null, 但非 null 必须是 uuid)
  if (sourceDishId !== null && !UUID_RE.test(sourceDishId)) {
    return json({ ok: false, error: "source_dish_id must be a valid uuid or null" }, 400);
  }

  // 1) INSERT click log — 即便 SKU 查询失败也先把点击记下来 (用户意图最重要)
  const { data: logRow, error: logErr } = await supabase
    .from("supplier_click_log")
    .insert({
      user_id:        userId,
      sku_id:         skuId,
      source_dish_id: sourceDishId,
      source_page:    sourcePage,
      user_agent:     userAgent,
    })
    .select("id")
    .maybeSingle();

  if (logErr) {
    console.error("[supplier-order-track] click log insert failed:", logErr.message);
    // 不阻塞: 日志写不进去仍尝试返回 redirect_url, 让用户能下单
  }
  const logId = (logRow as { id?: string } | null)?.id ?? null;

  // 2) 查 SKU 的 order_url (active=true 才返)
  const { data: skuRow, error: skuErr } = await supabase
    .from("supplier_skus")
    .select("id, order_url, active")
    .eq("id", skuId)
    .maybeSingle();

  if (skuErr) {
    console.error("[supplier-order-track] sku read failed:", skuErr.message);
    return json({ ok: false, error: "sku read failed", detail: skuErr.message, log_id: logId }, 500);
  }
  if (!skuRow)          return json({ ok: false, error: "SKU not found", log_id: logId }, 404);
  if (!skuRow.active)   return json({ ok: false, error: "SKU not found or inactive", log_id: logId }, 404);
  if (!skuRow.order_url) return json({ ok: false, error: "SKU has no order_url", log_id: logId }, 404);

  return json({
    ok:           true,
    redirect_url: skuRow.order_url as string,
    log_id:       logId,
  });
});
