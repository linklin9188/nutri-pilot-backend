/**
 * ingredientCuts.ts — Refine generic ingredient labels (鸡肉 / 猪肉 / 牛肉)
 * into the specific cut a dish actually needs (鸡翅 / 猪小排 / 牛腩 / 鲈鱼…).
 *
 * Why this exists: the dishes table stores a coarse main_ingredient like
 * 'chicken' but ‘chicken' on a shopping list isn't actionable — at a wet
 * market the 档主 will ask "which cut?" and the user wants to know whether
 * to buy 鸡翅 or 鸡腿 or 鸡胸. We infer that here from the dish title.
 *
 * The output also reserves a `brand` slot so a future supplier-integration
 * pass can fill in e.g. "City'super USDA Choice 牛肋眼" without changing
 * the call sites in dishIngredients / VerifyIngredients.
 */

export interface IngredientCut {
  /** Specific cut name shown to the user (e.g. 鸡翅 / 猪小排 / 三文鱼) */
  nameZh: string;
  /** Cantonese / HK wet-market name when different (chicken wing = 鸡翼) */
  nameYue?: string;
  /** Plain English label for City'super-style premium stores */
  nameEn: string;
  /** Future supplier branding hook ("HKTVmall Premium · USDA Choice 牛肋眼") */
  brand?: string;
}

// Match the dish title against an ordered list of (regex → cut) rules. The
// FIRST match wins, so put more-specific patterns at the top. A trailing
// '_default' entry catches anything we didn't recognize for that protein.
type CutRule = { match: RegExp; cut: IngredientCut };

const PORK_RULES: CutRule[] = [
  { match: /排骨|肋排|蒸排骨|糖醋排骨|椒盐排骨/, cut: { nameZh: '猪小排',     nameYue: '排骨',     nameEn: 'Pork ribs' } },
  { match: /五花|红烧肉|扣肉|东坡|梅菜|回锅/,     cut: { nameZh: '五花腩',     nameYue: '五花腩',   nameEn: 'Pork belly' } },
  { match: /里脊|肉丝|肉片|肉柳|溜肉/,           cut: { nameZh: '猪里脊',     nameYue: '猪柳',     nameEn: 'Pork tenderloin' } },
  { match: /肉末|肉糜|肉酱|麻婆|蒸蛋|狮子头/,    cut: { nameZh: '猪肉末',     nameYue: '免治猪肉', nameEn: 'Ground pork' } },
  { match: /猪蹄|猪手|猪脚/,                     cut: { nameZh: '猪蹄',       nameYue: '猪手',     nameEn: 'Pork trotter' } },
  { match: /肘子|猪肘/,                          cut: { nameZh: '猪肘',       nameEn: 'Pork hock' } },
  { match: /猪肝/,                               cut: { nameZh: '猪肝',       nameEn: 'Pork liver' } },
  { match: /叉烧|烧肉/,                          cut: { nameZh: '梅头肉',     nameYue: '梅头叉烧', nameEn: 'Pork collar' } },
];
const PORK_DEFAULT: IngredientCut = { nameZh: '瘦肉', nameYue: '瘦肉', nameEn: 'Lean pork' };

const CHICKEN_RULES: CutRule[] = [
  { match: /鸡翅|可乐鸡|香煎鸡翅|奥尔良|烤翅/,   cut: { nameZh: '鸡翅',       nameYue: '鸡翼',     nameEn: 'Chicken wings' } },
  { match: /鸡腿|腿排|烤腿|蒜香鸡腿/,            cut: { nameZh: '鸡腿肉',     nameYue: '鸡髀',     nameEn: 'Chicken thigh' } },
  { match: /鸡胸|鸡里脊|鸡柳|宫保|椒麻鸡|鸡丁/, cut: { nameZh: '鸡胸肉',     nameYue: '鸡柳',     nameEn: 'Chicken breast' } },
  { match: /白切鸡|葱油鸡|手撕鸡|脆皮鸡|盐焗鸡/, cut: { nameZh: '整鸡',       nameYue: '光鸡 1 只', nameEn: 'Whole chicken' } },
  { match: /鸡爪|凤爪|泡椒凤爪/,                 cut: { nameZh: '鸡爪',       nameYue: '凤爪',     nameEn: 'Chicken feet' } },
  { match: /鸡汤|煲鸡|炖鸡/,                     cut: { nameZh: '土鸡',       nameYue: '走地鸡',   nameEn: 'Free-range chicken' } },
];
const CHICKEN_DEFAULT: IngredientCut = { nameZh: '鸡腿肉', nameYue: '鸡髀', nameEn: 'Chicken thigh' };

