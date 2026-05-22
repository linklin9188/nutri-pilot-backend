/**
 * mealLog.ts — TICKET-024 §A DB write for meal_logs table (Database 021 ship).
 *
 * Separate concern from eatingDiary.ts (localStorage today-display). This
 * layer is the durable history that weekStats edge fn reads to compute 7-day
 * deficits → drives the 💪 weekly_balance channel TagBadge.
 *
 * Table contract (migration 074):
 *   meal_logs (
 *     id           uuid PK,
 *     user_id      text NOT NULL,         -- application userId, NOT auth.users FK
 *     dish_id      uuid NOT NULL FK→dishes ON DELETE CASCADE,
 *     consumed_at  timestamptz default now(),
 *     meal_type    text CHECK in ('breakfast','lunch','dinner','snack','fruit'),
 *     portion      numeric default 1.0,
 *     notes        text
 *   )
 *
 * Append-only by RLS (no UPDATE / DELETE policy). To "undo" a logged meal,
 * insert a new row with portion=0 — Algorithm sums portion across rows.
 *
 * Side effects on success:
 *   - sessionStorage 'weekstats_cache_*' keys invalidated → next menu
 *     generation re-fetches deficits, 💪 chip refreshes
 *   - 'nutri-meal-logged' window event dispatched for any UI counter
 */
import { supabase } from './supabase';
import { getUserId } from './userId';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'fruit';

export interface LogMealResult {
  ok:     boolean;
  error?: string;
}

const MEAL_TIME_TO_TYPE: Record<string, MealType> = {
  '早餐':   'breakfast',
  '午餐':   'lunch',
  '晚餐':   'dinner',
  '水果':   'fruit',
  '加餐':   'snack',
  'breakfast': 'breakfast',
  'lunch':     'lunch',
  'dinner':    'dinner',
  'fruit':     'fruit',
  'snack':     'snack',
};

/** Resolve a UI meal label (zh or en) to a DB meal_type enum value. */
export function resolveMealType(rawLabel: string | undefined): MealType {
  if (!rawLabel) return 'dinner';
  return MEAL_TIME_TO_TYPE[rawLabel] ?? 'dinner';
}

/** Invalidate weekStats sessionStorage cache so 💪 chip refreshes next menu gen. */
function invalidateWeekStatsCache() {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('weekstats_cache_')) toRemove.push(k);
    }
    for (const k of toRemove) sessionStorage.removeItem(k);
  } catch { /* private mode etc — non-critical */ }
}

/**
 * Append a meal_logs row. Default portion=1.0 (one serving).
 * Returns { ok: false, error } on failure — caller decides whether to toast.
 */
export async function logMealEaten(opts: {
  dishId:   string;
  mealType: MealType | string;
  portion?: number;
  userId?:  string;
}): Promise<LogMealResult> {
  const userId = opts.userId ?? getUserId();
  if (!userId)   return { ok: false, error: 'no userId' };
  if (!opts.dishId) return { ok: false, error: 'no dishId' };

  const meal_type = resolveMealType(opts.mealType);
  const portion = opts.portion ?? 1.0;

  try {
    const { error } = await supabase
      .from('meal_logs')
      .insert({
        user_id:    userId,
        dish_id:    opts.dishId,
        meal_type,
        portion,
      });
    if (error) return { ok: false, error: error.message };

    invalidateWeekStatsCache();
    try { window.dispatchEvent(new Event('nutri-meal-logged')); }
    catch { /* SSR — silent */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
