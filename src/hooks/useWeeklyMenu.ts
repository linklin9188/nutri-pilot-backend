/**
 * useWeeklyMenu — 7-day dinner menu recommendation
 *
 * Algorithm layers:
 *  1. Base score      — 6-axis scoring (hometown 30% + goal 40% + taste 30%
 *                       + humidity + solar term + feedback EMA)
 *  2. Recency decay   — dishes served in last 30 days get a penalty
 *                       (<7d: -0.60, 7-14d: -0.35, 14-30d: -0.15)
 *  3. Week diversity  — same main_ingredient used on a previous day this week
 *                       gets a strong penalty (-0.40 per adjacent day)
 *  4. Day modifier    — weekends boost elaborate dishes; weekdays boost quick ones
 *  5. Weighted sample — top-20 candidates → weighted-random pick (avoids
 *                       always showing the same top-scored dishes)
 *
 * Persistence:
 *  • Primary: user_weekly_menus (Supabase) — survives device changes
 *  • Fallback: localStorage key "weekly_menu_<weekStart>" — works offline
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { type SupabaseDish, calcDishCount, type SolarTerm, getCurrentSolarTerm, isWholegrain, DINNER_HEAVY_TAGS } from './useSupabaseMenu';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from './preferenceColMap';
import { getUserPrefs } from '../lib/userPrefs';
import { getFamilyMenuPrefs, familyGoalScore, dishTriggersAllergy } from '../lib/familyPrefs';
import { loadIntentBias, applyIntentBias, getIntentHash } from '../lib/intentBias';
import { applyPregnancyAdjustments } from '../lib/pregnancy';
import { getUserId } from '../lib/userId';
import { applyCuisineFilter, loadCuisineMode } from '../lib/cuisineFilter';
import { DISH_FIELDS } from '../lib/dishFields';
import { hometownMatches, hometownToDbBucket } from '../lib/hometownBuckets';
import { isNewUserSession } from '../lib/userLifecycle';
import { pickBreakfastCombo } from '../lib/breakfastCombos';
import { syncProfileFromDB } from '../lib/profileSync';
import { loadPantryItems } from './usePantry';

// ── Types ─────────────────────────────────────────────────────────────────────

// §A (TICKET-055): explainScore API — 给 UI "为什么推这道菜" 抽屉打开 black box。
// 每个 AxisHit 是一条用户能直接看懂的中文解释 + 该轴的实际加分。
export interface AxisHit {
  axis: string;           // axis 短 slug: hometown / dietary_goal / preference_learn / solar_term / festival / home_inventory / seasonal_ingredient / xiaomei / spice / humidity / special_health
  score_delta: number;    // 该轴对总分贡献（正负皆可）
  reason: string;         // 中文化原因，UI 直接显示
}

export interface ScoreExplanation {
  score: number;          // explainScore 复刻的总分（主轴累加，与 scoreForWeek 量级一致但不含全部细分 axis）
  breakdown: AxisHit[];   // 用户友好的主轴明细（约 6-10 条命中项）
}

export interface WeeklyDayMenu {
  date: string;          // ISO date string for this day (YYYY-MM-DD)
  dayIndex: number;      // 0=Mon … 6=Sun
  dayLabel: string;      // 周一 … 周日
  dishes: SupabaseDish[];          // dinner dishes
  lunchDishes: SupabaseDish[];     // lunch dishes (simpler, 1-2 items)
  breakfastDishes: SupabaseDish[]; // breakfast combo (Smell 1 阶段 2: 来自 generateWeekPlan 调用 pickBreakfastCombo)
  fruitDish?: SupabaseDish;        // 餐后水果（dinner-attached, optional）
  // §B (TICKET-055): explanation map keyed by dish.id，UI 可选消费
  explanations?: Record<string, ScoreExplanation>;
}

// weekStart is YYYY-MM-DD (Monday). Returns YYYY-MM-DD for weekStart + dayIndex days,
// computed in local time so that the value matches the user's calendar day.
function dateForDayIndex(weekStart: string, dayIndex: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(y, m - 1, d + dayIndex);
  return formatLocalDate(date);
}

export interface WeeklyMenu {
  weekStart: string;           // ISO date string of Monday
  days: WeeklyDayMenu[];
}

// ── Cache version — bump this whenever the algorithm changes significantly ─────
// This ensures old cached menus are discarded after an algorithm update.
// Exported so other pages (e.g. VerifyIngredients / shopping list) can read
// from the matching cache key without drifting behind algo bumps.
export const ALGO_VERSION = 'v43'; // §B (TICKET-053): axis 28 公式微调 — 3+ 应季食材整体 bonus +0.15 + 单菜 cap +0.5；INGREDIENT_SEASONALITY 扩至 60+ 食材。
// v42: §C3 (TICKET-032 / SPEC_smell1_phase3 收尾): 跨日 dedup 3 天 hard-block + fruit 进 9-axis + breakfast combo 二次 scoreForWeek 排序。
// v41: §C (TICKET-015) generateWeekPlan seed PRNG + weightedRandom rng 参数。
// v40: Smell 1 阶段 2 合并双管道 + scoreForWeek 9-axis + sigmoid 学习曲线 + 周五"放纵日"。
// v37: Western high-end bias. v36: pool-aware breakfast combo. v35: hometown 地域大区. v34: cook-method variety. v33: power curve.

// ── 周末规则 (Weekend rule) — user-confirmed 2026-05-17 ───────────────────────
// Weekly menu only covers Mon-Fri. Generation skips Sat/Sun; display layers
// filter past days so the user opening on Wednesday sees Wed-Thu-Fri (3 days
// remaining). Saturday + Sunday show the "外食营养报告" report instead.

/** 0=Mon ... 4=Fri, 5=Sat, 6=Sun (matches WeeklyDayMenu.dayIndex).
 *
 *  After 20:00 we treat "today" as tomorrow — users opening the app at
 *  night are mentally planning for the next day, not the one that's
 *  ending. Concretely: Sun 21:00 lands on Mon's menu (workday flow),
 *  Fri 21:00 lands on Sat (weekend dining flow), Sat/Sun 21:00 just
 *  stay in the weekend bucket. Product call 2026-05-17. */
export function todayDayIndex(): number {
  const now = new Date();
  const eff = new Date(now);
  if (now.getHours() >= 20) eff.setDate(eff.getDate() + 1);
  const d = eff.getDay(); // 0=Sun, 1=Mon, ...
  return d === 0 ? 6 : d - 1;
}

/** True when today is Sat or Sun — UI should render the 外食营养报告. */
export function isWeekend(): boolean {
  return todayDayIndex() >= 5;
}

/** Filter a WeeklyMenu's days to "today onwards, weekday only".
 *  Mon → Mon-Fri (5). Wed → Wed-Fri (3). Sat/Sun → [] (UI fallback to report). */
export function daysFromTodayOnward<T extends { dayIndex: number }>(days: T[]): T[] {
  const t = todayDayIndex();
  if (t >= 5) return [];
  return days.filter(d => d.dayIndex >= t && d.dayIndex <= 4);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// §C1 (TICKET-032 / SPEC §3.1 Smell 1 阶段 3): cross-day title-keyword dedup
// 窗口（天数）。同 keyword 在窗口内出现过 → hard-block candidate filter；
// 窗外回退到 scoreForWeek axis 9 -0.65 软扣（兜底）。3 是 SPEC 默认值，
// 让"鸡腿/排骨"这种高频词每周最多出现 ⌈5/3⌉ = 2 次（周一 + 周四 / 周五）。
const DEDUP_WINDOW_DAYS = 3;

// §B (TICKET-043) axis 28: 单食材应季 — 节气 name_zh → 推荐食材列表。
// 与 solarTerm axis（节气-菜系-flavor-health 三维加分）互补：solarTerm 是
// "整道菜的当季感"（如冬至偏温补），SEASONALITY 是"具体食材 hit"（如冬至
// 桌上有羊肉 / 白菜）。30+ 食材覆盖 24 节气主流时令；扩展只需在此 map 加行。
// TICKET-053 §A: 扩到 60+ 食材覆盖（24 节气 × 港 + 内地常见时令）
const INGREDIENT_SEASONALITY: Record<string, string[]> = {
  '立春': ['韭菜', '春笋', '香椿', '荠菜', '豌豆苗'],
  '雨水': ['韭菜', '春笋', '荠菜', '蒲公英', '菠菜', '油菜', '苋菜'],
  '惊蛰': ['枇杷', '樱桃', '草莓', '春笋', '莴笋', '樱桃萝卜'],
  '春分': ['枇杷', '樱桃', '草莓', '芦笋', '荠菜', '蕨菜'],
  '清明': ['青团', '香椿', '荠菜', '马兰头', '螺蛳'],
  '谷雨': ['香椿', '蒲公英', '芦笋', '蚕豆', '春茶'],
  '立夏': ['枇杷', '黄瓜', '番茄', '蚕豆', '樱桃'],
  '小满': ['枇杷', '黄瓜', '苦瓜', '蚕豆'],
  '芒种': ['杨梅', '桃', '苦瓜', '丝瓜', '桑葚'],
  '夏至': ['西瓜', '桃', '苦瓜', '冬瓜', '荔枝'],
  '小暑': ['西瓜', '莲藕', '冬瓜', '丝瓜', '蜜桃'],
  '大暑': ['西瓜', '莲藕', '冬瓜', '丝瓜', '绿豆'],
  '立秋': ['葡萄', '莲子', '板栗', '南瓜', '龙眼'],
  '处暑': ['葡萄', '莲子', '板栗', '梨', '石榴', '茄子'],
  '白露': ['石榴', '柿子', '大闸蟹', '山药', '莲子', '桂圆'],
  '秋分': ['石榴', '柿子', '大闸蟹', '山药', '梨', '螃蟹'],
  '寒露': ['柿子', '螃蟹', '萝卜', '莲藕', '梨'],
  '霜降': ['柿子', '螃蟹', '萝卜', '莲藕', '白菜', '栗子'],
  '立冬': ['白菜', '萝卜', '羊肉', '山药', '鸭肉'],
  '小雪': ['白菜', '羊肉', '银耳', '莲子', '大葱'],
  '大雪': ['白菜', '羊肉', '银耳', '红枣', '火锅'],
  '冬至': ['白菜', '羊肉', '银耳', '桂圆', '糯米', '饺子', '汤圆'],
  '小寒': ['羊肉', '红枣', '桂圆', '糯米', '腊肉', '砂锅'],
  '大寒': ['羊肉', '红枣', '桂圆', '生姜', '糖瓜'],
};

// §A (TICKET-043 / Smell 1 阶段 4): cross-week dish-id fatigue threshold.
// 过去 4 周累计出现 ≥ CROSS_WEEK_FATIGUE_THRESHOLD 次的 dish_id → candidate
// filter 阶段 hard-block（reroll 直到该菜被新候选替换）。让用户跨周也不会
// 5 次以上吃到同一道菜（即便 keyword 不同，dish_id 强相等去重）。
const CROSS_WEEK_FATIGUE_THRESHOLD = 4;

// ── Who's eating today ────────────────────────────────────────────────────────

interface EatingMember { id: string; name: string; lifeStage: string; needs: string[] }

function loadAllMembers(): EatingMember[] {
  try { return JSON.parse(localStorage.getItem('nutri_family_members') || '[]'); }
  catch { return []; }
}

function getEatingMembers(): EatingMember[] {
  const allMembers = loadAllMembers();
  if (allMembers.length === 0) return [];
  const raw = localStorage.getItem('nutri_eating_today');
  if (!raw) return allMembers; // default: everyone
  try {
    const ids: string[] = JSON.parse(raw);
    const filtered = allMembers.filter(m => ids.includes(m.id));
    return filtered.length > 0 ? filtered : allMembers;
  } catch { return allMembers; }
}

/**
 * Per-day eating selection. `nutri_eating_by_day` is a
 * Record<dayIndex(0-6), memberId[]> so the user can say e.g. "周三只有
 * 夫妻两人" while keeping the weekend at full 5-person. Defaults fall
 * back to nutri_eating_today, then to "everyone". Empty selection on a
 * day is treated as no override → use today's default.
 */
export function getEatingMembersForDay(dayIdx: number): EatingMember[] {
  const allMembers = loadAllMembers();
  if (allMembers.length === 0) return [];
  try {
    const raw = localStorage.getItem('nutri_eating_by_day');
    if (raw) {
      const byDay = JSON.parse(raw) as Record<string, string[]>;
      const ids = byDay[String(dayIdx)];
      if (Array.isArray(ids) && ids.length > 0) {
        const filtered = allMembers.filter(m => ids.includes(m.id));
        if (filtered.length > 0) return filtered;
      }
    }
  } catch {}
  return getEatingMembers();
}

function getDayHeadcount(dayIdx: number): { adults: number; kids: number } {
  const members = getEatingMembersForDay(dayIdx);
  if (members.length === 0) {
    return {
      adults: parseInt(localStorage.getItem('nutri_adults') ?? '3', 10),
      kids:   parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10),
    };
  }
  const kids = members.filter(m => m.lifeStage === '儿童').length;
  return { adults: members.length - kids, kids };
}

/**
 * Returns total dishes per day + how many slots are reserved for kid-friendly dishes.
 * Kid slots: 1 if any kid in today's group, 2 if 2+ kids.
 */
function calcDishesForToday(): { dishesPerDay: number; kidSlots: number; adults: number; kids: number } {
  const members = getEatingMembers();
  let kids = 0, adults = 0;
  if (members.length > 0) {
    kids   = members.filter(m => m.lifeStage === '儿童').length;
    adults = members.length - kids;
  } else {
    adults = parseInt(localStorage.getItem('nutri_adults') ?? '3', 10);
    kids   = parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10);
  }
  // Delegate to the canonical calcDishCount so dinner / lunch / breakfast
  // all bucket consistently. Previously this function and calcDishCount
  // disagreed for 3a+2k: this returned 5 dinner, calcDishCount returned 4.
  // cuisineMode 影响 count（西餐晚餐 = n vs 中餐晚餐 = n+1）— 读 localStorage。
  const total = calcDishCount('晚餐', adults, kids, loadCuisineMode());
  const kidSlots = kids > 0 ? Math.min(kids, 2) : 0;
  return { dishesPerDay: total, kidSlots, adults, kids };
}

// Legacy alias (used by swapDish / regenerate where kidSlots doesn't matter)
function calcDishesPerDay(): number {
  return calcDishesForToday().dishesPerDay;
}

/** Stable localStorage cache key — includes algo version, headcount, cuisine mode, eating selection, intent.
 *  Exported (additive — no signature change) so ChatAgent's "采用此方案" path
 *  can write user_weekly_menus rows with the exact lsKey useWeeklyMenu would
 *  later compare against, preventing the just-adopted menu from being
 *  judged stale on the next /weekly mount. */
export function getCacheKey(weekStart: string): string {
  const { dishesPerDay } = calcDishesForToday();
  const eatingRaw = localStorage.getItem('nutri_eating_today');
  let eatingKey = 'all';
  try {
    if (eatingRaw) eatingKey = (JSON.parse(eatingRaw) as string[]).slice().sort().join('-');
  } catch {}
  const intentKey = getIntentHash();
  // 4 modes: chinese=c · hk-style=h · western=w · all=a. Single-char key
  // so the cache filename stays compact.
  const cm = loadCuisineMode();
  const cuisineKey = cm === 'hk-style' ? 'h' : cm.charAt(0);
  // Per-day eating override key. Hash the daily lists so any per-day change
  // busts the cache and rebuilds the affected day. Falls back to '' when no
  // per-day overrides exist (most users, single eating-today selection).
  let byDayKey = '';
  try {
    const byDayRaw = localStorage.getItem('nutri_eating_by_day');
    if (byDayRaw) {
      const byDay = JSON.parse(byDayRaw) as Record<string, string[]>;
      const parts: string[] = [];
      for (let i = 0; i < 7; i++) {
        const ids = byDay[String(i)];
        if (Array.isArray(ids) && ids.length > 0) {
          parts.push(`${i}:${ids.slice().sort().join(',')}`);
        }
      }
      if (parts.length > 0) byDayKey = `_d${parts.join('|')}`;
    }
  } catch {}
  return `weekly_menu_${ALGO_VERSION}_${weekStart}_p${dishesPerDay}_c${cuisineKey}_e${eatingKey}_i${intentKey}${byDayKey}`;
}

