/**
 * algo-quality-sim.ts — TICKET-015 5-user A/B simulation harness
 *
 * 老板真测 2026-05-21 注入"红肉重油川菜"profile 但菜单出 白粥/虾饺/煎饼果子 等,
 * 几乎没有红肉重油川菜特征。本 sim 用 5 个对比鲜明的 profile 跑近似
 * generateWeekPlan, 输出每个 profile 的"对应偏好命中率"(red_meat / seafood /
 * veg / high_oil / low_oil / cuisine_match)对比表, 判定算法是否真的把用户偏好
 * 推到菜单上 (≥ 50%) 或没生效 (< 50%)。
 *
 * 镜像 scoreForWeek 的主权重 axis (axis 32-40 imageOnboardingScore 占 75% +
 * axis 1 hometown + axis 2 dietary_goal + axis 3 taste + axis 23 new-user
 * first-impression + axis 30 cold-start diversity), 其他 axis (recency /
 * 节气 / 节庆 / 小美 / 湿度 / 周末加分 等) 对偏好命中率无系统性影响, 忽略。
 *
 * 简化 generateWeekPlan: 5 workdays × 7 slots/day = 35 道菜:
 *   - 早餐 2 slot: staple (meal_type='breakfast') + side
 *   - 午餐 2 slot: staple + 1 main
 *   - 晚餐 3 slot: 2 main + 1 veggie/soup
 * Slot 区分用 course_type, slot 顺序选 top-scored dish, 累 picks 进 axis 30 diversity。
 *
 * 运行: npx tsx scripts/algo-quality-sim.ts
 * 前置: .env 含 DIRECT_DATABASE_URL
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

// ── PROFILES — 5 个对比鲜明的偏好用户 ──────────────────────────────────────
interface ImagePrefs {
  protein_main_class?: string[];
  staple_pref?: string[];
  protein_pref?: string[];
  beef_style?: string[];
  chicken_style?: string[];
  seafood_style?: string[];
  veggie_method?: string[];
  oil_level?: string | null;
  breakfast_cuisine?: string | null;
}
interface Profile {
  name: string;
  hometown: string;
  dietary_goal: string;
  taste_pref: string;
  imagePrefs: ImagePrefs;
}
const PROFILES: Profile[] = [
  { name: 'meatlover',   hometown: 'southwest', dietary_goal: 'muscle_gain', taste_pref: 'spicy',
    imagePrefs: { protein_main_class: ['red'], oil_level: 'high',
                  beef_style: ['stirfry','braise'], staple_pref: ['rice'],
                  protein_pref: ['beef','pork'] } },
  { name: 'pescetarian', hometown: 'east', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['seafood'], oil_level: 'low',
                  seafood_style: ['steam','cold'], staple_pref: ['rice','noodle'] } },
  { name: 'vegan',       hometown: 'jiangnan', dietary_goal: 'lose_weight', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['veg'], oil_level: 'low',
                  veggie_method: ['stirfry','cold','soup'] } },
  { name: 'cantonese',   hometown: 'cantonese', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white','seafood'], oil_level: 'mid',
                  breakfast_cuisine: 'hk' } },
  { name: 'northerner',  hometown: 'north', dietary_goal: 'muscle_gain', taste_pref: 'savory',
    imagePrefs: { protein_main_class: ['red'], staple_pref: ['noodle','bread','bun'],
                  oil_level: 'mid' } },
];

// ── Hometown → DB bucket (镜像 src/lib/hometownBuckets.ts) ────────────────
const HOMETOWN_TO_DB_BUCKETS: Record<string, string[]> = {
  south: ['cantonese'], east: ['jiangnan'], north: ['northern'],
  northeast: ['northern'], northwest: ['northern'], southwest: ['sichuan'],
  central: ['northern'], hk_macau_tw: ['cantonese'],
  cantonese: ['cantonese'], sichuan: ['sichuan'], jiangnan: ['jiangnan'],
  northern: ['northern'],
};
function hometownMatches(userPref: string, origin: string): boolean {
  if (!userPref || !origin) return false;
  if (userPref === origin) return true;
  return (HOMETOWN_TO_DB_BUCKETS[userPref] ?? []).includes(origin);
}

// ── Axis 32-40 imageOnboardingScore (镜像 src/hooks/useWeeklyMenu.ts:307) ─
const PROTEIN_CLASS_UI_TO_DB: Record<string, string> = {
  red_meat: 'red', white_meat: 'white', veggie: 'veg', seafood: 'seafood',
};
const OIL_LEVEL_UI_TO_DB: Record<string, string> = {
  rich: 'high', medium: 'mid', light: 'low',
};
const BEEF_STYLE_UI_TO_DB: Record<string, string[]> = {
  spicy_stirfry: ['stirfry'], steak: ['steak'], stewed: ['stew'],
  braised: ['braise','redbraise'],
};
const SEAFOOD_STYLE_UI_TO_DB: Record<string, string[]> = {
  steamed: ['steam'], braised: ['redbraise'], salted: ['steam','stirfry'],
  blanched: ['steam'],
};
const VEGGIE_METHOD_UI_TO_DB: Record<string, string[]> = {
  stirfry: ['stirfry'], dry_fried: ['drystir'], cold: ['cold'], soup: ['soup'],
};
function _proteinClassOf(mi: string): string {
  if (['beef','pork','lamb'].includes(mi)) return 'red';
  if (['chicken','duck','turkey'].includes(mi)) return 'white';
  if (['fish','shrimp','crab','squid','scallop','clam','oyster','salmon','tuna','cod','seabass','hairtail'].includes(mi)) return 'seafood';
  if (['tofu','egg','soy','mushroom','veggie','vegetable','bean'].includes(mi)) return 'veg';
  return '';
}
function _stapleClassOf(title: string, ct: string): string {
  if (ct !== 'staple') return '';
  if (/(粥|稀饭)/.test(title)) return 'congee';
  if (/(馒头|包)/.test(title)) return 'bun';
  if (/(饼)/.test(title)) return 'bread';
  if (/(面|粉)/.test(title)) return 'noodle';
  if (/(燕麦|杂粮|糙米)/.test(title)) return 'grain';
  if (/(米|饭)/.test(title)) return 'rice';
  return '';
}
function _beefStyleOf(title: string, cook: string): string {
  if (/(小炒|爆炒)/.test(title)) return 'stirfry';
  if (/牛排/.test(title)) return 'steak';
  if (/卤/.test(title)) return 'braise';
  if (/(红烧)/.test(title) || cook === 'red_braise') return 'redbraise';
  if (/(炖|煲)/.test(title) || cook === 'stew') return 'stew';
  if (cook === 'stir_fry') return 'stirfry';
  return '';
}
function _seafoodStyleOf(title: string, cook: string): string {
  if (/(清蒸|蒸)/.test(title) || cook === 'steam') return 'steam';
  if (/红烧/.test(title) || cook === 'red_braise') return 'redbraise';
  if (/凉拌/.test(title)) return 'cold';
  if (/(烤|焗)/.test(title) || cook === 'grill') return 'grill';
  if (/炒/.test(title) || cook === 'stir_fry') return 'stirfry';
  return '';
}
function _veggieMethodOf(title: string, cook: string): string {
  if (/(凉拌|沙拉)/.test(title)) return 'cold';
  if (/(煲|汤)/.test(title) || cook === 'stew') return 'soup';
  if (/干煸/.test(title)) return 'drystir';
  if (/(清蒸|蒸)/.test(title) || cook === 'steam') return 'steam';
  if (/炒/.test(title) || cook === 'stir_fry') return 'stirfry';
  return '';
}
function _breakfastCuisineOf(origin: string): string {
  if (origin === 'western') return 'western';
  if (origin === 'cantonese') return 'hk';
  if (['northern','sichuan','jiangnan','huaiyang','shandong','hunan','anhui','fujian','zhejiang','taiwanese'].includes(origin)) return 'chinese';
  return '';
}

interface AxisBreak { axis: string; delta: number }

function imageOnboardingScore(d: any, p: ImagePrefs, meal: '早餐'|'午餐'|'晚餐', breaks: AxisBreak[]): number {
  let s = 0;
  const mi = (d.main_ingredient ?? '') as string;
  const title = (d.title_zh ?? '') as string;
  const cook = (d.cook_method ?? '') as string;
  const ct = (d.course_type ?? '') as string;
  const origin = (d.origin_cuisine ?? '') as string;
  const psrc = (Array.isArray(d.protein_source) ? d.protein_source : []) as string[];
  if (p.protein_main_class?.length) {
    const pmcDb = (d.protein_main_class ?? '') as string;
    const cls = pmcDb || _proteinClassOf(mi);
    const matchDb = p.protein_main_class.some(ui => (PROTEIN_CLASS_UI_TO_DB[ui] ?? ui) === cls);
    if (cls && matchDb) { s += 0.15; breaks.push({axis:'a32_pmc',delta:0.15}); }
  }
  if (p.staple_pref?.length && ct === 'staple') {
    const sc = _stapleClassOf(title, ct);
    if (sc && p.staple_pref.includes(sc)) { s += 0.08; breaks.push({axis:'a33_staple',delta:0.08}); }
  }
  if (p.protein_pref?.length) {
    if (p.protein_pref.includes(mi)) { s += 0.12; breaks.push({axis:'a34_protein',delta:0.12}); }
    else if (psrc.some(x => p.protein_pref!.includes(x))) { s += 0.06; breaks.push({axis:'a34_protein_src',delta:0.06}); }
  }
  if (p.beef_style?.length && (mi === 'beef' || psrc.includes('beef'))) {
    const bs = _beefStyleOf(title, cook);
    const m = p.beef_style.some(ui => (BEEF_STYLE_UI_TO_DB[ui] ?? [ui]).includes(bs));
    if (bs && m) { s += 0.07; breaks.push({axis:'a35_beef',delta:0.07}); }
  }
  if (p.seafood_style?.length) {
    const pmcDb = (d.protein_main_class ?? '') as string;
    const isSf = pmcDb === 'seafood' || _proteinClassOf(mi) === 'seafood';
    if (isSf) {
      const ss = _seafoodStyleOf(title, cook);
      const m = p.seafood_style.some(ui => (SEAFOOD_STYLE_UI_TO_DB[ui] ?? [ui]).includes(ss));
      if (ss && m) { s += 0.06; breaks.push({axis:'a37_seafood',delta:0.06}); }
    }
  }
  if (p.veggie_method?.length) {
    const vm = _veggieMethodOf(title, cook);
    const m = p.veggie_method.some(ui => (VEGGIE_METHOD_UI_TO_DB[ui] ?? [ui]).includes(vm));
    if (vm && m) { s += 0.08; breaks.push({axis:'a38_veg',delta:0.08}); }
  }
  if (p.oil_level && d.oil_level) {
    const prefsDb = OIL_LEVEL_UI_TO_DB[p.oil_level] ?? p.oil_level;
    if (prefsDb === d.oil_level) { s += 0.07; breaks.push({axis:'a39_oil',delta:0.07}); }
  }
  if (meal === '早餐' && p.breakfast_cuisine) {
    const bc = _breakfastCuisineOf(origin);
    if (bc && bc === p.breakfast_cuisine) { s += 0.05; breaks.push({axis:'a40_bcuisine',delta:0.05}); }
  }
  return s;
}

// ── Full scoreForWeek mirror (compact) ──────────────────────────────────
const FLAVOR_HEALTH_LIGHT = new Set(['light']);

function score(
  d: any, p: Profile, meal: '早餐'|'午餐'|'晚餐', dayIndex: number,
  pickedCuisines: string[], pickedIngredients: string[], breaks: AxisBreak[],
): number {
  let s = 0;
  const flavorTags: string[] = d.flavor_tags ?? [];
  const healthTags: string[] = d.health_benefit_tags ?? [];
  const origin: string = d.origin_cuisine ?? '';
  const ingredient: string = d.main_ingredient ?? 'other';

  // axis 1 hometown +0.05 (v3 decay)
  if (hometownMatches(p.hometown, origin)) { s += 0.05; breaks.push({axis:'a1_hometown',delta:0.05}); }
  // axis 2 dietary_goal +0.15
  if (p.dietary_goal && p.dietary_goal !== 'maintain' && healthTags.includes(p.dietary_goal)) {
    s += 0.15; breaks.push({axis:'a2_goal',delta:0.15});
  } else if (p.dietary_goal === 'maintain' && flavorTags.includes('light')) {
    s += 0.08; breaks.push({axis:'a2_light',delta:0.08});
  }
  // axis 3 taste +0.25
  if (p.taste_pref && flavorTags.includes(p.taste_pref)) { s += 0.25; breaks.push({axis:'a3_taste',delta:0.25}); }

  // axis 7 diversity penalty
  const sameIng = pickedIngredients.filter(i => i === ingredient).length;
  if (sameIng > 0) { const dd = -0.55*sameIng; s += dd; breaks.push({axis:'a7_div_ing',delta:dd}); }
  // axis 30 cold-start diversity (sim 默认新用户 learnedSignals=0 < 10)
  const sameCu = pickedCuisines.filter(c => c === origin).length;
  if (sameCu > 0) { const dd = -0.20*sameCu; s += dd; breaks.push({axis:'a30_div_cu',delta:dd}); }
  if (sameIng > 0) { const dd = -0.20*sameIng; s += dd; breaks.push({axis:'a30_div_ing',delta:dd}); }

  // axis 8 day-of-week
  if (dayIndex === 0 && (d.is_vegan || flavorTags.includes('light'))) { s += 0.10; }

  // axis 23 new-user first-impression — 假设全部 sim 用户 isNewUser=true
  const hometownHit = hometownMatches(p.hometown, origin) ? 1 : 0;
  const goalHit = (p.dietary_goal && healthTags.includes(p.dietary_goal)) ? 1 : 0;
  const tasteHit = (p.taste_pref && flavorTags.includes(p.taste_pref)) ? 1 : 0;
  const pm = (hometownHit + goalHit + tasteHit) * 0.15;
  if (pm > 0) { s += pm; breaks.push({axis:'a23_newuser_match',delta:pm}); }
  const hs = Number(d.health_score ?? 0) / 10 * 0.10;
  s += hs;
  const kept = Math.min(Number(d.times_kept_in_menu ?? 0), 50) / 50 * 0.08;
  s += kept;

  // axis 32-40 (主导 75%)
  s += imageOnboardingScore(d, p.imagePrefs, meal, breaks);

  return s;
}

// ── Slot-aware 5-day pick ────────────────────────────────────────────────
interface PickRecord { dayIndex: number; meal: string; slot: string; dish: any; score: number; breaks: AxisBreak[] }

function pickSlot(pool: any[], used: Set<string>, p: Profile, meal: '早餐'|'午餐'|'晚餐',
                  dayIndex: number, pickedCuisines: string[], pickedIngredients: string[],
                  slotFilter: (d: any) => boolean, slot: string): PickRecord | null {
  const candidates = pool.filter(d => !used.has(d.id) && slotFilter(d));
  if (candidates.length === 0) return null;
  const scored = candidates.map(d => {
    const breaks: AxisBreak[] = [];
    return { d, s: score(d, p, meal, dayIndex, pickedCuisines, pickedIngredients, breaks), breaks };
  }).sort((a,b) => b.s - a.s);
  const top = scored[0];
  used.add(top.d.id);
  pickedCuisines.push(top.d.origin_cuisine ?? '');
  pickedIngredients.push(top.d.main_ingredient ?? '');
  return { dayIndex, meal, slot, dish: top.d, score: top.s, breaks: top.breaks };
}

function simulateWeek(profile: Profile, breakfastPool: any[], lunchDinnerPool: any[]): PickRecord[] {
  const used = new Set<string>();
  const pickedCuisines: string[] = [];
  const pickedIngredients: string[] = [];
  const picks: PickRecord[] = [];
  for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
    // 早餐 2 slot
    const bStaple = pickSlot(breakfastPool, used, profile, '早餐', dayIndex, pickedCuisines, pickedIngredients,
                              (d) => (d.course_type ?? '') === 'staple', 'bf_staple');
    if (bStaple) picks.push(bStaple);
    const bSide = pickSlot(breakfastPool, used, profile, '早餐', dayIndex, pickedCuisines, pickedIngredients,
                            (d) => (d.course_type ?? '') !== 'staple', 'bf_side');
    if (bSide) picks.push(bSide);
    // 午餐 2 slot: staple + main
    const lStaple = pickSlot(lunchDinnerPool, used, profile, '午餐', dayIndex, pickedCuisines, pickedIngredients,
                              (d) => (d.course_type ?? '') === 'staple', 'lu_staple');
    if (lStaple) picks.push(lStaple);
    const lMain = pickSlot(lunchDinnerPool, used, profile, '午餐', dayIndex, pickedCuisines, pickedIngredients,
                            (d) => !['staple','soup','dessert','fruit'].includes(d.course_type ?? ''), 'lu_main');
    if (lMain) picks.push(lMain);
    // 晚餐 3 slot: 2 main + 1 veggie/soup
    const dMain1 = pickSlot(lunchDinnerPool, used, profile, '晚餐', dayIndex, pickedCuisines, pickedIngredients,
                            (d) => !['staple','soup','dessert','fruit','veggie_dish'].includes(d.course_type ?? ''), 'di_main1');
    if (dMain1) picks.push(dMain1);
    const dMain2 = pickSlot(lunchDinnerPool, used, profile, '晚餐', dayIndex, pickedCuisines, pickedIngredients,
                            (d) => !['staple','soup','dessert','fruit'].includes(d.course_type ?? ''), 'di_main2');
    if (dMain2) picks.push(dMain2);
    const dVeg = pickSlot(lunchDinnerPool, used, profile, '晚餐', dayIndex, pickedCuisines, pickedIngredients,
                          (d) => ['veggie_dish','soup'].includes(d.course_type ?? ''), 'di_veg');
    if (dVeg) picks.push(dVeg);
  }
  return picks;
}

// ── Hit rate metrics ─────────────────────────────────────────────────────
function computeMetrics(picks: PickRecord[], profile: Profile) {
  const N = picks.length;
  if (N === 0) return { N: 0, red: 0, seafood: 0, veg: 0, white: 0, high_oil: 0, low_oil: 0, mid_oil: 0, cuisine_match: 0, target_pmc: 0, target_oil: 0, target_cuisine: 0 };
  let red = 0, seafood = 0, veg = 0, white = 0, high_oil = 0, low_oil = 0, mid_oil = 0, cuisine_match = 0;
  for (const pk of picks) {
    const d = pk.dish;
    const pmc = (d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '')) as string;
    if (pmc === 'red') red++;
    if (pmc === 'seafood') seafood++;
    if (pmc === 'veg') veg++;
    if (pmc === 'white') white++;
    if (d.oil_level === 'high') high_oil++;
    if (d.oil_level === 'low') low_oil++;
    if (d.oil_level === 'mid') mid_oil++;
    if (hometownMatches(profile.hometown, d.origin_cuisine ?? '')) cuisine_match++;
  }
  // Target hit rate — 用户偏好的相应 metric
  const wantPmc = profile.imagePrefs.protein_main_class ?? [];
  let target_pmc = 0;
  if (wantPmc.includes('red')) target_pmc += red;
  if (wantPmc.includes('seafood')) target_pmc += seafood;
  if (wantPmc.includes('veg')) target_pmc += veg;
  if (wantPmc.includes('white')) target_pmc += white;
  const wantOil = profile.imagePrefs.oil_level;
  let target_oil = 0;
  if (wantOil === 'high') target_oil = high_oil;
  else if (wantOil === 'low') target_oil = low_oil;
  else if (wantOil === 'mid') target_oil = mid_oil;
  return {
    N, red: red/N, seafood: seafood/N, veg: veg/N, white: white/N,
    high_oil: high_oil/N, low_oil: low_oil/N, mid_oil: mid_oil/N,
    cuisine_match: cuisine_match/N,
    target_pmc: target_pmc/N, target_oil: target_oil/N,
    target_cuisine: cuisine_match/N,
  };
}

function pct(x: number): string { return (x*100).toFixed(0).padStart(3) + '%'; }

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const conn = process.env.DIRECT_DATABASE_URL;
  if (!conn) { console.error('BLOCKER: DIRECT_DATABASE_URL 未设置'); process.exit(1); }
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows: breakfastPool } = await c.query<any>(
      `SELECT id, title_zh, origin_cuisine, flavor_tags, health_benefit_tags,
              main_ingredient, protein_main_class, protein_source, course_type,
              oil_level, cook_method, is_vegan, health_score, times_kept_in_menu, meal_type
       FROM dishes WHERE title_zh IS NOT NULL AND meal_type = 'breakfast' LIMIT 300`
    );
    const { rows: lunchDinnerPool } = await c.query<any>(
      `SELECT id, title_zh, origin_cuisine, flavor_tags, health_benefit_tags,
              main_ingredient, protein_main_class, protein_source, course_type,
              oil_level, cook_method, is_vegan, health_score, times_kept_in_menu, meal_type
       FROM dishes WHERE title_zh IS NOT NULL AND meal_type IN ('lunch','dinner','all') LIMIT 1200`
    );
    console.log(`\n=== algo-quality-sim — TICKET-015 5-user A/B simulation ===`);
    console.log(`pool: breakfast=${breakfastPool.length} | lunch+dinner=${lunchDinnerPool.length}\n`);

    // baseline: 看 DB 整体 protein_main_class / oil_level 分布
    const ldDist = { red:0, seafood:0, veg:0, white:0, high_oil:0, low_oil:0, mid_oil:0 };
    for (const d of lunchDinnerPool) {
      const pmc = (d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '')) as string;
      if (pmc === 'red') ldDist.red++;
      else if (pmc === 'seafood') ldDist.seafood++;
      else if (pmc === 'veg') ldDist.veg++;
      else if (pmc === 'white') ldDist.white++;
      if (d.oil_level === 'high') ldDist.high_oil++;
      else if (d.oil_level === 'low') ldDist.low_oil++;
      else if (d.oil_level === 'mid') ldDist.mid_oil++;
    }
    const N0 = lunchDinnerPool.length;
    console.log(`baseline DB 分布 (lunch+dinner pool):`);
    console.log(`  red=${pct(ldDist.red/N0)}  seafood=${pct(ldDist.seafood/N0)}  veg=${pct(ldDist.veg/N0)}  white=${pct(ldDist.white/N0)}`);
    console.log(`  high_oil=${pct(ldDist.high_oil/N0)}  mid_oil=${pct(ldDist.mid_oil/N0)}  low_oil=${pct(ldDist.low_oil/N0)}\n`);

    // 跑 5 profile
    const results: Array<{profile: Profile; picks: PickRecord[]; m: ReturnType<typeof computeMetrics>}> = [];
    for (const profile of PROFILES) {
      const picks = simulateWeek(profile, breakfastPool, lunchDinnerPool);
      const m = computeMetrics(picks, profile);
      results.push({ profile, picks, m });
    }

    // 输出对比表
    console.log(`【5 profile × 6 metric 命中率对比表 (35 道菜/profile 期望)】\n`);
    console.log(`profile      | N  | red    | seafood| veg    | white  | high_oil| low_oil| mid_oil| cuisine`);
    console.log(`─────────────┼────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────`);
    for (const r of results) {
      console.log(`${r.profile.name.padEnd(12)} | ${String(r.m.N).padStart(2)} | ${pct(r.m.red)}   | ${pct(r.m.seafood)}   | ${pct(r.m.veg)}   | ${pct(r.m.white)}   | ${pct(r.m.high_oil)}   | ${pct(r.m.low_oil)}   | ${pct(r.m.mid_oil)}   | ${pct(r.m.cuisine_match)}`);
    }

    // Target hit rate (用户对应偏好命中)
    console.log(`\n【对应偏好命中率 — 判定算法生效 (target ≥ 50%)】\n`);
    console.log(`profile      | want_pmc                        | hit_pmc | want_oil | hit_oil | want_cuisine        | hit_cuisine | verdict`);
    console.log(`─────────────┼─────────────────────────────────┼─────────┼──────────┼─────────┼─────────────────────┼─────────────┼─────────`);
    for (const r of results) {
      const wantPmc = (r.profile.imagePrefs.protein_main_class ?? []).join('+');
      const wantOil = r.profile.imagePrefs.oil_level ?? '-';
      const cuisineBucket = (HOMETOWN_TO_DB_BUCKETS[r.profile.hometown] ?? []).join('+');
      const verdict = (r.m.target_pmc >= 0.5 && (r.m.target_oil >= 0.4 || wantOil === '-')) ? '✓ PASS' : '✗ FAIL';
      console.log(`${r.profile.name.padEnd(12)} | ${wantPmc.padEnd(31)} | ${pct(r.m.target_pmc)}    | ${wantOil.padEnd(8)} | ${pct(r.m.target_oil)}    | ${cuisineBucket.padEnd(19)} | ${pct(r.m.target_cuisine)}        | ${verdict}`);
    }

    // axis 命中分布 (找谁主导)
    console.log(`\n【axis 命中分布 — 哪个 axis 在驱动最终选菜?】\n`);
    for (const r of results) {
      const axisSum: Record<string, number> = {};
      for (const pk of r.picks) {
        for (const b of pk.breaks) axisSum[b.axis] = (axisSum[b.axis] ?? 0) + b.delta;
      }
      const sorted = Object.entries(axisSum).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
      console.log(`  ${r.profile.name.padEnd(12)}: ${sorted.map(([k,v]) => `${k}=${v.toFixed(2)}`).join('  ')}`);
    }

    // sample dishes — 看每个 profile 真的选出了什么
    console.log(`\n【sample picks — 前 8 道菜的 title + pmc + oil + origin】\n`);
    for (const r of results) {
      console.log(`  ${r.profile.name} (want_pmc=${(r.profile.imagePrefs.protein_main_class ?? []).join(',')}, want_oil=${r.profile.imagePrefs.oil_level}):`);
      for (const pk of r.picks.slice(0, 8)) {
        const d = pk.dish;
        const pmc = d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '');
        console.log(`    [${pk.meal}/${pk.slot.padEnd(9)}] ${(d.title_zh ?? '').padEnd(20)} pmc=${(pmc||'-').padEnd(8)} oil=${(d.oil_level||'-').padEnd(5)} origin=${(d.origin_cuisine||'-').padEnd(12)} score=${pk.score.toFixed(2)}`);
      }
    }

    // 整体 verdict
    const passCount = results.filter(r => r.m.target_pmc >= 0.5).length;
    console.log(`\n【整体 verdict】`);
    console.log(`  ${passCount}/${results.length} profile pmc 命中率 ≥ 50% — ${passCount === results.length ? '算法生效' : '算法部分/完全失效'}`);

    // stability check — 同 profile 跑 3 次, 命中率方差
    console.log(`\n【随机性 / 稳定性检查 — meatlover 跑 3 次】`);
    // 注: sim 无随机源 (sort by score → 确定性), 此处 expected 3 次完全相同
    for (let i = 0; i < 3; i++) {
      const picks = simulateWeek(PROFILES[0], breakfastPool, lunchDinnerPool);
      const m = computeMetrics(picks, PROFILES[0]);
      console.log(`  run ${i+1}: target_pmc=${pct(m.target_pmc)}  target_oil=${pct(m.target_oil)}  target_cuisine=${pct(m.target_cuisine)}`);
    }
  } finally {
    await c.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
