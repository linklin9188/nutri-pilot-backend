/**
 * breakfastCombos.ts — canonical Chinese breakfast SETS.
 *
 * Instead of picking 3 random dishes from "dry/wet/egg" buckets, we use
 * culturally-paired combos (豆浆+油条+茶叶蛋 is right; 豆浆+菠萝包+凉拌
 * 海带 is wrong because the menu reads as 3 regions thrown together).
 *
 * Each combo lists keyword candidates for each slot. The picker
 * resolves each candidate against the actual dish pool and degrades
 * gracefully if a slot is missing in DB (logged for backfill).
 *
 * Sources: 用户提供的 "中式早餐 喝的/主食/配菜" 完整规范 (2026-05-16).
 * See .claude/skills/chinese-breakfast/SKILL.md for the full
 * cultural ruleset.
 */

export interface BreakfastCombo {
  id: string;
  name: string;
  hometowns: string[];            // matches user_profiles.hometown_cuisine; '*' = any
  drink:  string[];               // ordered candidate keywords for the 喝的 slot
  staple: string[];               // ordered candidate keywords for the 主食 slot
  side:   string[];               // ordered candidate keywords for the 配菜 slot
  /** Tags that DISQUALIFY this combo (e.g. 'dairy' avoid → skip 港式
   *  combos that need milk tea). Avoid filter is applied OUTSIDE the
   *  combo via household profile. */
  avoidTags?: string[];
  description: string;
}

