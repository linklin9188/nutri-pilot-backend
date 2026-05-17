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
// Translates summary gaps to a few "今天出门吃什么" suggestions. Each entry
// has an emoji, a restaurant category hint, and a one-line "为什么" reason
// the family-assistant tone can read out loud.
export interface DiningSuggestion {
  emoji: string;
  title: string;        // 推荐餐厅类型 / 菜
  reason: string;       // 一句话补什么
  tag: string;          // 'protein' | 'veggie' | 'fruit' | 'grain' | 'light'
}

const PROTEIN_SUGGESTIONS: Record<ProteinCategory, DiningSuggestion> = {
  fish: {
    emoji: '🐟', tag: 'protein',
    title: '粤式蒸鱼 / 日料寿司',
    reason: '这周一条鱼都没上桌，外面吃一顿补点 omega-3。',
  },
  shellfish: {
    emoji: '🦐', tag: 'protein',
    title: '虾蟹大排档 / 粤式海鲜',
    reason: '虾蟹补锌补硒，本周空缺，今天好好享受一顿。',
  },
  meat: {
    emoji: '🥩', tag: 'protein',
    title: '烤肉 / 涮羊肉',
    reason: '红肉补铁补蛋白，本周没吃，今天换换口味。',
  },
  poultry: {
    emoji: '🍗', tag: 'protein',
    title: '白切鸡 / 烤鸡',
    reason: '禽肉清淡补蛋白，外面来一份。',
  },
  egg: {
    emoji: '🥚', tag: 'protein',
    title: '茶餐厅蛋治 / 蛋包饭',
    reason: '简单的蛋类补一下，省事又营养。',
  },
  dairy: {
    emoji: '🥛', tag: 'protein',
    title: '咖啡馆下午茶 / 酸奶吧',
    reason: '一杯拿铁或一碗酸奶，钙就够了。',
  },
  soy: {
    emoji: '🌱', tag: 'protein',
    title: '豆腐火锅 / 客家豆腐',
    reason: '豆制品补优质植物蛋白，今天清淡一点。',
  },
  tofu: {
    emoji: '🌱', tag: 'protein',
    title: '麻婆豆腐 / 客家酿豆腐',
    reason: '豆腐家常又补蛋白，馆子做的更地道。',
  },
};

/**
 * Build up to 4 dining suggestions ordered by impact (proteins first, then
 * 缺蔬菜 / 缺水果 / 缺粗粮).
 */
export function buildDiningSuggestions(summary: WeeklySummary): DiningSuggestion[] {
  const out: DiningSuggestion[] = [];
  // Top 2 missing proteins
  for (const p of summary.proteinsMissing.slice(0, 2)) {
    const s = PROTEIN_SUGGESTIONS[p];
    if (s) out.push(s);
  }
  if (summary.veggieGap) {
    out.push({
      emoji: '🥗', tag: 'veggie',
      title: '素食馆 / 沙拉店',
      reason: '本周蔬菜少了点，今天换个全蔬菜的清爽。',
    });
  }
  if (summary.fruitGap) {
    out.push({
      emoji: '🍓', tag: 'fruit',
      title: '水果店 / 鲜榨果汁',
      reason: '这周水果一份没沾，下午买点尝尝时令。',
    });
  }
  if (!summary.wholeGrainPresent) {
    out.push({
      emoji: '🌾', tag: 'grain',
      title: '杂粮饭店 / 燕麦粥',
      reason: '本周主食都是白米白面，今天换点杂粮 B 族。',
    });
  }
  // 油盐糖超标 → 提醒清淡
  if (summary.oilGramsTotal > 80 || summary.saltGramsTotal > 30) {
    out.push({
      emoji: '🍵', tag: 'light',
      title: '清汤粤式 / 怀石料理',
      reason: '本周油盐有点重，今天找家清淡的歇歇。',
    });
  }
  // Default fallback when everything looks balanced
  if (out.length === 0) {
    out.push({
      emoji: '🌸', tag: 'light',
      title: '挑一家想念已久的馆子',
      reason: '本周饭桌很均衡，今天就吃想吃的。',
    });
  }
  return out.slice(0, 4);
}
