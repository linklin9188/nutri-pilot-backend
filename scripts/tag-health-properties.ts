/**
 * tag-health-properties.ts — batch-tag dishes with health benefit tags that
 * matter for the algorithm's health-condition users (高血压 / 糖尿病 / 痛风).
 *
 * Why: dish.health_benefit_tags currently has only 2 low_sugar, 6 low_sodium,
 * 7 low_purine entries across ~500 dishes. The algorithm's hardFilter +
 * preferLowSodium / preferLowSugar / avoidHighPurine logic can't actually
 * help these users because the pool is empty.
 *
 * Strategy: classify each dish by name + main_ingredient + flavor_tags using
 * deterministic rules (not LLM — rules are explicit and reviewable):
 *   - low_sodium  if (light flavor) AND NOT (salty/savory/cured ingredients)
 *   - low_sugar   if NOT (sweet flavor or dessert) AND NOT (sugar-laden title keywords)
 *   - low_purine  if main_ingredient NOT in HIGH_PURINE set
 *
 * Run:
 *   bun run scripts/tag-health-properties.ts --dry-run     # preview only
 *   bun run scripts/tag-health-properties.ts --limit 50    # tag first 50
 *   bun run scripts/tag-health-properties.ts               # tag everything
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
// Service role lets us update without RLS interference.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Classification rules ─────────────────────────────────────────────────

const HIGH_SODIUM_KEYWORDS = [
  '咸', '腌', '酱', '卤', '腊', '熏', '酸菜', '梅菜', '榨菜', '泡菜',
  '咸鱼', '咸蛋', '咸肉', '火腿', '培根', '香肠', '腊肠', '腊肉',
  '皮蛋', '咸蛋黄', '虾酱', '虾米', '鱼露', '鱼酱', '酱油', '豆瓣酱',
  'salted', 'cured', 'soy sauce', 'fish sauce', 'pickled',
];
const HIGH_SUGAR_KEYWORDS = [
  '糖', '蜜', '甜', '糖醋', '红烧', '冰糖', '糖浆', '果酱',
  '蜜汁', '蜂蜜', '炼乳', '布丁', '蛋糕', '甜点', '甜品', '甜汤',
  '冰淇淋', '雪糕', '巧克力', '糖醋里脊', '咕咾肉', '蜜汁叉烧',
  'syrup', 'honey', 'cake', 'pudding', 'sweet', 'dessert', 'sugar', 'chocolate',
];
// 高嘌呤食材（≥150mg/100g）+ 浓汤
const HIGH_PURINE_INGREDIENTS = new Set([
  'seafood','fish','shrimp','crab','shellfish','squid','scallop',
  'clam','lobster','salmon','tuna','cod','hairtail','seabass','oyster',
  // organ meats — usually map to 'other' but we add safety net
]);
const HIGH_PURINE_KEYWORDS = [
  '内脏','肝','肾','心','脑','肠','胗','排骨汤','牛肉汤','骨汤','高汤',
  '火锅','麻辣烫','啤酒','鸡精','浓汤宝','虾酱','凤尾鱼','沙丁鱼',
  'liver','kidney','heart','tripe','offal','organ',
];

interface Dish {
  id: string;
  title_zh: string;
  title?: string;
  main_ingredient: string | null;
  flavor_tags: string[] | null;
  health_benefit_tags: string[] | null;
  course_type: string | null;
}

function classifyHealth(d: Dish): { lowSodium: boolean; lowSugar: boolean; lowPurine: boolean } {
  const title = `${d.title_zh ?? ''} ${d.title ?? ''}`.toLowerCase();
  const flavors = (d.flavor_tags ?? []).map(t => t.toLowerCase());
  const ing = (d.main_ingredient ?? '').toLowerCase();
  const ct  = d.course_type ?? '';

  // Low sodium: flavor ≠ salty / savory, and no cured/salt keywords in title.
  const sodiumHit = HIGH_SODIUM_KEYWORDS.some(kw => title.includes(kw.toLowerCase()));
  const lowSodium = !flavors.includes('salty')
    && !flavors.includes('savory')
    && !sodiumHit
    && (flavors.includes('light') || flavors.includes('sweet') || flavors.includes('sour'));

  // Low sugar: not dessert, no sweet flavor, no sugar keywords.
  const sugarHit = HIGH_SUGAR_KEYWORDS.some(kw => title.includes(kw.toLowerCase()));
  const lowSugar = ct !== 'dessert'
    && !flavors.includes('sweet')
    && !sugarHit;

  // Low purine: not in seafood ingredient set, no organ/broth keywords.
  const purineHit = HIGH_PURINE_KEYWORDS.some(kw => title.includes(kw.toLowerCase()));
  const lowPurine = !HIGH_PURINE_INGREDIENTS.has(ing)
    && !purineHit
    && ct !== 'soup'; // most concentrated soups push purine load

  return { lowSodium, lowSugar, lowPurine };
}

// ── Main ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '0', 10) : 0;

async function main() {
  console.log(`Fetching dishes${limit ? ` (limit ${limit})` : ''}…`);
  let query = supabase
    .from('dishes')
    .select('id, title_zh, title, main_ingredient, flavor_tags, health_benefit_tags, course_type');
  if (limit > 0) query = query.limit(limit);
  const { data: dishes, error } = await query;
  if (error) { console.error(error); process.exit(1); }
  if (!dishes) { console.log('No dishes.'); return; }

  let added = { lowSodium: 0, lowSugar: 0, lowPurine: 0 };
  let updated = 0;

  for (const d of dishes as Dish[]) {
    const c = classifyHealth(d);
    const existing = new Set(d.health_benefit_tags ?? []);
    const toAdd: string[] = [];
    if (c.lowSodium && !existing.has('low_sodium')) toAdd.push('low_sodium');
    if (c.lowSugar  && !existing.has('low_sugar'))  toAdd.push('low_sugar');
    if (c.lowPurine && !existing.has('low_purine')) toAdd.push('low_purine');
    if (toAdd.length === 0) continue;

    if (toAdd.includes('low_sodium')) added.lowSodium++;
    if (toAdd.includes('low_sugar'))  added.lowSugar++;
    if (toAdd.includes('low_purine')) added.lowPurine++;
    updated++;

    const newTags = [...existing, ...toAdd];
    if (dryRun) {
      console.log(`  ${d.title_zh.padEnd(30)} ← ${toAdd.join(', ')}`);
    } else {
      const { error: e } = await supabase
        .from('dishes')
        .update({ health_benefit_tags: newTags })
        .eq('id', d.id);
      if (e) console.error(`  ${d.title_zh}: ${e.message}`);
    }
  }

  console.log(`\nDone. Dishes touched: ${updated}/${dishes.length}`);
  console.log(`  +low_sodium ${added.lowSodium}`);
  console.log(`  +low_sugar  ${added.lowSugar}`);
  console.log(`  +low_purine ${added.lowPurine}`);
  if (dryRun) console.log('(--dry-run, no writes)');
}

main().catch(e => { console.error(e); process.exit(1); });
