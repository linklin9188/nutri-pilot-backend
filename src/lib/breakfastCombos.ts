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

import { hometownToDbBucket } from './hometownBuckets';

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
    // §G (TICKET-006) wet drink mutex — '红薯粥' 移走 (粥类归 drink slot, 避免 staple/drink 同框双粥)
    staple: ['蒸红薯', '玉米', '蒸南瓜', '全麦馒头', '馒头'],
    side:   ['鸡蛋羹', '蒸蛋', '茶叶蛋', '凉拌黄瓜'],
    description: '清淡养胃，适合老人 / 孕妇 / 病后恢复',
  },
  {
    id: 'nourish-light',
    name: '养生轻早餐 · 银耳莲子',
    hometowns: ['*'],
    drink:  ['银耳莲子', '银耳莲子羹', '燕麦粥', '小米粥', '汤圆'],
    // §G (TICKET-006) wet drink mutex — '红薯粥' 移走 (drink slot 已含 5 个粥/羹/汤圆)
    staple: ['蒸南瓜', '红糖馒头', '蒸红薯'],
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

// §G (TICKET-20260521-005 / Algorithm 071 诊断) — 修茶叶蛋"独占输出" bug.
// 既往: 14/16 combo 的 side[0]='茶叶蛋' + resolveSlot 顺序遍历 → 永远先返"茶叶蛋".
// 修复: resolveSlot 用 mulberry32(seed) 对 keywords 数组 Fisher-Yates shuffle,
//       seed = dayIndex × 31 + slotIndex (drink=0 / staple=1 / side=2).
//       同 dayIndex 稳定 (一周 5 天每天不同 shuffle), 跨 day 5 种不同顺序 → 跨周
//       配菜轮换不再永远第一个命中.
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// §A (TICKET-007) 早餐 4 slot 营养结构 — 用户反馈早餐缺维生素/纤维.
// 在 pickBreakfastCombo 返 3 slot (drink/staple/side) 之后, 调用方 (useWeeklyMenu)
// 检查覆盖, 缺 vitamin_fiber slot → 从 breakfast pool 抽 1 道补上.
// keyword 顺序: protein > vitamin_fiber > liquid > carb (先判更具体的)
export const BREAKFAST_CARB_KEYWORDS = [
  '包子','馒头','花卷','面包','吐司','粥','麦片','燕麦','米饭','米线',
  '面条','面','饭团','三明治','油条','烧饼','锅贴','饺','春饼','米糕','薯',
];
export const BREAKFAST_PROTEIN_KEYWORDS = [
  '蛋','蛋羹','鸡蛋','培根','火腿','瘦肉','牛奶','酸奶','豆浆','豆腐脑',
  '腐竹','鸡丝','鱼片','虾','瘦肉粥','皮蛋','奶酪','芝士','肠','肉',
];
export const BREAKFAST_VITAMIN_FIBER_KEYWORDS = [
  '蔬菜','青菜','番茄','黄瓜','胡萝卜','菠菜','油菜','生菜','沙拉',
  '苹果','香蕉','橙','梨','蓝莓','草莓','水果','果','果汁','蔬果汁',
  '杂粮','坚果','核桃','杏仁','南瓜','红薯','玉米',
];
export const BREAKFAST_LIQUID_KEYWORDS = [
  '温水','果汁','豆浆','米浆','汤','茶','奶茶','咖啡','柠檬水','蜂蜜水','米汤',
];

export type BreakfastNutritionSlot = 'carb' | 'protein' | 'vitamin_fiber' | 'liquid' | 'unknown';

export function classifyBreakfastSlot(dish: { title_zh?: string | null }): BreakfastNutritionSlot {
  const t = dish.title_zh || '';
  if (BREAKFAST_PROTEIN_KEYWORDS.some(kw => t.includes(kw))) return 'protein';
  if (BREAKFAST_VITAMIN_FIBER_KEYWORDS.some(kw => t.includes(kw))) return 'vitamin_fiber';
  if (BREAKFAST_LIQUID_KEYWORDS.some(kw => t.includes(kw))) return 'liquid';
  if (BREAKFAST_CARB_KEYWORDS.some(kw => t.includes(kw))) return 'carb';
  return 'unknown';
}

// §G (TICKET-006) wet drink mutex — 老板反馈早餐"粥+玉米汁同框" bug.
// root cause: combo staple/side keywords 误命中 wet drink 类菜 (如 '红薯粥'
// 串在 staple slot). 修复 A 已删 staple 里的 '红薯粥', B 这层在 resolveCombo
// 内做兜底: drink slot 已 resolve 后, staple/side 若也是 wet drink 类 → 置
// null 让 missingSlots backfill 路径替换. 关键词覆盖粥/汁/浆/糊/羹 5 类
// (不含'汤' 因 '汤圆' 是甜点; 不含'羹' 因 '鸡蛋羹' 是蛋类 side, 真正 wet drink
// 的 '银耳莲子羹' 已在 drink slot 不触发 mutex).
export const WET_DRINK_KEYWORDS = ['粥', '汁', '浆', '糊'];
function isWetDrink(titleZh: string): boolean {
  return WET_DRINK_KEYWORDS.some(kw => titleZh.includes(kw));
}

// (pickCombo removed 2026-05-17 — superseded by listEligibleCombos +
// pool-aware rotation in pickBreakfastCombo. The old version returned a
// combo without checking whether the pool could resolve any slot, which
// surfaced 北方 breakfast for 川 users whose preferred combo had zero
// keyword hits in DB.)

function resolveSlot(
  pool: BreakfastPickInput['pool'],
  keywords: string[],
  used: Set<string>,
  shuffleSeed?: number,
): ResolvedSlot['dish'] {
  // §G (TICKET-005) shuffleSeed undefined → 老行为 (顺序遍历, 兼容遗留调用).
  // 新调用从 resolveCombo 传入 dayIndex * 31 + slotIndex, 打散 keywords 顺序.
  const order = shuffleSeed !== undefined ? shuffleSeeded(keywords, shuffleSeed) : keywords;
  for (const kw of order) {
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
/** Internal: build the eligible-combo list filtered by hometown + avoidTags. */
function listEligibleCombos(
  hometown: string | null | undefined,
  avoidTags: string[],
): BreakfastCombo[] {
  const homeBucket = hometownToDbBucket(hometown);
  return BREAKFAST_COMBOS.filter(c => {
    if (c.hometowns.length > 0 && !c.hometowns.includes('*') && homeBucket && !c.hometowns.includes(homeBucket)) return false;
    if (c.avoidTags?.some(t => avoidTags.includes(t))) return false;
    return true;
  });
}

/** Internal: resolve a combo against a dish pool, returning the slots. */
function resolveCombo(combo: BreakfastCombo, pool: BreakfastPickInput['pool'], dayIndex: number): ResolvedSlot[] {
  const used = new Set<string>();
  const slots = (['drink', 'staple', 'side'] as const).map((slot, slotIndex) => {
    const keywords = combo[slot];
    // §G (TICKET-005) seed = dayIndex * 31 + slotIndex → 同 dayIndex 稳定,
    // 跨 day 自动轮换. slotIndex (drink=0 / staple=1 / side=2) 让 3 个 slot
    // 之间不耦合 (不会出现 drink 和 side 同时移位同样次).
    const seed = (dayIndex * 31 + slotIndex) | 0;
    const dish = resolveSlot(pool, keywords, used, seed);
    if (dish) used.add(dish.id);
    return { slot, dish, candidates: keywords } as ResolvedSlot;
  });

  // §G (TICKET-006) wet drink mutex — drink slot 已 resolve, staple/side
  // 若也命中 wet drink 类菜 (粥/汁/浆/糊/羹) → 置 null, missingSlots backfill 替换.
  const drinkDish = slots[0].dish;
  if (drinkDish) {
    for (let i = 1; i < slots.length; i++) {
      const d = slots[i].dish;
      if (d && isWetDrink(d.title_zh)) {
        used.delete(d.id);
        slots[i].dish = null;
      }
    }
  }

  return slots;
}

export function pickBreakfastCombo(input: BreakfastPickInput): BreakfastPickResult {
  const { dayIndex, hometown, avoidTags = [], avoidIngredients = [] } = input;
  const pool = poolMatchesAvoid(input.pool, avoidIngredients);

  // 2026-05-17 fix: pool-aware combo picking. The old behavior just took
  // `eligible[dayIndex % len]` regardless of whether that combo had any
  // matches in the DB. Four 川 users found this out painfully — DB has
  // **zero** sichuan-tagged breakfast rows, so the sichuan-hot combo
  // resolved 0 slots, fell through to the legacy bucket template, and
  // surfaced 北方 breakfast.
  //
  // New: rotate through eligible combos starting at `dayIndex`, and
  // settle on the first one that resolves at least one slot. Universal
  // ('*'-tagged) combos act as the natural fallback because they always
  // have wide keyword coverage (豆浆 / 馒头 / 茶叶蛋 ...) which the
  // breakfast pool can satisfy regardless of regional skew.
  const eligible = listEligibleCombos(hometown, avoidTags);
  if (eligible.length === 0) {
    // Should never happen because universal-safe is always eligible.
    const fallback = BREAKFAST_COMBOS[BREAKFAST_COMBOS.length - 1];
    const slots = resolveCombo(fallback, pool, dayIndex);
    return {
      combo: fallback, slots,
      dishes: slots.map(s => s.dish).filter(Boolean) as BreakfastPickInput['pool'],
      missingSlots: slots.filter(s => !s.dish).map(s => s.slot),
    };
  }

  let chosen: BreakfastCombo = eligible[dayIndex % eligible.length];
  let slots: ResolvedSlot[] = resolveCombo(chosen, pool, dayIndex);
  if (slots.every(s => !s.dish)) {
    // Zero hits on the preferred combo — rotate through the rest of
    // eligible looking for the first one that resolves at least one slot.
    for (let i = 1; i < eligible.length; i++) {
      const candidate = eligible[(dayIndex + i) % eligible.length];
      const candidateSlots = resolveCombo(candidate, pool, dayIndex);
      if (candidateSlots.some(s => s.dish)) {
        chosen = candidate;
        slots = candidateSlots;
        break;
      }
    }
  }

  return {
    combo: chosen,
    slots,
    dishes: slots.map(s => s.dish).filter(Boolean) as BreakfastPickInput['pool'],
    missingSlots: slots.filter(s => !s.dish).map(s => s.slot),
  };
}
