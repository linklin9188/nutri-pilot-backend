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

// ── PROFILES — 22 个对比鲜明的偏好用户 (TICKET-016 扩 5→20 + TICKET-021 扩到 22) ──
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
  // ── TICKET-021 §A 扩 2 个 wellness-driven 场景 (CEO ticket 列举的 5 类中
  //     未覆盖的 2 个: 备孕 / 控糖+控盐双病老人. 另 3 类 增肌/三代/HK 已由
  //     #1/#11/#15 + #13/#14 + #7/#14/#19 覆盖) ───────────────────────────
  { name: '21-备孕妈妈-江浙白肉',      hometown: 'east', dietary_goal: 'pregnancy', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white'], oil_level: 'low',
                  chicken_style: ['steam','braise'], staple_pref: ['rice'] } },
  { name: '22-双病老人-控糖控盐',      hometown: 'cantonese', dietary_goal: 'maintain', taste_pref: 'light',
    imagePrefs: { protein_main_class: ['white','seafood'], oil_level: 'low',
                  seafood_style: ['steam','soup'], breakfast_cuisine: 'hk' } },
  // ── TICKET-028 P0 — 2大2小 + 爸爸辣海鲜 (老板真测) ───────────────────────
  // 老板 08:45: "两大两小, 一个大的可以吃辣, 喜欢吃海鲜, 生成一周菜单"
  // sim 单 profile 不模 family member, per-member slot allocation 是 prod
  // generateWeekPlan 真功能 (familyPrefs.homeMembers + memberMainSlots). sim
  // 跑此 profile 抓 imagePrefs spicy + seafood 命中率, prod 行为在报告说明。
  { name: '23-2大2小-爸爸辣海鲜',     hometown: 'east', dietary_goal: 'maintain', taste_pref: 'spicy',
    imagePrefs: { protein_main_class: ['seafood'], oil_level: 'mid',
                  seafood_style: ['steam','stirfry'],
                  staple_pref: ['rice'], protein_pref: ['fish','shrimp'] } },
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
  let candidates = pool.filter(d => !used.has(d.id) && slotFilter(d));
  if (candidates.length === 0) return null;
  // TICKET-017 §A Option δ — single-pmc + main protein slot 候选池硬过滤
  const isMainSlot = ['lu_main','di_main1','di_main2'].includes(slot);
  if (isMainSlot && p.imagePrefs.protein_main_class?.length === 1) {
    const wantUi = p.imagePrefs.protein_main_class[0];
    const wantDb = PROTEIN_CLASS_UI_TO_DB[wantUi] ?? wantUi;
    const strict = candidates.filter(d => {
      const pmcDb = (d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '')) as string;
      return pmcDb === wantDb;
    });
    if (strict.length >= 15) candidates = strict;
  }
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
// ── TICKET-023 pre-flight schema check ────────────────────────────────────
//
// Algorithm 021 §B SQL audit 揭出 v58 column shape mismatch P0 bug 后, ticket 023
// 加 CI-style pre-flight check 防再犯。检查 dishes 表实际 column 名是否覆盖
// (a) NUTRIENT_COLUMN_MAP 7+ 真列映射 (b) deriveBadges 其他 4 channel 读到的字段。
// 任一关键列缺失 → exit(2) 让 CI 红。fill-rate < 30% → warn 不 exit, 提示
// 派 Backend ticket 补 fill。
//
// 列清单与 src/hooks/useWeeklyMenu.ts deriveBadges + NUTRIENT_COLUMN_MAP 同步。
const REQUIRED_DISH_COLUMNS = {
  // §A 关键 NUTRIENT_COLUMN_MAP 真列 (TICKET-022 P0 fix) — 缺任一 → 💪 channel 死路
  nutrient: [
    'iron_mg', 'calcium_mg', 'zinc_mg',
    'vitamin_d_iu', 'omega3_mg',
    'fiber_g', 'protein_g', 'vitamin_c_mg',
  ],
  // §A deriveBadges 其他 channel 读到的 schema 字段
  // (preference 用 protein_main_class + main_ingredient + origin_cuisine,
  //  festival 用 festival_tags, seasonal 用 seasonal_tags + seasonal_tag,
  //  school_balance 用 is_blood_tonic / is_eye_care / is_beauty)
  badge_schema: [
    'protein_main_class', 'main_ingredient', 'origin_cuisine',
    'festival_tags', 'seasonal_tag',
    'is_blood_tonic', 'is_eye_care', 'is_beauty',
  ],
} as const;
// fill-rate warn 阈值 (< 30% → warn)
const FILL_RATE_WARN_PCT = 30;

