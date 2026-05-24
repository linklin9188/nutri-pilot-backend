/**
 * test-recommend-vector.ts — §E 真测脚本
 * 模拟用户选 [红烧牛肉, 麻婆豆腐, 鱼香肉丝] 三道中餐辣菜 → 推荐 top 10.
 * 预期: top 10 应都是中餐辣菜.
 */
import pg from 'pg';
import { config } from 'dotenv';
import { dishToVector, userVectorFromSelectedDishes, recommendDishesByVector } from '../src/lib/recommendVector';
config();

(async () => {
  const c = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // 1. 找到 3 道"代表菜"
  const SAMPLE_TITLES = ['红烧牛', '麻婆豆腐', '鱼香肉丝'];
  const orClause = SAMPLE_TITLES.map((_, i) => `title_zh ILIKE $${i + 1}`).join(' OR ');
  const { rows: selected } = await c.query(`
    SELECT id, title_zh, origin_cuisine, main_ingredient, cook_method, flavor_tags, feature_vector
    FROM dishes
    WHERE ${orClause}
    ORDER BY title_zh
    LIMIT 6
  `, SAMPLE_TITLES.map(t => `%${t}%`));

  console.log('=== 用户选的 3 道代表菜 ===');
  for (const r of selected) {
    console.log(`  ${r.title_zh} | cuisine=${r.origin_cuisine} ing=${r.main_ingredient} method=${r.cook_method} flavor=${JSON.stringify(r.flavor_tags)}`);
  }

  // 2. user vector = 平均
  const userVec = userVectorFromSelectedDishes(
    selected.map((r: any) => r.feature_vector ? r.feature_vector.map((x: any) => parseFloat(String(x))) : dishToVector(r))
  );
  console.log('\n=== userVector (20 维) ===');
  console.log(userVec.map(x => x.toFixed(2)).join(', '));

  // 3. 取全 dishes pool 推荐
  const { rows: allDishes } = await c.query(`
    SELECT id, title_zh, origin_cuisine, main_ingredient, cook_method, flavor_tags, feature_vector,
           protein_g, fat_g, carb_g, nutrition_kcal_per_serving
    FROM dishes
    WHERE feature_vector IS NOT NULL
    AND (meal_type IN ('lunch','dinner','all') OR meal_type IS NULL)
  `);
  // 数值转换
  const norm = allDishes.map((d: any) => ({
    ...d,
    feature_vector: d.feature_vector ? d.feature_vector.map((x: any) => parseFloat(String(x))) : null,
  }));

  console.log(`\n=== 候选 pool ${norm.length} 道 ===`);

  const top10 = recommendDishesByVector(userVec, norm as any[], {
    dietaryGoal: 'general',
    allergens: [],
    count: 10,
    topNAfterSim: 100,
  });

  console.log('\n=== top 10 推荐 ===');
  let chineseCount = 0;
  let spicyCount = 0;
  for (const d of top10) {
    const cuisine = (d as any).origin_cuisine ?? '';
    const tags: string[] = (d as any).flavor_tags ?? [];
    const isChinese = !['western','italian','french','american','japanese','korean','thai','vietnamese','indian'].includes(cuisine);
    const isSpicy = tags.some((t: string) => /spicy|hot/i.test(String(t)));
    if (isChinese) chineseCount++;
    if (isSpicy) spicyCount++;
    console.log(`  ${isChinese?'C':'-'}${isSpicy?'S':'-'} ${d.title_zh} | cuisine=${cuisine} ing=${(d as any).main_ingredient} method=${(d as any).cook_method} flavor=${JSON.stringify(tags)}`);
  }
  console.log(`\n中餐命中率: ${chineseCount}/10 | 辣菜命中率: ${spicyCount}/10`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