const BEEF_RULES: CutRule[] = [
  { match: /牛腩|柱侯|清汤牛腩|牛筋腩/,          cut: { nameZh: '牛腩',       nameYue: '牛腩',     nameEn: 'Beef brisket' } },
  { match: /牛排|战斧|肋眼|西冷|菲力/,           cut: { nameZh: '西冷牛排',   nameYue: '牛扒',     nameEn: 'Beef steak' } },
  { match: /牛柳|牛肉丝|爆炒牛肉|铁板牛|滑蛋牛/, cut: { nameZh: '牛柳',       nameYue: '牛柳',     nameEn: 'Beef tenderloin' } },
  { match: /牛筋/,                               cut: { nameZh: '牛筋',       nameEn: 'Beef tendon' } },
  { match: /牛舌/,                               cut: { nameZh: '牛舌',       nameEn: 'Beef tongue' } },
  { match: /肉饼|牛肉饼|汉堡|肉末|肉糜/,         cut: { nameZh: '牛肉末',     nameYue: '免治牛肉', nameEn: 'Ground beef' } },
  { match: /牛肉粒|黑椒牛/,                      cut: { nameZh: '牛肉粒',     nameEn: 'Beef cubes' } },
];
const BEEF_DEFAULT: IngredientCut = { nameZh: '牛肉（瘦）', nameYue: '瘦牛肉', nameEn: 'Beef (lean)' };

const LAMB_RULES: CutRule[] = [
  { match: /羊排/,         cut: { nameZh: '羊排', nameYue: '羊排', nameEn: 'Lamb chops' } },
  { match: /羊腿/,         cut: { nameZh: '羊腿', nameYue: '羊腿', nameEn: 'Lamb leg' } },
  { match: /涮羊肉|羊肉片/, cut: { nameZh: '羊肉片', nameYue: '羊肉片', nameEn: 'Sliced lamb' } },
];
const LAMB_DEFAULT: IngredientCut = { nameZh: '羊肉', nameEn: 'Lamb' };

const DUCK_RULES: CutRule[] = [
  { match: /烧鸭|烤鸭|北京烤|樟茶鸭/, cut: { nameZh: '烧鸭', nameYue: '烧鸭', nameEn: 'Roast duck' } },
  { match: /鸭腿/,                    cut: { nameZh: '鸭腿', nameYue: '鸭髀', nameEn: 'Duck leg' } },
  { match: /鸭翅/,                    cut: { nameZh: '鸭翅', nameEn: 'Duck wing' } },
  { match: /盐水鸭|卤水鸭/,           cut: { nameZh: '整鸭', nameYue: '光鸭', nameEn: 'Whole duck' } },
];
const DUCK_DEFAULT: IngredientCut = { nameZh: '鸭肉', nameEn: 'Duck' };

const FISH_RULES: CutRule[] = [
  { match: /三文鱼|salmon/i,       cut: { nameZh: '三文鱼柳', nameEn: 'Salmon fillet' } },
  { match: /鲈鱼/,                 cut: { nameZh: '鲈鱼',     nameYue: '海鲈',     nameEn: 'Sea bass' } },
  { match: /带鱼|牙带/,            cut: { nameZh: '带鱼',     nameYue: '牙带',     nameEn: 'Hairtail' } },
  { match: /黄花|大黄/,            cut: { nameZh: '黄花鱼',   nameEn: 'Yellow croaker' } },
  { match: /鳕鱼|银鳕/,            cut: { nameZh: '鳕鱼柳',   nameEn: 'Cod fillet' } },
  { match: /龙利|鲽鱼/,            cut: { nameZh: '龙利柳',   nameEn: 'Sole fillet' } },
  { match: /鲩鱼|草鱼|青鱼/,       cut: { nameZh: '鲩鱼',     nameYue: '鲩鱼',     nameEn: 'Grass carp' } },
  { match: /鲫鱼/,                 cut: { nameZh: '鲫鱼',     nameEn: 'Crucian carp' } },
];
const FISH_DEFAULT: IngredientCut = { nameZh: '鲜鱼', nameYue: '鲜鱼', nameEn: 'Fish' };

