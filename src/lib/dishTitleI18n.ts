/**
 * dishTitleI18n.ts — TICKET-029 §A — resolve dish title per active language.
 *
 * Backend 022 §C ship 924 dishes × (title_zh_hant + title_en) backfilled into
 * `dishes` table. This helper turns those columns into the right display string
 * for the current Language.
 *
 * Lang map:
 *   - 'zh'      → title_zh    (Simplified, canonical)
 *   - 'zh-Hant' → title_zh_hant (Traditional, HK / TW)
 *   - 'en'      → title_en    (helper-facing en text)
 *   - 'tl'/'id' → title_en    (no localized title yet — fall back to en)
 *
 * Fallback chain at every level:
 *   target → title_zh → title_en → title → ''
 * so a legacy row missing the new columns still renders something.
 */
import type { Language } from '../contexts/LanguageContext';

export interface DishTitleLike {
  title?:         string | null;
  title_zh?:      string | null;
  title_zh_hant?: string | null;
  title_en?:      string | null;
}

export function getDishTitle(dish: DishTitleLike | null | undefined, lang: Language): string {
  if (!dish) return '';
  const zh    = dish.title_zh    ?? '';
  const hant  = dish.title_zh_hant ?? '';
  const en    = dish.title_en    ?? '';
  const plain = dish.title       ?? '';
  if (lang === 'zh-Hant') return hant || zh || en || plain || '';
  if (lang === 'zh')      return zh   || hant || en || plain || '';
  // en / tl / id
  return en || zh || hant || plain || '';
}
