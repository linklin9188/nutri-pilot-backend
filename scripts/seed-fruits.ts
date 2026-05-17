/**
 * seed-fruits.ts — insert 15 时令水果作为"餐后水果"slot 的候选。
 *
 * 后续 useRecommendDishes 会单独查 course_type='fruit' 池（不走 cuisine
 * filter），在午餐/晚餐 template 之外追加一份。
 *
 * Idempotent：检查 title_zh 是否已存在，已存在跳过。
 */
import { Client } from 'pg';

const DB_URL = process.env.DIRECT_DATABASE_URL
  ?? 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

interface Fruit {
  title_zh: string;
  title_en: string;
  description_zh: string;
  seasonal_tag: 'spring' | 'summer' | 'autumn' | 'winter' | 'all-season';
  flavor_tags: string[];
  health_benefit_tags: string[];
  kcal: number;
  emoji: string;
}

const FRUITS: Fruit[] = [
  // 全年
  { title_zh: '苹果', title_en: 'Apple', description_zh: '一颗温和的家常水果，皮带果香。', seasonal_tag: 'all-season', flavor_tags: ['light','sweet'], health_benefit_tags: ['maintain'], kcal: 52, emoji: '🍎' },
  { title_zh: '香蕉', title_en: 'Banana', description_zh: '软糯易消化，补钾抗疲。', seasonal_tag: 'all-season', flavor_tags: ['sweet'], health_benefit_tags: ['maintain'], kcal: 89, emoji: '🍌' },
  { title_zh: '火龙果', title_en: 'Dragon Fruit', description_zh: '清甜多汁，纤维丰富帮助消化。', seasonal_tag: 'all-season', flavor_tags: ['light','sweet'], health_benefit_tags: ['detox'], kcal: 60, emoji: '🐉' },
  // 春
  { title_zh: '草莓', title_en: 'Strawberry', description_zh: '春日酸甜，维 C 丰富。', seasonal_tag: 'spring', flavor_tags: ['sweet','sour'], health_benefit_tags: ['immunity','anti_aging'], kcal: 32, emoji: '🍓' },
  { title_zh: '樱桃', title_en: 'Cherry', description_zh: '初夏当令，补铁润颜。', seasonal_tag: 'spring', flavor_tags: ['sweet','sour'], health_benefit_tags: ['blood_tonic','beauty'], kcal: 63, emoji: '🍒' },
  // 夏
  { title_zh: '西瓜', title_en: 'Watermelon', description_zh: '夏日消暑第一选，清热生津。', seasonal_tag: 'summer', flavor_tags: ['light','sweet'], health_benefit_tags: ['damp_clear','detox'], kcal: 30, emoji: '🍉' },
  { title_zh: '葡萄', title_en: 'Grapes', description_zh: '一串清甜，抗氧化补血。', seasonal_tag: 'summer', flavor_tags: ['sweet'], health_benefit_tags: ['blood_tonic'], kcal: 67, emoji: '🍇' },
  { title_zh: '蓝莓', title_en: 'Blueberries', description_zh: '小巧补脑，护眼抗氧化。', seasonal_tag: 'summer', flavor_tags: ['sweet','sour'], health_benefit_tags: ['anti_aging','eye_care'], kcal: 57, emoji: '🫐' },
  { title_zh: '桃子', title_en: 'Peach', description_zh: '汁水饱满，夏日清香。', seasonal_tag: 'summer', flavor_tags: ['sweet'], health_benefit_tags: ['maintain'], kcal: 39, emoji: '🍑' },
  { title_zh: '芒果', title_en: 'Mango', description_zh: '南国果王，浓郁回甘。', seasonal_tag: 'summer', flavor_tags: ['sweet'], health_benefit_tags: ['maintain'], kcal: 60, emoji: '🥭' },
  { title_zh: '哈密瓜', title_en: 'Hami Melon', description_zh: '脆甜清爽，伏天好物。', seasonal_tag: 'summer', flavor_tags: ['sweet','light'], health_benefit_tags: ['damp_clear'], kcal: 34, emoji: '🍈' },
  // 秋
  { title_zh: '梨', title_en: 'Pear', description_zh: '润燥止咳，秋日最当令。', seasonal_tag: 'autumn', flavor_tags: ['light','sweet'], health_benefit_tags: ['detox','maintain'], kcal: 57, emoji: '🍐' },
  { title_zh: '柚子', title_en: 'Pomelo', description_zh: '酸甜化痰，秋冬一份解腻。', seasonal_tag: 'autumn', flavor_tags: ['sour','light'], health_benefit_tags: ['detox','immunity'], kcal: 38, emoji: '🍋' },
  { title_zh: '猕猴桃', title_en: 'Kiwi', description_zh: '维 C 之王，酸甜爽口。', seasonal_tag: 'autumn', flavor_tags: ['sour','sweet'], health_benefit_tags: ['immunity','maintain'], kcal: 61, emoji: '🥝' },
  // 冬
  { title_zh: '橙子', title_en: 'Orange', description_zh: '冬日维 C 担当，清香解腻。', seasonal_tag: 'winter', flavor_tags: ['light','sour'], health_benefit_tags: ['immunity','maintain'], kcal: 47, emoji: '🍊' },
];

function buildPrepSteps(f: Fruit): unknown {
  return [
    { tray: 'A', ingredient_zh: f.title_zh, ingredient_en: f.title_en, amount_g: 150,
      action_zh: '洗净，去核切块，装盘。', action_en: 'Wash, core if needed, cut into bite-size pieces, plate.' },
  ];
}
function buildCookSteps(f: Fruit): unknown {
  // 餐后水果 — 不需要烹饪，单步装盘即可。
  return [
    { step: 1, action_zh: '直接装盘上桌。', action_en: 'Plate and serve.', duration_min: 1,
      state_target_zh: '盘色诱人即可', state_target_en: 'Pretty arrangement on plate' },
  ];
}

async function main() {
  console.log(`\n🍎 Seed 时令水果  (${FRUITS.length} 道)`);
  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  let inserted = 0;
  let skipped  = 0;
  for (const f of FRUITS) {
    const exists = await pg.query('SELECT id FROM dishes WHERE title_zh = $1 LIMIT 1', [f.title_zh]);
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`   ${f.emoji} ${f.title_zh}  跳过（已存在）`);
      skipped++;
      continue;
    }
    await pg.query(
      `INSERT INTO dishes
       (title_zh, title_en, description_zh, main_ingredient, course_type, meal_type,
        seasonal_tag, flavor_tags, health_benefit_tags, nutrition_kcal_per_serving,
        oil_level, salt_level, sugar_level, cook_method, cook_time_min,
        prep_steps_json, cook_steps_json, is_vegan, source)
       VALUES
       ($1,$2,$3,'fruit','fruit','all',
        $4,$5,$6,$7,
        'low','low','mid','raw',1,
        $8::jsonb,$9::jsonb,true,'curated_fruit')`,
      [
        f.title_zh, f.title_en, f.description_zh,
        f.seasonal_tag, f.flavor_tags, f.health_benefit_tags, f.kcal,
        JSON.stringify(buildPrepSteps(f)), JSON.stringify(buildCookSteps(f)),
      ]
    );
    console.log(`   ${f.emoji} ${f.title_zh}  inserted`);
    inserted++;
  }
  await pg.end();
  console.log(`\n✅ Done — inserted ${inserted}, skipped ${skipped}`);
}
main().catch(e => { console.error(e); process.exit(1); });
