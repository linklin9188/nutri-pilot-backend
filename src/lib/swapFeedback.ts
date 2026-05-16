/**
 * swapFeedback.ts — record swap events and update preference EMA.
 *
 * Called from 3 entry points:
 *   - Home `handleSwapAll` (whole meal re-roll) — source='home_swap_all'
 *   - Home per-dish sync_alt button (single swap)  — source='home_per_dish'
 *   - WeeklyMenu swapDish (single swap from /weekly) — source='weekly_swap'
 *
 * On each call we:
 *   1. INSERT a row into `user_swap_events` (audit log of preferences).
 *   2. Apply negative EMA to the REJECTED dish's tags
 *      (user explicitly said 'not this one' — stronger signal than view).
 *   3. Apply positive EMA to the REPLACEMENT dish's tags
 *      (user kept this one over the alternative — implicit endorsement).
 *
 * EMA constants:
 *   POSITIVE_STEP = +0.10  (smaller than recordEngagement's +0.15 — that's
 *                           triggered by going into /prep which is a stronger
 *                           "actually cooking" commitment)
 *   NEGATIVE_STEP = -0.15  (rejection is a strong signal — we want it to
 *                           pull down more aggressively than passive +0.15)
 *
 * Anonymous users still get the localStorage keyword tracking via the
 * shared TITLE_KEYWORDS list, mirroring useFeedbackEngine.
 */

import { supabase } from './supabase';
import { getUserId } from './userId';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from '../hooks/preferenceColMap';

const POSITIVE_STEP = 0.10;
const NEGATIVE_STEP = -0.15;

const TITLE_KEYWORDS = [
  '排骨', '鸡腿', '鸡翅', '鸡胸', '全鸡', '烤鸡',
  '牛腩', '牛排', '牛肉', '羊肉', '五花肉', '猪蹄',
  '虾', '螃蟹', '鱼', '贝', '蛤',
];

function extractKeyword(titleZh: string): string | null {
  return TITLE_KEYWORDS.find(kw => titleZh.includes(kw)) ?? null;
}

function bumpLocalKeyword(titleZh: string | undefined, delta: number) {
  if (!titleZh) return;
  const kw = extractKeyword(titleZh);
  if (!kw) return;
  try {
    const prefs = JSON.parse(localStorage.getItem('user_keyword_prefs') || '{}');
    const next  = Math.max(-10, Math.min(10, (prefs[kw] ?? 0) + delta));
    prefs[kw]   = next;
    localStorage.setItem('user_keyword_prefs', JSON.stringify(prefs));
  } catch {}
}

export interface SwapDish {
  id: string;
  title_zh?: string;
  flavor_tags?: string[];
  health_benefit_tags?: string[];
  origin_cuisine?: string;
}

interface SwapEvent {
  rejected:    SwapDish;
  replacement?: SwapDish | null;
  mealType?:   '早餐' | '午餐' | '晚餐';
  source:      'home_swap_all' | 'home_per_dish' | 'weekly_swap';
}

/**
 * Apply an EMA delta to a dish's tags. Positive `delta` boosts; negative
 * pulls down. Caps applied at ±10 to avoid runaway drift.
 */
async function applyEMA(userId: string, dish: SwapDish, delta: number) {
  if (!userId || userId === 'anonymous') return;

  // Fetch current preference scores
  const { data: current } = await supabase
    .from('user_preference_scores')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  const scores: Record<string, number> = (current as any) ?? {};

  const updates: Record<string, any> = { user_id: userId };

  // EMA: new = old * 0.85 + delta — same decay constant as recordEngagement
  // so positive and negative signals balance over time.
  const apply = (col: string) => {
    const prev = Number(scores[col] ?? 0);
    const next = Math.max(-10, Math.min(10, prev * 0.85 + delta));
    updates[col] = next;
  };

  for (const tag of dish.flavor_tags ?? []) {
    const col = FLAVOR_COL[tag];
    if (col) apply(col);
  }
  for (const tag of dish.health_benefit_tags ?? []) {
    const col = HEALTH_COL[tag];
    if (col) apply(col);
  }
  const cuisineCol = CUISINE_COL[dish.origin_cuisine ?? ''];
  if (cuisineCol) apply(cuisineCol);

  if (Object.keys(updates).length <= 1) return; // nothing to write

  await supabase
    .from('user_preference_scores')
    .upsert(updates, { onConflict: 'user_id' })
    .then(() => {}, () => {/* non-critical */});
}

/** Record a single swap event end-to-end. */
export async function recordSwap(evt: SwapEvent): Promise<void> {
  const userId = getUserId() ?? 'anonymous';

  // 1. Keyword counter (works for anonymous too)
  bumpLocalKeyword(evt.rejected.title_zh, -1);
  if (evt.replacement?.title_zh) bumpLocalKeyword(evt.replacement.title_zh, +1);

  // 2. Audit log row
  if (userId !== 'anonymous') {
    await supabase
      .from('user_swap_events')
      .insert({
        user_id:             userId,
        rejected_dish_id:    evt.rejected.id,
        replacement_dish_id: evt.replacement?.id ?? null,
        meal_type:           evt.mealType,
        source:              evt.source,
      })
      .then(() => {}, () => {/* non-critical */});
  }

  // 3. EMA updates (parallel)
  await Promise.all([
    applyEMA(userId, evt.rejected, NEGATIVE_STEP),
    evt.replacement ? applyEMA(userId, evt.replacement, POSITIVE_STEP) : Promise.resolve(),
  ]);
}

/** Batch variant — used by Home's '换菜' button which re-rolls multiple dishes. */
export async function recordBatchSwap(
  rejectedDishes: SwapDish[],
  replacementDishes: SwapDish[],
  mealType: '早餐' | '午餐' | '晚餐',
): Promise<void> {
  await Promise.all(
    rejectedDishes.map((r, i) => recordSwap({
      rejected: r,
      replacement: replacementDishes[i] ?? null,
      mealType,
      source: 'home_swap_all',
    })),
  );
}
