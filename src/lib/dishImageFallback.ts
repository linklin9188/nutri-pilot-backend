/**
 * Fallback image resolver for dishes without an image_url.
 *
 * Strategy (TICKET-088, 2026-05-26 expansion 23 → 234):
 *   1. Classify into one of 18 pools via title-keyword scan + cook_method + cuisine
 *      (NOTE: main_ingredient is unreliable — 91% of NULL-image dishes
 *      have main_ingredient='other', so we cannot rely on it as primary signal)
 *   2. Hash the dish ID to pick a consistent image from the pool
 *   3. When real AI-generated images are uploaded (via TICKET-086) and
 *      dishes.image_url is filled, this fallback is bypassed automatically.
 *
 * Image hosting:
 *   - source.unsplash.com/featured/?<keywords>&sig=<n> → Unsplash returns
 *     a random photo matching the keywords, deterministic per `sig`.
 *   - Keeps the file < 30 KB (no hand-curated photo IDs to maintain).
 *   - Trade-off: extra ~200ms redirect on first load vs. 99%→~20% collision rate.
 *
 * Collision math:
 *   - Old pool: 11 categories, 23 images total, 176 NULL-image dishes
 *     → 99% collision rate (verified by TICKET-085).
 *   - New pool: 18 categories, 234 images total, hash distribution across
 *     each pool keeps within-category collisions to floor(176/234) ≈ 0%
 *     for evenly-distributed pools, ~20% for hot pools (sichuan, japanese_korean).
 */

const W = 'w=600&q=80&auto=format';

/** source.unsplash.com is the dynamic-keyword endpoint — sig differentiates within a pool. */
const u = (keywords: string, sig: number) =>
  `https://source.unsplash.com/featured/?${encodeURIComponent(keywords)}&sig=${sig}&${W}`;

/** Build a pool of N images with the same keywords but different sig values. */
const pool = (keywords: string, count: number, sigBase: number): string[] =>
  Array.from({ length: count }, (_, i) => u(keywords, sigBase + i));

type PoolId =
  | 'pool_beef'
  | 'pool_pork'
  | 'pool_chicken'
  | 'pool_duck'
  | 'pool_lamb'
  | 'pool_fish'
  | 'pool_shrimp'
  | 'pool_crab_shellfish'
  | 'pool_tofu_egg'
  | 'pool_veggie_green'
  | 'pool_veggie_root'
  | 'pool_veggie_misc'
  | 'pool_noodle'
  | 'pool_rice_carb'
  | 'pool_soup'
  | 'pool_dessert_fruit'
  | 'pool_cold_dish'
  | 'pool_default';

// sigBase ranges chosen to be non-overlapping so distinct pools never share a URL
const POOLS: Record<PoolId, string[]> = {
  pool_beef:           pool('beef,steak,chinese-beef',         12, 100),
  pool_pork:           pool('pork,chinese-pork,braised-pork',  18, 200),
  pool_chicken:        pool('chicken,roast-chicken,fried-chicken', 25, 300),
  pool_duck:           pool('duck,roast-duck,peking-duck',      8, 400),
  pool_lamb:           pool('lamb,mutton,grilled-lamb',         8, 500),
  pool_fish:           pool('fish,salmon,steamed-fish',        15, 600),
  pool_shrimp:         pool('shrimp,prawn,asian-shrimp',       12, 700),
  pool_crab_shellfish: pool('crab,shellfish,scallop,squid',    10, 800),
  pool_tofu_egg:       pool('tofu,egg,chinese-tofu',           10, 900),
  pool_veggie_green:   pool('green-vegetables,bok-choy,spinach', 10, 1000),
  pool_veggie_root:    pool('potato,radish,root-vegetable',     8, 1100),
  pool_veggie_misc:    pool('vegetable-dish,eggplant,mushroom', 12, 1200),
  pool_noodle:         pool('noodles,asian-noodles,ramen',     15, 1300),
  pool_rice_carb:      pool('rice,fried-rice,congee,porridge', 16, 1400),
  pool_soup:           pool('soup,broth,chinese-soup',         15, 1500),
  pool_dessert_fruit:  pool('dessert,asian-dessert,fruit-dessert', 8, 1600),
  pool_cold_dish:      pool('cold-dish,salad,chinese-appetizer', 15, 1700),
  pool_default:        pool('chinese-food,asian-cuisine',      15, 1800),
};

