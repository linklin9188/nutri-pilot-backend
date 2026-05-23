/**
 * fill-dish-3-micronutrients.ts — TICKET-20260522-021 §A
 *
 * Backfill dishes.zinc_mg / vitamin_d_iu / omega3_mg via Gemini Flash, routed
 * through supabase/functions/gemini-proxy (endpoint='micronutrient').
 *
 * Approach: 1 dish per Gemini call (short prompt, short JSON output, easy to
 * validate per row). Each call returns three numeric estimates per serving.
 * Out-of-range values (negative, absurdly high) are dropped to NULL.
 *
 * Update semantics: ONLY writes columns that were previously NULL — never
 * overwrites existing data. Re-runs are safe (idempotent on NULL-only fill).
 *
 * Usage:
 *   npx tsx scripts/fill-dish-3-micronutrients.ts --dry-run --limit=5
 *   npx tsx scripts/fill-dish-3-micronutrients.ts --limit=5
 *   npx tsx scripts/fill-dish-3-micronutrients.ts                # full run (~924)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const PROXY_URL    = `${SUPABASE_URL}/functions/v1/gemini-proxy`;
const BOT_USER_ID  = 'backfill-bot-021';

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const DRY_RUN   = process.argv.includes('--dry-run');
const RESUME    = process.argv.includes('--resume');  // skip dishes that already have any of the 3 cols
const ONLY_VITD = process.argv.includes('--only-vitd'); // TICKET-023 §A — filter vitamin_d_iu IS NULL only (compute zinc/omega3 too but only write missing vitD-side)
const PAUSE     = 600;

// Plausibility ranges per serving (HKD home-cooking portion, ~250-400g):
//   zinc       0..40 mg     (liver / oysters cap)
//   vitamin_d  0..1000 IU   (rich-fish 1 serving cap)
//   omega3     0..5000 mg   (oily-fish 1 serving cap)
const RANGE = {
  zinc_mg:      { min: 0, max:   40 },
  vitamin_d_iu: { min: 0, max: 1000 },
  omega3_mg:    { min: 0, max: 5000 },
} as const;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Ingredient { name_zh: string; is_main: boolean; }
interface DishRow {
  id: string;
  title_zh: string;
  main_ingredient: string | null;
  cook_method: string | null;
  course_type: string | null;
  zinc_mg: number | null;
  vitamin_d_iu: number | null;
  omega3_mg: number | null;
  ingredients: Ingredient[];
}

function buildPrompt(d: DishRow): string {
  const ingredientList = d.ingredients
    .map(i => `${i.is_main ? '★' : '·'}${i.name_zh}`)
    .join(', ');
  return `你是营养师。根据菜的食材+做法，估算 1 份家常餐量(~250-400g)中以下 3 种 micronutrient 的含量。**只返回 JSON，不要解释**。

参考量级：
- zinc_mg (锌, mg): 红肉/海产品/坚果高 (3-8 mg/份)，蔬菜/水果低 (0.2-1 mg)，牡蛎/动物肝脏极高 (10-30 mg)
- vitamin_d_iu (维 D, IU): 大部分菜 0；油性鱼类 (三文鱼/沙丁/鳗鱼) 200-800 IU/份；蛋黄 30-50 IU；强化奶 100-200 IU
- omega3_mg (Omega-3, mg): 大部分菜 0-50 mg；油性鱼 1000-3000 mg/份；坚果/亚麻籽 200-800 mg；鸡蛋 20-100 mg

输入菜：
- 名称: ${d.title_zh}
- 主料: ${d.main_ingredient ?? '-'}
- 做法: ${d.cook_method ?? '-'}
- 类型: ${d.course_type ?? '-'}
- 食材: ${ingredientList || '(无)'}

只返回 JSON：{"zinc_mg": 数字, "vitamin_d_iu": 数字, "omega3_mg": 数字}。
- 不确定的字段用 0（不是 null）— 后续会过滤
- 物理不含该营养素时用 0（如纯素菜的 omega3 / vitamin_d 通常为 0）`;
}

async function callProxy(d: DishRow): Promise<Partial<Record<keyof typeof RANGE, number>>> {
  const body = {
    user_id: BOT_USER_ID,
    endpoint: 'micronutrient',
    contents: [{ role: 'user', parts: [{ text: buildPrompt(d) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    if ([429, 502, 503].includes(res.status) && attempt < 3) {
      const wait = attempt * 5000;
      console.log(`\n  ⏳ proxy ${res.status} (attempt ${attempt}/3) — sleep ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    const errText = await res.text();
    throw new Error(`proxy ${res.status}: ${errText.slice(0, 200)}`);
  }
  if (!res!.ok) throw new Error(`proxy failed after 3 retries`);

  const wrap = await res!.json();
  const gemText = wrap?.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const cleaned = String(gemText).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const out: Partial<Record<keyof typeof RANGE, number>> = {};
  for (const k of Object.keys(RANGE) as (keyof typeof RANGE)[]) {
    const v = Number(parsed?.[k]);
    if (Number.isFinite(v) && v >= RANGE[k].min && v <= RANGE[k].max) {
      out[k] = +v.toFixed(2);
    }
  }
  return out;
}

async function main() {
  console.log(`\n💊 Micronutrient Backfill — LIMIT=${LIMIT === Infinity ? 'all' : LIMIT}  DRY=${DRY_RUN}  RESUME=${RESUME}\n`);

  const { data: rawDishes, error: e1 } = await sb
    .from('dishes')
    .select('id, title_zh, main_ingredient, cook_method, course_type, zinc_mg, vitamin_d_iu, omega3_mg')
    .order('title_zh');
  if (e1) { console.error('SELECT failed:', e1.message); process.exit(1); }

  // Pull ingredients for the dishes (separate query — dish_ingredients table)
  const dishIds = (rawDishes ?? []).map(r => r.id);
  const { data: ings } = await sb
    .from('dish_ingredients')
    .select('dish_id, name_zh, is_main')
    .in('dish_id', dishIds);
  const ingByDish = new Map<string, Ingredient[]>();
  for (const r of ings ?? []) {
    const k = (r as any).dish_id;
    if (!ingByDish.has(k)) ingByDish.set(k, []);
    ingByDish.get(k)!.push({ name_zh: (r as any).name_zh, is_main: !!(r as any).is_main });
  }

  let dishes: DishRow[] = (rawDishes ?? []).map(r => ({
    ...(r as any),
    ingredients: ingByDish.get((r as any).id) ?? [],
  }));

  let candidates = dishes;
  if (ONLY_VITD) {
    candidates = dishes.filter(d => d.vitamin_d_iu == null);
    console.log(`(--only-vitd mode — filter vitamin_d_iu IS NULL, ${candidates.length}/${dishes.length})`);
  } else if (RESUME) {
    candidates = dishes.filter(d => d.zinc_mg == null && d.vitamin_d_iu == null && d.omega3_mg == null);
    console.log(`(resume mode — skip dishes with any of the 3 already filled, ${candidates.length}/${dishes.length})`);
  }
  if (LIMIT !== Infinity) candidates = candidates.slice(0, LIMIT);

  console.log(`📊 Total: ${dishes.length} | Processing: ${candidates.length}\n`);

  let ok = 0, skip = 0, err = 0, fieldsAdded = 0;

  for (let i = 0; i < candidates.length; i++) {
    const d = candidates[i];
    try {
      const vals = await callProxy(d);
      // Compute which fields will be NEW (don't overwrite existing)
      const patch: Record<string, number> = {};
      for (const k of Object.keys(RANGE) as (keyof typeof RANGE)[]) {
        if (vals[k] !== undefined && d[k] == null) patch[k] = vals[k]!;
      }
      if (Object.keys(patch).length === 0) {
        skip++;
        process.stdout.write(`[${i+1}/${candidates.length}] ${d.title_zh.padEnd(20)} OK=${ok} skip=${skip} err=${err} added=${fieldsAdded}`);
      } else if (!DRY_RUN) {
        const { error: upErr } = await sb.from('dishes').update(patch).eq('id', d.id);
        if (upErr) {
          err++;
          process.stdout.write(`[${i+1}/${candidates.length}] ${d.title_zh.padEnd(20)} FAIL: ${upErr.message.slice(0, 60)}\n`);
        } else {
          ok++;
          fieldsAdded += Object.keys(patch).length;
          process.stdout.write(`[${i+1}/${candidates.length}] ${d.title_zh.padEnd(20)} OK=${ok} skip=${skip} err=${err} added=${fieldsAdded}`);
        }
      } else {
        ok++;
        fieldsAdded += Object.keys(patch).length;
        process.stdout.write(`[${i+1}/${candidates.length}] ${d.title_zh.padEnd(20)} [DRY] ${JSON.stringify(patch)}\n`);
      }
    } catch (e: any) {
      err++;
      process.stdout.write(`\n[${i+1}/${candidates.length}] ${d.title_zh.padEnd(20)} ERR: ${e.message.slice(0, 80)}\n`);
    }
    await new Promise(r => setTimeout(r, PAUSE));
  }

  console.log(`\n\n✅ Done!`);
  console.log(`   Updated: ${ok}  Skipped: ${skip}  Errors: ${err}`);
  console.log(`   Fields added (total): ${fieldsAdded}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
