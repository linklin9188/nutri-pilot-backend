/**
 * quantity.ts — convert `amount_g` (grams, as stored in the DB) into the
 * piece-based unit that's actually intuitive for Chinese kitchens.
 *
 * The DB stores everything as grams so the cooking-robot side has a uniform
 * scalar, but a helper looking at a tray cares about *pieces*: "2 eggs" /
 * "3 garlic cloves", not "100g eggs / 15g garlic".
 *
 * Rules added conservatively — only ingredients where the conversion is
 * universally understood in a HK family kitchen are listed here. If an
 * ingredient isn't in the table we fall back to grams.
 */

interface PieceRule {
  match:    RegExp;   // matched against the Chinese OR English ingredient name
  perPiece: number;   // grams per single piece (median, not average)
  unit:     string;   // Chinese unit suffix — also intuitive in EN context
}

// Order matters: more specific matches first, so 蒜瓣 beats 蒜苗.
const PIECE_RULES: PieceRule[] = [
  // 鸡蛋: standard HK egg ~50–55g shelled. Round, e.g. 100g → 2 个.
  { match: /(鸡蛋|蛋液|^蛋$|\begg\b|\beggs\b)/i, perPiece: 50, unit: '个' },
  // 蒜瓣 (garlic clove) — small clove ≈ 5g.
  { match: /(蒜瓣|蒜头|^蒜$|garlic\s*clove|garlic)/i, perPiece: 5, unit: '瓣' },
  // 葱段 / 青葱 / scallion stalk — one stalk ≈ 15g.
  { match: /(葱段|青葱|大葱|^葱$|scallion|green\s*onion)/i, perPiece: 15, unit: '段' },
  // 姜片 — thin slice ≈ 3g.
  { match: /(姜片|^姜$|ginger\s*slice|ginger)/i, perPiece: 3, unit: '片' },
];

export function formatIngredientQty(name: string, grams: number): string {
  if (!grams || grams <= 0) return '';
  for (const r of PIECE_RULES) {
    if (r.match.test(name)) {
      const count = Math.max(1, Math.round(grams / r.perPiece));
      return `${count}${r.unit}`;
    }
  }
  return `${grams}g`;
}
