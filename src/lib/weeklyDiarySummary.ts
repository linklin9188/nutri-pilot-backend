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

// ── Public summary shape ────────────────────────────────────────────────────
export interface WeeklySummary {
  /** Total distinct dishes counted (Mon-Fri, eaten OR planned). */
  totalDishes: number;
  /** Unique main ingredients across the week — proxy for diet variety. */
  distinctFoods: number;
  /** Which of the 5 protein sources made it onto the table this week. */
  proteinsCovered: ProteinCategory[];
  /** Required proteins that didn't show up (推荐外食时重点补这些). */
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

  return {
    totalDishes: allDishes.length,
    distinctFoods: distinct.size,
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
    const matches = pickRestaurantsForNeeds([need.tag], 2);
    for (const r of matches) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ restaurant: r, reason: need.reason, tag: need.tag });
      if (out.length >= 4) break;
    }
    if (out.length >= 4) break;
  }
  // All-balanced fallback — surface 2 default recognizable venues
  if (out.length === 0) {
    const fallback = pickRestaurantsForNeeds([], 2);
    for (const r of fallback) {
      out.push({ restaurant: r, reason: '本週飯桌挺均衡，今天就吃想吃的。', tag: 'banquet' });
    }
  }
  return out.slice(0, 4);
}
