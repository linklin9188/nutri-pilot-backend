/**
 * suppliers — HK & Mainland grocery supplier links
 *
 * Used to generate "where to buy" ingredient links for the shopping list
 * and dish detail pages.
 */

export interface Supplier {
  id:       string;
  name:     string;
  name_en:  string;
  emoji:    string;
  color:    string;          // brand color for UI badge
  region:   'hk' | 'mainland' | 'both';
  baseUrl:  string;
  searchUrl: (query: string) => string;
  category: 'supermarket' | 'fresh_market' | 'online' | 'specialty';
  note?:    string;          // e.g. "Free delivery HK$500+"
}

// ── Hong Kong Suppliers ───────────────────────────────────────────────────────

export const HK_SUPPLIERS: Supplier[] = [
  {
    id:       'tvmall',
    name:     'TVMall',
    name_en:  'TVMall',
    emoji:    '📺',
    color:    '#E31E24',
    region:   'hk',
    baseUrl:  'https://www.tvmall.com.hk',
    searchUrl: q => `https://www.tvmall.com.hk/search?q=${encodeURIComponent(q)}`,
    category: 'online',
    note:     '送货上门',
  },
  {
    id:       'citysuper',
    name:     'CitySuper',
    name_en:  'CitySuper',
    emoji:    '🏪',
    color:    '#000000',
    region:   'hk',
    baseUrl:  'https://www.citysuper.com.hk',
    searchUrl: q => `https://www.citysuper.com.hk/en/search?q=${encodeURIComponent(q)}`,
    category: 'supermarket',
    note:     '进口精品食材',
  },
  {
    id:       'parknshop',
    name:     '百佳',
    name_en:  'PARKnSHOP',
    emoji:    '🛒',
    color:    '#009B3A',
    region:   'hk',
    baseUrl:  'https://www.parknshop.com',
    searchUrl: q => `https://www.parknshop.com/en/search?text=${encodeURIComponent(q)}`,
    category: 'supermarket',
    note:     '全港连锁',
  },
  {
    id:       'wellcome',
    name:     '惠康',
    name_en:  'Wellcome',
    emoji:    '🏬',
    color:    '#E31E24',
    region:   'hk',
    baseUrl:  'https://www.wellcome.com.hk',
    searchUrl: q => `https://www.wellcome.com.hk/en/search?q=${encodeURIComponent(q)}`,
    category: 'supermarket',
    note:     '全港连锁',
  },
  {
    id:       'hktvmall',
    name:     'HKTVmall',
    name_en:  'HKTVmall',
    emoji:    '📦',
    color:    '#FF6600',
    region:   'hk',
    baseUrl:  'https://www.hktvmall.com',
    searchUrl: q => `https://www.hktvmall.com/hktv/en/main/search?q=${encodeURIComponent(q)}`,
    category: 'online',
    note:     '最快4小时送达',
  },
  {
    id:       'great',
    name:     'Great',
    name_en:  'Great',
    emoji:    '🌟',
    color:    '#003087',
    region:   'hk',
    baseUrl:  'https://www.jasonsfoodstores.com',
    searchUrl: q => `https://www.jasonsfoodstores.com/search?q=${encodeURIComponent(q)}`,
    category: 'specialty',
    note:     '进口西式食材',
  },
  {
    id:       'freshmart',
    name:     '新鲜街市',
    name_en:  'Wet Market',
    emoji:    '🥩',
    color:    '#FF4444',
    region:   'hk',
    baseUrl:  'https://market.gov.hk',
    searchUrl: _q => 'https://www.fehd.gov.hk/english/market/market.html',
    category: 'fresh_market',
    note:     '食材最新鲜',
  },
];

// ── Mainland China Suppliers ───────────────────────────────────────────────────

export const MAINLAND_SUPPLIERS: Supplier[] = [
  {
    id:       'hema',
    name:     '盒马鲜生',
    name_en:  'Hema Fresh',
    emoji:    '🦛',
    color:    '#FF3333',
    region:   'mainland',
    baseUrl:  'https://www.freshippo.com',
    searchUrl: q => `https://www.freshippo.com/search?keyword=${encodeURIComponent(q)}`,
    category: 'online',
    note:     '30分钟送达',
  },
  {
    id:       'jd_fresh',
    name:     '京东生鲜',
    name_en:  'JD Fresh',
    emoji:    '🐶',
    color:    '#CC0000',
    region:   'mainland',
    baseUrl:  'https://fresh.jd.com',
    searchUrl: q => `https://search.jd.com/Search?keyword=${encodeURIComponent(q)}&enc=utf-8&book=1`,
    category: 'online',
    note:     '当日达',
  },
  {
    id:       'meituan_maicai',
    name:     '美团买菜',
    name_en:  'Meituan Grocery',
    emoji:    '🦋',
    color:    '#FFD000',
    region:   'mainland',
    baseUrl:  'https://maicai.meituan.com',
    searchUrl: q => `https://maicai.meituan.com/search?keyword=${encodeURIComponent(q)}`,
    category: 'online',
    note:     '30分钟送达',
  },
  {
    id:       'dingdong',
    name:     '叮咚买菜',
    name_en:  'Dingdong',
    emoji:    '🔔',
    color:    '#00B359',
    region:   'mainland',
    baseUrl:  'https://www.100.me',
    searchUrl: q => `https://www.100.me/search?keyword=${encodeURIComponent(q)}`,
    category: 'online',
    note:     '29分钟送达',
  },
  {
    id:       'taobao_fresh',
    name:     '淘宝生鲜',
    name_en:  'Taobao Fresh',
    emoji:    '🛍️',
    color:    '#FF5500',
    region:   'mainland',
    baseUrl:  'https://chaoshi.tmall.com',
    searchUrl: q => `https://s.taobao.com/search?q=${encodeURIComponent(q)}+生鲜`,
    category: 'online',
    note:     '品类最全',
  },
];

