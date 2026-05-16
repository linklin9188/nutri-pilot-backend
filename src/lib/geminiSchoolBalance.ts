/**
 * geminiSchoolBalance.ts — AI nutrition gap analysis for the
 * "学校营养补全" Pro feature.
 *
 * Replaces the keyword-heuristic in ProSchoolBalance with a Gemini call that
 * does real nutrition reasoning given (a) the school lunch description and
 * (b) optional child age. Returns the covered + missing nutrient lists plus
 * three concrete dinner recipes targeted at filling the gap.
 *
 * Falls back gracefully when VITE_GEMINI_API_KEY is missing — the caller
 * keeps the local heuristic as a backup.
 */

import { supabase } from './supabase';
import { getUserId } from './userId';

import { callGemini } from './geminiProxy';

export type Nutrient = 'protein' | 'veggie' | 'carb' | 'calcium' | 'iron' | 'omega3';

export interface BalanceRecipe {
  name_zh:  string;
  name_en:  string;
  emoji:    string;
  covers:   Nutrient[];
  time_min: number;
  blurb:    string;
  /** Set after persistSchoolSuggestions runs — links the suggestion to a
   *  real `dishes` table row so the user can add it to today's menu. */
  dish_id?: string;
}

export interface BalanceAnalysis {
  covered:     Nutrient[];
  missing:     Nutrient[];
  reasoning:   string;          // one-line summary shown to the parent
  suggestions: BalanceRecipe[]; // exactly 3 recipes targeted at the gap
}

const PROMPT_TEMPLATE = (lunch: string, ageBracket: string) => `You are a registered HK pediatric nutritionist advising a parent on whether their child got balanced nutrition at school today, and suggesting what to cook for dinner to fill the gaps.

Child age bracket: ${ageBracket}
School lunch eaten today:
${lunch}

Tasks:
1. Decide which of these 6 nutrient groups the lunch covered well:
   protein, veggie, carb, calcium, iron, omega3
   - "covered" = at least one substantial source on the plate.
   - Ignore tiny garnishes; focus on the meal's main components.

2. List the nutrient groups that are MISSING or short.

3. Write a one-line Chinese summary of the lunch's nutrition profile
   (no more than 30 chars).

4. Suggest exactly THREE 中式 / 家常 dinner dishes a busy HK family can
   cook in 30 minutes or less, each targeting one or more of the missing
   nutrients. Each suggestion should:
   - Use HK-available ingredients (mention specific ingredients in
     parentheses: 例如 "三文鱼 / 菠菜 / 豆腐 / 鸡腿")
   - Be different from each other in protein source / cooking style.
   - Mark a kid-friendly choice with a 🧒 in the emoji slot if the lunch
     suggests kids; otherwise pick a more grown-up dish.

Return ONLY valid JSON in this exact shape:
{
  "covered":   ["protein", ...],
  "missing":   ["calcium", "iron", "omega3"],
  "reasoning": "校餐有蛋白和蔬菜，但缺钙铁与 omega-3",
  "suggestions": [
    {
      "name_zh": "菠菜豆腐汤",
      "name_en": "Spinach tofu soup",
      "emoji":   "🍲",
      "covers":  ["calcium", "iron"],
      "time_min": 15,
      "blurb":   "植物铁 + 钙，菠菜搭豆腐互补"
    }
  ]
}

Rules:
- "covered" / "missing" / each "covers" item must be from this exact set:
  protein, veggie, carb, calcium, iron, omega3.
- "reasoning" must be Chinese, ≤ 30 chars.
- Provide exactly 3 suggestions.
- blurb ≤ 25 Chinese chars.
- Do NOT output anything outside the JSON.`;

