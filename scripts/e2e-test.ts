import pg from 'pg';
import { config } from 'dotenv';
config();

async function main() {
  const db = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  // 1. Dish pool stats
  const { rows: stats } = await db.query(`
    SELECT origin_cuisine, count(*) as n
    FROM dishes GROUP BY origin_cuisine ORDER BY n DESC
  `);
  console.log('=== 菜品库 ===');
  stats.forEach((r: any) => console.log(`  ${r.origin_cuisine || '(null)'}: ${r.n}`));

  const { rows: [{ total }] } = await db.query('SELECT count(*) as total FROM dishes');
  console.log('  总计:', total);

  // 2. Execution level distribution
  const { rows: levels } = await db.query(`
    SELECT execution_level, count(*) as n FROM dishes GROUP BY execution_level ORDER BY execution_level
  `);
  console.log('\n=== 难度分布 ===');
  levels.forEach((r: any) => console.log(`  L${r.execution_level}: ${r.n}`));

  // 3. Sample cantonese dishes
  const { rows: cant } = await db.query(`
    SELECT title_zh, course_type, execution_level, flavor_tags
    FROM dishes WHERE origin_cuisine = 'cantonese'
    ORDER BY random() LIMIT 10
  `);
  console.log('\n=== 随机广东菜样本 ===');
  cant.forEach((r: any) => console.log(`  ${r.title_zh} [${r.course_type}] L${r.execution_level} ${(r.flavor_tags||[]).join(',')}`));

  // 4. Simulate family: 雇主(均衡)+老婆(减脂)+儿童(成长)
  // Hard filter: no seafood (老婆忌口)
  // Spice: 不辣 (儿童)
  // Goals: fat_loss + maintain + growth
  console.log('\n=== 端到端菜单模拟 ===');
  console.log('家庭成员: 我(均衡) + 老婆(减脂,不吃海鲜) + 孩子(成长,不辣)');
  console.log('合并过滤: 无海鲜 + 无辣');
  console.log('目标权重: fat_loss 0.33, maintain 0.33, growth 0.33\n');

  // Pool: no seafood, no spicy, dinner dishes
  const { rows: pool } = await db.query(`
    SELECT id, title_zh, course_type, main_ingredient, flavor_tags, health_benefit_tags, execution_level, origin_cuisine
    FROM dishes
    WHERE (meal_type IN ('lunch','dinner','all') OR meal_type IS NULL)
      AND main_ingredient NOT IN ('seafood','fish','shrimp','crab','squid','scallop','clam','salmon','cod','seabass','hairtail')
      AND NOT (flavor_tags @> ARRAY['spicy']::text[])
    ORDER BY random()
    LIMIT 300
  `);
  console.log(`过滤后池子: ${pool.length} 道菜`);

  // Score each dish
  const GOAL_TAGS: Record<string, string[]> = {
    fat_loss: ['fat_loss','lose_weight'],
    maintain: ['maintain'],
    growth:   ['muscle_gain','maintain'],
  };
  const GOALS = ['fat_loss','maintain','growth'];

  function score(dish: any): number {
    const healthTags: string[] = dish.health_benefit_tags || [];
    let s = 0;
    // Cantonese origin bonus
    if (dish.origin_cuisine === 'cantonese') s += 0.20;
    // Goal scoring (equal weight across 3 members)
    for (const g of GOALS) {
      const tags = GOAL_TAGS[g];
      if (tags.some(t => healthTags.includes(t))) s += 0.30 / GOALS.length;
    }
    // Execution level: prefer L1-2 (菲佣可做)
    const lvl = dish.execution_level ?? 2;
    if (lvl === 1) s += 0.15;
    else if (lvl === 3) s -= 0.20;
    return s;
  }

  // Group by course_type, pick top for each day
  const byCourse: Record<string, any[]> = {};
  for (const d of pool) {
    const c = d.course_type || 'main_protein';
    if (!byCourse[c]) byCourse[c] = [];
    byCourse[c].push({ ...d, _score: score(d) });
  }
  for (const c of Object.keys(byCourse)) {
    byCourse[c].sort((a, b) => b._score - a._score);
  }

  // Generate 7 days x 4 dishes (1 soup + 2 main_protein + 1 veggie)
  const DAYS = ['周一','周二','周三','周四','周五','周六','周日'];
  const used = new Set<string>();

  for (let day = 0; day < 7; day++) {
    const pick = (course: string, n: number) => {
      const candidates = (byCourse[course] || []).filter(d => !used.has(d.id));
      const picked = candidates.slice(0, n);
      picked.forEach(d => used.add(d.id));
      return picked;
    };
    const soups   = pick('soup', 1);
    const mains   = pick('main_protein', 2);
    const veggies = pick('veggie_dish', 1);
    const dishes  = [...soups, ...mains, ...veggies];

    console.log(`${DAYS[day]}:`);
    dishes.forEach(d => console.log(`  ${d.title_zh.padEnd(10)} [${d.course_type}] L${d.execution_level} score:${d._score.toFixed(2)}`));
  }

  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
