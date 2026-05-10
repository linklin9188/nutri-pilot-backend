/**
 * suppliers — Tiered grocery supplier system
 *
 * Three tiers based on membership level:
 *   anonymous  → major chain supermarkets (publicly accessible)
 *   user       → curated specialty & premium fresh suppliers
 *   premium    → luxury / Michelin-level direct suppliers
 */

// ── Tier definition ────────────────────────────────────────────────────────────

export type UserTier = 'anonymous' | 'user' | 'premium';

export interface Supplier {
  id:        string;
  name:      string;
  name_en:   string;
  emoji:     string;
  color:     string;        // brand color for UI badge
  bgColor?:  string;        // optional card background
  region:    'hk' | 'mainland' | 'both';
  baseUrl:   string;
  searchUrl: (query: string) => string;
  category:  'supermarket' | 'fresh_market' | 'online' | 'specialty' | 'luxury';
  tier:      UserTier;      // minimum tier required
  note?:     string;        // e.g. "Free delivery HK$500+"
  badge?:    string;        // label shown on card, e.g. "米其林御用"
}

// ── Hong Kong Suppliers ───────────────────────────────────────────────────────

export const HK_SUPPLIERS: Supplier[] = [

  // ── Tier: anonymous (all users) ──────────────────────────────────────────

  {
    id:        'hktvmall',
    name:      'HKTVmall',
    name_en:   'HKTVmall',
    emoji:     '📦',
    color:     '#FF6600',
    region:    'hk',
    baseUrl:   'https://www.hktvmall.com',
    searchUrl: q => `https://www.hktvmall.com/hktv/en/main/search?q=${encodeURIComponent(q)}`,
    category:  'online',
    tier:      'anonymous',
    note:      '最快 4 小时送达',
  },
  {
    id:        'parknshop',
    name:      '百佳',
    name_en:   'PARKnSHOP',
    emoji:     '🛒',
    color:     '#009B3A',
    region:    'hk',
    baseUrl:   'https://www.parknshop.com',
    searchUrl: q => `https://www.parknshop.com/en/search?text=${encodeURIComponent(q)}`,
    category:  'supermarket',
    tier:      'anonymous',
    note:      '全港 300+ 门店',
  },
  {
    id:        'wellcome',
    name:      '惠康',
    name_en:   'Wellcome',
    emoji:     '🏬',
    color:     '#E31E24',
    region:    'hk',
    baseUrl:   'https://www.wellcome.com.hk',
    searchUrl: q => `https://www.wellcome.com.hk/en/search?q=${encodeURIComponent(q)}`,
    category:  'supermarket',
    tier:      'anonymous',
    note:      '全港连锁，便利之选',
  },
  {
    id:        'freshmart',
    name:      '街市',
    name_en:   'Wet Market',
    emoji:     '🥩',
    color:     '#FF4444',
    region:    'hk',
    baseUrl:   'https://www.fehd.gov.hk',
    searchUrl: _q => 'https://www.fehd.gov.hk/english/market/market.html',
    category:  'fresh_market',
    tier:      'anonymous',
    note:      '食材最新鲜，价格实惠',
  },

  // ── Tier: user (logged-in) ────────────────────────────────────────────────

  {
    id:        'citysuper',
    name:      'City\'super',
    name_en:   'city\'super',
    emoji:     '🏪',
    color:     '#1a1a1a',
    bgColor:   '#f8f4ef',
    region:    'hk',
    baseUrl:   'https://www.citysuper.com.hk',
    searchUrl: q => `https://www.citysuper.com.hk/en/search?q=${encodeURIComponent(q)}`,
    category:  'specialty',
    tier:      'user',
    note:      '精选进口食材',
    badge:     '精选推荐',
  },
  {
    id:        'great',
    name:      'Great Food Hall',
    name_en:   'Great Food Hall',
    emoji:     '🌟',
    color:     '#003087',
    region:    'hk',
    baseUrl:   'https://www.jasonsfoodstores.com',
    searchUrl: q => `https://www.jasonsfoodstores.com/search?q=${encodeURIComponent(q)}`,
    category:  'specialty',
    tier:      'user',
    note:      '太古城·进口西式',
    badge:     '精选推荐',
  },
  {
    id:        'greencommon',
    name:      'Green Common',
    name_en:   'Green Common',
    emoji:     '🌿',
    color:     '#2d7a3a',
    region:    'hk',
    baseUrl:   'https://greencommon.com',
    searchUrl: q => `https://greencommon.com/search?q=${encodeURIComponent(q)}`,
    category:  'specialty',
    tier:      'user',
    note:      '植物基 · 有机食材',
    badge:     '健康之选',
  },
  {
    id:        'olivers',
    name:      "Oliver's",
    name_en:   "Oliver's The Delicatessen",
    emoji:     '🧀',
    color:     '#8B5E3C',
    region:    'hk',
    baseUrl:   'https://www.olivers.com.hk',
    searchUrl: q => `https://www.olivers.com.hk/search?q=${encodeURIComponent(q)}`,
    category:  'specialty',
    tier:      'user',
    note:      '欧式熟食 · 精选奶酪',
    badge:     '精选推荐',
  },

  // ── Tier: premium (members only) ──────────────────────────────────────────

  {
    id:        'japancentre_hk',
    name:      'Japan Centre HK',
    name_en:   'Japan Centre',
    emoji:     '🇯🇵',
    color:     '#BC002D',
    bgColor:   '#fff5f5',
    region:    'hk',
    baseUrl:   'https://www.japancentre.com',
    searchUrl: q => `https://www.japancentre.com/en/search?q=${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      '直送日本食材',
    badge:     '米其林御用',
  },
  {
    id:        'rare_fine',
    name:      'Rare & Fine',
    name_en:   'Rare & Fine Seafood',
    emoji:     '🦞',
    color:     '#1B3A6B',
    bgColor:   '#f0f4ff',
    region:    'hk',
    baseUrl:   'https://www.rarefine.hk',
    searchUrl: q => `https://www.rarefine.hk/search?q=${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      '顶级活海鲜直供',
    badge:     '米其林御用',
  },
  {
    id:        'wagyu_butcher',
    name:      'The Wagyu Butcher',
    name_en:   'The Wagyu Butcher',
    emoji:     '🥩',
    color:     '#3D1F00',
    bgColor:   '#fdf6ee',
    region:    'hk',
    baseUrl:   'https://thewagyubutcher.com',
    searchUrl: q => `https://thewagyubutcher.com/search?type=product&q=${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      'A5 和牛 · 直送香港',
    badge:     '顶级食材',
  },
  {
    id:        'provenance',
    name:      'Provenance',
    name_en:   'Provenance',
    emoji:     '🌾',
    color:     '#5C7A2E',
    bgColor:   '#f5f8f0',
    region:    'hk',
    baseUrl:   'https://www.provenance.hk',
    searchUrl: q => `https://www.provenance.hk/search?q=${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      '有机农场直采',
    badge:     '可溯源农场',
  },
  {
    id:        'gourmet_larder',
    name:      'Gourmet Larder',
    name_en:   'Gourmet Larder',
    emoji:     '🫙',
    color:     '#7B2D8B',
    bgColor:   '#faf0fc',
    region:    'hk',
    baseUrl:   'https://www.gourmetlarder.com',
    searchUrl: q => `https://www.gourmetlarder.com/search?q=${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      '欧洲顶级食材进口',
    badge:     '轻奢之选',
  },
];

// ── Mainland China Suppliers ───────────────────────────────────────────────────

export const MAINLAND_SUPPLIERS: Supplier[] = [

  // ── Tier: anonymous ──────────────────────────────────────────────────────

  {
    id:        'hema',
    name:      '盒马鲜生',
    name_en:   'Hema Fresh',
    emoji:     '🦛',
    color:     '#FF3333',
    region:    'mainland',
    baseUrl:   'https://www.freshippo.com',
    searchUrl: q => `https://www.freshippo.com/search?keyword=${encodeURIComponent(q)}`,
    category:  'online',
    tier:      'anonymous',
    note:      '30 分钟送达',
  },
  {
    id:        'meituan_maicai',
    name:      '美团买菜',
    name_en:   'Meituan Grocery',
    emoji:     '🦋',
    color:     '#FFD000',
    region:    'mainland',
    baseUrl:   'https://maicai.meituan.com',
    searchUrl: q => `https://maicai.meituan.com/search?keyword=${encodeURIComponent(q)}`,
    category:  'online',
    tier:      'anonymous',
    note:      '30 分钟送达',
  },
  {
    id:        'dingdong',
    name:      '叮咚买菜',
    name_en:   'Dingdong',
    emoji:     '🔔',
    color:     '#00B359',
    region:    'mainland',
    baseUrl:   'https://www.100.me',
    searchUrl: q => `https://www.100.me/search?keyword=${encodeURIComponent(q)}`,
    category:  'online',
    tier:      'anonymous',
    note:      '29 分钟送达',
  },

  // ── Tier: user ────────────────────────────────────────────────────────────

  {
    id:        'jd_fresh',
    name:      '京东生鲜',
    name_en:   'JD Fresh',
    emoji:     '🐶',
    color:     '#CC0000',
    region:    'mainland',
    baseUrl:   'https://fresh.jd.com',
    searchUrl: q => `https://search.jd.com/Search?keyword=${encodeURIComponent(q)}&enc=utf-8&book=1`,
    category:  'online',
    tier:      'user',
    note:      '品质保障 · 当日达',
    badge:     '精选推荐',
  },
  {
    id:        'taobao_fresh',
    name:      '天猫超市',
    name_en:   'Tmall Supermarket',
    emoji:     '🐱',
    color:     '#FF5500',
    region:    'mainland',
    baseUrl:   'https://chaoshi.tmall.com',
    searchUrl: q => `https://s.taobao.com/search?q=${encodeURIComponent(q)}+生鲜`,
    category:  'online',
    tier:      'user',
    note:      '品类最全',
    badge:     '精选推荐',
  },
  {
    id:        'ole',
    name:      'Ole精品超市',
    name_en:   'Ole Supermarket',
    emoji:     '🍷',
    color:     '#8B0000',
    region:    'mainland',
    baseUrl:   'https://www.ole.com.cn',
    searchUrl: q => `https://www.ole.com.cn/search?keyword=${encodeURIComponent(q)}`,
    category:  'specialty',
    tier:      'user',
    note:      '进口精品食材',
    badge:     '精选推荐',
  },

  // ── Tier: premium ─────────────────────────────────────────────────────────

  {
    id:        'jd_wagyu',
    name:      '京东顶级和牛',
    name_en:   'JD Premium Wagyu',
    emoji:     '🥩',
    color:     '#3D1F00',
    bgColor:   '#fdf6ee',
    region:    'mainland',
    baseUrl:   'https://fresh.jd.com',
    searchUrl: q => `https://search.jd.com/Search?keyword=A5+和牛+${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      'A5 和牛直采',
    badge:     '顶级食材',
  },
  {
    id:        'misszhu_organic',
    name:      '朱小姐有机',
    name_en:   'Miss Zhu Organic',
    emoji:     '🌱',
    color:     '#2d7a3a',
    bgColor:   '#f0faf0',
    region:    'mainland',
    baseUrl:   'https://www.misszhu.com',
    searchUrl: q => `https://www.misszhu.com/search?q=${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      '认证有机 · 农场溯源',
    badge:     '米其林御用',
  },
  {
    id:        'benlai_farm',
    name:      '本来生活',
    name_en:   'Benlai Life',
    emoji:     '🌿',
    color:     '#FF6B35',
    bgColor:   '#fff8f5',
    region:    'mainland',
    baseUrl:   'https://www.benlai.com',
    searchUrl: q => `https://www.benlai.com/search?keyword=${encodeURIComponent(q)}`,
    category:  'luxury',
    tier:      'premium',
    note:      '溯源直采 · 无中间商',
    badge:     '可溯源农场',
  },
];

