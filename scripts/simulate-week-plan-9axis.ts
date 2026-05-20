/**
 * simulate-week-plan-9axis.ts — v43 9-axis 综合 e2e simulation (TICKET-055 §C)
 *
 * 4 user profile × 4 date 场景的笛卡尔积（共 16 组合，输出聚焦到 4 代表
 * 性子集）跑模拟 explainScore breakdown，验证：
 *   - 孕妇 → axis 29 special_health is_prenatal_friendly +0.50 命中
 *   - 哺乳妈妈 → axis 29 special_health is_lactation_friendly +0.50 命中
 *   - 老人 → axis 29 special_health is_elderly_friendly +0.50 命中
 *   - 普通双职工 → 9 基础轴正常工作
 *   - 立夏日 → axis 19 solar_term + axis 28 seasonal_ingredient 命中
 *   - 中秋 ±2 日 → axis 27 festival +0.40 命中
 *   - 普通工作日 → 无 festival 加分，仅基础 axis
 *   - 周末 → dayIndex 5/6 by todayDayIndex (但 generateWeekPlan skip 周末，
 *     这里仅验证 explainScore 在 weekend dayIndex 也能工作不报错)
 *
 * dry-run 只 SELECT dishes，不写 DB。
 *
 * 运行：
 *   npx ts-node scripts/simulate-week-plan-9axis.ts
 *
 * 前置：.env 含 DIRECT_DATABASE_URL；dishes 表已有 axis 27 festival_tags
 * 和 axis 29 is_*_friendly 列（migration 037 落地后真命中）；未落地时
 * axis 29 子分支返回 undefined，breakdown 该项 0 不显示。
 *
 * commit 留档作 regression；CI 默认不跑。
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

// ── 镜像 useWeeklyMenu.ts explainScore 同公式（hook 不能 import 进 scripts）──

const ORIGIN_ZH: Record<string, string> = {
  cantonese: '粤菜', sichuan: '川菜', jiangnan: '江南菜', northern: '北方菜',
  japanese_korean: '日韩菜', southeast_asian: '东南亚菜', western: '西餐',
};
const DIETARY_GOAL_ZH: Record<string, string> = {
  muscle_gain: '增肌', lose_weight: '减脂', maintain: '维持',
  prenatal: '孕期营养', lactation: '哺乳期', elderly: '老人养生',
};
const FLAVOR_ZH: Record<string, string> = {
  spicy: '辣', sweet: '甜', light: '清淡', seafood: '海鲜', veggie: '蔬菜',
};
const FESTIVAL_ZH: Record<string, string> = {
  chunjie: '春节', duanwu: '端午', zhongqiu: '中秋', laba: '腊八',
};

const FESTIVALS: Array<{ slug: string; month: number; day: number }> = [
  { slug: 'laba',     month: 1,  day: 17 },
  { slug: 'chunjie',  month: 2,  day: 10 },
  { slug: 'duanwu',   month: 6,  day: 10 },
  { slug: 'zhongqiu', month: 9,  day: 29 },
];

function festivalAt(today: Date): string | null {
  const year = today.getFullYear();
  for (const f of FESTIVALS) {
    for (const y of [year - 1, year, year + 1]) {
      const cand = new Date(y, f.month - 1, f.day);
      if (Math.abs(today.getTime() - cand.getTime()) / 86400000 <= 3) return f.slug;
    }
  }
  return null;
}

// SolarTerm 简化（实测 4 个节气场景）
interface SolarTermMock {
  name_zh: string;
  philosophy_zh: string;
  healthBoostTags: string[];
  healthBonus: number;
}
const SOLAR_TERMS_MOCK: Record<string, SolarTermMock> = {
  立夏: { name_zh: '立夏', philosophy_zh: '初夏养心，清淡为主', healthBoostTags: ['detox', 'damp_clear'], healthBonus: 0.30 },
  秋分: { name_zh: '秋分', philosophy_zh: '润燥养肺', healthBoostTags: ['maintain'], healthBonus: 0.20 },
  立秋: { name_zh: '立秋', philosophy_zh: '收敛防燥', healthBoostTags: ['maintain'], healthBonus: 0.15 },
  冬至: { name_zh: '冬至', philosophy_zh: '温补进补', healthBoostTags: ['muscle_gain', 'maintain'], healthBonus: 0.25 },
};

const INGREDIENT_SEASONALITY: Record<string, string[]> = {
  立夏: ['枇杷', '黄瓜', '番茄', '蚕豆', '樱桃'],
  秋分: ['石榴', '柿子', '大闸蟹', '山药', '梨', '螃蟹'],
  立秋: ['葡萄', '莲子', '板栗', '南瓜', '龙眼'],
  冬至: ['白菜', '羊肉', '银耳', '桂圆', '糯米', '饺子', '汤圆'],
};

function dishIngredientNames(d: any): string[] {
  const out = new Set<string>();
  if (d.main_ingredient) out.add(d.main_ingredient);
  const prep = d.prep_steps_json as Array<{ ingredient_zh?: string }> | null | undefined;
  if (Array.isArray(prep)) for (const step of prep) if (step?.ingredient_zh) out.add(step.ingredient_zh);
  return Array.from(out);
}

interface UserProfile {
  hometown_cuisine: string | null;
  dietary_goal: string;
  taste_pref: string;
  label: string;
}

interface AxisHit { axis: string; score_delta: number; reason: string }

function explainScore(
  dish: any,
  profile: UserProfile,
  today: Date,
  solarTerm: SolarTermMock | null,
  // §A (TICKET-061) axis 30 入参 — 默认空 / 老用户 → axis 30 不触发
  ctx: { pickedCuisines?: string[]; pickedIngredients?: string[]; learnedSignals?: number } = {},
): { score: number; breakdown: AxisHit[] } {
  const breakdown: AxisHit[] = [];
  let total = 0;
  const flavorTags: string[] = dish.flavor_tags ?? [];
  const healthTags: string[] = dish.health_benefit_tags ?? [];
  const origin: string = dish.origin_cuisine ?? '';
  const mainIng: string = dish.main_ingredient ?? '';
  const pickedCuisines = ctx.pickedCuisines ?? [];
  const pickedIngredients = ctx.pickedIngredients ?? [];
  const learnedSignals = ctx.learnedSignals ?? 999; // default old user

  // hometown
  if (profile.hometown_cuisine && origin === profile.hometown_cuisine) {
    breakdown.push({ axis: 'hometown', score_delta: 0.60, reason: `家乡菜（${ORIGIN_ZH[origin] ?? origin}）` });
    total += 0.60;
  }
  // dietary_goal (基础轴)
  if (profile.dietary_goal && profile.dietary_goal !== 'maintain' && healthTags.includes(profile.dietary_goal)) {
    breakdown.push({ axis: 'dietary_goal', score_delta: 0.35, reason: `符合你的${DIETARY_GOAL_ZH[profile.dietary_goal] ?? profile.dietary_goal}目标` });
    total += 0.35;
  }
  // taste
  if (profile.taste_pref && flavorTags.includes(profile.taste_pref)) {
    breakdown.push({ axis: 'taste', score_delta: 0.25, reason: `口味偏好：${FLAVOR_ZH[profile.taste_pref] ?? profile.taste_pref}` });
    total += 0.25;
  }
  // solar_term
  if (solarTerm && healthTags.some(t => solarTerm.healthBoostTags.includes(t))) {
    breakdown.push({ axis: 'solar_term', score_delta: solarTerm.healthBonus, reason: `${solarTerm.name_zh}：${solarTerm.philosophy_zh}` });
    total += solarTerm.healthBonus;
  }
  // festival
  const fest = festivalAt(today);
  if (fest) {
    const ftags = (dish.festival_tags ?? []) as string[];
    if (Array.isArray(ftags) && ftags.includes(fest)) {
      breakdown.push({ axis: 'festival', score_delta: 0.40, reason: `${FESTIVAL_ZH[fest] ?? fest}节庆推荐` });
      total += 0.40;
    }
  }
  // seasonal_ingredient
  if (solarTerm) {
    const list = INGREDIENT_SEASONALITY[solarTerm.name_zh] ?? [];
    const hits = dishIngredientNames(dish).filter(i => list.includes(i));
    if (hits.length > 0) {
      let delta = hits.length * 0.10;
      if (hits.length >= 3) delta += 0.15;
      if (delta > 0.5) delta = 0.5;
      breakdown.push({ axis: 'seasonal_ingredient', score_delta: delta, reason: `应季食材：${hits.join(' / ')}` });
      total += delta;
    }
  }
  // special_health (axis 29)
  if (profile.dietary_goal === 'prenatal' && dish.is_prenatal_friendly) {
    breakdown.push({ axis: 'special_health', score_delta: 0.50, reason: '孕期推荐菜' });
    total += 0.50;
  }
  if (profile.dietary_goal === 'lactation' && dish.is_lactation_friendly) {
    breakdown.push({ axis: 'special_health', score_delta: 0.50, reason: '哺乳期推荐菜' });
    total += 0.50;
  }
  if (profile.dietary_goal === 'elderly' && dish.is_elderly_friendly) {
    breakdown.push({ axis: 'special_health', score_delta: 0.50, reason: '老人养生推荐菜' });
    total += 0.50;
  }
  // axis 30 cold-start diversity (TICKET-061) — 新用户 < 10 信号触发
  if (learnedSignals < 10) {
    const sameCuisineCount = pickedCuisines.filter(c => c === origin).length;
    const sameIngCount     = pickedIngredients.filter(i => i === mainIng).length;
    if (sameCuisineCount > 0) {
      const delta = -0.20 * sameCuisineCount;
      breakdown.push({ axis: 'axis_30_diversity_cuisine', score_delta: delta, reason: `本周已用 ${ORIGIN_ZH[origin] ?? origin} ${sameCuisineCount} 次（新用户多样性）` });
      total += delta;
    }
    if (sameIngCount > 0) {
      const delta = -0.20 * sameIngCount;
      breakdown.push({ axis: 'axis_30_diversity_ingredient', score_delta: delta, reason: `本周已用主料 ${mainIng} ${sameIngCount} 次（新用户多样性）` });
      total += delta;
    }
  }
  return { score: Number(total.toFixed(3)), breakdown };
}

// ── §A (TICKET-061) Cold-start diversity 5-day pick simulation ──
// 模拟 generateWeekPlan 的核心循环 — 每天 4 slot 顺序选 top-scored dish，
// 把 origin_cuisine 累入 pickedCuisines 让 axis 30 在下一 slot 起作用。
// 周末 (5/6) 跳过, 与 generateWeekPlan 行为一致。
function simulateColdStartWeek(
  dishes: any[],
  profile: UserProfile,
  learnedSignals: number,
  slotsPerDay = 4,
): { picks: any[]; cuisineDist: Record<string, number>; ingDist: Record<string, number> } {
  const picks: any[] = [];
  const usedIds = new Set<string>();
  const pickedCuisines: string[] = [];
  const pickedIngredients: string[] = [];
  for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
    for (let slot = 0; slot < slotsPerDay; slot++) {
      const scored = dishes
        .filter(d => !usedIds.has(d.id))
        .map(d => ({
          dish: d,
          exp: explainScore(d, profile, new Date(2026, 4, 6 + dayIndex), SOLAR_TERMS_MOCK['立夏'], {
            pickedCuisines, pickedIngredients, learnedSignals,
          }),
        }))
        .filter(s => s.exp.score > -2)
        .sort((a, b) => b.exp.score - a.exp.score);
      const top = scored[0];
      if (!top) continue;
      picks.push({ dayIndex, slot, dish: top.dish, score: top.exp.score, breakdown: top.exp.breakdown });
      usedIds.add(top.dish.id);
      pickedCuisines.push(top.dish.origin_cuisine ?? '');
      pickedIngredients.push(top.dish.main_ingredient ?? '');
    }
  }
  const cuisineDist: Record<string, number> = {};
  const ingDist: Record<string, number> = {};
  for (const c of pickedCuisines) cuisineDist[c || '(无)'] = (cuisineDist[c || '(无)'] ?? 0) + 1;
  for (const i of pickedIngredients) ingDist[i || '(无)'] = (ingDist[i || '(无)'] ?? 0) + 1;
  return { picks, cuisineDist, ingDist };
}

const COLD_START_USERS: UserProfile[] = [
  { label: '完全新用户（无 profile）',           hometown_cuisine: null,       dietary_goal: 'maintain',    taste_pref: ''      },
  { label: '增肌新用户（无家乡）',                hometown_cuisine: null,       dietary_goal: 'muscle_gain', taste_pref: ''      },
  { label: '江南新用户（仅家乡）',                hometown_cuisine: 'jiangnan', dietary_goal: 'maintain',    taste_pref: ''      },
  { label: '孕期新用户（仅 prenatal）',           hometown_cuisine: null,       dietary_goal: 'prenatal',    taste_pref: ''      },
];

const USERS: UserProfile[] = [
  { label: '孕妇（江南家乡 + 营养目标）',     hometown_cuisine: 'jiangnan',  dietary_goal: 'prenatal',  taste_pref: 'light'  },
  { label: '哺乳妈妈（粤菜家乡 + 催乳）',     hometown_cuisine: 'cantonese', dietary_goal: 'lactation', taste_pref: 'light'  },
  { label: '老人（北方家乡 + 养生）',         hometown_cuisine: 'northern',  dietary_goal: 'elderly',   taste_pref: 'light'  },
  { label: '普通双职工（川菜家乡 + 增肌）',   hometown_cuisine: 'sichuan',   dietary_goal: 'muscle_gain', taste_pref: 'spicy' },
];

const DATES: Array<{ label: string; today: Date; solarTermZh: string | null }> = [
  { label: '立夏 (2026-05-06)',          today: new Date(2026, 4, 6),  solarTermZh: '立夏' },
  { label: '中秋 ±2 (2026-09-30)',       today: new Date(2026, 8, 30), solarTermZh: '秋分' },
  { label: '普通工作日 (2026-08-15)',     today: new Date(2026, 7, 15), solarTermZh: '立秋' },
  { label: '冬至 (2026-12-22)',          today: new Date(2026, 11, 22), solarTermZh: '冬至' },
];

async function main() {
  const conn = process.env.DIRECT_DATABASE_URL;
  if (!conn) { console.error('BLOCKER: DIRECT_DATABASE_URL 未设置'); process.exit(1); }

  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();

  try {
    const { rows: dishes } = await c.query<any>(
      `SELECT id, title_zh, origin_cuisine, flavor_tags, health_benefit_tags,
              main_ingredient, prep_steps_json, festival_tags,
              is_prenatal_friendly, is_lactation_friendly, is_elderly_friendly
       FROM dishes
       WHERE title_zh IS NOT NULL AND meal_type IN ('lunch','dinner','all')
       LIMIT 500`
    );
    console.log(`\n=== v43 9-axis simulation (DB ${dishes.length} 道菜) ===\n`);

    // 聚焦 4 代表场景（user × date 笛卡尔 16 个，输出最有代表性的 4）
    const scenarios = [
      { user: USERS[0], date: DATES[0] },  // 孕妇 × 立夏
      { user: USERS[1], date: DATES[1] },  // 哺乳 × 中秋
      { user: USERS[2], date: DATES[3] },  // 老人 × 冬至
      { user: USERS[3], date: DATES[2] },  // 双职工 × 普通工作日
    ];

    for (const sc of scenarios) {
      console.log(`\n──── ${sc.user.label} × ${sc.date.label} ────`);
      const sterm = sc.date.solarTermZh ? SOLAR_TERMS_MOCK[sc.date.solarTermZh] : null;
      const fest = festivalAt(sc.date.today);
      console.log(`  festival = ${fest ?? '(none)'} | solarTerm = ${sterm?.name_zh ?? '(none)'} | profile.goal = ${sc.user.dietary_goal}`);

      const scored = dishes
        .map((d: any) => ({ dish: d, exp: explainScore(d, sc.user, sc.date.today, sterm) }))
        .filter((s: any) => s.exp.score > 0)
        .sort((a: any, b: any) => b.exp.score - a.exp.score)
        .slice(0, 5);

      if (scored.length === 0) {
        console.log('  → 无任何菜命中（数据稀疏）');
      } else {
        scored.forEach((s: any, i: number) => {
          console.log(`  ${i + 1}. ${s.exp.score.toFixed(2).padStart(5)} ${s.dish.title_zh}`);
          for (const hit of s.exp.breakdown) {
            console.log(`     · ${hit.axis.padEnd(20)} +${hit.score_delta.toFixed(2)} — ${hit.reason}`);
          }
        });
      }
    }

    console.log('\n✅ 9-axis simulation 完成');

    // ═══════════════════════════════════════════════════════════════════════
    // §A (TICKET-061) — axis 30 cold-start 5-day diversity simulation
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n\n=== axis 30 cold-start diversity simulation (5 day × 4 slot) ===`);
    for (const u of COLD_START_USERS) {
      console.log(`\n──── ${u.label} | goal=${u.dietary_goal} | hometown=${u.hometown_cuisine ?? '(null)'} ────`);
      const res = simulateColdStartWeek(dishes, u, 0, 4);   // learnedSignals=0 → 新用户
      // cuisine distribution
      const cuisineCount = Object.keys(res.cuisineDist).filter(k => k !== '(无)').length;
      const totalPicks = res.picks.length;
      console.log(`  picks=${totalPicks} | distinct_cuisines=${cuisineCount} (target ≥ 4)`);
      console.log(`  cuisine distribution:`, JSON.stringify(res.cuisineDist));
      console.log(`  ingredient distribution top 5:`, JSON.stringify(
        Object.entries(res.ingDist).sort((a, b) => b[1] - a[1]).slice(0, 5)
      ));
      // 验证 ≥ 4 cuisines
      console.log(`  ${cuisineCount >= 4 ? '✓ PASS' : '✗ FAIL'} — distinct_cuisines ${cuisineCount} >= 4`);
      // axis 30 命中次数
      const axis30Hits = res.picks.reduce((acc, p) => acc + p.breakdown.filter((b: AxisHit) => b.axis.startsWith('axis_30_')).length, 0);
      console.log(`  axis 30 命中: ${axis30Hits} 处 breakdown 记录`);
    }

    // baseline: 同样 4 个 profile 但 learnedSignals=30（老用户）→ axis 30 必为 0
    console.log(`\n──── BASELINE: 老用户 (learnedSignals=30) → axis 30 应全 0 ────`);
    const baselineRes = simulateColdStartWeek(dishes, COLD_START_USERS[0], 30, 4);
    const baselineAxis30 = baselineRes.picks.reduce((acc, p) => acc + p.breakdown.filter((b: AxisHit) => b.axis.startsWith('axis_30_')).length, 0);
    console.log(`  老用户 axis 30 命中数: ${baselineAxis30} (期望 0)`);
    console.log(`  ${baselineAxis30 === 0 ? '✓ PASS' : '✗ FAIL'} — 老用户 axis 30 退出`);

    console.log('\n✅ axis 30 cold-start simulation 完成');
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
