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
  // 原 5 profile 保留 (回归对照)
  { name: '1-meatlover-川菜增肌',     hometown: 'southwest', dietary_goal: 'muscle_gain', taste_pref: 'spicy',
    imagePrefs: { protein_main_class: ['red'], oil_level: 'high',
                  beef_style: ['stirfry','braise'], staple_pref: ['rice'],
                  protein_pref: ['beef','pork'] } },
  { name: '2-pescetarian-江浙清淡',   hometown: 'east', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['seafood'], oil_level: 'low',
                  seafood_style: ['steam','cold'], staple_pref: ['rice','noodle'] } },
  { name: '3-vegan-江浙减脂',         hometown: 'jiangnan', dietary_goal: 'lose_weight', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['veg'], oil_level: 'low',
                  veggie_method: ['stirfry','cold','soup'] } },
  { name: '4-cantonese-港式清淡',     hometown: 'cantonese', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white','seafood'], oil_level: 'mid',
                  breakfast_cuisine: 'hk' } },
  { name: '5-northerner-北方面食',    hometown: 'north', dietary_goal: 'muscle_gain', taste_pref: 'savory',
    imagePrefs: { protein_main_class: ['red'], staple_pref: ['noodle','bread','bun'],
                  oil_level: 'mid' } },
  // ── TICKET-016 §C 扩 20 profile ──────────────────────────────────────────
  // 三口 / 四口
  { name: '6-三口-北方红肉',          hometown: 'north', dietary_goal: 'maintain', taste_pref: 'savory',
    imagePrefs: { protein_main_class: ['red'], oil_level: 'mid', staple_pref: ['noodle','bread'] } },
  { name: '7-三口-港式白肉清淡',      hometown: 'hk_macau_tw', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white'], oil_level: 'low', breakfast_cuisine: 'hk' } },
  { name: '8-三口-粤菜海鲜增肌',      hometown: 'cantonese', dietary_goal: 'muscle_gain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['seafood'], oil_level: 'mid', seafood_style: ['steam','stirfry'] } },
  { name: '9-四口-川菜鸡中等',        hometown: 'southwest', dietary_goal: 'maintain', taste_pref: 'spicy',
    imagePrefs: { protein_main_class: ['white'], oil_level: 'mid', chicken_style: ['braise','stirfry'] } },
  { name: '10-四口-粤菜海鲜哺乳',     hometown: 'cantonese', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['seafood'], oil_level: 'low', seafood_style: ['steam'] } },
  { name: '11-四口-川菜红肉重油',      hometown: 'southwest', dietary_goal: 'maintain', taste_pref: 'spicy',
    imagePrefs: { protein_main_class: ['red'], oil_level: 'high', beef_style: ['stirfry'] } },
  // 多孩 / 三代
  { name: '12-多孩-北方面食',          hometown: 'north', dietary_goal: 'maintain', taste_pref: 'savory',
    imagePrefs: { protein_main_class: ['red','white'], oil_level: 'mid', staple_pref: ['noodle','bun'] } },
  { name: '13-三代-粤菜白肉老人',      hometown: 'cantonese', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white'], oil_level: 'low', breakfast_cuisine: 'hk' } },
  { name: '14-三代-港式白切鸡',        hometown: 'hk_macau_tw', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white'], oil_level: 'mid', chicken_style: ['braise'] } },
  { name: '15-大家庭-红肉重油北方',    hometown: 'north', dietary_goal: 'muscle_gain', taste_pref: 'savory',
    imagePrefs: { protein_main_class: ['red'], oil_level: 'high', beef_style: ['stirfry','braise'] } },
  { name: '16-大家庭-杂粮鸡鸭控糖',    hometown: 'central', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white'], oil_level: 'mid', staple_pref: ['grain'] } },
  // 单亲 / 独居老人
  { name: '17-单亲-江浙海鲜减脂',     hometown: 'east', dietary_goal: 'lose_weight', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['seafood'], oil_level: 'low', seafood_style: ['steam'] } },
  { name: '18-单亲-川菜素重油',        hometown: 'southwest', dietary_goal: 'maintain', taste_pref: 'spicy',
    imagePrefs: { protein_main_class: ['veg'], oil_level: 'high', veggie_method: ['stirfry'] } },
  { name: '19-独居老人-港式海鲜',     hometown: 'hk_macau_tw', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['seafood'], oil_level: 'low', seafood_style: ['steam','soup'] } },
  { name: '20-独居老人-粤菜白肉',     hometown: 'cantonese', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white'], oil_level: 'low', breakfast_cuisine: 'hk' } },
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
    if (cls && matchDb) { s += 0.30; breaks.push({axis:'a32_pmc',delta:0.30}); } // TICKET-016 §D Option α
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
  // axis 30 cold-start diversity — TICKET-016 §A: imagePrefs 任一非空时 early-return
  const ip = p.imagePrefs;
  const hasImagePrefs = !!(ip && (
    (ip.protein_main_class?.length ?? 0) > 0 ||
    (ip.staple_pref?.length ?? 0) > 0 ||
    (ip.protein_pref?.length ?? 0) > 0 ||
    (ip.beef_style?.length ?? 0) > 0 ||
    (ip.chicken_style?.length ?? 0) > 0 ||
    (ip.seafood_style?.length ?? 0) > 0 ||
    (ip.veggie_method?.length ?? 0) > 0 ||
    !!ip.oil_level || !!ip.breakfast_cuisine
  ));
  if (!hasImagePrefs) {
    const sameCu = pickedCuisines.filter(c => c === origin).length;
    if (sameCu > 0) { const dd = -0.20*sameCu; s += dd; breaks.push({axis:'a30_div_cu',delta:dd}); }
    if (sameIng > 0) { const dd = -0.20*sameIng; s += dd; breaks.push({axis:'a30_div_ing',delta:dd}); }
  }

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
  // TICKET-016: main slot 分母 — 只算午餐 main + 晚餐 main1/main2 (不含 staple/side/veg/soup
  // /breakfast). 这才是用户对"主菜偏好"的真实感知; 全 35 道分母含 10 staple 天然非主蛋白。
  const mainPicks = picks.filter(pk => ['lu_main','di_main1','di_main2'].includes(pk.slot));
  const Nm = mainPicks.length;
  if (N === 0) return { N: 0, Nm: 0, red: 0, seafood: 0, veg: 0, white: 0, high_oil: 0, low_oil: 0, mid_oil: 0, cuisine_match: 0,
    target_pmc: 0, target_oil: 0, target_cuisine: 0,
    target_pmc_main: 0, target_oil_main: 0 };
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
  // Main slot 分母独立计算
  let mRed = 0, mSeafood = 0, mVeg = 0, mWhite = 0, mHigh = 0, mLow = 0, mMid = 0;
  for (const pk of mainPicks) {
    const d = pk.dish;
    const pmc = (d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '')) as string;
    if (pmc === 'red') mRed++;
    if (pmc === 'seafood') mSeafood++;
    if (pmc === 'veg') mVeg++;
    if (pmc === 'white') mWhite++;
    if (d.oil_level === 'high') mHigh++;
    if (d.oil_level === 'low') mLow++;
    if (d.oil_level === 'mid') mMid++;
  }
  const wantPmc = profile.imagePrefs.protein_main_class ?? [];
  let target_pmc = 0, target_pmc_main = 0;
  if (wantPmc.includes('red'))     { target_pmc += red;     target_pmc_main += mRed; }
  if (wantPmc.includes('seafood')) { target_pmc += seafood; target_pmc_main += mSeafood; }
  if (wantPmc.includes('veg'))     { target_pmc += veg;     target_pmc_main += mVeg; }
  if (wantPmc.includes('white'))   { target_pmc += white;   target_pmc_main += mWhite; }
  const wantOil = profile.imagePrefs.oil_level;
  let target_oil = 0, target_oil_main = 0;
  if (wantOil === 'high')      { target_oil = high_oil; target_oil_main = mHigh; }
  else if (wantOil === 'low')  { target_oil = low_oil;  target_oil_main = mLow; }
  else if (wantOil === 'mid')  { target_oil = mid_oil;  target_oil_main = mMid; }
  return {
    N, Nm, red: red/N, seafood: seafood/N, veg: veg/N, white: white/N,
    high_oil: high_oil/N, low_oil: low_oil/N, mid_oil: mid_oil/N,
    cuisine_match: cuisine_match/N,
    target_pmc: target_pmc/N, target_oil: target_oil/N,
    target_cuisine: cuisine_match/N,
    target_pmc_main: Nm > 0 ? target_pmc_main/Nm : 0,
    target_oil_main: Nm > 0 ? target_oil_main/Nm : 0,
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
    console.log(`\n=== algo-quality-sim — TICKET-016 20-profile A/B simulation (ALGO_VERSION v51) ===`);
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
    console.log(`【20 profile × 9 metric 命中率对比表 (35 道菜/profile 期望)】\n`);
    console.log(`profile                     | N  | red  | sf   | veg  | wht  | h_oil| l_oil| m_oil| cui`);
    console.log(`────────────────────────────┼────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼─────`);
    for (const r of results) {
      console.log(`${r.profile.name.padEnd(27)} | ${String(r.m.N).padStart(2)} | ${pct(r.m.red)} | ${pct(r.m.seafood)} | ${pct(r.m.veg)} | ${pct(r.m.white)} | ${pct(r.m.high_oil)} | ${pct(r.m.low_oil)} | ${pct(r.m.mid_oil)} | ${pct(r.m.cuisine_match)}`);
    }

    // Target hit rate — TICKET-016 双分母 (all 35 道 + main 15 道) + 70% target
    console.log(`\n【对应偏好命中率 — main slot 分母 (15 道午晚主菜) 才是真实感知】\n`);
    console.log(`profile                     | want_pmc      | pmc/all| pmc/main| want_oil| oil/all| oil/main| cuisine| verdict`);
    console.log(`────────────────────────────┼───────────────┼────────┼─────────┼─────────┼────────┼─────────┼────────┼─────────`);
    for (const r of results) {
      const wantPmc = (r.profile.imagePrefs.protein_main_class ?? []).join('+');
      const wantOil = r.profile.imagePrefs.oil_level ?? '-';
      const pmcMainOk = r.m.target_pmc_main >= 0.70;
      const oilMainOk = wantOil === '-' || r.m.target_oil_main >= 0.60;
      const cuiOk = r.m.target_cuisine >= 0.50;
      const verdict = (pmcMainOk && oilMainOk && cuiOk) ? '✓ PASS'
                    : (pmcMainOk && oilMainOk) ? '~ no cui'
                    : pmcMainOk ? '~ pmc-only'
                    : '✗ FAIL';
      console.log(`${r.profile.name.padEnd(27)} | ${wantPmc.padEnd(13)} | ${pct(r.m.target_pmc)}   | ${pct(r.m.target_pmc_main)}    | ${wantOil.padEnd(7)} | ${pct(r.m.target_oil)}   | ${pct(r.m.target_oil_main)}    | ${pct(r.m.target_cuisine)}   | ${verdict}`);
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

    // sample dishes — 仅看 4 个代表 profile (节省 stdout)
    console.log(`\n【sample picks — 4 代表 profile 前 6 道】\n`);
    const sampleIdx = [0, 2, 4, 14];  // meatlover, vegan, northerner, 大家庭红肉
    for (const i of sampleIdx) {
      const r = results[i];
      console.log(`  ${r.profile.name} (want_pmc=${(r.profile.imagePrefs.protein_main_class ?? []).join(',')}, want_oil=${r.profile.imagePrefs.oil_level}):`);
      for (const pk of r.picks.slice(0, 6)) {
        const d = pk.dish;
        const pmc = d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '');
        console.log(`    [${pk.meal}/${pk.slot.padEnd(9)}] ${(d.title_zh ?? '').padEnd(20)} pmc=${(pmc||'-').padEnd(8)} oil=${(d.oil_level||'-').padEnd(5)} origin=${(d.origin_cuisine||'-').padEnd(12)} score=${pk.score.toFixed(2)}`);
      }
    }

    // 多样性 + profile 间差异 — TICKET-016 §C 新指标
    console.log(`\n【菜单多样性 — unique cuisine + main_ingredient 数】\n`);
    console.log(`profile                     | uq_cuisine | uq_ingredient | dish_titles_uq`);
    console.log(`────────────────────────────┼────────────┼───────────────┼────────────────`);
    for (const r of results) {
      const cu = new Set(r.picks.map(pk => pk.dish.origin_cuisine || '-'));
      const ing = new Set(r.picks.map(pk => pk.dish.main_ingredient || '-'));
      const ti = new Set(r.picks.map(pk => pk.dish.id));
      console.log(`${r.profile.name.padEnd(27)} | ${String(cu.size).padStart(10)} | ${String(ing.size).padStart(13)} | ${String(ti.size).padStart(14)}`);
    }

    // profile 间 Jaccard 差异 (相邻 4 对)
    console.log(`\n【profile 间差异 — dish ID Jaccard (≥ 0.3 = 偏好分化不足)】\n`);
    const pairs = [[0,4], [1,2], [2,17], [5,11], [14,11]];
    for (const [a,b] of pairs) {
      const A = new Set(results[a].picks.map(pk => pk.dish.id));
      const B = new Set(results[b].picks.map(pk => pk.dish.id));
      const inter = [...A].filter(x => B.has(x)).length;
      const union = A.size + B.size - inter;
      const j = union === 0 ? 0 : inter / union;
      console.log(`  ${results[a].profile.name.padEnd(27)} vs ${results[b].profile.name.padEnd(27)}: Jaccard=${(j*100).toFixed(0)}%`);
    }

    // 整体 verdict — TICKET-016 target 用 main slot 分母 70% pmc / 60% oil + 50% cuisine
    const passPmc = results.filter(r => r.m.target_pmc_main >= 0.70).length;
    const passOil = results.filter(r => {
      const w = r.profile.imagePrefs.oil_level;
      return !w || r.m.target_oil_main >= 0.60;
    }).length;
    const passCui = results.filter(r => r.m.target_cuisine >= 0.50).length;
    const passAll = results.filter(r => {
      const w = r.profile.imagePrefs.oil_level;
      return r.m.target_pmc_main >= 0.70 && (!w || r.m.target_oil_main >= 0.60) && r.m.target_cuisine >= 0.50;
    }).length;
    console.log(`\n【整体 verdict — TICKET-016 main slot 分母 70% pmc / 60% oil + 全菜 50% cuisine】`);
    console.log(`  pass_pmc_main: ${passPmc}/${results.length} (≥ 70%)`);
    console.log(`  pass_oil_main: ${passOil}/${results.length} (≥ 60%)`);
    console.log(`  pass_cuisine:  ${passCui}/${results.length} (≥ 50%)`);
    console.log(`  pass_all:      ${passAll}/${results.length} (三项全通过)`);
    const meanPmcMain = results.reduce((s,r) => s + r.m.target_pmc_main, 0) / results.length;
    const meanOilMain = results.reduce((s,r) => s + r.m.target_oil_main, 0) / results.length;
    const meanCui = results.reduce((s,r) => s + r.m.target_cuisine, 0) / results.length;
    const meanPmcAll = results.reduce((s,r) => s + r.m.target_pmc, 0) / results.length;
    console.log(`  mean: pmc_main=${pct(meanPmcMain)} oil_main=${pct(meanOilMain)} cui=${pct(meanCui)} (ref pmc_all=${pct(meanPmcAll)})`);

    // stability check — 同 profile 跑 3 次, 命中率方差
    console.log(`\n【随机性 / 稳定性检查 — meatlover 跑 3 次】`);
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
