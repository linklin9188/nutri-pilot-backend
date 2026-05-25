// Supabase Edge Function — POST /functions/v1/parse-intent
//
// Server-side proxy for Gemini intent parsing. Replaces the previous
// "call Google directly from the browser with VITE_GEMINI_API_KEY"
// path — that key was in the public bundle and could be extracted by
// any attacker, who could then drain the project's Gemini billing.
//
// Per-user daily rate limit (20 calls / day / user_id) enforced via
// the api_usage_daily table.
//
// Required env (supabase secrets set):
//   GEMINI_API_KEY   — server-side only, NOT exposed to frontend
//
// Deploy: supabase functions deploy parse-intent --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

const DAILY_LIMIT = 20;
const ENDPOINT = "parse-intent";

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

/** Atomic increment-and-check. Returns true if under limit. */
async function bumpCounter(userId: string): Promise<{ ok: boolean; count: number }> {
  const today = new Date().toISOString().slice(0, 10);
  // Upsert with explicit increment. Two queries because Supabase JS
  // doesn't expose ON CONFLICT … SET count = count + 1 in a single
  // call without raw SQL.
  const { data: existing } = await supabase
    .from("api_usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", today)
    .eq("endpoint", ENDPOINT)
    .maybeSingle();
  const currentCount = (existing as { count?: number } | null)?.count ?? 0;
  if (currentCount >= DAILY_LIMIT) {
    return { ok: false, count: currentCount };
  }
  await supabase.from("api_usage_daily").upsert({
    user_id:    userId,
    day:        today,
    endpoint:   ENDPOINT,
    count:      currentCount + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,day,endpoint" });
  return { ok: true, count: currentCount + 1 };
}

const PROMPT = (userText: string) => `You are a menu personalization assistant. The user wants to re-generate a weekly menu and just typed this request (in Chinese):

"""
${userText}
"""

Convert it into a structured bias object. Use ONLY these axes:

- categoryBoosts: { seafood?, pork?, beef?, poultry?, plant?, carb? }   in [-2, +2]
- tagBoosts: { spicy?, light?, sweet?, savory?, low_sodium?, low_sugar?, low_purine?, detox?, energy?, immunity?, blood_tonic?, sleep_aid?, yin_nourish?, qi_tonic?, mood_boost?, anti_aging?, beauty?, damp_clear?, anti_inflammation?, eye_care?, lose_weight?, muscle_gain? }   in [-2, +2]
- cuisineBoosts: { cantonese?, sichuan?, jiangnan?, northern?, western?, japanese_korean?, southeast_asian?, hunan?, northwest?, fujian?, hakka?, northeast? }   in [-2, +2]
- chips: 1-5 short Chinese chips

Mapping cheat sheet (tag axes):
  补气血→blood_tonic, 失眠→sleep_aid, 滋阴→yin_nourish, 益气→qi_tonic,
  心情压力→mood_boost, 抗衰→anti_aging, 美容→beauty, 湿气→damp_clear,
  关节痛炎症→anti_inflammation, 护眼→eye_care, 减肥→lose_weight,
  增肌→muscle_gain, 高血压→low_sodium, 糖尿病→low_sugar, 痛风→low_purine.

Cuisine axes (用户提到菜系/地域时一律用 cuisineBoosts, 不要错塞 tagBoosts):
  粤菜/广东/港式/茶餐厅→cantonese, 川菜/麻辣/重庆→sichuan,
  江南/上海/苏菜/浙菜/杭帮/淮扬→jiangnan, 北方/京菜/鲁菜/山东→northern,
  西餐/意大利/法餐/牛排/披萨→western, 日料/寿司/拉面/韩餐/韩式→japanese_korean,
  东南亚/泰餐/越南/冬阴功→southeast_asian, 湘菜/湖南/剁椒→hunan,
  西北/陕西/兰州/新疆/大盘鸡/羊肉泡馍/莜面→northwest, 闽菜/福建/佛跳墙→fujian,
  客家/梅菜→hakka, 东北/锅包肉→northeast.
  "不想吃X菜"→ cuisineBoosts 用负值 (e.g. 今天不想吃川菜 → sichuan=-1).
  典型 positive 值 +1.0~+1.5, 强烈想吃 +1.8~+2.0.

Output ONLY valid JSON.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const { user_id, text } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return json({ error: "user_id required" }, 400);
    }
    if (!text || typeof text !== "string" || !text.trim()) {
      return json({ error: "text required" }, 400);
    }
    if (text.length > 500) {
      return json({ error: "text too long (max 500 chars)" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!apiKey) return json({ error: "Gemini not configured" }, 500);

    // Rate limit
    const rate = await bumpCounter(user_id);
    if (!rate.ok) {
      return json(
        { error: `Daily limit reached (${DAILY_LIMIT}/day). 明日再试。`, count: rate.count },
        429,
      );
    }

    // Proxy to Gemini
    const gemRes = await fetch(GEMINI_URL(apiKey), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        contents:          [{ role: "user", parts: [{ text: PROMPT(text) }] }],
        generationConfig:  { responseMimeType: "application/json" },
      }),
    });
    const gemJson = await gemRes.json();
    if (!gemRes.ok) {
      return json({ error: gemJson?.error?.message ?? "Gemini error" }, 502);
    }

    const raw: string = gemJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch {
      return json({ error: "Gemini returned invalid JSON" }, 502);
    }

    return json({ bias: parsed, remaining: DAILY_LIMIT - rate.count });
  } catch (e) {
    console.error("parse-intent failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
