/**
 * recommendVector.ts — Manual 20-dim feature vector + cosine similarity 推荐
 *
 * TICKET-034 (SPEC_settings大重构_老板拍板 §0.3)
 *
 * 老板拍板"嵌入向量"算法范式 (Spotify / Netflix 同款), 但**不**用 Gemini
 * embedding + pgvector — 现阶段用户量小, manual 20 维已足够; pgvector 是
 * 未来主义, 等数据飞轮跑起来再升级.
 *
 * 20 维构成:
 *   - cuisine onehot           5 维 [0..4]
 *   - spice_level              1 维 [5]      (0-1 归一化)
 *   - main_ingredient family   8 维 [6..13]
 *   - cooking_method onehot    6 维 [14..19]
 *
 * 算法流程:
 *   1. dishToVector(dish) → 每道菜算一个 20 维向量 (预计算 by
 *      scripts/compute-dish-feature-vector.ts, 写 dishes.feature_vector)
 *   2. userVectorFromSelectedDishes(vectors) → onboarding 选的代表菜
 *      vector 加权平均 → 写 user_profiles.preference_vector
 *   3. recommendDishesByVector(userVec, allDishes, opts):
 *      a. 过敏硬过滤 (排 allergens 命中)
 *      b. cosine similarity 排序 top 100
 *      c. 营养目标重排 (fat_loss/muscle_gain/child_growth/elder_wellness)
 *      d. 返回 top count
 *
 * 兼容性: 旧用户 (无 preference_vector) → useWeeklyMenu fallback 旧
 * scoreDish 路径不动. 新算法 cascade 接入 generateWeekPlan 前面.
 */

// ─── 20 维 vector 索引常量 ───────────────────────────────────────────────
export const VECTOR_DIM = 20;

// cuisine 5 维 [0..4]
const IDX_CUISINE_CHINESE = 0;
const IDX_CUISINE_WESTERN = 1;
const IDX_CUISINE_JAPANESE_KOREAN = 2;
const IDX_CUISINE_MIXED = 3;
const IDX_CUISINE_FUSION = 4;

// spice 1 维 [5]
const IDX_SPICE = 5;

// main_ingredient family 8 维 [6..13]
const IDX_ING_RED_MEAT = 6;
const IDX_ING_WHITE_MEAT = 7;
const IDX_ING_SEAFOOD = 8;
const IDX_ING_VEGETABLE = 9;
const IDX_ING_TOFU = 10;
const IDX_ING_EGG = 11;
const IDX_ING_CARB = 12;
const IDX_ING_MIXED = 13;

// cooking_method 6 维 [14..19]
const IDX_METHOD_STEAM = 14;
const IDX_METHOD_STIR_FRY = 15;
const IDX_METHOD_BRAISE = 16;
const IDX_METHOD_BOIL = 17;
const IDX_METHOD_GRILL = 18;
const IDX_METHOD_DEEP_FRY = 19;

// ─── cuisine 映射 (DB string → 5-class onehot) ──────────────────────────
const CUISINE_TO_CLASS: Record<string, number> = {
  // chinese: 包含所有中餐子菜系
  chinese: IDX_CUISINE_CHINESE,
  cantonese: IDX_CUISINE_CHINESE,
  guangdong: IDX_CUISINE_CHINESE,
  sichuan: IDX_CUISINE_CHINESE,
  hunan: IDX_CUISINE_CHINESE,
  jiangnan: IDX_CUISINE_CHINESE,
  hk: IDX_CUISINE_CHINESE,
  hongkong: IDX_CUISINE_CHINESE,
  jiangsu: IDX_CUISINE_CHINESE,
  zhejiang: IDX_CUISINE_CHINESE,
  shanghai: IDX_CUISINE_CHINESE,
  shandong: IDX_CUISINE_CHINESE,
  fujian: IDX_CUISINE_CHINESE,
  anhui: IDX_CUISINE_CHINESE,
  hakka: IDX_CUISINE_CHINESE,
  northern: IDX_CUISINE_CHINESE,
  northeast: IDX_CUISINE_CHINESE,
  northwest: IDX_CUISINE_CHINESE,
  southwest: IDX_CUISINE_CHINESE,
  east: IDX_CUISINE_CHINESE,
  taiwan: IDX_CUISINE_CHINESE,
  // western
  western: IDX_CUISINE_WESTERN,
  italian: IDX_CUISINE_WESTERN,
  french: IDX_CUISINE_WESTERN,
  american: IDX_CUISINE_WESTERN,
  spanish: IDX_CUISINE_WESTERN,
  german: IDX_CUISINE_WESTERN,
  british: IDX_CUISINE_WESTERN,
  mediterranean: IDX_CUISINE_WESTERN,
  // japanese_korean
  japanese: IDX_CUISINE_JAPANESE_KOREAN,
  korean: IDX_CUISINE_JAPANESE_KOREAN,
  japanese_korean: IDX_CUISINE_JAPANESE_KOREAN,
  // fusion
  fusion: IDX_CUISINE_FUSION,
  thai: IDX_CUISINE_FUSION,
  vietnamese: IDX_CUISINE_FUSION,
  indian: IDX_CUISINE_FUSION,
  southeast_asian: IDX_CUISINE_FUSION,
  // mixed (default)
};

