/**
 * hkRestaurants — curated Hong Kong dining recommendations.
 *
 * Seed list used by the weekend "外食营养报告" — matches WeeklySummary
 * nutritional gaps (缺鱼 / 缺虾蟹 / 缺蔬菜 / 缺水果 / 油盐重) to real HK
 * restaurants. Tier-1 famous places only — names every HK family already
 * recognizes so 推荐 → 预订 transition feels natural (no "who?" friction).
 *
 * 后续盈利方向：
 *   Phase 1 (now): stub 预订 button → opens OpenRice search / WhatsApp /
 *                  copies phone number
 *   Phase 2: 自营 booking via 餐厅合作 (commission per seat)
 *   Phase 3: 联动会员 — Pro 用户独家优惠 / 优先排位
 *
 * Add new restaurants here; downstream weeklyDiarySummary.ts picks them
 * up automatically as long as you tag good_for correctly.
 */

export type HkArea =
  | '中環'    | '上環'    | '銅鑼灣'  | '尖沙咀'  | '佐敦'
  | '灣仔'    | '北角'    | '太古'    | '旺角'    | '油麻地'
  | '九龍城'  | '荃灣'    | '沙田'    | '將軍澳'  | '西貢'
  | '深水埗'  | '紅磡';

export type DiningTag =
  | 'fish'        // 鱼
  | 'shellfish'   // 虾蟹
  | 'meat'        // 红肉
  | 'poultry'     // 禽肉
  | 'egg'
  | 'dairy'
  | 'soy'         // 豆制品
  | 'veggie'      // 蔬菜
  | 'fruit'       // 水果 / 鲜榨
  | 'grain'       // 杂粮
  | 'light'       // 清淡 (油盐重时的去处)
  | 'banquet';    // 家宴 / 节日

export interface HkRestaurant {
  id:          string;
  name:        string;
  cuisine:     string;        // displayed: '粤菜 · 飲茶' / '日料 · 拉麵'
  good_for:    DiningTag[];
  area:        HkArea;
  price_tier:  '$' | '$$' | '$$$' | '$$$$';
  signature:   string;        // 一句话招牌
  blurb:       string;        // 1-2 句为什么去
  /** OpenRice link or restaurant homepage — used by the stub 预订 button. */
  link?:       string;
  /** Phone number for ring-to-book — copy-to-clipboard in the stub flow. */
  phone?:      string;
  /** Optional 紧急关闭 flag to hide without deleting the row. */
  hidden?:     boolean;
}

// ── Seed (~20 well-known HK restaurants across the cuisine + gap matrix) ──

