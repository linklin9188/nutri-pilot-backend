/**
 * enrich-dishes.ts
 *
 * Batch-enriches all dishes in the DB with:
 *   course_type   — main_protein | veggie_dish | soup | staple | dessert
 *   protein_g     — per 100g estimate
 *   carb_g        — per 100g estimate
 *   fat_g         — per 100g estimate
 *   cook_time_min — typical home-cooking time
 *
 * Uses Gemini 1.5 Flash (cheap, fast).
 * Runs in batches of 20, with rate-limit pause between batches.
 *
 * Usage:
 *   npx tsx scripts/enrich-dishes.ts
 *   npx tsx scripts/enrich-dishes.ts --dry-run   # preview first 5
 *   npx tsx scripts/enrich-dishes.ts --force      # re-enrich already-done dishes
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL  = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const GEMINI_KEY    = process.env.VITE_GEMINI_API_KEY ?? 'AIzaSyBGhK8b6qMlB01cL5QTSMq-9tcQO5KJu7s';
const DB_URL        = 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');
const BATCH   = 20;
const PAUSE_MS = 2000; // pause between Gemini batches (rate limit)

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Gemini call ────────────────────────────────────────────────────────────────

interface DishInfo {
  id:            string;
  title_zh:      string;
  description_zh: string;
  main_ingredient: string;
  flavor_tags:   string[];
  origin_cuisine: string;
}

interface EnrichedResult {
  id:            string;
  course_type:   'main_protein' | 'veggie_dish' | 'soup' | 'staple' | 'dessert';
  protein_g:     number;
  carb_g:        number;
  fat_g:         number;
  cook_time_min: number;
  reasoning?:    string;
}

async function enrichBatch(dishes: DishInfo[]): Promise<EnrichedResult[]> {
  const prompt = `你是一位专业营养师和厨师。我会给你一批中文菜肴信息，请为每道菜返回以下字段：

course_type: 菜肴类型，必须是以下之一：
  - "main_protein"  = 主蛋白菜（红烧肉、清蒸鱼、白切鸡、炒虾仁等）
  - "veggie_dish"   = 蔬菜/豆腐/蛋类配菜（清炒西兰花、麻婆豆腐、炒鸡蛋等）
  - "soup"          = 汤类/羹类（番茄蛋花汤、冬瓜排骨汤、银耳羹等）
  - "staple"        = 主食/碳水（炒饭、意面、饺子、米饭、面包、披萨等）
  - "dessert"       = 甜点/甜品

protein_g: 每100g可食部分蛋白质含量（克，整数）
carb_g:    每100g碳水化合物含量（克，整数）
fat_g:     每100g脂肪含量（克，整数）
cook_time_min: 家庭烹饪总时间（分钟，含准备，整数）

规则：
- 严格按照 main_ingredient 和菜名判断 course_type
- 主食类（米饭/面条/饺子/披萨/意面/包子/馒头）一律 "staple"
- 纯蔬菜/豆腐/蛋菜一律 "veggie_dish"
- 含肉/禽/海鲜为主的菜 → "main_protein"
- 汤/羹/粥 → "soup"（注意：粥也是staple，汤才是soup）
- 营养数据估算要合理，不要瞎猜

输入菜肴列表（JSON）：
${JSON.stringify(dishes.map(d => ({
  id: d.id,
  name: d.title_zh,
  desc: d.description_zh,
  ingredient: d.main_ingredient,
  tags: d.flavor_tags,
  cuisine: d.origin_cuisine,
})), null, 2)}

请返回纯JSON数组，格式：
[
  {
    "id": "uuid",
    "course_type": "main_protein",
    "protein_g": 18,
    "carb_g": 5,
    "fat_g": 12,
    "cook_time_min": 30
  },
  ...
]

只返回JSON，不要其他文字。`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as EnrichedResult[];
  } catch (e) {
    console.error('Failed to parse Gemini response:', text.slice(0, 300));
    throw e;
  }
}

// ── DB writer ──────────────────────────────────────────────────────────────────

async function writeResults(pg: Client, results: EnrichedResult[]) {
  for (const r of results) {
    await pg.query(
      `UPDATE dishes
       SET course_type    = $1,
           protein_g      = $2,
           carb_g         = $3,
           fat_g          = $4,
           cook_time_min  = $5
       WHERE id = $6`,
      [r.course_type, r.protein_g, r.carb_g, r.fat_g, r.cook_time_min, r.id]
    );
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(r: EnrichedResult, dish: DishInfo): string[] {
  const issues: string[] = [];
  const VALID_TYPES = ['main_protein', 'veggie_dish', 'soup', 'staple', 'dessert'];

  if (!VALID_TYPES.includes(r.course_type)) {
    issues.push(`invalid course_type: ${r.course_type}`);
  }
  if (r.protein_g < 0 || r.protein_g > 80) issues.push(`protein_g out of range: ${r.protein_g}`);
  if (r.carb_g < 0 || r.carb_g > 80)    issues.push(`carb_g out of range: ${r.carb_g}`);
  if (r.fat_g < 0 || r.fat_g > 60)      issues.push(`fat_g out of range: ${r.fat_g}`);
  if (r.cook_time_min < 5 || r.cook_time_min > 240) issues.push(`cook_time_min suspicious: ${r.cook_time_min}`);

  // Sanity: carb dishes should be 'staple'
  if (dish.main_ingredient === 'carb' && r.course_type !== 'staple') {
    issues.push(`carb ingredient but not staple: got ${r.course_type}`);
  }

  return issues;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🍜 Dish Enrichment Script`);
  console.log(`   DRY_RUN=${DRY_RUN}  FORCE=${FORCE}\n`);

  // Fetch dishes that need enrichment
  let query = sb.from('dishes').select('id,title_zh,description_zh,main_ingredient,flavor_tags,origin_cuisine');
  if (!FORCE) {
    query = query.is('course_type', null);
  }

  const { data: dishes, error } = await query;
  if (error || !dishes) {
    console.error('Failed to fetch dishes:', error);
    process.exit(1);
  }

  console.log(`📊 Dishes to enrich: ${dishes.length}`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — processing first 5 dishes:\n');
    const sample = dishes.slice(0, 5) as DishInfo[];
    const results = await enrichBatch(sample);
    results.forEach((r, i) => {
      console.log(`${sample[i].title_zh}`);
      console.log(`  course_type: ${r.course_type}`);
      console.log(`  protein/carb/fat: ${r.protein_g}g / ${r.carb_g}g / ${r.fat_g}g`);
      console.log(`  cook_time: ${r.cook_time_min}min`);
      const issues = validate(r, sample[i]);
      if (issues.length > 0) console.log(`  ⚠️  ${issues.join(', ')}`);
    });
    return;
  }

  // Connect to DB for writes
  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  let processed = 0;
  let errors    = 0;
  let warnings  = 0;

  // Process in batches
  for (let i = 0; i < dishes.length; i += BATCH) {
    const batch = dishes.slice(i, i + BATCH) as DishInfo[];
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(dishes.length / BATCH);

    process.stdout.write(`\rBatch ${batchNum}/${totalBatches} (${i}–${Math.min(i + BATCH, dishes.length)} / ${dishes.length})...`);

    try {
      const results = await enrichBatch(batch);

      // Validate + fix
      const toWrite: EnrichedResult[] = [];
      for (const r of results) {
        const dish = batch.find(d => d.id === r.id);
        if (!dish) { errors++; continue; }

        const issues = validate(r, dish);
        if (issues.length > 0) {
          warnings++;
          console.log(`\n  ⚠️  ${dish.title_zh}: ${issues.join(', ')}`);
          // Auto-fix: if carb ingredient → force staple
          if (dish.main_ingredient === 'carb') r.course_type = 'staple';
        }
        toWrite.push(r);
      }

      await writeResults(pg, toWrite);
      processed += toWrite.length;

    } catch (e: any) {
      errors += batch.length;
      console.error(`\n  ❌ Batch ${batchNum} failed:`, e.message);
    }

    // Rate limit pause (not needed after last batch)
    if (i + BATCH < dishes.length) {
      await new Promise(r => setTimeout(r, PAUSE_MS));
    }
  }

  await pg.end();

  console.log(`\n\n✅ Done!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Warnings:  ${warnings}`);
  console.log(`   Errors:    ${errors}`);

  // Final distribution check
  const { data: dist } = await sb.from('dishes')
    .select('course_type')
    .not('course_type', 'is', null);

  const counts: Record<string, number> = {};
  dist?.forEach(d => { counts[d.course_type] = (counts[d.course_type] ?? 0) + 1; });

  console.log('\n📊 course_type distribution:');
  Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`   ${k.padEnd(15)} ${v}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