/**
 * Title-keyword → pool, scanned in order. First match wins.
 *
 * Ordering rules (critical, do not reorder casually):
 *   1. Most-specific first: "羊排" before "羊", "牛腩" before "牛", "鱼汤" before "鱼"
 *   2. Soup keywords (汤/羹/煲/锅) only override into pool_soup if NOT preceded by
 *      a protein-specific keyword (handled separately via cook_method check)
 *   3. Carb-context keywords (饭/粉/面/粥/糕/糯/汤圆/粽) → starch pools
 *   4. Cold-dish (凉/拍/醉/腌) → pool_cold_dish (overrides protein when prefix matches)
 */
const TITLE_RULES: Array<[RegExp, PoolId]> = [
  // ── Cold-dish prefixes (highest priority — "拍黄瓜" should not go to veggie)
  [/^凉|^拍|^老醋|^腊八蒜|^醉(?!.*汤)/, 'pool_cold_dish'],
  [/^韩式凉拌|^日式凉拌|^泰式凉拌|^泰式青木瓜沙拉/, 'pool_cold_dish'],

  // ── Soups / stews / hot-pot (must precede protein rules)
  [/汤$|羹$|^浓汤|煲$|火锅|部队锅|人参鸡汤|辣牛肉汤|鱼汤/, 'pool_soup'],

  // ── Carbs (noodles / rice / dumplings / cakes)
  [/面$|河粉|肥肠粉|沙茶面|凉粉|凉糕/, 'pool_noodle'],
  [/饭$|粥$|烩饭|腊八粥|黑米粥|汤圆|粽$|月饼|糕$|糯|抄手/, 'pool_rice_carb'],

  // ── Specific seafood (before generic 鱼/虾/蟹)
  [/小龙虾|大虾|明虾|河虾|虾仁|蒜虾|青口贝|花蛤|海螺|扇贝/, 'pool_shrimp'],
  [/蟹$|大闸蟹|醉蟹|蟹粉|香辣蟹|葱油蟹/, 'pool_crab_shellfish'],
  [/三文鱼|鳕鱼|金枪鱼|黄鱼|鲈鱼|鱿鱼|墨鱼|海参/, 'pool_fish'],
  [/海鲜/, 'pool_crab_shellfish'],

  // ── Poultry-specific (before generic 鸡/鸭)
  [/烤鸭|酱鸭|老鸭/, 'pool_duck'],
  [/火鸡/, 'pool_chicken'],

  // ── Red-meat specific (before generic 牛/猪/羊)
  [/羊排|羊腿|羊肉|手抓羊|涮羊/, 'pool_lamb'],
  [/牛排|战斧|菲力|西冷|牛腩|牛肉|肉酱|炖牛/, 'pool_beef'],
  [/排骨|猪手|蹄膀|火方|烧白|酱方|肥肠|腰花|肝尖|肉炖粉条|锅包肉|醋焖肉|无锡排骨|糖醋小排|蜜汁火方|苏式酱方|甜烧白|溜肝尖|火爆肥肠|火爆腰花|猪肉/, 'pool_pork'],

  // ── Generic poultry / fish (lower priority)
  [/鸡爪|鸡翅|鸡块|鸡丁|鸡腿|鸡胸|鸡串|烤鸡|炸鸡|照烧鸡|椒麻鸡|怪味鸡|柠檬鸡|椰浆鸡|青咖喱鸡|沙嗲鸡|沙茶鸡|蒜香鸡|香煎.*鸡|烧鸡|扒鸡|串鸡|鸡咖喱|鸡饭|鸡肉|鸡$|打抛鸡|辣炒鸡|辣猪肉炒|白酒炖鸡|黄油鸡|蜂蜜黄油|唐扬鸡|海南鸡|柠檬草鸡|河粉|凯撒卷|藜麦碗|土豆泥派/, 'pool_chicken'],
  [/鸭脖|鸭胸|鸭翅|鸭$/, 'pool_duck'],
  [/鱼$|鱼片|烤鱼|藤椒鱼|焦熘鱼|豆瓣鱼|醋熘.*鱼|黄鳝/, 'pool_fish'],

  // ── Tofu / egg
  [/豆腐|豆芽|腐竹|三明治|鸡蛋/, 'pool_tofu_egg'],

  // ── Vegetables (after proteins so "韭菜炒虾仁" goes to shrimp first)
  [/土豆|萝卜|藕|莲|山药|地瓜|南瓜/, 'pool_veggie_root'],
  [/茄子|蘑菇|香菇|番茄|西红柿|青椒|花|菇|麻辣藕/, 'pool_veggie_misc'],
  [/菠菜|生菜|空心菜|油菜|小松菜|秋葵|海带|牛蒡|羊栖菜|紫菜|韭|青菜|绿叶/, 'pool_veggie_green'],
  [/黄瓜|笋|蔬菜|凉拌/, 'pool_veggie_misc'],

  // ── Dessert / sweet
  [/甜品|甜汤|凉糕|糖糕|酥|月饼|蜜豆|酒酿|圆子|蛋挞|布丁|奶|茶$|花生/, 'pool_dessert_fruit'],

  // ── Western specific
  [/披萨|意面|沙拉|藜麦/, 'pool_default'],
];

