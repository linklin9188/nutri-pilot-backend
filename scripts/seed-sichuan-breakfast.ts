/**
 * seed-sichuan-breakfast.ts — backfill 川式早餐到 DB
 *
 * 端到端测试 (scripts/algo-e2e-by-hometown.ts) 暴露了一个数据 gap：
 * DB origin_cuisine='sichuan' AND meal_type='breakfast' = 0 行。
 * 算法层已经做了 pool-aware combo rotation 兜底（universal-safe 通用
 * 早餐顶替），但川人看到的还是 包子+豆浆+茶叶蛋 这类通用 menu，没
 * 川味家乡感。
 *
 * 这个脚本一次性写入 10 道真实川式早餐基础数据。完整 prep_steps /
 * cook_steps / nutrition / 图像 后续走标准 dish-seed pipeline 跑：
 *   1. scripts/gen-dish-steps-claude.ts   (备菜 + 烹饪步骤)
 *   2. scripts/backfill-dish-nutrition.ts (营养字段)
 *   3. scripts/backfill-xiaomei-compat.ts (小美料理机 ABCD tray)
 *   4. scripts/gen-dish-images.ts         (Unsplash 图像)
 *
 * Run:
 *   npx ts-node scripts/seed-sichuan-breakfast.ts          # 实际写入
 *   npx ts-node scripts/seed-sichuan-breakfast.ts --dry    # 只打印
 */

import pg from 'pg';
import { config } from 'dotenv';
config();

const DRY = process.argv.includes('--dry');

interface SichuanBreakfast {
  title_zh: string;
  title_en: string;
  description_zh: string;
  course_type: 'staple' | 'soup' | 'veggie_dish' | 'main_protein' | 'dessert';
  main_ingredient: string;
  flavor_tags: string[];
  health_benefit_tags: string[];
  is_vegan: boolean;
  is_kid_friendly: boolean;
  cook_method:
    | 'stir_fry' | 'steam' | 'boil' | 'stew' | 'pan_fry'
    | 'deep_fry' | 'grill' | 'roast' | 'bake' | 'mix_cold' | 'raw' | 'blanch' | 'braise';
  cook_time_min: number;
  oil_level: 'low' | 'mid' | 'high';
  salt_level: 'low' | 'mid' | 'high';
  sugar_level: 'low' | 'mid' | 'high';
  execution_level: 1 | 2 | 3;
  xiaomei_compatible: boolean;
  cultural_note?: string;
  protein_source?: string[];
  seasonal_tag?: string;
}

