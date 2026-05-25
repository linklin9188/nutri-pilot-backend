/**
 * intentBias.ts — natural-language menu re-generation.
 *
 * Flow:
 *   1. User types a free-text request like
 *      "这周多吃海鲜，孩子怕辣，老人想要清淡"
 *   2. We pass it to Gemini with a strict JSON schema prompt and get back
 *      a structured bias object — boosts/penalties keyed on the same
 *      ingredient categories and flavor/health tags that the menu
 *      algorithm already understands.
 *   3. We persist the bias in localStorage. useWeeklyMenu reads it and
 *      layers it on top of the existing scoring axes.
 *   4. The cache key includes a hash of the bias, so toggling/clearing
 *      it forces a fresh week regeneration.
 *
 * Schema is intentionally narrow — we don't let Gemini invent new axes,
 * only weight the ones we already score on. Keeps the algorithm stable.
 */

// Gemini key is server-side only now (in Supabase secrets). The
// previous in-bundle VITE_GEMINI_API_KEY was extractable by anyone
// inspecting Network and could be used to drain billing.
import { getUserId } from './userId';
const PARSE_INTENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-intent`;

const LS_KEY  = 'nutri_intent_bias_v1';
const EVENT   = 'nutri-intent-bias-changed';

// Categories the algorithm already scores on (mirror of ingCategory + a few
// common tags). Keep this list aligned with useWeeklyMenu.ts.
export type IntentCategory =
  | 'seafood' | 'pork' | 'beef' | 'poultry' | 'plant' | 'carb';

export type IntentTag =
  | 'spicy' | 'light' | 'sweet' | 'savory'  // flavor
  | 'low_sodium' | 'low_sugar' | 'low_purine'  // health constraints
  | 'detox' | 'energy' | 'immunity'         // general well-being
  // TCM / 中医 调理 axes — match health_benefit_tags filled by migration 011.
  | 'blood_tonic'   // 补气血 (red dates, longan, pig liver, lamb, …)
  | 'sleep_aid'     // 助眠 (lotus seed, lily bulb, milk, oat, sour jujube)
  | 'yin_nourish'   // 滋阴 (white fungus, pear, honey, duck, yam)
  | 'qi_tonic'      // 益气 (yam, astragalus, ginseng, chicken, …)
  // Extended wellness axes — match tags filled by migration 013.
  | 'mood_boost'        // 提神/抗压 (chocolate, banana, salmon, oat, nuts)
  | 'anti_aging'        // 抗衰 (blueberry, nuts, purple sweet potato, broccoli, …)
  | 'beauty'            // 美容养颜 (white fungus, peach gum, papaya, avocado, …)
  | 'damp_clear'        // 祛湿 (job's tears, red bean, winter melon, bitter melon)
  | 'anti_inflammation' // 抗炎 (salmon, turmeric, ginger, olive oil, blueberry)
  | 'eye_care'          // 护眼 (goji, carrot, spinach, blueberry, cassia)
  | 'lose_weight'       // 减脂
  | 'muscle_gain';      // 增肌

// ── TICKET-065 P0 (老板真测 #11 西北菜出粤菜真因修) ─────────────────────────────
// IntentBias 原 schema 漏 cuisine 维度: "我想吃西北菜" 被 Gemini 转 categoryBoosts /
// tagBoosts 都失效 (没对应 axis), 算法回退按 hometown + prefScores 排 → 命中粤菜.
//
// 这里枚举的是 dishes.origin_cuisine **真实存在**的全集 (实查 scripts/ + migrations/
// 2026-05-25), 不是 hometownBuckets 那种用户偏好归并桶. 12 个值都可能命中:
//   核心 7 桶: cantonese / sichuan / jiangnan / northern / western /
//              japanese_korean / southeast_asian
//   扩展 5 桶: hunan / northwest / fujian / hakka / northeast
export type CuisineCode =
  | 'cantonese'        // 粤菜（含港澳）
  | 'sichuan'          // 川菜
  | 'jiangnan'         // 江南（沪/苏/浙/皖）
  | 'northern'         // 北方（京/鲁/晋/蒙/冀）
  | 'western'          // 西餐
  | 'japanese_korean'  // 日韩
  | 'southeast_asian'  // 东南亚（泰/越/印尼/马）
  | 'hunan'            // 湘菜
  | 'northwest'        // 西北（陕/甘/宁/青/新）
  | 'fujian'           // 闽菜
  | 'hakka'            // 客家
  | 'northeast';       // 东北

export interface IntentBias {
  /** The original user request, kept verbatim for display. */
  userText: string;
  /** Score adjustments per ingredient category. Range roughly [-2, +2]. */
  categoryBoosts: Partial<Record<IntentCategory, number>>;
  /** Score adjustments per flavor/health tag. Range roughly [-2, +2]. */
  tagBoosts:      Partial<Record<IntentTag, number>>;
  /**
   * Score adjustments per origin_cuisine. Range roughly [-2, +2].
   *
   * TICKET-065: 直接命中 dishes.origin_cuisine, 不走 hometownBuckets 归并 — "西北菜"
   * → cuisineBoosts.northwest=+1.5 让 origin='northwest' 的菜 (莜面 / 羊肉泡馍 /
   * 大盘鸡) 真上浮; 不会被错算到 northern bucket.
   */
  cuisineBoosts: Partial<Record<CuisineCode, number>>;
  /** Short Chinese summary chips shown on /weekly. */
  chips: string[];
  /** UTC ms — used for staleness checks and the cache hash. */
  createdAt: number;
}

const PROMPT = (userText: string) => `You are a menu personalization assistant. The user wants to re-generate a weekly menu and just typed this request (in Chinese):