// Always use the local-time date to avoid UTC offset shifting the value to the
// previous day for users east of UTC.
function formatLocalDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMondayISO(): string {
  return getWeekStartISO(0);
}

/**
 * Compute the Monday of the week shifted by `weekOffset` weeks from today.
 * 0 = this week's Monday (default). 1 = next week's Monday — used on
 * weekends to fetch next week's plan so the user can shop ahead.
 */
export function getWeekStartISO(weekOffset: number = 0): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day) + weekOffset * 7;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

// ── §C (TICKET-015) deterministic PRNG for ChatAgent multi-candidate ─────────
// mulberry32: 32-bit seeded PRNG, returns [0, 1). Used when generateWeekPlan
// is invoked with an explicit `seed` so ChatAgent.proposalEngine can request
// 3 deterministic alternative weekly menus by passing seed=0/1/2.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted random pick: higher score → higher probability.
// rng defaults to Math.random; pass mulberry32(seed) for deterministic picks.
function weightedRandom<T extends { score: number }>(
  candidates: T[],
  count: number,
  rng: () => number = Math.random,
): T[] {
  const result: T[] = [];
  const pool = [...candidates];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const min = Math.min(...pool.map(c => c.score));
    const shifted = pool.map(c => ({ ...c, w: Math.max(0, c.score - min + 0.1) }));
    const total = shifted.reduce((s, c) => s + c.w, 0);
    let r = rng() * total;
    let idx = 0;
    for (let j = 0; j < shifted.length; j++) {
      r -= shifted[j].w;
      if (r <= 0) { idx = j; break; }
    }
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

// ── Ingredient category grouping ─────────────────────────────────────────────
// Maps individual main_ingredient values → broad protein category.
// Critical: hairtail/seabass/salmon/etc. must ALL be 'seafood' or they bypass the cap.

const ING_CATEGORY: Record<string, string> = {
  // Seafood — ALL variants must be here
  seafood: 'seafood', fish: 'seafood', shrimp: 'seafood',
  crab: 'seafood', shellfish: 'seafood', squid: 'seafood',
  scallop: 'seafood', clam: 'seafood', lobster: 'seafood',
  salmon: 'seafood', tuna: 'seafood', cod: 'seafood',
  hairtail: 'seafood', seabass: 'seafood', oyster: 'seafood',
  // Pork
  pork: 'pork',
  // Beef / lamb
  beef: 'beef', lamb: 'beef', mutton: 'beef',
  // Poultry
  chicken: 'poultry', duck: 'poultry', turkey: 'poultry',
  // Plant-based
  veggie: 'plant', vegetable: 'plant', tofu: 'plant',
  mushroom: 'plant', egg: 'plant', bean: 'plant', tempeh: 'plant',
  // Carb/staple — should only appear in the staple slot, not as main dishes
  carb: 'carb',
  // Other / miscellaneous
  other: 'other', dessert: 'other',
};

function ingCategory(ing: string): string {
  return ING_CATEGORY[ing] ?? 'other';
}

// ── Title keyword deduplication ───────────────────────────────────────────────
// Prevents e.g. 孜然排骨 + 糖醋排骨 + 排骨汤 all appearing in one week, AND
// 虾米娃娃菜 + 蒜蓉娃娃菜 (different main_ingredient but same headline vegetable).
// Each keyword is extracted from the Chinese dish title; if it's already been
// used N times this week, a strong penalty is applied to all dishes sharing it.
//
// Order matters: longer / more specific keywords first, so 大白菜 matches before
// 白菜 catches it (extractTitleKeyword returns the first match).
const TITLE_KEYWORDS = [
  // Proteins
  '排骨', '鸡腿', '鸡翅', '鸡胸', '全鸡', '烤鸡',
  '牛腩', '牛排', '牛肉', '羊肉', '五花肉', '猪蹄',
  '虾', '螃蟹', '鱼', '贝', '蛤',
  // Headline vegetables — these are the dish's defining ingredient and
  // shouldn't appear twice within a week even if the protein differs.
  '娃娃菜', '上海青', '油麦菜', '空心菜', '茼蒿', '荠菜',
  '菜心', '白菜', '菠菜', '芥蓝', '芥菜',
  '西兰花', '花椰菜', '芦笋', '青椒', '红椒', '彩椒',
  '茄子', '土豆', '冬瓜', '南瓜', '丝瓜', '苦瓜',
  '黄瓜', '番茄', '玉米', '萝卜', '胡萝卜', '莲藕',
  '豆腐', '豆角', '四季豆', '芸豆', '蚕豆', '毛豆',
  '木耳', '香菇', '蘑菇', '金针菇', '杏鲍菇',
];

function extractTitleKeyword(titleZh: string): string | null {
  return TITLE_KEYWORDS.find(kw => titleZh.includes(kw)) ?? null;
}

// Max times any single category may appear per 7-day week.
// Caps are at least 7 (= 1/day) for the macro categories the user wants
// every day (肉/海鲜/蔬菜/汤), so v17's strict per-slot enforcement can
// actually find candidates all 7 days. Daily diversity is handled by the
// same-category-in-same-day penalty in scoreForWeek (-0.45 / repeat), so
// you still get rotation within a day.
// Formula: max(7, base × scale) — loosens for bigger families.
function getMaxPerCategory(dishesPerDay: number): Record<string, number> {
  const scale = Math.max(1, Math.ceil(dishesPerDay / 5));
  return {
    seafood: Math.max(7, 2 * scale),  // ≥1/day for "海鲜每天有"
    pork:    Math.max(7, 3 * scale),
    beef:    Math.max(4, 2 * scale),  // beef less common in HK; cap stays moderate
    poultry: Math.max(7, 3 * scale),
    plant:   99,                       // no effective cap for vegetables
    carb:    7,                        // 1/day max (always in slot 4 only)
    other:   7 * scale,
  };
}

// ── Cuisine origin rebalancing ────────────────────────────────────────────────
// Western dishes are 32% of the DB pool but most users want Chinese-first menus.
// We apply a base score adjustment by origin so the algorithm doesn't just pick
// by volume. Chinese-origin cuisines get a slight lift; western gets a slight
// penalty unless the user has a western preference.
/**
 * 菜系基础分（2026-05-17 二次澄清，user-direction）。
 *
 * 用户两条规则：
 *   规则 1: 用户登记了家乡 → 家乡菜的权重要大（保持强加分，由
 *           hometownMatches() 的 +0.60 体现，独立于 base）
 *   规则 2: 用户没登记家乡 → 各菜系平等（不要默认偏向北方）
 *
 * 据此，base 分按以下设计：
 *
 *   • 用户设了家乡：
 *       自家家乡:           0      （家乡靠 hometownMatches +0.60，不在 base 重复加）
 *       其他中餐 / 国际:     +0.04 （轻度均衡）
 *       西餐:               -0.10 （抵消 DB 西餐数量偏斜）
 *
 *   • 用户没设家乡：
 *       cantonese / northern / jiangnan / sichuan:  +0.08 （绝对平等，不偏北方）
 *       japanese_korean / southeast_asian:          +0.04
 *       western:                                    -0.10
 */
function originBaseFor(dishOrigin: string, userBucket: string | null): number {
  if (!dishOrigin) return 0;
  if (dishOrigin === 'western') return -0.10;
  if (!userBucket || userBucket === 'no_preference') {
    // 平等模式：四大中餐 origin 拿同样的 +0.08，谁也不偏
    if (['cantonese', 'northern', 'jiangnan', 'sichuan'].includes(dishOrigin)) return 0.08;
    if (['japanese_korean', 'southeast_asian'].includes(dishOrigin)) return 0.04;
    return 0;
  }
  // 设了家乡：家乡菜 base 不重复加，全部 +0.60 加分由 hometownMatches 给
  if (dishOrigin === userBucket) return 0;
  // 其他中餐 / 国际 menu 给个轻度均衡，让 weekly menu 偶尔来一道别的口味
  if (['cantonese', 'northern', 'jiangnan', 'sichuan'].includes(dishOrigin)) return 0.04;
  if (['japanese_korean', 'southeast_asian'].includes(dishOrigin)) return 0.04;
  return 0;
}

/**
 * usagePower(n) — convert a cumulative usage count into a score bonus,
 * super-linear in |n|. The product spec (user direction 2026-05-17):
 *
 *   "用户看某个菜的次数，成幂次方上涨。不是指数平均。一开始是家乡，
 *    后续主要看用户使用数据。比如用户广东人，看川菜 5 次，那么说明他
 *    更喜欢吃辣。"
 *
 * Returns sign(n) * |n|^1.5 * 0.05, so:
 *
 *    n = 0   →  0
 *    n = 1   →  0.05   (single signal, barely a nudge)
 *    n = 5   →  0.56   (≈ hometown match strength — "5 次川菜" 持平家乡)
 *    n = 10  →  1.58   (surpasses hometown)
 *    n = 20  →  4.47   (usage data dominates)
 *    n = 25 (cap) → 6.25  (final ceiling)
 *
 * The caller multiplies by an axis-specific scale (cuisine ×1.0, flavor /
 * health ×0.6) so cuisine is the loudest signal — sustained 川菜 usage
 * should pull a 粤 user toward 川 dishes much more than a sustained
 * 'spicy' tag should pull a 'light' user toward 'spicy' dishes.
 */
function usagePower(n: number): number {
  if (!n) return 0;
  const sign = n >= 0 ? 1 : -1;
  return sign * Math.pow(Math.abs(n), 1.5) * 0.05;
}

// Premium-positioning damp: titles that feel like 快餐 / 便当 get a small
// negative at lunch/dinner mains. Doesn't disqualify, just nudges down a
// tier so 厨房做出的炒菜+汤+饭 layout wins over a 盖饭. Breakfast is
// untouched.
const FAST_FOOD_TITLE_HINTS = ['盖饭', '盖浇饭', '便当', '炒饭', '烩饭', '焗饭', '泡饭'];

// Western high-end positioning (香港高端用户视角)。Origin 是 'western'
// 时再做一次内部排序，让欧陆系 (意式 / 法式 / 西班牙 / 地中海 / 普罗旺斯
// / 摩洛哥 / 土耳其) 排到前面，美式 / 英式 (三明治 / 汉堡 / 玉米饼 /
// 牧羊人派) 排到后面。非 western dish 不受这个 bias 影响。
const WESTERN_FINE_DINING_HINTS  = ['意式', '法式', '法棍', '牛角包', '西班牙', '地中海', '普罗旺斯', '摩洛哥', '土耳其', '巴萨米可', '蘑菇炖饭', '千层面', '披萨', '意面', '炖菜'];
const WESTERN_CASUAL_HINTS       = ['三明治', '汉堡', '玉米饼', '热狗', '玉米片', '墨西哥卷', '牧羊人派', '潜艇堡', '吐司'];

function westernHighEndBias(title: string, origin: string): number {
  if (origin !== 'western') return 0;
  if (WESTERN_FINE_DINING_HINTS.some(k => title.includes(k))) return 0.12;
  if (WESTERN_CASUAL_HINTS.some(k => title.includes(k))) return -0.08;
  return 0;
}

// ── §A (TICKET-025) Festival window detector ──────────────────────────────
// 7 节日 + 公历近似日期（农历转换暂用固定日期 ±3，精度够 v1；未来可接
// lunar lib）。返回当前 active festival slug 或 null。
const FESTIVALS: Array<{ slug: string; month: number; day: number }> = [
  { slug: 'laba',      month: 1,  day: 17 }, // 腊八
  { slug: 'chunjie',   month: 2,  day: 10 }, // 春节
  { slug: 'yuanxiao',  month: 2,  day: 24 }, // 元宵
  { slug: 'duanwu',    month: 6,  day: 10 }, // 端午
  { slug: 'qixi',      month: 8,  day: 29 }, // 七夕
  { slug: 'zhongqiu',  month: 9,  day: 29 }, // 中秋
  { slug: 'chongyang', month: 10, day: 29 }, // 重阳
];

function getCurrentFestival(today: Date): string | null {
  const year = today.getFullYear();
  const todayMs = today.getTime();
  for (const f of FESTIVALS) {
    // Build candidate dates this year and adjacent years (cover 12 月底 ↔ 次年 1 月初)
    const candidates = [
      new Date(year - 1, f.month - 1, f.day),
      new Date(year,     f.month - 1, f.day),
      new Date(year + 1, f.month - 1, f.day),
    ];
    for (const cand of candidates) {
      const diffDays = Math.abs(todayMs - cand.getTime()) / 86400000;
      if (diffDays <= 3) return f.slug;
    }
  }
  return null;
}

// Month → season tag. DB seasonal_tag uses "Spring/Summer/Autumn/Winter"
// (also lowercase variants). Northern hemisphere months.
function currentSeasonTag(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5)  return 'spring';
  if (m >= 6 && m <= 8)  return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

// ── Age profile system ────────────────────────────────────────────────────────

interface AgeModifiers {
  wellnessTags: string[];
  wellnessBonus: number;
  tasteBoostTags: string[];
  tasteBonus: number;
  tastePenaltyTags: string[];
  tastePenalty: number;
}

const SENIOR_MODS: AgeModifiers = {   // 70后及之前
  wellnessTags:     ['maintain', 'pregnancy', 'damp_clear'],
  wellnessBonus:    0.50,
  tasteBoostTags:   ['light'],
  tasteBonus:       0.20,
  tastePenaltyTags: ['spicy'],
  tastePenalty:     0.30,
};
const MIDDLE_MODS: AgeModifiers = {   // 80后
  wellnessTags:     ['maintain', 'lose_weight', 'damp_clear'],
  wellnessBonus:    0.20,
  tasteBoostTags:   [],
  tasteBonus:       0,
  tastePenaltyTags: [],
  tastePenalty:     0,
};
const YOUNG_MODS: AgeModifiers = {    // 90后
  wellnessTags:     ['muscle_gain'],
  wellnessBonus:    0.25,
  tasteBoostTags:   ['spicy', 'seafood'],
  tasteBonus:       0.15,
  tastePenaltyTags: [],
  tastePenalty:     0,
};
const CHILD_MODS: AgeModifiers = {    // 00后及之后
  wellnessTags:     ['maintain'],
  wellnessBonus:    0.15,
  tasteBoostTags:   ['sweet', 'light'],
  tasteBonus:       0.20,
  tastePenaltyTags: ['spicy', 'sour'],
  tastePenalty:     0.35,
};

const AGE_GROUP_MAP: Array<{ keys: string[]; mods: AgeModifiers }> = [
  { keys: ['50后','60后','70后','pre1970','1950s','1960s','1970s','senior','elderly'], mods: SENIOR_MODS },
  { keys: ['80后','1980s','middle','adult'], mods: MIDDLE_MODS },
  { keys: ['90后','1990s','young','youth'],  mods: YOUNG_MODS  },
  { keys: ['00后','10后','2000s','2010s','child','teen','kid'],                       mods: CHILD_MODS  },
];

function resolveAgeModifiers(ageGroup: string | null | undefined): AgeModifiers {
  if (!ageGroup) return MIDDLE_MODS;
  const lower = ageGroup.toLowerCase();
  for (const { keys, mods } of AGE_GROUP_MAP) {
    if (keys.some(k => lower === k.toLowerCase() || lower.includes(k.toLowerCase()))) {
      return mods;
    }
  }
  return MIDDLE_MODS;
}

// ── Score a dish for weekly planning ─────────────────────────────────────────

interface WeeklyScoreParams {
  dish: any;
  profile: { hometown_cuisine: string | null; dietary_goal: string | null; taste_pref: string | null };
  prefScores: Record<string, number>;
  recentIds: Map<string, number>;   // dishId → days since last served
  pickedIngredients: string[];       // main_ingredient values picked so far this week
  pickedTitleKeywords: string[];     // title keywords already used this week
  dayIndex: number;                  // 0=Mon … 6=Sun
  spiceBoost?: number;              // from userPrefs
  ageGroup?: string | null;
  healthPrefs?: { preferLowSodium: boolean; preferLowSugar: boolean; avoidHighPurine: boolean };
  helperMode?: boolean;             // household has a helper — prefer low execution_level
  hasPregnant?: boolean;            // household has a pregnant member — applies pregnancy ban/prefer rules
  // ── 9-axis fields (Smell 1 阶段 2，CEO 已决保留 4 维) ──
  humidity?: number;                // 当前湿度 % (localStorage current_humidity)
  solarTerm?: SolarTerm | null;     // 节气加分（healthBoost/flavorBoost/flavorPenalty）
  hasXiaomei?: boolean;             // 小美料理机 — xiaomei_compatible 菜上浮（付费订阅强绑）
  mealTime?: '早餐' | '午餐' | '晚餐'; // 餐别口径（晚餐 oil/salt/sugar 软扣，午餐杂粮主食 +0.10）
  // ── §B (TICKET-015) axis 26: home inventory soft bonus ──
  homeInventoryItems?: Set<string>; // VerifyIngredients localStorage 当日"我家有"食材集合（含 missing_ingredient 反向剔除）
}

// ── Helper: extract all ingredient names a dish references ───────────────────
// dish.main_ingredient 单值 + prep_steps_json[].ingredient_zh (trays A/B/C/D...)
// 去重作为命中检测目标。prep_steps_json 缺失（老菜未生成）→ 退化到单一
// main_ingredient（命中率低但不报错）。
function dishIngredientNames(dish: any): string[] {
  const out = new Set<string>();
  if (dish.main_ingredient) out.add(dish.main_ingredient);
  const prep = dish.prep_steps_json as Array<{ ingredient_zh?: string }> | null | undefined;
  if (Array.isArray(prep)) {
    for (const step of prep) {
      if (step?.ingredient_zh) out.add(step.ingredient_zh);
    }
  }
  return Array.from(out);
}

function scoreForWeek({
  dish, profile, prefScores, recentIds, pickedIngredients, pickedTitleKeywords, dayIndex,
  spiceBoost = 0, ageGroup, healthPrefs, helperMode = false, hasPregnant = false,
  humidity = 75, solarTerm = null, hasXiaomei = false, mealTime = '晚餐',
  homeInventoryItems,
}: WeeklyScoreParams): number {
  const flavorTags: string[]  = dish.flavor_tags ?? [];
  const healthTags: string[]  = dish.health_benefit_tags ?? [];
  const origin: string        = dish.origin_cuisine ?? '';
  const ingredient: string    = dish.main_ingredient ?? 'other';
  const cat                   = ingCategory(ingredient);

  // ── 1. Cuisine origin rebalancing (fixes western 32% volume bias) ─────────
  // If user has a hometown preference, override the default penalty/bonus.
  // hometownMatches handles 八大菜系 IDs (鲁/苏/浙/闽/徽/湘) → DB bucket fallback.
  // Hometown bucket = the DB origin slug 当前用户 maps to (e.g. shandong →
  // 'northern'). Falling back to null when the user hasn't picked yet.
  const userBucket = hometownToDbBucket(profile.hometown_cuisine);
  let score = originBaseFor(origin, userBucket);
  if (hometownMatches(profile.hometown_cuisine, origin)) {
    // 家乡权重要大（user direction 2026-05-17）。+0.60 让自家菜系跟其他
    // 菜系的差距拉到 0.56+ (家乡 0.60 vs 其他中餐 base 0.04)，确保家乡
    // 菜永远是绝对最高分。
    score += 0.60;
  }

  // ── 2. Dietary goal — only count tags BEYOND 'maintain' ──────────────────
  // 'maintain' is on 82% of dishes, so it adds zero signal.
  // Only score specific health goals (lose_weight, muscle_gain, detox, etc.)
  if (profile.dietary_goal && profile.dietary_goal !== 'maintain') {
    if (healthTags.includes(profile.dietary_goal)) score += 0.35;
  } else if (profile.dietary_goal === 'maintain') {
    // For maintain users: prefer dishes that are NOT heavily tagged with
    // other goals (stay neutral), and give a small bonus for light/balanced
    if (flavorTags.includes('light')) score += 0.08;
  }

  // ── 3. Taste preference ───────────────────────────────────────────────────
  const tasteScore = profile.taste_pref && flavorTags.includes(profile.taste_pref) ? 0.25 : 0.0;
  score += tasteScore;

  // ── 4. Usage-data layer — power curve × sigmoid 学习权重 ────────────────
  // 用户使用数据成幂次方增长 (v33 power curve)。每次"keep / engage / cook"
  // 行为给对应 tag +1.0 (cumulative)，scoring 时套用 cnt^1.5 × scale。
  // 数值校准：广东人看川菜 5 次后，cuisine_sichuan ≈ 5 → power(5) × 0.05
  // = 0.56，跟家乡的 +0.60 持平；10 次 → 1.58，超过家乡；20 次 → 4.47。
  //
  // §B (Smell 1 阶段 2 配套，2026-05-19 CEO 决策)：叠加 sigmoid 学习权重
  // 让冷启动期 (n=0) power curve 衰减 65%，老用户 (n≥30) 略放大到 1.34。
  // weight = 0.35 + 1.15 * (1 - exp(-n/15))，n = 用户已有非零 prefScores
  // 信号的 distinct tag 数。15 信号 → 1.07，30 信号 → 1.34，∞ → 1.50。
  const learnedSignals = Object.values(prefScores)
    .filter(v => typeof v === 'number' && v !== 0).length;
  const sigmoidWeight = 0.35 + 1.15 * (1 - Math.exp(-learnedSignals / 15));
  for (const tag of flavorTags) {
    const col = FLAVOR_COL[tag];
    if (col && prefScores[col]) score += usagePower(prefScores[col]) * 0.6 * sigmoidWeight;
  }
  for (const tag of healthTags) {
    const col = HEALTH_COL[tag];
    if (col && prefScores[col]) score += usagePower(prefScores[col]) * 0.6 * sigmoidWeight;
  }
  const cuisineCol = CUISINE_COL[origin];
  if (cuisineCol && prefScores[cuisineCol]) score += usagePower(prefScores[cuisineCol]) * 1.0 * sigmoidWeight;

  // ── 5. Spice preference ───────────────────────────────────────────────────
  if (spiceBoost !== 0 && flavorTags.includes('spicy')) {
    score += spiceBoost;
  }

  // ── 6. Recency decay ──────────────────────────────────────────────────────
  const daysSince = recentIds.get(dish.id);
  if (daysSince !== undefined) {
    if (daysSince < 7)       score -= 0.60;
    else if (daysSince < 14) score -= 0.35;
    else if (daysSince < 30) score -= 0.15;
  }

  // ── 7. Diversity penalties ────────────────────────────────────────────────
  // 7a. Exact same ingredient → strong penalty
  const sameIngCount = pickedIngredients.filter(i => i === ingredient).length;
  score -= sameIngCount * 0.55;

  // 7b. Same category (fish + shrimp = both seafood) → moderate penalty
  const sameCatCount = pickedIngredients.filter(i => ingCategory(i) === cat).length;
  score -= sameCatCount * 0.30;

  // ── 8. Day-of-week modifier ───────────────────────────────────────────────
  const isWeekend = dayIndex >= 5;
  if (isWeekend) {
    if (['pork','beef','poultry'].includes(cat)) score += 0.12;
    if (cat === 'seafood' && sameCatCount === 0) score += 0.08;
  } else {
    if (['plant','poultry','pork'].includes(cat)) score += 0.08;
  }

  // Monday light/detox bonus
  if (dayIndex === 0 && (dish.is_vegan || flavorTags.includes('light'))) score += 0.10;

  // ── 9. Title keyword deduplication ───────────────────────────────────────
  // Prevents 排骨×3 / 鸡腿×2 etc. across the week.
  // Each occurrence already in pickedTitleKeywords adds a -0.65 penalty.
  const titleKw = extractTitleKeyword(dish.title_zh ?? dish.title ?? '');
  if (titleKw) {
    const kwCount = pickedTitleKeywords.filter(k => k === titleKw).length;
    score -= kwCount * 0.65;
  }

  // ── 10. Age group modifiers ──────────────────────────────────────────────
  const ageMods = resolveAgeModifiers(ageGroup);
  if (ageMods) {
    if (ageMods.wellnessTags.some((t: string) => healthTags.includes(t))) score += ageMods.wellnessBonus;
    if (ageMods.tasteBoostTags.some((t: string) => flavorTags.includes(t))) score += ageMods.tasteBonus;
    if (ageMods.tastePenaltyTags.some((t: string) => flavorTags.includes(t))) score -= ageMods.tastePenalty;
  }

  // ── 11. Health condition scoring ─────────────────────────────────────────
  if (healthPrefs) {
    if (healthPrefs.preferLowSodium && flavorTags.includes('light')) score += 0.15;
    if (healthPrefs.preferLowSugar  && flavorTags.includes('sweet')) score -= 0.20;
    if (healthPrefs.avoidHighPurine) {
      const highPurineIngredients = ['shellfish', 'crab', 'scallop', 'clam', 'oyster'];
      if (highPurineIngredients.includes(dish.main_ingredient ?? '')) score -= 0.30;
    }
  }

  // ── 12. Helper-mode: prefer execution_level 1-2, penalise 3 ─────────────
  if (helperMode) {
    const lvl: number = dish.execution_level ?? 2;
    if (lvl === 1) score += 0.30;
    else if (lvl === 3) score -= 0.45;
  }

  // ── 13. Pregnancy safety + nutrition (when any home member is 孕期) ─────
  // Hard ban on raw seafood / high-mercury fish / soft cheese (-5.0 to -3.5).
  // Soft boost on iron/folate/calcium-rich ingredients (+0.5 each).
  // See src/lib/pregnancy.ts for the full rule lists.
  score = applyPregnancyAdjustments(score, dish, { hasPregnant });

  // ── 14. User intent bias (free-text re-generation request) ─────────────
  // Reads localStorage on every call; cheap because bias is tiny JSON. The
  // strict slot enforcement above (-2.5 / wrong macro per slot) still wins,
  // so bias can only reorder within a slot's candidates — it can't change
  // a soup slot into a meat slot.
  score = applyIntentBias(score, dish, loadIntentBias());

  // ── 15. Seasonality (2026-05-17, high-end chef positioning) ───────────
  // DB seasonal_tag matches current calendar season → small bonus so
  // 冬瓜汤 in July or 萝卜炖排骨 in January ranks above its all-season
  // peers. "All-Season/Balanced" (≈80% of rows) is untouched.
  const seasonTag = ((dish.seasonal_tag ?? '') as string).toLowerCase();
  if (seasonTag && seasonTag === currentSeasonTag()) {
    score += 0.08;
  }

  // ── 16. Premium-positioning damp ───────────────────────────────────────
  // 盖饭 / 便当 / 炒饭 / 烩饭 read as 快餐 at a serious lunch/dinner table.
  // Soft negative — doesn't disqualify, but stops them winning the staple
  // slot over a proper rice + 3 dishes layout.
  const _title = (dish.title_zh ?? dish.title ?? '').toString();
  if (FAST_FOOD_TITLE_HINTS.some(k => _title.includes(k))) {
    score -= 0.15;
  }

  // ── 17. Western high-end positioning (HK premium clientele) ────────────
  // 仅 origin='western' 触发。让欧陆系排前，美式/英式 fast casual 排后。
  score += westernHighEndBias(_title, origin);

  // ═══════════════════════════════════════════════════════════════════════
  // Smell 1 阶段 2: 吸收 scoreDish 独有的 4 维（9-axis 合并）
  // CEO 决策 2026-05-19：保留 humidity / solarTerm / xiaomei / spiceBoost
  // 战略钩子（前两条 TCM 文化锚 + 后两条付费订阅 / 食安）。
  // ═══════════════════════════════════════════════════════════════════════

  // ── 18. Humidity correction (湿度 → damp_clear 偏好) ──────────────────
  if (humidity > 85 && healthTags.includes('damp_clear')) {
    score += 0.30;
  }

  // ── 19. Solar term correction (节气文化加分) ────────────────────────
  if (solarTerm) {
    if (healthTags.some(t => solarTerm.healthBoostTags.includes(t))) {
      score += solarTerm.healthBonus;
    }
    if (flavorTags.some(t => solarTerm.flavorBoostTags.includes(t))) {
      score += solarTerm.flavorBonus;
    }
    if (flavorTags.some(t => solarTerm.flavorPenaltyTags.includes(t))) {
      score -= solarTerm.flavorPenalty;
    }
  }

  // ── 20. 小美料理机 (xiaomei robot — 付费订阅强绑) ───────────────────
  if (hasXiaomei && (dish as any).xiaomei_compatible) {
    score += 0.15;
  }

  // ── 21. Meal-specific tone (中国营养主厨规则) ────────────────────────
  // 晚餐应该比午餐清淡 — P1 nutrition fields (oil/salt/sugar) 优先于
  // flavor_tag heuristic。
  if (mealTime === '晚餐') {
    if ((dish as any).oil_level   === 'high') score -= 0.08;
    if ((dish as any).salt_level  === 'high') score -= 0.06;
    if ((dish as any).sugar_level === 'high') score -= 0.04;
    if (!(dish as any).oil_level && !(dish as any).salt_level) {
      for (const t of flavorTags) {
        if (DINNER_HEAVY_TAGS.has(t)) score -= 0.10;
      }
    }
  }
  // 午餐主食 + 杂粮 → +0.10（杂粮饭 / 燕麦 / 糙米…）
  if (mealTime === '午餐' && ((dish as any).course_type === 'staple' || ingredient === 'grain') && isWholegrain(dish)) {
    score += 0.10;
  }

  // ── 22. 家有小孩餐桌偏向 (kid-friendly + 早餐蛋 + 晚餐钙) ─────────
  // localStorage 读取 OK — 一次菜单生成内 nutri_kids 不变。
  const kidsCount = parseInt(typeof localStorage !== 'undefined' ? (localStorage.getItem('nutri_kids') ?? '0') : '0', 10);
  if (kidsCount > 0) {
    if ((dish as any).is_kid_friendly) score += 0.20;
    if (mealTime === '早餐') {
      const proteinSrc = ((dish as any).protein_source ?? []) as string[];
      if (ingredient === 'egg' || proteinSrc.includes('egg')) score += 0.15;
    }
    if (mealTime === '晚餐') {
      const proteinSrc = ((dish as any).protein_source ?? []) as string[];
      const calciumRich =
        ['dairy', 'tofu'].includes(ingredient) ||
        proteinSrc.some(p => ['dairy', 'tofu', 'soy'].includes(p)) ||
        flavorTags.includes('veggie') ||
        ((dish.title_zh ?? '').match(/(豆腐|奶|芝士|酸奶|小鱼|虾|青菜|芥兰|芥蘭|西兰花|西蘭花|油菜|苋菜|菠菜)/));
      if (calciumRich) score += 0.10;
    }
  }

  // ── 23. New-user first-impression boost (社区验证签名) ───────────────
  if (isNewUserSession()) {
    const hometownHit = hometownMatches(profile.hometown_cuisine, origin) ? 1 : 0;
    const goalHit = (profile.dietary_goal && healthTags.includes(profile.dietary_goal)) ? 1 : 0;
    const tasteHit = (profile.taste_pref && flavorTags.includes(profile.taste_pref)) ? 1 : 0;
    const profileMatch = hometownHit + goalHit + tasteHit;
    score += profileMatch * 0.15;
    const hs:   number = Number((dish as any).health_score ?? 0);
    const kept: number = Number((dish as any).times_kept_in_menu ?? 0);
    score += (hs / 10) * 0.10;
    score += Math.min(kept, 50) / 50 * 0.08;
  }

  // ── 24. Weekday speed bonus (Mon-Thu 偏好 ≤20 min) ───────────────────
  const cookTime = (dish as any).cook_time_min;
  if (typeof cookTime === 'number' && cookTime > 0) {
    const dow = new Date().getDay();
    const isWeekdayDow = dow >= 1 && dow <= 4;
    if (isWeekdayDow) {
      if (cookTime <= 15)      score += 0.15;
      else if (cookTime <= 30) score += 0.05;
      else if (cookTime > 60)  score -= 0.20;
    }
  }

  // ── 25. §C 周五"放纵日" (2026-05-19 工单)  ──────────────────────────
  // dayIndex===4 (周五) 是工作周最后一天 = 放纵日：
  //   · spice 容忍 +0.5 (不辣用户也能尝到周五辣味)
  //   · cook_method=deep_fry 软加 +0.20 (炸物概率上浮)
  // 周一-周四与原口径一致，不动；周六/周日由 generateWeekPlan 整体 skip。
  if (dayIndex === 4) {
    if (flavorTags.includes('spicy')) score += 0.5;
    if ((dish as any).cook_method === 'deep_fry') score += 0.20;
  }

  // ── 27. §A (TICKET-025) Festival axis — 节庆 ±3 日内 +0.4 ───────────
  // dish.festival_tags 命中当前 active festival 时软加分。Database 024 §B
  // 上线 festival_tags 列前，dish.festival_tags 为 undefined → axis 27 = 0
  // 自然降级；落地后自动生效，不需要 ALGO_VERSION bump 或 cache 失效。
  const activeFestival = getCurrentFestival(new Date());
  if (activeFestival) {
    const festivalTags = ((dish as any).festival_tags ?? []) as string[];
    if (Array.isArray(festivalTags) && festivalTags.includes(activeFestival)) {
      score += 0.4;
    }
  }

  // ── 29. §B (TICKET-046) 特殊人群 dietary_goal — prenatal/lactation/elderly ──
  // SPEC_special_health_goals.md §4：dietary_goal 命中对应 dish boolean
  // 列 → +0.50 软加分。与 axis 2 dietary_goal +0.35 量级一致，单点不压过
  // 家乡 +0.60 保持多样性。schema-check forward-compat：migration 037 未
  // 落地时 dish.is_*_friendly === undefined → 子分支自动跳过不报错。
  // dietary_goal 维持 legacy 'pregnancy' 兼容（不触本 axis；pregnancy.ts
  // 链路独立处理 ban + soft boost）。
  if (profile.dietary_goal === 'prenatal'  && (dish as any).is_prenatal_friendly)  score += 0.50;
  if (profile.dietary_goal === 'lactation' && (dish as any).is_lactation_friendly) score += 0.50;
  if (profile.dietary_goal === 'elderly'   && (dish as any).is_elderly_friendly)   score += 0.50;

  // ── 28. §B (TICKET-043 起 + TICKET-053 §B 公式微调) 单食材应季加分 ──
  // 与 axis 19 solarTerm（菜系级 health/flavor）互补：本轴看具体食材是否
  // 命中当前节气的应季列表（如冬至 dish prep_steps_json 含羊肉）。
  //
  // 公式（TICKET-053 §B 调）：
  //   - 单食材命中 +0.10
  //   - 3+ 食材命中 → 整体额外 +0.15（应季宴 bonus，让"全应季"菜出色）
  //   - 单菜 cap +0.5（避免命中 5 个食材就压制其他 axis）
  if (solarTerm) {
    const seasonalList = INGREDIENT_SEASONALITY[solarTerm.name_zh];
    if (seasonalList && seasonalList.length > 0) {
      const dishIngs = dishIngredientNames(dish);
      let seasonalHits = 0;
      for (const ing of dishIngs) {
        if (seasonalList.includes(ing)) seasonalHits++;
      }
      if (seasonalHits > 0) {
        let seasonalBoost = seasonalHits * 0.10;
        if (seasonalHits >= 3) seasonalBoost += 0.15;
        if (seasonalBoost > 0.5) seasonalBoost = 0.5;
        score += seasonalBoost;
      }
    }
  }

  // ── 26. §B (TICKET-015) Home-inventory soft bonus (C 短期闭环) ─────────
  // homeInventoryItems = VerifyIngredients localStorage 今日"我家有"
  // ∩ (7 日内 missing_ingredient feedback 剔除集) 的并集（hook 层 prepare）。
  // 命中规则：dish 的 main_ingredient + prep_steps_json[].ingredient_zh 与
  // inventory 集合做交集计数。软加分，不硬过滤；缺 prep_steps_json 的老菜
  // 退化为单 main_ingredient 命中（命中率低但不报错）。
  if (homeInventoryItems && homeInventoryItems.size > 0) {
    const names = dishIngredientNames(dish);
    let hits = 0;
    for (const name of names) {
      if (homeInventoryItems.has(name)) hits++;
    }
    if (hits >= 4)      score += 0.30;
    else if (hits >= 2) score += 0.15;
  }

  return score;
}

// ═══════════════════════════════════════════════════════════════════════════
// §A (TICKET-055) explainScore — 为 UI "为什么推这道菜" 抽屉返回中文 breakdown。
//
// 设计原则:
//   - 与 scoreForWeek 解耦 — 不动 scoreForWeek 签名（向后兼容）；本函数自
//     己重跑主轴判断 + 中文化 reason，主轴累加分与 scoreForWeek 同量级
//   - 只覆盖用户感知的 9-10 个主轴（hometown / dietary_goal / preference_learn /
//     solar_term / festival / home_inventory / seasonal_ingredient / xiaomei /
//     spice / humidity / special_health）；细分 axis (recency / diversity /
//     weekday speed 等) 算入主路径但不进 breakdown — 用户不需要看
//   - 总分 ≠ scoreForWeek 总分（无所谓 — 这是给用户看的 user-facing 解释，
//     不是审计；UI 用 breakdown 而非 .score 数字）
// ═══════════════════════════════════════════════════════════════════════════

const ORIGIN_ZH: Record<string, string> = {
  cantonese: '粤菜', sichuan: '川菜', jiangnan: '江南菜', northern: '北方菜',
  shandong: '鲁菜', hunan: '湘菜', huaiyang: '淮扬菜', anhui: '徽菜',
  fujian: '闽菜', zhejiang: '浙菜', shanxi: '陕西菜', yunnan_guizhou: '云贵菜',
  chaoshan: '潮汕菜', shunde: '顺德菜', taiwanese: '台菜',
  japanese_korean: '日韩菜', southeast_asian: '东南亚菜', western: '西餐',
};

const DIETARY_GOAL_ZH: Record<string, string> = {
  muscle_gain: '增肌', lose_weight: '减脂', maintain: '维持', detox: '排毒',
  growth: '生长发育', pregnancy: '孕期', prenatal: '孕期营养',
  lactation: '哺乳期', elderly: '老人养生',
};

const FLAVOR_ZH: Record<string, string> = {
  spicy: '辣', sweet: '甜', sour: '酸', salty: '咸', light: '清淡',
  seafood: '海鲜', veggie: '蔬菜',
};

const HEALTH_ZH: Record<string, string> = {
  damp_clear: '祛湿', muscle_gain: '增肌', lose_weight: '减脂',
  maintain: '保健', detox: '排毒', authentic_hk: '港式',
  mood_boost: '安神', anti_inflammation: '消炎', immunity: '增免疫',
  beauty: '美容', pregnancy: '安胎',
};

const FESTIVAL_ZH: Record<string, string> = {
  laba: '腊八', chunjie: '春节', yuanxiao: '元宵', duanwu: '端午',
  qixi: '七夕', zhongqiu: '中秋', chongyang: '重阳',
};

export interface ExplainContext {
  profile: { hometown_cuisine: string | null; dietary_goal: string | null; taste_pref: string | null };
  prefScores: Record<string, number>;
  dayIndex: number;
  mealTime?: '早餐' | '午餐' | '晚餐';
  today?: Date;            // 用于 festival 判定 + "X 日后/前" 文案
  solarTerm?: SolarTerm | null;
  humidity?: number;
  hasXiaomei?: boolean;
  homeInventoryItems?: Set<string>;
  spiceBoost?: number;
}

export function explainScore(dish: any, ctx: ExplainContext): ScoreExplanation {
  const breakdown: AxisHit[] = [];
  let totalScore = 0;
  const flavorTags: string[] = dish.flavor_tags ?? [];
  const healthTags: string[] = dish.health_benefit_tags ?? [];
  const origin: string = dish.origin_cuisine ?? '';

  // 1. hometown match
  if (hometownMatches(ctx.profile.hometown_cuisine, origin)) {
    const cuisineLabel = ORIGIN_ZH[origin] ?? origin;
    breakdown.push({ axis: 'hometown', score_delta: 0.60, reason: `家乡菜（${cuisineLabel}）` });
    totalScore += 0.60;
  }

  // 2. dietary_goal match
  if (ctx.profile.dietary_goal && ctx.profile.dietary_goal !== 'maintain') {
    if (healthTags.includes(ctx.profile.dietary_goal)) {
      const goalZh = DIETARY_GOAL_ZH[ctx.profile.dietary_goal] ?? ctx.profile.dietary_goal;
      breakdown.push({ axis: 'dietary_goal', score_delta: 0.35, reason: `符合你的${goalZh}目标` });
      totalScore += 0.35;
    }
  }

  // 3. taste match
  if (ctx.profile.taste_pref && flavorTags.includes(ctx.profile.taste_pref)) {
    const tasteZh = FLAVOR_ZH[ctx.profile.taste_pref] ?? ctx.profile.taste_pref;
    breakdown.push({ axis: 'taste', score_delta: 0.25, reason: `口味偏好：${tasteZh}` });
    totalScore += 0.25;
  }

  // 4. preference_learn — 取 prefScores 最大的 1-2 个 tag
  const learnedSignals = Object.entries(ctx.prefScores)
    .filter(([, v]) => typeof v === 'number' && v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2);
  if (learnedSignals.length > 0) {
    const topTags = learnedSignals.map(([col, v]) => {
      const tagName = col.replace(/^pref_/, '');
      const zh = FLAVOR_ZH[tagName] ?? HEALTH_ZH[tagName] ?? ORIGIN_ZH[tagName] ?? tagName;
      return `${zh}(${v > 0 ? '+' : ''}${v})`;
    }).join(' / ');
    const learnDelta = learnedSignals.reduce((s, [, v]) => s + Math.sign(v) * 0.15, 0);
    breakdown.push({ axis: 'preference_learn', score_delta: learnDelta, reason: `你最近喜欢 ${topTags}` });
    totalScore += learnDelta;
  }

  // 5. solar_term
  if (ctx.solarTerm) {
    if (healthTags.some(t => ctx.solarTerm!.healthBoostTags.includes(t))) {
      breakdown.push({
        axis: 'solar_term', score_delta: ctx.solarTerm.healthBonus,
        reason: `${ctx.solarTerm.name_zh}：${ctx.solarTerm.philosophy_zh}`,
      });
      totalScore += ctx.solarTerm.healthBonus;
    }
  }

  // 6. festival ±3 日
  const today = ctx.today ?? new Date();
  const fest = getCurrentFestival(today);
  if (fest) {
    const festTags = ((dish as any).festival_tags ?? []) as string[];
    if (Array.isArray(festTags) && festTags.includes(fest)) {
      const festZh = FESTIVAL_ZH[fest] ?? fest;
      breakdown.push({ axis: 'festival', score_delta: 0.40, reason: `${festZh}节庆推荐` });
      totalScore += 0.40;
    }
  }

  // 7. home_inventory hits
  if (ctx.homeInventoryItems && ctx.homeInventoryItems.size > 0) {
    const names = dishIngredientNames(dish);
    let hits = 0;
    for (const name of names) if (ctx.homeInventoryItems.has(name)) hits++;
    if (hits >= 4) {
      breakdown.push({ axis: 'home_inventory', score_delta: 0.30, reason: `家里有 ${hits} 个食材` });
      totalScore += 0.30;
    } else if (hits >= 2) {
      breakdown.push({ axis: 'home_inventory', score_delta: 0.15, reason: `家里有 ${hits} 个食材` });
      totalScore += 0.15;
    }
  }

  // 8. seasonal_ingredient (axis 28)
  if (ctx.solarTerm) {
    const seasonalList = INGREDIENT_SEASONALITY[ctx.solarTerm.name_zh] ?? [];
    if (seasonalList.length > 0) {
      const dishIngs = dishIngredientNames(dish);
      const hitsArr: string[] = [];
      for (const ing of dishIngs) if (seasonalList.includes(ing)) hitsArr.push(ing);
      if (hitsArr.length > 0) {
        let delta = hitsArr.length * 0.10;
        if (hitsArr.length >= 3) delta += 0.15;
        if (delta > 0.5) delta = 0.5;
        breakdown.push({ axis: 'seasonal_ingredient', score_delta: delta, reason: `应季食材：${hitsArr.join(' / ')}` });
        totalScore += delta;
      }
    }
  }

  // 9. xiaomei
  if (ctx.hasXiaomei && (dish as any).xiaomei_compatible) {
    breakdown.push({ axis: 'xiaomei', score_delta: 0.15, reason: '小美料理机可做' });
    totalScore += 0.15;
  }

  // 10. spice match
  if (ctx.spiceBoost && ctx.spiceBoost > 0 && flavorTags.includes('spicy')) {
    breakdown.push({ axis: 'spice', score_delta: ctx.spiceBoost, reason: '辣度匹配你的偏好' });
    totalScore += ctx.spiceBoost;
  }

  // 11. humidity damp_clear
  if (ctx.humidity !== undefined && ctx.humidity > 85 && healthTags.includes('damp_clear')) {
    breakdown.push({ axis: 'humidity', score_delta: 0.30, reason: `高湿度（${ctx.humidity}%）宜祛湿` });
    totalScore += 0.30;
  }

  // 12. special_health (axis 29)
  if (ctx.profile.dietary_goal === 'prenatal' && (dish as any).is_prenatal_friendly) {
    breakdown.push({ axis: 'special_health', score_delta: 0.50, reason: '孕期推荐菜' });
    totalScore += 0.50;
  }
  if (ctx.profile.dietary_goal === 'lactation' && (dish as any).is_lactation_friendly) {
    breakdown.push({ axis: 'special_health', score_delta: 0.50, reason: '哺乳期推荐菜' });
    totalScore += 0.50;
  }
  if (ctx.profile.dietary_goal === 'elderly' && (dish as any).is_elderly_friendly) {
    breakdown.push({ axis: 'special_health', score_delta: 0.50, reason: '老人养生推荐菜' });
    totalScore += 0.50;
  }

  return { score: Number(totalScore.toFixed(3)), breakdown };
}

// ── Enrich raw DB row → SupabaseDish (lightweight copy of enrichDish) ─────────

function enrichRaw(dish: any): SupabaseDish {
  const lang = (localStorage.getItem('appLanguage') ?? 'zh') as 'en' | 'zh';
  const title = lang === 'zh'
    ? (dish.title_zh || dish.title_en || '')
    : (dish.title_en || dish.title_zh || '');
  const desc = lang === 'zh'
    ? (dish.description_zh || dish.description_en || '')
    : (dish.description_en || dish.description_zh || '');
  // Derive type from main_ingredient (authoritative) not flavor_tags
  // flavor_tags 'seafood' just means "has seafood taste" — unreliable for type
  const ing = dish.main_ingredient ?? '';
  const ingCat = ingCategory(ing);
  const dishType =
    ingCat === 'plant' || (dish.flavor_tags ?? []).includes('veggie') ? 'VEGGIE' :
    ingCat === 'seafood' ? 'SEAFOOD' :
    ingCat === 'carb'    ? 'STAPLE'  :
    'MEAT';

  return {
    ...dish,
    title,
    desc,
    img: dish.image_url || '',
    is_vegetarian: dishType === 'VEGGIE',
    is_vegan: dish.is_vegan ?? false,
    type: dishType,
    highlight: false,
    description_en: dish.description_en || '',
    // Steps — mapped from DB JSONB fields (available once gen-dish-steps runs)
    prep_steps_json: dish.prep_steps_json ?? null,
    cook_steps_json: dish.cook_steps_json ?? null,
    _raw: dish,
  };
}

// ── Generate weekly plan from dish pool ───────────────────────────────────────

// ── Per-day meal slot target composition ─────────────────────────────────────
// A typical Chinese dinner has: 1 main protein + 1-2 veggie/tofu dishes + 1 staple
//
// slot 0: main protein — pork / chicken / beef (seafood only if weekly cap allows)
// slot 1: secondary — veggie-heavy, tofu, egg, or lighter meat
// slot 2: pure plant — veggie / tofu / mushroom / egg
// slot 3: plant or light soup-style (light flavor tag preferred)
// slot 4: CARB ONLY — 主食 slot (rice dish / noodle / dumpling)
//
// Carb dishes ONLY appear in slot 4. This stops 意面/炒饭 from competing with 红烧肉.

// ── Slot preference table — extended for large families (up to 20 slots) ──────
//
// Pattern (repeating after the base 5-slot set):
//   slot 0: 主蛋白（猪/禽/牛/海鲜）
//   slot 1: 次蛋白或荤素搭配
//   slot 2: 纯蔬菜/豆腐
//   slot 3: 汤/清淡
//   slot 4: 主食（唯一碳水槽）
//   slot 5+: 依次：荤→蔬→荤→蔬…（多人场景额外菜）
//
// 注意：主食（carb/staple）永远只出现在 slot 4，其余槽不允许

const SLOT_PREFERRED_CATS: string[][] = [
  ['pork', 'poultry', 'beef', 'seafood'],    // 0: 主蛋白
  ['beef', 'seafood', 'poultry', 'plant'],   // 1: 次蛋白（偏不同品类）
  ['plant'],                                  // 2: 纯蔬菜/豆腐
  ['plant', 'other'],                        // 3: 汤/清淡
  ['carb'],                                  // 4: 主食 ONLY
  ['seafood', 'beef', 'poultry'],            // 5: 第三荤（海鲜/牛/禽）
  ['plant'],                                  // 6: 第四蔬菜
  ['pork', 'poultry', 'beef'],              // 7: 第四荤
  ['plant', 'other'],                        // 8: 第五蔬或汤
  ['seafood', 'beef'],                       // 9: 轻奢荤
  ['plant'],                                  // 10: 蔬菜
  ['poultry', 'pork'],                       // 11: 荤
  ['plant'],                                  // 12: 蔬菜
  ['seafood'],                               // 13: 海鲜
  ['plant'],                                  // 14: 蔬菜
  ['beef', 'poultry'],                       // 15: 荤
  ['plant'],                                  // 16: 蔬菜
  ['seafood', 'pork'],                       // 17: 荤
  ['plant'],                                  // 18: 蔬菜
  ['poultry', 'beef'],                       // 19: 荤
];

// The ONLY carb slot is slot 4 — all others block carb/staple dishes
// For dishesPerDay > 5, slots 5+ are blocked from carb too
const STAPLE_SLOT = 4;
function isCarb(slot: number): boolean { return slot === STAPLE_SLOT; }
// Build blocked set dynamically based on max slots we'd ever use
const CARB_BLOCKED_SLOTS = new Set(
  Array.from({ length: 20 }, (_, i) => i).filter(i => i !== STAPLE_SLOT)
);

// ── Small-family slot template (≤3 dishes/day): guarantee soup in last slot ──
// Standard 5-slot template puts soup in slot 3, but for 1-2 person families
// (dishesPerDay=3) slot 3 never exists. This template ensures soup appears.
const SLOT_PREFERRED_CATS_SMALL: string[][] = [
  ['pork', 'poultry', 'beef', 'seafood'],  // 0: 主蛋白
  ['plant'],                                // 1: 蔬菜
  ['plant', 'other'],                       // 2: 汤（soup 在这里出现）
];

function generateWeekPlan(
  poolRaw: any[],
  profile: { hometown_cuisine: string | null; dietary_goal: string | null; taste_pref: string | null },
  prefScores: Record<string, number>,
  recentIds: Map<string, number>,
  dishesPerDay = 5,
  kidSlots = 0,
  spiceBoost = 0,
  ageGroup?: string | null,
  healthPrefs?: { preferLowSodium: boolean; preferLowSugar: boolean; avoidHighPurine: boolean },
  familyPrefs?: ReturnType<typeof getFamilyMenuPrefs>,
  helperMode = false,
  adults = 2,
  kids = 0,
  // ── Smell 1 阶段 2: 9-axis 参数 + breakfast/fruit pool 注入 ──
  humidity = 75,
  solarTerm: SolarTerm | null = null,
  hasXiaomei = false,
  breakfastPool: any[] = [],   // meal_type='breakfast' fetched at hook layer
  fruitPool: any[] = [],       // course_type='fruit' fetched at hook layer
  // ── §B (TICKET-015) axis 26 入参 ──
  homeInventoryItems: Set<string> | undefined = undefined,
  // ── §C (TICKET-015) deterministic candidate seed ──
  // undefined → Math.random()（保持原非确定行为）
  // number    → mulberry32(seed)，ChatAgent.proposalEngine 拿 3 个 deterministic 候选
  seed: number | undefined = undefined,
  // ── §A (TICKET-043 Smell 1 阶段 4) cross-week fatigue 输入 ──
  // dishId → 过去 4 周累计出现次数；hook 层 prepare 时 fetch user_weekly_menus
  // 近 4 周聚合好后传入。候选 filter ≥ CROSS_WEEK_FATIGUE_THRESHOLD hard-block。
  fatigueByDishId: Map<string, number> | undefined = undefined,
): WeeklyMenu {
  // Pick PRNG once per generateWeekPlan invocation; all 4 weightedRandom call
  // sites (dinner main / kidDishes / lunch / per-member lunch meat) share the
  // same stream so the same seed yields identical output across runs.
  const rng: () => number = seed !== undefined ? mulberry32(seed) : Math.random;
  // 粥 / 稀饭 are breakfast-only in Chinese cuisine — user direction
  // 2026-05-17. Stripped once at function entry so every lunch + dinner
  // pool below inherits the ban (the previous per-slot filter only ran
  // on the dinner-staple slot, leaking porridge into lunch staple +
  // dinner subpools). Breakfast generation runs in useSupabaseMenu with
  // its own breakfast pool, so this filter doesn't affect 早餐 picks.
  const pool = poolRaw.filter(d => {
    const t = (d.title_zh ?? d.title ?? '');
    return !t.includes('粥') && !t.includes('稀饭');
  });
  const weekStart = getMondayISO();
  const days: WeeklyDayMenu[] = [];
  const usedIds = new Set<string>();
  // Track lunch picks across all 7 days so the same staple/veggie/soup
  // doesn't repeat in another lunch (previously 干炒牛河 / 日式味噌汤 etc.
  // showed up 3× per week because lunch only filtered by today's dinner).
  const lunchUsedIds = new Set<string>();
  const pickedIngredients: string[] = [];
  const pickedTitleKeywords: string[] = [];   // weekly keyword tracker
  // §C1 (TICKET-032 / SPEC §3.1): cross-day title-keyword dedup window.
  // weekKwLastDay maps keyword → 最近一次 picked 的 dayIndex；scoreForWeek
  // 候选 filter 阶段命中近 DEDUP_WINDOW_DAYS 天 keyword → hard-block。
  // 与同日 dayTitleKeywords 互补：同日仍 hard-block（更严），跨日窗内 hard-block，
  // 窗外仍走 axis 9 -0.65 软扣（兜底，避免 hard-block 让 slot 空）。
  const weekKwLastDay = new Map<string, number>();
  // Low-carb / keto: drops the staple slot in dinner AND lunch.
  const lowCarb = localStorage.getItem('nutri_low_carb') === '1';

  // Small-family template is only for the smallest tables (≤3 dishes total),
  // where physical slot count can't fit the 4 macros (肉/海鲜/蔬菜/汤).
  // For 4+ dishes we always use the standard 4-slot template — even when the
  // family has kids — and bake kid-friendly bias into the scoring instead of
  // sacrificing a slot. Previously kidSlots=1 with dishesPerDay=4 gave only
  // 3 adult slots and the small template's meat/plant/soup pattern (no
  // seafood at all).
  const useSmallTemplate = dishesPerDay <= 3;
  const adultSlots = useSmallTemplate
    ? Math.max(dishesPerDay - kidSlots, 1)
    : dishesPerDay;
  // For ≥4-dish families with kids, the dedicated kid slot disappears; we
  // overlay kid-friendly preferences inside scoreForWeek instead.
  const effectiveKidSlots = useSmallTemplate ? kidSlots : 0;

  // Track weekly category counts for hard caps (scale with dishesPerDay)
  const MAX_PER_CATEGORY = getMaxPerCategory(dishesPerDay);
  const weeklyCatCounts: Record<string, number> = {};

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    // 周六周日不生成菜单 (user-confirmed 2026-05-17)：让用户周末出门换换
    // 口味。Home 在周末展示"外食营养报告" (Phase #4) 而不是空菜单。
    // 0-4 = Mon-Fri, 5 = Sat, 6 = Sun.
    if (dayIndex >= 5) continue;

    // Per-day headcount override. If the user toggled who's eating on a
    // specific day (e.g. only the couple on Wed), this day's adults/kids
    // differ from the week-level defaults. Otherwise falls back to the
    // function-level adults/kids passed in by the caller.
    const dayHc = getDayHeadcount(dayIndex);
    const dayAdults = dayHc.adults || adults;
    const dayKids   = dayHc.kids   || kids;
    const dayDishesPerDay = calcDishCount('晚餐', dayAdults, dayKids, loadCuisineMode());
    const dayKidSlots = dayKids > 0 ? Math.min(dayKids, 2) : 0;
    const dayUseSmallTemplate = dayDishesPerDay <= 3;
    const dayAdultSlots = dayUseSmallTemplate
      ? Math.max(dayDishesPerDay - dayKidSlots, 1)
      : dayDishesPerDay;
    const dayEffectiveKidSlots = dayUseSmallTemplate ? dayKidSlots : 0;

    const dayDishes: any[] = [];
    const dayIngredients: string[] = [];
    // Same-day title-keyword hard dedup. Without this, the -0.65 soft penalty
    // in scoreForWeek wasn't enough to stop 上汤娃娃菜 + 虾米娃娃菜 landing
    // in the same dinner. Hard-block any candidate whose title keyword has
    // already been picked today.
    const dayTitleKeywords: string[] = [];
    // Same-day cook-method dedup (2026-05-17, high-end chef positioning).
    // 4 道炒菜 同一桌读起来单调; the lunch template already enforces method
    // variety via pickWithMethodVariety. We mirror that for dinner by
    // applying a soft penalty inside the scoring loop below.
    const dayCookMethods: string[] = [];

    // ── Per-member main-slot allocation (一人一菜) ───────────────────
    // When 2+ members are home with distinct goals (e.g. wife 备孕 +
    // husband 增肌), score each main protein slot for ONE member only
    // so the dishes pair to people. Soup / veggie / staple slots stay
    // shared. Round-robin: slot 0 → member 0, slot 1 → member 1.
    const dayHomeMembers = familyPrefs?.homeMembers ?? [];
    const memberMainSlots: Record<number, typeof dayHomeMembers[number] | null> = {};
    if (dayHomeMembers.length >= 2 && !dayUseSmallTemplate) {
      memberMainSlots[0] = dayHomeMembers[0];
      memberMainSlots[1] = dayHomeMembers[1] ?? dayHomeMembers[0];
      // Extra members (3+) cycle back to slot 0/1 if there are protein slots
      // for them; otherwise their goals only flow through the shared
      // combined goalWeights below.
    }

    // Track allergen dishes per day (soft-cap at 25% of daily slots)
    let allergenDishCountToday = 0;
    const maxAllergenToday = familyPrefs?.maxAllergenDishesPerDay ?? 1;

    // Helper mode: track level-3 count per day (hard cap = 1)
    let level3CountToday = 0;

    for (let slot = 0; slot < dayAdultSlots; slot++) {
      const slotTemplate = dayUseSmallTemplate ? SLOT_PREFERRED_CATS_SMALL : SLOT_PREFERRED_CATS;
      const preferredCats = slotTemplate[slot] ?? [];

      // For small families: slot 2 is the soup slot; otherwise slot 3
      const isSoupSlot = dayUseSmallTemplate ? slot === 2 : slot === 3;

      // Build scored candidates for this slot
      const allCandidates = pool
        .filter(d => !usedIds.has(d.id) && !dayDishes.some(p => p.id === d.id))
        .filter(d => {
          // Same-day title-keyword hard dedup (e.g. no 2× 娃娃菜 per dinner).
          const kw = extractTitleKeyword(d.title_zh ?? d.title ?? '');
          if (kw && dayTitleKeywords.includes(kw)) return false;
          // §C1 cross-day dedup (TICKET-032)：近 DEDUP_WINDOW_DAYS 天命中
          // 相同 keyword → hard-block。窗外回退到 axis 9 软扣。
          if (kw) {
            const lastDay = weekKwLastDay.get(kw);
            if (lastDay !== undefined && dayIndex - lastDay < DEDUP_WINDOW_DAYS) return false;
          }
          // §A (TICKET-043 Smell 1 阶段 4) cross-week fatigue hard-block：
          // 该 dish_id 过去 4 周累计出现 ≥ CROSS_WEEK_FATIGUE_THRESHOLD → 弃用。
          // dishId 强相等比较，避开"同 kw 不同 dish"漏网（如鸡腿 5 种做法）。
          if (fatigueByDishId) {
            const cnt = fatigueByDishId.get(d.id) ?? 0;
            if (cnt >= CROSS_WEEK_FATIGUE_THRESHOLD) return false;
          }

          // 粥 (congee) is a breakfast/light-meal staple, not a dinner main.
          // 5 dishes leak in with meal_type=dinner/all; ban them from the
          // dinner staple slot regardless.
          const title = (d.title_zh ?? d.title ?? '');
          if (title.includes('粥') || title.includes('稀饭')) return false;

          const cat = ingCategory(d.main_ingredient ?? 'other');
          // Use DB course_type when available for more accurate classification
          const courseType: string = d.course_type ?? '';

          // Determine if dish is a staple (use course_type first, fallback to ing cat)
          const isStaple = courseType === 'staple' || cat === 'carb';
          // Soup/dessert: skip from regular menu slots (soup goes to soup slot only)
          const isSoup = courseType === 'soup';
          const isDessert = courseType === 'dessert';

          // Desserts excluded from weekly dinner menu
          if (isDessert) return false;

          // Hard weekly cap (use cat for cap tracking)
          const cap = MAX_PER_CATEGORY[cat] ?? 7;
          if ((weeklyCatCounts[cat] ?? 0) >= cap) return false;

          // Staple dishes ONLY allowed in slot 4 (standard template).
          // EXCEPT when lowCarb is on: ban staples entirely, and let slot 4
          // accept main_protein / veggie instead (relax the "slot 4 must
          // be staple" rule). User on keto would otherwise lose 1 dish.
          if (!dayUseSmallTemplate) {
            if (lowCarb && isStaple) return false;
            if (!lowCarb && isStaple && CARB_BLOCKED_SLOTS.has(slot)) return false;
            if (!lowCarb && slot === 4 && !isStaple) return false;
          } else {
            // Small template: no staple slot — block staple entirely
            if (isStaple) return false;
          }

          // Soup slot: only allow soups (or light dishes if no soup available)
          if (isSoupSlot && !isSoup && cat !== 'plant' && cat !== 'other') return false;
          // Soups ONLY belong in the dedicated soup slot — block from every
          // other slot in both templates. Previously slot 2 (veggie) wasn't
          // blocked, so e.g. 蛋花汤 (course=soup, main=egg/plant) could win
          // the veggie slot, resulting in two soups per day.
          if (!dayUseSmallTemplate && isSoup && slot !== 3) return false;
          if (dayUseSmallTemplate  && isSoup && slot !== 2) return false;

          return true;
        })
        .map(d => {
          // Helper mode hard cap: skip level-3 dish if already have one today
          if (helperMode && level3CountToday >= 1 && (d.execution_level ?? 2) === 3) return null;

          // Mixed-spice arrangement: when the family has both a spicy-loving
          // adult (profile.taste_pref) AND a kid, the global kid taste
          // penalty would zero out every spicy candidate. Instead, allow
          // spicy on the adult-facing main_protein slots (0/1) while
          // keeping veggie/soup/staple slots mild.
          const mixedSpice = dayKids > 0 && profile.taste_pref === 'spicy';
          const slotSpiceBoost = mixedSpice
            ? (slot <= 1 ? 0.4 : -0.2)
            : spiceBoost;

          let score = scoreForWeek({
            dish: d, profile, prefScores, recentIds,
            pickedIngredients: [...pickedIngredients, ...dayIngredients],
            pickedTitleKeywords,
            dayIndex,
            spiceBoost: slotSpiceBoost,
            ageGroup,
            healthPrefs,
            helperMode,
            hasPregnant: familyPrefs?.hasPregnant ?? false,
            humidity, solarTerm, hasXiaomei, mealTime: '晚餐',
            homeInventoryItems,
          });

          // ── Family multi-goal scoring ───────────────────────────────────
          // Two regimes:
          //   (a) Main protein slots (slot 0/1) when a member is assigned:
          //       score by THAT member's goals only, amplified by 1.5x so
          //       the "this slot belongs to wife" signal beats the shared
          //       balanced score. Yields one-dish-per-person pairings.
          //   (b) Other slots: average across all members like before.
          if (familyPrefs && Object.keys(familyPrefs.goalWeights).length > 0) {
            const assignedMember = memberMainSlots[slot];
            if (assignedMember && assignedMember.goals.length > 0) {
              const memberWeights = Object.fromEntries(
                assignedMember.goals.map(g => [g, 1.0])
              ) as typeof familyPrefs.goalWeights;
              score += familyGoalScore(d, memberWeights, assignedMember.goals.length) * 1.5;
            } else {
              const totalWeight = Object.values(familyPrefs.goalWeights).reduce((a, b) => a + b, 0);
              score += familyGoalScore(d, familyPrefs.goalWeights, totalWeight);
            }
          }

          // ── Allergen soft-cap (main_ingredient / title only — not condiments) ──
          if (familyPrefs && familyPrefs.allergyMembers.length > 0) {
            const isAllergenDish = familyPrefs.allergyMembers.some(({ allergies }) =>
              allergies.some(a => dishTriggersAllergy(d, a))
            );
            if (isAllergenDish) {
              // Quota full → strong penalty so this dish is very unlikely to be picked
              if (allergenDishCountToday >= maxAllergenToday) {
                score -= 1.5;
              } else {
                // Quota not full → mild penalty (still less preferred than allergen-free)
                score -= 0.20;
              }
            }
          }

          // Slot affinity bonus — from ingredient category
          const cat = ingCategory(d.main_ingredient ?? 'other');
          if (preferredCats.includes(cat)) score += 0.22;

          // Additional slot affinity from DB course_type (more accurate)
          const ct: string = d.course_type ?? '';
          if (slot === 0 && ct === 'main_protein') score += 0.20;
          if ((slot === 1 || slot === 2) && ct === 'veggie_dish' && !isSoupSlot) score += 0.18;
          if (isSoupSlot && ct === 'soup') score += 0.30;    // strong pull to soup slot
          if (isSoupSlot && ct === 'veggie_dish') score += 0.10;

          // ── Strict daily macro coverage ───────────────────────────────────
          // Each day should hit 肉 / 海鲜 / 蔬菜 / 汤 (and 主食 for ≥5 slots),
          // so we apply heavy penalties to wrong-category dishes per slot. The
          // penalty is graceful — if a category has no candidates (e.g. user
          // has seafood allergy, no seafood in pool), the algo falls through
          // to other categories rather than producing an empty slot.
          if (!dayUseSmallTemplate && dayDishesPerDay >= 4) {
            // slot 0: 肉 (pork/beef/poultry) — block seafood here so it has
            // its own slot below, and block plant so slot 0 isn't a salad.
            if (slot === 0 && (cat === 'seafood' || cat === 'plant' || cat === 'other')) {
              score -= 2.5;
            }
            // slot 1: 海鲜 (seafood) — strong pull
            if (slot === 1 && cat !== 'seafood') score -= 2.5;
            // slot 2: 蔬菜 (plant) — strong pull
            if (slot === 2 && cat !== 'plant') score -= 2.5;
            // slot 3: 汤 (course_type='soup') — strong pull
            if (slot === 3 && ct !== 'soup') score -= 2.5;
            // slot 4 (staple, only present when dishesPerDay≥5) already
            // hard-filtered by isStaple check above.
          }

          // Same-category-in-same-day penalty (prevents e.g. two veggie dishes in slot 1+2)
          const sameCatInDay = dayIngredients.filter(i => ingCategory(i) === cat).length;
          score -= sameCatInDay * 0.45;

          // Same cook-method-in-same-day damp (high-end chef positioning).
          // "四道炒太单调" — when today already has stir-fry/braise/etc, the
          // next slot should prefer a different technique. Soup slot is
          // exempt because all soups are 'boil' / 'stew' by definition.
          if (!isSoupSlot && d.cook_method && dayCookMethods.includes(d.cook_method)) {
            const sameMethodCount = dayCookMethods.filter(m => m === d.cook_method).length;
            score -= sameMethodCount * 0.30;
          }

          // ── Same-protein soup block ───────────────────────────────────────
          // If slot 0 already picked a protein (pork/beef/poultry/seafood),
          // strongly penalise soups that share the same protein category.
          // This prevents 红烧排骨 + 排骨汤 on the same day.
          if (isSoupSlot && ct === 'soup' && dayIngredients.length > 0) {
            const slot0Cat = ingCategory(dayIngredients[0] ?? 'other');
            const isProtein = ['pork','beef','poultry','seafood'].includes(slot0Cat);
            if (isProtein && cat === slot0Cat) score -= 0.80;
          }

          // Soup slot: prefer light-flavored dishes
          if (isSoupSlot && (d.flavor_tags ?? []).includes('light')) score += 0.15;

          return { dish: d, score };
        })
        .filter((x): x is { dish: any; score: number } => x !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);

      if (allCandidates.length === 0) break;

      const picked = weightedRandom(allCandidates, 1, rng)[0]?.dish;
      if (!picked) break;

      dayDishes.push(picked);
      dayIngredients.push(picked.main_ingredient ?? 'other');
      usedIds.add(picked.id);
      if (picked.cook_method) dayCookMethods.push(picked.cook_method);

      // Track level-3 count for helper mode hard cap
      if (helperMode && (picked.execution_level ?? 2) === 3) level3CountToday++;

      // Track allergen dish count for today's soft-cap
      if (familyPrefs && familyPrefs.allergyMembers.length > 0) {
        const isAllergen = familyPrefs.allergyMembers.some(({ allergies }) =>
          allergies.some(a => dishTriggersAllergy(picked, a))
        );
        if (isAllergen) allergenDishCountToday++;
      }

      // Track title keyword for weekly dedup + same-day hard dedup
      const kw = extractTitleKeyword(picked.title_zh ?? picked.title ?? '');
      if (kw) {
        pickedTitleKeywords.push(kw);
        dayTitleKeywords.push(kw);
        // §C1 record latest dayIndex for cross-day window check.
        weekKwLastDay.set(kw, dayIndex);
      }

      const cat = ingCategory(picked.main_ingredient ?? 'other');
      weeklyCatCounts[cat] = (weeklyCatCounts[cat] ?? 0) + 1;
    }

    // ── Kid-dedicated dish slots ──────────────────────────────────────────────
    // Scored separately with child-friendly criteria: no spicy, prefer light/sweet.
    // They're added to the same day.dishes array so the whole table shares them.
    const kidDishes: any[] = [];
    if (dayEffectiveKidSlots > 0) {
      const kidUsedIds = new Set([...usedIds, ...dayDishes.map(d => d.id)]);
      const kidCandidates = pool
        .filter(d => !kidUsedIds.has(d.id))
        .filter(d => !(d.flavor_tags ?? []).includes('spicy'))          // hard: no spicy
        .filter(d => !['dessert', 'soup', 'staple'].includes(d.course_type ?? ''))
        .map(d => {
          let s = scoreForWeek({
            dish: d, profile, prefScores, recentIds,
            pickedIngredients: [...pickedIngredients, ...dayIngredients],
            pickedTitleKeywords,
            dayIndex,
            spiceBoost: -1.0,   // extra spicy penalty for kid pass
            ageGroup: '00后',   // always use child age mods
            healthPrefs,
            hasPregnant: familyPrefs?.hasPregnant ?? false,
            humidity, solarTerm, hasXiaomei, mealTime: '晚餐',
            homeInventoryItems,
          });
          const flavors: string[] = d.flavor_tags ?? [];
          if (flavors.includes('sweet'))  s += 0.25;
          if (flavors.includes('light'))  s += 0.20;
          if (flavors.includes('savory')) s += 0.10;
          return { dish: d, score: s };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      weightedRandom(kidCandidates, dayEffectiveKidSlots, rng).forEach(c => {
        kidDishes.push(c.dish);
        const kw = extractTitleKeyword(c.dish.title_zh ?? c.dish.title ?? '');
        if (kw) pickedTitleKeywords.push(kw);
        const cat = ingCategory(c.dish.main_ingredient ?? 'other');
        weeklyCatCounts[cat] = (weeklyCatCounts[cat] ?? 0) + 1;
      });
    }

    // Track for next day's scoring
    dayIngredients.forEach(ing => pickedIngredients.push(ing));

    // ── Generate lunch — scales with headcount ─────────────────────────
    // Template by total target N (from calcDishCount('午餐')):
    //   N=2: 主食 + 汤
    //   N=3: 主食 + 配菜 + 汤
    //   N=4: 主食 + 配菜 + 主菜(肉) + 汤
    //   N=5: 主食 + 配菜×2 + 主菜 + 汤
    //   N=6: 主食 + 配菜×2 + 主菜×2 + 汤
    // Larger N follow the same N-2 split between veggie and meat.
    // Low-carb already pulled in at function scope (line above).
    const dinnerIds = new Set(dayDishes.map(d => d.id));
    const lunchTarget = calcDishCount('午餐', adults, kids, loadCuisineMode());
    const lunchPlan = (() => {
      // Low-carb / keto: drop the staple slot, push the budget into protein.
      if (lowCarb) {
        if (lunchTarget <= 1) return { staple: 0, veggie: 0, meat: 1, soup: 0 };
        if (lunchTarget === 2) return { staple: 0, veggie: 0, meat: 1, soup: 1 };
        if (lunchTarget === 3) return { staple: 0, veggie: 1, meat: 1, soup: 1 };
        if (lunchTarget === 4) return { staple: 0, veggie: 1, meat: 2, soup: 1 };
        const rest = lunchTarget - 1; // 1 soup + (rest) split veggie/meat, meat-heavy
        const meat = Math.ceil(rest / 2);
        const veggie = rest - meat;
        return { staple: 0, veggie, meat, soup: 1 };
      }
      if (lunchTarget <= 1) return { staple: 1, veggie: 0, meat: 0, soup: 0 };
      if (lunchTarget === 2) return { staple: 1, veggie: 0, meat: 0, soup: 1 };
      if (lunchTarget === 3) return { staple: 1, veggie: 1, meat: 0, soup: 1 };
      if (lunchTarget === 4) return { staple: 1, veggie: 1, meat: 1, soup: 1 };
      // N >= 5: 1 staple + 1 soup; split the remaining (N-2) between veggie and meat,
      // favoring veggie by 1 when odd.
      const rest = lunchTarget - 2;
      const veggie = Math.ceil(rest / 2);
      const meat   = rest - veggie;
      return { staple: 1, veggie, meat, soup: 1 };
    })();

    const scoreLunch = (d: any) => {
      let score = scoreForWeek({
        dish: d, profile, prefScores, recentIds,
        pickedIngredients: dayIngredients,
        pickedTitleKeywords,         // share weekly title dedup (no repeating 娃娃菜 in lunch either)
        dayIndex, spiceBoost, ageGroup, healthPrefs,
        hasPregnant: familyPrefs?.hasPregnant ?? false,
        humidity, solarTerm, hasXiaomei, mealTime: '午餐',
        homeInventoryItems,
      });
      if ((d.flavor_tags ?? []).includes('light')) score += 0.15;
      return { dish: d, score };
    };

    // 1. staple pool — rice bowls / pasta / noodles / 炒饭 / 盖饭
    const staplePool = pool
      .filter(d => !usedIds.has(d.id) && !lunchUsedIds.has(d.id))
      .filter(d => {
        const ct = d.course_type ?? '';
        const cat = ingCategory(d.main_ingredient ?? 'other');
        return ct === 'staple' || cat === 'carb';
      })
      .map(scoreLunch)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // 2. veggie / side pool — plant-based, NOT staple and NOT soup
    const veggiePool = pool
      .filter(d => !usedIds.has(d.id) && !lunchUsedIds.has(d.id))
      .filter(d => {
        const ct = d.course_type ?? '';
        const cat = ingCategory(d.main_ingredient ?? 'other');
        if (ct === 'staple' || ct === 'soup' || ct === 'dessert') return false;
        return cat === 'plant' || ct === 'veggie_dish';
      })
      .map(scoreLunch)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // 3. meat / protein pool — main_protein course, non-seafood-only fine
    const meatPool = pool
      .filter(d => !usedIds.has(d.id) && !lunchUsedIds.has(d.id))
      .filter(d => {
        const ct = d.course_type ?? '';
        const cat = ingCategory(d.main_ingredient ?? 'other');
        if (ct === 'staple' || ct === 'soup' || ct === 'dessert' || ct === 'veggie_dish') return false;
        return cat === 'protein' || cat === 'seafood' || ct === 'main_protein';
      })
      .map(scoreLunch)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // 4. soup pool — same as dinner soup pool
    const soupPool = pool
      .filter(d => !usedIds.has(d.id) && !lunchUsedIds.has(d.id))
      .filter(d => (d.course_type ?? '') === 'soup')
      .map(scoreLunch)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Sequential pick with same-day title-keyword hard dedup. weightedRandom
    // doesn't know about already-picked keywords, so picking 2 veggies from
    // veggiePool top could land 上汤娃娃菜 + 虾米娃娃菜. Filter each pool
    // against the running keyword set before its draw.
    const lunchKwsSeen: string[] = [];
    const pickFromPool = (poolArr: { dish: any; score: number }[], n: number): any[] => {
      if (n <= 0) return [];
      const filtered = poolArr.filter(c => {
        const kw = extractTitleKeyword(c.dish.title_zh ?? c.dish.title ?? '');
        return !(kw && lunchKwsSeen.includes(kw));
      });
      const picks = weightedRandom(filtered, n, rng).map(c => enrichRaw(c.dish));
      picks.forEach(d => {
        const kw = extractTitleKeyword(d.title_zh ?? d.title ?? '');
        if (kw) lunchKwsSeen.push(kw);
      });
      return picks;
    };

    const stapleLunch = pickFromPool(staplePool, lunchPlan.staple);
    const veggieLunch = pickFromPool(veggiePool, lunchPlan.veggie);
    // Per-member meat allocation — when ≥ 2 meat slots and ≥ 2 home
    // members each with goals, re-score the meat pool once per member
    // and take that member's top pick. Mirrors the dinner main-slot
    // allocation above. Falls back to combined scoring when conditions
    // aren't met (1 member, 1 meat slot, no goals).
    const meatLunch = (() => {
      if (lunchPlan.meat === 0) return [];
      const homeM = familyPrefs?.homeMembers ?? [];
      if (homeM.length < 2 || lunchPlan.meat < 2) {
        return pickFromPool(meatPool, lunchPlan.meat);
      }
      const picks: any[] = [];
      const taken = new Set<string>();
      for (let mi = 0; mi < lunchPlan.meat; mi++) {
        const member = homeM[mi % homeM.length];
        if (!member?.goals || member.goals.length === 0) {
          const fallback = pickFromPool(meatPool.filter(c => !taken.has(c.dish.id) && !lunchKwsSeen.includes(extractTitleKeyword(c.dish.title_zh ?? '') ?? '')), 1);
          if (fallback[0]) { picks.push(fallback[0]); taken.add(fallback[0].id); }
          continue;
        }
        const memberWeights = Object.fromEntries(member.goals.map(g => [g, 1.0])) as Record<string, number>;
        const rescored = meatPool
          .filter(c => !taken.has(c.dish.id))
          .filter(c => {
            const kw = extractTitleKeyword(c.dish.title_zh ?? '');
            return !(kw && lunchKwsSeen.includes(kw));
          })
          .map(c => ({
            ...c,
            score: c.score + familyGoalScore(c.dish, memberWeights as any, member.goals.length) * 1.5,
          }))
          .sort((a, b) => b.score - a.score);
        const top = weightedRandom(rescored.slice(0, 8), 1, rng).map(c => enrichRaw(c.dish));
        if (top[0]) {
          picks.push(top[0]);
          taken.add(top[0].id);
          const kw = extractTitleKeyword(top[0].title_zh ?? top[0].title ?? '');
          if (kw) lunchKwsSeen.push(kw);
        }
      }
      return picks;
    })();
    const soupLunch   = pickFromPool(soupPool,   lunchPlan.soup);

    // Track lunch picks across days so they can't repeat — also feed title
    // keywords into the weekly dedup tracker, and add IDs to usedIds so a
    // future day's dinner won't re-pick a lunch dish either.
    const allLunchPicks = [...stapleLunch, ...veggieLunch, ...meatLunch, ...soupLunch];
    allLunchPicks.forEach(d => {
      lunchUsedIds.add(d.id);
      usedIds.add(d.id);
      const kw = extractTitleKeyword(d.title_zh ?? d.title ?? '');
      if (kw) pickedTitleKeywords.push(kw);
    });

    const lunchDishes = allLunchPicks;

    // ═══════════════════════════════════════════════════════════════════
    // Smell 1 阶段 2/3: breakfast — pickBreakfastCombo 按 hometown 模板选
    // 一组（保留文化锚定 — 粤式 / 江南 / 北方 / 川式...）。阶段 3 (TICKET-032
    // §C3 / SPEC §3.3) 在 combo 返回后跑 scoreForWeek mealTime='早餐' 二次
    // 排序，把 breakfast 接入主评分流；并把 breakfast title-keyword 注入
    // pickedTitleKeywords + weekKwLastDay → 让 lunch/dinner 跨菜系 dedup 视
    // 野覆盖早餐（豆浆 / 油条等也算跨日 keyword）。
    // ═══════════════════════════════════════════════════════════════════
    const breakfastDishes: SupabaseDish[] = (() => {
      if (breakfastPool.length === 0) return [];
      try {
        const result = pickBreakfastCombo({
          pool: breakfastPool as any,
          dayIndex,
          hometown: profile.hometown_cuisine,
          avoidIngredients: [],
          avoidTags: [],
        });
        const rawDishes = result.dishes ?? [];
        // §C3 scoreForWeek 二次评分（mealTime='早餐'）—— 不改 hometown 模板
        // 选出的 dish 集合，仅按分数稳定排序 + 同步学习信号 / 9-axis 状态
        // 到主评分链。当 combo 内只有 1 个候选时排序无副作用。
        const scored = rawDishes.map((d: any) => ({
          dish: d,
          score: scoreForWeek({
            dish: d, profile, prefScores, recentIds,
            pickedIngredients: [...pickedIngredients, ...dayIngredients],
            pickedTitleKeywords,
            dayIndex,
            spiceBoost,
            ageGroup,
            healthPrefs,
            hasPregnant: familyPrefs?.hasPregnant ?? false,
            humidity, solarTerm, hasXiaomei, mealTime: '早餐',
            homeInventoryItems,
          }),
        }));
        scored.sort((a, b) => b.score - a.score);
        // §C3 注入 breakfast title-keyword 到跨日 dedup 状态
        for (const item of scored) {
          const kw = extractTitleKeyword(item.dish.title_zh ?? item.dish.title ?? '');
          if (kw) {
            pickedTitleKeywords.push(kw);
            // 注意：dayTitleKeywords 不加 — 同日 breakfast 不该禁同日 dinner
            //（家庭文化里 早 油条 / 晚 油条炒青菜 是合理的，不是关键字冲突）
            weekKwLastDay.set(kw, dayIndex);
          }
        }
        return scored.map(s => enrichRaw(s.dish));
      } catch {
        return [];
      }
    })();

    // ═══════════════════════════════════════════════════════════════════
    // Smell 1 阶段 2: fruit — 餐后水果 slot（与晚餐挂钩）。按节气优先 +
    // dayIndex 旋转。fruitPool 由 hook 层 fetch + 节气过滤后传入。
    // ═══════════════════════════════════════════════════════════════════
    const fruitDish: SupabaseDish | undefined = (() => {
      if (fruitPool.length === 0) return undefined;
      // §C2 (TICKET-032 / SPEC §3.2 Smell 1 阶段 3) — fruit pool 进 9-axis：
      // 不再纯 dayIndex 旋转，按 scoreFruit 评分后 weightedRandom 抽样。
      // 仅启用 3 类相关 axis：seasonal（当季 +0.30 / 候补 'all-season'）+
      // sweet flavor（+0.20 童趣偏好）+ health_benefit_tags 学习信号
      // （借用 sigmoid weight × usagePower 与主菜共享学习数据）。
      // 季节优先逻辑保留 — 先 filter 当季 + all-season pool，pool 空再
      // 回退到全 fruitPool（无人为周末跳过水果的情况）。
      const seasonalCol = solarTerm?.season;
      const seasonal = seasonalCol
        ? fruitPool.filter(f => f.seasonal_tag === seasonalCol || f.seasonal_tag === 'all-season')
        : fruitPool;
      const pickFrom = seasonal.length > 0 ? seasonal : fruitPool;

      // 学习段 sigmoid weight 镜像 scoreForWeek axis 4 (同公式)
      const learnedSignals = Object.values(prefScores)
        .filter(v => typeof v === 'number' && v !== 0).length;
      const sigmoidWeight = 0.35 + 1.15 * (1 - Math.exp(-learnedSignals / 15));

      const scoreFruit = (f: any): number => {
        let s = 0;
        // axis A: seasonal alignment
        const tag = (f.seasonal_tag ?? '').toLowerCase();
        if (seasonalCol && tag === seasonalCol) s += 0.30;
        else if (tag === 'all-season') s += 0.05;
        // axis B: sweet flavor bias
        const ft = (f.flavor_tags ?? []) as string[];
        if (ft.includes('sweet')) s += 0.20;
        // axis C: health_benefit_tags 学习信号（仅这一类 tag 适配水果场景）
        const ht = (f.health_benefit_tags ?? []) as string[];
        for (const tag of ht) {
          const col = HEALTH_COL[tag];
          if (col && prefScores[col]) s += usagePower(prefScores[col]) * 0.6 * sigmoidWeight;
        }
        // axis D: recency decay — 同一周内 fruit 别重复（recentIds 复用主菜表）
        const daysSince = recentIds.get(f.id);
        if (daysSince !== undefined) {
          if (daysSince < 7)       s -= 0.40;
          else if (daysSince < 14) s -= 0.20;
        }
        return s;
      };

      const scored = pickFrom.map(f => ({ dish: f, score: scoreFruit(f) }));
      const picks = weightedRandom(scored, 1, rng);
      const raw = picks[0]?.dish;
      return raw ? enrichRaw(raw) : undefined;
    })();

    days.push({
      date: dateForDayIndex(weekStart, dayIndex),
      dayIndex,
      dayLabel: DAY_LABELS[dayIndex],
      dishes: [...dayDishes, ...kidDishes].map(d => enrichRaw(d)),
      lunchDishes,
      breakfastDishes,
      fruitDish,
    });
  }

  return { weekStart, days };
}

// ── Supabase persistence ──────────────────────────────────────────────────────

async function loadFromDB(userId: string, weekStart: string, lsKey: string): Promise<WeeklyMenu | null> {
  // Smell 1 阶段 2: 同时读 dinner / lunch / breakfast / fruit 四类 meal_type
  const [dinnerRes, lunchRes, breakfastRes, fruitRes] = await Promise.all([
    supabase
      .from('user_weekly_menus')
      .select('day_index, dish_ids, swapped_dish_ids, algo_version, cache_key')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('meal_type', 'dinner')
      .order('day_index'),
    supabase
      .from('user_weekly_menus')
      .select('day_index, dish_ids, algo_version, cache_key')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('meal_type', 'lunch')
      .order('day_index'),
    supabase
      .from('user_weekly_menus')
      .select('day_index, dish_ids, algo_version, cache_key')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('meal_type', 'breakfast')
      .order('day_index'),
    supabase
      .from('user_weekly_menus')
      .select('day_index, dish_ids, algo_version, cache_key')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('meal_type', 'fruit')
      .order('day_index'),
  ]);

  if (dinnerRes.error || !dinnerRes.data || dinnerRes.data.length < 7) return null;
  // Force regeneration if lunch rows are missing (e.g. saved before lunch was implemented)
  if (!lunchRes.data || lunchRes.data.length === 0) return null;
  // Smell 1 阶段 2: breakfast rows 缺失 → 强制重生成（旧 v37 cache 没存 breakfast）
  if (!breakfastRes.data || breakfastRes.data.length === 0) return null;

  // Stale check (SPEC §3.1): any row mismatching ALGO_VERSION or current lsKey →
  // regenerate. Catches algo upgrades AND non-algo dimension changes (cuisine /
  // headcount / eating / intent) that are encoded into lsKey but not into the
  // (user_id, week_start, day_index, meal_type) DB primary key.
  const stale = (row: any) =>
    row.algo_version !== ALGO_VERSION || row.cache_key !== lsKey;
  if (dinnerRes.data.some(stale)) return null;
  if (lunchRes.data.some(stale)) return null;
  if (breakfastRes.data.some(stale)) return null;
  if ((fruitRes.data ?? []).some(stale)) return null;

  const allIds = [
    ...dinnerRes.data.flatMap(r => (r.swapped_dish_ids ?? r.dish_ids) as string[]),
    ...(lunchRes.data ?? []).flatMap(r => r.dish_ids as string[]),
    ...(breakfastRes.data ?? []).flatMap(r => r.dish_ids as string[]),
    ...(fruitRes.data ?? []).flatMap(r => r.dish_ids as string[]),
  ];
  const { data: dishRows } = await supabase.from('dishes').select(DISH_FIELDS).in('id', allIds);
  if (!dishRows) return null;

  const dishMap = new Map(dishRows.map(d => [d.id, d]));
  const lunchMap = new Map(
    (lunchRes.data ?? []).map(r => [r.day_index as number, (r.dish_ids as string[])])
  );
  const breakfastMap = new Map(
    (breakfastRes.data ?? []).map(r => [r.day_index as number, (r.dish_ids as string[])])
  );
  const fruitMap = new Map(
    (fruitRes.data ?? []).map(r => [r.day_index as number, (r.dish_ids as string[])])
  );

  const days: WeeklyDayMenu[] = dinnerRes.data
    .filter(row => (row.day_index as number) < 5)   // drop legacy 周末 rows
    .map(row => {
      const dinnerIds   = (row.swapped_dish_ids ?? row.dish_ids) as string[];
      const lunchIds    = lunchMap.get(row.day_index as number) ?? [];
      const breakfastIds = breakfastMap.get(row.day_index as number) ?? [];
      const fruitIds     = fruitMap.get(row.day_index as number) ?? [];
      const dayIndex    = row.day_index as number;
      const fruitRaw    = fruitIds.length > 0 ? dishMap.get(fruitIds[0]) : null;
      return {
        date:            dateForDayIndex(weekStart, dayIndex),
        dayIndex,
        dayLabel:        DAY_LABELS[dayIndex],
        dishes:          dinnerIds.map(id => dishMap.get(id)).filter(Boolean).map(d => enrichRaw(d)),
        lunchDishes:     lunchIds.map(id => dishMap.get(id)).filter(Boolean).map(d => enrichRaw(d)),
        breakfastDishes: breakfastIds.map(id => dishMap.get(id)).filter(Boolean).map(d => enrichRaw(d)),
        fruitDish:       fruitRaw ? enrichRaw(fruitRaw) : undefined,
      };
    });

  return { weekStart, days };
}

async function saveToDB(userId: string, menu: WeeklyMenu, lsKey: string): Promise<void> {
  // Smell 1 阶段 2: 同时写 dinner / lunch / breakfast / fruit 四类
  const rows = menu.days.flatMap(day => [
    {
      user_id:      userId,
      week_start:   menu.weekStart,
      day_index:    day.dayIndex,
      meal_type:    'dinner',
      dish_ids:     day.dishes.map(d => d.id),
      algo_version: ALGO_VERSION,
      cache_key:    lsKey,
    },
    ...(day.lunchDishes.length > 0 ? [{
      user_id:      userId,
      week_start:   menu.weekStart,
      day_index:    day.dayIndex,
      meal_type:    'lunch',
      dish_ids:     day.lunchDishes.map(d => d.id),
      algo_version: ALGO_VERSION,
      cache_key:    lsKey,
    }] : []),
    ...(day.breakfastDishes && day.breakfastDishes.length > 0 ? [{
      user_id:      userId,
      week_start:   menu.weekStart,
      day_index:    day.dayIndex,
      meal_type:    'breakfast',
      dish_ids:     day.breakfastDishes.map(d => d.id),
      algo_version: ALGO_VERSION,
      cache_key:    lsKey,
    }] : []),
    ...(day.fruitDish ? [{
      user_id:      userId,
      week_start:   menu.weekStart,
      day_index:    day.dayIndex,
      meal_type:    'fruit',
      dish_ids:     [day.fruitDish.id],
      algo_version: ALGO_VERSION,
      cache_key:    lsKey,
    }] : []),
  ]);

  await supabase
    .from('user_weekly_menus')
    .upsert(rows, { onConflict: 'user_id,week_start,day_index,meal_type' });
}

// ── Dish history persistence ──────────────────────────────────────────────────

async function saveToHistory(userId: string, menu: WeeklyMenu): Promise<void> {
  if (userId === 'anonymous' || !userId) return;
  const weekStart = new Date(menu.weekStart);
  const rows = menu.days.flatMap(day => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + day.dayIndex);
    const servedDate = date.toISOString().slice(0, 10);
    return day.dishes.map(d => ({
      user_id:     userId,
      dish_id:     d.id,
      served_date: servedDate,
    }));
  });
  if (rows.length === 0) return;
  await supabase
    .from('user_dish_history')
    .upsert(rows, { onConflict: 'user_id,dish_id,served_date' })
    .then(() => {}, () => {/* non-critical */});
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWeeklyMenu(weekOffset: number = 0) {
  const [weeklyMenu, setWeeklyMenu] = useState<WeeklyMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // §A (TICKET-039 Smell 2 阶段 2 自愈触发) — mount 时若 localStorage 关键
  // profile 字段任一缺失 → 拉 DB syncProfileFromDB 兜底。避免"DB 有数据
  // 但本地空 → 算法误判新用户"的冷启动失败。fire-and-forget；DB 拉到后
  // syncProfileFromDB 内部会 setItem localStorage，下次 nutri-prefs-changed
  // 事件触发 menu 重生。
  useEffect(() => {
    const hasHometown = !!localStorage.getItem('userHometown');
    const hasGoal     = !!localStorage.getItem('userDiet') ||
      (() => { try { return !!(JSON.parse(localStorage.getItem('quickPrefs') ?? '{}') as { goal?: string }).goal; } catch { return false; } })();
    const hasTaste    = !!localStorage.getItem('userTaste');
    if (!hasHometown || !hasGoal || !hasTaste) {
      syncProfileFromDB(getUserId()).catch(() => {/* offline-tolerant */});
    }
  }, []);

  // Re-generate when user updates preferences or eating selection changes
  useEffect(() => {
    const handler = () => {
      const weekStart = getWeekStartISO(weekOffset);
      localStorage.removeItem(getCacheKey(weekStart));
      setWeeklyMenu(null);
      setRefreshKey(k => k + 1);
    };
    window.addEventListener('nutri-prefs-changed', handler);
    window.addEventListener('nutri-intent-bias-changed', handler);
    return () => {
      window.removeEventListener('nutri-prefs-changed', handler);
      window.removeEventListener('nutri-intent-bias-changed', handler);
    };
  }, [weekOffset]);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      setLoading(true);

      const weekStart = getWeekStartISO(weekOffset);
      const userId    = getUserId() ?? 'anonymous';

      // 1. Try DB cache first — DB columns (algo_version, cache_key) are the
      // sole stale signal. loadFromDB returns null when any row mismatches the
      // current ALGO_VERSION or current lsKey (cuisine/headcount/eating/intent
      // dimensions are encoded into lsKey via getCacheKey).
      const { dishesPerDay, kidSlots, adults: hcAdults, kids: hcKids } = calcDishesForToday();
      const lsKey = getCacheKey(weekStart);

      const cached = await loadFromDB(userId, weekStart, lsKey);
      if (cached && !cancelled) {
        setWeeklyMenu(cached);
        setLoading(false);
        return;
      }

      // 2. Try localStorage cache — key includes headcount + eating selection
      const lsRaw = localStorage.getItem(lsKey);
      if (lsRaw) {
        try {
          const parsed = JSON.parse(lsRaw) as WeeklyMenu;
          if (!cancelled) {
            setWeeklyMenu(parsed);
            setLoading(false);
            return;
          }
        } catch { /* corrupt cache, regenerate */ }
      }

      // 3. Generate fresh plan
      try {
        // Read user preferences (quickPrefs → legacy fallback)
        const basePrefs = getUserPrefs();

        // Merge hard filters from all eating members (union of avoids, most restrictive spice)
        const eatingNow = getEatingMembers(); // reads nutri_family_members filtered by nutri_eating_today
        const extraIngredients: string[] = [];
        const extraTags: string[] = [];
        let extraVegetarian = false;
        let mostRestrictiveSpice = basePrefs.spiceBoost ?? 0;

        for (const m of eatingNow) {
          const needs: string[] = (m as any).needs ?? [];
          if (needs.includes('不辣'))    mostRestrictiveSpice = Math.min(mostRestrictiveSpice, -0.80);
          if (needs.includes('不吃海鲜')) extraIngredients.push('seafood','fish','shrimp','crab','squid','scallop','clam','salmon','cod','seabass','hairtail');
          if (needs.includes('忌牛羊肉')) extraIngredients.push('beef','lamb','mutton');
          if (needs.includes('花生过敏')) extraTags.push('peanut');
          if (needs.includes('忌乳制品')) extraTags.push('dairy','milk');
          if (needs.includes('素食'))    extraVegetarian = true;
        }

        const localPrefs = {
          ...basePrefs,
          spiceBoost:       mostRestrictiveSpice,
          avoidIngredients: [...new Set([...basePrefs.avoidIngredients, ...extraIngredients])],
          avoidTags:        [...new Set([...basePrefs.avoidTags, ...(mostRestrictiveSpice <= -0.80 ? ['spicy'] : []), ...extraTags])],
          vegetarianOnly:   basePrefs.vegetarianOnly || extraVegetarian,
        };

        // Fetch dish pool (dinner + all-type, limit 400).
        // Explicit column list excludes embedding (vector(768) ≈ 8KB/row).
        let poolQuery = supabase
          .from('dishes')
          .select(DISH_FIELDS)
          .or('meal_type.in.(lunch,dinner,all),meal_type.is.null')
          .limit(400);

        // Vegetarian-only filter at DB level (optimization)
        if (localPrefs.vegetarianOnly) {
          poolQuery = poolQuery.eq('is_vegan', true);
        }

        // Cuisine pre-filter — same idea as useRecommendDishes. Without it
        // the weekly menu's lunch slots could pick 2 western + 1 chinese,
        // then Home's chinese-mode display would strip 2 → user sees 1 dish.
        poolQuery = applyCuisineFilter(poolQuery, loadCuisineMode());

        const { data: rawPool } = await poolQuery;

        if (!rawPool || cancelled) { setLoading(false); return; }

        // Keyword safety nets for avoid options where DB tags may be missing
        const DAIRY_KEYWORDS = ['芝士', '奶酪', '奶油', '黄油', '牛奶', '乳酪', 'cheese', 'cream', 'butter', 'milk', 'dairy'];
        const avoidDairy = localPrefs.avoidTags.includes('dairy') || localPrefs.avoidTags.includes('milk');

        // Apply hard filters from user prefs
        const pool = rawPool.filter(dish => {
          // Tag exclusion
          if (localPrefs.avoidTags.length > 0) {
            const allTags = [...(dish.flavor_tags ?? []), ...(dish.health_benefit_tags ?? [])];
            if (allTags.some((t: string) => localPrefs.avoidTags.includes(t))) return false;
          }
          // Ingredient exclusion
          if (localPrefs.avoidIngredients.length > 0 && dish.main_ingredient) {
            if (localPrefs.avoidIngredients.includes(dish.main_ingredient)) return false;
          }
          // Dairy keyword safety net (catches dishes missing the dairy tag in DB)
          if (avoidDairy) {
            const titleText = ((dish.title_zh ?? '') + ' ' + (dish.title_en ?? '') + ' ' + (dish.description_zh ?? '')).toLowerCase();
            if (DAIRY_KEYWORDS.some(kw => titleText.includes(kw.toLowerCase()))) return false;
          }
          return true;
        });

        // Fetch user profile
        const { data: profileRow } = await supabase
          .from('user_profiles')
          .select('hometown_cuisine, dietary_goal, taste_pref, age_group')
          .eq('id', userId)
          .single()
          .then(r => r, () => ({ data: null }));

        const profile = {
          hometown_cuisine: (profileRow as any)?.hometown_cuisine ?? null,
          dietary_goal:     (profileRow as any)?.dietary_goal ?? localPrefs.dietaryGoal,
          taste_pref:       (profileRow as any)?.taste_pref ?? localPrefs.tastePref,
          age_group:        (profileRow as any)?.age_group ?? null,
        };

        // Fetch recent dish history (last 30 days)
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { data: history } = await supabase
          .from('user_dish_history')
          .select('dish_id, served_date')
          .eq('user_id', userId)
          .gte('served_date', since.toISOString().slice(0, 10));

        const recentIds = new Map<string, number>();
        const today = new Date();
        (history ?? []).forEach((row: any) => {
          const days = Math.floor(
            (today.getTime() - new Date(row.served_date).getTime()) / 86400000
          );
          const existing = recentIds.get(row.dish_id);
          if (existing === undefined || days < existing) recentIds.set(row.dish_id, days);
        });

        // Fetch feedback scores
        const { data: scoreRow } = await supabase
          .from('user_preference_scores')
          .select('*')
          .eq('user_id', userId)
          .single()
          .then(r => r, () => ({ data: null }));

        const prefScores: Record<string, number> = (scoreRow as any) ?? {};

        const spiceBoost = localPrefs.spiceBoost ?? 0;
        const healthPrefs = {
          preferLowSodium: localPrefs.preferLowSodium,
          preferLowSugar:  localPrefs.preferLowSugar,
          avoidHighPurine: localPrefs.avoidHighPurine,
        };
        const familyPrefs = getFamilyMenuPrefs(dishesPerDay);
        const helperMode = localStorage.getItem('nutri_has_helper') === 'true';

        // ── Smell 1 阶段 2: 9-axis context + breakfast/fruit pool fetch ──
        // CEO 决策 2026-05-19：保留 humidity / solarTerm / xiaomei / spiceBoost
        // 4 个特殊维度并入 generateWeekPlan，删 useRecommendDishes 链路。
        const humidity = parseFloat(localStorage.getItem('current_humidity') ?? '75');
        const solarTerm = getCurrentSolarTerm();
        const hasXiaomei = localStorage.getItem('has_xiaomei_robot') === 'true';

        // breakfast 池：meal_type='breakfast'，hardFilter 同 dinner 那套
        // avoidTags / avoidIngredients / dairy keyword safety net。
        const { data: breakfastRaw } = await supabase
          .from('dishes')
          .select(DISH_FIELDS)
          .eq('meal_type', 'breakfast')
          .limit(200);
        const breakfastPool = (breakfastRaw ?? []).filter(dish => {
          if (localPrefs.avoidTags.length > 0) {
            const allTags = [...(dish.flavor_tags ?? []), ...(dish.health_benefit_tags ?? [])];
            if (allTags.some((t: string) => localPrefs.avoidTags.includes(t))) return false;
          }
          if (localPrefs.avoidIngredients.length > 0 && dish.main_ingredient) {
            if (localPrefs.avoidIngredients.includes(dish.main_ingredient)) return false;
          }
          if (avoidDairy) {
            const titleText = ((dish.title_zh ?? '') + ' ' + (dish.title_en ?? '') + ' ' + (dish.description_zh ?? '')).toLowerCase();
            if (DAIRY_KEYWORDS.some(kw => titleText.includes(kw.toLowerCase()))) return false;
          }
          return true;
        });

        // fruit 池：course_type='fruit'（中西通用，不走 cuisine filter）
        const { data: fruitRaw } = await supabase
          .from('dishes')
          .select(DISH_FIELDS)
          .eq('course_type', 'fruit')
          .limit(30);
        const fruitPool = (fruitRaw ?? []).filter(dish => {
          if (localPrefs.avoidTags.length > 0) {
            const allTags = [...(dish.flavor_tags ?? []), ...(dish.health_benefit_tags ?? [])];
            if (allTags.some((t: string) => localPrefs.avoidTags.includes(t))) return false;
          }
          return true;
        });

        // ── §B (TICKET-041) axis 26: 切到 usePantry 统一读 + 7 日 missing 反向 ──
        // 数据源由 SPEC_pantry_v1 §5 切到 usePantry.loadPantryItems：
        //   - DB user_pantry_items WHERE in_pantry=true → merge LS → Set
        //   - Forward-compat：DB 未上线 silent fallback 同日 LS key
        // 7 日 missing_ingredient feedback 反向剔除保留（SPEC §4 实时模式
        // 落地前的兜底；042 + UI VerifyIngredients markPantry 完工后此段
        // 反向剔除将由 DB in_pantry=false 自动覆盖）。
        const inventorySet = await loadPantryItems(userId);

        if (inventorySet.size > 0) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          try {
            const { data: missing } = await supabase
              .from('user_feedback_helper')
              .select('meta, dish_id, created_at')
              .eq('user_id', userId)
              .eq('feedback_type', 'missing_ingredient')
              .gte('created_at', sevenDaysAgo.toISOString());
            for (const row of (missing ?? [])) {
              const ing = (row as any)?.meta?.ingredient as string | undefined;
              if (ing) inventorySet.delete(ing);
            }
          } catch { /* user_feedback_helper 未上线 → 跳过 */ }
        }
        const homeInventoryItems = inventorySet.size > 0 ? inventorySet : undefined;

        // ── §A (TICKET-043 Smell 1 阶段 4) prepare cross-week fatigue map ──
        // 拉 user_weekly_menus 最近 4 周所有 meal_type 行（dinner / lunch /
        // breakfast / fruit），聚合 dish_ids 出现次数。≥ CROSS_WEEK_FATIGUE_THRESHOLD
        // (4) 的 dish_id 在 generateWeekPlan candidate filter 阶段被 hard-block。
        // 失败 / 表未上线 → 传 undefined，candidate filter 退化为"无 fatigue 限制"
        // 与本 ticket 前的行为一致（forward-compat）。
        const fourWeeksAgo = new Date();
        fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
        let fatigueByDishId: Map<string, number> | undefined;
        try {
          const { data: pastWeeks } = await supabase
            .from('user_weekly_menus')
            .select('dish_ids, swapped_dish_ids')
            .eq('user_id', userId)
            .gte('week_start', fourWeeksAgo.toISOString().slice(0, 10));
          if (pastWeeks && pastWeeks.length > 0) {
            const counts = new Map<string, number>();
            for (const row of pastWeeks) {
              const ids = ((row as any).swapped_dish_ids ?? (row as any).dish_ids ?? []) as string[];
              for (const id of ids) {
                if (typeof id === 'string') counts.set(id, (counts.get(id) ?? 0) + 1);
              }
            }
            if (counts.size > 0) fatigueByDishId = counts;
          }
        } catch { /* user_weekly_menus query 失败 → undefined fallback */ }

        const menu = generateWeekPlan(
          pool, profile, prefScores, recentIds, dishesPerDay, kidSlots,
          spiceBoost, profile.age_group, healthPrefs, familyPrefs, helperMode,
          hcAdults, hcKids,
          humidity, solarTerm, hasXiaomei, breakfastPool, fruitPool,
          homeInventoryItems,
          undefined, // seed: 主用户路径不需 deterministic
          fatigueByDishId,
        );

        if (cancelled) return;

        // Persist — algo_version + cache_key are written into the DB row by
        // saveToDB so the next loadFromDB can detect stale data on its own.
        localStorage.setItem(lsKey, JSON.stringify(menu));
        saveToDB(userId, menu, lsKey).catch(() => {});
        saveToHistory(userId, menu).catch(() => {});

        setWeeklyMenu(menu);
      } catch (err) {
        console.error('useWeeklyMenu error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    build();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, weekOffset]);

  // Swap a single dish on a given day (user override)
  async function swapDish(dayIndex: number, slotIndex: number, newDish: SupabaseDish) {
    if (!weeklyMenu) return;

    const updated: WeeklyMenu = {
      ...weeklyMenu,
      days: weeklyMenu.days.map(day =>
        day.dayIndex === dayIndex
          ? {
              ...day,
              dishes: day.dishes.map((d, i) => (i === slotIndex ? newDish : d)),
            }
          : day
      ),
    };

    setWeeklyMenu(updated);

    const lsKey = getCacheKey(weeklyMenu.weekStart);
    localStorage.setItem(lsKey, JSON.stringify(updated));

    const userId = getUserId() ?? 'anonymous';
    const day = updated.days[dayIndex];
    await supabase.from('user_weekly_menus').upsert({
      user_id:          userId,
      week_start:       weeklyMenu.weekStart,
      day_index:        dayIndex,
      meal_type:        'dinner',
      dish_ids:         weeklyMenu.days[dayIndex].dishes.map(d => d.id),
      swapped_dish_ids: day.dishes.map(d => d.id),
      algo_version:     ALGO_VERSION,
      cache_key:        lsKey,
    }, { onConflict: 'user_id,week_start,day_index,meal_type' });
  }

  // Regenerate (discard cache, re-run algorithm)
  function regenerate() {
    if (!weeklyMenu) return;
    localStorage.removeItem(getCacheKey(weeklyMenu.weekStart));
    setWeeklyMenu(null);
    setLoading(true);
    // Re-trigger useEffect via state reset
    window.dispatchEvent(new Event('nutri-weekly-regenerate'));
  }

  return { weeklyMenu, loading, swapDish, regenerate };
}
