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
  chat:           30,  // Day 2 ChatAgent — dispatch goes through handleChatEndpoint (5-rule throttling, SSE stream)
  translate:      50,  // Day 4 cook-step translation (zh → en/tl/id) — dispatch via handleTranslateEndpoint
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

    // Day 2 ChatAgent — chat endpoint has its own dispatch path (SSE stream + 5-rule
    // token throttling). Keep it out of the generic vision/michelin/etc. flow because
    // chat needs throttling before bumpCounter, supports streaming responses, and
    // builds its own system prompt from intent + proposals.
    if (endpoint === "chat") {
      return await handleChatEndpoint(body);
    }

    // Day 4 cook-step translation — translate endpoint also has its own dispatch
    // because it builds a hard-constrained translation prompt server-side (caller
    // only supplies source_text + target_lang) and rejects oversize inputs early.
    // Plain JSON response (not SSE) — small/short outputs.
    if (endpoint === "translate") {
      return await handleTranslateEndpoint(body);
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

// ── Day 2 ChatAgent — chat endpoint ─────────────────────────────────────────
// SPEC: docs/SPEC_day2_chat_agent.md §4.1, TICKET-20260520-014 §A/§B/§C.
// 5-rule token throttling enforced before any Gemini call so abusive sessions
// can't burn quota past the daily cap.

const CHAT_DAILY_LIMIT          = 20;   // §C 节流 1: 同 user 同日 chat ≥ 20 次 → 固定话术
const SUPPORT_PER_CLASS_LIMIT   = 3;    // §C 节流 2: chat_support_* 同类同日 ≥ 3 次 → FAQ 模板
const CHAT_MESSAGE_MAX_LEN      = 500;  // §C 节流 3: user message > 500 字符 → 截断
const CHAT_TOKEN_CAP: Record<string, number> = {  // §C 节流 4
  chat_menu:              400,
  chat_support_shipping:  120,
  chat_support_quality:   120,
  chat_support_other:     120,
  default:                200,
};

const VALID_INTENT_CLASSES = new Set<string>([
  "chat_menu",
  "chat_support_shipping",
  "chat_support_quality",
  "chat_support_other",
]);

const FAQ_TEMPLATES: Record<string, string> = {
  chat_support_shipping: "配送相关：订单 30 分钟内可改地址，已发货请联系 WhatsApp +852 xxxx。",
  chat_support_quality:  "菜品质量问题请拍照发送到 quality@aieats.com，48 小时内退款。",
  chat_support_other:    "其他问题请联系客服 WhatsApp +852 xxxx，工作日 09:00-21:00。",
};

interface ChatMessage {
  role:    "user" | "assistant" | "system";
  content: string;
}

interface ChatRequestBody {
  user_id:       string;
  endpoint:      "chat";
  messages:      ChatMessage[];
  intent?:       unknown;
  proposals?:    unknown[];
  session_meta?: { mode?: string; user_intent_class?: string };
}

const SSE_HEADERS: Record<string, string> = {
  ...corsHeaders,
  "Content-Type":  "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection":    "keep-alive",
};

function buildChatSystemPrompt(
  intent: unknown,
  proposals: unknown[] | undefined,
  intentClass: string | undefined,
): string {
  const parts: string[] = [
    "你是「爱吃 Aieats」的营养助手。回答要简洁、友好、贴近家庭场景。",
  ];
  if (intent !== undefined && intent !== null) {
    try {
      parts.push(`【用户当前偏好 IntentTag】\n${JSON.stringify(intent)}`);
    } catch { /* ignore unstringifiable intent */ }
  }
  if (Array.isArray(proposals) && proposals.length > 0) {
    parts.push("【候选菜单 A/B/C】");
    parts.push("硬约束：你只能在 A / B / C 三个候选中挑一个，禁止改任何 dish_id，禁止造新候选。");
    parts.push("请用 2-3 句中文解释差异，再问用户偏向哪一个。");
    try {
      // 截断防止 prompt 爆炸 — 取前 2000 字符候选概要
      parts.push(JSON.stringify(proposals).slice(0, 2000));
    } catch { /* ignore */ }
  }
  if (intentClass && intentClass.startsWith("chat_support_")) {
    parts.push("当前路由：客服咨询。请按短回复模板风格，≤ 3 句话给出明确指引或求助路径。");
  }
  return parts.join("\n\n");
}

async function getDailyCount(userId: string, endpoint: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("api_usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", today)
    .eq("endpoint", endpoint)
    .maybeSingle();
  return (data as { count?: number } | null)?.count ?? 0;
}

async function incrCounter(userId: string, endpoint: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const cur = await getDailyCount(userId, endpoint);
  await supabase.from("api_usage_daily").upsert({
    user_id:    userId,
    day:        today,
    endpoint,
    count:      cur + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,day,endpoint" });
}

async function chatThrottledResponse(text: string, userId: string): Promise<Response> {
  try {
    await incrCounter(userId, "chat_throttled");
  } catch (e) {
    console.warn("chat_throttled incr failed:", e);
  }
  return json({ throttled: true, message: text });
}

async function handleChatEndpoint(body: Partial<ChatRequestBody>): Promise<Response> {
  const { user_id, messages, intent, proposals, session_meta } = body ?? {};

  if (!user_id || typeof user_id !== "string") {
    return json({ error: "user_id required" }, 400);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages (non-empty array) required" }, 400);
  }

  const intentClass = session_meta?.user_intent_class;
  const lastMsg     = messages[messages.length - 1];
  const lastText    = typeof lastMsg?.content === "string" ? lastMsg.content : "";

  // §C 节流 5: 离题（IntentTag 不在客服/菜单 4 类）
  if (intentClass && !VALID_INTENT_CLASSES.has(intentClass)) {
    return await chatThrottledResponse(
      "我只能帮你菜单、食材、采购、菜品质量问题哦",
      user_id,
    );
  }

  // §C 节流 3: user message 长度 > 500 → 截断 + 提示
  if (lastText.length > CHAT_MESSAGE_MAX_LEN) {
    return await chatThrottledResponse(
      "请简短描述（500 字内），我才能帮你。",
      user_id,
    );
  }

  // §C 节流 1: 同日 chat 调用 ≥ 20 次 → 固定话术
  const todayChatCount = await getDailyCount(user_id, "chat");
  if (todayChatCount >= CHAT_DAILY_LIMIT) {
    return await chatThrottledResponse(
      "今天我们已聊了很多，明天继续？",
      user_id,
    );
  }

  // §C 节流 2: chat_support_* 同 user 同 intent_class 同日 ≥ 3 次 → FAQ 模板
  if (intentClass && intentClass.startsWith("chat_support_")) {
    const supportCount = await getDailyCount(user_id, intentClass);
    if (supportCount >= SUPPORT_PER_CLASS_LIMIT) {
      const faq = FAQ_TEMPLATES[intentClass] ?? FAQ_TEMPLATES["chat_support_other"];
      return await chatThrottledResponse(faq, user_id);
    }
  }

  // Quota bump — counts toward CHAT_DAILY_LIMIT + per-class counter for 节流 2.
  await incrCounter(user_id, "chat");
  if (intentClass && intentClass.startsWith("chat_support_")) {
    await incrCounter(user_id, intentClass);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) return json({ error: "Gemini not configured" }, 500);

  // §C 节流 4: maxOutputTokens cap by intent class
  const maxOutputTokens = CHAT_TOKEN_CAP[intentClass ?? ""] ?? CHAT_TOKEN_CAP.default;
  const systemPrompt    = buildChatSystemPrompt(intent, proposals, intentClass);

  // Gemini contents shape: assistant → 'model', user/system → 'user'.
  const contents = messages.map(m => ({
    role:  m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content ?? "") }],
  }));

  // streamGenerateContent with alt=sse returns standard Server-Sent Events.
  const gemUrl = `${GEMINI_BASE}/${DEFAULT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const gemRes = await fetch(gemUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens, temperature: 0.7 },
    }),
  });

  if (!gemRes.ok || !gemRes.body) {
    const errText = await gemRes.text().catch(() => "");
    console.error("Gemini chat stream upstream error:", gemRes.status, errText.slice(0, 200));
    return json({ error: "chat upstream error" }, 502);
  }

  // Pass-through SSE body. Frontend reads data: {...} lines per SSE protocol.
  return new Response(gemRes.body, { headers: SSE_HEADERS });
}

// ── Day 4 cook-step translation — translate endpoint ────────────────────────
// SPEC: TICKET-20260520-026 §A. Helper-locale i18n for HelperCook steps.
// Hard-constrained prompt enforces: action verbs only, ingredient+unit verbatim,
// natural spoken tone, output text only (no quotes/markdown/preamble).

const TRANSLATE_DAILY_LIMIT = 50;

// Source-text length guard. Cooking steps are short; 2000 chars is plenty and
// keeps the per-call cost bounded.
const TRANSLATE_SOURCE_MAX_LEN = 2000;

const TRANSLATE_TARGET_LANGS = new Set(["en", "tl", "id"]);

// Friendly target-language descriptions for the system prompt. 'tl' is the
// ISO 639-1 code for Tagalog; some sources use 'fil' (Filipino) interchangeably.
// We include both names in the prompt so the model picks the right register.
const TARGET_LANG_DESC: Record<string, string> = {
  en: "English (American, conversational tone — what a helper would actually say)",
  tl: "Tagalog (also called Filipino, code 'tl'/'fil'; everyday spoken style, NOT formal Filipino)",
  id: "Bahasa Indonesia (everyday spoken style, NOT formal written Indonesian)",
};

interface TranslateRequestBody {
  user_id:     string;
  endpoint:    "translate";
  source_text: string;
  target_lang: "en" | "tl" | "id";
  domain?:     "cooking" | string;
}

function buildTranslatePrompt(sourceText: string, targetLang: string, domain: string | undefined): string {
  const langDesc = TARGET_LANG_DESC[targetLang] ?? targetLang;
  const domainHint = (domain === undefined || domain === "cooking")
    ? "You are translating cooking instructions for a domestic helper who follows the steps in the kitchen."
    : `Domain: ${domain}. Translate accordingly.`;
  return [
    `${domainHint} Translate the Chinese text below into ${langDesc}.`,
    "",
    "HARD CONSTRAINTS:",
    "1. Translate action verbs (cut / stir-fry / boil / add / steam / pan-fry / season / serve, etc.).",
    "2. KEEP all ingredient names and quantity units; localize the ingredient noun if natural",
    "   (e.g. '500g 鸡肉' → '500g chicken' in en / '500g manok' in tl / '500g daging ayam' in id).",
    "3. Use everyday spoken language a native speaker would say in a home kitchen.",
    "4. Do NOT translate word-by-word; rewrite for natural flow. NO literary / formal register.",
    "5. Output ONLY the translated text. NO quotes, NO markdown, NO preamble, NO explanation.",
    "",
    "Source (zh):",
    sourceText,
  ].join("\n");
}

async function handleTranslateEndpoint(body: Partial<TranslateRequestBody>): Promise<Response> {
  const { user_id, source_text, target_lang, domain } = body ?? {};

  if (!user_id || typeof user_id !== "string") {
    return json({ error: "user_id required" }, 400);
  }
  if (!source_text || typeof source_text !== "string") {
    return json({ error: "source_text (string) required" }, 400);
  }
  if (source_text.length > TRANSLATE_SOURCE_MAX_LEN) {
    return json({ error: `source_text too long (max ${TRANSLATE_SOURCE_MAX_LEN} chars)` }, 400);
  }
  if (!target_lang || typeof target_lang !== "string" || !TRANSLATE_TARGET_LANGS.has(target_lang)) {
    return json({ error: "target_lang must be one of: en, tl, id" }, 400);
  }

  // Quota check (read before incr so 429 doesn't consume a slot)
  const todayCount = await getDailyCount(user_id, "translate");
  if (todayCount >= TRANSLATE_DAILY_LIMIT) {
    return json(
      { error: `今日 translate 额度已用完 (${TRANSLATE_DAILY_LIMIT}/day)，明日再试。`, count: todayCount },
      429,
    );
  }
  await incrCounter(user_id, "translate");

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) return json({ error: "Gemini not configured" }, 500);

  const prompt = buildTranslatePrompt(source_text, target_lang, typeof domain === "string" ? domain : undefined);

  const gemUrl = `${GEMINI_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;
  const gemRes = await fetch(gemUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:      0.3,   // low — translation is closer to deterministic than creative
        maxOutputTokens:  600,   // roughly 2x typical step length cap
      },
    }),
  });

  if (!gemRes.ok) {
    const errText = await gemRes.text().catch(() => "");
    console.error("Gemini translate upstream error:", gemRes.status, errText.slice(0, 200));
    return json({ error: "translate upstream error" }, 502);
  }

  const gemJson = await gemRes.json();
  const rawText: string = gemJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Defensive trim: model occasionally wraps output in quotes despite instruction.
  const translation = rawText
    .trim()
    .replace(/^["「『'`](.*)["」』'`]$/s, "$1")
    .trim();

  return json({
    translation,
    target_lang,
    remaining: TRANSLATE_DAILY_LIMIT - todayCount - 1,
  });
}
