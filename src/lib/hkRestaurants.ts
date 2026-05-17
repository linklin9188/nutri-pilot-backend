/**
 * hkRestaurants — curated 50-restaurant Hong Kong dining seed.
 *
 * Used by the weekend "外食营养报告" — matches WeeklySummary nutritional
 * gaps to real HK restaurants. Tilted toward 米其林 (3星/2星/1星) +
 * 必比登推介 (Bib Gourmand) + 香港老字号 — names every HK family already
 * recognizes so 推荐 → 预订 transition is friction-free.
 *
 * 后续盈利路径：
 *   Phase 1 (now): stub 预订 button → opens OpenRice / 餐厅官网 / 复制电话
 *   Phase 2: 餐厅合作 booking (commission per seat / 会员优先排位)
 *   Phase 3: Pro 会员独家优惠
 *
 * Add new restaurants here; downstream weeklyDiarySummary picks them up
 * automatically as long as good_for is tagged correctly.
 */

export type HkArea =
  | '中環'    | '上環'    | '西環'    | '銅鑼灣'  | '尖沙咀'
  | '佐敦'    | '灣仔'    | '北角'    | '太古'    | '旺角'
  | '油麻地'  | '九龍城'  | '荃灣'    | '沙田'    | '將軍澳'
  | '西貢'    | '深水埗'  | '紅磡'    | '赤柱'    | '天后'
  | '中半山'  | '銅鑼灣半山';

export type DiningTag =
  | 'fish' | 'shellfish' | 'meat' | 'poultry' | 'egg'
  | 'dairy' | 'soy' | 'veggie' | 'fruit' | 'grain'
  | 'light' | 'banquet';

/** Michelin or 必比登 distinction — shown as a small pill on the card. */
export type MichelinTier = '3★' | '2★' | '1★' | 'Bib' | null;

export interface HkRestaurant {
  id:          string;
  name:        string;
  cuisine:     string;
  good_for:    DiningTag[];
  area:        HkArea;
  price_tier:  '$' | '$$' | '$$$' | '$$$$';
  michelin?:   MichelinTier;
  signature:   string;
  blurb:       string;
  link?:       string;
  phone?:      string;
  /** Override hero image URL — if absent, resolveRestaurantImage() picks
   *  a cuisine-category default. Use a full https URL (Unsplash, 餐厅官网
   *  CDN, or self-hosted). Card renders this at the top of the card. */
  image_url?:  string;
  hidden?:     boolean;
}

// ── Hero image resolution ─────────────────────────────────────────────
//
// We don't have a per-restaurant photo for every entry. Strategy:
//   1. If r.image_url is set → use it.
//   2. Else match r.cuisine against keyword fragments → fall back to a
//      curated Unsplash photo for that cuisine category.
// Unsplash URLs use stable photo IDs (same pattern as Login.tsx's hero
// rotation) so the photos won't 404 in the future.

