/**
 * translate-cook-steps-tagalog-batch.ts — TICKET-107 §B
 *
 * 老板 5/29 拍板: 菲佣端核心痛点是 96% 菜缺 Tagalog 步骤. 必须补全.
 *
 * 策略 (vs 之前 translate-cook-steps.ts):
 *   - 直接调 Gemini API 跳过 gemini-proxy (quota 50/user/day 撞墙)
 *   - Batch: 1 LLM call 翻 1 道菜所有 step (action + state_target 一次翻)
 *     省 ~12 倍 call 数, 137 道 → 137 call ~5min, 942 道 → 942 call ~30min
 *   - 优先翻"近 30 天 user_weekly_menus 高频菜 ≥10 次", 用户当下立刻看到效果
 *
 * Modes:
 *   npx tsx scripts/translate-cook-steps-tagalog-batch.ts --dry-run                    # 看 count, 不调 LLM
 *   npx tsx scripts/translate-cook-steps-tagalog-batch.ts --high-freq --live           # 137 道高频
 *   npx tsx scripts/translate-cook-steps-tagalog-batch.ts --live                       # 全部 942 道
 *   npx tsx scripts/translate-cook-steps-tagalog-batch.ts --limit=10 --live            # 小批量验证
 */
import pg from 'pg';
import 'dotenv/config';

const DRY = !process.argv.includes('--live');
const HIGH_FREQ = process.argv.includes('--high-freq');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

if (!GEMINI_KEY) { console.error('❌ GEMINI_API_KEY missing'); process.exit(1); }

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface Step {
  step?: number; duration_min?: number;
  action_zh?: string; action_en?: string; action_tl?: string; action_id?: string;
  state_target_zh?: string; state_target_en?: string; state_target_tl?: string; state_target_id?: string;
  [k: string]: any;
}

async function translateBatch(steps: Step[], dishTitle: string): Promise<{ action_tl: string; state_target_tl: string }[] | null> {
  // 提取每 step 的 action_en (or zh) + state_target_en (or zh) 作为源
  const items = steps.map((s, i) => ({
    idx: i,
    action: s.action_en || s.action_zh || '',
    target: s.state_target_en || s.state_target_zh || '',
  }));

  const prompt = `You are translating cooking steps to Tagalog (Filipino) for domestic helpers in Hong Kong.

Dish: ${dishTitle}
Translate each step's action and target state to natural Tagalog (mix English for cooking terms is OK, like in real Filipino kitchen talk).

Standardize these terms:
- 中火/medium fire → "katamtamang apoy (medium heat)"
- 大火/high fire → "malakas na apoy (high heat)"
- 小火/low fire → "mahinang apoy (low heat)"
- 生抽/light soy sauce → "light soy sauce"
- 老抽/dark soy sauce → "dark soy sauce"
- 焯/blanch → "iblansya" or "salahin sa kumukulong tubig"

Input (JSON):
${JSON.stringify(items, null, 2)}

Output ONLY valid JSON array. Each element { "action_tl": "...", "state_target_tl": "..." }. Keep same array order. No markdown, no commentary.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.error(`    HTTP ${res.status} attempt ${attempt + 1}: ${t.slice(0, 150)}`);
        continue;
      }
      const j = await res.json();
      const text: string = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // strip ``` fences if any
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed) || parsed.length !== steps.length) {
        console.error(`    parse error: expected ${steps.length}, got ${parsed?.length}`);
        continue;
      }
      return parsed;
    } catch (e: any) {
      console.error(`    attempt ${attempt + 1} err:`, e?.message ?? e);
    }
  }
  return null;
}

(async () => {
  console.log(`[translate-cook-steps-tagalog-batch] mode=${DRY ? 'DRY' : 'LIVE'} highFreq=${HIGH_FREQ} limit=${isFinite(LIMIT) ? LIMIT : '∞'}`);

  // pg.Pool (not Client) — 长跑脚本 Supabase SSL idle 连接会被掐断, Pool 自动
  // 重连 + 'error' handler 防 idle client 错误 crash 进程 (踩过坑 2026-05-29).
  const c = new pg.Pool({ connectionString: process.env.DIRECT_DATABASE_URL!, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
  c.on('error', (err: any) => console.error('[pool idle error]', err?.message ?? err));

  // pull dishes needing Tagalog (有 cook_steps_json + 缺至少 1 个 action_tl)
  const whereHighFreq = HIGH_FREQ ? `
    AND d.id IN (
      WITH expanded AS (
        SELECT UNNEST(dish_ids) AS dish_id FROM user_weekly_menus
        WHERE created_at > NOW() - INTERVAL '30 days'
      )
      SELECT dish_id FROM expanded GROUP BY dish_id HAVING COUNT(*) >= 10
    )` : '';
  const rowsRes = await c.query(`
    SELECT d.id, d.title_zh, d.title_en, d.cook_steps_json
    FROM dishes d
    WHERE d.cook_steps_json IS NOT NULL
      AND jsonb_typeof(d.cook_steps_json) = 'array'
      AND jsonb_array_length(d.cook_steps_json) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(d.cook_steps_json) step
        WHERE step->>'action_tl' IS NULL OR step->>'action_tl' = ''
      )
      ${whereHighFreq}
    ORDER BY d.id
    LIMIT $1
  `, [isFinite(LIMIT) ? LIMIT : 10000]);

  console.log(`Found ${rowsRes.rows.length} dishes needing Tagalog.\n`);

  let done = 0, failed = 0;
  for (const row of rowsRes.rows) {
    const steps: Step[] = row.cook_steps_json;
    const dishTitle = row.title_en || row.title_zh;
    console.log(`[${++done}/${rowsRes.rows.length}] ${dishTitle} (${steps.length} steps)`);

    if (DRY) continue;

    const translated = await translateBatch(steps, dishTitle);
    if (!translated) { failed++; console.log(`  ❌ failed`); continue; }

    // merge translations into existing steps
    const newSteps = steps.map((s, i) => ({
      ...s,
      action_tl: translated[i].action_tl || s.action_tl || '',
      state_target_tl: translated[i].state_target_tl || s.state_target_tl || '',
    }));

    try {
      await c.query(
        `UPDATE dishes SET cook_steps_json = $1::jsonb WHERE id = $2`,
        [JSON.stringify(newSteps), row.id]
      );
      console.log(`  ✅ updated`);
    } catch (e: any) {
      failed++;
      console.log(`  ❌ DB update failed (skip, re-run picks up): ${e?.message ?? e}`);
    }

    await sleep(600); // ~1.7 req/sec, safe under 60/min Gemini Flash limit
  }

  console.log(`\n=== Summary === done=${done} failed=${failed}`);
  await c.end();
})();
