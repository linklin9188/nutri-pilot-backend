/**
 * cuisineFilter — shared cuisine-mode → origin_cuisine query helper.
 *
 * 4 modes (user 2026-05-17: HK-born kids 有港式情结，分开):
 *   all       — 不过滤
 *   chinese   — 中餐（粤菜以外的中式）：川 / 苏 / 鲁 / 浙 / 闽 / 湘 / 徽 / 江浙
 *   hk-style  — 港式：粤菜 (cantonese) + 标题含「港式 / 茶餐厅 / 菠萝包 ...」
 *   western   — 西餐：origin_cuisine='western'
 */

export type CuisineMode = 'chinese' | 'hk-style' | 'western' | 'all';

const HK_STYLE_KEYWORDS = ['港式', '茶餐厅', '茶餐廳', '菠萝包', '菠蘿包', '丝袜奶茶', '絲襪奶茶', '蛋挞', '蛋撻', '凉茶', '涼茶', '车仔面', '車仔麵', '云吞面', '雲吞麵', '叉烧饭', '叉燒飯', '烧腊', '燒臘'];

/** Read the saved Home cuisine mode. "全部" was retired 2026-05-17 — the
 *  picker now forces a specific cuisine, so legacy 'all' values from
 *  localStorage are coerced to '中餐' on read. CuisineMode type still
 *  carries 'all' for internal callers (applyCuisineFilter no-op), but the
 *  Home UI never sets it again. */
export function loadCuisineMode(): CuisineMode {
  const saved = localStorage.getItem('home_cuisine_mode');
  if (saved === 'chinese' || saved === 'western' || saved === 'hk-style') return saved;
  return 'chinese';
}

/**
 * Apply the cuisine filter to a Supabase / PostgREST query builder.
 * Returns the same builder for chaining. `all` is a no-op.
 *
 * For hk-style, we can only push the cantonese half down to the DB
 * cleanly (origin_cuisine='cantonese'). Title-keyword HK dishes (港式
 * 茶餐厅 etc.) without origin='cantonese' get caught by matchesCuisine
 * at the in-memory scoring pass.
 */
export function applyCuisineFilter<T extends { eq: any; neq: any; not: any }>(
  query: T,
  mode: CuisineMode,
): T {
  if (mode === 'all') return query;
  if (mode === 'western')   return query.eq('origin_cuisine', 'western');
  if (mode === 'hk-style')  return query.eq('origin_cuisine', 'cantonese');
  // chinese — NOT western AND NOT cantonese (the everything-else middle)
  return query.not('origin_cuisine', 'in', '(western,cantonese)');
}

/** In-memory filter (for client-side scoring loops that already have rows). */
export function matchesCuisine(
  originOrDish: string | { origin_cuisine?: string | null; title_zh?: string | null } | null | undefined,
  mode: CuisineMode,
): boolean {
  if (mode === 'all') return true;
  const origin = (typeof originOrDish === 'string'
    ? originOrDish
    : (originOrDish?.origin_cuisine ?? '')).toLowerCase();
  const title = (typeof originOrDish === 'object' && originOrDish
    ? (originOrDish.title_zh ?? '')
    : '');

  if (mode === 'western')  return origin === 'western';
  if (mode === 'hk-style') {
    if (origin === 'cantonese') return true;
    return HK_STYLE_KEYWORDS.some(k => title.includes(k));
  }
  // chinese — neither western nor cantonese (and not a port-keyword dish)
  if (origin === 'western' || origin === 'cantonese') return false;
  if (HK_STYLE_KEYWORDS.some(k => title.includes(k))) return false;
  return true;
}
