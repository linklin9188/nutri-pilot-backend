/**
 * scanMatch.ts — turn Gemini-detected ingredients into REAL DB dish
 * recommendations (not made-up names).
 *
 * Old flow burned Gemini tokens twice (once for ingredients, once to
 * invent dish names) and returned strings that didn't link back to
 * anything actionable — no steps, no image, no nutrition, can't add
 * to weekly menu.
 *
 * New flow:
 *   1. Gemini Vision → list of Chinese ingredient names (cheap, small output)
 *   2. Normalize ingredient names to our DB main_ingredient enum
 *      ('番茄' → 'veggie'; '三文鱼' → 'salmon'/'fish'; '猪扒' → 'pork')
 *   3. SQL query dishes that match ANY normalized ingredient, with full
 *      profile filtering (avoid_tags / vegan / cuisine mode)
 *   4. Score each candidate:
 *        - base scoreDish (5-axis + spice + xiaomei + meal-time biases)
 *        - + ingredient-match bonus (more visible ingredients = better)
 *        - + freshness bonus (quick dishes float to top for fridge scan)
 *   5. Return top N real DB rows. Each carries prep_steps_json,
 *      cook_steps_json, image_url, nutrition fields — so the user can
 *      tap "+ 今日菜单" / "看做法" / "进采购清单" directly.
 */
import { supabase } from './supabase';
import { getUserPrefs } from './userPrefs';
import type { CuisineMode } from './cuisineFilter';
import { applyCuisineFilter } from './cuisineFilter';

// ── Ingredient normalization ────────────────────────────────────────
//
// Maps the loose Chinese ingredient names Gemini gives us back to the
// 29 main_ingredient enum values our dishes table actually uses.
// Order matters slightly (more specific keywords first) — we longest-
// substring-match.

const INGREDIENT_MAP: Array<{ kw: string[]; main: string }> = [
  // ── proteins ──
  { kw: ['牛排','牛柳','牛腩','牛肋','牛颈','牛腱','牛肉','牛腿','一口牛','牛腱子','beef','steak'],          main: 'beef' },
  { kw: ['五花肉','猪扒','排骨','里脊','梅头','猪颈','猪柳','猪软骨','猪肘','猪手','猪蹄','叉烧','烧肉','猪肉','pork','pork chop'],     main: 'pork' },
  { kw: ['鸡腿','鸡翅','鸡胸','鸡排','鸡肉','鸡丁','整鸡','chicken'],                                        main: 'chicken' },
  { kw: ['鸭肉','烧鸭','烤鸭','duck'],                                                                          main: 'duck' },
  { kw: ['羊肉','羊排','羊扒','羊腿','lamb','mutton'],                                                          main: 'lamb' },
  // ── seafood ──
  { kw: ['三文鱼','鲑鱼','salmon'],                                                                            main: 'salmon' },
  { kw: ['鳕鱼','鲈鱼','黄鱼','带鱼','鲭鱼','鳗鱼','鲷鱼','鱼','鱼片','鱼柳','fish','cod'],                  main: 'fish' },
  { kw: ['虾','虾仁','大虾','明虾','shrimp','prawn'],                                                          main: 'shrimp' },
  { kw: ['蟹','蟹肉','crab'],                                                                                  main: 'crab' },
  { kw: ['鱿鱼','squid'],                                                                                       main: 'squid' },
  { kw: ['扇贝','scallop'],                                                                                     main: 'scallop' },
  { kw: ['蛤','蛤蜊','clam'],                                                                                   main: 'clam' },
  { kw: ['牡蛎','生蚝','蚝','oyster'],                                                                          main: 'oyster' },
  // ── plant proteins ──
  { kw: ['豆腐','tofu'],                                                                                         main: 'tofu' },
  { kw: ['豆干','千张','腐竹','纳豆','黄豆','黑豆','大豆','soy','soybean'],                                   main: 'soy' },
  // ── eggs & dairy ──
  { kw: ['鸡蛋','蛋','蛋液','egg'],                                                                            main: 'egg' },
  { kw: ['牛奶','奶','酸奶','奶酪','起司','芝士','奶油','黄油','炼乳','奶粉','dairy','milk','cheese','butter','yogurt'], main: 'dairy' },
  // ── carbs ──
  { kw: ['米饭','米','大米','糯米','白饭','炒饭','rice'],                                                      main: 'carb' },
  { kw: ['面','面条','面粉','面包','馒头','花卷','包子','饺子','馄饨','粉丝','米线','米粉','河粉','通心粉','意粉','燕麦','糙米','黑米','小米','玉米','藜麦','薯','番薯','红薯','土豆','马铃薯','noodle','bread','pasta'], main: 'grain' },
  // ── vegetables (covers most "veggie" main_ingredient dishes) ──
  { kw: ['番茄','西红柿','tomato'],                                                                            main: 'veggie' },
  { kw: ['白菜','油菜','菜心','菠菜','芥兰','芥蓝','通菜','空心菜','西兰花','椰菜花','花椰菜','花菜','生菜','苋菜','上海青','油麦菜','茼蒿','芹菜','韭菜','苦瓜','黄瓜','茄子','彩椒','青椒','辣椒','胡萝卜','洋葱','蘑菇','香菇','金针菇','平菇','冬菇','木耳','云耳','南瓜','冬瓜','节瓜','丝瓜','胜瓜','西葫芦','节瓜','芦笋','莲藕','藕','山药','vegetable','cabbage','spinach','kale','onion','carrot','potato','mushroom','eggplant','bell pepper'], main: 'veggie' },
  // ── grain alias (some titles say grain but in DB it's grain proper) ──
  { kw: ['谷','米谷','wheat','barley','quinoa'],                                                                main: 'grain' },
  // ── fruit (rare in lunch/dinner) ──
  { kw: ['苹果','香蕉','橙','柠檬','梨','葡萄','草莓','蓝莓','fruit','apple','banana','orange','lemon'],     main: 'fruit' },
];