export async function analyzeSchoolLunch(
  lunchText: string,
  ageBracket: '幼儿园' | '小学低年级' | '小学高年级' | '初中' = '小学低年级',
): Promise<BalanceAnalysis> {
  const prompt = PROMPT_TEMPLATE(lunchText.trim() || '(空)', ageBracket);

  const json = await callGemini({
    endpoint: 'school_balance',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });

  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let analysis: BalanceAnalysis;
  try {
    const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim());
    analysis = {
      covered:     (parsed.covered ?? []) as Nutrient[],
      missing:     (parsed.missing ?? []) as Nutrient[],
      reasoning:   parsed.reasoning ?? '',
      suggestions: (parsed.suggestions ?? []) as BalanceRecipe[],
    };
  } catch {
    throw new Error('Failed to parse Gemini response');
  }

  // Persist suggestions to `dishes` so the parent can add them to today's
  // menu, AND log the lunch entry to `user_lunch_log` for future tracking.
  // Errors are non-critical — analysis still shows to user.
  try {
    analysis = await persistSchoolSuggestions(analysis, lunchText.trim(), ageBracket);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[school-balance] DB persistence failed (non-critical):', e);
  }
  return analysis;
}

// ── DB persistence ─────────────────────────────────────────────────────────
//
// Each Gemini suggestion becomes a row in `dishes` (deduped by title_zh).
// We don't backfill image / prep_steps inline — that's a separate batch job
// the founder can run later via gen-dish-images + gen-dish-steps-claude.
// So suggestions appear as "dish exists in DB but no image / steps yet";
// the UI shows them with a placeholder image and "做法生成中" badge.

const NUTRIENT_TO_HEALTH_TAG: Record<Nutrient, string> = {
  protein: 'high_protein',
  veggie:  'detox',
  carb:    'maintain',
  calcium: 'maintain',
  iron:    'maintain',
  omega3:  'boost_immunity',
};

async function persistSchoolSuggestions(
  analysis: BalanceAnalysis,
  lunchText: string,
  ageBracket: string,
): Promise<BalanceAnalysis> {
  const userId = getUserId();
  const enrichedSuggestions: BalanceRecipe[] = [];
  const dishIds: string[] = [];

  for (const s of analysis.suggestions) {
    // Dedup by exact title_zh first
    const { data: existing } = await supabase
      .from('dishes')
      .select('id')
      .eq('title_zh', s.name_zh)
      .maybeSingle();

    let dishId: string | undefined = (existing as any)?.id;

    if (!dishId) {
      // Insert minimal row. Image + prep_steps are NULL — backfill later.
      const healthTags = s.covers
        .map(c => NUTRIENT_TO_HEALTH_TAG[c])
        .filter(Boolean);
      const { data: inserted, error: insertErr } = await supabase
        .from('dishes')
        .insert({
          title_zh:           s.name_zh,
          title_en:           s.name_en,
          description_zh:     s.blurb,
          description_en:     '',
          meal_type:          'dinner',
          origin_cuisine:     'cantonese',     // HK default; refine later
          main_ingredient:    'other',
          course_type:        'main_protein',
          flavor_tags:        [],
          health_benefit_tags: healthTags,
          seasonal_tag:       'All-Season/Balanced',
          is_vegan:           false,
          execution_level:    1,
        })
        .select('id')
        .single();
      if (insertErr) {
        // eslint-disable-next-line no-console
        console.warn(`[school-balance] insert failed for ${s.name_zh}:`, insertErr.message);
      } else {
        dishId = (inserted as any)?.id;
      }
    }

    if (dishId) dishIds.push(dishId);
    enrichedSuggestions.push({ ...s, dish_id: dishId });
  }

  // Log the lunch entry (independent of suggestion success)
  if (userId) {
    await supabase.from('user_lunch_log').insert({
      user_id:           userId,
      lunch_date:        new Date().toISOString().slice(0, 10),
      lunch_text:        lunchText,
      age_bracket:       ageBracket,
      covered_nutrients: analysis.covered,
      missing_nutrients: analysis.missing,
      ai_reasoning_zh:   analysis.reasoning,
      suggested_dish_ids: dishIds,
    }).then(() => {}, () => {/* non-critical */});
  }

  return { ...analysis, suggestions: enrichedSuggestions };
}