const DISHES: SichuanBreakfast[] = [
  {
    title_zh: '红油抄手',
    title_en: 'Sichuan Wontons in Chili Oil',
    description_zh: '川式经典早餐，皮薄馅嫩，红油辣得过瘾',
    course_type: 'staple',
    main_ingredient: 'pork',
    flavor_tags: ['spicy', 'savory', 'aromatic'],
    health_benefit_tags: ['maintain'],
    is_vegan: false, is_kid_friendly: false,
    cook_method: 'boil',  cook_time_min: 25,
    oil_level: 'high', salt_level: 'mid', sugar_level: 'low',
    execution_level: 2, xiaomei_compatible: false,
    protein_source: ['meat'],
    cultural_note: '成都人最爱的清晨一碗，街边小馆开张早八点',
    seasonal_tag: 'All-Season/Balanced',
  },
  {
    title_zh: '担担面',
    title_en: 'Dandan Noodles',
    description_zh: '芝麻酱与红油双层风味，肉臊鲜香开胃',
    course_type: 'staple',
    main_ingredient: 'carb',
    flavor_tags: ['spicy', 'savory', 'umami'],
    health_benefit_tags: ['maintain'],
    is_vegan: false, is_kid_friendly: false,
    cook_method: 'boil', cook_time_min: 20,
    oil_level: 'high', salt_level: 'mid', sugar_level: 'low',
    execution_level: 2, xiaomei_compatible: false,
    protein_source: ['meat'],
    cultural_note: '挑担小贩走街叫卖得名，川渝两地早午皆宜',
    seasonal_tag: 'All-Season/Balanced',
  },
  {
    title_zh: '酸辣粉',
    title_en: 'Sichuan Hot & Sour Noodles',
    description_zh: '红薯粉爽滑，醋香与辣交织，开胃醒神',
    course_type: 'staple',
    main_ingredient: 'carb',
    flavor_tags: ['spicy', 'sour', 'aromatic'],
    health_benefit_tags: ['maintain'],
    is_vegan: true, is_kid_friendly: false,
    cook_method: 'boil', cook_time_min: 15,
    oil_level: 'mid', salt_level: 'mid', sugar_level: 'low',
    execution_level: 1, xiaomei_compatible: false,
    cultural_note: '重庆街头早摊招牌，一碗下肚立刻精神',
    seasonal_tag: 'All-Season/Balanced',
  },
  {
    title_zh: '钟水饺',
    title_en: "Zhong's Sweet & Spicy Dumplings",
    description_zh: '猪肉馅水饺淋甜辣酱油，是成都老字号特色',
    course_type: 'staple',
    main_ingredient: 'pork',
    flavor_tags: ['spicy', 'sweet', 'savory'],
    health_benefit_tags: ['maintain'],
    is_vegan: false, is_kid_friendly: true,
    cook_method: 'boil', cook_time_min: 25,
    oil_level: 'mid', salt_level: 'mid', sugar_level: 'mid',
    execution_level: 2, xiaomei_compatible: false,
    protein_source: ['meat'],
    cultural_note: '成都钟水饺百年老字号，甜辣酱料是灵魂',
    seasonal_tag: 'All-Season/Balanced',
  },
  {
    title_zh: '蛋烘糕',
    title_en: 'Sichuan Egg Pancake',
    description_zh: '小铜锅烤制的鸡蛋糕，外脆内嫩可甜可咸',
    course_type: 'staple',
    main_ingredient: 'egg',
    flavor_tags: ['savory', 'sweet'],
    health_benefit_tags: ['maintain'],
    is_vegan: false, is_kid_friendly: true,
    cook_method: 'pan_fry', cook_time_min: 15,
    oil_level: 'low', salt_level: 'low', sugar_level: 'mid',
    execution_level: 2, xiaomei_compatible: false,
    protein_source: ['egg'],
    cultural_note: '成都街头老式蛋烘糕，配芽菜肉末或红糖白糖',
    seasonal_tag: 'All-Season/Balanced',
  },
  {
    title_zh: '川北凉面',
    title_en: 'Sichuan Cold Noodles',
    description_zh: '过水冷面配红油醋汁，夏季尤其开胃',
    course_type: 'staple',
    main_ingredient: 'carb',
    flavor_tags: ['spicy', 'sour', 'aromatic'],
    health_benefit_tags: ['maintain'],
    is_vegan: true, is_kid_friendly: false,
    cook_method: 'mix_cold', cook_time_min: 20,
    oil_level: 'mid', salt_level: 'mid', sugar_level: 'low',
    execution_level: 1, xiaomei_compatible: false,
    cultural_note: '川北凉面以麻辣鲜香著称，夏日早餐首选',
    seasonal_tag: 'Summer',
  },
  {
    title_zh: '叶儿粑',
    title_en: 'Sichuan Steamed Glutinous Rice Cake',
    description_zh: '糯米皮包甜咸馅，蕉叶清香蒸制',
    course_type: 'staple',
    main_ingredient: 'carb',
    flavor_tags: ['sweet', 'savory'],
    health_benefit_tags: ['maintain'],
    is_vegan: false, is_kid_friendly: true,
    cook_method: 'steam', cook_time_min: 30,
    oil_level: 'low', salt_level: 'low', sugar_level: 'mid',
    execution_level: 2, xiaomei_compatible: false,
    protein_source: ['meat'],
    cultural_note: '川南老川菜，清明前后叶儿粑配早茶',
    seasonal_tag: 'Spring',
  },
  {
    title_zh: '川式燃面',
    title_en: 'Yibin Dry-Tossed Noodles',
    description_zh: '宜宾燃面因油重无汤遇火可燃得名，香辣浓郁',
    course_type: 'staple',
    main_ingredient: 'carb',
    flavor_tags: ['spicy', 'savory', 'aromatic'],
    health_benefit_tags: ['maintain'],
    is_vegan: false, is_kid_friendly: false,
    cook_method: 'boil', cook_time_min: 15,
    oil_level: 'high', salt_level: 'mid', sugar_level: 'low',
    execution_level: 2, xiaomei_compatible: false,
    protein_source: ['meat'],
    cultural_note: '宜宾百年招牌，必配芽菜碎肉末',
    seasonal_tag: 'All-Season/Balanced',
  },
  {
    title_zh: '川式锅盔',
    title_en: 'Sichuan Stuffed Flatbread',
    description_zh: '油酥层叠的烤饼，咸甜两版，外焦内韧',
    course_type: 'staple',
    main_ingredient: 'carb',
    flavor_tags: ['savory', 'aromatic'],
    health_benefit_tags: ['maintain'],
    is_vegan: false, is_kid_friendly: true,
    cook_method: 'bake', cook_time_min: 40,
    oil_level: 'mid', salt_level: 'mid', sugar_level: 'low',
    execution_level: 2, xiaomei_compatible: false,
    protein_source: ['meat'],
    cultural_note: '军屯锅盔是川西早餐街车招牌，咬一口酥脆掉渣',
    seasonal_tag: 'All-Season/Balanced',
  },
  {
    title_zh: '川式豆花饭',
    title_en: 'Sichuan Tofu Pudding with Rice',
    description_zh: '嫩豆花淋红油蘸水，配白米饭家常熨帖',
    course_type: 'staple',
    main_ingredient: 'tofu',
    flavor_tags: ['spicy', 'savory', 'aromatic'],
    health_benefit_tags: ['maintain'],
    is_vegan: true, is_kid_friendly: false,
    cook_method: 'boil', cook_time_min: 25,
    oil_level: 'mid', salt_level: 'mid', sugar_level: 'low',
    execution_level: 1, xiaomei_compatible: false,
    protein_source: ['soy', 'tofu'],
    cultural_note: '川南农家早餐，一碗豆花配蘸水，一碗白米饭',
    seasonal_tag: 'All-Season/Balanced',
  },
];

