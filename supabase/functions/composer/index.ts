// Supabase Edge Function — POST /functions/v1/composer
//
// Composer Agent v1 — banquet scenario only.
//
// Receives pre-filtered, pre-bucketed dish candidates and bucket-level targets,
// returns a per-bucket selection of dish_ids + a one-line theme_narrative +
// short tradeoffs. The frontend (src/lib/banquet.ts) does the hard work of
// ① pregnancy / global-pref / extraAvoid hard filters
// ② course_type → bucket classification
// ③ headcount → totalDishes / bucket targets
// so this function is only responsible for the "pick which K from each bucket"
// step (replacing the old scoreDish + weightedSample at step ④).
//
// Why a dedicated endpoint and not gemini-proxy: composer's input shape
// (5 arrays of SupabaseDish summaries) doesn't fit the generic
// `contents: any[]` field of gemini-proxy, and we want a separate quota
// counter for Pro-only banquet usage.
//
// Required env (supabase secrets set):
//   GEMINI_API_KEY
//
// Deploy: supabase functions deploy composer --no-verify-jwt
//
// See .claude/skills/menu-scoring-philosophy/SKILL.md Rule 8 for the v1
// design decisions encoded here (no theme input, no Critic, narrative
// must not infer holidays/birthdays, strict schema validation).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

const DAILY_LIMIT = 10;           // Pro-only feature; banquet usage is bursty
const ENDPOINT    = "composer";
const PROMPT_VERSION = "composer_v1.0";

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

