/**
 * Gemini multimodal — fridge / supermarket-shelf scan → dish suggestions.
 *
 * The user can shoot one of two scenes; we use the same Gemini call but feed
 * a different prompt depending on whether the photo is the inside of their
 * fridge (cook with what you have) or a supermarket aisle (decide what to
 * cook before buying). For both we return 3 中式 + 3 西式 picks so the
 * mainlander-in-HK use case ("I want options from both worlds") is covered.
 */

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

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
  detected_ingredients: string[];
  dishes: ScannedDish[];            // 6 total — 3 chinese + 3 western
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
  const prompt = `You are a home cooking expert who knows both Chinese family cooking and Western home cooking equally well. ${SCENE_INTRO[scene]}

${LOCALE_INSTRUCTION[locale]}

Step 1: Identify every food ingredient you can clearly see.

Step 2: Suggest exactly SIX dishes the user can make:
  • THREE Chinese dishes (各种菜系: 粤 / 川 / 江浙 / 北方 / etc — vary methods)
  • THREE Western dishes (e.g. pan-seared protein, salad, pasta, omelette, sandwich, soup)

Return ONLY valid JSON in this exact shape:
{
  "detected_ingredients": ["ingredient1", ...],
  "dishes": [
    {
      "cuisine": "chinese",
      "name_zh": "菜名",
      "name_en": "Dish Name",
      "ingredients_used": ["ing1", "ing2"],
      "cook_method": "清炒",
      "difficulty": "简单",
      "time_minutes": 15,
      "description": "≤25 characters in the requested Chinese variant"
    }
  ]
}

Rules:
- The "cuisine" field must be exactly "chinese" or "western".
- Order: 3 chinese dishes first, then 3 western dishes.
- Vary cooking methods within each bucket.
- difficulty must be exactly one of: 简单 / 中等 / 稍复杂.
- Prefer quick dishes (<30 min). Mark anything 45 min+ as 稍复杂.
- Do not output any text outside the JSON.`;

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  const json = await res.json() as any;
  if (!res.ok) throw new Error(json.error?.message ?? 'Gemini API error');

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