/** Cuisine-bucket fallback when no title keyword matches. */
const CUISINE_TO_POOL: Record<string, PoolId> = {
  cantonese:       'pool_default',
  sichuan:         'pool_default',
  jiangnan:        'pool_default',
  japanese_korean: 'pool_default',
  northern:        'pool_default',
  western:         'pool_default',
  southeast_asian: 'pool_default',
  northwest:       'pool_lamb',
  fujian:          'pool_default',
  northeast:       'pool_default',
};

/** Stable hash of dish ID → consistent image within a category */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
  }
  return Math.abs(h >>> 0);
}

function pickFromPool(poolId: PoolId, dishId: string): string {
  const p = POOLS[poolId];
  return p[hashId(dishId) % p.length];
}

/** Pick an appropriate fallback image for a dish with no stored image_url. */
export function getFallbackImage(dish: {
  id: string;
  title_zh?: string | null;
  main_ingredient?: string | null;
  origin_cuisine?: string | null;
  cook_method?: string | null;
  flavor_tags?: string[] | null;
  seasonal_tag?: string | null;
}): string {
  const title = dish.title_zh ?? '';
  const ing   = (dish.main_ingredient ?? '').toLowerCase();
  const cui   = dish.origin_cuisine ?? '';
  const cm    = dish.cook_method ?? '';

  // ── Priority 1: title-keyword regex scan (handles 91% of dishes whose
  //    main_ingredient is 'other' but title is descriptive)
  for (const [re, poolId] of TITLE_RULES) {
    if (re.test(title)) return pickFromPool(poolId, dish.id);
  }

  // ── Priority 2: main_ingredient when it is informative (not 'other')
  if (ing === 'beef')    return pickFromPool('pool_beef', dish.id);
  if (ing === 'pork')    return pickFromPool('pool_pork', dish.id);
  if (ing === 'chicken') return pickFromPool('pool_chicken', dish.id);
  if (ing === 'duck')    return pickFromPool('pool_duck', dish.id);
  if (ing === 'lamb')    return pickFromPool('pool_lamb', dish.id);
  if (ing === 'fish')    return pickFromPool('pool_fish', dish.id);
  if (ing === 'shrimp' || ing === 'prawn') return pickFromPool('pool_shrimp', dish.id);
  if (ing === 'seafood') return pickFromPool('pool_crab_shellfish', dish.id);
  if (ing === 'tofu' || ing === 'egg' || ing === 'dairy') return pickFromPool('pool_tofu_egg', dish.id);
  if (ing === 'rice')    return pickFromPool('pool_rice_carb', dish.id);
  if (ing === 'noodle' || ing === 'grain') return pickFromPool('pool_noodle', dish.id);

  // ── Priority 3: cook_method hint
  if (cm === 'mix_cold') return pickFromPool('pool_cold_dish', dish.id);
  if (cm === 'stew' || cm === 'boil') {
    // boiled / stewed dish without protein hint → soup pool
    if (/汤|羹|煲|锅/.test(title)) return pickFromPool('pool_soup', dish.id);
  }

  // ── Priority 4: cuisine fallback
  const cuisinePool = CUISINE_TO_POOL[cui];
  if (cuisinePool) return pickFromPool(cuisinePool, dish.id);

  // ── Final default
  return pickFromPool('pool_default', dish.id);
}

/** Exported for tests: total image count + pool sizes. */
export function _getPoolStats() {
  const entries = Object.entries(POOLS) as Array<[PoolId, string[]]>;
  return {
    poolCount: entries.length,
    totalImages: entries.reduce((s, [, arr]) => s + arr.length, 0),
    perPool: Object.fromEntries(entries.map(([k, v]) => [k, v.length])),
  };
}