"""
${userText}
"""

Convert it into a structured bias object. Use ONLY these axes — don't invent new ones:

- categoryBoosts: { seafood?, pork?, beef?, poultry?, plant?, carb? }
  Each value in [-2, +2]. Positive = more of this, negative = less.
- tagBoosts: { spicy?, light?, sweet?, savory?, low_sodium?, low_sugar?, low_purine?, detox?, energy?, immunity?, blood_tonic?, sleep_aid?, yin_nourish?, qi_tonic?, mood_boost?, anti_aging?, beauty?, damp_clear?, anti_inflammation?, eye_care?, lose_weight?, muscle_gain? }
  Each value in [-2, +2]. Same semantics.
  Mapping reference:
    • 补气血 / 气血两虚 / 月经后调理 → blood_tonic
    • 失眠 / 睡眠不好 / 助眠 / 安神 → sleep_aid
    • 滋阴 / 阴虚火旺 / 干燥 / 上火 → yin_nourish
    • 益气 / 健脾 / 提气 / 体虚 → qi_tonic
    • 提神 / 抗压 / 心情不好 / 压力大 → mood_boost
    • 抗衰 / 年纪大 / 想年轻 → anti_aging
    • 美容 / 养颜 / 皮肤好 / 长痘 → beauty
    • 湿气重 / 祛湿 / 水肿 / 梅雨 → damp_clear
    • 关节痛 / 抗炎 / 痘 / 慢炎症 → anti_inflammation
    • 护眼 / 看屏幕多 / 眼睛干 / 老花 → eye_care
    • 减肥 / 减脂 / 瘦身 / 控制体重 → lose_weight
    • 增肌 / 健身 / 长肌肉 / 长身体 → muscle_gain
    • 三高 (高血压) → low_sodium ; 糖尿病 → low_sugar ; 痛风 → low_purine
- cuisineBoosts: { cantonese?, sichuan?, jiangnan?, northern?, western?, japanese_korean?, southeast_asian?, hunan?, northwest?, fujian?, hakka?, northeast? }
  Each value in [-2, +2]. Matches dishes.origin_cuisine directly.
  Cuisine mapping reference (用户提到菜系/地域时优先用这个轴, 不要错塞 tagBoosts):
    • 粤菜 / 广东菜 / 港式 / 茶餐厅 / 广式 → cantonese
    • 川菜 / 四川菜 / 麻辣 / 重庆菜 → sichuan
    • 江南菜 / 上海菜 / 苏菜 / 浙菜 / 杭帮菜 / 本帮 / 淮扬 → jiangnan
    • 北方菜 / 京菜 / 鲁菜 / 山东菜 / 北京菜 / 山西菜 → northern
    • 西餐 / 意大利菜 / 法餐 / 美式 / 牛排 / 披萨 / 意面 → western
    • 日料 / 日本菜 / 寿司 / 拉面 / 韩餐 / 韩国菜 / 韩式 → japanese_korean
    • 东南亚 / 泰餐 / 越南菜 / 印尼 / 马来 / 冬阴功 → southeast_asian
    • 湘菜 / 湖南菜 / 剁椒 → hunan
    • 西北菜 / 陕西菜 / 甘肃 / 兰州 / 新疆菜 / 大盘鸡 / 羊肉泡馍 / 莜面 → northwest
    • 闽菜 / 福建菜 / 佛跳墙 → fujian
    • 客家菜 / 梅菜 → hakka
    • 东北菜 / 锅包肉 / 杀猪菜 → northeast
  反向: "不想吃X菜" → 对应 cuisine 用负值 (e.g. "不想吃辣" 已经走 tagBoosts.spicy=-1, 但 "今天不想吃川菜" 走 cuisineBoosts.sichuan=-1).
- chips: array of 1-5 short Chinese chips (4-6 chars each) describing the bias
  in user-friendly terms, e.g. ["多海鲜 ↑", "少辣 ↓", "孩子友好"].