async function verifyDishSchema(c: pg.Client): Promise<void> {
  // 1. 实查 information_schema.columns 拿到 dishes 真实列名
  const { rows: colRows } = await c.query<any>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dishes'`
  );
  const actualCols = new Set(colRows.map(r => r.column_name as string));
  console.log(`\n【TICKET-023 pre-flight schema check】 dishes 共 ${actualCols.size} 列`);

  // 2. 检查 NUTRIENT_COLUMN_MAP 真列
  const missingNutrient = REQUIRED_DISH_COLUMNS.nutrient.filter(c => !actualCols.has(c));
  const missingBadge = REQUIRED_DISH_COLUMNS.badge_schema.filter(c => !actualCols.has(c));

  if (missingNutrient.length > 0 || missingBadge.length > 0) {
    ciStats.schemaCheck = 'fail';
    console.error(`  ❌ FATAL: dishes schema 缺关键 column, deriveBadges 路径会死路:`);
    if (missingNutrient.length > 0) {
      console.error(`     nutrient 列 (NUTRIENT_COLUMN_MAP): ${missingNutrient.join(', ')}`);
    }
    if (missingBadge.length > 0) {
      console.error(`     badge schema 列: ${missingBadge.join(', ')}`);
    }
    console.error(`     ↪ 修复: Database 加 migration 补列 / Algorithm 修 reader 映射`);
    console.error(`     ↪ 相关参考: docs/LESSONS.md → atomic-nutrition-column-shape-mismatch-bug`);
    if (CI_MODE) emitCiSummary();
    process.exit(2);
  }
  ciStats.schemaCheck = 'pass';
  console.log(`  ✅ NUTRIENT_COLUMN_MAP 真列 ${REQUIRED_DISH_COLUMNS.nutrient.length}/${REQUIRED_DISH_COLUMNS.nutrient.length} 全部存在`);
  console.log(`  ✅ deriveBadges schema 字段 ${REQUIRED_DISH_COLUMNS.badge_schema.length}/${REQUIRED_DISH_COLUMNS.badge_schema.length} 全部存在`);

  // 3. §B fill-rate sanity check — 7 个 nutrient 列填充率, < 30% warn (不 exit)
  const colExprs = REQUIRED_DISH_COLUMNS.nutrient
    .map(c => `COUNT(${c}) FILTER (WHERE ${c} IS NOT NULL AND ${c} > 0) AS ${c}_filled`)
    .join(', ');
  const { rows: fillRows } = await c.query<any>(
    `SELECT COUNT(*) AS total, ${colExprs} FROM dishes WHERE title_zh IS NOT NULL`
  );
  const fr = fillRows[0];
  const total = Number(fr.total);
  const lowFillCols: Array<{ col: string; pct: number; n: number }> = [];
  console.log(`  ─── fill-rate sanity (n=${total}) ───`);
  for (const col of REQUIRED_DISH_COLUMNS.nutrient) {
    const n = Number(fr[`${col}_filled`]);
    const pct = total > 0 ? (n / total * 100) : 0;
    const mark = pct < FILL_RATE_WARN_PCT ? '⚠️ ' : '✅ ';
    console.log(`    ${mark}${col.padEnd(15)}: ${String(n).padStart(4)}/${total} = ${pct.toFixed(1)}%`);
    if (pct < FILL_RATE_WARN_PCT) lowFillCols.push({ col, pct, n });
  }
  if (lowFillCols.length > 0) {
    console.log(`  ⚠️  ${lowFillCols.length} 列 < ${FILL_RATE_WARN_PCT}% fill — 派 Backend ticket 补 fill:`);
    for (const { col, pct } of lowFillCols) {
      ciStats.fillRateWarns.push(`${col}:${pct.toFixed(1)}%`);
      console.log(`     ${col} 仅 ${pct.toFixed(1)}% — deriveBadges 命中该 deficit 时大半 dish 读 null, 自动跳过`);
    }
  }
}

// §C (TICKET-026) CI JSON summary emitter — Actions step 解析 stdout 末尾 JSON。
function emitCiSummary(): void {
  if (!CI_MODE) return;
  const summary = {
    algo_version: 'v61',  // 与 ALGO_VERSION 同步, sim 仅信号
    schema_check: ciStats.schemaCheck,
    fill_rate_warns: ciStats.fillRateWarns,
    smoke: {
      total: ciStats.smokeTotal,
      passed: ciStats.smokePassed,
      failed: ciStats.smokeFailed,
    },
    profile_metrics: {
      pass_pmc_main: ciStats.passPmcMain,
      total: ciStats.totalProfiles,
      mean_pmc_main: ciStats.meanPmcMain,
    },
    verdict: ciStats.schemaCheck === 'pass' && ciStats.smokeFailed === 0 ? 'pass' : 'fail',
  };
  console.log(`\n::CI_SUMMARY_BEGIN::`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`::CI_SUMMARY_END::`);
}

// 包一层 smoke assert 统计
function ciAssert(label: string, ok: boolean, got: string, want: string): void {
  ciStats.smokeTotal++;
  if (ok) ciStats.smokePassed++; else ciStats.smokeFailed++;
  // 不在此处打印 — 各 smoke section 已 console.log 详细行, ciAssert 只 tally。
}

// ── TICKET-026 CI-mode flag ─────────────────────────────────────────────
// PR-triggered GitHub Actions 跑此 sim 时传 --ci-mode:
//   - 跳过 22-profile 大量 verbose tabular 输出 (CI log 噪声减少)
//   - 保留 pre-flight schema check + fill-rate sanity + 所有 smoke tests
//   - 结尾输出 JSON summary 让 Actions 解析 pass/fail counts
//   - EXIT 0: 全通; EXIT 2: schema check fail (verifyDishSchema); EXIT 3: smoke fail
// dev local run 不传 flag → 维持原详尽输出。
const CI_MODE = process.argv.includes('--ci-mode');
// CI 跑收集 pass/fail counts 用于 JSON summary
const ciStats = {
  smokeTotal: 0,
  smokePassed: 0,
  smokeFailed: 0,
  schemaCheck: 'unknown' as 'pass' | 'fail' | 'unknown',
  fillRateWarns: [] as string[],
  passPmcMain: 0,
  totalProfiles: 0,
  meanPmcMain: 0,
};
function ciLog(s: string): void { if (!CI_MODE) console.log(s); }