async function bumpCounter(userId: string): Promise<{ ok: boolean; count: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("api_usage_daily")
    .select("count")
    .eq("user_id", userId)
    .eq("day", today)
    .eq("endpoint", ENDPOINT)
    .maybeSingle();
  const currentCount = (existing as { count?: number } | null)?.count ?? 0;
  if (currentCount >= DAILY_LIMIT) return { ok: false, count: currentCount };
  await supabase.from("api_usage_daily").upsert({
    user_id:    userId,
    day:        today,
    endpoint:   ENDPOINT,
    count:      currentCount + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,day,endpoint" });
  return { ok: true, count: currentCount + 1 };
}

// ── Types ────────────────────────────────────────────────────────────────────

type BucketKey = "cold" | "main" | "staple" | "soup" | "dessert";

interface DishSummary {
  id:               string;
  title_zh:         string;
  origin_cuisine?:  string | null;
  western_subtype?: string | null;
  main_ingredient?: string | null;
  flavor_tags?:     string[] | null;
  cook_method?:     string | null;
  cook_time_min?:   number | null;
  kid_acceptance_score?:  number | null;
  helper_friendly_score?: number | null;
  employer_crown_likes?:  number | null;
}

interface ComposerRequest {
  scenario:      "banquet";
  user_id:       string;
  user_context: {
    headcount:    { adults: number; kids: number; elders: number };
    cuisine_style: "chinese" | "western" | "mixed" | "japanese";
    extra_avoid:  string[];
    special_needs: string[];
    global_prefs: {
      avoid_tags:        string[];
      avoid_ingredients: string[];
      vegetarian_only:   boolean;
    };
  };
  buckets:        Record<BucketKey, DishSummary[]>;
  bucket_targets: Record<BucketKey, number>;
  algo_version:   string;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是"爱吃 Aieats"的家宴菜单编排师。你的工作是从已分类好的候选菜池中，为一桌客人挑出最合适的家宴菜单组合。

【你只做一件事】从每个桶（凉菜 cold / 主菜 main / 主食 staple / 汤品 soup / 甜品 dessert）中挑出指定数量的 dish_id。硬过滤、桶分类、菜量计算都已经在前置步骤完成，不用你重做。

【硬约束 — 违反 = 整次结果作废】
1. 每桶 selected_dishes[bucket].length 必须严格等于 bucket_targets[bucket]
2. 每个 id 必须来自对应 buckets[bucket]，禁止造 id、禁止跨桶
3. theme_narrative 是一句简短中文（≤40字），描述这桌客人是谁、菜单调性如何
4. theme_narrative 禁止推测节日 / 节气 / 生日 / 寿宴 / 商务局——只能从已显式提供的信号（头数构成 / cuisine_style / special_needs）反推
5. tradeoffs 是 0-3 条中文短句，每条说明一个挑选/取舍判断（例："主菜里避开海鲜花生，改用 2 道家禽 + 2 道猪牛"）

【挑选时综合考虑】
- 头数构成：kids 多 → 偏温和不辣易咀嚼；elders 多 → 偏软糯滋补少油炸；adults 主导且无小孩长辈 → 偏分享性强 / 人气菜
- cuisine_style：风格内部一致，避免奇怪混搭（除非 cuisine_style='mixed'）
- 当 cuisine_style='western' 时，看候选菜的 western_subtype (french/italian/spanish/american/american_fine/british/german/other_western)，**整桌优先选同一个 subtype**（例如同桌都 italian 风格，或都 american 风格），避免一桌 4 道主菜 french/italian/british/american 各自一道这种混乱编排
- special_needs：'growth' → 主菜偏高蛋白高钙食材；'pregnancy' → 偏叶酸/铁/钙食材
- 同桌多样性：避免 main 桶里 4 道菜主料全是猪肉 / 烹法全是炒
- 平衡：辣度、油重度、烹饪方式都要分布合理
- kid_acceptance_score / helper_friendly_score / employer_crown_likes 这些字段是参考信号，分数高的优先但不是绝对

【narrative 写法示例】
✓ kids=3, special_needs=['growth'] → "为成长期孩子设计的家常宴"
✓ kids=0, elders=2, special_needs=[] → "陪长辈的清润家宴"
✓ adults=8, kids=0, elders=0 → "8 位成年人的分享聚餐"
✗ "中秋家宴"（不允许，没收到中秋信号）
✗ "生日寿宴"（不允许，没收到寿宴信号）`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    composer_version: { type: "string" },
    theme_narrative:  { type: "string" },
    selected_dishes: {
      type: "object",
      properties: {
        cold:    { type: "array", items: { type: "string" } },
        main:    { type: "array", items: { type: "string" } },
        staple:  { type: "array", items: { type: "string" } },
        soup:    { type: "array", items: { type: "string" } },
        dessert: { type: "array", items: { type: "string" } },
      },
      required: ["cold", "main", "staple", "soup", "dessert"],
    },
    tradeoffs: { type: "array", items: { type: "string" } },
  },
  required: ["composer_version", "theme_narrative", "selected_dishes"],
};

function buildUserPrompt(req: ComposerRequest): string {
  const { user_context: ctx, buckets, bucket_targets } = req;
  // Compact bucket summary — minimize tokens. Keep only fields the LLM
  // needs to reason about; the frontend already has full SupabaseDish
  // objects, so we don't need to round-trip them.
  const summarizeBucket = (rows: DishSummary[]): string =>
    rows.map(r =>
      `${r.id} | ${r.title_zh}` +
      ` | 菜系=${r.origin_cuisine ?? "-"}` +
      (r.western_subtype ? ` | 西餐子类=${r.western_subtype}` : "") +
      ` | 主料=${r.main_ingredient ?? "-"}` +
      ` | 风味=${(r.flavor_tags ?? []).join(",") || "-"}` +
      ` | 烹法=${r.cook_method ?? "-"}` +
      ` | 时长=${r.cook_time_min ?? "-"}min` +
      ` | kid=${r.kid_acceptance_score ?? "-"}` +
      ` | helper=${r.helper_friendly_score ?? "-"}` +
      ` | 人气=${r.employer_crown_likes ?? 0}`
    ).join("\n");

  return `【餐桌情况】
- 大人 ${ctx.headcount.adults} · 小朋友 ${ctx.headcount.kids} · 长辈 ${ctx.headcount.elders}
- 菜系风格: ${ctx.cuisine_style}
- 本次忌口: ${ctx.extra_avoid.length ? ctx.extra_avoid.join(", ") : "（无）"}
- 特殊需求: ${ctx.special_needs.length ? ctx.special_needs.join(", ") : "（无）"}

【每桶要挑几道】
cold ${bucket_targets.cold} · main ${bucket_targets.main} · staple ${bucket_targets.staple} · soup ${bucket_targets.soup} · dessert ${bucket_targets.dessert}

【候选池 · 凉菜】
${summarizeBucket(buckets.cold) || "（空）"}

【候选池 · 主菜】
${summarizeBucket(buckets.main) || "（空）"}

【候选池 · 主食】
${summarizeBucket(buckets.staple) || "（空）"}

【候选池 · 汤品】
${summarizeBucket(buckets.soup) || "（空）"}

【候选池 · 甜品】
${summarizeBucket(buckets.dessert) || "（空）"}

输出严格 JSON，包含 composer_version="${PROMPT_VERSION}"、theme_narrative、selected_dishes、tradeoffs。`;
}

// ── Validation ───────────────────────────────────────────────────────────────

function validatePicks(
  picks: Record<string, unknown> | undefined,
  buckets: Record<BucketKey, DishSummary[]>,
  targets: Record<BucketKey, number>,
): { ok: true } | { ok: false; reason: string } {
  if (!picks || typeof picks !== "object") return { ok: false, reason: "selected_dishes missing" };
  const keys: BucketKey[] = ["cold", "main", "staple", "soup", "dessert"];
  for (const k of keys) {
    const arr = (picks as Record<string, unknown>)[k];
    if (!Array.isArray(arr)) return { ok: false, reason: `selected_dishes.${k} is not an array` };
    if (arr.length !== targets[k]) {
      return { ok: false, reason: `selected_dishes.${k} length=${arr.length}, expected ${targets[k]}` };
    }
    const poolIds = new Set(buckets[k].map(d => d.id));
    for (const id of arr) {
      if (typeof id !== "string") return { ok: false, reason: `selected_dishes.${k} contains non-string id` };
      if (!poolIds.has(id)) return { ok: false, reason: `selected_dishes.${k} contains id "${id}" not in bucket pool` };
    }
    // Dedup within a bucket
    if (new Set(arr).size !== arr.length) {
      return { ok: false, reason: `selected_dishes.${k} contains duplicate ids` };
    }
  }
  return { ok: true };
}

// ── Entry ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as ComposerRequest;
    if (!body?.user_id || typeof body.user_id !== "string") return json({ error: "user_id required" }, 400);
    if (body.scenario !== "banquet") return json({ error: "v1 only supports scenario='banquet'" }, 400);
    if (!body.buckets || !body.bucket_targets) return json({ error: "buckets/bucket_targets required" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!apiKey) return json({ error: "Gemini not configured" }, 500);

    // Rate limit (per user, per day)
    const rate = await bumpCounter(body.user_id);
    if (!rate.ok) {
      return json(
        { error: `今日家宴 AI 额度已用完 (${DAILY_LIMIT}/day)，明日再试。`, count: rate.count },
        429,
      );
    }

    const userPrompt = buildUserPrompt(body);
    const gemRes = await fetch(GEMINI_URL(apiKey), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema:   RESPONSE_SCHEMA,
          temperature:      0.8,
          maxOutputTokens:  4096,
          // Gemini 2.5 flash defaults to thinking ON; thinking tokens count
          // against maxOutputTokens. For structured selection we don't need
          // chain-of-thought — disable it so the budget goes entirely to
          // the JSON output. Without this, ~2048 was 153 chars output ≈
          // 1900 thinking tokens before truncation.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    const gemJson = await gemRes.json();
    if (!gemRes.ok) {
      console.error("Composer Gemini error:", gemJson);
      return json({ error: gemJson?.error?.message ?? "Gemini error" }, 502);
    }

    const raw: string = gemJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const finish = gemJson.candidates?.[0]?.finishReason;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    } catch (parseErr) {
      // Log enough for ops triage (finishReason + raw head) without leaking
      // potentially large payloads to the client.
      console.error("Composer JSON parse failed. finishReason:", finish,
                    "raw length:", raw.length,
                    "raw head:", raw.slice(0, 300));
      return json({ error: `Composer returned invalid JSON (finishReason=${finish})` }, 502);
    }

    const validation = validatePicks(
      parsed.selected_dishes as Record<string, unknown> | undefined,
      body.buckets,
      body.bucket_targets,
    );
    if (!validation.ok) {
      console.warn("Composer schema validation failed:", validation.reason);
      return json({ error: `Composer schema validation failed: ${validation.reason}` }, 502);
    }

    return json({
      composer_version: PROMPT_VERSION,
      theme_narrative:  String(parsed.theme_narrative ?? ""),
      selected_dishes:  parsed.selected_dishes,
      tradeoffs:        Array.isArray(parsed.tradeoffs) ? parsed.tradeoffs : [],
      remaining:        DAILY_LIMIT - rate.count,
    });
  } catch (e) {
    console.error("composer endpoint failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
