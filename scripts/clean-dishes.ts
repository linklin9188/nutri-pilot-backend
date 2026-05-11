/**
 * clean-dishes.ts
 *
 * DB cleanup based on audit:
 * 1. Delete 22 dishes: duplicate/non-family soups, western non-family meats
 * 2. Insert 15 global classic soups
 *
 * Run: npx tsx scripts/clean-dishes.ts --dry-run
 *      npx tsx scripts/clean-dishes.ts
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const sb = createClient(
  'https://qoyuafqqkfyrqlthsvws.supabase.co',
  'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd'
);

const DRY_RUN = process.argv.includes('--dry-run');

// ── 1. Dishes to DELETE ────────────────────────────────────────────────────────

const TO_DELETE: string[] = [
  // 排骨汤 × 3（保留玉米/莲藕/冬瓜排骨汤，删重复的）
  '冬瓜炖排骨', '莲藕炖排骨', '海带炖排骨',

  // 西式蔬菜汤 × 5（全西式，与中式菜单违和）
  '南瓜奶油浓汤', '意式番茄浓汤', '意式蔬菜杂蔬汤', '法式洋葱汤', '烤南瓜浓汤',

  // 猪肉 × 4（排骨重复 + 早餐肉不适合晚餐）
  '糯米排骨', '红烧大排', '煎早餐香肠', '脆皮培根',

  // 牛肉 × 5（西式非家常）
  '俄式酸奶牛肉', '美式烘焙肉卷', '邋遢乔汉堡肉', '墨西哥牛肉塔可', '墨西哥辣肉酱',

  // 鸡肉 × 5（西式非家常）
  '帕玛森芝士鸡排', '柠檬刺山柑鸡排', '玛莎拉酒炖鸡', '鸡肉芝士薄饼', '墨西哥铁板鸡肉卷',
];

// ── 2. New soups to INSERT ────────────────────────────────────────────────────
// 15 global classics: mix of Asian staples + Chinese home-style

const NEW_SOUPS = [
  {
    title_zh: '日式味噌汤',
    title_en: 'Miso Soup',
    description_zh: '鲜咸醇厚，大豆发酵精华，日式餐桌必备。',
    description_en: 'Savory fermented soybean broth with tofu and seaweed, a Japanese staple.',
    main_ingredient: 'other',
    origin_cuisine: 'japanese_korean',
    flavor_tags: ['light', 'salty'],
    health_benefit_tags: ['maintain', 'nourish'],
    protein_g: 3, carb_g: 4, fat_g: 2, cook_time_min: 10,
  },
  {
    title_zh: '冬阴功汤',
    title_en: 'Tom Yum Goong',
    description_zh: '酸辣鲜爽，柠檬香茅虾汤，泰式经典开胃汤。',
    description_en: 'Thai spicy-sour prawn soup with lemongrass, galangal and lime leaves.',
    main_ingredient: 'shrimp',
    origin_cuisine: 'southeast_asian',
    flavor_tags: ['spicy', 'sour', 'light'],
    health_benefit_tags: ['maintain'],
    protein_g: 8, carb_g: 4, fat_g: 3, cook_time_min: 30,
  },
  {
    title_zh: '罗宋汤',
    title_en: 'Borscht',
    description_zh: '番茄红菜头炖牛肉，酸甜浓郁，上海家常西餐汤。',
    description_en: 'Hearty beet and beef soup, beloved in Chinese homes as a Shanghai classic.',
    main_ingredient: 'beef',
    origin_cuisine: 'western',
    flavor_tags: ['salty', 'sour', 'light'],
    health_benefit_tags: ['maintain'],
    protein_g: 8, carb_g: 10, fat_g: 6, cook_time_min: 60,
  },
  {
    title_zh: '韩式大酱汤',
    title_en: 'Doenjang Jjigae',
    description_zh: '发酵大酱香气浓厚，豆腐蔬菜同煮，韩式家常下饭汤。',
    description_en: 'Korean fermented soybean paste stew with tofu, zucchini and mushrooms.',
    main_ingredient: 'tofu',
    origin_cuisine: 'japanese_korean',
    flavor_tags: ['salty', 'light'],
    health_benefit_tags: ['maintain'],
    protein_g: 6, carb_g: 5, fat_g: 4, cook_time_min: 25,
  },
  {
    title_zh: '泰式椰奶鸡汤',
    title_en: 'Tom Kha Gai',
    description_zh: '椰奶香醇，南姜柠檬草提香，鸡肉嫩滑。',
    description_en: 'Creamy Thai coconut milk soup with chicken, galangal and lemongrass.',
    main_ingredient: 'chicken',
    origin_cuisine: 'southeast_asian',
    flavor_tags: ['light', 'sweet', 'spicy'],
    health_benefit_tags: ['maintain'],
    protein_g: 12, carb_g: 5, fat_g: 9, cook_time_min: 30,
  },
  {
    title_zh: '番茄蛋花汤',
    title_en: 'Tomato Egg Drop Soup',
    description_zh: '酸甜开胃，蛋花滑嫩，10分钟家常快手汤。',
    description_en: 'Quick Chinese tomato and egg drop soup, light and comforting.',
    main_ingredient: 'egg',
    origin_cuisine: 'northern',
    flavor_tags: ['light', 'sour', 'salty'],
    health_benefit_tags: ['maintain'],
    protein_g: 4, carb_g: 5, fat_g: 3, cook_time_min: 10,
  },
  {
    title_zh: '菠菜蛋花汤',
    title_en: 'Spinach Egg Drop Soup',
    description_zh: '清淡鲜嫩，补铁养血，营养简单家常汤。',
    description_en: 'Light Chinese soup with silky egg ribbons and iron-rich spinach.',
    main_ingredient: 'egg',
    origin_cuisine: 'cantonese',
    flavor_tags: ['light', 'salty'],
    health_benefit_tags: ['maintain', 'nourish'],
    protein_g: 4, carb_g: 3, fat_g: 3, cook_time_min: 10,
  },
  {
    title_zh: '丝瓜蛋花汤',
    title_en: 'Luffa Egg Drop Soup',
    description_zh: '清甜爽滑，消暑解腻，粤式家常清汤。',
    description_en: 'Cantonese luffa gourd and egg drop soup, light and refreshing.',
    main_ingredient: 'veggie',
    origin_cuisine: 'cantonese',
    flavor_tags: ['light', 'salty'],
    health_benefit_tags: ['maintain'],
    protein_g: 3, carb_g: 3, fat_g: 2, cook_time_min: 12,
  },
  {
    title_zh: '银耳莲子羹',
    title_en: 'Snow Fungus Lotus Seed Soup',
    description_zh: '滋阴润燥，银耳莲子清甜养颜，滋补甜汤。',
    description_en: 'Chinese nourishing sweet soup with snow fungus, lotus seeds and goji berries.',
    main_ingredient: 'other',
    origin_cuisine: 'jiangnan',
    flavor_tags: ['sweet', 'light'],
    health_benefit_tags: ['nourish', 'maintain'],
    protein_g: 1, carb_g: 15, fat_g: 1, cook_time_min: 45,
  },
  {
    title_zh: '老鸭冬瓜汤',
    title_en: 'Old Duck and Winter Melon Soup',
    description_zh: '清热解暑，老鸭汤底醇厚，冬瓜清甜甘润。',
    description_en: 'Cantonese slow-cooked duck soup with winter melon, cooling and nourishing.',
    main_ingredient: 'duck',
    origin_cuisine: 'cantonese',
    flavor_tags: ['light', 'salty'],
    health_benefit_tags: ['maintain', 'nourish'],
    protein_g: 12, carb_g: 3, fat_g: 7, cook_time_min: 90,
  },
  {
    title_zh: '豆腐鱼头汤',
    title_en: 'Fish Head Tofu Soup',
    description_zh: '汤色奶白，鱼头鲜美浓郁，豆腐嫩滑，补钙滋补。',
    description_en: 'Milky white Chinese fish head soup with silken tofu, rich and nourishing.',
    main_ingredient: 'fish',
    origin_cuisine: 'cantonese',
    flavor_tags: ['light', 'salty'],
    health_benefit_tags: ['maintain', 'nourish'],
    protein_g: 12, carb_g: 2, fat_g: 8, cook_time_min: 40,
  },
  {
    title_zh: '韩式嫩豆腐汤',
    title_en: 'Sundubu Jjigae',
    description_zh: '嫩豆腐鲜辣滚烫，配蛤蜊或猪肉，韩式下饭神器。',
    description_en: 'Korean spicy soft tofu stew with clams or pork, bubbling hot and fiery.',
    main_ingredient: 'tofu',
    origin_cuisine: 'japanese_korean',
    flavor_tags: ['spicy', 'salty'],
    health_benefit_tags: ['maintain'],
    protein_g: 8, carb_g: 4, fat_g: 5, cook_time_min: 20,
  },
  {
    title_zh: '意式杂豆汤',
    title_en: 'Minestrone',
    description_zh: '番茄蔬菜豆类同煮，意大利经典家常暖汤。',
    description_en: 'Italian vegetable and bean soup with tomatoes, pasta and seasonal vegetables.',
    main_ingredient: 'veggie',
    origin_cuisine: 'western',
    flavor_tags: ['light', 'salty'],
    health_benefit_tags: ['maintain'],
    protein_g: 5, carb_g: 15, fat_g: 4, cook_time_min: 40,
  },
  {
    title_zh: '西班牙冷汤',
    title_en: 'Gazpacho',
    description_zh: '番茄黄瓜冷制，清爽夏日开胃汤，西班牙传统。',
    description_en: 'Spanish chilled tomato and cucumber soup, refreshing and vibrant.',
    main_ingredient: 'veggie',
    origin_cuisine: 'western',
    flavor_tags: ['light', 'sour'],
    health_benefit_tags: ['maintain', 'fat_loss'],
    protein_g: 2, carb_g: 8, fat_g: 4, cook_time_min: 20,
  },
  {
    title_zh: '花甲豆腐汤',
    title_en: 'Clam Tofu Soup',
    description_zh: '花甲鲜甜，豆腐嫩滑，汤汁清甜，粤式家常鲜汤。',
    description_en: 'Cantonese light soup with fresh clams and silken tofu, naturally sweet broth.',
    main_ingredient: 'clam',
    origin_cuisine: 'cantonese',
    flavor_tags: ['light', 'salty'],
    health_benefit_tags: ['maintain'],
    protein_g: 8, carb_g: 3, fat_g: 3, cook_time_min: 20,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🧹 DB Cleanup Script  DRY_RUN=${DRY_RUN}\n`);

  // ── Step 1: Verify all dishes to delete exist ───────────────────────────────
  console.log(`📋 Verifying ${TO_DELETE.length} dishes to delete...`);
  const { data: existing } = await sb.from('dishes').select('id, title_zh').in('title_zh', TO_DELETE);
  const foundNames = new Set(existing?.map(d => d.title_zh));
  const missing = TO_DELETE.filter(t => !foundNames.has(t));
  if (missing.length > 0) {
    console.log('  ⚠️  Not found in DB:', missing.join(', '));
  }
  console.log(`  ✅ Found ${existing?.length ?? 0}/${TO_DELETE.length} dishes to delete`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would delete:');
    existing?.forEach(d => console.log(`  - ${d.title_zh} (${d.id})`));
    console.log('\n[DRY RUN] Would insert 15 new soups:');
    NEW_SOUPS.forEach(s => console.log(`  + ${s.title_zh} (${s.origin_cuisine}, ing: ${s.main_ingredient})`));
    return;
  }

  // ── Step 2: Delete ──────────────────────────────────────────────────────────
  console.log(`\n🗑️  Deleting ${existing?.length ?? 0} dishes...`);
  const { error: delErr } = await sb.from('dishes').delete().in('title_zh', TO_DELETE);
  if (delErr) { console.error('Delete error:', delErr); process.exit(1); }
  console.log('  ✅ Deleted');

  // ── Step 3: Insert new soups ────────────────────────────────────────────────
  console.log(`\n🍜 Inserting ${NEW_SOUPS.length} new soups...`);
  const rows = NEW_SOUPS.map(s => ({
    id: randomUUID(),
    ...s,
    course_type: 'soup',
    meal_type: 'dinner',
    is_vegan: false,
    seasonal_tag: null,
    image_url: '',       // will be filled by gen-dish-images script
    prep_steps_json: null,
    cook_steps_json: null,
  }));

  const { error: insErr } = await sb.from('dishes').insert(rows);
  if (insErr) { console.error('Insert error:', insErr); process.exit(1); }
  console.log('  ✅ Inserted');

  // ── Step 4: Final count ─────────────────────────────────────────────────────
  const { count } = await sb.from('dishes').select('*', { count: 'exact', head: true });
  const { data: soupDist } = await sb.from('dishes').select('course_type');
  const ct: Record<string,number> = {};
  soupDist?.forEach(d => { ct[d.course_type ?? 'null'] = (ct[d.course_type ?? 'null'] ?? 0) + 1; });

  console.log(`\n✅ Done! Total dishes: ${count}`);
  console.log('📊 course_type distribution:');
  Object.entries(ct).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`   ${k.padEnd(16)} ${v}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
