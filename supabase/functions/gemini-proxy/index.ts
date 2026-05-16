// Supabase Edge Function — POST /functions/v1/gemini-proxy
//
// Generic Gemini proxy. Replaces the 4 frontend lib calls that used
// to hit Google directly with VITE_GEMINI_API_KEY. The key now lives
// in Supabase secrets only — even if an attacker extracts our anon
// key from the bundle, they still can't drain Gemini billing.
//
// Frontend libs (geminiVision / geminiMichelin / geminiSchoolBalance
// / geminiRecipe) POST { user_id, endpoint, contents,
// generationConfig? } to this function. We rate-limit per
// (user_id, endpoint) via api_usage_daily and forward to Gemini.
//
// Required env (supabase secrets set):
//   GEMINI_API_KEY
//
// Deploy: supabase functions deploy gemini-proxy --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Per-endpoint daily quotas — sized for legit usage patterns. Vision
// is expensive (image tokens) so capped tighter; recipe / michelin
// are short text calls so more generous.
const ENDPOINT_LIMITS: Record<string, number> = {
  vision:         15,  // 冰箱 / 货架扫描
  michelin:       20,  // 米其林推荐
  school_balance: 15,  // 学校营养补全
  recipe:         30,  // AI 菜谱生成
};

const DEFAULT_MODEL = "gemini-2.5-flash";

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

async function bumpCounter(userId: string, endpoint: string, limit: number): Promise<{ ok: boolean; count: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const epKey = `gemini-${endpoint}`;
  const { data: existing } = await supabase
    .from("api_usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", today)
    .eq("endpoint", epKey)
    .maybeSingle();
  const currentCount = (existing as { count?: number } | null)?.count ?? 0;
  if (currentCount >= limit) {
    return { ok: false, count: currentCount };
  }
  await supabase.from("api_usage_daily").upsert({
    user_id:    userId,
    day:        today,
    endpoint:   epKey,
    count:      currentCount + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,day,endpoint" });
  return { ok: true, count: currentCount + 1 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { user_id, endpoint, contents, generationConfig, model } = body ?? {};

    if (!user_id || typeof user_id !== "string") {
      return json({ error: "user_id required" }, 400);
    }
    if (!endpoint || !(endpoint in ENDPOINT_LIMITS)) {
      return json({ error: "Unknown endpoint" }, 400);
    }
    if (!Array.isArray(contents) || contents.length === 0) {
      return json({ error: "contents (array) required" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!apiKey) return json({ error: "Gemini not configured" }, 500);

    // Rate-limit per endpoint.
    const limit = ENDPOINT_LIMITS[endpoint];
    const rate = await bumpCounter(user_id, endpoint, limit);
    if (!rate.ok) {
      return json(
        { error: `今日 ${endpoint} 额度已用完 (${limit}/day)，明日再试。`, count: rate.count },
        429,
      );
    }

    // Forward to Gemini.
    const safeModel = typeof model === "string" && /^gemini-[a-z0-9.-]+$/i.test(model)
      ? model
      : DEFAULT_MODEL;
    const url = `${GEMINI_BASE}/${safeModel}:generateContent?key=${apiKey}`;
    const gemRes = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        contents,
        ...(generationConfig ? { generationConfig } : {}),
      }),
    });
    const gemJson = await gemRes.json();
    if (!gemRes.ok) {
      console.error("Gemini error:", gemJson);
      return json({ error: gemJson?.error?.message ?? "Gemini error" }, 502);
    }

    return json({ data: gemJson, remaining: limit - rate.count });
  } catch (e) {
    console.error("gemini-proxy failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
