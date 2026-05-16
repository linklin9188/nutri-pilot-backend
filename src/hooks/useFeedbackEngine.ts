/**
 * useFeedbackEngine — records dish engagement signals and updates preference scores.
 *
 * Called when a user starts prepping or cooking a dish (positive signal).
 * Updates:
 *   - user_preference_scores: EMA weights for flavor_tags, health_benefit_tags, origin_cuisine
 *   - localStorage 'user_keyword_prefs': title keyword engagement counts (排骨, 鸡腿, etc.)
 *
 * EMA formula: new_score = old_score * 0.85 + 0.15
 * (decays toward 0 over time, boosts on engagement)
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

  // EMA update for each tag
  const updates: Record<string, number> = { user_id: userId as any };

  for (const tag of (dish.flavor_tags ?? [])) {
    const col = FLAVOR_COL[tag];
    if (col) updates[col] = ((scores[col] ?? 0) * 0.85) + 0.15;
  }
  for (const tag of (dish.health_benefit_tags ?? [])) {
    const col = HEALTH_COL[tag];
    if (col) updates[col] = ((scores[col] ?? 0) * 0.85) + 0.15;
  }
  const cuisineCol = CUISINE_COL[dish.origin_cuisine ?? ''];
  if (cuisineCol) updates[cuisineCol] = ((scores[cuisineCol] ?? 0) * 0.85) + 0.15;

  if (Object.keys(updates).length > 1) {
    await supabase
      .from('user_preference_scores')
      .upsert(updates as any, { onConflict: 'user_id' })
      .then(() => {}, () => {});
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

    // 2. Update EMA scores in Supabase (logged-in users only)
    await updateEMAScores(userId, dish).catch(() => {});
  }, []);

  return { recordEngagement };
}
