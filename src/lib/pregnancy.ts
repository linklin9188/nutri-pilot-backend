/**
 * pregnancy.ts — safety + nutrition rules for 孕期 family members.
 *
 * Two layers, both gated on `hasPregnant === true` (detected from
 * family members' lifeStage):
 *
 *   1. **Hard ban / strong caution** — health-risk dishes (raw oyster,
 *      high-mercury fish, raw sashimi, alcohol-cooked). Heavy negative
 *      score so they almost never appear, but algorithm degrades
 *      gracefully if the pool is empty.
 *
 *   2. **Soft prefer** — boost ingredients that pregnant women
 *      actually need more of: iron (liver, lean beef, spinach), folic
 *      acid (leafy greens, beans), calcium (tofu, sesame, broccoli),
 *      DHA (salmon when cooked, not sashimi).
 *
 * Sources: HK Department of Health pregnancy nutrition guide + ACOG
 * dietary recommendations.
 */

// ── Hard ban: ingredients to outright avoid ─────────────────────────────────
// Score penalty -5.0 — applied via main_ingredient match. These can still
// appear if the pool runs out of alternatives, but it's extremely unlikely.
export const PREGNANCY_BAN_INGREDIENTS = new Set([
  'oyster',        // listeria + vibrio risk even when steamed
  'shark',         // high mercury
  'swordfish',     // high mercury
  'king_mackerel', // high mercury
  'tilefish',      // high mercury
  'marlin',        // high mercury
]);

// Title keywords that signal a dangerous preparation method, regardless of
// the underlying ingredient. Score penalty -3.5.
//
// 我们用关键词而不是依赖 DB 标签，因为 DB 里没有 'is_raw' 或 'cooking_method'
// 字段，且菜名是最稳定的"做法"信号。
export const PREGNANCY_BAN_TITLE_KEYWORDS = [
  // 生食
  '刺身', '寿司', '生鱼', '生蚝', '生腌',
  // 半生 / tartare
  '塔塔', '溏心', '糖心蛋',
  // 软质未巴氏消毒奶酪 - 注意我们排除常见熟成芝士的菜品
  '蓝纹', '卡门贝尔', '布里', '山羊奶酪',
  // 含酒精烹饪 (现代食安看法 OK，但 HK 卫生署建议避免，保守一些)
  '醉', '酒香',
  // 浓咖啡 / 浓茶 (孕妇咖啡因限 200mg/天)
  '浓咖啡',
];

// ── Soft prefer: nutrients pregnant women need extra of ─────────────────────
// Score boost +0.5 per matching ingredient.
export const PREGNANCY_PREFER_INGREDIENTS = new Set([
  // 补铁 + 补叶酸
  'pork_liver', 'chicken_liver', 'duck_liver', 'liver',
  'beef', 'lamb',                          // heme iron
  'spinach',                                // folate
  // 补钙
  'tofu', 'sesame', 'sardine',
  'broccoli', 'bok_choy', 'kale',
  // DHA (cooked only — see ban keywords for sashimi/cured)
  'salmon', 'cod', 'seabass',
  // 优质蛋白
  'egg',
  // 补血
  'red_dates', 'longan', 'goji', 'wolfberry',
  'black_fungus',
]);

// Title keywords that signal pregnancy-friendly dishes. Score boost +0.6.
export const PREGNANCY_PREFER_TITLE_KEYWORDS = [
  '红枣', '枸杞', '桂圆', '银耳',
  '黑木耳', '紫菜',
  '猪肝', '鸡肝', '鸭血', '猪血',
  '菠菜', '西兰花', '芥蓝', '上海青',
  '豆腐', '豆浆',
  '蒸蛋', '蛋羹',
];

// ── Public scoring helper ────────────────────────────────────────────────────

export interface PregnancyContext {
  hasPregnant: boolean;
}

export function applyPregnancyAdjustments(
  baseScore: number,
  dish: { main_ingredient?: string; title_zh?: string; title?: string },
  ctx: PregnancyContext,
): number {
  if (!ctx.hasPregnant) return baseScore;

  let score = baseScore;
  const ing = (dish.main_ingredient ?? '').toLowerCase();
  const titleZh = dish.title_zh ?? dish.title ?? '';

  // Hard ban — ingredient
  if (PREGNANCY_BAN_INGREDIENTS.has(ing)) score -= 5.0;

  // Hard caution — dangerous preparation per title keyword
  for (const kw of PREGNANCY_BAN_TITLE_KEYWORDS) {
    if (titleZh.includes(kw)) { score -= 3.5; break; }
  }

  // Soft prefer — ingredient
  if (PREGNANCY_PREFER_INGREDIENTS.has(ing)) score += 0.5;

  // Soft prefer — title keyword (additive, not break — a dish with both
  // 红枣 and 黑木耳 gets double boost).
  for (const kw of PREGNANCY_PREFER_TITLE_KEYWORDS) {
    if (titleZh.includes(kw)) score += 0.6;
  }

  return score;
}