export const HK_RESTAURANTS: HkRestaurant[] = [
  // ── 粤式饮茶 / 早茶 (poultry + soy + light) ───────────────────────
  {
    id: 'tim_ho_wan',
    name: '添好運',
    cuisine: '粤式飲茶 · 米其林',
    good_for: ['poultry', 'soy', 'light', 'banquet'],
    area: '中環',
    price_tier: '$',
    signature: '酥皮焗叉燒包',
    blurb: '一星米其林還親民。本週缺禽肉或想吃飲茶，這裡永遠對。',
    link: 'https://www.openrice.com/zh/hongkong/r-tim-ho-wan-yiu-tung-r2456',
    phone: '+852 2332 2896',
  },
  {
    id: 'lei_garden',
    name: '利苑酒家',
    cuisine: '粤菜 · 飲茶 · 家宴',
    good_for: ['banquet', 'poultry', 'shellfish', 'fish'],
    area: '中環',
    price_tier: '$$$',
    signature: '燒鵝・燕窩雪燕燉鮮奶',
    blurb: '想吃一頓正經粤菜、招待長輩、慶生，先想這裡。',
    link: 'https://www.leigarden.hk/',
    phone: '+852 2392 5184',
  },
  {
    id: 'fook_lam_moon',
    name: '福臨門',
    cuisine: '粤菜 · 高端',
    good_for: ['banquet', 'fish', 'shellfish'],
    area: '灣仔',
    price_tier: '$$$$',
    signature: '雞油花雕蒸魚翅・脆皮糯米雞',
    blurb: '香港粤菜頂級殿堂。一年一兩次、值得。',
    link: 'https://www.fooklammoon-grp.com/',
    phone: '+852 2866 0663',
  },

  // ── 海鮮 / 鱼虾 (fish + shellfish) ─────────────────────────────────
  {
    id: 'leigarden_seafood',
    name: '鯉魚門三家村海鮮',
    cuisine: '粤式海鮮 · 街市',
    good_for: ['fish', 'shellfish'],
    area: '將軍澳',
    price_tier: '$$',
    signature: '清蒸石斑・椒鹽瀬尿蝦',
    blurb: '本週一條魚都沒上桌？週末去三家村現買現做。',
    link: 'https://www.openrice.com/zh/hongkong/restaurants/region/sai-kung/lei-yue-mun',
  },
  {
    id: 'sushi_kuu',
    name: '寿司久 (Sushi Kuu)',
    cuisine: '日式 · 壽司',
    good_for: ['fish', 'shellfish', 'light'],
    area: '中環',
    price_tier: '$$$',
    signature: 'Omakase・吞拿魚大腹',
    blurb: '想補魚油 omega-3、又想吃得仔細，日本料理首選。',
    link: 'https://www.openrice.com/zh/hongkong/r-sushi-kuu',
    phone: '+852 2971 0180',
  },
  {
    id: 'ichiran',
    name: '一蘭拉麵',
    cuisine: '日式 · 拉麵',
    good_for: ['poultry', 'egg', 'light'],
    area: '銅鑼灣',
    price_tier: '$$',
    signature: '豚骨拉麵 · 半熟蛋',
    blurb: '一個人吃飯、晚餐簡單一點，半熟蛋補蛋白。',
    link: 'https://hk.ichiran.com/',
  },

  // ── 紅肉 (meat) ─────────────────────────────────────────────────
  {
    id: 'morton_steakhouse',
    name: 'Morton\'s of Chicago',
    cuisine: '西餐 · 美式扒房',
    good_for: ['meat'],
    area: '尖沙咀',
    price_tier: '$$$$',
    signature: '24oz Porterhouse',
    blurb: '本週紅肉零顧及？週末來一塊乾式熟成牛扒補鐵。',
    link: 'https://www.mortons.com/hongkong/',
    phone: '+852 2732 2343',
  },
  {
    id: 'haidilao',
    name: '海底撈火鍋',
    cuisine: '川式火鍋',
    good_for: ['meat', 'shellfish', 'soy', 'veggie'],
    area: '銅鑼灣',
    price_tier: '$$$',
    signature: '麻辣鴛鴦鍋・手打蝦滑',
    blurb: '家庭聚餐萬能解。本週缺紅肉缺蔬菜，火鍋一次補齊。',
    link: 'https://www.haidilao.com.hk/',
    phone: '+852 2110 0007',
  },
  {
    id: 'islamic_lamb',
    name: '清真牛肉館',
    cuisine: '回族 · 牛羊',
    good_for: ['meat'],
    area: '灣仔',
    price_tier: '$$',
    signature: '炒羊肉片・牛尾湯',
    blurb: '本週紅肉空缺、想吃地道一點，去灣仔老字號。',
    link: 'https://www.openrice.com/zh/hongkong/r-islamic-centre-canteen',
  },

  // ── 茶餐廳 / 蛋類 (egg + poultry + light) ───────────────────────
  {
    id: 'tsui_wah',
    name: '翠華餐廳',
    cuisine: '茶餐廳',
    good_for: ['egg', 'poultry', 'light'],
    area: '銅鑼灣',
    price_tier: '$',
    signature: '奶油豬・滑蛋叉燒飯',
    blurb: '本週蛋類沒沾？滑蛋叉燒一份解決。茶餐廳熟悉味道。',
    link: 'https://www.tsuiwahrestaurant.com/',
  },
  {
    id: 'australian_dairy',
    name: '澳洲牛奶公司',
    cuisine: '茶餐廳 · 早午餐',
    good_for: ['egg', 'dairy'],
    area: '佐敦',
    price_tier: '$',
    signature: '炒滑蛋多士・燉奶',
    blurb: '本週蛋類、奶類都缺？一頓早餐補齊。記得早點去排隊。',
    link: 'https://www.openrice.com/zh/hongkong/r-australia-dairy-company',
  },

  // ── 江浙 / 北方 (grain + veggie + banquet) ──────────────────────
  {
    id: 'din_tai_fung',
    name: '鼎泰豐',
    cuisine: '江浙 · 小籠包',
    good_for: ['banquet', 'soy', 'meat', 'veggie'],
    area: '尖沙咀',
    price_tier: '$$',
    signature: '招牌小籠包・酸辣湯',
    blurb: '想要正經一頓但不想太重口，江浙菜總對。',
    link: 'https://www.dintaifung.com.hk/',
    phone: '+852 2730 6928',
  },
  {
    id: 'xibei',
    name: '西貝莜麵村',
    cuisine: '西北 · 雜糧',
    good_for: ['grain', 'veggie', 'light'],
    area: '銅鑼灣',
    price_tier: '$$',
    signature: '蕎麥麵・羊雜湯',
    blurb: '本週主食都是白米白飯？來碗莜麵補 B 族維生素。',
    link: 'https://www.xibei.com.hk/',
  },

  // ── 蔬菜 / 素食 (veggie + light) ─────────────────────────────────
  {
    id: 'lock_cha_tea',
    name: '樂茶軒素菜館',
    cuisine: '素食 · 茶餐',
    good_for: ['veggie', 'light', 'soy'],
    area: '中環',
    price_tier: '$$',
    signature: '茶葉飯・素點心',
    blurb: '一周肉太多、油有點重，週末來港式素食換口味。',
    link: 'https://www.lockcha.com/',
    phone: '+852 2801 7177',
  },
  {
    id: 'mana_cafe',
    name: 'Mana! Fast Slow Food',
    cuisine: '健康沙拉 · 素食',
    good_for: ['veggie', 'fruit', 'light'],
    area: '中環',
    price_tier: '$$',
    signature: 'Power Bowl・冷壓果汁',
    blurb: '本週蔬菜水果都不夠？這裡一頓全部補上。',
    link: 'https://www.mana.hk/',
  },

  // ── 水果 / 鮮榨 (fruit) ─────────────────────────────────────────
  {
    id: 'kowloon_dairy_juice',
    name: '佳記果汁',
    cuisine: '鮮榨果汁 · 街角',
    good_for: ['fruit'],
    area: '旺角',
    price_tier: '$',
    signature: '雜果汁・木瓜奶',
    blurb: '一週一口水果都沒沾？下午買杯鮮榨補維 C。',
    link: 'https://www.openrice.com/zh/hongkong/restaurants/type/juice',
  },

  // ── 清淡 (light — 油盐糖超标時) ──────────────────────────────────
  {
    id: 'kashiwaya',
    name: 'Kashiwaya 柏屋',
    cuisine: '日式 · 懷石',
    good_for: ['light', 'fish'],
    area: '中環',
    price_tier: '$$$$',
    signature: '春季懷石套餐',
    blurb: '本週油鹽都重？週末來一頓懷石把味覺重啟。',
    link: 'https://kashiwaya.com.hk/',
    phone: '+852 2520 5218',
  },
  {
    id: 'congee_queen',
    name: '陳齋鋪',
    cuisine: '潮州 · 粥品',
    good_for: ['light', 'soy', 'poultry'],
    area: '上環',
    price_tier: '$',
    signature: '艇仔粥・潮州滷水',
    blurb: '想吃一頓不油不膩、暖胃的，潮州粥永遠合適。',
    link: 'https://www.openrice.com/zh/hongkong/r-tsim-chai-kee-noodle',
  },

  // ── 大眾 (default fallback) ──────────────────────────────────────
  {
    id: 'maxim_palace',
    name: '美心皇宮 · 大會堂',
    cuisine: '粤式飲茶 · 經典',
    good_for: ['poultry', 'soy', 'banquet'],
    area: '中環',
    price_tier: '$$',
    signature: '蝦餃皇・燒賣',
    blurb: '本週飯桌剛剛好？大會堂飲茶望維港，簡單舒服。',
    link: 'https://www.maxims.com.hk/',
    phone: '+852 2521 1303',
  },
];

// ── Matching ────────────────────────────────────────────────────────

/**
 * Pick up to `limit` restaurants whose good_for tags cover the requested
 * needs, ordered by how many of those needs the restaurant satisfies.
 * Falls back to a curated "balanced default" when needs is empty.
 */
export function pickRestaurantsForNeeds(needs: DiningTag[], limit = 3): HkRestaurant[] {
  const pool = HK_RESTAURANTS.filter(r => !r.hidden);
  if (needs.length === 0) {
    // Balanced default — surface 2 venues users will recognize
    return [
      pool.find(r => r.id === 'tim_ho_wan'),
      pool.find(r => r.id === 'maxim_palace'),
    ].filter(Boolean) as HkRestaurant[];
  }
  const scored = pool.map(r => ({
    r,
    score: r.good_for.filter(t => needs.includes(t)).length,
  })).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  // Cap to limit, de-dupe by id (no dupes in seed but cheap insurance)
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