export const BREAKFAST_COMBOS: BreakfastCombo[] = [
  // ── 北方家常 ────────────────────────────────────────────────────
  {
    id: 'bj-classic-doujiang-youtiao',
    name: '北方经典 · 豆浆油条',
    hometowns: ['northern'],
    drink:  ['豆浆', '黄豆浆', '黑豆豆浆', '燕麦豆浆'],
    staple: ['油条', '葱油饼'],
    side:   ['茶叶蛋', '卤蛋', '鸡蛋灌饼'],
    description: '油条配豆浆，北方人最爱的经典组合',
  },
  {
    id: 'bj-baobaozhou',
    name: '北方家常 · 八宝粥配包子',
    hometowns: ['northern'],
    drink:  ['八宝粥', '小米粥', '燕麦粥', '杂粮粥'],
    staple: ['包子', '小笼包', '生煎包', '素菜包', '红糖馒头', '馒头'],
    side:   ['茶叶蛋', '凉拌黄瓜', '凉拌海带', '酱牛肉'],
    description: '八宝粥配蒸包子，温热饱腹的传统早餐',
  },
  {
    id: 'bj-jianbing',
    name: '北方街边 · 煎饼果子',
    hometowns: ['northern'],
    drink:  ['豆浆', '八宝粥'],
    staple: ['煎饼果子', '煎饼', '素菜煎饼'],
    side:   ['茶叶蛋', '酱牛肉'],
    description: '煎饼果子配豆浆，北方上班族的速战早餐',
  },

  // ── 粤式家庭 ────────────────────────────────────────────────────
  {
    id: 'cantonese-pidan-zhou',
    name: '粤式家常 · 皮蛋瘦肉粥',
    hometowns: ['cantonese'],
    drink:  ['皮蛋瘦肉粥', '白粥', '生滚粥'],
    staple: ['油条', '虾饺', '烧麦', '糕'],
    side:   ['茶叶蛋', '鸡蛋羹', '腌菜'],
    description: '一碗皮蛋瘦肉粥配油条，港人最熟悉的味道',
  },
  {
    id: 'cantonese-dim-sum',
    name: '粤式茶楼 · 点心早茶',
    hometowns: ['cantonese'],
    drink:  ['白粥', '皮蛋瘦肉粥'],
    staple: ['虾饺', '烧麦', '糯米鸡', '叉烧包', '蒸排骨'],
    side:   ['茶叶蛋', '蒸蛋'],
    description: '广州 / 香港人周末的点心早茶组合',
  },

  // ── 港式茶餐厅 ─────────────────────────────────────────────────
  {
    id: 'hk-tea-restaurant',
    name: '港式茶餐厅 · 菠萝包奶茶',
    hometowns: ['cantonese'],
    drink:  ['港式奶茶', '奶茶', '鸳鸯', '柠檬茶', '阿华田', '好立克', '咖啡'],
    staple: ['菠萝包', '鸡尾包', '蛋挞', '西多士', '粢饭', '脆脆猪', '火腿通心粉'],
    side:   ['煎蛋', '炒蛋', '蛋饼'],
    avoidTags: ['dairy'],  // 港式奶茶有奶
    description: '茶餐厅经典：菠萝包 + 港式奶茶 + 火腿通心粉',
  },
  {
    id: 'hk-congee-noodle',
    name: '港式街边 · 粥粉面',
    hometowns: ['cantonese'],
    drink:  ['白粥', '皮蛋瘦肉粥', '鱼腩粥'],
    staple: ['沙嗲牛肉面', '雪菜肉丝米粉', '五香肉丁面', '火腿通心粉', '云吞面'],
    side:   ['茶叶蛋', '凉拌黄瓜'],
    description: '港人爱去街边粥粉面店的传统早餐',
  },

  // ── 江南 ─────────────────────────────────────────────────────────
  {
    id: 'jiangnan-shenjian',
    name: '江南家常 · 生煎包黑芝麻糊',
    hometowns: ['jiangnan'],
    drink:  ['核桃黑芝麻糊', '黑芝麻糊', '芝麻糊', '花生芝麻糊', '豆浆'],
    staple: ['生煎包', '小笼包', '蒸饺', '汤圆'],
    side:   ['茶叶蛋', '蒸蛋', '凉拌三丝'],
    description: '生煎包蘸醋配一碗黑芝麻糊，江南人的经典',
  },
  {
    id: 'jiangnan-xiaolong',
    name: '江南早茶 · 小笼包',
    hometowns: ['jiangnan'],
    drink:  ['豆浆', '白粥', '黑芝麻糊'],
    staple: ['小笼包', '生煎包', '蟹粉小笼', '蒸饺'],
    side:   ['茶叶蛋', '凉拌海带'],
    description: '苏沪人推崇的早茶组合',
  },

  // ── 川式 ────────────────────────────────────────────────────────
  {
    id: 'sichuan-hot',
    name: '川式麻辣 · 红油抄手',
    hometowns: ['sichuan'],
    drink:  ['豆浆', '八宝粥'],
    staple: ['红油抄手', '担担面', '酸辣粉', '煎饼'],
    side:   ['茶叶蛋', '凉拌黄瓜'],
    description: '川渝人爱辣，早上来份红油抄手开胃',
  },

  // ── 养生 / 老人 / 孕妇 ─────────────────────────────────────────
  {
    id: 'nourish-yangwei',
    name: '养生家常 · 燕麦小米',
    hometowns: ['*'],
    drink:  ['燕麦粥', '小米粥', '八宝粥', '银耳莲子', '黑芝麻糊'],
    staple: ['蒸红薯', '红薯粥', '玉米', '蒸南瓜', '全麦馒头', '馒头'],
    side:   ['鸡蛋羹', '蒸蛋', '茶叶蛋', '凉拌黄瓜'],
    description: '清淡养胃，适合老人 / 孕妇 / 病后恢复',
  },
  {
    id: 'nourish-light',
    name: '养生轻早餐 · 银耳莲子',
    hometowns: ['*'],
    drink:  ['银耳莲子', '银耳莲子羹', '燕麦粥', '小米粥', '汤圆'],
    staple: ['蒸南瓜', '红糖馒头', '红薯粥'],
    side:   ['茶叶蛋', '鸡蛋羹'],
    description: '温和滋补，养脾胃',
  },

  // ── 海派 / 国际化家庭 ───────────────────────────────────────────
  {
    id: 'modern-milk-bread',
    name: '现代家庭 · 牛奶面包',
    hometowns: ['*'],
    drink:  ['牛奶', '低脂奶', '酸奶', '豆浆'],
    staple: ['全麦馒头', '红糖馒头', '蒸红薯', '玉米'],
    side:   ['水煮蛋', '茶叶蛋'],
    avoidTags: ['dairy'],
    description: '上班族 / 学生 的简单家常组合',
  },

  // ── 全国通用 fallback ───────────────────────────────────────────
  {
    id: 'universal-safe',
    name: '全国家常 · 包子豆浆',
    hometowns: ['*'],
    drink:  ['豆浆', '白粥', '小米粥', '八宝粥'],
    staple: ['包子', '小笼包', '馒头', '油条', '生煎包', '烧麦'],
    side:   ['茶叶蛋', '鸡蛋灌饼'],
    description: '不挑地区的家常早餐 fallback',
  },
];

