// Supabase Edge Function — GET /functions/v1/dau-snapshot
//
// Day 12 observability — returns DAU/WAU + 24h feature-engagement counts so the
// CEO can answer "how many active users today" without opening the dashboard.
//
// Spec : TICKET-20260520-063 §B.
// Auth : service-role only. The function is deployed with --no-verify-jwt so
//        Supabase's automatic JWT layer is bypassed, but the function itself
//        rejects any request whose Authorization header is not
//        `Bearer <SUPABASE_SERVICE_ROLE_KEY>`. Anonymous traffic → 401.
//
// Output:
//   {
//     date: '2026-05-20',
//     dau: <distinct user_id last 24h across user_weekly_menus / user_feedback_helper / chat_sessions>,
//     wau: <distinct user_id last 7d>,
//     feedback_count_24h: <user_feedback_helper rows last 24h>,
//     chat_sessions_24h:  <chat_sessions rows last 24h>,
//     weekly_menus_24h:   <user_weekly_menus rows last 24h>
//   }
//
// Required env (Supabase auto-injected):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Deploy: supabase functions deploy dau-snapshot --no-verify-jwt
// Test  : curl -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' <project>.functions.supabase.co/dau-snapshot

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

// Return the ISO timestamp `hours` hours ago — used as the lower bound for
// every "last N hours" window query.
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function distinctUserIds(table: string, hours: number): Promise<Set<string>> {
  const since = hoursAgo(hours);
  const { data, error } = await supabase
    .from(table)
    .select("user_id")
    .gte("created_at", since)
    .limit(10000);   // hard cap to bound memory; β volume is tiny so this is plenty
  if (error) {
    console.warn(`distinctUserIds ${table} ${hours}h failed:`, error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((r) => (r as { user_id?: string }).user_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );
}

async function rowCount(table: string, hours: number): Promise<number> {
  const since = hoursAgo(hours);
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", since);
  if (error) {
    console.warn(`rowCount ${table} ${hours}h failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  // Service-role check — anonymous and anon-key traffic gets 401.
  const authHeader = req.headers.get("Authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!SERVICE_ROLE_KEY || presented !== SERVICE_ROLE_KEY) {
    return json({ error: "Unauthorized — service-role token required" }, 401);
  }

  try {
    // DAU = distinct user_id across 3 engagement tables last 24h
    const tables = ["user_weekly_menus", "user_feedback_helper", "chat_sessions"];
    const sets24 = await Promise.all(tables.map((t) => distinctUserIds(t, 24)));
    const dauSet = new Set<string>();
    for (const s of sets24) for (const u of s) dauSet.add(u);

    const sets7d = await Promise.all(tables.map((t) => distinctUserIds(t, 24 * 7)));
    const wauSet = new Set<string>();
    for (const s of sets7d) for (const u of s) wauSet.add(u);

    const [feedback_count_24h, chat_sessions_24h, weekly_menus_24h] = await Promise.all([
      rowCount("user_feedback_helper", 24),
      rowCount("chat_sessions",        24),
      rowCount("user_weekly_menus",    24),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    return json({
      date: today,
      dau: dauSet.size,
      wau: wauSet.size,
      feedback_count_24h,
      chat_sessions_24h,
      weekly_menus_24h,
    });
  } catch (e) {
    console.error("dau-snapshot failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