const CUISINE_HERO_MAP: { keywords: string[]; photoId: string; tint: string }[] = [
  { keywords: ['飲茶', '点心'],          photoId: 'photo-1582450871972-2a4b9f6a8a82', tint: 'dim sum' },
  { keywords: ['燒鵝', '燒臘', '叉燒'],   photoId: 'photo-1568736333610-eae6e0ab9206', tint: 'roast goose' },
  { keywords: ['现代粤', '大班樓', 'Mott', '卅二'], photoId: 'photo-1583394838336-acd977736f90', tint: 'modern Cantonese' },
  { keywords: ['粤菜', '广府', '港式'],   photoId: 'photo-1563245372-f21724e3856d', tint: 'traditional Cantonese' },
  { keywords: ['法餐', 'French'],         photoId: 'photo-1414235077428-338989a2e8c0', tint: 'fine French' },
  { keywords: ['意大利', 'Italian'],       photoId: 'photo-1551183053-bf91a1d81141', tint: 'pasta' },
  { keywords: ['壽司', '寿司', 'Sushi'],   photoId: 'photo-1579871494447-9811cf80d66c', tint: 'sushi' },
  { keywords: ['燒鳥', 'Yakitori'],        photoId: 'photo-1556909114-f6e7ad7d3136', tint: 'yakitori' },
  { keywords: ['拉麵', '一蘭'],            photoId: 'photo-1569718212165-3a8278d5f624', tint: 'ramen' },
  { keywords: ['懷石', '柏屋'],            photoId: 'photo-1611143669185-af224c5e3252', tint: 'kaiseki' },
  { keywords: ['日料', '日式', '日本'],     photoId: 'photo-1611143669185-af224c5e3252', tint: 'Japanese' },
  { keywords: ['火鍋', '海底撈'],          photoId: 'photo-1518983546435-91f8b87fe561', tint: 'hot pot' },
  { keywords: ['川菜', '川式'],            photoId: 'photo-1552566090-a99b21d50fb1', tint: 'Sichuan' },
  { keywords: ['美式扒', '牛排', 'steak'], photoId: 'photo-1558030006-450675393462', tint: 'steakhouse' },
  { keywords: ['燒肉', '日式燒'],           photoId: 'photo-1529193591184-b1d58069ecdd', tint: 'yakiniku' },
  { keywords: ['江浙', '小籠'],            photoId: 'photo-1496116218417-1a781b1c416c', tint: 'xiaolongbao' },
  { keywords: ['西北', '雜糧', '莜麵'],     photoId: 'photo-1551183053-bf91a1d81141', tint: 'northern noodles' },
  { keywords: ['雲吞麵', '雲吞'],          photoId: 'photo-1612929633738-8fe44f7ec841', tint: 'wonton' },
  { keywords: ['煲仔'],                   photoId: 'photo-1604908554049-01408eb8d6fd', tint: 'claypot rice' },
  { keywords: ['清湯腩', '牛腩'],          photoId: 'photo-1547928576-b822bc410bdf', tint: 'beef brisket' },
  { keywords: ['茶餐廳'],                  photoId: 'photo-1606852680812-aae90f47ea38', tint: 'HK cafe' },
  { keywords: ['素食', '沙拉', '素菜'],     photoId: 'photo-1546069901-ba9599a7e63c', tint: 'salad' },
  { keywords: ['海鮮', '蝦蟹'],            photoId: 'photo-1559339352-11d035aa65de', tint: 'seafood' },
  { keywords: ['印度', 'Punjab'],          photoId: 'photo-1585937421612-70a008356fbe', tint: 'curry' },
  { keywords: ['西班牙'],                  photoId: 'photo-1534080564583-6be75777b70a', tint: 'Spanish' },
  { keywords: ['甜品', '燉奶', '牛奶'],     photoId: 'photo-1488477181946-6428a0291777', tint: 'milk dessert' },
  { keywords: ['分子', 'Innovation'],     photoId: 'photo-1604908176997-125f25cc6f3d', tint: 'molecular' },
];

const DEFAULT_HERO = 'photo-1414235077428-338989a2e8c0'; // generic fine dining

export function resolveRestaurantImage(r: HkRestaurant): string {
  if (r.image_url) return r.image_url;
  const cuisine = r.cuisine ?? '';
  for (const { keywords, photoId } of CUISINE_HERO_MAP) {
    if (keywords.some(k => cuisine.includes(k))) {
      return `https://images.unsplash.com/${photoId}?w=600&q=80&auto=format&fit=crop`;
    }
  }
  return `https://images.unsplash.com/${DEFAULT_HERO}?w=600&q=80&auto=format&fit=crop`;
}

// ── 50-restaurant seed ─────────────────────────────────────────────────
//
// Organized: 3★ → 2★ → 1★ → 必比登 → 国际 fine-dining → 高排名老字号 →
// 街市 / 茶餐厅。当 user 周末打开 Home 时，主要按营养缺口排序，但 UI 会
// 显示 Michelin tier pill — 用户能一眼挑「今天我想去米其林」还是「今天
// 简单吃个粥」。