async function main() {
  const conn = process.env.DIRECT_DATABASE_URL;
  if (!conn) { console.error('BLOCKER: DIRECT_DATABASE_URL 未设置'); process.exit(1); }
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    // §A + §B pre-flight: 缺关键列 exit 2; fill-rate < 30% warn 不 exit
    await verifyDishSchema(c);

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
    console.log(`\n=== algo-quality-sim — TICKET-026 22-profile A/B simulation (ALGO_VERSION v61 持平: + --ci-mode JSON summary + GitHub Actions PR pre-flight) ===`);
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
    // §C (TICKET-026) CI stats: 22-profile verdict 数 — JSON summary 消费
    ciStats.passPmcMain = passPmc;
    ciStats.totalProfiles = results.length;
    ciStats.meanPmcMain = Math.round(meanPmcMain * 100) / 100;

    // stability check — 同 profile 跑 3 次, 命中率方差
    console.log(`\n【随机性 / 稳定性检查 — meatlover 跑 3 次】`);
    for (let i = 0; i < 3; i++) {
      const picks = simulateWeek(PROFILES[0], breakfastPool, lunchDinnerPool);
      const m = computeMetrics(picks, PROFILES[0]);
      console.log(`  run ${i+1}: target_pmc=${pct(m.target_pmc)}  target_oil=${pct(m.target_oil)}  target_cuisine=${pct(m.target_cuisine)}`);
    }

    // ─── TICKET-024 dynamicK smoke — 22 profile userDiversity + topK/pick 输出 ───
    console.log(`\n【TICKET-024 §A dynamicK smoke — 22 profile userDiversity 分布 + slot K】`);
    type SimSlotType = 'breakfast' | 'lunch_main' | 'lunch_side' | 'dinner_main' | 'dinner_side' | 'dinner_kid' | 'fruit';
    const SIM_SLOT_BASE_K: Record<SimSlotType, number> = {
      breakfast: 3, lunch_main: 5, lunch_side: 5, dinner_main: 5, dinner_side: 5, dinner_kid: 5, fruit: 3,
    };
    function simComputeDiversity(imagePrefs: ImagePrefs, memberGoalsUnique = 0): number {
      const pmcLen = imagePrefs.protein_main_class?.length ?? 0;
      const arrayPrefsBoost = [
        imagePrefs.staple_pref, imagePrefs.protein_pref,
        imagePrefs.beef_style, imagePrefs.chicken_style,
        imagePrefs.seafood_style, imagePrefs.veggie_method,
      ].filter(a => (a?.length ?? 0) >= 2).length;
      return pmcLen + arrayPrefsBoost + 2 * memberGoalsUnique;
    }
    function simDynamicK(slotType: SimSlotType, userDiversity: number): { topK: number; pick: number } {
      const baseK = SIM_SLOT_BASE_K[slotType];
      if (userDiversity <= 2) return { topK: Math.max(6, baseK * 2), pick: Math.max(2, baseK - 2) };
      if (userDiversity >= 6) return { topK: baseK * 3, pick: Math.min(7, baseK + 2) };
      return { topK: Math.floor(baseK * 2.4), pick: baseK };
    }
    console.log(`profile                     | diversity | bucket | dinner_main K=topK/pick | breakfast K=topK/pick | fruit K=topK/pick`);
    console.log('─'.repeat(140));
    const diversityBuckets = { low: 0, mid: 0, high: 0 };
    for (const p of PROFILES) {
      // sim 无 familyPrefs.homeMembers, memberGoalsUnique 默认 0;
      // 但 ticket 描述 "三代同堂" 通过 familyPrefs 拉高, sim 测的是 pmc + array 维度.
      const d = simComputeDiversity(p.imagePrefs);
      const bucket = d <= 2 ? 'low' : d >= 6 ? 'high' : 'mid';
      diversityBuckets[bucket]++;
      const dMain = simDynamicK('dinner_main', d);
      const bk = simDynamicK('breakfast', d);
      const fr = simDynamicK('fruit', d);
      const name = p.name.padEnd(27);
      console.log(`${name} | ${String(d).padStart(9)} | ${bucket.padEnd(6)} | ${`${dMain.topK}/${dMain.pick}`.padEnd(23)} | ${`${bk.topK}/${bk.pick}`.padEnd(21)} | ${fr.topK}/${fr.pick}`);
    }
    console.log(`\n bucket 分布: low=${diversityBuckets.low}/22 (单一偏好少候选), mid=${diversityBuckets.mid}/22 (标配), high=${diversityBuckets.high}/22 (多样多候选)`);
    console.log(` 验证 ticket §A 意图: meatlover/vegan/单一 pmc 应在 low; 多 pmc + 多 styles 应在 mid+;`);
    console.log(` 真用户 prod 中 familyPrefs.homeMembers (三代同堂多 wellness goals) 会推 diversity ≥ 6 → high.`);

    // ─── TICKET-027 P0 西安(北方) vs 广东(粤菜) 端到端对比 dump ───────────────
    console.log(`\n=== 【TICKET-027 P0 西安 vs 广东 端到端对比 — 老板核心质疑"算法是否真在干活"】===\n`);
    const xianResult = results.find(r => r.profile.name === '5-northerner-北方面食');
    const cantonResult = results.find(r => r.profile.name === '4-cantonese-港式清淡');
    if (xianResult && cantonResult) {
      // 1. 全 picks 列出 (35 道每 profile, dinner main 着重)
      function dumpProfile(label: string, r: typeof xianResult) {
        console.log(`▼ ${label} (${r.profile.name})`);
        console.log(`  hometown=${r.profile.hometown} | goal=${r.profile.dietary_goal} | taste=${r.profile.taste_pref}`);
        console.log(`  imagePrefs: pmc=[${(r.profile.imagePrefs.protein_main_class ?? []).join(',')}] | oil=${r.profile.imagePrefs.oil_level} | staple=[${(r.profile.imagePrefs.staple_pref ?? []).join(',')}]`);
        const dinnerMains = r.picks.filter(pk => pk.meal === '晚餐' && /main/i.test(pk.slot));
        console.log(`  全 35 道 picks (按 meal+slot 顺序):`);
        for (const pk of r.picks) {
          const d = pk.dish;
          const pmc = d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '');
          console.log(`    [${pk.meal}/${pk.slot.padEnd(9)}] ${(d.title_zh ?? '').padEnd(22)} pmc=${(pmc||'-').padEnd(8)} oil=${(d.oil_level||'-').padEnd(5)} origin=${(d.origin_cuisine||'-').padEnd(14)} score=${pk.score.toFixed(2)}`);
        }
        // cuisine 分布
        const cuiCounts: Record<string, number> = {};
        for (const pk of r.picks) {
          const c = pk.dish.origin_cuisine || '其他';
          cuiCounts[c] = (cuiCounts[c] ?? 0) + 1;
        }
        const cuiSorted = Object.entries(cuiCounts).sort((a, b) => b[1] - a[1]);
        console.log(`  cuisine 分布: ${cuiSorted.map(([k, v]) => `${k}=${v}`).join(' | ')}`);
        console.log(`  (dinner main 共 ${dinnerMains.length} 道)`);
      }
      dumpProfile('🌵 西安代表', xianResult);
      console.log('');
      dumpProfile('🍤 广东代表', cantonResult);
      // 2. Jaccard 对比
      const A = new Set(xianResult.picks.map(pk => pk.dish.id));
      const B = new Set(cantonResult.picks.map(pk => pk.dish.id));
      const inter = [...A].filter(x => B.has(x)).length;
      const union = A.size + B.size - inter;
      const jacc = union === 0 ? 0 : inter / union;
      console.log(`\n▼ 全 35 道菜 dish ID Jaccard 重合率: ${(jacc*100).toFixed(1)}% (inter=${inter} / union=${union})`);
      const dinnerXianIds = new Set(xianResult.picks.filter(pk => pk.meal === '晚餐').map(pk => pk.dish.id));
      const dinnerCantonIds = new Set(cantonResult.picks.filter(pk => pk.meal === '晚餐').map(pk => pk.dish.id));
      const dinnerInter = [...dinnerXianIds].filter(x => dinnerCantonIds.has(x)).length;
      const dinnerUnion = dinnerXianIds.size + dinnerCantonIds.size - dinnerInter;
      const dinnerJacc = dinnerUnion === 0 ? 0 : dinnerInter / dinnerUnion;
      console.log(`▼ 仅 dinner Jaccard 重合率: ${(dinnerJacc*100).toFixed(1)}% (inter=${dinnerInter} / union=${dinnerUnion})`);
      // 3. 共有菜判定
      const shared = [...A].filter(x => B.has(x));
      if (shared.length > 0) {
        console.log(`▼ 共有菜 ID 列表:`);
        for (const id of shared) {
          const dish = xianResult.picks.find(pk => pk.dish.id === id)?.dish;
          if (dish) console.log(`    ${dish.title_zh} (origin=${dish.origin_cuisine})`);
        }
      } else {
        console.log(`▼ 共有菜: 0 道 (完全不重叠 — 算法真在按 hometown 分化 ✅)`);
      }
      // 4. 结论判定
      const verdict = jacc < 0.30 ? '✅ 算法真在干活' : jacc > 0.70 ? '❌ 算法假在跑 P0' : '⚠️ 部分分化 mid';
      console.log(`\n▼ 【结论判定】 全 Jaccard ${(jacc*100).toFixed(1)}% → ${verdict}`);
      console.log(`   阈值: < 30% = ✅ 真在干活 / > 70% = ❌ 假在跑 / 30-70% = ⚠️ mid`);
    }

    // ─── TICKET-028 P0 2大2小 + 爸爸辣海鲜 完整 5 天菜单 dump ─────────────────
    console.log(`\n=== 【TICKET-028 P0 2大2小 + 爸爸辣海鲜 完整 5 天菜单 — 老板 08:45 真测】===\n`);
    const dadResult = results.find(r => r.profile.name === '23-2大2小-爸爸辣海鲜');
    if (dadResult) {
      console.log(`▼ profile: ${dadResult.profile.name}`);
      console.log(`  hometown=${dadResult.profile.hometown} (江浙近海) | goal=${dadResult.profile.dietary_goal} | taste=${dadResult.profile.taste_pref} (爸爸辣)`);
      console.log(`  imagePrefs: pmc=[${(dadResult.profile.imagePrefs.protein_main_class ?? []).join(',')}] | oil=${dadResult.profile.imagePrefs.oil_level} | seafood_style=[${(dadResult.profile.imagePrefs.seafood_style ?? []).join(',')}]`);
      console.log(`  protein_pref=[${(dadResult.profile.imagePrefs.protein_pref ?? []).join(',')}] | staple=[${(dadResult.profile.imagePrefs.staple_pref ?? []).join(',')}]\n`);
      // 按 day × meal 输出 grid
      console.log(`▼ 5 天完整菜单 (5 workdays × 7 slots = 35 道):\n`);
      const DAYS = ['周一', '周二', '周三', '周四', '周五'];
      const SLOT_LABELS: Record<string, string> = {
        bf_staple: '早 主食', bf_side: '早 配',
        lu_staple: '午 主食', lu_main: '午 主菜',
        di_main1: '晚 主菜1', di_main2: '晚 主菜2', di_veg: '晚 蔬/汤',
      };
      for (let day = 0; day < 5; day++) {
        console.log(`  ── ${DAYS[day]} ──`);
        const dayPicks = dadResult.picks.filter(pk => pk.dayIndex === day);
        for (const pk of dayPicks) {
          const d = pk.dish;
          const pmc = d.protein_main_class ?? _proteinClassOf(d.main_ingredient ?? '');
          const flavors = (d.flavor_tags ?? []) as string[];
          const isSpicy = flavors.includes('spicy') || flavors.includes('medium_spicy');
          const spicyMark = isSpicy ? '🌶️' : '  ';
          const seafoodMark = pmc === 'seafood' ? '🐟' : '  ';
          console.log(`    ${(SLOT_LABELS[pk.slot] ?? pk.slot).padEnd(7)} ${spicyMark}${seafoodMark} ${(d.title_zh ?? '').padEnd(22)} pmc=${(pmc||'-').padEnd(8)} origin=${(d.origin_cuisine||'-').padEnd(12)} score=${pk.score.toFixed(2)}`);
        }
      }
      // 算法说明指标
      const dinnerMains = dadResult.picks.filter(pk => pk.meal === '晚餐' && /main/.test(pk.slot));
      const allMains = dadResult.picks.filter(pk => /main/.test(pk.slot));
      const dinnerSeafood = dinnerMains.filter(pk => {
        const pmc = pk.dish.protein_main_class ?? _proteinClassOf(pk.dish.main_ingredient ?? '');
        return pmc === 'seafood';
      });
      const dinnerSpicy = dinnerMains.filter(pk => {
        const ft = (pk.dish.flavor_tags ?? []) as string[];
        return ft.includes('spicy') || ft.includes('medium_spicy');
      });
      const allSeafood = dadResult.picks.filter(pk => {
        const pmc = pk.dish.protein_main_class ?? _proteinClassOf(pk.dish.main_ingredient ?? '');
        return pmc === 'seafood';
      });
      const allSpicy = dadResult.picks.filter(pk => {
        const ft = (pk.dish.flavor_tags ?? []) as string[];
        return ft.includes('spicy') || ft.includes('medium_spicy');
      });
      console.log(`\n▼ 算法命中率指标:`);
      const allMainSeafood = allMains.filter(pk => {
        const pmc = pk.dish.protein_main_class ?? _proteinClassOf(pk.dish.main_ingredient ?? '');
        return pmc === 'seafood';
      });
      const allMainSpicy = allMains.filter(pk => {
        const ft = (pk.dish.flavor_tags ?? []) as string[];
        return ft.includes('spicy') || ft.includes('medium_spicy');
      });
      console.log(`  dinner main 海鲜命中率: ${dinnerSeafood.length}/${dinnerMains.length} = ${(dinnerSeafood.length/dinnerMains.length*100).toFixed(0)}% (期望 ≥40%)`);
      console.log(`  dinner main 辣度命中率: ${dinnerSpicy.length}/${dinnerMains.length} = ${(dinnerSpicy.length/dinnerMains.length*100).toFixed(0)}% (期望 ≥40%)`);
      console.log(`  全 main slot (午+晚 共 15) 海鲜命中率: ${allMainSeafood.length}/${allMains.length} = ${(allMainSeafood.length/allMains.length*100).toFixed(0)}%`);
      console.log(`  全 main slot 辣度命中率: ${allMainSpicy.length}/${allMains.length} = ${(allMainSpicy.length/allMains.length*100).toFixed(0)}%`);
      console.log(`  全 35 道海鲜数: ${allSeafood.length}/35 (${(allSeafood.length/35*100).toFixed(0)}%)`);
      console.log(`  全 35 道带辣数: ${allSpicy.length}/35 (${(allSpicy.length/35*100).toFixed(0)}%)`);
      // cuisine 分布
      const cuiCounts: Record<string, number> = {};
      for (const pk of dadResult.picks) {
        const c = pk.dish.origin_cuisine || '其他';
        cuiCounts[c] = (cuiCounts[c] ?? 0) + 1;
      }
      const cuiSorted = Object.entries(cuiCounts).sort((a, b) => b[1] - a[1]);
      console.log(`  cuisine 分布: ${cuiSorted.map(([k, v]) => `${k}=${v}`).join(' | ')}`);
    }

    // ─── TICKET-021 §B NUTRIENT_BOOL_FALLBACK 7 映射 audit ──────────────────
    //
    // v58 deriveBadges 💪 channel 期望 dish.atomic_nutrition[nut] > 0 (atomic 真值
    // 优先), 但 dishes schema 实际是独立列 iron_mg / calcium_mg / vitamin_d_iu /
    // omega3_mg / zinc_mg / fiber_g / vitamin_c_mg (migrations 064 + 075), 不存在
    // 单一 atomic_nutrition JSON 列。本 audit 用 SQL 直查实际列填充率, 对比 v58
    // reader 假设的"atomic JSON"路径, 量化两条路径的真实数据可用性, 并 flag
    // 给 Algorithm 022 修 reader (本棒 §C 明示不动 reader 不 bump)。
    console.log(`\n【TICKET-021 §B NUTRIENT_BOOL_FALLBACK audit — Backend 021 atomic 真数据 vs v58 reader】`);

    const { rows: atomicAudit } = await c.query<any>(
      `SELECT
         COUNT(*)                                            AS total,
         COUNT(iron_mg)        FILTER (WHERE iron_mg > 0)     AS iron_filled,
         COUNT(calcium_mg)     FILTER (WHERE calcium_mg > 0)  AS calcium_filled,
         COUNT(vitamin_c_mg)   FILTER (WHERE vitamin_c_mg > 0) AS vitc_filled,
         COUNT(fiber_g)        FILTER (WHERE fiber_g > 0)     AS fiber_filled,
         COUNT(zinc_mg)        FILTER (WHERE zinc_mg > 0)     AS zinc_filled,
         COUNT(vitamin_d_iu)   FILTER (WHERE vitamin_d_iu > 0) AS vitd_filled,
         COUNT(omega3_mg)      FILTER (WHERE omega3_mg > 0)    AS omega3_filled,
         COUNT(*) FILTER (WHERE is_blood_tonic)         AS blood_tonic_n,
         COUNT(*) FILTER (WHERE is_eye_care)            AS eye_care_n,
         COUNT(*) FILTER (WHERE is_anti_aging)          AS anti_aging_n,
         COUNT(*) FILTER (WHERE is_anti_inflammation)   AS anti_inflam_n,
         COUNT(*) FILTER (WHERE is_qi_tonic)            AS qi_tonic_n,
         COUNT(*) FILTER (WHERE is_low_sugar)           AS low_sugar_n,
         COUNT(*) FILTER (WHERE is_mood_boost)          AS mood_boost_n
       FROM dishes WHERE title_zh IS NOT NULL`
    );
    const a = atomicAudit[0];
    const total = Number(a.total);
    console.log(`  dishes total (title_zh non-null): ${total}`);
    console.log(`  ─── atomic 真值列填充率 (Backend 021 ship) ───`);
    const atomicCols: Array<[string, string, string]> = [
      ['iron',      'iron_mg',      a.iron_filled],
      ['calcium',   'calcium_mg',   a.calcium_filled],
      ['vitamin_c', 'vitamin_c_mg', a.vitc_filled],
      ['fiber',     'fiber_g',      a.fiber_filled],
      ['zinc',      'zinc_mg',      a.zinc_filled],
      ['vitamin_d', 'vitamin_d_iu', a.vitd_filled],
      ['omega3',    'omega3_mg',    a.omega3_filled],
    ];
    for (const [nut, col, filled] of atomicCols) {
      const n = Number(filled);
      const fillPct = total > 0 ? (n / total * 100).toFixed(1) : 'N/A';
      console.log(`    ${nut.padEnd(11)} (${col.padEnd(13)}): ${String(n).padStart(4)}/${total} = ${fillPct}%`);
    }
    console.log(`  ─── NUTRIENT_BOOL_FALLBACK 7 映射兜底覆盖率 ───`);
    const boolCols: Array<[string, string, string]> = [
      ['iron',      'is_blood_tonic',                    a.blood_tonic_n],
      ['calcium',   'is_blood_tonic + is_eye_care',      a.blood_tonic_n], // 取交集近似上界
      ['vitamin_d', 'is_eye_care',                       a.eye_care_n],
      ['omega3',    'is_anti_aging|is_anti_inflam',      a.anti_aging_n],
      ['zinc',      'is_qi_tonic',                       a.qi_tonic_n],
      ['protein',   'is_qi_tonic',                       a.qi_tonic_n],
      ['fiber',     'is_low_sugar',                      a.low_sugar_n],
    ];
    for (const [nut, mapping, n] of boolCols) {
      const nNum = Number(n);
      const cov = total > 0 ? (nNum / total * 100).toFixed(1) : 'N/A';
      console.log(`    ${nut.padEnd(11)} (${mapping.padEnd(40)}): ${String(nNum).padStart(4)}/${total} = ${cov}%`);
    }
    console.log(`  ─── ⚠️ AUDIT 发现 ───`);
    console.log(`  v58 deriveBadges 读路径: dish.atomic_nutrition[nut] (JSON 字段)`);
    console.log(`  DB schema 实际: 独立列 iron_mg / calcium_mg / vitamin_d_iu / omega3_mg / zinc_mg / fiber_g / vitamin_c_mg`);
    console.log(`  → 当前 100% deficits 命中走 NUTRIENT_BOOL_FALLBACK 路径, atomic 真值未被消费`);
    console.log(`  → Algorithm 022 需修 reader: \`dish.iron_mg > 0\` / \`dish.vitamin_d_iu > 0\` 等独立列查询`);
    console.log(`  → Backend 021 ship 的 92.4% atomic fill 目前 atomic 路径 0% 触达 (column shape mismatch)`);

    // ─── TICKET-022 P0 hot-fix: 💪 channel column shape mismatch fix smoke ───
    console.log(`\n【TICKET-022 P0 hot-fix 💪 channel smoke — NUTRIENT_COLUMN_MAP 独立列 reader】`);
    const NUTRIENT_ZH_v59: Record<string, string> = {
      iron: '铁', calcium: '钙', vitamin_d: '维 D', omega3: 'Ω3', zinc: '锌',
      protein: '蛋白', fiber: '纤维', vitamin_c: '维 C',
    };
    const NUTRIENT_COLUMN_MAP_v59: Record<string, string> = {
      iron: 'iron_mg', calcium: 'calcium_mg', zinc: 'zinc_mg',
      vitamin_d: 'vitamin_d_iu', omega3: 'omega3_mg',
      fiber: 'fiber_g', protein: 'protein_g', vitamin_c: 'vitamin_c_mg',
    };
    function simWeeklyBadgeV59(dish: any, weekDeficits: string[]): { label: string } | null {
      if (weekDeficits.length === 0) return null;  // v59: 删 placeholder
      for (const nut of weekDeficits) {
        const colName = NUTRIENT_COLUMN_MAP_v59[nut];
        if (!colName) continue;
        const v = dish[colName];
        // §A (TICKET-025) 显式区分 null/undefined (缺数据 skip 下个 nut) vs 0
        // (真读数, 不命中也不命中本 nut 继续 loop). Backend 023 vitamin_d_iu fill
        // 100% 后, 0 是真物理值, 不再代表"缺失".
        if (v === null || v === undefined) continue;
        const num = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(num) && num > 0) {
          return { label: `本周补${NUTRIENT_ZH_v59[nut] ?? nut}` };
        }
      }
      return null;  // v59: dish 无对应列 → 不渲染
    }
    const v59Tests: Array<{ case: string; dish: any; deficits: string[]; want: string | null }> = [
      { case: 'iron 真列命中',         dish: { iron_mg: 4.2 },        deficits: ['iron'],                want: '本周补铁' },
      { case: 'vitamin_d 真列命中',     dish: { vitamin_d_iu: 180 },   deficits: ['vitamin_d'],           want: '本周补维 D' },
      { case: 'omega3 真列命中',        dish: { omega3_mg: 850 },      deficits: ['omega3'],              want: '本周补Ω3' },
      { case: 'zinc 真列命中',          dish: { zinc_mg: 3.5 },        deficits: ['zinc'],                want: '本周补锌' },
      { case: 'fiber 真列命中',         dish: { fiber_g: 6.0 },        deficits: ['fiber'],               want: '本周补纤维' },
      { case: '多 deficit 选首命中',    dish: { vitamin_d_iu: 0, iron_mg: 4.2 }, deficits: ['vitamin_d','iron'], want: '本周补铁' },
      { case: 'dish 无对应列 → 不标', dish: { iron_mg: null },       deficits: ['iron'],                want: null },
      { case: 'dish 列为 0 → 不标',   dish: { iron_mg: 0 },          deficits: ['iron'],                want: null },
      { case: 'v59 删 bool fallback', dish: { is_blood_tonic: true, iron_mg: null }, deficits: ['iron'], want: null },
      { case: 'deficits 空 → 不标 (v59 删 placeholder)', dish: { is_qi_tonic: true }, deficits: [],   want: null },
      { case: 'unknown nutrient → skip', dish: { iron_mg: 4.2 },     deficits: ['unknown_nut'],         want: null },
      // ── TICKET-025 §B null/0/undefined 区分 unit tests ──
      { case: 'v61 0 IU 是真值不 nullish skip',
        dish: { iron_mg: 0, vitamin_d_iu: 0 }, deficits: ['iron'],   want: null },
      { case: 'v61 vitamin_d_iu=0 + 多 deficit loop 继续到 iron',
        dish: { vitamin_d_iu: 0, iron_mg: 4.2 }, deficits: ['vitamin_d', 'iron'], want: '本周补铁' },
      { case: 'v61 iron_mg=null → 缺数据 skip',
        dish: { iron_mg: null }, deficits: ['iron'], want: null },
      { case: 'v61 vitamin_d_iu=undefined → 缺数据 skip',
        dish: {}, deficits: ['vitamin_d'], want: null },
      { case: 'v61 字符串"4.2" 强转 number 命中',
        dish: { iron_mg: '4.2' }, deficits: ['iron'], want: '本周补铁' },
      { case: 'v61 字符串"0" 强转 0 不命中',
        dish: { iron_mg: '0' }, deficits: ['iron'], want: null },
    ];
    for (const t of v59Tests) {
      const got = simWeeklyBadgeV59(t.dish, t.deficits);
      const ok = (got?.label ?? null) === t.want;
      ciAssert(t.case, ok, got?.label ?? 'null', t.want ?? 'null');
      console.log(`  ${t.case.padEnd(36)}: ${ok ? '✅' : '❌'} got=${got?.label ?? 'null'} want=${t.want ?? 'null'}`);
    }

    // ─── TICKET-019 §A pref_scores jsonb unwrap 单元 smoke ───
    console.log(`\n【TICKET-019 §A pref_scores jsonb unwrap smoke — Backend rollup {score,n} → flat number】`);
    function simUnwrap(raw: Record<string, any>): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [key, val] of Object.entries(raw)) {
        if (val == null) continue;
        if (typeof val === 'number') { out[key] = val; continue; }
        if (typeof val === 'object' && typeof val.score === 'number') {
          const n = typeof val.n === 'number' ? val.n : 0;
          const confWeight = n >= 30 ? 1.50 : 0.35;
          out[key] = val.score * confWeight;
        }
      }
      return out;
    }
    const mockJsonb = {
      'pmc:red':           { score: 1.0,  n: 35 },   // 高置信度: 1.0 * 1.50 = 1.50
      'tag:mood_boost':    { score: 0.5,  n: 12 },   // 低置信度: 0.5 * 0.35 = 0.175
      'cuisine:jiangnan':  { score: -0.6, n: 30 },   // 边界 n=30: -0.6 * 1.50 = -0.90
      'tag:legacy_number': 0.42,                      // 兼容旧 number 形态
      'tag:malformed':     { foo: 'bar' },            // 缺 score 字段, 跳过
      'tag:null':          null,                      // null 跳过
    };
    const unwrapped = simUnwrap(mockJsonb);
    const expected: Array<[string, number, string]> = [
      ['pmc:red',           1.0 * 1.50,  'n=35 → confWeight 1.50'],
      ['tag:mood_boost',    0.5 * 0.35,  'n=12 → confWeight 0.35'],
      ['cuisine:jiangnan', -0.6 * 1.50,  'n=30 边界 → confWeight 1.50'],
      ['tag:legacy_number', 0.42,         '旧 number 形态直通'],
    ];
    for (const [key, want, why] of expected) {
      const got = unwrapped[key];
      const ok = typeof got === 'number' && Math.abs(got - want) < 1e-9;
      ciAssert(`jsonb:${key}`, ok, got?.toFixed(3) ?? 'undefined', want.toFixed(3));
      console.log(`  ${key.padEnd(20)}: ${ok ? '✅' : '❌'} got=${got?.toFixed(3) ?? 'undefined'} want=${want.toFixed(3)} (${why})`);
    }
    const skipMalformed = !('tag:malformed' in unwrapped);
    const skipNull = !('tag:null' in unwrapped);
    console.log(`  ${'tag:malformed'.padEnd(20)}: ${skipMalformed ? '✅' : '❌'} skipped (无 score 字段)`);
    ciAssert('jsonb:tag:malformed-skipped', skipMalformed, String(skipMalformed), 'true');
    ciAssert('jsonb:tag:null-skipped', skipNull, String(skipNull), 'true');
    console.log(`  ${'tag:null'.padEnd(20)}: ${skipNull ? '✅' : '❌'} skipped (null value)`);

    // ─── TICKET-018 §B deriveBadges 单元 smoke (5 channel 每个至少 1 个命中) ───
    console.log(`\n【TICKET-018 §B deriveBadges smoke — 5 channel 命中检测】`);
    const today = new Date();
    const _m = today.getMonth() + 1;
    const curSeason = _m >= 3 && _m <= 5 ? 'spring' : _m >= 6 && _m <= 8 ? 'summer' : _m >= 9 && _m <= 11 ? 'autumn' : 'winter';
    type SimBadge = { kind: string; icon: string; label: string };
    function simDeriveBadges(dish: any, ctx: any): SimBadge[] {
      const out: SimBadge[] = [];
      const wantPmcArr: string[] = ctx.imagePrefs?.protein_main_class ?? [];
      const dishPmc = (dish.protein_main_class ?? _proteinClassOf(dish.main_ingredient ?? '')) as string;
      if (wantPmcArr.length > 0 && dishPmc && wantPmcArr.includes(dishPmc)) {
        out.push({ kind: 'preference', icon: '🌶️', label: `你爱吃${dishPmc}系` });
      }
      const dishFest = (dish.festival_tags ?? []) as string[];
      if (Array.isArray(dishFest) && dishFest.length > 0 && ctx.festivalTags?.length > 0) {
        const hit = dishFest.find((t: string) => ctx.festivalTags.includes(t));
        if (hit) out.push({ kind: 'festival', icon: '🎋', label: hit });
      }
      if (ctx.hasKid) {
        if (dish.is_blood_tonic) out.push({ kind: 'school_balance', icon: '🎒', label: '孩子补血' });
        else if (dish.is_eye_care) out.push({ kind: 'school_balance', icon: '🎒', label: '孩子护眼' });
      }
      const dishSeasons = (dish.seasonal_tags ?? []) as string[];
      if (Array.isArray(dishSeasons) && dishSeasons.includes(curSeason)) {
        out.push({ kind: 'seasonal', icon: '🌿', label: `${curSeason}当令` });
      }
      // TICKET-022 v59: 💪 channel 切独立列 reader. weekDeficits 非空 + 真列 > 0 → 标
      if (Array.isArray(ctx.weekDeficits) && ctx.weekDeficits.length > 0) {
        const colMap: Record<string, string> = { iron: 'iron_mg', vitamin_d: 'vitamin_d_iu', omega3: 'omega3_mg', zinc: 'zinc_mg' };
        for (const nut of ctx.weekDeficits) {
          const col = colMap[nut];
          if (!col) continue;
          const v = dish[col];
          if (typeof v === 'number' && v > 0) {
            out.push({ kind: 'weekly_balance', icon: '💪', label: `本周补${nut === 'iron' ? '铁' : nut}` });
            break;
          }
        }
      }
      const seen = new Set<string>();
      return out.filter(b => { if (seen.has(b.kind)) return false; seen.add(b.kind); return true; }).slice(0, 2);
    }
    const mockDishes = [
      { kind: 'preference', dish: { protein_main_class: 'red', main_ingredient: 'beef' }, ctx: { imagePrefs: { protein_main_class: ['red'] }, festivalTags: [], hasKid: false, weekDeficits: [] } },
      { kind: 'festival', dish: { festival_tags: ['duanwu'] }, ctx: { imagePrefs: {}, festivalTags: ['duanwu'], hasKid: false, weekDeficits: [] } },
      { kind: 'school_balance', dish: { is_blood_tonic: true }, ctx: { imagePrefs: {}, festivalTags: [], hasKid: true, weekDeficits: [] } },
      { kind: 'seasonal', dish: { seasonal_tags: [curSeason] }, ctx: { imagePrefs: {}, festivalTags: [], hasKid: false, weekDeficits: [] } },
      { kind: 'weekly_balance', dish: { iron_mg: 4.2 }, ctx: { imagePrefs: {}, festivalTags: [], hasKid: false, weekDeficits: ['iron'] } },
    ];
    for (const t of mockDishes) {
      const badges = simDeriveBadges(t.dish, t.ctx);
      const hit = badges.some(b => b.kind === t.kind);
      ciAssert(`5ch:${t.kind}`, hit, String(hit), 'true');
      console.log(`  ${t.kind.padEnd(16)}: ${hit ? '✅' : '❌'} → ${badges.map(b => `${b.icon}${b.label}`).join(' ') || '(none)'}`);
    }
    // §C (TICKET-026) CI summary + EXIT 3 on smoke failure
    emitCiSummary();
    if (CI_MODE && ciStats.smokeFailed > 0) process.exit(3);
  } finally {
    await c.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
