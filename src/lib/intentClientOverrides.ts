/**
 * intentClientOverrides.ts — fast regex extraction of *structural*
 * intent that Gemini's IntentBias schema can't express.
 *
 * Gemini handles soft preferences (more seafood / less spicy / 清淡).
 * This file handles HARD overrides that bypass the algorithm structure:
 *   - "一个人 / 两个人 / 3 人" → today's headcount drops to N
 *   - "中午 / 午餐 / 晚上 / 晚餐 / 早饭" → bias scope = that meal only
 *
 * Why client-side: deterministic, no API quota cost, and the
 * "X 人 / 中午" patterns are simple enough that regex covers >90% of
 * real phrasings. Falls back to no-op when nothing matches.
 *
 * Applied INSIDE IntentRegenModal.handleGenerate before saveIntentBias.
 */

export interface ClientOverrides {
  /** If matched, set today's eating selection to first N family members. */
  headcount: number | null;
  /** If matched, bias should apply to this meal only. */
  mealScope: '早餐' | '午餐' | '晚餐' | null;
}

const CHINESE_DIGITS: Record<string, number> = {
  '一': 1, '俩': 2, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

function parseChineseNumber(s: string): number | null {
  if (!s) return null;
  // ASCII digits first
  const asciiMatch = s.match(/\d+/);
  if (asciiMatch) {
    const n = parseInt(asciiMatch[0], 10);
    return Number.isFinite(n) ? n : null;
  }
  return CHINESE_DIGITS[s] ?? null;
}

export function extractClientOverrides(text: string): ClientOverrides {
  const t = text.trim();
  const out: ClientOverrides = { headcount: null, mealScope: null };
  if (!t) return out;

  // ── Headcount ───────────────────────────────────────────────────
  // Patterns we catch:
  //   "一个人"  "两个人"  "3 个人"  "三人"  "我一个人"
  //   "就 X 个人"  "今天 X 人"  "X 人吃"
  const hcPatterns = [
    /(?:我|今天|就)?\s*([0-9零一两二俩三四五六七八九十])\s*个?人(?:吃|在家|$|，|。|,|\.|\s)/,
    /(?:我|今天|就)?\s*([0-9零一两二俩三四五六七八九十])\s*人(?:吃|在家|$|，|。|,|\.|\s)/,
  ];
  for (const re of hcPatterns) {
    const m = t.match(re);
    if (m) {
      const n = parseChineseNumber(m[1]);
      if (n && n >= 1 && n <= 12) { out.headcount = n; break; }
    }
  }

  // ── Meal scope ──────────────────────────────────────────────────
  // Order matters — 晚饭 / 早饭 / 午饭 specific BEFORE 中午 / 晚上 / 早上
  // because 上午 ≠ 中午, etc.
  if (/午餐|中午|午饭/.test(t))        out.mealScope = '午餐';
  else if (/晚餐|晚饭|晚上|今晚/.test(t)) out.mealScope = '晚餐';
  else if (/早餐|早饭|早上/.test(t))    out.mealScope = '早餐';

  return out;
}

/**
 * Apply headcount override to today's eating selection.
 * Picks the first N members from the family list (sensible default —
 * usually the user's own household). User can fine-tune via the
 * 今日餐桌 chips on Home or per-day chips on WeeklyMenu.
 */
export function applyHeadcountOverride(n: number): boolean {
  try {
    const members = JSON.parse(localStorage.getItem('nutri_family_members') || '[]') as Array<{ id: string }>;
    if (members.length === 0) {
      // No family configured — write the static fallback. Algo's
      // readHeadcount picks these up.
      localStorage.setItem('nutri_adults', String(n));
      localStorage.setItem('nutri_kids', '0');
      return true;
    }
    const ids = members.slice(0, Math.min(n, members.length)).map(m => m.id);
    localStorage.setItem('nutri_eating_today', JSON.stringify(ids));
    window.dispatchEvent(new Event('nutri-prefs-changed'));
    return true;
  } catch { return false; }
}