// ── Tier utilities ────────────────────────────────────────────────────────────

export const TIER_CONFIG: Record<UserTier, {
  label:       string;
  labelEn:     string;
  color:       string;
  description: string;
  icon:        string;
}> = {
  anonymous: {
    label:       '访客',
    labelEn:     'Guest',
    color:       '#888',
    description: '大型连锁超市',
    icon:        '🛒',
  },
  user: {
    label:       '会员',
    labelEn:     'Member',
    color:       '#FF5A1F',
    description: '精选优质供货商',
    icon:        '⭐',
  },
  premium: {
    label:       '高级会员',
    labelEn:     'Premium',
    color:       '#C9A227',
    description: '米其林御用 · 轻奢直供',
    icon:        '👑',
  },
};

/**
 * Get current user tier from localStorage
 */
export function getUserTier(): UserTier {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const isPremium  = localStorage.getItem('isPremium')  === 'true';
  if (!isLoggedIn) return 'anonymous';
  if (isPremium)   return 'premium';
  return 'user';
}

/**
 * Get suppliers visible to a given tier (cumulative — higher tiers see all lower tiers too)
 */
export function getSuppliersByTier(
  tier: UserTier,
  region: 'hk' | 'mainland' = 'hk',
): Supplier[] {
  const all = region === 'hk' ? HK_SUPPLIERS : MAINLAND_SUPPLIERS;
  const order: UserTier[] = ['anonymous', 'user', 'premium'];
  const maxIdx = order.indexOf(tier);
  return all.filter(s => order.indexOf(s.tier) <= maxIdx);
}

