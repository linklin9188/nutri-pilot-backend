// Supabase Edge Function — GET /functions/v1/beta-readiness-check
//
// TICKET-20260520-065. One-shot β-launch self-test endpoint. CEO can `curl` it
// any time and see all 7 critical dependencies' health in one JSON.
//
// READ ONLY — never mutates any data. Deploys with --no-verify-jwt so a quick
// curl without auth still works (it's a status endpoint, not sensitive data).
//
// Required env (Supabase auto-injected + secrets):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY     — used to (a) read api_usage_daily / tables /
//                                    (b) call dau-snapshot internally for check #7
//   STRIPE_SECRET_KEY             — for check #1 (Stripe list prices)
//
// Deploy: supabase functions deploy beta-readiness-check --no-verify-jwt

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// Keep in sync with src/pages/Pricing.tsx STRIPE_PRICE_IDS +
// stripe-webhook/index.ts PRICE_TO_PLAN + create-checkout-session ALLOWED_PRICE_IDS.
const ALLOWED_PRICE_IDS = [
  "price_1TXD3dL2TBEx2Gg0TRBnWrE9",  // pro_monthly  HK$66
  "price_1TXDCwL2TBEx2Gg0n6pSJLsJ",  // pro_halfyear HK$199
  "price_1TXDDjL2TBEx2Gg05nADOkJb",  // pro_yearly   HK$365
];

// Daily quota caps per endpoint — mirror of ENDPOINT_LIMITS in gemini-proxy.
const GEMINI_ENDPOINT_LIMITS: Record<string, number> = {
  vision:         15,
  michelin:       20,
  school_balance: 15,
  recipe:         30,
  chat:           30,
  translate:      50,
};

// Critical tables β-launch can't ship without.
const REQUIRED_TABLES = [
  "dishes",
  "user_profiles",
  "households",
  "household_members",
  "user_weekly_menus",
  "ingredient_seasonality",
  "data_health_history",
  "data_health_summary",   // VIEW (information_schema.tables still lists views)
];

