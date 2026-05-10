/**
 * useWeeklyMenu — 7-day dinner menu recommendation
 *
 * Algorithm layers:
 *  1. Base score      — 6-axis scoring (hometown 30% + goal 40% + taste 30%
 *                       + humidity + solar term + feedback EMA)
 *  2. Recency decay   — dishes served in last 30 days get a penalty
 *                       (<7d: -0.60, 7-14d: -0.35, 14-30d: -0.15)
 *  3. Week diversity  — same main_ingredient used on a previous day this week
 *                       gets a strong penalty (-0.40 per adjacent day)
 *  4. Day modifier    — weekends boost elaborate dishes; weekdays boost quick ones
 *  5. Weighted sample — top-20 candidates → weighted-random pick (avoids
 *                       always showing the same top-scored dishes)
 *
 * Persistence:
 *  • Primary: user_weekly_menus (Supabase) — survives device changes
 *  • Fallback: localStorage key "weekly_menu_<weekStart>" — works offline
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { type SupabaseDish } from './useSupabaseMenu';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from './preferenceColMap';
import { getUserPrefs } from '../lib/userPrefs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyDayMenu {
  dayIndex: number;      // 0=Mon … 6=Sun
  dayLabel: string;      // 周一 … 周日
  dishes: SupabaseDish[];
}

export interface WeeklyMenu {
  weekStart: string;           // ISO date string of Monday
  days: WeeklyDayMenu[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getMondayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Weighted random pick: higher score → higher probability
function weightedRandom<T extends { score: number }>(
  candidates: T[],
  count: number,
): T[] {
  const result: T[] = [];
  const pool = [...candidates];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const min = Math.min(...pool.map(c => c.score));
    const shifted = pool.map(c => ({ ...c, w: Math.max(0, c.score - min + 0.1) }));
    const total = shifted.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < shifted.length; j++) {
      r -= shifted[j].w;
      if (r <= 0) { idx = j; break; }
    }
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

// ── Score a dish for weekly planning ─────────────────────────────────────────

interface WeeklyScoreParams {
  dish: any;
  profile: { hometown_cuisine: string | null; dietary_goal: string | null; taste_pref: string | null };
  prefScores: Record<string, number>;
  recentIds: Map<string, number>;   // dishId → days since last served
  pickedIngredients: string[];       // main_ingredient values picked so far this week
  dayIndex: number;                  // 0=Mon … 6=Sun
}

function scoreForWeek({
  dish, profile, prefScores, recentIds, pickedIngredients, dayIndex,
}: WeeklyScoreParams): number {
  const flavorTags: string[]  = dish.flavor_tags ?? [];
  const healthTags: string[]  = dish.health_benefit_tags ?? [];
  const origin: string        = dish.origin_cuisine ?? '';
  const ingredient: string    = dish.main_ingredient ?? 'other';

  // ── 1. Base score (simplified 6-axis without age/humidity/solar) ──────────
  const hometownScore = profile.hometown_cuisine && origin === profile.hometown_cuisine ? 1.0 : 0.0;
  const goalScore     = profile.dietary_goal && healthTags.includes(profile.dietary_goal) ? 1.0 : 0.0;
  const tasteScore    = profile.taste_pref && flavorTags.includes(profile.taste_pref) ? 1.0 : 0.0;
  let score = hometownScore * 0.30 + goalScore * 0.40 + tasteScore * 0.30;

  // Feedback EMA layer
  for (const tag of flavorTags) {
    const col = FLAVOR_COL[tag];
    if (col && prefScores[col]) score += prefScores[col] * 0.10;
  }
  for (const tag of healthTags) {
    const col = HEALTH_COL[tag];
    if (col && prefScores[col]) score += prefScores[col] * 0.10;
  }
  const cuisineCol = CUISINE_COL[origin];
  if (cuisineCol && prefScores[cuisineCol]) score += prefScores[cuisineCol] * 0.10;

  // ── 2. Recency decay ──────────────────────────────────────────────────────
  const daysSince = recentIds.get(dish.id);
  if (daysSince !== undefined) {
    if (daysSince < 7)       score -= 0.60;
    else if (daysSince < 14) score -= 0.35;
    else if (daysSince < 30) score -= 0.15;
  }

  // ── 3. Intra-week ingredient diversity ────────────────────────────────────
  const sameIngCount = pickedIngredients.filter(i => i === ingredient).length;
  score -= sameIngCount * 0.40;

  // ── 4. Day-of-week modifier ───────────────────────────────────────────────
  const isWeekend = dayIndex >= 5; // Sat=5, Sun=6
  if (isWeekend) {
    // Weekends: prefer richer, more elaborate dishes (meat / seafood)
    if (['pork','beef','lamb','seafood','fish','shrimp','crab'].includes(ingredient)) score += 0.15;
  } else {
    // Weekdays: prefer quick home-cooking (veggie, egg, tofu)
    if (['veggie','egg','tofu','mushroom'].includes(ingredient)) score += 0.10;
  }

  // Slight bonus for vegan dishes on Monday (reset after weekend eating)
  if (dayIndex === 0 && dish.is_vegan) score += 0.10;

  return score;
}

// ── Enrich raw DB row → SupabaseDish (lightweight copy of enrichDish) ─────────

function enrichRaw(dish: any): SupabaseDish {
  const lang = (localStorage.getItem('appLanguage') ?? 'zh') as 'en' | 'zh';
  const title = lang === 'zh'
    ? (dish.title_zh || dish.title_en || '')
    : (dish.title_en || dish.title_zh || '');
  const desc = lang === 'zh'
    ? (dish.description_zh || dish.description_en || '')
    : (dish.description_en || dish.description_zh || '');
  return {
    ...dish,
    title,
    desc,
    img: dish.image_url || '',
    is_vegetarian: (dish.flavor_tags ?? []).includes('veggie'),
    is_vegan: dish.is_vegan ?? false,
    type: (dish.flavor_tags ?? []).includes('veggie') ? 'VEGGIE'
        : (dish.flavor_tags ?? []).includes('seafood') ? 'SEAFOOD'
        : 'MEAT',
    highlight: false,
    description_en: dish.description_en || '',
    _raw: dish,
  };
}

// ── Generate weekly plan from dish pool ───────────────────────────────────────

function generateWeekPlan(
  pool: any[],
  profile: { hometown_cuisine: string | null; dietary_goal: string | null; taste_pref: string | null },
  prefScores: Record<string, number>,
  recentIds: Map<string, number>,
  dishesPerDay = 5,
): WeeklyMenu {
  const weekStart = getMondayISO();
  const days: WeeklyDayMenu[] = [];
  const usedIds = new Set<string>();
  const pickedIngredients: string[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    // Score all dishes not yet used this week
    const candidates = pool
      .filter(d => !usedIds.has(d.id))
      .map(d => ({
        dish: d,
        score: scoreForWeek({ dish: d, profile, prefScores, recentIds, pickedIngredients, dayIndex }),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30); // top-30 candidates for weighted random

    // Pick dishesPerDay dishes via weighted random
    const picked = weightedRandom(candidates, dishesPerDay).map(c => c.dish);

    // Mark as used + track ingredients
    picked.forEach(d => {
      usedIds.add(d.id);
      pickedIngredients.push(d.main_ingredient ?? 'other');
    });

    days.push({
      dayIndex,
      dayLabel: DAY_LABELS[dayIndex],
      dishes: picked.map(d => enrichRaw(d)),
    });
  }

  return { weekStart, days };
}

// ── Supabase persistence ──────────────────────────────────────────────────────

async function loadFromDB(userId: string, weekStart: string): Promise<WeeklyMenu | null> {
  const { data, error } = await supabase
    .from('user_weekly_menus')
    .select('day_index, dish_ids, swapped_dish_ids')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .eq('meal_type', 'dinner')
    .order('day_index');

  if (error || !data || data.length < 7) return null;

  // Re-fetch dishes by id array
  const allIds = data.flatMap(r => (r.swapped_dish_ids ?? r.dish_ids) as string[]);
  const { data: dishes } = await supabase
    .from('dishes')
    .select('*')
    .in('id', allIds);
  if (!dishes) return null;

  const dishMap = new Map(dishes.map(d => [d.id, d]));

  const days: WeeklyDayMenu[] = data.map(row => {
    const ids = (row.swapped_dish_ids ?? row.dish_ids) as string[];
    return {
      dayIndex: row.day_index as number,
      dayLabel: DAY_LABELS[row.day_index as number],
      dishes: ids.map(id => dishMap.get(id)).filter(Boolean).map(d => enrichRaw(d)),
    };
  });

  return { weekStart, days };
}

async function saveToDB(userId: string, menu: WeeklyMenu): Promise<void> {
  const rows = menu.days.map(day => ({
    user_id:   userId,
    week_start: menu.weekStart,
    day_index:  day.dayIndex,
    meal_type:  'dinner',
    dish_ids:   day.dishes.map(d => d.id),
  }));

  await supabase
    .from('user_weekly_menus')
    .upsert(rows, { onConflict: 'user_id,week_start,day_index,meal_type' });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWeeklyMenu() {
  const [weeklyMenu, setWeeklyMenu] = useState<WeeklyMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-generate when user updates preferences
  useEffect(() => {
    const handler = () => {
      const weekStart = getMondayISO();
      localStorage.removeItem(`weekly_menu_${weekStart}`);
      setWeeklyMenu(null);
      setRefreshKey(k => k + 1);
    };
    window.addEventListener('nutri-prefs-changed', handler);
    return () => window.removeEventListener('nutri-prefs-changed', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      setLoading(true);

      const weekStart = getMondayISO();
      const userId    = localStorage.getItem('nutri_user_id') ?? 'anonymous';

      // 1. Try DB cache first
      const cached = await loadFromDB(userId, weekStart);
      if (cached && !cancelled) {
        setWeeklyMenu(cached);
        setLoading(false);
        return;
      }

      // 2. Try localStorage cache
      const lsKey  = `weekly_menu_${weekStart}`;
      const lsRaw  = localStorage.getItem(lsKey);
      if (lsRaw) {
        try {
          const parsed = JSON.parse(lsRaw) as WeeklyMenu;
          if (!cancelled) {
            setWeeklyMenu(parsed);
            setLoading(false);
            return;
          }
        } catch { /* corrupt cache, regenerate */ }
      }

      // 3. Generate fresh plan
      try {
        // Read user preferences (quickPrefs → legacy fallback)
        const localPrefs = getUserPrefs();

        // Fetch dish pool (dinner + all-type, limit 400)
        let poolQuery = supabase
          .from('dishes')
          .select('*')
          .or('meal_type.in.(dinner,all),meal_type.is.null')
          .limit(400);

        // Vegetarian-only filter at DB level (optimization)
        if (localPrefs.vegetarianOnly) {
          poolQuery = poolQuery.eq('is_vegan', true);
        }

        const { data: rawPool } = await poolQuery;

        if (!rawPool || cancelled) { setLoading(false); return; }

        // Apply hard filters from user prefs
        const pool = rawPool.filter(dish => {
          // Tag exclusion
          if (localPrefs.avoidTags.length > 0) {
            const allTags = [...(dish.flavor_tags ?? []), ...(dish.health_benefit_tags ?? [])];
            if (allTags.some((t: string) => localPrefs.avoidTags.includes(t))) return false;
          }
          // Ingredient exclusion
          if (localPrefs.avoidIngredients.length > 0 && dish.main_ingredient) {
            if (localPrefs.avoidIngredients.includes(dish.main_ingredient)) return false;
          }
          return true;
        });

        // Fetch user profile
        const { data: profileRow } = await supabase
          .from('user_profiles')
          .select('hometown_cuisine, dietary_goal, taste_pref')
          .eq('id', userId)
          .single()
          .then(r => r, () => ({ data: null }));

        const profile = {
          hometown_cuisine: (profileRow as any)?.hometown_cuisine ?? null,
          dietary_goal:     (profileRow as any)?.dietary_goal ?? localPrefs.dietaryGoal,
          taste_pref:       (profileRow as any)?.taste_pref ?? localPrefs.tastePref,
        };

        // Fetch recent dish history (last 30 days)
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { data: history } = await supabase
          .from('user_dish_history')
          .select('dish_id, served_date')
          .eq('user_id', userId)
          .gte('served_date', since.toISOString().slice(0, 10));

        const recentIds = new Map<string, number>();
        const today = new Date();
        (history ?? []).forEach((row: any) => {
          const days = Math.floor(
            (today.getTime() - new Date(row.served_date).getTime()) / 86400000
          );
          const existing = recentIds.get(row.dish_id);
          if (existing === undefined || days < existing) recentIds.set(row.dish_id, days);
        });

        // Fetch feedback scores
        const { data: scoreRow } = await supabase
          .from('user_preference_scores')
          .select('*')
          .eq('user_id', userId)
          .single()
          .then(r => r, () => ({ data: null }));

        const prefScores: Record<string, number> = (scoreRow as any) ?? {};

        const menu = generateWeekPlan(pool, profile, prefScores, recentIds);

        if (cancelled) return;

        // Persist
        localStorage.setItem(lsKey, JSON.stringify(menu));
        saveToDB(userId, menu).catch(() => {/* non-critical */});

        setWeeklyMenu(menu);
      } catch (err) {
        console.error('useWeeklyMenu error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    build();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Swap a single dish on a given day (user override)
  async function swapDish(dayIndex: number, slotIndex: number, newDish: SupabaseDish) {
    if (!weeklyMenu) return;

    const updated: WeeklyMenu = {
      ...weeklyMenu,
      days: weeklyMenu.days.map(day =>
        day.dayIndex === dayIndex
          ? {
              ...day,
              dishes: day.dishes.map((d, i) => (i === slotIndex ? newDish : d)),
            }
          : day
      ),
    };

    setWeeklyMenu(updated);

    const lsKey = `weekly_menu_${weeklyMenu.weekStart}`;
    localStorage.setItem(lsKey, JSON.stringify(updated));

    const userId = localStorage.getItem('nutri_user_id') ?? 'anonymous';
    const day = updated.days[dayIndex];
    await supabase.from('user_weekly_menus').upsert({
      user_id:          userId,
      week_start:       weeklyMenu.weekStart,
      day_index:        dayIndex,
      meal_type:        'dinner',
      dish_ids:         weeklyMenu.days[dayIndex].dishes.map(d => d.id),
      swapped_dish_ids: day.dishes.map(d => d.id),
    }, { onConflict: 'user_id,week_start,day_index,meal_type' });
  }

  // Regenerate (discard cache, re-run algorithm)
  function regenerate() {
    if (!weeklyMenu) return;
    localStorage.removeItem(`weekly_menu_${weeklyMenu.weekStart}`);
    setWeeklyMenu(null);
    setLoading(true);
    // Re-trigger useEffect via state reset
    window.dispatchEvent(new Event('nutri-weekly-regenerate'));
  }

  return { weeklyMenu, loading, swapDish, regenerate };
}