/**
 * Get all suppliers for a tier (for showing locked preview)
 */
export function getAllSuppliers(region: 'hk' | 'mainland' = 'hk'): Supplier[] {
  return region === 'hk' ? HK_SUPPLIERS : MAINLAND_SUPPLIERS;
}

// ── Ingredient categorization ────────────────────────────────────────────────

export type IngredientCategory =
  | 'protein'   // 肉类/海鲜
  | 'veggie'    // 蔬菜
  | 'staple'    // 主食
  | 'dairy'     // 乳制品
  | 'seasoning' // 调味料
  | 'other';

export interface ShoppingItem {
  name:        string;
  category:    IngredientCategory;
  quantity?:   string;    // e.g. "500g"
  dishSources: string[];  // which dishes need this ingredient
}

const PROTEIN_KEYWORDS  = ['猪', '牛', '羊', '鸡', '鸭', '鱼', '虾', '蟹', '贝', '蛤', '龙虾', '肉', '排'];
const VEGGIE_KEYWORDS   = ['菜', '葱', '蒜', '姜', '椒', '茄', '瓜', '豆', '菇', '木耳', '豆腐', '腐', '笋'];
const STAPLE_KEYWORDS   = ['米', '面', '粉', '饭', '馒', '包', '糯'];
const DAIRY_KEYWORDS    = ['奶', '黄油', '芝士', '奶酪'];
const SEASONING_WORDS   = ['盐', '糖', '酱', '油', '醋', '料酒', '胡椒', '花椒', '八角', '香叶', '生抽', '老抽', '蚝油'];

