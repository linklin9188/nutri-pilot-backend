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
 *   4. Score each candidate using the FULL main-menu axis set
 *      (TICKET-062 P0 — 拍冰箱推荐不能降级):
 *        - ingredient match bonus (scan-specific, primary signal)
 *        - dietaryGoal (axis 2, health_benefit_tag match)
 *        - tastePref (axis 3, flavor_tag match)
 *        - spice (axis 5)
 *        - xiaomei robot bonus
 *        - HOMETOWN (axis 1) — hometownMatches + DB bucket fallback
 *        - prefScores (axis 4) — usagePower × sigmoidWeight (cold-start
 *          0.35 → 1.50 confidence-scaled), 跟主算法严格同公式
 *        - family per-member (TICKET-062) — 每位家人独立按 goal/allergy
 *          算 weighted, household 总分 = 加权平均 (避免家人多分爆)
 *        - 20-dim feature_vector cosine similarity (TICKET-062) — 若
 *          user_profiles.preference_vector + dish.feature_vector 都有
 *          就 += sim * 0.25; 任一缺失就 skip 这一轴, 不 break
 *        - avoid_tags hard filter (allergens)
 *        - fridge mode: low-oil bonus / deep-fry penalty
 *   5. Return top N real DB rows. Each carries prep_steps_json,
 *      cook_steps_json, image_url, nutrition fields — so the user can
 *      tap "+ 今日菜单" / "看做法" / "进采购清单" directly.
 *
 * NOTE: scanMatch 不进 user_weekly_menus cache，因此 ALGO_VERSION
 * 不需要 bump。但算法行为已与主菜单 scoreForWeek 对齐 (TICKET-062
 * 老板真测 #7 验收: 拍冰箱不能再用降级算法)。
 */
import { supabase } from './supabase';
import { getUserId } from './userId';
import { getUserPrefs } from './userPrefs';
import type { CuisineMode } from './cuisineFilter';
import { applyCuisineFilter } from './cuisineFilter';
import { hometownMatches } from './hometownBuckets';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from '../hooks/preferenceColMap';
import { loadFamilyMembers, loadHomeToday } from './familyPrefs';
import {
  dishToVector,
  cosineSimilarity,
  VECTOR_DIM,
} from './recommendVector';

// Inline mirror of familyPrefs.GOAL_TO_DB_TAGS (module-private over there).
// Keeping a local copy avoids broadening familyPrefs API just for scanMatch.
// 改一处时同步两处 (file-level grep "GOAL_TO_DB_TAGS").
const GOAL_TO_DB_TAGS_PROXY: Record<string, string[]> = {
  muscle_gain: ['muscle_gain'],
  fat_loss:    ['fat_loss', 'lose_weight'],
  blood_tonic: ['nourish'],
  growth:      ['muscle_gain', 'maintain'],
  nourish:     ['nourish'],
  maintain:    ['maintain'],
};

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

// ── prefScores helpers (跟 useWeeklyMenu 严格同公式) ───────────────────

/**
 * Unwrap Backend rollup 写 user_profiles.pref_scores 的 jsonb 形态:
 *   {"pmc:red": {score: 0.8, n: 35}, ...}
 * → flat Record<string, number>. confWeight: n>=30 → 1.50, else 0.35.
 * 兼容 user_preference_scores 旧 number 形态.
 */
function unwrapPrefScoresJsonb(raw: Record<string, any>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw ?? {})) {
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

/** usagePower(n) — power curve 跟 useWeeklyMenu 一致: sign * |n|^1.5 * 0.05 */
function usagePower(n: number): number {
  if (!n) return 0;
  const sign = n >= 0 ? 1 : -1;
  return sign * Math.pow(Math.abs(n), 1.5) * 0.05;
}

/**
 * 一次性 load: prefScores (DB user_profiles.pref_scores 优先 →
 * user_preference_scores 兜底) + preference_vector (20 维, 缺失返 null).
 * Anonymous user → 空对象 / null.
 */
async function loadUserContext(): Promise<{
  prefScores: Record<string, number>;
  userVector: number[] | null;
  hometownCuisine: string | null;
}> {
  const userId = getUserId();
  if (!userId || userId === 'anonymous') {
    return { prefScores: {}, userVector: null, hometownCuisine: null };
  }

  let prefScores: Record<string, number> = {};
  let userVector: number[] | null = null;
  let hometownCuisine: string | null = null;

  try {
    const { data: profRow } = await supabase
      .from('user_profiles')
      .select('pref_scores, preference_vector, hometown_cuisine')
      .eq('id', userId)
      .single()
      .then(r => r, () => ({ data: null }));

    const ps = (profRow as any)?.pref_scores;
    if (ps && typeof ps === 'object' && Object.keys(ps).length > 0) {
      prefScores = unwrapPrefScoresJsonb(ps);
    }

    hometownCuisine = (profRow as any)?.hometown_cuisine ?? null;

    const rawVec = (profRow as any)?.preference_vector;
    if (rawVec && Array.isArray(rawVec) && rawVec.length === VECTOR_DIM) {
      const arr = rawVec.map((x: any) => typeof x === 'number' ? x : parseFloat(String(x)));
      if (!arr.some((x: number) => !Number.isFinite(x))) userVector = arr;
    }
  } catch { /* user_profiles 读失败 → 退 user_preference_scores */ }

  if (Object.keys(prefScores).length === 0) {
    try {
      const { data: scoreRow } = await supabase
        .from('user_preference_scores')
        .select('*')
        .eq('user_id', userId)
        .single()
        .then(r => r, () => ({ data: null }));
      prefScores = (scoreRow as any) ?? {};
    } catch { /* 双失败 → 留空 */ }
  }

  return { prefScores, userVector, hometownCuisine };
}

/**
 * Family per-member score — TICKET-062.
 * 对每个 home member 独立按 goal / allergy 算偏好, household 总分 = 加权平均
 * (而不是累加, 防止家人多分爆). 每个家人最多贡献 +0.30 (goal hit) + 0.15 (no allergy).
 */
function familyPerMemberScore(dish: { health_benefit_tags?: string[] | null; main_ingredient?: string | null }): number {
  const members = loadFamilyMembers();
  if (members.length === 0) return 0;

  const homeIds = loadHomeToday(members);
  const home = members.filter(m => homeIds.includes(m.id));
  const active = home.length > 0 ? home : members;
  if (active.length === 0) return 0;

  const healthTags: string[] = dish.health_benefit_tags ?? [];
  const ingredient = (dish.main_ingredient ?? '').toLowerCase();

  let total = 0;
  for (const m of active) {
    let memberScore = 0;
    // Goal hit — 任一 goal 命中 health_benefit_tags 给 +0.30
    for (const goal of m.goals ?? []) {
      const tags = GOAL_TO_DB_TAGS_PROXY[goal] ?? [goal];
      if (tags.some((t: string) => healthTags.includes(t))) {
        memberScore += 0.30;
        break;
      }
    }
    // Allergy — 命中该家人 allergy ingredient → -0.20 (软, 不硬过滤; allergy 硬过滤已在
    // getUserPrefs avoidIngredients 上层做了, 这里只做 per-member 信号)
    for (const a of m.allergies ?? []) {
      const ingList = (a in ALLERGY_INGREDIENT_LITE) ? ALLERGY_INGREDIENT_LITE[a] : [];
      if (ingList.some((x: string) => ingredient.includes(x))) {
        memberScore -= 0.20;
        break;
      }
    }
    total += memberScore;
  }
  return total / active.length; // 加权平均, household 维度
}

const ALLERGY_INGREDIENT_LITE: Record<string, string[]> = {
  seafood:   ['seafood','fish','shrimp','crab','squid','scallop','clam','oyster','salmon'],
  dairy:     ['dairy','milk','cheese','butter'],
  peanut:    ['peanut'],
  gluten:    ['wheat','barley'],
  beef_lamb: ['beef','lamb','mutton'],
  egg:       ['egg'],
};

/**
 * Query + score + rank DB dishes against scanned ingredients.
 *
 * Pulls dishes where main_ingredient is in the normalized set OR has
 * veggie/grain (always-relevant pantry items). Then scores by full
 * main-menu axes (TICKET-062 — 不再降级).
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
  // 加上 feature_vector 字段以喂 20-dim cosine 轴 (缺失则该轴 skip).
  let query = supabase
    .from('dishes')
    .select('id, title_zh, title_en, image_url, description_zh, origin_cuisine, main_ingredient, course_type, flavor_tags, health_benefit_tags, nutrition_kcal_per_serving, cook_method, oil_level, salt_level, xiaomei_compatible, spice_level, cuisine_zh, feature_vector')
    .in('main_ingredient', ingArray)
    .not('prep_steps_json', 'is', null)   // only suggest dishes we can actually cook
    .limit(120);                           // generous before scoring + cap

  // Profile filters
  if (prefs.vegetarianOnly) query = query.eq('is_vegan', true);
  query = applyCuisineFilter(query, opts.cuisineMode ?? 'all');

  const { data, error } = await query;
  if (error || !data) return [];

  // Load 用户上下文 (prefScores + preference_vector + hometown) — 一次性, 不进 loop
  const { prefScores, userVector, hometownCuisine } = await loadUserContext();

  // 算 sigmoid weight (cold-start 0.35 → 老用户 1.50)，跟主算法严格同公式
  const learnedSignals = Object.values(prefScores)
    .filter(v => typeof v === 'number' && v !== 0).length;
  const sigmoidWeight = 0.35 + 1.15 * (1 - Math.exp(-learnedSignals / 15));

  // 用户家乡 (优先 DB hometown_cuisine, 缺失退 localStorage)
  const userHometown = hometownCuisine ?? prefs.hometownCuisine;

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

    // ── A0. Ingredient match (scan-specific primary signal) ──────────
    const matched: string[] = [];
    if (d.main_ingredient && ingredients.has(d.main_ingredient)) {
      matched.push(d.main_ingredient);
    }
    const matched_count = matched.length;
    score += matched_count * 0.40;

    // ── A1. Hometown (axis 1) — hometownMatches + DB bucket fallback ──
    if (hometownMatches(userHometown, d.origin_cuisine)) {
      score += 0.30;
    }

    // ── A2. Dietary goal (axis 2) ─────────────────────────────────────
    if (prefs.dietaryGoal && health.includes(prefs.dietaryGoal)) score += 0.30;

    // ── A3. Taste preference (axis 3) ─────────────────────────────────
    if (prefs.tastePref && flavor.includes(prefs.tastePref)) score += 0.20;

    // ── A4. prefScores 学习数据 (axis 4) — usagePower × sigmoidWeight ─
    // 跟主算法严格同公式: cuisine ×1.0, flavor / health ×0.6.
    if (Object.keys(prefScores).length > 0) {
      for (const tag of flavor) {
        const col = FLAVOR_COL[tag];
        if (col && prefScores[col]) score += usagePower(prefScores[col]) * 0.6 * sigmoidWeight;
      }
      for (const tag of health) {
        const col = HEALTH_COL[tag];
        if (col && prefScores[col]) score += usagePower(prefScores[col]) * 0.6 * sigmoidWeight;
      }
      const origin = d.origin_cuisine ?? '';
      const cuisineCol = CUISINE_COL[origin];
      if (cuisineCol && prefScores[cuisineCol]) {
        score += usagePower(prefScores[cuisineCol]) * 1.0 * sigmoidWeight;
      }
    }

    // ── A5. Spice (axis 5) ────────────────────────────────────────────
    if (prefs.spiceBoost !== 0 && flavor.includes('spicy')) score += prefs.spiceBoost;

    // ── A6. Family per-member (TICKET-062) ────────────────────────────
    score += familyPerMemberScore(d);

    // ── A7. 20-dim feature_vector cosine similarity (TICKET-062) ──────
    // 任一缺失 → skip 这一轴, 不让它 break.
    if (userVector) {
      const raw = d.feature_vector;
      const dishVec: number[] | null = (raw && Array.isArray(raw) && raw.length === VECTOR_DIM)
        ? raw.map((x: any) => typeof x === 'number' ? x : parseFloat(String(x)))
        : null;
      const finalVec = dishVec && !dishVec.some(x => !Number.isFinite(x))
        ? dishVec
        : dishToVector(d);  // 兜底: 现场算 vector (跟主算法 cascade 模式一致)
      if (finalVec.length === VECTOR_DIM) {
        const sim = cosineSimilarity(userVector, finalVec);
        score += sim * 0.25;
      }
    }

    // ── A8. Robot boost ───────────────────────────────────────────────
    if (hasXiaomei && d.xiaomei_compatible) score += 0.15;

    // ── A9. Fridge mode: prefer light / low-oil / no deep-fried ───────
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