// ─── main_ingredient family 映射 ────────────────────────────────────────
const INGREDIENT_TO_FAMILY: Record<string, number> = {
  // red_meat
  pork: IDX_ING_RED_MEAT,
  beef: IDX_ING_RED_MEAT,
  lamb: IDX_ING_RED_MEAT,
  mutton: IDX_ING_RED_MEAT,
  game: IDX_ING_RED_MEAT,
  // white_meat
  chicken: IDX_ING_WHITE_MEAT,
  duck: IDX_ING_WHITE_MEAT,
  poultry: IDX_ING_WHITE_MEAT,
  rabbit: IDX_ING_WHITE_MEAT,
  // seafood
  fish: IDX_ING_SEAFOOD,
  shrimp: IDX_ING_SEAFOOD,
  shellfish: IDX_ING_SEAFOOD,
  squid: IDX_ING_SEAFOOD,
  salmon: IDX_ING_SEAFOOD,
  clam: IDX_ING_SEAFOOD,
  seafood: IDX_ING_SEAFOOD,
  crab: IDX_ING_SEAFOOD,
  hairtail: IDX_ING_SEAFOOD,
  seabass: IDX_ING_SEAFOOD,
  oyster: IDX_ING_SEAFOOD,
  scallop: IDX_ING_SEAFOOD,
  sea_cucumber: IDX_ING_SEAFOOD,
  lobster: IDX_ING_SEAFOOD,
  tuna: IDX_ING_SEAFOOD,
  cod: IDX_ING_SEAFOOD,
  // vegetable
  veggie: IDX_ING_VEGETABLE,
  vegetable: IDX_ING_VEGETABLE,
  mushroom: IDX_ING_VEGETABLE,
  // tofu
  tofu: IDX_ING_TOFU,
  soy: IDX_ING_TOFU,
  soybean: IDX_ING_TOFU,
  // egg
  egg: IDX_ING_EGG,
  duck_egg: IDX_ING_EGG,
  dairy: IDX_ING_EGG,
  milk: IDX_ING_EGG,
  cheese: IDX_ING_EGG,
  // carb
  carb: IDX_ING_CARB,
  rice: IDX_ING_CARB,
  grain: IDX_ING_CARB,
  noodle: IDX_ING_CARB,
  staple: IDX_ING_CARB,
  bread: IDX_ING_CARB,
  pasta: IDX_ING_CARB,
  // mixed (fallback: other / null)
};

// ─── cooking method 映射 (DB cook_method enum + title keyword fallback) ─
// DB cook_method common values: steam / stir_fry / braise / boil /
// grill / roast / deep_fry / stew / cold / pan_fry / etc.
const METHOD_TO_INDEX: Record<string, number> = {
  steam: IDX_METHOD_STEAM,
  poached: IDX_METHOD_STEAM,
  stir_fry: IDX_METHOD_STIR_FRY,
  stirfry: IDX_METHOD_STIR_FRY,
  pan_fry: IDX_METHOD_STIR_FRY,
  sauté: IDX_METHOD_STIR_FRY,
  braise: IDX_METHOD_BRAISE,
  redbraise: IDX_METHOD_BRAISE,
  stew: IDX_METHOD_BRAISE,
  boil: IDX_METHOD_BOIL,
  soup: IDX_METHOD_BOIL,
  blanch: IDX_METHOD_BOIL,
  grill: IDX_METHOD_GRILL,
  roast: IDX_METHOD_GRILL,
  bake: IDX_METHOD_GRILL,
  bbq: IDX_METHOD_GRILL,
  deep_fry: IDX_METHOD_DEEP_FRY,
  fry: IDX_METHOD_DEEP_FRY,
};

