/**
 * backfill-dish-atomic-nutrition.ts — TICKET-20260521-007
 *
 * Fill 7 atomic nutrients per serving (~300g):
 *   protein_g / fat_g / carb_g / calcium_mg / iron_mg / fiber_g / vitamin_c_mg
 *
 * Uses Gemini 2.5 Flash directly (脚本复用豁免 — frontend bundle key constraint
 * does not apply to server-side batch scripts; 同 gen-dish-ingredients.ts 模式).
 *
 * UPDATE strategy: COALESCE(existing, new) — preserves the 334 dishes that
 * already have protein/fat/carb from backfill-dish-nutrition.ts.
 *
 * JSON parse fail OR out-of-range → skip that dish (do not write NULL or 0).
 *
 * Usage:
 *   npx tsx scripts/backfill-dish-atomic-nutrition.ts --limit=5      # small batch first
 *   npx tsx scripts/backfill-dish-atomic-nutrition.ts --limit=50     # verify scaling
 *   npx tsx scripts/backfill-dish-atomic-nutrition.ts                # full run
 */
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { config } from 'dotenv';
config();

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const GEMINI_KEY   = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
if (!GEMINI_KEY) { console.error('❌ GEMINI_API_KEY missing'); process.exit(1); }
const DB_URL = process.env.DIRECT_DATABASE_URL ?? 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const BATCH = 8;
const PAUSE = 1500;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const DRY_RUN = process.argv.includes('--dry-run');

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

interface DishRow {
  id: string;
  title_zh: string;
  main_ingredient: string | null;
  course_type: string | null;
}

interface NutritionResult {
  dish_id: string;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  calcium_mg: number;
  iron_mg: number;
  fiber_g: number;
  vitamin_c_mg: number;
}

const RANGES = {
  protein_g:    [3,   80],
  fat_g:        [0.5, 60],
  carb_g:       [2,   100],
  calcium_mg:   [10,  1200],
  iron_mg:      [0.1, 25],
  fiber_g:      [0.1, 25],
  vitamin_c_mg: [0,   200],
} as const;

function inRange(v: number, [lo, hi]: readonly [number, number]): boolean {
  return Number.isFinite(v) && v >= lo && v <= hi;
}

function validate(r: NutritionResult): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const k of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const v = (r as any)[k];
    if (typeof v !== 'number') { issues.push(`${k} not number`); continue; }
    if (!inRange(v, RANGES[k])) issues.push(`${k}=${v} out of [${RANGES[k][0]},${RANGES[k][1]}]`);
  }
  return { ok: issues.length === 0, issues };
}

