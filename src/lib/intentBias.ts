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

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

const LS_KEY  = 'nutri_intent_bias_v1';
const EVENT   = 'nutri-intent-bias-changed';

// Categories the algorithm already scores on (mirror of ingCategory + a few
// common tags). Keep this list aligned with useWeeklyMenu.ts.
export type IntentCategory =
  | 'seafood' | 'pork' | 'beef' | 'poultry' | 'plant' | 'carb';

export type IntentTag =
  | 'spicy' | 'light' | 'sweet' | 'savory'  // flavor
  | 'low_sodium' | 'low_sugar'              // health
  | 'detox' | 'energy' | 'immunity';

export interface IntentBias {
  /** The original user request, kept verbatim for display. */
  userText: string;
  /** Score adjustments per ingredient category. Range roughly [-2, +2]. */
  categoryBoosts: Partial<Record<IntentCategory, number>>;
  /** Score adjustments per flavor/health tag. Range roughly [-2, +2]. */
  tagBoosts:      Partial<Record<IntentTag, number>>;
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
- tagBoosts: { spicy?, light?, sweet?, savory?, low_sodium?, low_sugar?, detox?, energy?, immunity? }
  Each value in [-2, +2]. Same semantics.
- chips: array of 1-5 short Chinese chips (4-6 chars each) describing the bias
  in user-friendly terms, e.g. ["多海鲜 ↑", "少辣 ↓", "孩子友好"].

Output ONLY valid JSON:
{
  "categoryBoosts": { "seafood": 0.8, "pork": -0.5 },
  "tagBoosts":      { "spicy": -1.0, "light": 0.4 },
  "chips":          ["多海鲜 ↑", "少辣 ↓"]
}`;

export async function parseIntent(userText: string): Promise<IntentBias> {
  if (!userText.trim()) throw new Error('请输入你想要的菜单偏好');
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT(userText) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(json.error?.message ?? 'Gemini API error');

  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let parsed: any;
  try {
    parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim());
  } catch {
    throw new Error('解析 AI 返回失败，请换个说法再试');
  }

  return {
    userText:       userText.trim(),
    categoryBoosts: clampObj(parsed.categoryBoosts ?? {}, -2, 2),
    tagBoosts:      clampObj(parsed.tagBoosts ?? {}, -2, 2),
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
    return JSON.parse(raw) as IntentBias;
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
  const s = JSON.stringify({ c: b.categoryBoosts, t: b.tagBoosts });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 8);
}

/** Apply bias to an already-computed dish score. Called from useWeeklyMenu. */
export function applyIntentBias(
  baseScore: number,
  dish: { main_ingredient?: string; flavor_tags?: string[]; health_benefit_tags?: string[] },
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