async function main() {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Seeding ${DISHES.length} sichuan breakfast rows...\n`);

  for (const d of DISHES) {
    // Existing dish? If yes and meal_type ≠ breakfast/all, upgrade it to
    // 'all' so the breakfast pool picks it up. (川渝家常的 红油抄手 /
    // 担担面 / 酸辣粉 早午晚都吃，标 'all' 比 'breakfast' 更准。)
    const { rows } = await c.query<{ id: string; meal_type: string }>(
      `SELECT id, meal_type FROM dishes WHERE title_zh = $1 LIMIT 1`,
      [d.title_zh],
    );
    if (rows.length > 0) {
      const existing = rows[0];
      if (existing.meal_type === 'breakfast' || existing.meal_type === 'all') {
        console.log(`  ⏭  ${d.title_zh} (meal_type=${existing.meal_type}, no change)`);
        continue;
      }
      if (DRY) {
        console.log(`  🔄 [dry] would upgrade ${d.title_zh} meal_type ${existing.meal_type} → all`);
        continue;
      }
      await c.query(
        `UPDATE dishes SET meal_type='all' WHERE id=$1`,
        [existing.id],
      );
      console.log(`  🔄 ${d.title_zh} meal_type ${existing.meal_type} → all`);
      continue;
    }
    if (DRY) {
      console.log(`  📝 [dry] would insert: ${d.title_zh}`);
      continue;
    }

    const { rows: ins } = await c.query<{ id: string }>(
      `INSERT INTO dishes (
         title_zh, title_en, description_zh,
         origin_cuisine, meal_type, course_type, main_ingredient,
         flavor_tags, health_benefit_tags, protein_source,
         is_vegan, is_kid_friendly, cook_method, cook_time_min,
         oil_level, salt_level, sugar_level,
         execution_level, xiaomei_compatible,
         cultural_note, seasonal_tag, source
       ) VALUES (
         $1, $2, $3,
         'sichuan', 'breakfast', $4, $5,
         $6, $7, $8,
         $9, $10, $11, $12,
         $13, $14, $15,
         $16, $17,
         $18, $19, 'seed-sichuan-breakfast-2026-05-18'
       ) RETURNING id`,
      [
        d.title_zh, d.title_en, d.description_zh,
        d.course_type, d.main_ingredient,
        d.flavor_tags, d.health_benefit_tags, d.protein_source ?? null,
        d.is_vegan, d.is_kid_friendly, d.cook_method, d.cook_time_min,
        d.oil_level, d.salt_level, d.sugar_level,
        d.execution_level, d.xiaomei_compatible,
        d.cultural_note ?? null, d.seasonal_tag ?? 'All-Season/Balanced',
      ],
    );
    console.log(`  ✅ ${d.title_zh} (id=${ins[0].id.slice(0, 8)}...)`);
  }

  // Confirm count
  const { rows: cnt } = await c.query<{ count: string }>(
    `SELECT COUNT(*) FROM dishes WHERE origin_cuisine='sichuan' AND meal_type='breakfast'`,
  );
  console.log(`\nFinal sichuan × breakfast count: ${cnt[0].count}`);
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
