/**
 * breakfastPrepPhase.ts — TICKET-098 SPEC v2 Phase 2 跨日预制时间.
 *
 * 老板真测 5/27: "早餐可以吃昨晚做好拿出来热一下的东西".
 *
 * 设计 (negative listing — 老板拍板):
 *  - BREAKFAST_OVERNIGHT_KEYWORDS = "必须昨晚预制"清单 (粥/包子/卤味/凉拌等)
 *  - 其他所有早餐菜 = morning_fresh (现做, 20 分钟内能搞定)
 *  - 这样新菜进来不漏: 默认 fresh, 只有命中 overnight keyword 才需提前
 *
 * Overnight 类型 (4 大类):
 *  1. 粥类: 煮 30-40 分钟才软糯, 早上 6 点开始可能赶不上 7 点
 *  2. 发面: 包子/饺子/馒头/花卷 发面 1-2 小时
 *  3. 卤味: 卤蛋/卤豆腐 久煮入味 2 小时
 *  4. 凉拌/腌制: 隔夜入味
 */

import { classifyBreakfastSlot } from './breakfastCombos';

export type BreakfastPrepPhase = 'overnight' | 'morning_fresh' | 'not_staple';

/**
 * 必须昨晚预制的关键词. 命中任一即 overnight.
 * 注意只针对 staple 类菜 (粥/面食/包子等), 配菜/水果不进这个分类.
 */
export const BREAKFAST_OVERNIGHT_KEYWORDS = [
  // 粥类 (煮 30-40 分钟)
  '粥', '稀饭', '八宝', '腊八',
  // 皮蛋 (本身要做 30+ 天, 取一次现切是 OK 的, 但配粥时整套是 overnight)
  '皮蛋',
  // 发面 (1-2 小时)
  '包子', '饺子', '馒头', '花卷', '生煎', '烧麦', '鲜肉包',
  '虾饺', '叉烧包', '流沙包', '钟水饺', '龙抄手', '馄饨',
  // 久蒸 / 久煮
  '糯米藕', '蒸芋头', '蒸山药',
  // 卤味 / 入味
  '卤味', '卤蛋', '卤豆腐', '卤鸡', '酱牛肉',
  '腌', '泡菜', '酸菜', '咸菜',
  // 久煮甜品 / 糕点 (基本都是当天提前几小时做)
  '汤圆', '元宵', '粽子', '糍粑', '年糕',
  // 油炸 (现炸不安全, 一般前一晚炸好早上回锅)
  '油条', '麻团', '炸糕',
  // 烧饼烙饼系 (现做太赶)
  '锅盔', '烧饼', '葱油饼', '蛋烘糕',
];

/**
 * 判断早餐菜的预制阶段.
 *
 * 规则:
 *  - 非 staple (carb) → 'not_staple' (饮品/蛋类/水果不在范围)
 *  - staple + 命中 overnight keyword → 'overnight'
 *  - staple 其他 → 'morning_fresh' (默认, 现做 20 分钟内)
 */
export function classifyBreakfastPrep(dish: { title_zh?: string | null }): BreakfastPrepPhase {
  const slot = classifyBreakfastSlot(dish);
  if (slot !== 'carb') return 'not_staple';
  const t = dish.title_zh || '';
  if (BREAKFAST_OVERNIGHT_KEYWORDS.some(kw => t.includes(kw))) return 'overnight';
  return 'morning_fresh';
}

/**
 * UI 显示元信息.
 */
export const PREP_PHASE_META: Record<BreakfastPrepPhase, { emoji: string; label_zh: string; label_en: string; label_tl: string }> = {
  overnight:     { emoji: '🌙', label_zh: '昨晚备',  label_en: 'Prep last night', label_tl: 'Handain kagabi' },
  morning_fresh: { emoji: '☀️', label_zh: '现做',    label_en: 'Quick morning',   label_tl: 'Mabilis sa umaga' },
  not_staple:    { emoji: '',   label_zh: '',        label_en: '',                label_tl: '' },
};

/**
 * 从一组早餐菜里提取明天需要昨晚预制的菜.
 * 用于菲佣端"今晚预制任务"卡 + 雇主 menu 标识.
 */
export function pickOvernightPrepDishes<T extends { title_zh?: string | null }>(
  breakfastDishes: T[],
): T[] {
  return breakfastDishes.filter(d => classifyBreakfastPrep(d) === 'overnight');
}