// title keyword → method index (fallback when dish.cook_method 空)
const TITLE_METHOD_KEYWORDS: Array<[string, number]> = [
  ['清蒸', IDX_METHOD_STEAM],
  ['蒸', IDX_METHOD_STEAM],
  ['炒', IDX_METHOD_STIR_FRY],
  ['爆', IDX_METHOD_STIR_FRY],
  ['煎', IDX_METHOD_STIR_FRY],
  ['红烧', IDX_METHOD_BRAISE],
  ['烧', IDX_METHOD_BRAISE],
  ['焖', IDX_METHOD_BRAISE],
  ['炖', IDX_METHOD_BRAISE],
  ['卤', IDX_METHOD_BRAISE],
  ['煲', IDX_METHOD_BOIL],
  ['汤', IDX_METHOD_BOIL],
  ['煮', IDX_METHOD_BOIL],
  ['烤', IDX_METHOD_GRILL],
  ['焗', IDX_METHOD_GRILL],
  ['炸', IDX_METHOD_DEEP_FRY],
  ['酥', IDX_METHOD_DEEP_FRY],
];

// ─── 公开类型 ─────────────────────────────────────────────────────────────
export interface DishLike {
  id?: string;
  title_zh?: string | null;
  title_en?: string | null;
  cuisine_zh?: string | null;
  origin_cuisine?: string | null;
  spice_level?: number | string | null;
  main_ingredient?: string | null;
  cook_method?: string | null;
  cooking_method?: string | null;
  // 营养 (重排用)
  protein_g?: number | null;
  fat_g?: number | null;
  carb_g?: number | null;
  calcium_mg?: number | null;
  salt_level?: number | string | null;
  oil_level?: number | string | null;
  nutrition_kcal_per_serving?: number | null;
  // allergen 命中检测用 (复用 ALLERGEN_TO_INGREDIENTS 思路)
  flavor_tags?: string[] | null;
  health_benefit_tags?: string[] | null;
}

export interface RecommendOptions {
  dietaryGoal?: string | null;     // muscle_gain / fat_loss / child_growth / elder_wellness / general
  allergens?: string[];             // ['seafood','gluten','nuts','milk','eggs']
  count?: number;                   // default 25
  topNAfterSim?: number;            // default 100
}

// ─── 内部 helper ─────────────────────────────────────────────────────────
function normalizeSpice(spice: number | string | null | undefined): number {
  if (spice === null || spice === undefined) return 0;
  if (typeof spice === 'number') {
    // 假设 0-5 整数 → /5; 已 ≤1 不变
    if (spice <= 1) return Math.max(0, spice);
    return Math.max(0, Math.min(1, spice / 5));
  }
  const s = String(spice).toLowerCase().trim();
  if (s === 'none' || s === 'no' || s === '0') return 0;
  if (s === 'mild' || s === 'light' || s === '微辣') return 0.3;
  if (s === 'medium' || s === 'med' || s === '中辣') return 0.6;
  if (s === 'heavy' || s === 'hot' || s === 'spicy' || s === '辣' || s === '重辣') return 1.0;
  // 兜底数值串
  const n = Number(s);
  if (!isNaN(n)) return Math.max(0, Math.min(1, n / 5));
  return 0;
}

// ALLERGEN_TO_INGREDIENTS 复刻 (避免循环依赖 useSupabaseMenu)
const ALLERGEN_TO_INGREDIENTS_LOCAL: Record<string, Set<string>> = {
  seafood: new Set([
    'seafood','fish','shrimp','crab','shellfish','squid','scallop',
    'clam','lobster','salmon','tuna','cod','hairtail','seabass','oyster',
  ]),
  fish: new Set(['fish','salmon','tuna','cod','hairtail','seabass']),
  dairy: new Set(['dairy','milk','cheese','butter','cream','yogurt']),
  milk: new Set(['dairy','milk','cheese','butter','cream','yogurt']),
  eggs: new Set(['egg','duck_egg']),
  egg: new Set(['egg','duck_egg']),
  gluten: new Set(['wheat','flour','noodle','bread','dumpling','bun']),
  soy: new Set(['tofu','soy','soybean','soy_milk','tofu_skin']),
  nuts: new Set(['almond','walnut','cashew','hazelnut','pistachio','pine_nut','pecan','macadamia','peanut']),
  tree_nuts: new Set(['almond','walnut','cashew','hazelnut','pistachio','pine_nut','pecan','macadamia']),
  peanut: new Set(['peanut']),
  beef: new Set(['beef']),
  pork: new Set(['pork']),
  lamb: new Set(['lamb','mutton']),
};

