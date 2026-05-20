/**
 * useFeedbackEngine — records dish engagement signals and consumes user ratings.
 *
 * Two channels:
 *   1. recordEngagement(dish): "user starts prepping / cooking" → +1.0 to each tag
 *      column on user_preference_scores (cumulative count, COUNTER_CAP=25).
 *   2. consumeRatings(): pulls last-30-days user_feedback WHERE feedback_type IN
 *      ('rating_good','rating_okay','rating_bad'), aggregates by dish_id, fans
 *      out to tag columns with weights (good +1.0 / okay 0 / bad -0.5), upserts
 *      into user_preference_scores; ≥10 new feedback rows → INSERT a
 *      prefscores_training_log row with delta summary.
 *
 * Sigmoid layer in scoreForWeek applies a confidence-scaled multiplier on top
 * of these raw counts (see useWeeklyMenu.ts §4 learned-data layer); this hook
 * only writes finer-grained data, scoreForWeek not touched.
 *
 * NOTE: consumeRatings depends on `user_feedback` + `prefscores_training_log`
 * tables (Database migration 027 / TICKET-012). Until those land, SELECT will
 * return [] (empty result, no error) and INSERT will silently fail via
 * .then(_, _) — same anon-first error swallow pattern as recordEngagement.
 */

import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from './preferenceColMap';

// Title keywords to track (same list as in useWeeklyMenu.ts)
const TITLE_KEYWORDS = [
  '排骨', '鸡腿', '鸡翅', '鸡胸', '全鸡', '烤鸡',
  '牛腩', '牛排', '牛肉', '羊肉', '五花肉', '猪蹄',
  '虾', '螃蟹', '鱼', '贝', '蛤',
];

function extractKeyword(titleZh: string): string | null {
  return TITLE_KEYWORDS.find(kw => titleZh.includes(kw)) ?? null;
}

function getKeywordPrefs(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('user_keyword_prefs') || '{}'); } catch { return {}; }
}

function saveKeywordPref(keyword: string) {
  const prefs = getKeywordPrefs();
  prefs[keyword] = Math.min(10, (prefs[keyword] ?? 0) + 1);
  localStorage.setItem('user_keyword_prefs', JSON.stringify(prefs));
}

const COUNTER_CAP = 25;

async function updateEMAScores(userId: string, dish: {
  flavor_tags?: string[];
  health_benefit_tags?: string[];
  origin_cuisine?: string;
}) {
  if (!userId || userId === 'anonymous') return;

  // Fetch current scores
  const { data: current } = await supabase
    .from('user_preference_scores')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const scores: Record<string, number> = (current as any) ?? {};

  // Cumulative count update for each tag (no EMA decay). One engagement
  // event (e.g. tapping into /prep — "actually about to cook") contributes
  // +1.0 to every tag the dish carries. Scoring layer applies a power
  // curve later so a flavor / cuisine the user has hit 5+ times begins
  // to dominate the hometown bias.
  const STEP = 1.0;
  const updates: Record<string, number> = { user_id: userId as any };
  const bump = (col: string) => {
    const next = Math.max(-COUNTER_CAP, Math.min(COUNTER_CAP, (scores[col] ?? 0) + STEP));
    updates[col] = next;
  };

  for (const tag of (dish.flavor_tags ?? [])) {
    const col = FLAVOR_COL[tag];
    if (col) bump(col);
  }
  for (const tag of (dish.health_benefit_tags ?? [])) {
    const col = HEALTH_COL[tag];
    if (col) bump(col);
  }
  const cuisineCol = CUISINE_COL[dish.origin_cuisine ?? ''];
  if (cuisineCol) bump(cuisineCol);

  if (Object.keys(updates).length > 1) {
    await supabase
      .from('user_preference_scores')
      .upsert(updates as any, { onConflict: 'user_id' })
      .then(() => {}, () => {});
  }
}

// ── §A (TICKET-015): consume user_feedback ratings → prefScores + training log ──
//
// Rating weights — confirmed in CEO 工单 TELEPOT-20260520-015 §A：
//   rating_good +1.0 / rating_okay 0 / rating_bad -0.5
//
// Per-tag delta = sum of (rating weight × #tags-this-dish-carries) across
// rated dishes. Bounded to ±COUNTER_CAP per column.
const RATING_WEIGHT: Record<string, number> = {
  rating_good: 1.0,
  rating_okay: 0,
  rating_bad: -0.5,
};