const SHRIMP_RULES: CutRule[] = [
  { match: /基围/, cut: { nameZh: '基围虾',     nameYue: '基围虾',   nameEn: 'Sandy prawn' } },
  { match: /大虾|明虾|阿根廷/, cut: { nameZh: '大虾', nameYue: '海虾', nameEn: 'King prawn' } },
  { match: /虾仁|虾球/, cut: { nameZh: '虾仁', nameEn: 'Shelled shrimp' } },
];
const SHRIMP_DEFAULT: IngredientCut = { nameZh: '鲜虾', nameYue: '海虾', nameEn: 'Shrimp' };

const PROTEIN_RULE_TABLE: Record<string, { rules: CutRule[]; default: IngredientCut }> = {
  pork:     { rules: PORK_RULES,    default: PORK_DEFAULT },
  chicken:  { rules: CHICKEN_RULES, default: CHICKEN_DEFAULT },
  poultry:  { rules: CHICKEN_RULES, default: CHICKEN_DEFAULT },
  beef:     { rules: BEEF_RULES,    default: BEEF_DEFAULT },
  lamb:     { rules: LAMB_RULES,    default: LAMB_DEFAULT },
  mutton:   { rules: LAMB_RULES,    default: LAMB_DEFAULT },
  duck:     { rules: DUCK_RULES,    default: DUCK_DEFAULT },
  fish:     { rules: FISH_RULES,    default: FISH_DEFAULT },
  salmon:   { rules: FISH_RULES,    default: { nameZh: '三文鱼柳', nameEn: 'Salmon fillet' } },
  hairtail: { rules: FISH_RULES,    default: { nameZh: '带鱼', nameEn: 'Hairtail' } },
  seabass:  { rules: FISH_RULES,    default: { nameZh: '鲈鱼', nameEn: 'Sea bass' } },
  shrimp:   { rules: SHRIMP_RULES,  default: SHRIMP_DEFAULT },
  // No-rules fallbacks — left here so the call site can ask for any ingKey
  // and still get a useful answer.
  egg:      { rules: [], default: { nameZh: '鸡蛋',  nameEn: 'Eggs' } },
  tofu:     { rules: [], default: { nameZh: '豆腐',  nameYue: '豆腐', nameEn: 'Tofu' } },
  veggie:   { rules: [], default: { nameZh: '时令蔬菜', nameYue: '时菜', nameEn: 'Seasonal veg' } },
  vegetable:{ rules: [], default: { nameZh: '时令蔬菜', nameYue: '时菜', nameEn: 'Seasonal veg' } },
  seafood:  { rules: FISH_RULES,    default: { nameZh: '海鲜', nameEn: 'Seafood' } },
  crab:     { rules: [], default: { nameZh: '蟹',    nameYue: '蟹',   nameEn: 'Crab' } },
  scallop:  { rules: [], default: { nameZh: '带子',  nameYue: '带子', nameEn: 'Scallop' } },
  squid:    { rules: [], default: { nameZh: '鱿鱼',  nameYue: '鱿鱼', nameEn: 'Squid' } },
  oyster:   { rules: [], default: { nameZh: '生蚝',  nameEn: 'Oyster' } },
  cod:      { rules: [], default: { nameZh: '鳕鱼柳', nameEn: 'Cod fillet' } },
};

/**
 * Pick the most specific cut a dish needs.
 * @param ingKey      coarse main_ingredient from the dishes table ('pork' etc.)
 * @param dishTitleZh dish.title_zh — we scan this for keywords
 */
export function refineCut(ingKey: string, dishTitleZh: string): IngredientCut | null {
  const key = (ingKey ?? '').toLowerCase();
  const table = PROTEIN_RULE_TABLE[key];
  if (!table) return null;
  for (const r of table.rules) {
    if (r.match.test(dishTitleZh)) return r.cut;
  }
  return table.default;
}
