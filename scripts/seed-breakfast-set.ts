/**
 * seed-breakfast-set.ts — insert 35 new Chinese breakfast dishes to close
 * the combo gap surfaced by .claude/skills/chinese-breakfast/SKILL.md.
 *
 * Categories (totals after this seed):
 *   蛋类      4 → 5 (添 白煮蛋 / 鸡蛋羹 / 煎鸡蛋 / 葱花炒鸡蛋；茶叶蛋已有)
 *   北方粥    0 → 7 (小米 / 玉米 / 燕麦 / 杂粮 / 黑米 / 绿豆 / 红枣山药)
 *   港式茶饮  0 → 6 (港式奶茶 / 鸳鸯 / 冻柠茶 / 阿华田 / 好立克 / 港式咖啡)
 *   港式包点  0 → 6 (菠萝包 / 菠萝油 / 鸡尾包 / 港式蛋挞 / 粢饭 / 火腿通心粉)
 *   奶制品    0 → 4 (牛奶 / 酸奶 / 杏仁露 / 燕麦奶)
 *   凉拌时蔬  0 → 4 (凉拌黄瓜 / 凉拌海带丝 / 凉拌三丝 / 拌芹菜花生)
 *   豆制品/肉 0 → 4 (五香卤豆干 / 凉拌千张丝 / 酱牛肉 / 肉松)
 *
 * Uses ON CONFLICT DO NOTHING by title_zh so re-running is idempotent.
 * Step generation + nutrition backfill are separate pipeline scripts
 * the user invokes after this.
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

interface DishSeed {
  title_zh: string;
  title_en: string;
  description_zh: string;
  description_en: string;
  origin_cuisine: string;
  main_ingredient: string;
  course_type: 'staple' | 'main_protein' | 'veggie_dish' | 'soup' | 'dessert';
  flavor_tags: string[];
  health_benefit_tags: string[];
  is_vegan: boolean;
  execution_level: number;
}

const SEEDS: DishSeed[] = [
  // ── 蛋类 (4) ──
  { title_zh: '白煮蛋', title_en: 'Boiled Egg',
    description_zh: '开水煮 8 分钟，蛋黄绵软，蛋白嫩滑，早餐最方便的蛋白来源。',
    description_en: 'Boiled 8 minutes for soft yolk and tender white; the simplest breakfast protein.',
    origin_cuisine: 'cantonese', main_ingredient: 'egg', course_type: 'main_protein',
    flavor_tags: ['light'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '鸡蛋羹', title_en: 'Steamed Egg Custard',
    description_zh: '蛋液加 1.5 倍温水蒸 10 分钟，嫩滑如布丁，老人小孩都易消化。',
    description_en: 'Egg whisked with 1.5x warm water, steamed 10 min into silky custard.',
    origin_cuisine: 'jiangnan', main_ingredient: 'egg', course_type: 'main_protein',
    flavor_tags: ['light', 'savory'], health_benefit_tags: ['high_protein', 'maintain', 'nourish'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '煎鸡蛋', title_en: 'Pan-fried Egg',
    description_zh: '少油中火煎，太阳蛋或双面煎，5 分钟搞定。',
    description_en: 'Light-oil medium heat, sunny-side or over-easy in 5 minutes.',
    origin_cuisine: 'cantonese', main_ingredient: 'egg', course_type: 'main_protein',
    flavor_tags: ['light', 'savory'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '葱花炒鸡蛋', title_en: 'Scrambled Egg with Scallion',
    description_zh: '蛋液加葱花、少许盐，热锅中火炒至刚熟，香气浓郁。',
    description_en: 'Whisked egg with scallion and salt, scrambled medium heat to just-set.',
    origin_cuisine: 'northern', main_ingredient: 'egg', course_type: 'main_protein',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },

  // ── 北方粥 (7) ──
  { title_zh: '小米粥', title_en: 'Millet Porridge',
    description_zh: '小米熬至开花，米油浓香，北方人最经典的暖胃早餐。',
    description_en: 'Slow-simmered millet until creamy; classic warming breakfast.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['light', 'sweet'], health_benefit_tags: ['maintain', 'nourish'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '玉米粥', title_en: 'Corn Porridge',
    description_zh: '玉米渣或玉米面熬煮，自带清甜，富含膳食纤维。',
    description_en: 'Corn grits or polenta simmered into a sweet, fiber-rich porridge.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['light', 'sweet'], health_benefit_tags: ['maintain', 'detox'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '燕麦粥', title_en: 'Oat Porridge',
    description_zh: '燕麦煮 15 分钟至浓稠，可加牛奶或红枣，控糖控胆固醇。',
    description_en: 'Oats simmered 15 min; optional milk or dates. Heart-friendly.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['light'], health_benefit_tags: ['maintain', 'lose_weight', 'low_sugar'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '杂粮粥', title_en: 'Mixed Grain Porridge',
    description_zh: '小米、燕麦、黑米、红豆混合慢煮，多种谷物 B 族维生素。',
    description_en: 'Millet, oats, black rice, red bean mix — multi-grain B-vitamin boost.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['light', 'sweet'], health_benefit_tags: ['maintain', 'nourish'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '黑米粥', title_en: 'Black Rice Porridge',
    description_zh: '黑米提前浸泡 4 小时，慢煮成紫黑色浓粥，富含花青素，补血养颜。',
    description_en: 'Black rice pre-soaked 4h, slow-cooked into dark anthocyanin-rich porridge.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['sweet', 'aromatic'], health_benefit_tags: ['nourish', 'maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '绿豆粥', title_en: 'Mung Bean Porridge',
    description_zh: '绿豆浸泡 2 小时，与大米同煮至开花，夏季清热解暑首选。',
    description_en: 'Mung bean soaked 2h, simmered with rice — summer heat-clearing.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['light', 'sweet'], health_benefit_tags: ['detox', 'damp_clear'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '红枣山药粥', title_en: 'Red Date & Yam Porridge',
    description_zh: '大米、铁棍山药、红枣、枸杞同煮，补气养胃，特别适合女性早餐。',
    description_en: 'Rice + iron-stick yam + jujube + goji slow-simmered; qi-nourishing.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['sweet', 'light'], health_benefit_tags: ['nourish', 'maintain'],
    is_vegan: true, execution_level: 1 },

  // ── 港式茶饮 (6) ──
  { title_zh: '港式奶茶', title_en: 'HK-style Milk Tea',
    description_zh: '锡兰红茶 + 淡奶 + 砂糖，丝袜过滤拉出茶色，港人早餐标配。',
    description_en: 'Ceylon black tea, evaporated milk, sugar — silk-stocking filtered HK classic.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['sweet', 'aromatic'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '鸳鸯', title_en: 'Yuanyang (Coffee Milk Tea)',
    description_zh: '7 分港式奶茶 + 3 分浓缩咖啡，茶香与咖啡香兼得。',
    description_en: '70% HK milk tea + 30% espresso — both flavors at once.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['sweet', 'aromatic'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '港式冻柠茶', title_en: 'HK Iced Lemon Tea',
    description_zh: '红茶冲泡放凉，加 4 片柠檬挤压出酸，加糖加冰，茶餐厅经典。',
    description_en: 'Black tea cooled, 4 lemon slices pressed for tartness, sugar + ice.',
    origin_cuisine: 'cantonese', main_ingredient: 'fruit', course_type: 'staple',
    flavor_tags: ['sweet', 'sour'], health_benefit_tags: ['maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '阿华田', title_en: 'Ovaltine',
    description_zh: '阿华田粉冲调热饮，麦芽香浓郁，茶餐厅儿童早餐首选。',
    description_en: 'Ovaltine powder hot drink — rich malt flavor, kids favorite.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['sweet', 'aromatic'], health_benefit_tags: ['maintain', 'nourish'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '好立克', title_en: 'Horlicks',
    description_zh: '好立克粉冲调热奶饮，比阿华田更温和，老人小孩常喝。',
    description_en: 'Horlicks malt drink — milder than Ovaltine, popular with elderly.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['sweet'], health_benefit_tags: ['maintain', 'nourish'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '港式咖啡', title_en: 'HK Coffee',
    description_zh: '深焙咖啡粉冲泡，加炼乳和淡奶，茶餐厅独特做法。',
    description_en: 'Dark-roast coffee with condensed milk + evaporated milk, HK style.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['sweet', 'aromatic'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },

  // ── 港式包点 (6) ──
  { title_zh: '菠萝包', title_en: 'Pineapple Bun',
    description_zh: '面包顶部酥菠萝皮烤出格纹，外脆内软，香港茶餐厅经典。',
    description_en: 'Cookie-crust bun with crackled top — HK tea-restaurant classic.',
    origin_cuisine: 'cantonese', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['sweet'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '菠萝油', title_en: 'Pineapple Butter Bun',
    description_zh: '菠萝包剖开夹一片厚冷牛油，热气融化牛油，咸甜交织。',
    description_en: 'Pineapple bun split with cold butter slab — melts on contact.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['sweet', 'rich'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '鸡尾包', title_en: 'Cocktail Bun',
    description_zh: '甜面包内夹椰丝奶油糖馅，表面撒芝麻，香港早餐糕点。',
    description_en: 'Sweet bun with coconut-butter-sugar filling, sesame on top.',
    origin_cuisine: 'cantonese', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['sweet'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '港式蛋挞', title_en: 'HK Egg Tart',
    description_zh: '酥皮或牛油皮蛋挞，蛋液加淡奶烤制，外酥内嫩。',
    description_en: 'Puff-pastry or shortcrust egg tart with milky custard.',
    origin_cuisine: 'cantonese', main_ingredient: 'egg', course_type: 'dessert',
    flavor_tags: ['sweet', 'rich'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '粢饭', title_en: 'Glutinous Rice Roll',
    description_zh: '糯米饭团包油条、肉松、咸菜，上海/港式街边早餐。',
    description_en: 'Sticky rice roll with youtiao, pork floss, pickle — HK / Shanghai street.',
    origin_cuisine: 'cantonese', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['savory', 'salty'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '火腿通心粉', title_en: 'Ham Macaroni Soup',
    description_zh: '通心粉煮熟过冷水，加火腿片和清汤，茶餐厅早餐主食。',
    description_en: 'Macaroni in clear soup with sliced ham — tea-restaurant breakfast staple.',
    origin_cuisine: 'cantonese', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['savory'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },

  // ── 奶制品 (4) ──
  { title_zh: '牛奶', title_en: 'Milk',
    description_zh: '纯牛奶或低脂奶 200-300ml，最方便的钙和蛋白来源。',
    description_en: 'Plain or low-fat milk 200-300ml — easy calcium + protein.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['light', 'sweet'], health_benefit_tags: ['high_protein', 'maintain', 'nourish'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '酸奶', title_en: 'Yogurt',
    description_zh: '原味或低糖酸奶 150g，富含益生菌，调节肠道。',
    description_en: 'Plain or low-sugar yogurt 150g — probiotic-rich.',
    origin_cuisine: 'cantonese', main_ingredient: 'dairy', course_type: 'staple',
    flavor_tags: ['sweet', 'sour'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '杏仁露', title_en: 'Almond Drink',
    description_zh: '甜杏仁磨浆煮成乳白色饮品，润肺止咳。',
    description_en: 'Sweet almond ground to creamy beverage — lung-moistening.',
    origin_cuisine: 'cantonese', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['sweet', 'aromatic'], health_benefit_tags: ['nourish', 'maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '燕麦奶', title_en: 'Oat Milk',
    description_zh: '燕麦熬煮过滤的植物奶，乳糖不耐 / 素食者的牛奶替代。',
    description_en: 'Oat-based plant milk — lactose-free alternative.',
    origin_cuisine: 'cantonese', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['light', 'sweet'], health_benefit_tags: ['maintain', 'low_sugar'],
    is_vegan: true, execution_level: 1 },

  // ── 凉拌时蔬 (4) ──
  { title_zh: '凉拌黄瓜', title_en: 'Cucumber Salad',
    description_zh: '黄瓜拍碎切段，蒜末 + 生抽 + 醋 + 香油拌匀。',
    description_en: 'Smashed cucumber with garlic, soy, vinegar, sesame oil.',
    origin_cuisine: 'northern', main_ingredient: 'cucumber', course_type: 'veggie_dish',
    flavor_tags: ['light', 'aromatic'], health_benefit_tags: ['detox', 'damp_clear'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '凉拌海带丝', title_en: 'Seaweed Salad',
    description_zh: '海带丝焯水沥干，加醋、蒜末、辣椒油、生抽拌匀。',
    description_en: 'Blanched kelp shreds with vinegar, garlic, chili oil, soy.',
    origin_cuisine: 'northern', main_ingredient: 'seafood', course_type: 'veggie_dish',
    flavor_tags: ['sour', 'savory'], health_benefit_tags: ['detox', 'low_sodium'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '凉拌三丝', title_en: 'Three-shred Salad',
    description_zh: '海带丝 + 胡萝卜丝 + 豆腐皮丝焯水拌匀，醋香蒜香。',
    description_en: 'Kelp + carrot + tofu skin shreds, blanched and dressed with vinegar.',
    origin_cuisine: 'northern', main_ingredient: 'veggie', course_type: 'veggie_dish',
    flavor_tags: ['sour', 'light'], health_benefit_tags: ['detox', 'maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '拌芹菜花生', title_en: 'Celery Peanut Salad',
    description_zh: '芹菜切段焯水，配煮花生米，加香醋、盐拌匀，开胃。',
    description_en: 'Blanched celery with boiled peanuts, vinegar and salt — appetizer.',
    origin_cuisine: 'northern', main_ingredient: 'veggie', course_type: 'veggie_dish',
    flavor_tags: ['light', 'sour'], health_benefit_tags: ['detox', 'maintain'],
    is_vegan: true, execution_level: 1 },

  // ── 豆制品 / 肉 (4) ──
  { title_zh: '五香卤豆干', title_en: 'Spiced Soy-braised Tofu',
    description_zh: '豆干用八角桂皮酱油卤制 30 分钟，咸香入味。',
    description_en: 'Tofu braised in 5-spice soy sauce 30 min — savory protein.',
    origin_cuisine: 'jiangnan', main_ingredient: 'soy', course_type: 'veggie_dish',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '凉拌千张丝', title_en: 'Tofu Skin Salad',
    description_zh: '千张切丝焯水，加香菜、蒜末、芝麻油拌匀，植物蛋白早餐。',
    description_en: 'Shredded tofu skin blanched, dressed with cilantro, garlic, sesame oil.',
    origin_cuisine: 'jiangnan', main_ingredient: 'soy', course_type: 'veggie_dish',
    flavor_tags: ['savory', 'light'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '酱牛肉', title_en: 'Soy-braised Beef',
    description_zh: '牛腱子卤煮 2 小时，切薄片，配粥或夹馒头都行。',
    description_en: 'Beef shank braised 2h, sliced thin — for porridge or in buns.',
    origin_cuisine: 'northern', main_ingredient: 'beef', course_type: 'main_protein',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein', 'muscle_gain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '肉松', title_en: 'Pork Floss',
    description_zh: '猪肉煮烂后炒成松绒状，咸香 + 储存方便，配白粥经典。',
    description_en: 'Slow-cooked pork shredded and dried — classic porridge topping.',
    origin_cuisine: 'jiangnan', main_ingredient: 'pork', course_type: 'main_protein',
    flavor_tags: ['savory', 'sweet'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
];

(async () => {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let inserted = 0, skipped = 0;
  for (const s of SEEDS) {
    const exists = await db.query(`SELECT 1 FROM dishes WHERE title_zh = $1 LIMIT 1`, [s.title_zh]);
    if (exists.rows.length > 0) {
      console.log(`  ⏭  ${s.title_zh} (already in DB)`);
      skipped++;
      continue;
    }
    await db.query(`
      INSERT INTO dishes(
        title_zh, title_en, description_zh, description_en,
        meal_type, origin_cuisine, main_ingredient, course_type,
        flavor_tags, health_benefit_tags,
        seasonal_tag, is_vegan, execution_level
      ) VALUES ($1,$2,$3,$4,'breakfast',$5,$6,$7,$8,$9,'All-Season/Balanced',$10,$11)
    `, [
      s.title_zh, s.title_en, s.description_zh, s.description_en,
      s.origin_cuisine, s.main_ingredient, s.course_type,
      s.flavor_tags, s.health_benefit_tags,
      s.is_vegan, s.execution_level,
    ]);
    console.log(`  ✅ ${s.title_zh} (${s.origin_cuisine} / ${s.main_ingredient})`);
    inserted++;
  }
  console.log(`\n📊 Done: ${inserted} inserted · ${skipped} skipped`);
  await db.end();
})();