export const HK_RESTAURANTS: HkRestaurant[] = [
  // ───────────────── ★★★ 米其林三星 (4) ─────────────────
  {
    id: 'lung_king_heen',
    name: '龍景軒',
    cuisine: '粤菜 · 米其林三星',
    michelin: '3★',
    good_for: ['banquet', 'fish', 'shellfish', 'poultry'],
    area: '中環',
    price_tier: '$$$$',
    signature: '龍景軒燒鴨・鮑魚燴飯',
    blurb: '全球首間摘三星的中菜館（四季酒店）。一年最多兩次，值得。',
    link: 'https://www.fourseasons.com/hongkong/dining/restaurants/lung_king_heen/',
    phone: '+852 3196 8880',
  },
  {
    id: 'caprice',
    name: 'Caprice',
    cuisine: '法餐 · 米其林三星',
    michelin: '3★',
    good_for: ['banquet', 'fish', 'meat', 'dairy'],
    area: '中環',
    price_tier: '$$$$',
    signature: '布雷斯雞・芝士車',
    blurb: '四季酒店法餐殿堂。芝士車是全港最強，週末慶生首選。',
    link: 'https://www.fourseasons.com/hongkong/dining/restaurants/caprice/',
    phone: '+852 3196 8888',
  },
  {
    id: 'tang_court',
    name: '唐閣 T\'ang Court',
    cuisine: '粤菜 · 米其林三星',
    michelin: '3★',
    good_for: ['banquet', 'poultry', 'fish', 'shellfish'],
    area: '尖沙咀',
    price_tier: '$$$$',
    signature: '當紅炸子雞・蜜汁叉燒',
    blurb: '朗廷酒店镇店之宝，三十年三星老字号。家宴或商务都顶。',
    link: 'https://www.langhamhotels.com/en/the-langham/hong-kong/dine/tang-court/',
    phone: '+852 2375 1133',
  },
  {
    id: 'otto_e_mezzo',
    name: '8½ Otto e Mezzo Bombana',
    cuisine: '意大利 · 米其林三星',
    michelin: '3★',
    good_for: ['banquet', 'meat', 'dairy'],
    area: '中環',
    price_tier: '$$$$',
    signature: '白松露意麵・乳豬慢烤',
    blurb: '亞洲唯一意大利菜三星。秋冬白松露季節必去。',
    link: 'https://www.ottoemezzobombana.com/hong-kong/',
    phone: '+852 2537 8859',
  },

  // ───────────────── ★★ 米其林二星 (8) ──────────────────
  {
    id: 'amber',
    name: 'Amber',
    cuisine: '现代法餐 · 米其林二星',
    michelin: '2★',
    good_for: ['banquet', 'fish', 'meat', 'light'],
    area: '中環',
    price_tier: '$$$$',
    signature: '北海道海膽布甸・季節 tasting menu',
    blurb: '亞洲 50 最佳常客。沒乳製品、無麩質都能完美處理。',
    link: 'https://www.amberhongkong.com/',
    phone: '+852 2132 0066',
  },
  {
    id: 'fook_lam_moon',
    name: '福臨門',
    cuisine: '粤菜 · 米其林二星',
    michelin: '2★',
    good_for: ['banquet', 'fish', 'shellfish', 'poultry'],
    area: '灣仔',
    price_tier: '$$$$',
    signature: '雞油花雕蒸魚翅・脆皮糯米雞',
    blurb: '香港粤菜頂級殿堂。家族壽宴、外國朋友來港，都帶這。',
    link: 'https://www.fooklammoon-grp.com/',
    phone: '+852 2866 0663',
  },
  {
    id: 'imperial_treasure',
    name: '御寶軒',
    cuisine: '粤菜 · 米其林二星',
    michelin: '2★',
    good_for: ['banquet', 'poultry', 'fish'],
    area: '中環',
    price_tier: '$$$',
    signature: '冰燒三層肉・脆皮燒鵝',
    blurb: '新加坡來港的精品粤菜，三層肉是招牌中招牌。',
    link: 'https://www.imperialtreasure.com/hk/',
    phone: '+852 2613 9800',
  },
  {
    id: 'sushi_saito',
    name: 'Sushi Saito',
    cuisine: '日料 · 米其林二星',
    michelin: '2★',
    good_for: ['fish', 'shellfish', 'light'],
    area: '中環',
    price_tier: '$$$$',
    signature: 'Omakase 套餐・吞拿魚大腹',
    blurb: '東京三星 Saito 香港分店，魚油 omega-3 想補到極致來這。',
    link: 'https://www.mandarinoriental.com/hong-kong/the-landmark/fine-dining/restaurants/japanese-cuisine/sushi-saito',
    phone: '+852 2522 2300',
  },
  {
    id: 'pierre',
    name: 'Pierre',
    cuisine: '现代法餐 · 米其林二星',
    michelin: '2★',
    good_for: ['banquet', 'fish', 'meat'],
    area: '中環',
    price_tier: '$$$$',
    signature: 'Pierre Gagnaire 簽名 menu',
    blurb: '文華東方 25 樓望維港。Gagnaire 風格的香港呈現。',
    link: 'https://www.mandarinoriental.com/hong-kong/victoria-harbour/fine-dining/restaurants/french-cuisine/pierre',
    phone: '+852 2825 4001',
  },
  {
    id: 'robuchon',
    name: 'L\'Atelier de Joël Robuchon',
    cuisine: '法餐 · 米其林二星',
    michelin: '2★',
    good_for: ['banquet', 'fish', 'meat', 'dairy'],
    area: '中環',
    price_tier: '$$$$',
    signature: 'Robuchon 土豆泥・鵝肝',
    blurb: 'Robuchon 系全球招牌。土豆泥被稱「全球最強」。',
    link: 'https://www.robuchon.hk/',
    phone: '+852 2166 9000',
  },
  {
    id: 'ami',
    name: 'Ami',
    cuisine: '法餐 · 米其林二星',
    michelin: '2★',
    good_for: ['banquet', 'fish', 'meat', 'light'],
    area: '中環',
    price_tier: '$$$$',
    signature: 'Tasting menu 季節食材',
    blurb: '低調精致的法餐館，分量適中、不會吃到撑。',
    link: 'https://www.ami.com.hk/',
    phone: '+852 2799 6900',
  },
  {
    id: 'bo_innovation',
    name: 'Bo Innovation',
    cuisine: '分子料理 · 米其林二星',
    michelin: '2★',
    good_for: ['banquet'],
    area: '灣仔',
    price_tier: '$$$$',
    signature: 'X-treme Chinese Cuisine 套餐',
    blurb: 'Alvin Leung 厨魔。分子料理 + 港味基因，獨此一家。',
    link: 'https://www.boinnovation.com/',
    phone: '+852 2850 8371',
  },

  // ───────────────── ★ 米其林一星 (15) ────────────────────
  {
    id: 'tim_ho_wan',
    name: '添好運',
    cuisine: '粤式飲茶 · 米其林一星',
    michelin: '1★',
    good_for: ['poultry', 'soy', 'light', 'banquet'],
    area: '中環',
    price_tier: '$',
    signature: '酥皮焗叉燒包・腸粉',
    blurb: '全球最平價米其林。週末飲茶、缺禽肉缺豆製品來這。',
    link: 'https://www.timhowan.com/',
    phone: '+852 2332 2896',
  },
  {
    id: 'lei_garden',
    name: '利苑酒家',
    cuisine: '粤菜 · 米其林一星',
    michelin: '1★',
    good_for: ['banquet', 'poultry', 'shellfish', 'fish'],
    area: '中環',
    price_tier: '$$$',
    signature: '燒鵝・燕窩雪燕燉鮮奶',
    blurb: '想吃一頓正經粤菜、招待長輩、慶生，先想這裡。',
    link: 'https://www.leigarden.hk/',
    phone: '+852 2392 5184',
  },
  {
    id: 'the_chairman',
    name: '大班樓 The Chairman',
    cuisine: '现代粤菜 · 米其林一星',
    michelin: '1★',
    good_for: ['banquet', 'fish', 'shellfish', 'poultry'],
    area: '中環',
    price_tier: '$$$$',
    signature: '花雕雞油蒸花蟹・陳皮排骨',
    blurb: '亞洲 50 最佳第一名（2021）。全用本地小農食材的粤菜。',
    link: 'https://www.thechairmangroup.com/',
    phone: '+852 2555 2202',
  },
  {
    id: 'mott_32',
    name: 'Mott 32 卅二公館',
    cuisine: '现代粤菜 · 米其林一星',
    michelin: '1★',
    good_for: ['banquet', 'poultry', 'meat'],
    area: '中環',
    price_tier: '$$$',
    signature: '蘋果木烤北京鴨・脆皮叉燒',
    blurb: '现代中餐 + 古典氛圍。蘋果木烤鴨提前一天預訂。',
    link: 'https://www.mott32.com/hk',
    phone: '+852 2885 8688',
  },
  {
    id: 'yardbird',
    name: 'Yardbird',
    cuisine: '日式燒鳥 · 米其林一星',
    michelin: '1★',
    good_for: ['poultry', 'egg'],
    area: '上環',
    price_tier: '$$$',
    signature: '雞翅・雞肝醬',
    blurb: '雞的 50 種吃法。本週禽肉空缺、想新鮮體驗來這。',
    link: 'https://www.yardbirdrestaurant.com/',
    phone: '+852 2547 9273',
  },
  {
    id: 'ronin',
    name: 'Ronin',
    cuisine: '现代日料 · 米其林一星',
    michelin: '1★',
    good_for: ['fish', 'shellfish', 'light'],
    area: '中環',
    price_tier: '$$$',
    signature: '海膽烏冬・季節刺身',
    blurb: 'Yardbird 姐妹店。Omakase 走 izakaya 風，輕鬆精致。',
    link: 'https://www.roninhk.com/',
    phone: '+852 9213 0451',
  },
  {
    id: 'belon',
    name: 'Belon',
    cuisine: '法式酒馆 · 米其林一星',
    michelin: '1★',
    good_for: ['fish', 'shellfish', 'meat'],
    area: '中環',
    price_tier: '$$$',
    signature: 'Brittany 生蠔・鴨胸',
    blurb: '法式 bistro 但有星。生蠔季節必試。',
    link: 'https://belonsoho.com/',
    phone: '+852 2152 2872',
  },
  {
    id: 'ho_lee_fook',
    name: 'Ho Lee Fook',
    cuisine: '现代粤菜 · 米其林一星',
    michelin: '1★',
    good_for: ['meat', 'poultry'],
    area: '中環',
    price_tier: '$$$',
    signature: '澳洲和牛叉燒・煙花鴨',
    blurb: '中西混搭的港味。煙花鴨是 instagram 名場面。',
    link: 'https://holeefook.com.hk/',
    phone: '+852 2810 0860',
  },
  {
    id: 'octavium',
    name: 'Octavium',
    cuisine: '意大利 · 米其林一星',
    michelin: '1★',
    good_for: ['banquet', 'fish', 'meat', 'dairy'],
    area: '中環',
    price_tier: '$$$$',
    signature: '手工意麵・季節 tasting',
    blurb: '只有 28 個位的小酒館。意大利菜想精致来这。',
    link: 'https://www.octavium.com.hk/',
    phone: '+852 2111 9395',
  },
  {
    id: 'ando',
    name: 'ANDŌ',
    cuisine: '西班牙 · 米其林一星',
    michelin: '1★',
    good_for: ['banquet', 'fish', 'meat'],
    area: '中環',
    price_tier: '$$$$',
    signature: '炭烤伊比利亞豬・西班牙海鮮飯',
    blurb: '日西混血厨師 Agustin Balbi 的招牌。',
    link: 'https://www.ando.com.hk/',
    phone: '+852 9161 6388',
  },
  {
    id: 'new_punjab_club',
    name: 'New Punjab Club',
    cuisine: '印度 · 米其林一星',
    michelin: '1★',
    good_for: ['meat', 'poultry', 'veggie'],
    area: '中環',
    price_tier: '$$$',
    signature: 'Tandoori 烤羊腿・naan',
    blurb: '全球首間印度菜星店。素食選擇豐富。',
    link: 'https://www.newpunjabclub.com/',
    phone: '+852 2368 1223',
  },
  {
    id: 'sushi_kuu',
    name: '寿司久 Sushi Kuu',
    cuisine: '日料 · 米其林一星',
    michelin: '1★',
    good_for: ['fish', 'shellfish', 'light'],
    area: '中環',
    price_tier: '$$$',
    signature: 'Omakase・吞拿魚大腹',
    blurb: '價位友好的星級壽司。第一次帶長輩吃 omakase 合適。',
    link: 'https://www.openrice.com/zh/hongkong/r-sushi-kuu',
    phone: '+852 2971 0180',
  },
  {
    id: 'din_tai_fung',
    name: '鼎泰豐',
    cuisine: '江浙 · 米其林一星',
    michelin: '1★',
    good_for: ['banquet', 'soy', 'meat', 'veggie'],
    area: '尖沙咀',
    price_tier: '$$',
    signature: '招牌小籠包・酸辣湯',
    blurb: '小籠包黃金 18 摺的祖師爺。家庭聚餐萬能解。',
    link: 'https://www.dintaifung.com.hk/',
    phone: '+852 2730 6928',
  },
  {
    id: 'yung_kee',
    name: '鏞記酒家',
    cuisine: '粤菜 · 烧鹅',
    michelin: '1★',
    good_for: ['poultry', 'banquet'],
    area: '中環',
    price_tier: '$$$',
    signature: '燒鵝・皮蛋酸薑',
    blurb: '香港燒鵝門面，1942 開業。從金毓茂到米其林星。',
    link: 'https://www.yungkee.com.hk/',
    phone: '+852 2522 1624',
  },
  {
    id: 'kashiwaya',
    name: 'Kashiwaya 柏屋',
    cuisine: '懷石 · 米其林一星',
    michelin: '1★',
    good_for: ['light', 'fish', 'banquet'],
    area: '中環',
    price_tier: '$$$$',
    signature: '春季懷石套餐',
    blurb: '油鹽超標想清淡？懷石把味覺重啟。預訂提前 2 週。',
    link: 'https://kashiwaya.com.hk/',
    phone: '+852 2520 5218',
  },

  // ───────────────── 必比登 / Bib Gourmand (10) ─────────────
  {
    id: 'yat_lok',
    name: '一樂燒鵝',
    cuisine: '粤式燒臘 · 必比登',
    michelin: 'Bib',
    good_for: ['poultry'],
    area: '中環',
    price_tier: '$',
    signature: '燒鵝瀨粉・例牌燒鵝',
    blurb: '中環人午餐排隊地。燒鵝皮脆汁多，CP 王者。',
    link: 'https://www.openrice.com/zh/hongkong/r-yat-lok',
    phone: '+852 2524 3882',
  },
  {
    id: 'ho_hung_kee',
    name: '何洪記',
    cuisine: '粤式雲吞麵 · 必比登',
    michelin: 'Bib',
    good_for: ['shellfish', 'grain', 'light'],
    area: '銅鑼灣',
    price_tier: '$',
    signature: '蝦子撈麵・鮮蝦雲吞',
    blurb: '蝦子撈麵彈牙、湯底清。1946 老字號。',
    link: 'https://www.openrice.com/zh/hongkong/r-ho-hung-kee',
    phone: '+852 2577 6060',
  },
  {
    id: 'tsim_chai_kee',
    name: '沾仔記',
    cuisine: '雲吞麵 · 必比登',
    michelin: 'Bib',
    good_for: ['shellfish', 'grain'],
    area: '中環',
    price_tier: '$',
    signature: '三寶麵・大蝦雲吞',
    blurb: '50 港元解決一頓正經。大蝦雲吞有 4 顆飽滿大蝦。',
    link: 'https://www.openrice.com/zh/hongkong/r-tsim-chai-kee-noodle',
    phone: '+852 2850 6471',
  },
  {
    id: 'tim_hing',
    name: '添興燒鵝',
    cuisine: '粤式燒臘 · 必比登',
    michelin: 'Bib',
    good_for: ['poultry'],
    area: '銅鑼灣',
    price_tier: '$',
    signature: '燒鵝拼叉燒飯',
    blurb: '一樂以外另一選擇，銅鑼灣排隊不會那麼瘋。',
    link: 'https://www.openrice.com/zh/hongkong/r-tim-hing-roasted-goose',
  },
  {
    id: 'hing_kee',
    name: '興記煲仔飯',
    cuisine: '煲仔飯 · 必比登',
    michelin: 'Bib',
    good_for: ['meat', 'grain'],
    area: '油麻地',
    price_tier: '$',
    signature: '臘味煲仔飯・牛肉滑蛋',
    blurb: '冬天必去。鍋巴脆、米飯香、料足。',
    link: 'https://www.openrice.com/zh/hongkong/r-hing-kee-claypot-rice',
    phone: '+852 2384 3647',
  },
  {
    id: 'sing_heung_yuen',
    name: '勝香園',
    cuisine: '茶餐廳 · 必比登',
    michelin: 'Bib',
    good_for: ['egg', 'light', 'poultry'],
    area: '中環',
    price_tier: '$',
    signature: '蕃茄通粉煎雞蛋・檸蜜',
    blurb: '中環大牌檔活化石。早午餐排隊地，可手寫菜單。',
    link: 'https://www.openrice.com/zh/hongkong/r-sing-heung-yuen',
  },
  {
    id: 'joy_hing',
    name: '再興燒臘飯店',
    cuisine: '粤式燒臘 · 必比登',
    michelin: 'Bib',
    good_for: ['meat', 'poultry'],
    area: '灣仔',
    price_tier: '$',
    signature: '燒肉拼叉燒飯',
    blurb: '1948 灣仔老字號。叉燒蜜汁香、燒肉皮脆。',
    link: 'https://www.openrice.com/zh/hongkong/r-joy-hing-roasted-meat',
    phone: '+852 2519 6639',
  },
  {
    id: 'pici',
    name: 'Pici',
    cuisine: '意大利手工面 · 必比登',
    michelin: 'Bib',
    good_for: ['grain', 'dairy'],
    area: '中環',
    price_tier: '$$',
    signature: 'Pici 手工粗麵・Cacio e Pepe',
    blurb: '托斯卡尼風 hand-rolled pasta。意麵想吃地道又不貴選這。',
    link: 'https://pici.com.hk/',
    phone: '+852 2755 5099',
  },
  {
    id: 'sister_wah',
    name: '華姐清湯腩',
    cuisine: '清湯腩 · 必比登',
    michelin: 'Bib',
    good_for: ['meat', 'light'],
    area: '天后',
    price_tier: '$',
    signature: '清湯牛腩麵',
    blurb: '香港清湯腩冠軍。牛腩燉得入口即化。',
    link: 'https://www.openrice.com/zh/hongkong/r-sister-wah',
    phone: '+852 2807 0181',
  },
  {
    id: 'kau_kee',
    name: '九記牛腩',
    cuisine: '清湯腩 · 必比登',
    michelin: 'Bib',
    good_for: ['meat'],
    area: '中環',
    price_tier: '$',
    signature: '咖喱牛腩河・清湯牛腩',
    blurb: '中環地標牛腩，1923 開業。下午 2 點以後賣完關門。',
    link: 'https://www.openrice.com/zh/hongkong/r-kau-kee-restaurant',
  },

  // ───────────────── 排名 Top / 老字号 (10) ─────────────────
  {
    id: 'mak_an_kee',
    name: '麥奀記忠記麵家',
    cuisine: '雲吞麵 · 老字号',
    good_for: ['shellfish', 'grain', 'light'],
    area: '中環',
    price_tier: '$',
    signature: '鮮蝦雲吞麵・牛腩',
    blurb: '麥奀家族百年雲吞，蝦子重手。',
    link: 'https://www.openrice.com/zh/hongkong/r-mak-an-kee-noodle',
  },
  {
    id: 'australian_dairy',
    name: '澳洲牛奶公司',
    cuisine: '茶餐廳 · 早午餐名店',
    good_for: ['egg', 'dairy'],
    area: '佐敦',
    price_tier: '$',
    signature: '炒滑蛋多士・燉奶',
    blurb: '佐敦排隊地。蛋類、奶類都缺？一頓早餐補齊。',
    link: 'https://www.openrice.com/zh/hongkong/r-australia-dairy-company',
  },
  {
    id: 'yee_shun_milk',
    name: '義順牛奶公司',
    cuisine: '甜品 · 燉奶',
    good_for: ['dairy'],
    area: '銅鑼灣',
    price_tier: '$',
    signature: '雙皮燉奶・薑汁撞奶',
    blurb: '澳門起家，香港多家分店。鈣質補一碗就夠。',
    link: 'https://www.yeeshunmilk.com.hk/',
    phone: '+852 2576 5286',
  },
  {
    id: 'tsui_wah',
    name: '翠華餐廳',
    cuisine: '茶餐廳 · 連鎖',
    good_for: ['egg', 'poultry', 'light'],
    area: '銅鑼灣',
    price_tier: '$',
    signature: '奶油豬・滑蛋叉燒飯',
    blurb: '24 小時茶餐廳，凌晨進食友好。',
    link: 'https://www.tsuiwahrestaurant.com/',
  },
  {
    id: 'maxim_palace',
    name: '美心皇宮 · 大會堂',
    cuisine: '粤式飲茶 · 經典',
    good_for: ['poultry', 'soy', 'banquet'],
    area: '中環',
    price_tier: '$$',
    signature: '蝦餃皇・燒賣',
    blurb: '大會堂二樓望維港飲茶。經典港式體驗。',
    link: 'https://www.maxims.com.hk/',
    phone: '+852 2521 1303',
  },
  {
    id: 'lin_heung',
    name: '蓮香居',
    cuisine: '粤式飲茶 · 老字号',
    good_for: ['poultry', 'soy', 'banquet'],
    area: '上環',
    price_tier: '$$',
    signature: '推車點心・蓮蓉包',
    blurb: '推車飲茶活化石。爺爺奶奶帶你來的味道。',
    link: 'https://www.openrice.com/zh/hongkong/r-lin-heung-kui',
    phone: '+852 2156 9328',
  },
  {
    id: 'lei_yue_mun',
    name: '鯉魚門三家村海鮮',
    cuisine: '粤式海鮮 · 街市',
    good_for: ['fish', 'shellfish'],
    area: '將軍澳',
    price_tier: '$$',
    signature: '清蒸石斑・椒鹽瀨尿蝦',
    blurb: '本週一條魚都沒上桌？三家村現買現做。',
    link: 'https://www.openrice.com/zh/hongkong/restaurants/region/sai-kung/lei-yue-mun',
  },
  {
    id: 'kam_fung',
    name: '金鳳茶餐廳',
    cuisine: '茶餐廳 · 老字号',
    good_for: ['egg', 'poultry'],
    area: '灣仔',
    price_tier: '$',
    signature: '菠蘿包・凍奶茶',
    blurb: '灣仔 1956 老字號。菠蘿包剛出爐 4 分鐘內最佳。',
    link: 'https://www.openrice.com/zh/hongkong/r-kam-fung-cafe',
  },
  {
    id: 'xibei',
    name: '西貝莜麵村',
    cuisine: '西北 · 雜糧',
    good_for: ['grain', 'veggie', 'light'],
    area: '銅鑼灣',
    price_tier: '$$',
    signature: '蕎麥麵・羊雜湯',
    blurb: '主食都是白米白麵？來碗莜麵補 B 族。',
    link: 'https://www.xibei.com.hk/',
  },
  {
    id: 'haidilao',
    name: '海底撈火鍋',
    cuisine: '川式火鍋',
    good_for: ['meat', 'shellfish', 'soy', 'veggie', 'banquet'],
    area: '銅鑼灣',
    price_tier: '$$$',
    signature: '麻辣鴛鴦鍋・手打蝦滑',
    blurb: '家庭聚餐萬能解。缺紅肉缺蔬菜一鍋補齊。',
    link: 'https://www.haidilao.com.hk/',
    phone: '+852 2110 0007',
  },

  // ───────────────── 国际化 fine-dining (5) ──────────────────
  {
    id: 'morton_steakhouse',
    name: 'Morton\'s of Chicago',
    cuisine: '美式扒房',
    good_for: ['meat', 'banquet'],
    area: '尖沙咀',
    price_tier: '$$$$',
    signature: '24oz Porterhouse・乾式熟成',
    blurb: '紅肉零顧及？週末乾式熟成牛扒補鐵。',
    link: 'https://www.mortons.com/hongkong/',
    phone: '+852 2732 2343',
  },
  {
    id: 'ichiran',
    name: '一蘭拉麵',
    cuisine: '日式 · 拉麵',
    good_for: ['poultry', 'egg', 'light'],
    area: '銅鑼灣',
    price_tier: '$$',
    signature: '豚骨拉麵・半熟蛋',
    blurb: '一個人吃飯、想簡單。豚骨湯底補蛋白也清淡。',
    link: 'https://hk.ichiran.com/',
  },
  {
    id: 'sumi',
    name: 'Sumi',
    cuisine: '日式燒肉',
    good_for: ['meat'],
    area: '中環',
    price_tier: '$$$',
    signature: 'A5 和牛・舌',
    blurb: '日式炭火燒肉，私語私語空間，本週紅肉缺它補。',
    link: 'https://sumihk.com/',
    phone: '+852 2547 9988',
  },
  {
    id: 'mana_cafe',
    name: 'Mana! Fast Slow Food',
    cuisine: '健康沙拉 · 素食',
    good_for: ['veggie', 'fruit', 'light'],
    area: '中環',
    price_tier: '$$',
    signature: 'Power Bowl・冷壓果汁',
    blurb: '蔬菜水果都不夠？這裡一頓全補上。',
    link: 'https://www.mana.hk/',
  },
  {
    id: 'lock_cha_tea',
    name: '樂茶軒素菜館',
    cuisine: '素食 · 茶餐',
    good_for: ['veggie', 'light', 'soy'],
    area: '中環',
    price_tier: '$$',
    signature: '茶葉飯・素點心',
    blurb: '一周肉太多想清淡？港式素食換口味。',
    link: 'https://www.lockcha.com/',
    phone: '+852 2801 7177',
  },
];