async function generateBatch(dishes: DishRow[]): Promise<NutritionResult[]> {
  const prompt = `你是中文菜营养师。估算每道菜一份（约 300g 成品）的 7 个原子营养素，返回纯 JSON 数组。

合理范围参考（per 300g serving）：
- protein_g: 5-60 (素菜可低至 3，重肉菜可至 70)
- fat_g: 1-50 (油炸/红烧高，凉拌/清汤低)
- carb_g: 5-80 (主食类 50-80，蔬菜汤 5-15)
- calcium_mg: 30-800 (豆制品/绿叶菜高，纯肉菜低)
- iron_mg: 0.5-15 (动物肝脏/红肉/菠菜高)
- fiber_g: 0.5-15 (蔬菜/全谷/豆类高)
- vitamin_c_mg: 0-100 (柑橘/彩椒/西兰花高，纯肉/主食 0-3)

输入（JSON）：
${JSON.stringify(dishes.map(d => ({
  dish_id: d.id,
  name: d.title_zh,
  main: d.main_ingredient,
  course: d.course_type,
})), null, 2)}

输出（JSON 数组，与输入同顺序）：
[
  {
    "dish_id": "uuid",
    "protein_g": 25.5,
    "fat_g": 12.0,
    "carb_g": 35.0,
    "calcium_mg": 80,
    "iron_mg": 2.5,
    "fiber_g": 3.0,
    "vitamin_c_mg": 15
  }
]

只返回 JSON，不要其他文字。所有数值为 number 类型（不带单位）。`;

  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    );
    if (res.ok) break;
    if ([429, 503].includes(res.status) && attempt < 3) {
      const wait = attempt * 5000;
      console.log(`\n  ⏳ Gemini ${res.status}, retry ${attempt}/3 in ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    }
  }
  if (!res!.ok) throw new Error(`Gemini failed after 3 retries`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as NutritionResult[];
}

function fuzzyMatchId(geminiId: string, batch: DishRow[]): string | null {
  if (batch.some(d => d.id === geminiId)) return geminiId;
  const a = geminiId.replace(/-/g, '');
  for (const d of batch) {
    const b = d.id.replace(/-/g, '');
    if (Math.abs(a.length - b.length) > 2) continue;
    let diff = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) diff++;
      if (diff > 2) break;
    }
    if (diff <= 2) return d.id;
  }
  return null;
}

async function writeResults(pg: Client, results: NutritionResult[], batch: DishRow[]): Promise<{written: number, skipped: number}> {
  let written = 0, skipped = 0;
  for (const r of results) {
    const { ok, issues } = validate(r);
    if (!ok) {
      console.log(`\n  ⚠️  ${r.dish_id}: ${issues.join(', ')} — skip`);
      skipped++; continue;
    }
    const resolvedId = fuzzyMatchId(r.dish_id, batch);
    if (!resolvedId) {
      console.log(`\n  ⚠️  ${r.dish_id}: id not in batch — skip`);
      skipped++; continue;
    }
    // COALESCE: preserve existing non-NULL values (the 334 rows already filled)
    await pg.query(
      `UPDATE dishes SET
         protein_g    = COALESCE(protein_g, $1),
         fat_g        = COALESCE(fat_g, $2),
         carb_g       = COALESCE(carb_g, $3),
         calcium_mg   = COALESCE(calcium_mg, $4),
         iron_mg      = COALESCE(iron_mg, $5),
         fiber_g      = COALESCE(fiber_g, $6),
         vitamin_c_mg = COALESCE(vitamin_c_mg, $7)
       WHERE id = $8`,
      [r.protein_g, r.fat_g, r.carb_g, r.calcium_mg, r.iron_mg, r.fiber_g, r.vitamin_c_mg, resolvedId]
    );
    written++;
  }
  return { written, skipped };
}

async function main() {
  console.log(`\n🥗 Atomic Nutrition Backfill — LIMIT=${LIMIT === Infinity ? 'all' : LIMIT}  DRY=${DRY_RUN}`);

  // need_any: at least 1 of 7 cols NULL
  const { data: allDishes, error } = await sb
    .from('dishes')
    .select('id, title_zh, main_ingredient, course_type, protein_g, fat_g, carb_g, calcium_mg, iron_mg, fiber_g, vitamin_c_mg')
    .not('title_zh', 'is', null);
  if (error || !allDishes) { console.error(error); process.exit(1); }

  const pending = allDishes.filter(d =>
    d.protein_g === null || d.fat_g === null || d.carb_g === null ||
    d.calcium_mg === null || d.iron_mg === null || d.fiber_g === null || d.vitamin_c_mg === null
  );
  const dishes = isFinite(LIMIT) ? pending.slice(0, LIMIT) : pending;
  console.log(`📊 Pending: ${pending.length} | Processing: ${dishes.length}\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — generating 3 dishes...\n');
    const sample = dishes.slice(0, 3) as DishRow[];
    const results = await generateBatch(sample);
    results.forEach(r => {
      const d = sample.find(x => x.id === r.dish_id);
      console.log(`【${d?.title_zh}】`);
      console.log(`  P=${r.protein_g}g  F=${r.fat_g}g  C=${r.carb_g}g  Ca=${r.calcium_mg}mg  Fe=${r.iron_mg}mg  Fb=${r.fiber_g}g  VitC=${r.vitamin_c_mg}mg`);
      const v = validate(r);
      if (!v.ok) console.log(`    ⚠️  ${v.issues.join(', ')}`);
    });
    return;
  }

  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  let written = 0, skipped = 0, errors = 0;
  let geminiCalls = 0;
  const total = dishes.length;
  const totalBatches = Math.ceil(total / BATCH);

  for (let i = 0; i < total; i += BATCH) {
    const batch = dishes.slice(i, i + BATCH) as DishRow[];
    const bn = Math.floor(i / BATCH) + 1;
    process.stdout.write(`\rBatch ${bn}/${totalBatches} (${i + 1}–${Math.min(i + BATCH, total)}/${total}) | OK=${written} skip=${skipped} err=${errors}`);

    try {
      const results = await generateBatch(batch);
      geminiCalls++;
      const r = await writeResults(pg, results, batch);
      written += r.written; skipped += r.skipped;
    } catch (e: any) {
      errors += batch.length;
      console.error(`\n  ❌ Batch ${bn}: ${e.message?.slice(0, 200)}`);
    }
    if (i + BATCH < total) await new Promise(r => setTimeout(r, PAUSE));
  }

  await pg.end();

  console.log(`\n\n✅ Done!\n   Written: ${written}\n   Skipped: ${skipped}\n   Errors:  ${errors}\n   Gemini calls: ${geminiCalls}`);
}

main().catch(e => { console.error(e); process.exit(1); });
