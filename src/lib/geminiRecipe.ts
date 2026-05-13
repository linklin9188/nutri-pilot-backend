/**
 * geminiRecipe — AI-powered recipe generation & dish search
 *
 * Handles the "missing dish" scenario:
 *   1. User requests a dish not in our DB (e.g., 小龙虾)
 *   2. Gemini generates: recipe, steps, nutrition estimate, image search query
 *   3. We return the AI recipe + external order links + ingredient supplier links
 */

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CookingStep {
  step: number;
  title: string;       // Short label, e.g. "腌制"
  desc: string;        // Full instruction
  duration_min: number;
  tip?: string;        // Optional pro tip
}

export interface AIDish {
  name_zh: string;
  name_en: string;
  description: string;
  difficulty: '简单' | '中等' | '稍复杂';
  total_time_min: number;
  serves: number;
  calories_per_serving: number;
  flavor_profile: string[];        // e.g. ['spicy', 'savory']
  main_ingredients: string[];      // list of key ingredients
  seasoning: string[];
  steps: CookingStep[];
  nutrition_summary: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  };
  storage_tips: string;
  image_search_query: string;      // optimized Unsplash search query for the dish
  unsplash_fallback_id: string;    // specific photo ID if we know it
}

export interface DishSearchResult {
  found_in_db: boolean;
  db_dish?: {
    id: string;
    title_zh: string;
    image_url: string;
    flavor_tags: string[];
  };
  ai_dish?: AIDish;
  external_order_links: ExternalOrderLink[];
}

export interface ExternalOrderLink {
  platform: string;
  logo: string;
  url: string;
  region: 'hk' | 'mainland' | 'both';
}

// ── External delivery platforms ───────────────────────────────────────────────

export function getOrderLinks(dishName: string): ExternalOrderLink[] {
  const encoded = encodeURIComponent(dishName);
  return [
    {
      platform: 'Deliveroo',
      logo: '🛵',
      url: `https://deliveroo.com.hk/en/search?q=${encoded}`,
      region: 'hk',
    },
    {
      platform: 'Foodpanda',
      logo: '🐼',
      url: `https://www.foodpanda.com.hk/en/city/hong-kong?q=${encoded}`,
      region: 'hk',
    },
    {
      platform: '美团外卖',
      logo: '🦋',
      url: `https://i.meituan.com/awp/h5/search.html?keyword=${encoded}`,
      region: 'mainland',
    },
    {
      platform: '饿了么',
      logo: '⚡',
      url: `https://h5.ele.me/search/${encoded}`,
      region: 'mainland',
    },
  ];
}

// ── Generate cooking steps for any dish ──────────────────────────────────────

export async function generateCookingSteps(
  dishName: string,
  servings = 4,
  language: 'zh' | 'zh-Hant' | 'en' | 'tl' = 'zh',
): Promise<AIDish> {
  // Normalize: 繁體 → Chinese instruction; tagalog → English (until we add
  // Tagalog recipe templates).
  const wantChinese = language === 'zh' || language === 'zh-Hant';
  const langInstruction = wantChinese
    ? 'All text fields in Chinese (Simplified). name_en in English.'
    : 'All text fields in English. name_zh in Chinese (Simplified).';

  const prompt = `You are a professional Chinese home-cooking chef. Generate a complete recipe for "${dishName}" that serves ${servings} people.

${langInstruction}

Return ONLY valid JSON matching this exact shape:
{
  "name_zh": "菜名（中文）",
  "name_en": "Dish Name (English)",
  "description": "一句话介绍这道菜的特色和口感（中文，20字以内）",
  "difficulty": "简单",
  "total_time_min": 30,
  "serves": ${servings},
  "calories_per_serving": 280,
  "flavor_profile": ["savory", "spicy"],
  "main_ingredients": ["食材1", "食材2", "食材3"],
  "seasoning": ["调料1", "调料2"],
  "steps": [
    {
      "step": 1,
      "title": "准备食材",
      "desc": "详细步骤描述，至少30字，包含具体操作和关键技巧",
      "duration_min": 5,
      "tip": "小贴士（可选，增加成功率的关键提示）"
    }
  ],
  "nutrition_summary": {
    "protein_g": 28,
    "carbs_g": 12,
    "fat_g": 15,
    "fiber_g": 2
  },
  "storage_tips": "如何保存和加热的建议",
  "image_search_query": "optimized English search query for Unsplash (e.g. 'Chinese spicy crayfish dish')",
  "unsplash_fallback_id": ""
}

Rules:
- steps should have 4-7 steps, each with a clear and actionable description
- difficulty must be one of: 简单, 中等, 稍复杂
- flavor_profile values from: spicy, mild, savory, sweet, sour, umami, light, rich, smoky, fresh
- Total calories should be realistic for the dish
- image_search_query should be specific enough to find the right dish on Unsplash`;

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return JSON.parse(text) as AIDish;
}