/** Map a single Chinese ingredient name to our DB main_ingredient enum. */
export function normalizeIngredient(raw: string): string | null {
  const s = (raw ?? '').toLowerCase().trim();
  if (!s) return null;
  for (const entry of INGREDIENT_MAP) {
    if (entry.kw.some(k => s.includes(k.toLowerCase()))) return entry.main;
  }
  return null;
}

/** Convert a Gemini ingredients array to a SET of distinct DB enum values. */
export function normalizeIngredients(raw: string[]): Set<string> {
  const out = new Set<string>();
  for (const r of raw ?? []) {
    const norm = normalizeIngredient(r);
    if (norm) out.add(norm);
  }
  return out;
}

// ── Matched dish ────────────────────────────────────────────────────

export interface MatchedDish {
  id: string;
  title_zh: string;
  title_en: string | null;
  image_url: string | null;
  description_zh: string | null;
  origin_cuisine: string | null;
  main_ingredient: string | null;
  course_type: string | null;
  flavor_tags: string[] | null;
  health_benefit_tags: string[] | null;
  nutrition_kcal_per_serving: number | null;
  cook_method: string | null;
  oil_level: 'low' | 'mid' | 'high' | null;
  xiaomei_compatible: boolean | null;
  /** Scan-specific: how many of the user's scanned ingredients this
   *  dish actually uses. Drives the "uses 3 of your ingredients" UI. */
  matched_count: number;
  matched_ingredients: string[];
  /** Final score (used to debug + rank). */
  score: number;
}

export interface ScanMatchOptions {
  /** Normalized ingredient set (from normalizeIngredients). */
  ingredients: Set<string>;
  /** Cuisine filter respect (从 Home 的 cuisineMode toggle). */
  cuisineMode?: CuisineMode;
  /** Hard limit returned. */
  limit?: number;
  /** Fridge mode prefers quick, all-ingredients-on-hand dishes;
   *  market mode is OK with dishes that need 1-2 extra grocery items. */
  scene?: 'fridge' | 'market';
}