function dishHasAllergen(dish: DishLike, allergen: string): boolean {
  const ing = (dish.main_ingredient ?? '').toLowerCase();
  const set = ALLERGEN_TO_INGREDIENTS_LOCAL[allergen.toLowerCase()];
  if (set && ing && set.has(ing)) return true;
  // title keyword 兜底 (用于 seafood / dairy 在 main_ingredient 漏标时)
  const title = ((dish.title_zh ?? '') + ' ' + (dish.title_en ?? '')).toLowerCase();
  if (allergen.toLowerCase() === 'dairy' || allergen.toLowerCase() === 'milk') {
    if (/(芝士|奶酪|奶油|黄油|牛奶|cheese|cream|butter|milk)/.test(title)) return true;
  }
  if (allergen.toLowerCase() === 'peanut') {
    if (/(花生|peanut)/.test(title)) return true;
  }
  return false;
}

// ─── 1. dishToVector ─────────────────────────────────────────────────────
export function dishToVector(dish: DishLike): number[] {
  const v = new Array<number>(VECTOR_DIM).fill(0);

  // cuisine 5 维 onehot
  const cuisineRaw = (dish.cuisine_zh ?? dish.origin_cuisine ?? '').toLowerCase().trim();
  if (cuisineRaw) {
    const idx = CUISINE_TO_CLASS[cuisineRaw];
    if (idx !== undefined) v[idx] = 1;
    else v[IDX_CUISINE_MIXED] = 1;  // 未识别 cuisine → mixed
  } else {
    v[IDX_CUISINE_MIXED] = 1;
  }

  // spice 1 维 [0..1]
  v[IDX_SPICE] = normalizeSpice(dish.spice_level);

  // main_ingredient family 8 维 onehot
  const ing = (dish.main_ingredient ?? '').toLowerCase().trim();
  if (ing) {
    const idx = INGREDIENT_TO_FAMILY[ing];
    if (idx !== undefined) v[idx] = 1;
    else v[IDX_ING_MIXED] = 1;
  } else {
    v[IDX_ING_MIXED] = 1;
  }

  // cooking_method 6 维 onehot
  const methodRaw = (dish.cook_method ?? dish.cooking_method ?? '').toLowerCase().trim();
  let methodIdx: number | undefined = methodRaw ? METHOD_TO_INDEX[methodRaw] : undefined;
  if (methodIdx === undefined) {
    // title 关键词兜底
    const title = (dish.title_zh ?? '').toString();
    for (const [kw, idx] of TITLE_METHOD_KEYWORDS) {
      if (title.includes(kw)) { methodIdx = idx; break; }
    }
  }
  if (methodIdx !== undefined) v[methodIdx] = 1;
  // else: 6 method 维度全 0 (未知烹饪法, 不强 onehot)

  return v;
}

// ─── 2. userVectorFromSelectedDishes ────────────────────────────────────
export function userVectorFromSelectedDishes(selectedDishVectors: number[][]): number[] {
  if (selectedDishVectors.length === 0) return new Array<number>(VECTOR_DIM).fill(0);
  const sum = new Array<number>(VECTOR_DIM).fill(0);
  for (const vec of selectedDishVectors) {
    if (!vec || vec.length !== VECTOR_DIM) continue;
    for (let i = 0; i < VECTOR_DIM; i++) sum[i] += vec[i];
  }
  const n = selectedDishVectors.length;
  return sum.map(x => x / n);
}

// ─── 3. cosineSimilarity ────────────────────────────────────────────────
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;
  let dot = 0, n1 = 0, n2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    n1 += v1[i] * v1[i];
    n2 += v2[i] * v2[i];
  }
  const denom = Math.sqrt(n1) * Math.sqrt(n2);
  if (denom === 0) return 0;
  return dot / denom;
}

