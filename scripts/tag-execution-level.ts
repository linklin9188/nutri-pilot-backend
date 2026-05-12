/**
 * tag-execution-level.ts
 *
 * Batch-assigns execution_level (1-3) to all dishes based on
 * title_zh + main_ingredient + course_type using rule-based logic.
 *
 * Level 1 = Zero technique: steam, boil, toss, blanch
 * Level 2 = Basic stir-fry / single-step cooking
 * Level 3 = Chinese technique required: braise, multi-step, high-heat
 *
 * Run: npx tsx scripts/tag-execution-level.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qoyuafqqkfyrqlthsvws.supabase.co',
  'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd',
);

// ── Rule sets ─────────────────────────────────────────────────────────────────

// Title keywords → level 1 (no technique)
const LEVEL1_TITLE = [
  '清蒸', '蒸', '白切', '白灼', '凉拌', '拌', '煮', '水煮', '卤',
  '炖', '焖', '盐水', '白斩', '冷切', '豆腐花', '粥', '汤',
  'steam', 'boil', 'poach',
];

// Title keywords → level 3 (technique required)
const LEVEL3_TITLE = [
  '红烧', '麻婆', '回锅', '爆炒', '干煸', '鱼香', '夫妻', '水煮鱼',
  '酸菜鱼', '剁椒', '铁板', '煲仔', '东坡', '狮子头', '梅菜扣',
  '糖醋', '锅包肉', '粉蒸', '扣肉', '叫花鸡', '北京烤鸭',
  '脆皮', '酥', '走油', '焦', '炸', '油炸', '天妇罗',
];

// course_type → default level if no title match
const COURSE_DEFAULT: Record<string, number> = {
  soup:         1,  // just boil
  staple:       1,  // rice/noodle straightforward
  dessert:      1,
  veggie_dish:  2,  // light stir-fry
  main_protein: 2,  // default mid; overridden by title
};

function assignLevel(dish: {
  title_zh?: string;
  title_en?: string;
  course_type?: string;
  main_ingredient?: string;
  flavor_tags?: string[];
}): number {
  const title = ((dish.title_zh ?? '') + ' ' + (dish.title_en ?? '')).toLowerCase();
  const course = dish.course_type ?? '';
  const ing    = dish.main_ingredient ?? '';

  // Level 1 signals
  const isLevel1 = LEVEL1_TITLE.some(kw => title.includes(kw));
  if (isLevel1) return 1;

  // Level 3 signals
  const isLevel3 = LEVEL3_TITLE.some(kw => title.includes(kw));
  if (isLevel3) return 3;

  // Spicy flavor → usually requires technique
  if ((dish.flavor_tags ?? []).includes('spicy') && course === 'main_protein') return 3;

  // Ingredient-based bumps
  if (['beef', 'lamb', 'mutton'].includes(ing) && course === 'main_protein') return 3;
  if (ing === 'pork' && course === 'main_protein') return 2; // basic pork stir-fry

  // Egg dishes: mostly simple
  if (ing === 'egg') return 1;

  // Tofu: mostly level 2 unless special
  if (ing === 'tofu') return 2;

  // Soup / staple / dessert default level 1
  if (['soup', 'staple', 'dessert'].includes(course)) return 1;

  return COURSE_DEFAULT[course] ?? 2;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching all dishes...');
  const { data: dishes, error } = await supabase
    .from('dishes')
    .select('id, title_zh, title_en, course_type, main_ingredient, flavor_tags');

  if (error || !dishes) { console.error(error); process.exit(1); }
  console.log(`Total dishes: ${dishes.length}`);

  // Assign levels
  const updates = dishes.map(d => ({ id: d.id, execution_level: assignLevel(d) }));

  // Count distribution
  const dist = { 1: 0, 2: 0, 3: 0 };
  for (const u of updates) dist[u.execution_level as 1|2|3]++;
  console.log(`Distribution → L1: ${dist[1]}  L2: ${dist[2]}  L3: ${dist[3]}`);

  // Batch upsert in chunks of 100
  const CHUNK = 100;
  let done = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const { error: upErr } = await supabase
      .from('dishes')
      .upsert(chunk, { onConflict: 'id' });
    if (upErr) { console.error('Upsert error:', upErr.message); process.exit(1); }
    done += chunk.length;
    process.stdout.write(`\rTagged ${done}/${updates.length}...`);
  }

  console.log('\nDone ✓');

  // Show sample of level 3 dishes
  const l3 = updates.filter(u => u.execution_level === 3).slice(0, 8);
  const l3ids = l3.map(u => u.id);
  const { data: sample } = await supabase.from('dishes').select('title_zh').in('id', l3ids);
  console.log('\nSample Level-3 dishes:');
  sample?.forEach(d => console.log(' ', d.title_zh));
}

main();