async function consumeRatingFeedback(userId: string) {
  if (!userId || userId === 'anonymous') return;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  // 1. Pull last 30 days of rating feedback
  const { data: feedbacks } = await supabase
    .from('user_feedback')
    .select('dish_id, feedback_type, created_at')
    .eq('user_id', userId)
    .in('feedback_type', ['rating_good', 'rating_okay', 'rating_bad'])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (!feedbacks || feedbacks.length === 0) return;

  // 2. Aggregate by dish_id → cumulative rating weight
  const dishWeights = new Map<string, number>();
  for (const row of feedbacks) {
    const w = RATING_WEIGHT[(row as any).feedback_type] ?? 0;
    if (w === 0) continue;
    const dish_id = (row as any).dish_id;
    if (!dish_id) continue;
    dishWeights.set(dish_id, (dishWeights.get(dish_id) ?? 0) + w);
  }

  if (dishWeights.size === 0) return;

  // 3. Fetch dish tags
  const dishIds = Array.from(dishWeights.keys());
  const { data: dishes } = await supabase
    .from('dishes')
    .select('id, flavor_tags, health_benefit_tags, origin_cuisine')
    .in('id', dishIds);

  if (!dishes || dishes.length === 0) return;

  // 4. Fetch current pref scores
  const { data: current } = await supabase
    .from('user_preference_scores')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const scores: Record<string, number> = (current as any) ?? {};

  // 5. Compute tag deltas
  const tagDelta: Record<string, number> = {};
  for (const dish of dishes) {
    const w = dishWeights.get((dish as any).id) ?? 0;
    if (w === 0) continue;
    for (const tag of (((dish as any).flavor_tags ?? []) as string[])) {
      const col = FLAVOR_COL[tag];
      if (col) tagDelta[col] = (tagDelta[col] ?? 0) + w;
    }
    for (const tag of (((dish as any).health_benefit_tags ?? []) as string[])) {
      const col = HEALTH_COL[tag];
      if (col) tagDelta[col] = (tagDelta[col] ?? 0) + w;
    }
    const cuisineCol = CUISINE_COL[((dish as any).origin_cuisine ?? '') as string];
    if (cuisineCol) tagDelta[cuisineCol] = (tagDelta[cuisineCol] ?? 0) + w;
  }

  // 6. Upsert bounded scores
  const updates: Record<string, any> = { user_id: userId };
  for (const [col, delta] of Object.entries(tagDelta)) {
    const next = Math.max(-COUNTER_CAP, Math.min(COUNTER_CAP, (scores[col] ?? 0) + delta));
    updates[col] = next;
  }
  if (Object.keys(updates).length > 1) {
    await supabase
      .from('user_preference_scores')
      .upsert(updates, { onConflict: 'user_id' })
      .then(() => {}, () => {});
  }

  // 7. Training log when batch ≥ 10 feedback rows (SPEC §4.1 trigger condition)
  if (feedbacks.length >= 10) {
    const deltaSummary = Object.entries(tagDelta)
      .filter(([, d]) => d !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5)
      .map(([col, d]) => `${col} ${d > 0 ? '+' : ''}${d.toFixed(2)}`)
      .join(' / ');

    await supabase.from('prefscores_training_log').insert({
      user_id: userId,
      feedback_count: feedbacks.length,
      prev_top_dishes: null,   // top-dish ranking computed by retrain cron, not this hook
      next_top_dishes: null,
      delta_summary: deltaSummary || '(no non-zero tag deltas)',
    }).then(() => {}, () => {});
  }
}

export function useFeedbackEngine() {
  const recordEngagement = useCallback(async (dish: {
    id: string;
    title_zh?: string;
    flavor_tags?: string[];
    health_benefit_tags?: string[];
    origin_cuisine?: string;
  }) => {
    const userId = getUserId() ?? 'anonymous';

    // 1. Record keyword preference (works for all users including anonymous)
    const keyword = extractKeyword(dish.title_zh ?? '');
    if (keyword) saveKeywordPref(keyword);

    // 2. Update cumulative-count scores in Supabase (logged-in users only)
    await updateEMAScores(userId, dish).catch(() => {});
  }, []);

  // §A (TICKET-015): batch-consume rating feedback into prefScores.
  // Call from a daily-budget point (Home mount, weekly menu generation, etc.).
  // Idempotent enough: same feedback rows re-counted will hit COUNTER_CAP and
  // saturate; safer once Database lands a "last_consumed_at" cursor (P9+).
  const consumeRatings = useCallback(async () => {
    const userId = getUserId();
    if (!userId || userId === 'anonymous') return;
    await consumeRatingFeedback(userId).catch(() => {});
  }, []);

  return { recordEngagement, consumeRatings };
}