// ─── 4. recommendDishesByVector ─────────────────────────────────────────
// 营养重排打分: 在 cosine top N 内, 按 dietaryGoal 加额外信号
function nutritionRerankScore(dish: DishLike, dietaryGoal: string | null | undefined): number {
  if (!dietaryGoal || dietaryGoal === 'general') return 0;

  const protein = Number(dish.protein_g ?? 0);
  const fat     = Number(dish.fat_g ?? 0);
  const carb    = Number(dish.carb_g ?? 0);
  const kcal    = Number(dish.nutrition_kcal_per_serving ?? 0);
  const calcium = Number(dish.calcium_mg ?? 0);

  // salt/oil level 处理 (DB enum 'low'/'medium'/'high' 或数值)
  const oilLevel = (() => {
    const v = dish.oil_level;
    if (v === null || v === undefined) return 0.5;
    if (typeof v === 'number') return Math.min(1, v / 3);
    const s = String(v).toLowerCase();
    if (s === 'low' || s === '少' || s === '清淡') return 0.2;
    if (s === 'medium' || s === '中') return 0.5;
    if (s === 'high' || s === '多' || s === '油腻') return 0.9;
    return 0.5;
  })();
  const saltLevel = (() => {
    const v = dish.salt_level;
    if (v === null || v === undefined) return 0.5;
    if (typeof v === 'number') return Math.min(1, v / 3);
    const s = String(v).toLowerCase();
    if (s === 'low') return 0.2;
    if (s === 'medium') return 0.5;
    if (s === 'high') return 0.9;
    return 0.5;
  })();

  switch (dietaryGoal) {
    case 'fat_loss':
      // 优先 低脂 + 低热量 + 高蛋白
      // 热量 < 400 +; > 600 -. fat < 8g +; > 20g -. protein > 20g +.
      return (
        (kcal > 0 && kcal < 400 ? 0.2 : 0) +
        (kcal > 600 ? -0.2 : 0) +
        (fat > 0 && fat < 8 ? 0.15 : 0) +
        (fat > 20 ? -0.2 : 0) +
        (protein > 20 ? 0.15 : 0) -
        oilLevel * 0.15
      );
    case 'muscle_gain':
      // 优先 高蛋白 + 适量碳水. protein > 25g ++; protein < 10g -.
      return (
        (protein > 25 ? 0.3 : 0) +
        (protein > 15 ? 0.1 : 0) +
        (protein < 10 ? -0.15 : 0) +
        (carb > 0 && carb < 80 ? 0.05 : 0)
      );
    case 'child_growth':
      // 优先 均衡 + 高钙 + 适量蛋白. calcium > 100mg +. protein 10-25g +. salt low +.
      return (
        (calcium > 100 ? 0.2 : 0) +
        (protein >= 10 && protein <= 25 ? 0.15 : 0) -
        saltLevel * 0.15 -
        oilLevel * 0.10
      );
    case 'elder_wellness':
      // 优先 低盐 + 低油. saltLevel < 0.3 +. oilLevel < 0.3 +.
      return (
        (saltLevel < 0.3 ? 0.25 : 0) +
        (oilLevel < 0.3 ? 0.20 : 0) +
        (kcal > 0 && kcal < 500 ? 0.10 : 0) -
        saltLevel * 0.20 -
        oilLevel * 0.20
      );
    default:
      return 0;
  }
}

export function recommendDishesByVector<T extends DishLike & { feature_vector?: number[] | null }>(
  userVec: number[],
  allDishes: T[],
  opts: RecommendOptions = {},
): T[] {
  const { dietaryGoal = null, allergens = [], count = 25, topNAfterSim = 100 } = opts;

  // 1. 过敏硬过滤
  const safe = allergens.length > 0
    ? allDishes.filter(d => !allergens.some(a => dishHasAllergen(d, a)))
    : allDishes;

  // 2. cosine similarity → top N
  // dish 没有 feature_vector 时即时算 (forward compat, 但成本高 ~20 mul/dish).
  const scored = safe.map(d => {
    const vec = d.feature_vector && d.feature_vector.length === VECTOR_DIM
      ? d.feature_vector
      : dishToVector(d);
    return { dish: d, sim: cosineSimilarity(userVec, vec) };
  });
  scored.sort((a, b) => b.sim - a.sim);
  const topSim = scored.slice(0, topNAfterSim);

  // 3. 营养重排 (final = sim + nutritionRerankScore)
  const reranked = topSim.map(x => ({
    dish: x.dish,
    final: x.sim + nutritionRerankScore(x.dish, dietaryGoal),
  }));
  reranked.sort((a, b) => b.final - a.final);

  // 4. 返回 top count
  return reranked.slice(0, count).map(x => x.dish);
}
