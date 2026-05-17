/**
 * algo-e2e-by-hometown.ts — 端到端模拟 6 个家乡 × 3 餐的 top-10 输出，
 * 验证 hometown bonus + origin base + seasonal + 快餐感 damp 是否正确
 * 生效。这是用户早上要测的 6 个家庭场景的快速心检：
 *
 *   1. 四川 + 2 大 + 2 小
 *   2. 广东 + 2 大 + 2 小
 *   3. 山东 + 2 大 + 1 小
 *   4. 河南 + 1 大 + 2 小
 *   5. 北京 + 1 大 + 1 小
 *   6. 浙江 + 2 大 + 2 小
 *
 * 简化版 scoring（不读 user_preference_scores、不算 5D axis）：只用
 * 公开的 schema 字段做：
 *   - origin base (跟用户家乡的关系)
 *   - hometown match +0.60
 *   - seasonal_tag 当季 +0.08
 *   - 快餐感 -0.15 (lunch/dinner only)
 *   - health_score 流行度 +0.10 (新用户)
 *
 * 输出格式：每个家乡的早/午/晚 top 10，标题 + origin + 总分 + 季节标签。
 *
 * 运行：npx ts-node scripts/algo-e2e-by-hometown.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

// ─── Hometown → DB bucket mapping (mirrors lib/hometownBuckets.ts) ──────
const HOMETOWN_TO_BUCKET: Record<string, string> = {
  south:       'cantonese',     // 华南
  east:        'jiangnan',      // 华东
  north:       'northern',      // 华北
  northeast:   'northern',      // 东北
  northwest:   'northern',      // 西北
  southwest:   'sichuan',       // 西南
  central:     'northern',      // 华中 (河南占主)
  hk_macau_tw: 'cantonese',
};

// ─── 6 测试场景 ──────────────────────────────────────────────────────────
const SCENARIOS = [
  { name: '四川 (西南) · 2 大 + 2 小',  region: 'southwest', adults: 2, kids: 2 },
  { name: '广东 (华南) · 2 大 + 2 小',  region: 'south',     adults: 2, kids: 2 },
  { name: '山东 (华北) · 2 大 + 1 小',  region: 'north',     adults: 2, kids: 1 },
  { name: '河南 (华中) · 1 大 + 2 小',  region: 'central',   adults: 1, kids: 2 },
  { name: '北京 (华北) · 1 大 + 1 小',  region: 'north',     adults: 1, kids: 1 },
  { name: '浙江 (华东) · 2 大 + 2 小',  region: 'east',      adults: 2, kids: 2 },
];

// ─── Scoring (mirrors useSupabaseMenu.scoreDish core) ───────────────────
function originBase(origin: string, userBucket: string | null): number {
  if (!origin) return 0;
  if (origin === 'western') return -0.10;
  if (!userBucket) {
    if (['cantonese', 'northern', 'jiangnan', 'sichuan'].includes(origin)) return 0.08;
    if (['japanese_korean', 'southeast_asian'].includes(origin)) return 0.04;
    return 0;
  }
  if (origin === userBucket) return 0;       // 家乡靠 +0.60 给，base 不重复
  if (['cantonese', 'northern', 'jiangnan', 'sichuan'].includes(origin)) return 0.04;
  if (['japanese_korean', 'southeast_asian'].includes(origin)) return 0.04;
  return 0;
}

function currentSeason(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5)  return 'spring';
  if (m >= 6 && m <= 8)  return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

const FAST_FOOD = ['盖饭', '盖浇饭', '便当', '炒饭', '烩饭', '焗饭', '泡饭'];

function score(dish: any, userBucket: string | null, mealTime: '早餐' | '午餐' | '晚餐'): number {
  const origin = (dish.origin_cuisine ?? '') as string;
  let s = originBase(origin, userBucket);

  // 家乡 match
  if (userBucket && origin === userBucket) s += 0.60;

  // 季节
  const tag = ((dish.seasonal_tag ?? '') as string).toLowerCase();
  if (tag && tag === currentSeason()) s += 0.08;

  // 快餐感
  if (mealTime !== '早餐') {
    const title = (dish.title_zh ?? '') as string;
    if (FAST_FOOD.some(k => title.includes(k))) s -= 0.15;
  }

  // 流行度 (first-impression boost approximation)
  const hs = Number(dish.health_score ?? 0);
  s += (hs / 10) * 0.10;
  const kept = Number(dish.times_kept_in_menu ?? 0);
  s += Math.min(kept, 50) / 50 * 0.08;

  return s;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows: dishes } = await c.query<any>(`
    SELECT id, title_zh, origin_cuisine, meal_type, course_type,
           seasonal_tag, health_score, times_kept_in_menu
    FROM dishes
    WHERE title_zh IS NOT NULL AND origin_cuisine IS NOT NULL
  `);

  console.log(`\n=== 算法 e2e 模拟 (DB ${dishes.length} 道菜, ${currentSeason()} 当季) ===\n`);

  for (const scenario of SCENARIOS) {
    const bucket = HOMETOWN_TO_BUCKET[scenario.region];
    console.log(`\n──── ${scenario.name}  →  bucket=${bucket} ────`);

    for (const mealTime of ['早餐', '午餐', '晚餐'] as const) {
      const allowed = mealTime === '早餐' ? ['breakfast']
                    : mealTime === '午餐' ? ['lunch', 'dinner', 'all']
                    : ['dinner', 'all'];
      let pool = dishes.filter(d => allowed.includes(d.meal_type) || d.meal_type == null);
      // 排除 western 给中餐家庭（模拟 cuisineMode='chinese' 过滤）
      pool = pool.filter(d => d.origin_cuisine !== 'western');
      // 排除粥 from lunch/dinner
      if (mealTime !== '早餐') {
        pool = pool.filter(d => !((d.title_zh ?? '').includes('粥') || (d.title_zh ?? '').includes('稀饭')));
      }
      const scored = pool
        .map(d => ({ dish: d, s: score(d, bucket, mealTime) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 8);
      console.log(`\n  ${mealTime} top 8:`);
      scored.forEach((r, i) => {
        const homeMark = bucket && r.dish.origin_cuisine === bucket ? ' ★' : '';
        const ssn      = r.dish.seasonal_tag && r.dish.seasonal_tag.toLowerCase() === currentSeason() ? ` (${r.dish.seasonal_tag})` : '';
        console.log(`    ${i + 1}. [${r.s.toFixed(2)}] ${r.dish.title_zh} <${r.dish.origin_cuisine}>${homeMark}${ssn}`);
      });

      // Sanity: count how many of top 10 are from the user's home bucket
      const all = pool.map(d => ({ dish: d, s: score(d, bucket, mealTime) })).sort((a, b) => b.s - a.s);
      const homeInTop10 = all.slice(0, 10).filter(r => bucket && r.dish.origin_cuisine === bucket).length;
      console.log(`    家乡占比: ${homeInTop10}/10 (${bucket})`);
    }
  }

  await c.end();
  console.log('\n=== done ===\n');
}
main().catch(e => { console.error(e); process.exit(1); });
