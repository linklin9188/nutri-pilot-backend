/**
 * gen-dish-ingredients.ts
 *
 * Batch-generates dish_ingredients rows for all dishes that don't have them yet.
 * Uses Gemini 2.5 Flash to produce exact ingredient lists (per-person weights).
 *
 * Usage:
 *   npx tsx scripts/gen-dish-ingredients.ts            # process all pending
 *   npx tsx scripts/gen-dish-ingredients.ts --dry-run  # preview first 3 dishes
 *   npx tsx scripts/gen-dish-ingredients.ts --force    # re-generate all
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const GEMINI_KEY   = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
if (!GEMINI_KEY) { console.error('❌ 请先设置 VITE_GEMINI_API_KEY 环境变量'); process.exit(1); }
const DB_URL       = process.env.DIRECT_DATABASE_URL ?? 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');
const BATCH   = 15;   // dishes per Gemini call
const PAUSE   = 2000; // ms between batches

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Types ──────────────────────────────────────────────────────────────────────

interface DishRow {
  id: string;
  title_zh: string;
  description_zh: string;
  main_ingredient: string;
  course_type: string;
  origin_cuisine: string;
}

interface IngredientItem {
  name_zh: string;
  name_en: string;
  category: 'protein' | 'vegetable' | 'condiment' | 'staple' | 'other';
  g_per_person: number;
  is_main: boolean;
  optional: boolean;
}

interface GeminiResult {
  dish_id: string;
  ingredients: IngredientItem[];
}

// ── Gemini call ────────────────────────────────────────────────────────────────

async function generateBatch(dishes: DishRow[]): Promise<GeminiResult[]> {
  const prompt = `你是专业厨师和营养师。我会给你一批中文菜肴信息，为每道菜列出做这道菜需要的所有食材，包含每人份用量（克）。

要求：
- 每道菜列出3-8种食材（主料1-2种 + 辅料 + 调味料）
- g_per_person：每位成人的用量（克），调味料写实际用量（如盐3g、酱油15g）
- category必须是: "protein"(肉/海鲜/蛋/豆腐) | "vegetable"(蔬菜) | "condiment"(调味料/酱料) | "staple"(米/面/淀粉) | "other"(干货/菌菇/其他)
- is_main: 是否主料（每道菜只有1-2个true）
- optional: 是否可省略（装饰性食材填true）
- 只写做这道菜必需的食材，不要写"水"、"锅"等

输入（JSON数组）：
${JSON.stringify(dishes.map(d => ({
  dish_id: d.id,
  name: d.title_zh,
  desc: d.description_zh,
  main_ingredient: d.main_ingredient,
  course_type: d.course_type,
  cuisine: d.origin_cuisine,
})), null, 2)}

返回纯JSON数组，格式：
[
  {
    "dish_id": "uuid",
    "ingredients": [
      { "name_zh": "猪五花肉", "name_en": "Pork Belly", "category": "protein", "g_per_person": 150, "is_main": true, "optional": false },
      { "name_zh": "生抽", "name_en": "Light Soy Sauce", "category": "condiment", "g_per_person": 15, "is_main": false, "optional": false }
    ]
  }
]

只返回JSON，不要其他文字。`;

  const res = await fetch(
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

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as GeminiResult[];
}

// ── Validate ───────────────────────────────────────────────────────────────────

const VALID_CATS = new Set(['protein', 'vegetable', 'condiment', 'staple', 'other']);

function validate(result: GeminiResult): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!result.ingredients || result.ingredients.length === 0) {
    issues.push('empty ingredients');
    return { ok: false, issues };
  }
  for (const ing of result.ingredients) {
    if (!ing.name_zh)          issues.push(`missing name_zh`);
    if (!ing.name_en)          issues.push(`missing name_en`);
    if (!VALID_CATS.has(ing.category)) issues.push(`invalid category: ${ing.category}`);
    if (ing.g_per_person <= 0 || ing.g_per_person > 500) issues.push(`suspicious g_per_person: ${ing.g_per_person} for ${ing.name_zh}`);
  }
  const mainCount = result.ingredients.filter(i => i.is_main).length;
  if (mainCount === 0) issues.push('no main ingredient');
  if (mainCount > 3)  issues.push(`too many main ingredients: ${mainCount}`);
  return { ok: issues.length === 0, issues };
}

// ── DB writer ──────────────────────────────────────────────────────────────────

async function writeResults(pg: Client, results: GeminiResult[]): Promise<number> {
  let written = 0;
  for (const r of results) {
    const { ok, issues } = validate(r);
    if (!ok) {
      console.log(`\n  ⚠️  ${r.dish_id}: ${issues.join(', ')} — skipping`);
      continue;
    }

    // Delete old ingredients for this dish (idempotent)
    await pg.query('DELETE FROM dish_ingredients WHERE dish_id = $1', [r.dish_id]);

    // Insert new ingredients
    for (const ing of r.ingredients) {
      await pg.query(
        `INSERT INTO dish_ingredients (dish_id, name_zh, name_en, category, g_per_person, is_main, optional)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [r.dish_id, ing.name_zh, ing.name_en, ing.category, ing.g_per_person, ing.is_main, ing.optional]
      );
    }

    // Mark dish as ready
    await pg.query(
      'UPDATE dishes SET ingredients_ready = true WHERE id = $1',
      [r.dish_id]
    );
    written++;
  }
  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🥬 Dish Ingredients Generator  DRY_RUN=${DRY_RUN}  FORCE=${FORCE}`);

  // Fetch dishes to process
  let query = sb.from('dishes')
    .select('id, title_zh, description_zh, main_ingredient, course_type, origin_cuisine');
  if (!FORCE) query = query.eq('ingredients_ready', false);

  const { data: dishes, error } = await query;
  if (error || !dishes) { console.error('Fetch error:', error); process.exit(1); }

  console.log(`📊 Dishes to process: ${dishes.length}\n`);

  if (DRY_RUN) {
    const sample = dishes.slice(0, 3) as DishRow[];
    console.log('🔍 DRY RUN — previewing 3 dishes...\n');
    const results = await generateBatch(sample);
    results.forEach(r => {
      const dish = sample.find(d => d.id === r.dish_id);
      console.log(`【${dish?.title_zh}】`);
      r.ingredients.forEach(i =>
        console.log(`  ${i.is_main ? '★' : '·'} ${i.name_zh.padEnd(10)} ${i.g_per_person}g/人  [${i.category}]${i.optional ? ' (可选)' : ''}`)
      );
      console.log();
    });
    return;
  }

  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  let processed = 0;
  let errors = 0;
  const total = dishes.length;
  const totalBatches = Math.ceil(total / BATCH);

  for (let i = 0; i < total; i += BATCH) {
    const batch = dishes.slice(i, i + BATCH) as DishRow[];
    const batchNum = Math.floor(i / BATCH) + 1;
    process.stdout.write(`\rBatch ${batchNum}/${totalBatches} (${i + 1}–${Math.min(i + BATCH, total)}/${total})...`);

    try {
      const results = await generateBatch(batch);
      const written = await writeResults(pg, results);
      processed += written;
    } catch (e: any) {
      errors += batch.length;
      console.error(`\n  ❌ Batch ${batchNum} failed: ${e.message}`);
    }

    if (i + BATCH < total) await new Promise(r => setTimeout(r, PAUSE));
  }

  await pg.end();

  // Final stats
  const { count: ready } = await sb.from('dishes')
    .select('*', { count: 'exact', head: true })
    .eq('ingredients_ready', true);

  const { count: total_count } = await sb.from('dishes')
    .select('*', { count: 'exact', head: true });

  console.log(`\n\n✅ Done!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Errors:    ${errors}`);
  console.log(`   DB ready:  ${ready}/${total_count} dishes`);

  // Sample check
  const { data: sample } = await sb.from('dish_ingredients')
    .select('name_zh, g_per_person, is_main, category')
    .limit(8);
  console.log('\n📋 Sample ingredients:');
  sample?.forEach(r => console.log(`   ${r.is_main ? '★' : '·'} ${r.name_zh.padEnd(10)} ${r.g_per_person}g  [${r.category}]`));
}

main().catch(e => { console.error(e); process.exit(1); });
