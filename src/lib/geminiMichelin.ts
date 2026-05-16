/**
 * geminiMichelin.ts — Pro feature: take the algorithm-picked weekly menu
 * and rewrite each dish into a Michelin-inspired 家常版 elevated counterpart.
 *
 * Use case: 雇主 toggles the 「米其林」chip in WeeklyMenu. We don't change
 * which days have what (so shopping list / cook flow keep working); we just
 * upgrade the dish presentation — same protein category, but a more refined
 * preparation, plating note, and a 30-second blurb explaining the technique.
 *
 * The function is per-day so the UI can stream upgrades and not block the
 * whole week on a single long Gemini call.
 */

import { callGemini } from './geminiProxy';

export interface MichelinDish {
  // The original dish id, so we can map back to the row in weekly_menu.
  source_id: string;
  // Elevated name + a 1-line technique note + a 1-line plating cue.
  name_zh:     string;
  name_en:     string;
  technique:   string;       // e.g. '低温慢煮 + 焦香表皮'
  plating:     string;       // e.g. '青瓷盘上摆放，淋少许罗勒油'
  prep_minutes: number;      // expected total time
  difficulty:  '简单' | '中等' | '稍复杂';
  /** Tasting notes / why this works — shown in a tooltip / expanded card. */
  blurb:       string;
}

export interface MichelinDayInput {
  date:    string;
  dayLabel: string;
  // Coarse hints to keep the upgrade aligned with the household.
  cuisineHint?:    string;      // 'cantonese' / 'jiangnan' / ...
  avoidIngredients?: string[];
  avoidTags?:        string[];
  dishes: { id: string; title_zh: string; title_en?: string; main_ingredient?: string; course_type?: string }[];
}

export interface MichelinDayOutput {
  date: string;
  dishes: MichelinDish[];
}

const PROMPT = (input: MichelinDayInput) => `You are a Michelin-trained chef whose specialty is elevating Chinese family cooking. Given a list of dishes a family will eat on ${input.dayLabel} (${input.date}), rewrite each one into a Michelin-inspired home-cookable version.

Rules:
- Keep the SAME main protein / vegetable category — don't swap fish for chicken.
- Add ONE technique upgrade (e.g. 低温慢煮 / 油封 / 烟熏 / 米其林酱汁 / 焦香处理) realistic for a home kitchen with normal equipment.
- Add ONE plating cue (色彩 / 摆盘形 / 配菜 / 摆盘器皿). One sentence each.
- Output a Chinese name + an English name + a short tasting blurb (≤ 30 chars Chinese).
- difficulty must be exactly one of: 简单 / 中等 / 稍复杂.
- prep_minutes is total time including the elevated technique (be realistic — most should be 30–60 min).
- Avoid these ingredients: ${(input.avoidIngredients ?? []).join('、') || '(none)'}
- Avoid these flavor / health tags: ${(input.avoidTags ?? []).join(', ') || '(none)'}

Return ONLY valid JSON in this exact shape:
{
  "dishes": [
    {
      "source_id": "<the original dish.id>",
      "name_zh": "...",
      "name_en": "...",
      "technique": "...",
      "plating": "...",
      "prep_minutes": 45,
      "difficulty": "中等",
      "blurb": "..."
    }
  ]
}

Source dishes (preserve source_id):
${JSON.stringify(input.dishes, null, 0)}`;

export async function elevateDayToMichelin(input: MichelinDayInput): Promise<MichelinDayOutput> {
  const json = await callGemini({
    endpoint: 'michelin',
    contents: [{ role: 'user', parts: [{ text: PROMPT(input) }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim());
    return { date: input.date, dishes: (parsed.dishes ?? []) as MichelinDish[] };
  } catch {
    throw new Error('Failed to parse Gemini response');
  }
}
