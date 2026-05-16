/**
 * cuisineFilter — shared cuisine-mode → origin_cuisine query helper.
 *
 * `cuisineMode` is the 中餐 / 西餐 / 全部 toggle on Home. Previously it was
 * only enforced as a post-filter in displayMenu, so the recommend/weekly
 * pool would score across all cuisines, then UI would strip western —
 * collapsing 3 candidates down to 1 when the top-scored happened to
 * straddle. This module pushes the filter down to the DB query so the
 * top-N scoring picks from the right cuisine bucket directly.
 */

export type CuisineMode = 'chinese' | 'western' | 'all';

/** Read the saved Home cuisine mode. Falls back to 'chinese'. */
export function loadCuisineMode(): CuisineMode {
  const saved = localStorage.getItem('home_cuisine_mode');
  if (saved === 'chinese' || saved === 'western' || saved === 'all') return saved;
  return 'chinese';
}

/**
 * Apply the cuisine filter to a Supabase query builder. Returns the same
 * builder for chaining. The "all" mode is a no-op.
 *
 * - chinese: origin_cuisine NOT western (NULL allowed)
 * - western: origin_cuisine = western
 *
 * Implementation note: PostgREST `.neq` with `null` doesn't strip NULL
 * rows, which is what we want — a dish with no origin still counts as
 * non-western.
 */
export function applyCuisineFilter<T extends { eq: any; neq: any }>(
  query: T,
  mode: CuisineMode,
): T {
  if (mode === 'all') return query;
  if (mode === 'western') return query.eq('origin_cuisine', 'western');
  // chinese
  return query.neq('origin_cuisine', 'western');
}

/** In-memory filter (for client-side scoring loops that already have the rows). */
export function matchesCuisine(
  origin: string | null | undefined,
  mode: CuisineMode,
): boolean {
  if (mode === 'all') return true;
  const c = (origin ?? '').toLowerCase();
  if (mode === 'western') return c === 'western';
  return c !== 'western';
}