Output ONLY valid JSON:
{
  "categoryBoosts": { "seafood": 0.8, "pork": -0.5 },
  "tagBoosts":      { "spicy": -1.0, "light": 0.4 },
  "cuisineBoosts":  { "northwest": 1.5 },
  "chips":          ["多海鲜 ↑", "少辣 ↓"]
}`;

export async function parseIntent(userText: string): Promise<IntentBias> {
  if (!userText.trim()) throw new Error('请输入你想要的菜单偏好');
  const userId = getUserId() ?? 'anonymous';

  // Hit the Supabase edge function instead of Google directly. The edge
  // function holds the Gemini key in secrets, enforces a 20/day per-user
  // rate limit (against api_usage_daily), and proxies to Gemini.
  const res = await fetch(PARSE_INTENT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ user_id: userId, text: userText.trim() }),
  });
  const j = await res.json();
  if (res.status === 429) {
    throw new Error(j.error || '今日 AI 解析额度已用完，明日再试');
  }
  if (!res.ok) {
    throw new Error(j.error || '解析失败，请稍后重试');
  }
  const parsed = j.bias ?? {};

  return {
    userText:       userText.trim(),
    categoryBoosts: clampObj(parsed.categoryBoosts ?? {}, -2, 2),
    tagBoosts:      clampObj(parsed.tagBoosts ?? {}, -2, 2),
    cuisineBoosts:  clampObj(parsed.cuisineBoosts ?? {}, -2, 2),
    chips:          Array.isArray(parsed.chips) ? parsed.chips.slice(0, 5) : [],
    createdAt:      Date.now(),
  };
}

function clampObj(o: any, min: number, max: number): any {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = Math.max(min, Math.min(max, n));
  }
  return out;
}

export function loadIntentBias(): IntentBias | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IntentBias>;
    // TICKET-065: 旧 IntentBias 没 cuisineBoosts 字段 → 兜底 {} 防 applyIntentBias / hash 访问报错.
    if (!parsed.cuisineBoosts) parsed.cuisineBoosts = {};
    return parsed as IntentBias;
  } catch { return null; }
}

export function saveIntentBias(b: IntentBias): void {
  localStorage.setItem(LS_KEY, JSON.stringify(b));
  window.dispatchEvent(new Event(EVENT));
}

export function clearIntentBias(): void {
  localStorage.removeItem(LS_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** Short stable hash of the bias for inclusion in the menu cache key. */
export function getIntentHash(): string {
  const b = loadIntentBias();
  if (!b) return 'none';
  // 8-char djb2 hash of the JSON — collisions are fine, this is just a cache buster.
  // TICKET-065: cuisineBoosts 进 hash, cuisine 变动 → cache_key 变 → 旧菜单失效.
  const s = JSON.stringify({ c: b.categoryBoosts, t: b.tagBoosts, u: b.cuisineBoosts ?? {} });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 8);
}

/** Apply bias to an already-computed dish score. Called from useWeeklyMenu. */
export function applyIntentBias(
  baseScore: number,
  dish: {
    main_ingredient?: string;
    flavor_tags?: string[];
    health_benefit_tags?: string[];
    origin_cuisine?: string;   // TICKET-065: 新增 cuisine 命中
  },
  bias: IntentBias | null,
): number {
  if (!bias) return baseScore;

  let s = baseScore;

  // Category match — fold ING_CATEGORY into the 6 macro categories.
  const ing = (dish.main_ingredient ?? '').toLowerCase();
  const cat = categorize(ing);
  const catBoost = bias.categoryBoosts?.[cat];
  if (catBoost) s += catBoost;

  // Tag match — flavor + health tags.
  const flavors = dish.flavor_tags ?? [];
  const healths = dish.health_benefit_tags ?? [];
  for (const tag of [...flavors, ...healths]) {
    const boost = bias.tagBoosts?.[tag as IntentTag];
    if (boost) s += boost;
  }

  // ── TICKET-065 Cuisine match — origin_cuisine 直命中 ─────────────────────────
  // "我想吃西北菜" → cuisineBoosts.northwest=+1.5 让 origin='northwest' 的菜真上浮.
  // 不归并 hometownBuckets, 不影响现有 hometown bucket 逻辑.
  const origin = (dish.origin_cuisine ?? '').toLowerCase();
  if (origin) {
    const cuisineBoost = bias.cuisineBoosts?.[origin as CuisineCode];
    if (cuisineBoost) s += cuisineBoost;
  }

  return s;
}

function categorize(ing: string): IntentCategory {
  if (/seafood|fish|shrimp|crab|shellfish|squid|scallop|clam|lobster|salmon|tuna|cod|hairtail|seabass|oyster/.test(ing)) return 'seafood';
  if (ing === 'pork') return 'pork';
  if (/beef|lamb|mutton/.test(ing)) return 'beef';
  if (/chicken|duck|turkey/.test(ing)) return 'poultry';
  if (/veggie|vegetable|tofu|mushroom|egg|bean|tempeh/.test(ing)) return 'plant';
  if (ing === 'carb') return 'carb';
  return 'plant'; // safe fallback
}
