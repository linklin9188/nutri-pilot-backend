/**
 * favorites.ts — User's saved dishes (a.k.a. 收藏菜单)
 *
 * Storage model: localStorage is the live cache (instant UI, works offline);
 * Supabase `user_favorite_dishes` is the source of truth for cross-device
 * sync. Writes are fire-and-forget — local persists immediately, Supabase
 * upserts in the background. Reads on app boot pull the remote list and
 * merge into local (remote wins on conflict).
 *
 * UI integration points (so we don't drift later):
 *   • Home              — heart icon next to each recommended dish
 *   • WeeklyMenu        — heart icon on each MealSection card
 *   • Banquet result    — heart icon next to each course dish
 *   • ProWellness / SchoolBalance — heart on suggested dishes
 *   • Favorites page    — the index, with one-tap add-to-weekly-menu
 */

import { supabase } from './supabase';
import { getUserId } from './userId';

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
  const full: FavoriteDish = { ...dish, saved_at: Date.now() };
  const next = [full, ...list];
  persist(next);
  // Fire-and-forget cloud sync; failures are non-fatal (we still have local).
  syncAddToCloud(full).catch(() => {/* offline / RLS / etc. */});
  return next;
}

/** Remove from favorites by id. */
export function removeFavorite(dishId: string): FavoriteDish[] {
  const next = loadFavorites().filter(f => f.id !== dishId);
  persist(next);
  syncRemoveFromCloud(dishId).catch(() => {/* non-fatal */});
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

// ── Cloud sync (user_favorite_dishes table) ──────────────────────────────

async function syncAddToCloud(dish: FavoriteDish): Promise<void> {
  const userId = getUserId();
  if (!userId) return;  // anonymous users — local only
  await supabase.from('user_favorite_dishes').upsert({
    user_id:       userId,
    dish_id:       dish.id,
    source_tag:    dish.source_tag ?? null,
    dish_snapshot: dish,
    created_at:    new Date(dish.saved_at).toISOString(),
  }, { onConflict: 'user_id,dish_id' });
}

async function syncRemoveFromCloud(dishId: string): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  await supabase.from('user_favorite_dishes')
    .delete()
    .eq('user_id', userId)
    .eq('dish_id', dishId);
}

/**
 * Pull remote favorites into local cache. Call once on app boot (App.tsx)
 * and on userId change. Remote wins on conflict — if user removed something
 * on another device, the deletion is reflected here.
 */
export async function syncFavoritesFromCloud(): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  const { data, error } = await supabase
    .from('user_favorite_dishes')
    .select('dish_snapshot, source_tag, created_at')
    .eq('user_id', userId);
  if (error || !data) return;
  const remote: FavoriteDish[] = data.map((row: any) => {
    const snap = row.dish_snapshot as FavoriteDish;
    return {
      ...snap,
      source_tag: row.source_tag ?? snap.source_tag,
      saved_at:   snap.saved_at ?? new Date(row.created_at).getTime(),
    };
  });
  // Remote is the source of truth. Replace local cache.
  localStorage.setItem(LS_KEY, JSON.stringify(remote));
  window.dispatchEvent(new Event('nutri-favorites-changed'));
}