// ── Picker ─────────────────────────────────────────────────────────

export interface BreakfastPickInput {
  pool: Array<{ id: string; title_zh: string; main_ingredient?: string }>;
  dayIndex: number;     // 0–6, drives rotation across the week
  hometown?: string | null;
  avoidIngredients?: string[];
  avoidTags?: string[];
}

export interface ResolvedSlot {
  slot: 'drink' | 'staple' | 'side';
  dish: BreakfastPickInput['pool'][number] | null;
  /** Combo keywords we tried for this slot — useful for backfill warnings */
  candidates: string[];
}

export interface BreakfastPickResult {
  combo: BreakfastCombo;
  slots: ResolvedSlot[];          // exactly 3
  dishes: BreakfastPickInput['pool']; // 0–3 actually-resolved dishes
  missingSlots: ('drink' | 'staple' | 'side')[]; // need backfill
}

function poolMatchesAvoid(pool: BreakfastPickInput['pool'], avoidIng: string[]): typeof pool {
  if (avoidIng.length === 0) return pool;
  return pool.filter(d => !(d.main_ingredient && avoidIng.includes(d.main_ingredient)));
}

function pickCombo(
  combos: BreakfastCombo[],
  hometown: string | null | undefined,
  avoidTags: string[],
  dayIndex: number,
): BreakfastCombo {
  // 八大菜系 ID → DB bucket fallback. User picked 鲁菜 (shandong) →
  // breakfast combos tagged 'northern' (饺子/油条/八宝粥) become eligible.
  // Lazy import to keep this lib treeshake-friendly.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { hometownToDbBucket } = require('./hometownBuckets') as typeof import('./hometownBuckets');
  const homeBucket = hometownToDbBucket(hometown);
  const eligible = combos.filter(c => {
    if (c.hometowns.length > 0 && !c.hometowns.includes('*') && homeBucket && !c.hometowns.includes(homeBucket)) return false;
    if (c.avoidTags?.some(t => avoidTags.includes(t))) return false;
    return true;
  });
  if (eligible.length === 0) return combos[combos.length - 1];   // universal-safe
  return eligible[dayIndex % eligible.length];
}

function resolveSlot(
  pool: BreakfastPickInput['pool'],
  keywords: string[],
  used: Set<string>,
): ResolvedSlot['dish'] {
  for (const kw of keywords) {
    const match = pool.find(d => !used.has(d.id) && d.title_zh.includes(kw));
    if (match) return match;
  }
  return null;
}

/**
 * Pick a breakfast combo for the given day. Returns the chosen combo,
 * resolved DB dishes (where matches exist), and a list of missing slots
 * that need backfill.
 */
export function pickBreakfastCombo(input: BreakfastPickInput): BreakfastPickResult {
  const { dayIndex, hometown, avoidTags = [], avoidIngredients = [] } = input;
  const pool = poolMatchesAvoid(input.pool, avoidIngredients);
  const combo = pickCombo(BREAKFAST_COMBOS, hometown, avoidTags, dayIndex);

  const used = new Set<string>();
  const slots: ResolvedSlot[] = (['drink', 'staple', 'side'] as const).map(slot => {
    const keywords = combo[slot];
    const dish = resolveSlot(pool, keywords, used);
    if (dish) used.add(dish.id);
    return { slot, dish, candidates: keywords };
  });

  return {
    combo,
    slots,
    dishes: slots.map(s => s.dish).filter(Boolean) as BreakfastPickInput['pool'],
    missingSlots: slots.filter(s => !s.dish).map(s => s.slot),
  };
}