// ── Generate a dish image via Unsplash (using AI-generated search query) ─────

export async function getDishImageUrl(
  searchQuery: string,
  fallbackId?: string,
): Promise<string> {
  // Use a curated high-quality food image from Unsplash
  // The query is used as a seed for consistent results
  const hash = searchQuery.split('').reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 0);
  const orientation = 'squarish';
  const query = encodeURIComponent(searchQuery + ' food dish plated');

  // Unsplash Source API (no auth required, picks a random from search)
  return `https://source.unsplash.com/400x400/?${query}&sig=${Math.abs(hash)}`;
}

// ── Find closest dish in our DB (fuzzy name match) ───────────────────────────

export async function findSimilarInDB(
  query: string,
  supabase: ReturnType<typeof import('../lib/supabase')['supabase']['from']> extends never
    ? any : any,
): Promise<{ id: string; title_zh: string; image_url: string; flavor_tags: string[] } | null> {
  // Simple: ask Gemini for keywords to search by, then do a DB query
  // For now, do a client-side ilike search using the raw dish name
  const { data } = await (supabase as any)
    .from('dishes')
    .select('id, title_zh, image_url, flavor_tags')
    .ilike('title_zh', `%${query}%`)
    .limit(3);

  if (data && data.length > 0) return data[0];

  // Try Pinyin/keyword fallback — search by main ingredient keyword
  const keyword = query.length >= 2 ? query.slice(0, 2) : query;
  const { data: d2 } = await (supabase as any)
    .from('dishes')
    .select('id, title_zh, image_url, flavor_tags')
    .ilike('title_zh', `%${keyword}%`)
    .limit(3);

  return d2?.[0] ?? null;
}

// ── Generate nutritional breakdown for display ────────────────────────────────

export async function analyzeNutrition(
  dishName: string,
  servings = 1,
): Promise<{ cal: number; pro: number; carbs: number; fat: number; fiber: number }> {
  // Quick lookup — for known dishes, return estimates without calling Gemini
  const QUICK_ESTIMATES: Record<string, { cal: number; pro: number; carbs: number; fat: number; fiber: number }> = {
    '小龙虾': { cal: 165, pro: 22, carbs: 4, fat: 7, fiber: 1 },
    '麻辣小龙虾': { cal: 220, pro: 22, carbs: 8, fat: 12, fiber: 1 },
    '清蒸鱼': { cal: 140, pro: 26, carbs: 2, fat: 4, fiber: 0 },
    '红烧肉': { cal: 430, pro: 18, carbs: 10, fat: 36, fiber: 0 },
  };

  for (const [key, val] of Object.entries(QUICK_ESTIMATES)) {
    if (dishName.includes(key)) return val;
  }

  // Fallback to a generic estimate
  return { cal: 280 * servings, pro: 20 * servings, carbs: 20 * servings, fat: 12 * servings, fiber: 2 * servings };
}
