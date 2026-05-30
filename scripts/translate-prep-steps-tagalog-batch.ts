/**
 * translate-prep-steps-tagalog-batch.ts — TICKET-107 §B-2
 *
 * 翻译 dishes.prep_steps_json 中文/英文 → Tagalog. 977 道菜全部缺.
 * 比 cook_steps 更致命: 菲佣去市场买菜/在厨房 prep 全靠这.
 *
 * 翻 3 类字段: action_tl / ingredient_tl / substitutes_tl (list)
 *
 * Modes:
 *   --high-freq      只翻近 30 天 ≥10 次的菜 (~137)
 *   --live           执行 (默认 dry-run)
 *   --limit=N        小批量
 */
import pg from 'pg';
import 'dotenv/config';

const DRY = !process.argv.includes('--live');
const HIGH_FREQ = process.argv.includes('--high-freq');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
const MODEL = 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

if (!GEMINI_KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface PrepStep {
  tray?: string; amount_g?: number;
  action_zh?: string; action_en?: string; action_tl?: string;
  ingredient_zh?: string; ingredient_en?: string; ingredient_tl?: string;
  substitutes_zh?: string[]; substitutes_en?: string[]; substitutes_tl?: string[];
  [k: string]: any;
}

async function translateBatch(steps: PrepStep[], dishTitle: string): Promise<{ action_tl: string; ingredient_tl: string; substitutes_tl: string[] }[] | null> {
  const items = steps.map((s, i) => ({
    idx: i,
    action: s.action_en || s.action_zh || '',
    ingredient: s.ingredient_en || s.ingredient_zh || '',
    substitutes: s.substitutes_en && s.substitutes_en.length > 0 ? s.substitutes_en
                 : s.substitutes_zh && s.substitutes_zh.length > 0 ? s.substitutes_zh
                 : [],
  }));

  const prompt = `You are translating cooking prep steps (ingredient prep before actual cooking) to Tagalog for domestic helpers in Hong Kong markets/kitchens.

Dish: ${dishTitle}

Translate each item's:
- action (prep action like "wash, slice, soak, drain")
- ingredient (Filipino market name — what helper would ASK FOR at the wet market)
- substitutes (alternative ingredient Filipino names)

Use natural Tagalog with English for ingredient names when commonly known in PH (e.g. "garlic" stays "garlic" or "bawang", "soy sauce" stays "soy sauce" or "toyo"). For specific Chinese ingredients with no PH equivalent (e.g. 海参/sea cucumber, 花胶/fish maw), keep English name + brief Tagalog explanation in parens if helpful.

Input (JSON):
${JSON.stringify(items, null, 2)}

Output ONLY a JSON array. Each element { "action_tl": "...", "ingredient_tl": "...", "substitutes_tl": ["..."] }. Same array order. No markdown.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    try {
      const res = await fetch(URL, {
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
  console.log(`[translate-prep-steps-tagalog-batch] mode=${DRY ? 'DRY' : 'LIVE'} highFreq=${HIGH_FREQ} limit=${isFinite(LIMIT) ? LIMIT : '∞'}`);

  // pg.Pool (not Client) — 长跑脚本 Supabase SSL idle 连接会被掐断, Pool 自动
  // 重连 + 'error' handler 防 idle client 错误 crash 进程 (踩过坑 2026-05-29).
  const c = new pg.Pool({ connectionString: process.env.DIRECT_DATABASE_URL!, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
  c.on('error', (err: any) => console.error('[pool idle error]', err?.message ?? err));

  const whereHighFreq = HIGH_FREQ ? `
    AND d.id IN (
      WITH expanded AS (
        SELECT UNNEST(dish_ids) AS dish_id FROM user_weekly_menus
        WHERE created_at > NOW() - INTERVAL '30 days'
      )
      SELECT dish_id FROM expanded GROUP BY dish_id HAVING COUNT(*) >= 10
    )` : '';
  const rowsRes = await c.query(`
    SELECT d.id, d.title_zh, d.title_en, d.prep_steps_json
    FROM dishes d
    WHERE d.prep_steps_json IS NOT NULL
      AND jsonb_typeof(d.prep_steps_json) = 'array'
      AND jsonb_array_length(d.prep_steps_json) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(d.prep_steps_json) step
        WHERE step->>'action_tl' IS NULL OR step->>'action_tl' = ''
      )
      ${whereHighFreq}
    ORDER BY d.id
    LIMIT $1
  `, [isFinite(LIMIT) ? LIMIT : 10000]);

  console.log(`Found ${rowsRes.rows.length} dishes needing prep Tagalog.\n`);

  let done = 0, failed = 0;
  for (const row of rowsRes.rows) {
    const steps: PrepStep[] = row.prep_steps_json;
    const dishTitle = row.title_en || row.title_zh;
    console.log(`[${++done}/${rowsRes.rows.length}] ${dishTitle} (${steps.length} prep items)`);

    if (DRY) continue;

    const translated = await translateBatch(steps, dishTitle);
    if (!translated) { failed++; console.log(`  ❌ failed`); continue; }

    const newSteps = steps.map((s, i) => ({
      ...s,
      action_tl: translated[i].action_tl || s.action_tl || '',
      ingredient_tl: translated[i].ingredient_tl || s.ingredient_tl || '',
      substitutes_tl: translated[i].substitutes_tl?.length ? translated[i].substitutes_tl : s.substitutes_tl || [],
    }));

    try {
      await c.query(`UPDATE dishes SET prep_steps_json = $1::jsonb WHERE id = $2`, [JSON.stringify(newSteps), row.id]);
      console.log(`  ✅ updated`);
    } catch (e: any) {
      failed++;
      console.log(`  ❌ DB update failed (skip, re-run picks up): ${e?.message ?? e}`);
    }
    await sleep(600);
  }

  console.log(`\n=== Summary === done=${done} failed=${failed}`);
  await c.end();
})();
