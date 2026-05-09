/**
 * Gemini multimodal — fridge scan → dish suggestions
 */

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

export interface FridgeDish {
  name_zh: string;
  name_en: string;
  ingredients_used: string[];  // which ingredients from the fridge are used
  cook_method: string;         // 清炒 / 炖 / 凉拌 / etc.
  difficulty: '简单' | '中等' | '稍复杂';
  time_minutes: number;
  description: string;
}

export interface FridgeScanResult {
  detected_ingredients: string[];
  dishes: FridgeDish[];
}

export async function analyzeFridgePhoto(base64Image: string, mimeType: string): Promise<FridgeScanResult> {
  const prompt = `You are a Chinese home cooking expert. The user just photographed their fridge or kitchen ingredients.

Step 1: Identify all visible food ingredients (vegetables, proteins, condiments, etc.).
Step 2: Suggest exactly 3 dishes that can be made with these ingredients — prioritizing Chinese home cooking, simple enough for a weeknight, using ingredients already visible.

Return ONLY valid JSON in this exact shape:
{
  "detected_ingredients": ["ingredient1", "ingredient2", ...],
  "dishes": [
    {
      "name_zh": "菜名",
      "name_en": "Dish Name",
      "ingredients_used": ["ing1", "ing2"],
      "cook_method": "清炒",
      "difficulty": "简单",
      "time_minutes": 15,
      "description": "一句话描述，突出这道菜的特色和口感"
    }
  ]
}

Rules:
- All 3 dishes must use only ingredients visible in the photo (plus basic pantry staples: oil, salt, soy sauce, garlic, ginger)
- Prefer quick dishes (under 30 minutes)
- Vary the cooking methods across the 3 suggestions
- difficulty must be exactly one of: 简单, 中等, 稍复杂
- description in Chinese, under 20 characters`;

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
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```/g, '').trim()) as FridgeScanResult;
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