// ── Matching ────────────────────────────────────────────────────────

/**
 * Pick up to `limit` restaurants whose good_for tags cover the requested
 * needs. Sort order:
 *   1. Number of matching tags (higher = better)
 *   2. Michelin tier (3★ > 2★ > 1★ > Bib > none)
 *
 * Falls back to a "balanced default" when needs is empty — surfaces 2
 * tier-1 venues every HK user recognizes.
 */
const TIER_WEIGHT: Record<string, number> = { '3★': 4, '2★': 3, '1★': 2, 'Bib': 1 };

export function pickRestaurantsForNeeds(needs: DiningTag[], limit = 3): HkRestaurant[] {
  const pool = HK_RESTAURANTS.filter(r => !r.hidden);
  if (needs.length === 0) {
    return [
      pool.find(r => r.id === 'tim_ho_wan'),
      pool.find(r => r.id === 'lei_garden'),
    ].filter(Boolean) as HkRestaurant[];
  }
  const scored = pool.map(r => ({
    r,
    matches: r.good_for.filter(t => needs.includes(t)).length,
    tier:    TIER_WEIGHT[r.michelin ?? ''] ?? 0,
  })).filter(x => x.matches > 0);
  scored.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches;
    return b.tier - a.tier;
  });
  const seen = new Set<string>();
  const out: HkRestaurant[] = [];
  for (const { r } of scored) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
