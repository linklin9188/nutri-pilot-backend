/**
 * test-festival-seasonality-combo.ts — axis 27 节庆 × axis 28 单食材应季
 * 协同调试 dry-run (TICKET-20260520-046 §C).
 *
 * 4 场景:
 *   1. 中秋 ±3 日（festival=zhongqiu, solarTerm 秋分前后）
 *   2. 立夏（solarTerm 立夏，无 active festival）
 *   3. 非节庆非节气日（festival=null, solarTerm 平日如 立秋后第 10 天，
 *      公历当月任意一天 mock）
 *   4. 端午 + 应季食材（festival=duanwu, solarTerm 芒种/夏至，dish 含
 *      杨梅/桃/苦瓜 命中 axis 28）
 *
 * 每场景跑模拟 scoreForWeek 关键 axis (27 + 28 + 19) 的分数计算（不调
 * useWeeklyMenu hook 主路径，纯 SQL + 镜像逻辑），输出 top-5 dish + axis
 * 加分细节。
 *
 * 这是 dry-run 不污染 DB（仅 SELECT dishes，无 INSERT / UPDATE / DELETE）。
 *
 * 运行：
 *   npx ts-node scripts/test-festival-seasonality-combo.ts
 *
 * 前置：.env 含 DIRECT_DATABASE_URL；dishes 表至少几道菜带 festival_tags
 *      或 含应季食材（端午粽子 / 中秋月饼 / 立夏豆类 等）；prep_steps_json
 *      不强求（缺则 axis 28 只看 main_ingredient）。
 *
 * commit 进 scripts/ 留档作 regression suite；CI 默认不跑。
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

// ── 镜像 useWeeklyMenu.ts (复用同公式，因 hook 不能 import 进 scripts) ──

// FESTIVALS table 镜像 (TICKET-025 §A getCurrentFestival)
const FESTIVALS: Array<{ slug: string; month: number; day: number }> = [
  { slug: 'laba',      month: 1,  day: 17 },
  { slug: 'chunjie',   month: 2,  day: 10 },
  { slug: 'yuanxiao',  month: 2,  day: 24 },
  { slug: 'duanwu',    month: 6,  day: 10 },
  { slug: 'qixi',      month: 8,  day: 29 },
  { slug: 'zhongqiu',  month: 9,  day: 29 },
  { slug: 'chongyang', month: 10, day: 29 },
];

function festivalAt(today: Date): string | null {
  const year = today.getFullYear();
  const todayMs = today.getTime();
  for (const f of FESTIVALS) {
    for (const y of [year - 1, year, year + 1]) {
      const cand = new Date(y, f.month - 1, f.day);
      const diff = Math.abs(todayMs - cand.getTime()) / 86400000;
      if (diff <= 3) return f.slug;
    }
  }
  return null;
}

// SolarTerm name_zh 简化镜像（mock 4 节气供场景使用）
const MOCK_SOLAR_TERMS: Record<string, string> = {
  立夏: '立夏', 芒种: '芒种', 夏至: '夏至', 秋分: '秋分', 立秋: '立秋',
};

// INGREDIENT_SEASONALITY 镜像 (TICKET-043 §B)
const INGREDIENT_SEASONALITY: Record<string, string[]> = {
  '立夏': ['枇杷', '黄瓜', '番茄', '蚕豆'],
  '芒种': ['杨梅', '桃', '苦瓜', '丝瓜'],
  '夏至': ['西瓜', '桃', '苦瓜', '冬瓜'],
  '秋分': ['石榴', '柿子', '大闸蟹', '山药', '梨'],
  '立秋': ['葡萄', '莲子', '板栗', '南瓜'],
};

function dishIngredientNames(dish: any): string[] {
  const out = new Set<string>();
  if (dish.main_ingredient) out.add(dish.main_ingredient);
  const prep = dish.prep_steps_json as Array<{ ingredient_zh?: string }> | null | undefined;
  if (Array.isArray(prep)) {
    for (const step of prep) {
      if (step?.ingredient_zh) out.add(step.ingredient_zh);
    }
  }
  return Array.from(out);
}

// ── 场景 ────────────────────────────────────────────────────────────────
interface Scenario {
  name: string;
  today: Date;
  solarTermNameZh: string | null;   // 模拟 solarTerm.name_zh 用于 axis 28
}

function scenarios(): Scenario[] {
  // 用固定 year=2026 + 公历日期模拟（避免运行时漂移）
  return [
    { name: '中秋 ±3 日 (2026-09-29)',                today: new Date(2026, 8, 29), solarTermNameZh: '秋分' },
    { name: '立夏 (2026-05-05) 无 festival',          today: new Date(2026, 4,  5), solarTermNameZh: '立夏' },
    { name: '平日 (2026-08-10) 立秋后第 3 日',         today: new Date(2026, 7, 10), solarTermNameZh: '立秋' },
    { name: '端午 + 应季食材 (2026-06-10 芒种期)',     today: new Date(2026, 5, 10), solarTermNameZh: '芒种' },
  ];
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const conn = process.env.DIRECT_DATABASE_URL;
  if (!conn) {
    console.error('BLOCKER: DIRECT_DATABASE_URL 未设置');
    process.exit(1);
  }

  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();

  try {
    const { rows: dishes } = await c.query<any>(
      `SELECT id, title_zh, main_ingredient, prep_steps_json, festival_tags, seasonal_tag
       FROM dishes
       WHERE title_zh IS NOT NULL AND meal_type IN ('lunch','dinner','all')
       LIMIT 500`
    );
    console.log(`\n=== axis 27 节庆 × axis 28 单食材应季 dry-run (DB ${dishes.length} 道菜) ===\n`);

    for (const sc of scenarios()) {
      console.log(`\n──── 场景: ${sc.name} ────`);
      const fest = festivalAt(sc.today);
      const seasonalList = sc.solarTermNameZh ? INGREDIENT_SEASONALITY[sc.solarTermNameZh] ?? [] : [];
      console.log(`  active festival = ${fest ?? '(none)'} | solarTerm = ${sc.solarTermNameZh ?? '(none)'}`);
      console.log(`  axis 28 应季食材列表 = [${seasonalList.join('/')}]`);

      const scored = dishes.map((d: any) => {
        const ings = dishIngredientNames(d);
        // axis 27
        const ftags = (d.festival_tags ?? []) as string[];
        const ax27 = fest && Array.isArray(ftags) && ftags.includes(fest) ? 0.4 : 0;
        // axis 28
        let ax28Hits = 0;
        for (const ing of ings) if (seasonalList.includes(ing)) ax28Hits++;
        const ax28 = ax28Hits * 0.10;
        return { dish: d, ax27, ax28, ax28Hits, ingHit: ings.filter(i => seasonalList.includes(i)) };
      })
      .filter(s => s.ax27 + s.ax28 > 0)
      .sort((a: any, b: any) => (b.ax27 + b.ax28) - (a.ax27 + a.ax28))
      .slice(0, 5);

      if (scored.length === 0) {
        console.log('  → 无 axis 27 / 28 命中 dish（数据稀疏 / DB festival_tags 未填）');
      } else {
        console.log('  → top-5 命中:');
        for (const s of scored) {
          const fTagsList = ((s.dish.festival_tags ?? []) as string[]).join(',') || '-';
          console.log(`    ${(s.ax27 + s.ax28).toFixed(2).padStart(5)} = ax27 ${s.ax27.toFixed(2)} + ax28 ${s.ax28.toFixed(2)} (hits=${s.ax28Hits} ings=[${s.ingHit.join('/')}]) ${s.dish.title_zh} [fest=${fTagsList}]`);
        }
      }
    }

    console.log('\n✅ dry-run 完成');
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
