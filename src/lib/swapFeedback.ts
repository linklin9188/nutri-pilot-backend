/**
 * swapFeedback.ts — record swap events and update preference counters.
 *
 * Storage model rewrite (2026-05-17, user direction): the old EMA layer
 * (`prev * 0.85 + delta`) saturated at ≈0.67, so "user kept 川菜 10 times"
 * had identical influence as "kept 川菜 100 times". That's wrong for the
 * product intent — we want sustained usage to override the cold-start
 * profile. The new model is a **cumulative count** with no decay, and
 * the scoring layer applies a **power curve** so each additional signal
 * super-linearly increases the dish's bonus.
 *
 * Steps:
 *   POSITIVE_STEP = +1.0   (one "kept this dish" = one count)
 *   NEGATIVE_STEP = -0.5   (rejection counts as half a reverse signal —
 *                           dropping a dish is a weaker preference than
 *                           positively choosing it)
 *
 * Caps remain at ±25 (≈25 sustained signals) so a runaway-bot account
 * can't push origin scores into absurd territory.
 *
 * Anonymous users still get localStorage keyword tracking — those don't
 * write to Supabase.
 */

import { supabase } from './supabase';
import { getUserId } from './userId';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from '../hooks/preferenceColMap';

const POSITIVE_STEP = 1.0;
const NEGATIVE_STEP = -0.5;
const COUNTER_CAP   = 25;

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

  // Cumulative count, no decay. 25 sustained 信号 hits the cap; the
  // scoring layer then applies a power curve (cnt^1.5 × 0.05) so each
  // additional count super-linearly boosts the dish — making "5 次川菜"
  // a meaningfully stronger signal than "1 次川菜", which the old EMA
  // couldn't express (it saturated at 0.667).
  const apply = (col: string) => {
    const prev = Number(scores[col] ?? 0);
    const next = Math.max(-COUNTER_CAP, Math.min(COUNTER_CAP, prev + delta));
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
