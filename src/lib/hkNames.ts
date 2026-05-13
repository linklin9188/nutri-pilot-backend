/**
 * hkNames.ts — Hong Kong-style aliases for ingredients
 *
 * Mainlanders arriving in Hong Kong often hit the same trap: the same vegetable
 * has a different name on the street market sign and the wet-market 档主 won't
 * understand the Mandarin name. This table maps the 普通话 name we store
 * everywhere → the Cantonese name they should ask for / look for at the market,
 * plus an English fallback so it also works at City'super or HKTVmall.
 *
 * Source: cross-reference of 食物環境衞生署 wet-market signage + Wellcome/百佳
 * online product pages + crowd-sourced corrections.
 */

export interface HKAlias {
  yue?: string;   // 港式 / 粤语 name shown on wet-market signs
  en?:  string;   // English label found on premium supermarket shelves
  note?: string;  // one-line guidance (e.g. 'ask for "瘦肉" not "里脊"')
}

/** Indexed by the 普通话 nameZh stored in dishIngredients aggregation. */
export const HK_NAMES: Record<string, HKAlias> = {
  // ── 肉禽蛋 ──────────────────────────────────────────────────────────────
  '猪肉':       { yue: '猪肉 / 瘦肉 / 五花腩', en: 'Pork',           note: '街市直接讲「瘦肉」(sau yuk) 或「五花腩」' },
  '鸡肉':       { yue: '鸡 / 鸡腿肉 / 鸡胸肉', en: 'Chicken',         note: '港超常见「鸡髀」=鸡腿、「鸡柳」=鸡里脊' },
  '牛肉':       { yue: '牛肉 / 牛柳 / 牛腩',   en: 'Beef',           note: '「牛柳」=菲力、「牛腩」=胸腹' },
  '羊肉':       { yue: '羊肉 / 羊架',           en: 'Lamb',           note: '港鲜羊肉少，多在 City\'super / 街市羊档' },
  '鸭肉':       { yue: '鸭 / 烧鸭',             en: 'Duck',           note: '烧腊档常见「烧鸭」「卤水鸭」' },
  '鸡蛋':       { yue: '鸡蛋',                  en: 'Eggs',           note: '港多用「只」/「打」(=12 只)' },

  // ── 海鲜 ───────────────────────────────────────────────────────────────
  '虾':         { yue: '虾 / 海虾 / 沙虾',      en: 'Shrimp / Prawn', note: '街市鱼档有活虾，超市多冰鲜' },
  '鱼':         { yue: '鱼 / 鲈鱼 / 黄花鱼',    en: 'Fish' },
  '蟹':         { yue: '蟹 / 大闸蟹 / 花蟹',    en: 'Crab',           note: '秋冬大闸蟹季节性供应' },
  '三文鱼':     { yue: '三文鱼',                en: 'Salmon',         note: '港多挪威 / 苏格兰进口' },
  '带鱼':       { yue: '带鱼 / 牙带',           en: 'Hairtail',       note: '街市常叫「牙带」(nga daai)' },
  '鱿鱼':       { yue: '鱿鱼 / 墨鱼',           en: 'Squid' },
  '生蚝':       { yue: '生蚝',                  en: 'Oyster',         note: '法国 / 爱尔兰进口，City\'super 常见' },
  '扇贝':       { yue: '扇贝 / 带子',           en: 'Scallop',        note: '港叫「带子」(daai ji)' },

  // ── 蔬菜 ───────────────────────────────────────────────────────────────
  '白萝卜':     { yue: '白罗白',                en: 'Daikon / White radish', note: '港写「白罗白」（不是「萝卜」）' },
  '小白菜':     { yue: '上海白菜 / 上海青',     en: 'Shanghai bok choy',     note: '港不叫「小白菜」，直接说「上海青」' },
  '大白菜':     { yue: '绍菜 / 黄牙白',         en: 'Napa cabbage',          note: '港叫「绍菜」(siu choi) 或「黄牙白」' },
  '青菜':       { yue: '菜心 / 芥蓝 / 唐生菜',  en: 'Choi sum / Kailan',     note: '港最常见绿叶是「菜心」(choi sum)' },
  '生菜':       { yue: '生菜 / 唐生菜',         en: 'Lettuce' },
  '油菜':       { yue: '油麦菜 / 小棠菜',       en: 'Yu choi sum' },
  '空心菜':     { yue: '通菜 / 蕹菜',           en: 'Water spinach',         note: '港多叫「通菜」(tung choi)' },
  '茄子':       { yue: '矮瓜',                  en: 'Eggplant',              note: '港叫「矮瓜」(ai gwa)' },
  '土豆':       { yue: '薯仔',                  en: 'Potato',                note: '港只讲「薯仔」(syu jai)' },
  '红薯':       { yue: '番薯',                  en: 'Sweet potato' },
  '玉米':       { yue: '粟米',                  en: 'Corn',                  note: '港叫「粟米」(suk mai)' },
  '西红柿':     { yue: '番茄',                  en: 'Tomato',                note: '港叫「番茄」(faan ke)' },
  '黄瓜':       { yue: '青瓜',                  en: 'Cucumber',              note: '港叫「青瓜」(ceng gwa)' },
  '冬瓜':       { yue: '冬瓜',                  en: 'Winter melon',          note: '夏秋祛湿汤料' },
  '苦瓜':       { yue: '凉瓜 / 苦瓜',           en: 'Bitter melon',          note: '港常叫「凉瓜」(loeng gwa)' },
  '辣椒':       { yue: '辣椒 / 指天椒',         en: 'Chili',                 note: '小辣椒叫「指天椒」' },
  '青椒':       { yue: '青椒 / 灯笼椒',         en: 'Bell pepper' },
  '香菜':       { yue: '芫茜',                  en: 'Coriander / Cilantro',  note: '港叫「芫茜」(jyun sai)' },
  '葱':         { yue: '葱 / 青葱',             en: 'Scallion' },
  '蒜':         { yue: '蒜头 / 蒜茸',           en: 'Garlic',                note: '剁碎的叫「蒜茸」' },
  '姜':         { yue: '姜',                    en: 'Ginger' },
  '蘑菇':       { yue: '蘑菇 / 白菌',           en: 'Mushroom' },
  '香菇':       { yue: '冬菇',                  en: 'Shiitake',              note: '港叫「冬菇」(dung gu)，干的常用煲汤' },
  '木耳':       { yue: '木耳 / 云耳',           en: 'Wood ear' },
  '韭菜':       { yue: '韭菜',                  en: 'Chives' },

  // ── 豆制品 ─────────────────────────────────────────────────────────────
  '豆腐':       { yue: '豆腐 / 板豆腐 / 嫩豆腐 / 绢豆腐', en: 'Tofu',
                  note: '老豆腐=港「硬豆腐」/「板豆腐」；嫩豆腐=「软豆腐」/「绢豆腐」' },
  '腐竹':       { yue: '腐竹',                  en: 'Yuba / Tofu skin' },
  '豆芽':       { yue: '芽菜 / 大豆芽',         en: 'Bean sprout',           note: '港叫「芽菜」(nga choi)' },

  // ── 主食 ───────────────────────────────────────────────────────────────
  '大米':       { yue: '白米 / 香米',           en: 'Rice',                  note: '港超有泰国香米 / 日本米 / 东北米' },
  '面条':       { yue: '面 / 生面 / 银针粉',    en: 'Noodles',               note: '港式「生面」是碱水面，煮前要烫' },
  '米粉':       { yue: '米粉 / 河粉',           en: 'Rice noodles' },
  '面粉':       { yue: '面粉',                  en: 'Flour' },

  // ── 调味 ───────────────────────────────────────────────────────────────
  '生抽':       { yue: '生抽',                  en: 'Light soy sauce',       note: '港李锦记 / 淘大都有' },
  '老抽':       { yue: '老抽',                  en: 'Dark soy sauce' },
  '蚝油':       { yue: '蚝油',                  en: 'Oyster sauce',          note: '李锦记是港本地品牌' },
  '料酒':       { yue: '绍兴酒 / 米酒',         en: 'Shaoxing wine',         note: '港超叫「绍兴花雕」' },
  '醋':         { yue: '醋 / 浙醋 / 大红浙醋',  en: 'Vinegar' },
  '高汤':       { yue: '上汤 / 鸡汤',           en: 'Stock / Broth',         note: '可买浓缩鸡汤 (Knorr/Maggi) 调' },
  '葱姜蒜':     { yue: '葱姜蒜',                en: 'Scallion · Ginger · Garlic' },
};

/** Look up the alias for a Mandarin ingredient name; returns null if unmapped. */
export function getHKAlias(nameZh: string): HKAlias | null {
  return HK_NAMES[nameZh] ?? null;
}
