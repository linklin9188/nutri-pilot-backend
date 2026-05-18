/**
 * seed-cold-dishes.ts — add 10 cold-appetizer dishes to bring the banquet
 * cold-bucket pool from 26 → 36 with better cuisine spread.
 *
 * After running, banquet.ts isCold() picks these up via the 'cold' flavor_tag
 * short-circuit (set on every row here). prep_steps_json is left NULL — the
 * /verify hydratePrepSteps() helper falls back to the main_ingredient
 * heuristic when prep_steps is missing, so the banquet → shopping list path
 * still works. Full Simply Chinese Feasts 4D pipeline (prep + cook + cultural
 * + image) is a follow-up; see CLAUDE.md "dish seed pipeline".
 *
 * Idempotent: skips any title_zh already present.
 *
 * Usage:
 *   npx tsx scripts/seed-cold-dishes.ts --dry-run
 *   npx tsx scripts/seed-cold-dishes.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

interface NewDish {
  title_zh: string;
  title_en: string;
  origin_cuisine: 'western' | 'sichuan' | 'jiangnan' | 'cantonese' | 'japanese_korean' | 'northern' | 'southeast_asian';
  course_type: 'main_protein' | 'veggie_dish';
  main_ingredient: string;
  protein_source: string[];
  is_vegan: boolean;
  flavor_tags: string[];
  health_benefit_tags: string[];
  description_zh: string;
  description_en: string;
  cook_time_min: number;
  cook_method: string;
  meal_type: 'all';
  seasonal_tag: string;
}

const DISHES: NewDish[] = [
  // ── western (3) ──
  { title_zh: '凯撒沙拉', title_en: 'Caesar Salad',
    origin_cuisine: 'western', course_type: 'veggie_dish', main_ingredient: 'veggie',
    protein_source: ['cheese','egg'], is_vegan: false,
    flavor_tags: ['cold','salty','umami'], health_benefit_tags: ['detox','low_sugar'],
    description_zh: '罗马生菜配凯撒酱、帕马森芝士、面包丁。', description_en: 'Romaine, Caesar dressing, parmesan, croutons.',
    cook_time_min: 10, cook_method: 'raw', meal_type: 'all', seasonal_tag: 'All-Season/Balanced' },
  { title_zh: '希腊沙拉', title_en: 'Greek Salad',
    origin_cuisine: 'western', course_type: 'veggie_dish', main_ingredient: 'veggie',
    protein_source: ['cheese'], is_vegan: false,
    flavor_tags: ['cold','light','sour'], health_benefit_tags: ['detox','immunity'],
    description_zh: '番茄、黄瓜、洋葱、橄榄、菲达芝士，淋橄榄油柠檬汁。', description_en: 'Tomato, cucumber, onion, olives, feta with olive oil and lemon.',
    cook_time_min: 10, cook_method: 'raw', meal_type: 'all', seasonal_tag: 'Summer/Cooling' },
  { title_zh: '卡布里沙拉', title_en: 'Caprese Salad',
    origin_cuisine: 'western', course_type: 'veggie_dish', main_ingredient: 'veggie',
    protein_source: ['cheese'], is_vegan: false,
    flavor_tags: ['cold','light','fresh'], health_benefit_tags: ['detox','immunity'],
    description_zh: '番茄、莫扎瑞拉、罗勒，淋橄榄油。', description_en: 'Tomato, mozzarella, basil drizzled with olive oil.',
    cook_time_min: 8, cook_method: 'raw', meal_type: 'all', seasonal_tag: 'Summer/Cooling' },

  // ── sichuan (3) ──
  { title_zh: '红油耳片', title_en: 'Sliced Pig Ear in Chili Oil',
    origin_cuisine: 'sichuan', course_type: 'main_protein', main_ingredient: 'pork',
    protein_source: ['meat'], is_vegan: false,
    flavor_tags: ['cold','spicy','savory'], health_benefit_tags: ['low_sugar','high_protein'],
    description_zh: '猪耳卤熟切薄片，淋红油蒜末。', description_en: 'Braised pork ear sliced, dressed with chili oil and minced garlic.',
    cook_time_min: 15, cook_method: 'boil', meal_type: 'all', seasonal_tag: 'All-Season/Balanced' },
  { title_zh: '椒麻鸡丝', title_en: 'Cold Chicken Strips with Sichuan Pepper',
    origin_cuisine: 'sichuan', course_type: 'main_protein', main_ingredient: 'chicken',
    protein_source: ['meat'], is_vegan: false,
    flavor_tags: ['cold','spicy','aromatic'], health_benefit_tags: ['high_protein','low_sugar'],
    description_zh: '鸡胸煮熟撕丝，淋花椒油葱花。', description_en: 'Poached chicken shredded, dressed with Sichuan peppercorn oil and scallion.',
    cook_time_min: 20, cook_method: 'boil', meal_type: 'all', seasonal_tag: 'All-Season/Balanced' },
  { title_zh: '凉拌折耳根', title_en: 'Cold Fish Mint Salad',
    origin_cuisine: 'sichuan', course_type: 'veggie_dish', main_ingredient: 'veggie',
    protein_source: ['none'], is_vegan: true,
    flavor_tags: ['cold','sour','spicy'], health_benefit_tags: ['detox','anti_inflammation'],
    description_zh: '川黔特色野菜，凉拌酸辣开胃。', description_en: 'Houttuynia cordata salad, sour-spicy and refreshing.',
    cook_time_min: 8, cook_method: 'raw', meal_type: 'all', seasonal_tag: 'Spring/Awakening' },

  // ── jiangnan (2) ──
  { title_zh: '醉虾', title_en: 'Drunken Shrimp',
    origin_cuisine: 'jiangnan', course_type: 'main_protein', main_ingredient: 'shrimp',
    protein_source: ['seafood'], is_vegan: false,
    flavor_tags: ['cold','aromatic','sweet'], health_benefit_tags: ['high_protein','low_purine'],
    description_zh: '鲜活河虾以黄酒、姜葱浸泡入味。', description_en: 'Live river shrimp soaked in Shaoxing wine with ginger and scallion.',
    cook_time_min: 15, cook_method: 'mix_cold', meal_type: 'all', seasonal_tag: 'Summer/Cooling' },
  { title_zh: '油焖笋', title_en: 'Oil-braised Bamboo Shoots (Cold)',
    origin_cuisine: 'jiangnan', course_type: 'veggie_dish', main_ingredient: 'veggie',
    protein_source: ['none'], is_vegan: true,
    flavor_tags: ['cold','sweet','savory'], health_benefit_tags: ['detox','low_sugar'],
    description_zh: '春笋红烧后晾凉，咸甜入味。', description_en: 'Spring bamboo shoots braised and chilled, sweet-savory.',
    cook_time_min: 25, cook_method: 'braise', meal_type: 'all', seasonal_tag: 'Spring/Awakening' },

  // ── cantonese (1) — DB had 0 cold cantonese dishes before this ──
  { title_zh: '卤味拼盘', title_en: 'Cantonese Cold Cuts Platter',
    origin_cuisine: 'cantonese', course_type: 'main_protein', main_ingredient: 'pork',
    protein_source: ['meat'], is_vegan: false,
    flavor_tags: ['cold','savory','aromatic'], health_benefit_tags: ['high_protein'],
    description_zh: '卤水猪肚、牛腱、鸡胗切片摆盘，酱油碟蘸食。', description_en: 'Master-stock braised pork tripe, beef shank, gizzard sliced and platted, served with soy.',
    cook_time_min: 30, cook_method: 'braise', meal_type: 'all', seasonal_tag: 'All-Season/Balanced' },

  // ── japanese_korean (1) — DB had 0 cold JP/KR dishes before this ──
  { title_zh: '冷奴', title_en: 'Hiyayakko (Chilled Tofu)',
    origin_cuisine: 'japanese_korean', course_type: 'veggie_dish', main_ingredient: 'tofu',
    protein_source: ['soy'], is_vegan: false,  // bonito flakes typically on top
    flavor_tags: ['cold','light','umami'], health_benefit_tags: ['low_sugar','low_purine','high_protein'],
    description_zh: '冰镇嫩豆腐淋酱油，撒葱花、姜末、柴鱼片。', description_en: 'Chilled silken tofu with soy sauce, scallion, ginger, and bonito flakes.',
    cook_time_min: 5, cook_method: 'raw', meal_type: 'all', seasonal_tag: 'Summer/Cooling' },
];

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  let inserted = 0, skipped = 0;
  for (const d of DISHES) {
    const { rows } = await c.query<{ id: string }>(
      `SELECT id FROM dishes WHERE title_zh = $1`, [d.title_zh]
    );
    if (rows.length > 0) {
      console.log(`  · already exists, skip: ${d.title_zh}`);
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`  [dry] would insert: ${d.title_zh} / ${d.title_en}  [${d.origin_cuisine}] tags=${JSON.stringify(d.flavor_tags)}`);
    } else {
      await c.query(
        `INSERT INTO dishes (
           title_zh, title_en, origin_cuisine, course_type, main_ingredient,
           protein_source, is_vegan, flavor_tags, health_benefit_tags,
           description_zh, description_en, cook_time_min, cook_method,
           meal_type, seasonal_tag, source
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [d.title_zh, d.title_en, d.origin_cuisine, d.course_type, d.main_ingredient,
         d.protein_source, d.is_vegan, d.flavor_tags, d.health_benefit_tags,
         d.description_zh, d.description_en, d.cook_time_min, d.cook_method,
         d.meal_type, d.seasonal_tag, 'seed-cold-2026-05-18']
      );
      console.log(`  ✓ inserted: ${d.title_zh} (${d.origin_cuisine})`);
    }
    inserted++;
  }
  console.log(`\n${DRY_RUN ? '[DRY] ' : ''}done. inserted=${inserted}, skipped=${skipped}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
