/**
 * weeklyDiarySummary.ts — aggregate Mon-Fri dish data into a weekend
 * recap. Drives the WeekendDiningReport: 本周吃过的 vs 应吃，缺什么营养。
 *
 * Source of truth (in priority):
 *   1. eatingDiary marks (eaten_YYYY-MM-DD)         — actual eaten dishes
 *   2. weeklyMenu cache (loadWeekMenu)               — planned dishes fallback
 *
 * Output: list of protein-source gaps + 维度 unmet + 推荐 type 用于外食建议。
 */
import { supabase } from './supabase';
import { DAILY, type ProteinCategory } from './dailyNutrition';
import { ALGO_VERSION } from '../hooks/useWeeklyMenu';

// ── Local date helpers (mirror VerifyIngredients, kept local to avoid cycle) ──
function formatLocalDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function getMondayISO(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

function loadWeekMenu(): any | null {
  const weekStart = getMondayISO();
  const prefix = `weekly_menu_${ALGO_VERSION}_${weekStart}`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { return JSON.parse(raw); } catch { /* ignore */ }
      }
    }
  }
  return null;
}

function readEatenForDate(dateISO: string): string[] {
  try {
    const raw = localStorage.getItem(`eaten_${dateISO}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ── Food groups (user-confirmed 2026-05-17) ─────────────────────────────────
// 用户视角的 10 类食材轮值，比 5 大蛋白更直观；灰色 chip = 这周没沾。
export type FoodGroup =
  | 'fish'      // 鱼 / 虾蟹海鲜（水产大类）
  | 'meat'      // 红肉 (猪 / 牛 / 羊)
  | 'poultry'   // 白肉 (鸡 / 鸭 / 鹅)
  | 'egg'       // 蛋
  | 'veggie'    // 蔬菜
  | 'soy'       // 豆 / 豆制品
  | 'mushroom'  // 菌菇 (香菇 / 木耳 / 银耳)
  | 'dairy'     // 奶 / 酸奶 / 芝士
  | 'grain'     // 主食 (米面 / 杂粮)
  | 'fruit';    // 水果

export const FOOD_GROUPS_ORDER: FoodGroup[] = [
  'fish', 'meat', 'poultry', 'egg', 'veggie',
  'soy',  'mushroom', 'dairy', 'grain', 'fruit',
];

// ── Public summary shape ────────────────────────────────────────────────────
export interface WeeklySummary {
  /** Total distinct dishes counted (Mon-Fri, eaten OR planned). */
  totalDishes: number;
  /** Unique main ingredients across the week — proxy for diet variety. */
  distinctFoods: number;
  /** 10 大食材类别本周覆盖情况 — UI 直接渲染 10 个 chip。 */
  groupsCovered: Set<FoodGroup>;
  /** 没上桌的类别，用于一句话 caption。 */
  groupsMissing: FoodGroup[];
  /** 兼容旧字段：5 大蛋白轮值（外食建议生成时仍用）。*/
  proteinsCovered: ProteinCategory[];
  proteinsMissing: ProteinCategory[];
  /** Total oil/salt/sugar grams across 5 days (raw, for trend display). */
  oilGramsTotal:   number;
  saltGramsTotal:  number;
  sugarGramsTotal: number;
  /** True if vegetable-heavy dish count < 5 (under one veggie a day). */
  veggieGap: boolean;
  /** True if no fruit hit the table. */
  fruitGap: boolean;
  /** Whole-grain / 粗粮 staple presence — true if at least 1 wholegrain main. */
  wholeGrainPresent: boolean;
}

// ── Internal aggregation ────────────────────────────────────────────────────
function normalizeProtein(p: string): ProteinCategory | null {
  const lower = p.toLowerCase();
  if (lower === 'fish' || lower === 'salmon' || lower === 'tuna') return 'fish';
  if (lower === 'shellfish' || lower === 'shrimp' || lower === 'crab') return 'shellfish';
  if (lower === 'meat' || lower === 'pork' || lower === 'beef' || lower === 'lamb') return 'meat';
  if (lower === 'poultry' || lower === 'chicken' || lower === 'duck') return 'poultry';
  if (lower === 'egg') return 'egg';
  if (lower === 'dairy' || lower === 'milk' || lower === 'cheese' || lower === 'yogurt') return 'dairy';
  if (lower === 'soy' || lower === 'tofu') return 'soy';
  return null;
}

const OIL_G   = { low: 5,  mid: 10, high: 20 } as const;
const SALT_G  = { low: 2,  mid: 4,  high: 7 }  as const;
const SUGAR_G = { low: 5,  mid: 12, high: 25 } as const;

function isVeggieDish(d: any): boolean {
  return (d.course_type === 'veggie_dish') || ((d.flavor_tags ?? []) as string[]).includes('veggie');
}
function isFruitDish(d: any): boolean {
  return (d.main_ingredient ?? '').toLowerCase() === 'fruit';
}
function isWholeGrain(d: any): boolean {
  const title = (d.title_zh ?? '').toLowerCase();
  const KW = ['杂粮','燕麦','糙米','玉米','紫米','黑米','小米','八宝','藜麦'];
  return KW.some(k => title.includes(k));
}

// 把一道菜归类到 0-N 个食材组 — 一盘"番茄炒蛋"同时算 'veggie' + 'egg'。
function detectFoodGroups(d: any): FoodGroup[] {
  const out = new Set<FoodGroup>();
  const ing = (d.main_ingredient ?? '').toLowerCase();
  const title = (d.title_zh ?? '').toLowerCase();
  const ct = d.course_type ?? '';
  const flavor: string[] = d.flavor_tags ?? [];
  const proteins: string[] = (d.protein_source ?? []).map((p: string) => (p ?? '').toLowerCase());

  // 鱼 / 海鲜大类 — 鱼贝虾蟹同归一类（用户视角的"鱼"）
  const FISH_INGS = new Set(['fish','salmon','tuna','cod','seabass','hairtail','shrimp','crab','clam','scallop','oyster','squid','lobster','shellfish','seafood']);
  if (FISH_INGS.has(ing)) out.add('fish');
  if (proteins.some(p => ['fish','shellfish','salmon','tuna','shrimp','crab'].includes(p))) out.add('fish');

  // 红肉 — 猪 / 牛 / 羊
  if (['pork','beef','lamb','mutton'].includes(ing)) out.add('meat');
  if (proteins.some(p => ['meat','pork','beef','lamb'].includes(p))) out.add('meat');

  // 白肉 — 鸡 / 鸭 / 鹅 / 火鸡
  if (['chicken','duck','turkey','goose'].includes(ing)) out.add('poultry');
  if (proteins.some(p => ['poultry','chicken','duck'].includes(p))) out.add('poultry');

  // 蛋
  if (ing === 'egg' || proteins.includes('egg') || title.includes('蛋')) out.add('egg');

  // 豆 / 豆制品
  if (['tofu','soy','tempeh','bean'].includes(ing)) out.add('soy');
  if (proteins.some(p => ['soy','tofu'].includes(p))) out.add('soy');
  const SOY_KW = ['豆腐','豆干','腐竹','千张','纳豆','黄豆','黑豆','毛豆','豆浆','豆花'];
  if (SOY_KW.some(k => title.includes(k))) out.add('soy');

  // 菌菇
  const MUSHROOM_KW = ['菇','菌','木耳','银耳','茯苓','灵芝','口蘑','金针','香菇','平菇'];
  if (ing === 'mushroom' || MUSHROOM_KW.some(k => title.includes(k))) out.add('mushroom');

  // 奶
  if (proteins.some(p => ['dairy','milk','cheese','yogurt','butter'].includes(p))) out.add('dairy');
  const DAIRY_KW = ['牛奶','奶酪','起司','芝士','酸奶','奶油','黄油','炼乳'];
  if (DAIRY_KW.some(k => title.includes(k))) out.add('dairy');

  // 蔬菜 — course_type / flavor / 标题暗示
  if (ct === 'veggie_dish' || flavor.includes('veggie')) out.add('veggie');
  if (['veggie','vegetable','spinach','kale','cabbage','broccoli'].includes(ing)) out.add('veggie');

  // 主食
  if (ct === 'staple' || ['carb','grain','rice','noodle'].includes(ing)) out.add('grain');

  // 水果
  if (ing === 'fruit' || ct === 'fruit') out.add('fruit');

  return [...out];
}

/**
 * Pulls Mon-Fri dish data (eaten where marked, planned otherwise) and reduces
 * to a single weekly snapshot.
 */
export async function summarizeWeek(): Promise<WeeklySummary> {
  const weekStart = getMondayISO();
  const [y, m, dd] = weekStart.split('-').map(Number);

  // Collect candidate dish IDs and inline dish objects from both sources
  const eatenIds: string[] = [];
  const plannedDishes: any[] = [];

  const weekMenu = loadWeekMenu();
  const days: any[] = weekMenu?.days ?? [];

  for (let i = 0; i < 5; i++) {
    const date = new Date(y, m - 1, dd + i);
    const iso = formatLocalDate(date);
    eatenIds.push(...readEatenForDate(iso));
    // Fall back to planned menu for that day
    const dayEntry = days.find((dy: any) => dy.dayIndex === i);
    if (dayEntry) {
      plannedDishes.push(...(dayEntry.dishes ?? []));
      plannedDishes.push(...(dayEntry.lunchDishes ?? []));
    }
  }

  // Hydrate eaten dish IDs from DB for nutrition fields the localStorage
  // copy might be missing.
  let eatenDishes: any[] = [];
  if (eatenIds.length > 0) {
    const ids = [...new Set(eatenIds)];
    const { data } = await supabase
      .from('dishes')
      .select('id, title_zh, main_ingredient, course_type, flavor_tags, health_benefit_tags, protein_source, oil_level, salt_level, sugar_level, nutrition_kcal_per_serving')
      .in('id', ids);
    eatenDishes = data ?? [];
  }

  // De-dup union: eaten takes precedence; planned fills in gaps for dishes
  // the user didn't manually mark eaten.
  const seen = new Set<string>();
  const allDishes: any[] = [];
  for (const d of [...eatenDishes, ...plannedDishes]) {
    if (!d || !d.id) continue;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    allDishes.push(d);
  }

  const proteinsCovered = new Set<ProteinCategory>();
  for (const d of allDishes) {
    for (const p of (d.protein_source ?? []) as string[]) {
      const n = normalizeProtein(p);
      if (n) proteinsCovered.add(n);
    }
  }
  const proteinsMissing = (DAILY.required_proteins as readonly ProteinCategory[]).filter(p => !proteinsCovered.has(p));

  let oil = 0, salt = 0, sugar = 0;
  for (const d of allDishes) {
    if (d.oil_level)   oil   += OIL_G[d.oil_level   as keyof typeof OIL_G]   ?? 0;
    if (d.salt_level)  salt  += SALT_G[d.salt_level  as keyof typeof SALT_G]  ?? 0;
    if (d.sugar_level) sugar += SUGAR_G[d.sugar_level as keyof typeof SUGAR_G] ?? 0;
  }

  const distinct = new Set(allDishes.map(d => d.main_ingredient).filter(Boolean));
  const veggieCount = allDishes.filter(isVeggieDish).length;
  const fruitCount  = allDishes.filter(isFruitDish).length;
  const wholeGrain  = allDishes.some(isWholeGrain);

  // 10 类食材组 — 灰色 chip 视觉表达哪些上桌、哪些缺
  const groupsCovered = new Set<FoodGroup>();
  for (const d of allDishes) {
    for (const g of detectFoodGroups(d)) groupsCovered.add(g);
  }
  const groupsMissing = FOOD_GROUPS_ORDER.filter(g => !groupsCovered.has(g));

  return {
    totalDishes: allDishes.length,
    distinctFoods: distinct.size,
    groupsCovered,
    groupsMissing,
    proteinsCovered: [...proteinsCovered],
    proteinsMissing,
    oilGramsTotal: oil,
    saltGramsTotal: salt,
    sugarGramsTotal: sugar,
    veggieGap: veggieCount < 5,
    fruitGap: fruitCount === 0,
    wholeGrainPresent: wholeGrain,
  };
}

// ── 外食 推荐生成 ───────────────────────────────────────────────────────────
//
// Pairs the user's nutritional gaps with curated HK restaurants from
// hkRestaurants.ts. Each suggestion is a real venue with name + signature
// dish + 一句话 reason — so the recommendation card can flow straight into
// a "预订" CTA. (Future monetization path per user direction 2026-05-17:
// 推荐 → 预订 → 餐厅合作分成.)
import { pickRestaurantsForNeeds, type HkRestaurant, type DiningTag } from './hkRestaurants';

export interface DiningSuggestion {
  restaurant: HkRestaurant;
  /** 1-2 sentence why-this-place — tailored to the gap that surfaced it. */
  reason: string;
  /** The gap category this suggestion covers (drives UI sort + analytics). */
  tag: DiningTag;
}

const PROTEIN_TO_TAG: Record<ProteinCategory, { tag: DiningTag; reason: string }> = {
  fish:      { tag: 'fish',      reason: '本週一條魚都沒上桌，週末補一頓 omega-3。' },
  shellfish: { tag: 'shellfish', reason: '蝦蟹補鋅補硒，本週空缺、週末好好享受。' },
  meat:      { tag: 'meat',      reason: '紅肉補鐵補蛋白，本週沒沾，今天換換口味。' },
  poultry:   { tag: 'poultry',   reason: '禽肉清淡又補蛋白，外面來一份很合適。' },
  egg:       { tag: 'egg',       reason: '蛋類本週缺，茶餐廳一份滑蛋飯解決。' },
  dairy:     { tag: 'dairy',     reason: '本週鈣可能不夠，一杯燉奶或酸奶補上。' },
  soy:       { tag: 'soy',       reason: '豆製品補優質植物蛋白，今天清淡一點。' },
  tofu:      { tag: 'soy',       reason: '豆腐家常又補蛋白，館子做的更地道。' },
};

/**
 * Map the WeeklySummary gaps to up to 4 real-restaurant suggestions.
 * Ordering: missing proteins → veggie gap → fruit gap → grain gap →
 * oil/salt overload. Deduplicates so the same restaurant doesn't show
 * up twice when it covers multiple gaps.
 */
export function buildDiningSuggestions(summary: WeeklySummary): DiningSuggestion[] {
  // Collect needs in priority order, then ask hkRestaurants for matches.
  const needs: { tag: DiningTag; reason: string }[] = [];
  for (const p of summary.proteinsMissing.slice(0, 2)) {
    const m = PROTEIN_TO_TAG[p];
    if (m) needs.push(m);
  }
  if (summary.veggieGap) {
    needs.push({ tag: 'veggie', reason: '本週蔬菜少了點，週末換個蔬菜為主的館子。' });
  }
  if (summary.fruitGap) {
    needs.push({ tag: 'fruit',  reason: '一週一口水果沒沾？下午買杯鮮榨果汁補維 C。' });
  }
  if (!summary.wholeGrainPresent) {
    needs.push({ tag: 'grain',  reason: '主食都是白米白麵？來碗雜糧麵補 B 族維生素。' });
  }
  if (summary.oilGramsTotal > 80 || summary.saltGramsTotal > 30) {
    needs.push({ tag: 'light',  reason: '本週油鹽偏重，週末找家清淡的歇歇。' });
  }

  const out: DiningSuggestion[] = [];
  const seen = new Set<string>();
  for (const need of needs) {
    const matches = pickRestaurantsForNeeds([need.tag], 3);
    for (const r of matches) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ restaurant: r, reason: need.reason, tag: need.tag });
      if (out.length >= 5) break;
    }
    if (out.length >= 5) break;
  }
  // Pad with general/recognizable venues so user always gets 5 picks
  // (用户 2026-05-17 要求周末每天 5 家). When gaps already gave us
  // enough we just skip the pad loop.
  if (out.length < 5) {
    const pad = pickRestaurantsForNeeds([], 8);
    for (const r of pad) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ restaurant: r, reason: '本週飯桌挺均衡，這家也值得一試。', tag: 'banquet' });
      if (out.length >= 5) break;
    }
  }
  return out.slice(0, 5);
}
