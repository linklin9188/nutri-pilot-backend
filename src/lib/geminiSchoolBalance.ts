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

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

export type Nutrient = 'protein' | 'veggie' | 'carb' | 'calcium' | 'iron' | 'omega3';

export interface BalanceRecipe {
  name_zh:  string;
  name_en:  string;
  emoji:    string;
  covers:   Nutrient[];
  time_min: number;
  blurb:    string;
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
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const prompt = PROMPT_TEMPLATE(lunchText.trim() || '(空)', ageBracket);

  const res = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  const json = await res.json() as any;
  if (!res.ok) throw new Error(json.error?.message ?? 'Gemini API error');

  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim());
    // Defensive normalisation so a malformed AI reply doesn't crash the UI.
    return {
      covered:     (parsed.covered ?? []) as Nutrient[],
      missing:     (parsed.missing ?? []) as Nutrient[],
      reasoning:   parsed.reasoning ?? '',
      suggestions: (parsed.suggestions ?? []) as BalanceRecipe[],
    };
  } catch {
    throw new Error('Failed to parse Gemini response');
  }
}
