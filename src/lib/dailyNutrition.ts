/**
 * dailyNutrition.ts — aggregate today's 3 meals into a single nutrition
 * snapshot for the Home strip. Reads from the same weeklyMenu the user
 * is looking at, so what they SEE is what we judge against.
 *
 * Outputs:
 *   - per-meal kcal totals + 30/40/30 target percentages
 *   - daily protein-source coverage (鱼/肉/蛋/奶/豆 — the 5 categories
 *     from 中国居民膳食指南 2022)
 *   - oil / salt / sugar daily estimated grams vs target caps:
 *       oil   ≤ 30 g
 *       salt  ≤  5 g
 *       sugar ≤ 25 g
 *   - distinct food count (toward 12-foods/day rule)
 *
 * Estimates per `oil_level / salt_level / sugar_level`:
 *   oil   low=5g   mid=12g  high=25g
 *   salt  low=0.5g mid=2.0g high=4.0g
 *   sugar low=1g   mid=8g   high=20g
 * Numbers are rough but consistent — enough to drive a 🟢🟡🔴 strip.
 */

export type ProteinCategory = 'fish' | 'meat' | 'poultry' | 'egg' | 'dairy' | 'soy' | 'shellfish' | 'tofu';

export interface DishLike {
  id?: string;
  title_zh?: string;
  main_ingredient?: string;
  protein_source?: string[] | null;
  cook_method?: string | null;
  nutrition_kcal_per_serving?: number | null;
  oil_level?:   'low' | 'mid' | 'high' | null;
  salt_level?:  'low' | 'mid' | 'high' | null;
  sugar_level?: 'low' | 'mid' | 'high' | null;
}

export interface DayMeals {
  早餐: DishLike[];
  午餐: DishLike[];
  晚餐: DishLike[];
}

// Mass-per-serving estimates (grams) — calibrated against typical
// home-cooking portions. Used to roll up oil/salt/sugar grams across
// a day.
const OIL_G:   Record<string, number> = { low: 5,   mid: 12,  high: 25 };
const SALT_G:  Record<string, number> = { low: 0.5, mid: 2.0, high: 4.0 };
const SUGAR_G: Record<string, number> = { low: 1,   mid: 8,   high: 20 };

// Daily targets (中国居民膳食指南 2022 — adult).
export const DAILY = {
  kcal:  { adult_male: 2150, adult_female: 1700, default: 2000 },
  oil_g_cap:   30,
  salt_g_cap:   5,
  sugar_g_cap: 25,
  variety_target: 12,           // 12 食物 / 天
  required_proteins: ['fish','meat','egg','dairy','soy'] as const,
};

// Map our protein_source enum back to the 5-category daily checklist.
// (poultry counts as 'meat', tofu counts as 'soy', shellfish counts as
//  'fish' for the everyday checklist — kept on the dish-level field for
//  accuracy elsewhere.)
function normalizeProtein(p: string): typeof DAILY.required_proteins[number] | null {
  if (p === 'fish' || p === 'shellfish') return 'fish';
  if (p === 'meat' || p === 'poultry')   return 'meat';
  if (p === 'egg')                       return 'egg';
  if (p === 'dairy')                     return 'dairy';
  if (p === 'soy' || p === 'tofu')       return 'soy';
  return null;
}

export interface DailySnapshot {
  kcal: {
    breakfast: number;
    lunch:     number;
    dinner:    number;
    total:     number;
    target:    number;
    /** Percent of total day that each meal contributes — compare to 30/40/30 */
    splitPct:  { breakfast: number; lunch: number; dinner: number };
  };
  proteinsCovered:  Set<typeof DAILY.required_proteins[number]>;
  proteinsMissing:  typeof DAILY.required_proteins[number][];
  oilGramsEstimate:   number;
  saltGramsEstimate:  number;
  sugarGramsEstimate: number;
  /** "high" dish counts — surfaces specific offenders, not just totals. */
  highOilDishes:   DishLike[];
  highSaltDishes:  DishLike[];
  highSugarDishes: DishLike[];
  distinctFoods:   number;            // unique main_ingredient + side categories
  cookMethodCount: number;            // diversity signal
}

export function summarizeDay(meals: DayMeals, opts?: { kcalTarget?: number }): DailySnapshot {
  const target = opts?.kcalTarget ?? DAILY.kcal.default;

  const kcalOf = (m: DishLike[]) => m.reduce((n, d) => n + (d.nutrition_kcal_per_serving ?? 0), 0);
  const bk = kcalOf(meals.早餐);
  const ln = kcalOf(meals.午餐);
  const dn = kcalOf(meals.晚餐);
  const total = bk + ln + dn;

  const all = [...meals.早餐, ...meals.午餐, ...meals.晚餐];

  // Proteins covered
  const proteinsCovered = new Set<typeof DAILY.required_proteins[number]>();
  for (const d of all) {
    for (const p of d.protein_source ?? []) {
      const norm = normalizeProtein(p);
      if (norm) proteinsCovered.add(norm);
    }
  }
  const proteinsMissing = DAILY.required_proteins.filter(p => !proteinsCovered.has(p));

  // Grams estimates
  let oilG = 0, saltG = 0, sugarG = 0;
  const highOilDishes: DishLike[] = [];
  const highSaltDishes: DishLike[] = [];
  const highSugarDishes: DishLike[] = [];
  for (const d of all) {
    if (d.oil_level)   { oilG  += OIL_G[d.oil_level]   ?? 0; if (d.oil_level   === 'high') highOilDishes.push(d); }
    if (d.salt_level)  { saltG += SALT_G[d.salt_level] ?? 0; if (d.salt_level  === 'high') highSaltDishes.push(d); }
    if (d.sugar_level) { sugarG+= SUGAR_G[d.sugar_level]?? 0; if (d.sugar_level === 'high') highSugarDishes.push(d); }
  }

  // Distinct foods — count unique main_ingredient (better proxy than dish
  // count; "西红柿炒蛋" and "西红柿牛腩" share 西红柿 so shouldn't both
  // count toward 12).
  const distinct = new Set(all.map(d => d.main_ingredient).filter(Boolean));
  const methodSet = new Set(all.map(d => d.cook_method).filter(Boolean));

  return {
    kcal: {
      breakfast: bk, lunch: ln, dinner: dn, total, target,
      splitPct: {
        breakfast: total ? Math.round(bk * 100 / total) : 0,
        lunch:     total ? Math.round(ln * 100 / total) : 0,
        dinner:    total ? Math.round(dn * 100 / total) : 0,
      },
    },
    proteinsCovered,
    proteinsMissing,
    oilGramsEstimate:   Math.round(oilG),
    saltGramsEstimate:  Math.round(saltG * 10) / 10,
    sugarGramsEstimate: Math.round(sugarG),
    highOilDishes,
    highSaltDishes,
    highSugarDishes,
    distinctFoods:   distinct.size,
    cookMethodCount: methodSet.size,
  };
}

/** Status tint by ratio of actual / cap. */
export function capStatus(actual: number, cap: number): 'good' | 'warn' | 'over' {
  if (actual <= cap * 0.9) return 'good';
  if (actual <= cap * 1.1) return 'warn';
  return 'over';
}

/** Same, inverted — for the kcal split where we want each meal to be
 *  NEAR a target percent (30/40/30). */
export function splitStatus(actualPct: number, targetPct: number): 'good' | 'warn' | 'off' {
  const delta = Math.abs(actualPct - targetPct);
  if (delta <= 5)  return 'good';
  if (delta <= 10) return 'warn';
  return 'off';
}
