/**
 * Gemini multimodal — fridge / supermarket-shelf scan.
 *
 * OPTIMIZED (2026-05-17): Gemini ONLY identifies ingredients. The dish
 * suggestion step has moved to src/lib/scanMatch.ts which queries the
 * dishes DB. Benefits:
 *   - Output payload ↓ ~70% (just a list of strings, not 6 JSON dish cards)
 *     → ~50% less Gemini token cost per scan
 *   - Suggestions are REAL DB rows with prep_steps / image / nutrition →
 *     user can tap "+ 今日菜单" / "看做法" / sync to 采购清单
 *   - Respects profile (hometown / goal / spice / avoid / xiaomei) that
 *     the old AI-invents-name approach completely ignored
 */

import { callGemini } from './geminiProxy';

export type ScanScene = 'fridge' | 'market';
export type ScanLocale = 'zh' | 'zh-Hant';   // Mandarin Simplified vs HK Traditional

export interface ScannedDish {
  cuisine: 'chinese' | 'western';   // which bucket this dish belongs to
  name_zh: string;
  name_en: string;
  ingredients_used: string[];
  cook_method: string;              // 清炒 / 炖 / pan-seared / oven-baked / etc.
  difficulty: '简单' | '中等' | '稍复杂';
  time_minutes: number;
  description: string;              // ≤25 chars
}

export interface ScanResult {
  /** Normalized Chinese ingredient names (e.g. ['番茄','鸡蛋','西兰花',
   *  '猪肉','三文鱼']). Feed to scanMatch.normalizeIngredients() then
   *  suggestDishesFromScan() to get real DB dish recommendations. */
  detected_ingredients: string[];
}

/** Legacy alias kept so existing Home.tsx code stays happy until it migrates. */
export type FridgeDish = ScannedDish;
export type FridgeScanResult = ScanResult;

const SCENE_INTRO: Record<ScanScene, string> = {
  fridge: `The user just photographed the INSIDE OF THEIR FRIDGE / a counter with ingredients.
Only suggest dishes that use ingredients VISIBLE in the photo (plus basic pantry staples:
oil, salt, soy sauce, garlic, ginger, butter, flour, eggs if visible).`,
  market: `The user is standing in a SUPERMARKET AISLE and pointed the camera at a shelf.
They have not bought anything yet — your job is to suggest dishes they could shop FOR
based on what's clearly on the shelf. Pick dishes that pair well with 2–3 of the items
visible; they will buy the rest separately.`,
};

const LOCALE_INSTRUCTION: Record<ScanLocale, string> = {
  zh:        'Reply in Simplified Chinese (中国大陆) for all Chinese text.',
  'zh-Hant': 'Reply in Traditional Chinese (繁體中文, Hong Kong / Taiwan usage). Use 港式 ingredient names where natural (薯仔, 矮瓜, 番茄, 通菜, 芫茜, 冬菇, 凉瓜, 上海青).',
};

/**
 * Run a fridge / shelf scan.
 * @param scene  what the photo shows
 * @param locale which Chinese variant to return — defaults to zh (Simplified)
 */
export async function analyzeFridgePhoto(
  base64Image: string,
  mimeType:    string,
  scene:       ScanScene = 'fridge',
  locale:      ScanLocale = 'zh',
): Promise<ScanResult> {
  const prompt = `You are a food identifier. ${SCENE_INTRO[scene]}

${LOCALE_INSTRUCTION[locale]}

Your ONLY job: identify every food ingredient clearly visible in the
photo. Use common cooking names (番茄 not 西红柿 cv 字), one canonical
name per item. Skip packaging / brand text / non-food objects.

If the same ingredient appears multiple times (e.g. 3 个番茄), list it
ONCE. Skip ambiguous items you're not 80% sure about — false positives
waste downstream dish-matching effort.

Return ONLY valid JSON in this exact shape:
{ "detected_ingredients": ["番茄", "鸡蛋", "西兰花", "猪肉", ...] }

Rules:
- detected_ingredients should have 3–15 items typically. If you see
  <3 ingredients return what you can; don't pad with guesses.
- Each item is a SHORT noun (1-4 chars Chinese, or 1-3 words English).
- Do not output any text outside the JSON. No markdown fence.`;

  const json = await callGemini({
    endpoint: 'vision',
    contents: [{
      role:  'user',
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Image } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json' },
  });

  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim()) as ScanResult;
  } catch {
    throw new Error('Failed to parse Gemini response');
  }
}

/** Convert a File to base64 string */
export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:image/jpeg;base64,XXXX..."
      const [header, data] = result.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
      resolve({ base64: data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