export function categorizeIngredient(name: string): IngredientCategory {
  if (PROTEIN_KEYWORDS.some(k => name.includes(k)))  return 'protein';
  if (VEGGIE_KEYWORDS.some(k => name.includes(k)))   return 'veggie';
  if (STAPLE_KEYWORDS.some(k => name.includes(k)))   return 'staple';
  if (DAIRY_KEYWORDS.some(k => name.includes(k)))    return 'dairy';
  if (SEASONING_WORDS.some(k => name.includes(k)))   return 'seasoning';
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

// ── Shareable shopping list text ─────────────────────────────────────────────

export function generateShoppingText(items: ShoppingItem[], weekStart: string): string {
  const grouped: Partial<Record<IngredientCategory, ShoppingItem[]>> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category]!.push(item);
  }
  const lines = [`📋 爱吃 AI Eats 本周购物清单（${weekStart}）\n`];
  for (const [cat, catItems] of Object.entries(grouped) as [IngredientCategory, ShoppingItem[]][]) {
    lines.push(`\n${CATEGORY_LABELS[cat]}`);
    for (const item of catItems) {
      lines.push(`  □ ${item.name}${item.quantity ? ` (${item.quantity})` : ''}`);
    }
  }
  lines.push('\n— 由 爱吃 AI Eats 生成');
  return lines.join('\n');
}

/**
 * Get best suppliers for a specific ingredient given user tier
 */
export function getSuppliersForIngredient(
  ingredient: string,
  region: 'hk' | 'mainland' = 'hk',
  tier: UserTier = 'anonymous',
): Supplier[] {
  const visible = getSuppliersByTier(tier, region);
  const cat     = categorizeIngredient(ingredient);
  if (cat === 'protein' || cat === 'veggie') {
    return visible.filter(s => ['fresh_market', 'online', 'luxury'].includes(s.category)).slice(0, 4);
  }
  return visible.slice(0, 3);
}