// ── Ingredient categorization ────────────────────────────────────────────────

export type IngredientCategory =
  | 'protein'   // 肉类/海鲜
  | 'veggie'    // 蔬菜
  | 'staple'    // 主食
  | 'dairy'     // 乳制品
  | 'seasoning' // 调味料
  | 'other';

export interface ShoppingItem {
  name: string;
  category: IngredientCategory;
  quantity?: string;   // e.g. "500g"
  dishSources: string[]; // which dishes need this ingredient
}

// Categorize a list of raw ingredient strings
const PROTEIN_KEYWORDS = ['猪', '牛', '羊', '鸡', '鸭', '鱼', '虾', '蟹', '贝', '蛤', '龙虾', '肉', '排'];
const VEGGIE_KEYWORDS  = ['菜', '葱', '蒜', '姜', '椒', '茄', '瓜', '豆', '菇', '木耳', '豆腐', '腐', '笋'];
const STAPLE_KEYWORDS  = ['米', '面', '粉', '饭', '馒', '包', '糯'];
const DAIRY_KEYWORDS   = ['奶', '黄油', '芝士', '奶酪'];
const SEASONING_WORDS  = ['盐', '糖', '酱', '油', '醋', '料酒', '胡椒', '花椒', '八角', '香叶', '生抽', '老抽', '蚝油'];

export function categorizeIngredient(name: string): IngredientCategory {
  if (PROTEIN_KEYWORDS.some(k => name.includes(k)))   return 'protein';
  if (VEGGIE_KEYWORDS.some(k => name.includes(k)))    return 'veggie';
  if (STAPLE_KEYWORDS.some(k => name.includes(k)))    return 'staple';
  if (DAIRY_KEYWORDS.some(k => name.includes(k)))     return 'dairy';
  if (SEASONING_WORDS.some(k => name.includes(k)))    return 'seasoning';
  return 'other';
}

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  protein:   '🥩 肉类 · 海鲜',
  veggie:    '🥦 蔬菜',
  staple:    '🌾 主食',
  dairy:     '🥛 乳制品',
  seasoning: '🧂 调味料',
  other:     '📦 其他',
};

// ── Generate a shareable shopping list text ──────────────────────────────────

export function generateShoppingText(items: ShoppingItem[], weekStart: string): string {
  const grouped: Partial<Record<IngredientCategory, ShoppingItem[]>> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category]!.push(item);
  }

  const lines = [`📋 Nutri-Pilot 本周购物清单（${weekStart}）\n`];
  for (const [cat, catItems] of Object.entries(grouped) as [IngredientCategory, ShoppingItem[]][]) {
    lines.push(`\n${CATEGORY_LABELS[cat]}`);
    for (const item of catItems) {
      lines.push(`  □ ${item.name}${item.quantity ? ` (${item.quantity})` : ''}`);
    }
  }
  lines.push('\n— 由 Nutri-Pilot AI 生成');
  return lines.join('\n');
}

// ── Helper: Get region-appropriate suppliers ──────────────────────────────────

export function getSuppliers(region: 'hk' | 'mainland' = 'hk'): Supplier[] {
  return region === 'hk' ? HK_SUPPLIERS : MAINLAND_SUPPLIERS;
}

/**
 * Get top suppliers for a given ingredient
 * Returns 3-4 best options based on ingredient type
 */
export function getSuppliersForIngredient(
  ingredient: string,
  region: 'hk' | 'mainland' = 'hk',
): Supplier[] {
  const all = getSuppliers(region);
  const cat = categorizeIngredient(ingredient);

  // Fresh produce and proteins → prioritize fresh markets + online same-day
  if (cat === 'protein' || cat === 'veggie') {
    return all.filter(s => ['fresh_market', 'online'].includes(s.category)).slice(0, 4);
  }
  // Staples/seasonings → any supermarket
  return all.slice(0, 3);
}
