/**
 * favorites.ts — User's saved dishes (a.k.a. 收藏菜单)
 *
 * Lightweight persistence in localStorage for the test phase. The shape is
 * defined so the same payload could later be mirrored to Supabase (e.g. a
 * 'favorite_dishes' table keyed by user_id + dish_id) without the call sites
 * having to change.
 *
 * UI integration points (so we don't drift later):
 *   • Home              — heart icon next to each recommended dish
 *   • WeeklyMenu        — heart icon on each MealSection card
 *   • Banquet result    — heart icon next to each course dish
 *   • ProWellness / SchoolBalance — heart on suggested dishes
 *   • Favorites page    — the index, with one-tap add-to-weekly-menu
 */

const LS_KEY = 'nutri_favorites';

export interface FavoriteDish {
  /** Stable identifier — prefers the dishes.id UUID, falls back to title_zh
   *  for AI-generated dishes that don't live in the DB. */
  id:         string;
  title_zh:   string;
  title_en?:  string;
  image_url?: string;
  course_type?:    string;    // main_protein / veggie_dish / soup / staple / dessert
  main_ingredient?: string;
  origin_cuisine?: string;
  /** Free-form tag the user attached when they saved it. Examples:
   *  '家宴' / '祛湿' / '学校营养' / '本周菜单' — used for grouping the page. */
  source_tag?: string;
  saved_at:    number;        // ms since epoch
}

/** Read the saved list. Defensively tolerates schema drift. */
export function loadFavorites(): FavoriteDish[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as FavoriteDish[] : [];
  } catch {
    return [];
  }
}

/** Save the full list (overwrites). Used by toggle helpers below. */
function persist(list: FavoriteDish[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('nutri-favorites-changed'));
}

export function isFavorited(dishId: string): boolean {
  return loadFavorites().some(f => f.id === dishId);
}

/** Add a dish to favorites. No-op if already saved. Returns the up-to-date list. */
export function addFavorite(dish: Omit<FavoriteDish, 'saved_at'>): FavoriteDish[] {
  const list = loadFavorites();
  if (list.some(f => f.id === dish.id)) return list;
  const next = [{ ...dish, saved_at: Date.now() }, ...list];
  persist(next);
  return next;
}

/** Remove from favorites by id. */
export function removeFavorite(dishId: string): FavoriteDish[] {
  const next = loadFavorites().filter(f => f.id !== dishId);
  persist(next);
  return next;
}

/** Convenience: toggle one dish. Returns the new "is favorited" state. */
export function toggleFavorite(dish: Omit<FavoriteDish, 'saved_at'>): boolean {
  if (isFavorited(dish.id)) {
    removeFavorite(dish.id);
    return false;
  }
  addFavorite(dish);
  return true;
}

/** Group favorites by source_tag — handy for the index page. */
export function groupFavoritesByTag(): { tag: string; items: FavoriteDish[] }[] {
  const list = loadFavorites();
  const groups = new Map<string, FavoriteDish[]>();
  for (const f of list) {
    const tag = f.source_tag ?? '其他';
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push(f);
  }
  return [...groups.entries()].map(([tag, items]) => ({ tag, items }));
}