// Severity buckets for overall computation (per TICKET §C).
const RED_CHECKS = new Set<string>([
  "tables_exist",
  "user_weekly_menus_stale",
  "ingredient_seasonality_count",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── individual checks ───────────────────────────────────────────────────────

async function checkStripePriceWhitelist(): Promise<Record<string, unknown>> {
  try {
    // Stripe list-prices is rate-limited but cheap. Set a 3s timeout per ticket.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const allFound: string[] = [];
      const missing: string[] = [];
      for (const id of ALLOWED_PRICE_IDS) {
        const p = await stripe.prices.retrieve(id);
        if (p && p.active) allFound.push(id);
        else missing.push(id);
      }
      clearTimeout(timeout);
      return { ok: missing.length === 0, count: allFound.length, ids: allFound, missing };
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message, severity: "yellow" };
  }
}

async function checkGeminiQuotaRemaining(): Promise<Record<string, unknown>> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("api_usage_daily")
      .select("endpoint, count")
      .eq("day", today);
    if (error) return { ok: false, error: error.message };

    // Group by endpoint, take max count (worst-case single user usage)
    const maxByEndpoint: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ endpoint: string; count: number }>) {
      if (!r.endpoint) continue;
      maxByEndpoint[r.endpoint] = Math.max(maxByEndpoint[r.endpoint] ?? 0, r.count ?? 0);
    }

    const endpoints: Record<string, { used: number; limit: number; remaining: number; pct_remaining: number }> = {};
    let allOk = true;
    for (const [ep, limit] of Object.entries(GEMINI_ENDPOINT_LIMITS)) {
      const used = maxByEndpoint[ep] ?? 0;
      const remaining = Math.max(0, limit - used);
      const pct = (remaining / limit) * 100;
      endpoints[ep] = { used, limit, remaining, pct_remaining: Math.round(pct * 10) / 10 };
      if (pct < 10) allOk = false;
    }
    return { ok: allOk, endpoints };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function checkTablesExist(): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await supabase
      .from("information_schema.tables" as any)
      .select("table_name")
      .eq("table_schema", "public")
      .in("table_name", REQUIRED_TABLES);
    if (error) {
      // PostgREST can't expose information_schema directly — fall back to one query per table.
      const present = new Set<string>();
      for (const t of REQUIRED_TABLES) {
        const { error: e } = await supabase.from(t).select("*", { count: "exact", head: true }).limit(0);
        if (!e) present.add(t);
      }
      const missing = REQUIRED_TABLES.filter(t => !present.has(t));
      return { ok: missing.length === 0, missing, found: [...present] };
    }
    const present = new Set((data ?? []).map((r: any) => r.table_name as string));
    const missing = REQUIRED_TABLES.filter(t => !present.has(t));
    return { ok: missing.length === 0, missing, found: [...present] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function checkUserWeeklyMenusStale(): Promise<Record<string, unknown>> {
  try {
    // We don't have GROUP BY via PostgREST without an RPC. Pull a sample of
    // algo_version values and bucket client-side. β volume is small (~400 rows).
    const { data, error } = await supabase
      .from("user_weekly_menus")
      .select("algo_version")
      .limit(10000);
    if (error) return { ok: false, error: error.message };
    const buckets: Record<string, number> = { NULL: 0 };
    for (const r of (data ?? []) as Array<{ algo_version: string | null }>) {
      const k = r.algo_version === null || r.algo_version === undefined ? "NULL" : r.algo_version;
      buckets[k] = (buckets[k] ?? 0) + 1;
    }
    // NULL count is the Smell-4 hold-out; ok when it's 0.
    return { ok: (buckets.NULL ?? 0) === 0, distribution: buckets };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function checkIngredientSeasonalityCount(): Promise<Record<string, unknown>> {
  try {
    const { count, error } = await supabase
      .from("ingredient_seasonality")
      .select("*", { count: "exact", head: true });
    if (error) return { ok: false, error: error.message, count: 0 };
    const n = count ?? 0;
    return { ok: n >= 60, count: n };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function checkDataHealthHistoryRecent(): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await supabase
      .from("data_health_history")
      .select("snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(1);
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, latest_snapshot_age_hours: null, error: "no snapshots" };
    const latest = new Date((data[0] as { snapshot_at: string }).snapshot_at);
    const ageHours = (Date.now() - latest.getTime()) / 3_600_000;
    return {
      ok: ageHours < 26,
      latest_snapshot_at: latest.toISOString(),
      latest_snapshot_age_hours: Math.round(ageHours * 10) / 10,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function checkDauSnapshotCallable(): Promise<Record<string, unknown>> {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return { ok: false, error: "missing SUPABASE_URL / SERVICE_ROLE_KEY env" };
    const url = `${SUPABASE_URL}/functions/v1/dau-snapshot`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    const body = await res.json().catch(() => ({}));
    const hasFields = ["date", "dau", "wau", "feedback_count_24h", "chat_sessions_24h", "weekly_menus_24h"]
      .every(k => k in (body as Record<string, unknown>));
    return { ok: res.status === 200 && hasFields, status: res.status, last_ok_ts: new Date().toISOString(), has_required_fields: hasFields };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── entry ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  // Run all checks in parallel — they're independent, total ~5s worst case.
  const [
    stripe_price_whitelist,
    gemini_quota_remaining,
    tables_exist,
    user_weekly_menus_stale,
    ingredient_seasonality_count,
    data_health_history_recent,
    dau_snapshot_callable,
  ] = await Promise.all([
    checkStripePriceWhitelist(),
    checkGeminiQuotaRemaining(),
    checkTablesExist(),
    checkUserWeeklyMenusStale(),
    checkIngredientSeasonalityCount(),
    checkDataHealthHistoryRecent(),
    checkDauSnapshotCallable(),
  ]);

  const checks: Record<string, Record<string, unknown>> = {
    stripe_price_whitelist,
    gemini_quota_remaining,
    tables_exist,
    user_weekly_menus_stale,
    ingredient_seasonality_count,
    data_health_history_recent,
    dau_snapshot_callable,
  };

  // overall: RED if any of the 3 hard-fail checks ko; YELLOW if any other ko; else GREEN.
  let overall: "GREEN" | "YELLOW" | "RED" = "GREEN";
  for (const [name, c] of Object.entries(checks)) {
    if (c.ok === false) {
      if (RED_CHECKS.has(name)) {
        overall = "RED";
        break;
      } else {
        overall = "YELLOW";   // keep scanning — a RED later overrides
      }
    }
  }
  // If a RED was hit we broke out; otherwise re-scan to catch any RED missed.
  if (overall !== "RED") {
    for (const [name, c] of Object.entries(checks)) {
      if (c.ok === false && RED_CHECKS.has(name)) { overall = "RED"; break; }
    }
  }

  return json({
    ts: new Date().toISOString(),
    checks,
    overall,
  });
});