/**
 * Query + score + rank DB dishes against scanned ingredients.
 *
 * Pulls dishes where main_ingredient is in the normalized set OR has
 * veggie/grain (always-relevant pantry items). Then scores by:
 *   - base axes (hometown × goal × taste × spice from getUserPrefs)
 *   - +0.40 per matched ingredient (so a dish using 3 visible items
 *     out-scores one using 1)
 *   - +0.20 fridge-mode bonus for cook_time_min ≤ 20 (quick win)
 *   - hard-filters: avoid_tags (allergens) + cuisineMode
 *
 * Returns top N real DB rows, fully populated (image, steps, kcal).
 */
export async function suggestDishesFromScan(opts: ScanMatchOptions): Promise<MatchedDish[]> {
  const ingredients = opts.ingredients;
  if (ingredients.size === 0) return [];

  const ingArray = [...ingredients];
  const limit = opts.limit ?? 6;
  const prefs = getUserPrefs();

  // Pull candidates: main_ingredient matches ANY scanned ingredient.
  // We don't filter by meal_type — scan output is meal-agnostic; user
  // decides whether to use the dish for lunch or dinner.
  let query = supabase
    .from('dishes')
    .select('id, title_zh, title_en, image_url, description_zh, origin_cuisine, main_ingredient, course_type, flavor_tags, health_benefit_tags, nutrition_kcal_per_serving, cook_method, oil_level, salt_level, xiaomei_compatible')
    .in('main_ingredient', ingArray)
    .not('prep_steps_json', 'is', null)   // only suggest dishes we can actually cook
    .limit(120);                           // generous before scoring + cap

  // Profile filters
  if (prefs.vegetarianOnly) query = query.eq('is_vegan', true);
  query = applyCuisineFilter(query, opts.cuisineMode ?? 'all');

  const { data, error } = await query;
  if (error || !data) return [];

  // Score
  const hasXiaomei = typeof localStorage !== 'undefined' && localStorage.getItem('has_xiaomei_robot') === 'true';
  const isFridge = opts.scene === 'fridge';

  const scored: MatchedDish[] = data.map((d: any) => {
    const flavor: string[] = d.flavor_tags ?? [];
    const health: string[] = d.health_benefit_tags ?? [];

    // Hard filter — avoid tags (allergens + spice level penalties)
    if (prefs.avoidTags.some(t => flavor.includes(t) || health.includes(t))) return null as any;
    if (prefs.avoidIngredients.includes(d.main_ingredient)) return null as any;

    let score = 0;

    // Ingredient match (the primary signal for a scan)
    const matched: string[] = [];
    if (d.main_ingredient && ingredients.has(d.main_ingredient)) {
      matched.push(d.main_ingredient);
    }
    const matched_count = matched.length;
    score += matched_count * 0.40;

    // Pref alignment (subset of full scoreDish for speed — hometown
    // doesn't apply for a scan, only goal + taste + spice)
    if (prefs.dietaryGoal && health.includes(prefs.dietaryGoal)) score += 0.30;
    if (prefs.tastePref && flavor.includes(prefs.tastePref))     score += 0.20;
    if (prefs.spiceBoost !== 0 && flavor.includes('spicy'))      score += prefs.spiceBoost;

    // Robot boost
    if (hasXiaomei && d.xiaomei_compatible) score += 0.15;

    // Fridge mode: prefer light / low-oil / no deep-fried — user is
    // already at home and likely wants the simpler win.
    if (isFridge) {
      if (d.oil_level === 'low') score += 0.10;
      if (d.cook_method === 'deep_fry') score -= 0.15;
    }

    return {
      id: d.id,
      title_zh: d.title_zh,
      title_en: d.title_en,
      image_url: d.image_url,
      description_zh: d.description_zh,
      origin_cuisine: d.origin_cuisine,
      main_ingredient: d.main_ingredient,
      course_type: d.course_type,
      flavor_tags: d.flavor_tags,
      health_benefit_tags: d.health_benefit_tags,
      nutrition_kcal_per_serving: d.nutrition_kcal_per_serving,
      cook_method: d.cook_method,
      oil_level: d.oil_level,
      xiaomei_compatible: d.xiaomei_compatible,
      matched_count,
      matched_ingredients: matched,
      score,
    } as MatchedDish;
  }).filter(Boolean) as MatchedDish[];

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
