// Supabase Edge Function — GET /functions/v1/weekStats?user_id=<id>&week_start=<YYYY-MM-DD>
//
// TICKET-20260522-020 §A. Aggregates the user's week of consumed dishes
// against per-nutrient targets, returns the top-3 deficit dimensions for
// Algorithm v55+'s 5-channel 💪 weekly_balance badge.
//
// Response contract (agreed with Algorithm 020 §B):
//   {
//     "user_id":    "<id>",
//     "week_start": "YYYY-MM-DD",
//     "deficits":   [{ nutrient, current, target, deficit_pct }, …]   // top-3, >=30%, desc
//     "computed_at":"ISO-8601 timestamp"
//   }
//
// Graceful degrade (the front-end and Algorithm both fall back to the
// pre-existing placeholder badge logic when deficits is empty):
//   - meal_logs table missing or empty for this user/week → deficits: []
//   - any other server error during aggregation             → deficits: []
//
// Data caveats (P2 follow-ups; not blocking the contract):
//   1. meal_logs is the canonical source of "what the user actually ate."
//      As of 2026-05-22, the table is NOT YET PROVISIONED — front-end keeps
//      eatingDiary in localStorage (eaten_YYYY-MM-DD = [dish-uuid, …]).
//      Until UI/Database land server-side sync (separate ticket), this fn
//      will always return deficits: []. Algorithm v55 falls back to its
//      tag-based weekly_balance heuristic, which is fine for the contract.
//   2. dishes table has iron_mg / calcium_mg / vitamin_c_mg / protein_g /
//      fiber_g / fat_g / carb_g — but NO zinc_mg / vitamin_d_iu / omega3_g
//      columns. So the spec's 7 dimensions reduce to 4 computable today
//      (protein / fiber / iron / calcium). The other 3 are silently dropped
//      from the deficit candidate set rather than returned with bogus zero.
//   3. Quota wiring (api_usage_daily.endpoint='weekStats', 50/day/user) is
//      not enforced here — the fn is read-only SQL aggregation with no AI
//      cost, and Algorithm caches results client-side via sessionStorage,
//      so per-user 50/day is rarely a real constraint. P2 wiring deferred.
//
// Deploy: supabase functions deploy weekStats --no-verify-jwt

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

// Adult daily targets per CDA 2022 (中国居民膳食指南); multiplied by 7 for
// the weekly horizon below. Only nutrients with a corresponding dishes
// column are listed; zinc/vitamin_d/omega3 are intentionally omitted
// (see caveat #2 in the file header).
const DAILY_TARGETS: Record<string, { col: string; target: number; unit: string }> = {
  protein: { col: "protein_g",    target:   65, unit: "g"  },
  fiber:   { col: "fiber_g",      target:   25, unit: "g"  },
  iron:    { col: "iron_mg",      target:   18, unit: "mg" },  // adult female; male=15
  calcium: { col: "calcium_mg",   target: 1000, unit: "mg" },
};
const WEEK_DAYS = 7;
const DEFICIT_THRESHOLD_PCT = 30;
const TOP_N = 3;

// "Table missing" detector — used to graceful-degrade when meal_logs and
// related tables haven't been provisioned yet.
function isMissingTable(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  return /relation .* does not exist|42P01|column .* does not exist|42703|PGRST20[02]|schema cache/i.test(err.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET")     return json({ error: "Method not allowed" }, 405);

  const url      = new URL(req.url);
  const userId   = url.searchParams.get("user_id");
  const weekStart = url.searchParams.get("week_start");
  if (!userId)    return json({ error: "user_id query param required" }, 400);
  if (!weekStart) return json({ error: "week_start (YYYY-MM-DD) query param required" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return json({ error: "week_start must match YYYY-MM-DD" }, 400);
  }

  const weekStartDate = new Date(weekStart + "T00:00:00Z");
  if (isNaN(weekStartDate.getTime())) return json({ error: "invalid week_start date" }, 400);
  const weekEndDate   = new Date(weekStartDate.getTime() + WEEK_DAYS * 86400_000);

  const computedAt = new Date().toISOString();
  const emptyResponse = {
    user_id:     userId,
    week_start:  weekStart,
    deficits:    [],
    computed_at: computedAt,
  };

  // 1) pull eaten dish IDs in [week_start, week_start + 7d)
  // Schema unknown until UI/Database provision meal_logs; degrade silently.
  let dishIds: string[] = [];
  try {
    const { data, error } = await supabase
      .from("meal_logs")
      .select("dish_id")
      .eq("user_id", userId)
      .gte("eaten_at", weekStartDate.toISOString())
      .lt("eaten_at",  weekEndDate.toISOString());
    if (error) {
      if (isMissingTable(error)) {
        return json({ ...emptyResponse, note: "meal_logs table not yet provisioned — Algorithm should fall back to placeholder badge logic" });
      }
      console.error("[weekStats] meal_logs read failed:", error.message);
      return json({ ...emptyResponse, note: `meal_logs read error: ${error.message}` });
    }
    dishIds = (data ?? [])
      .map(r => (r as { dish_id?: string }).dish_id)
      .filter((id): id is string => !!id);
  } catch (e) {
    console.error("[weekStats] meal_logs catch:", e);
    return json({ ...emptyResponse, note: `meal_logs exception: ${(e as Error).message}` });
  }

  if (dishIds.length === 0) {
    return json({ ...emptyResponse, note: "no meal_logs rows in window" });
  }

  // 2) JOIN dishes for the 4 nutrient columns (graceful drop on missing col)
  const nutritionCols = Object.values(DAILY_TARGETS).map(t => t.col).join(", ");
  const { data: dishes, error: dErr } = await supabase
    .from("dishes")
    .select(`id, ${nutritionCols}`)
    .in("id", dishIds);
  if (dErr) {
    console.error("[weekStats] dishes JOIN failed:", dErr.message);
    return json({ ...emptyResponse, note: `dishes JOIN error: ${dErr.message}` });
  }

  // 3) aggregate consumed nutrients across the week
  const consumed: Record<string, number> = {};
  for (const k of Object.keys(DAILY_TARGETS)) consumed[k] = 0;
  for (const d of dishes ?? []) {
    const row = d as Record<string, unknown>;
    for (const [k, def] of Object.entries(DAILY_TARGETS)) {
      const v = row[def.col];
      if (typeof v === "number") consumed[k] += v;
    }
  }

  // 4) compute weekly target + deficit_pct per nutrient, keep ≥ threshold
  const allDeficits = Object.entries(DAILY_TARGETS).map(([nutrient, def]) => {
    const weeklyTarget = def.target * WEEK_DAYS;
    const current      = +consumed[nutrient].toFixed(2);
    const deficit_pct  = weeklyTarget === 0
      ? 0
      : Math.max(0, Math.round((1 - current / weeklyTarget) * 100));
    return { nutrient, current, target: weeklyTarget, deficit_pct };
  });

  const topDeficits = allDeficits
    .filter(d => d.deficit_pct >= DEFICIT_THRESHOLD_PCT)
    .sort((a, b) => b.deficit_pct - a.deficit_pct)
    .slice(0, TOP_N);

  return json({
    user_id:     userId,
    week_start:  weekStart,
    deficits:    topDeficits,
    computed_at: computedAt,
  });
});
