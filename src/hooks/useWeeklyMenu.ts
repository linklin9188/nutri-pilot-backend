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
import { type SupabaseDish } from './useSupabaseMenu';
import { FLAVOR_COL, HEALTH_COL, CUISINE_COL } from './preferenceColMap';
import { getUserPrefs } from '../lib/userPrefs';
import { getFamilyMenuPrefs, familyGoalScore, dishTriggersAllergy } from '../lib/familyPrefs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeeklyDayMenu {
  date: string;          // ISO date string for this day (YYYY-MM-DD)
  dayIndex: number;      // 0=Mon … 6=Sun
  dayLabel: string;      // 周一 … 周日
  dishes: SupabaseDish[];       // dinner dishes
  lunchDishes: SupabaseDish[];  // lunch dishes (simpler, 1-2 items)
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
const ALGO_VERSION = 'v18'; // lunch as 3-dish set meal: 盖饭/意面 + 1 菜 + 1 汤

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ── Who's eating today ────────────────────────────────────────────────────────

interface EatingMember { id: string; name: string; lifeStage: string; needs: string[] }

function getEatingMembers(): EatingMember[] {
  const allMembers: EatingMember[] = (() => {
    try { return JSON.parse(localStorage.getItem('nutri_family_members') || '[]'); } catch { return []; }
  })();
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
 * Returns total dishes per day + how many slots are reserved for kid-friendly dishes.
 * Kid slots: 1 if any kid in today's group, 2 if 2+ kids.
 */
function calcDishesForToday(): { dishesPerDay: number; kidSlots: number } {
  const members = getEatingMembers();
  let kids = 0, adults = 0;
  if (members.length > 0) {
    kids   = members.filter(m => m.lifeStage === '儿童').length;
    adults = members.length - kids;
  } else {
    adults = parseInt(localStorage.getItem('nutri_adults') ?? '3', 10);
    kids   = parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10);
  }
  const eff = adults + kids * 0.5;
  const total =
    eff <= 1.5 ? 3 :
    eff <= 3.5 ? 4 :
    eff <= 5.5 ? 5 :
    eff <= 7.5 ? 6 :
    Math.min(20, Math.round(eff));
  const kidSlots = kids > 0 ? Math.min(kids, 2) : 0;
  return { dishesPerDay: total, kidSlots };
}

// Legacy alias (used by swapDish / regenerate where kidSlots doesn't matter)
function calcDishesPerDay(): number {
  return calcDishesForToday().dishesPerDay;
}

/** Stable localStorage cache key — includes algo version, headcount, and eating selection. */
function getCacheKey(weekStart: string): string {
  const { dishesPerDay } = calcDishesForToday();
  const eatingRaw = localStorage.getItem('nutri_eating_today');
  let eatingKey = 'all';
  try {
    if (eatingRaw) eatingKey = (JSON.parse(eatingRaw) as string[]).slice().sort().join('-');
  } catch {}
  return `weekly_menu_${ALGO_VERSION}_${weekStart}_p${dishesPerDay}_e${eatingKey}`;
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
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

// Weighted random pick: higher score → higher probability
function weightedRandom<T extends { score: number }>(
  candidates: T[],
  count: number,
): T[] {
  const result: T[] = [];
  const pool = [...candidates];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const min = Math.min(...pool.map(c => c.score));
    const shifted = pool.map(c => ({ ...c, w: Math.max(0, c.score - min + 0.1) }));
    const total = shifted.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
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
const ORIGIN_BASE_SCORE: Record<string, number> = {
  cantonese:       0.15,
  northern:        0.12,
  jiangnan:        0.12,
  sichuan:         0.10,
  southeast_asian: 0.08,
  japanese_korean: 0.08,
  western:        -0.10,   // mild penalty — overridden if user profile = western
};

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
}

function scoreForWeek({
  dish, profile, prefScores, recentIds, pickedIngredients, pickedTitleKeywords, dayIndex,
  spiceBoost = 0, ageGroup, healthPrefs, helperMode = false,
}: WeeklyScoreParams): number {
  const flavorTags: string[]  = dish.flavor_tags ?? [];
  const healthTags: string[]  = dish.health_benefit_tags ?? [];
  const origin: string        = dish.origin_cuisine ?? '';
  const ingredient: string    = dish.main_ingredient ?? 'other';
  const cat                   = ingCategory(ingredient);

  // ── 1. Cuisine origin rebalancing (fixes western 32% volume bias) ─────────
  // If user has a hometown preference, override the default penalty/bonus.
  let score = ORIGIN_BASE_SCORE[origin] ?? 0;
  if (profile.hometown_cuisine && origin === profile.hometown_cuisine) {
    score += 0.40;  // strong hometown match overrides default
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

  // ── 4. Feedback EMA layer ─────────────────────────────────────────────────
  for (const tag of flavorTags) {
    const col = FLAVOR_COL[tag];
    if (col && prefScores[col]) score += prefScores[col] * 0.08;
  }
  for (const tag of healthTags) {
    const col = HEALTH_COL[tag];
    if (col && prefScores[col]) score += prefScores[col] * 0.08;
  }
  const cuisineCol = CUISINE_COL[origin];
  if (cuisineCol && prefScores[cuisineCol]) score += prefScores[cuisineCol] * 0.10;

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

  return score;
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
  pool: any[],
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
): WeeklyMenu {
  const weekStart = getMondayISO();
  const days: WeeklyDayMenu[] = [];
  const usedIds = new Set<string>();
  const pickedIngredients: string[] = [];
  const pickedTitleKeywords: string[] = [];   // weekly keyword tracker

  // Adult slots = total minus kid-dedicated slots
  const adultSlots = Math.max(dishesPerDay - kidSlots, 1);

  // Use small-family slot template when adult slots ≤ 3
  const useSmallTemplate = adultSlots <= 3;

  // Track weekly category counts for hard caps (scale with dishesPerDay)
  const MAX_PER_CATEGORY = getMaxPerCategory(dishesPerDay);
  const weeklyCatCounts: Record<string, number> = {};

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayDishes: any[] = [];
    const dayIngredients: string[] = [];

    // Track allergen dishes per day (soft-cap at 25% of daily slots)
    let allergenDishCountToday = 0;
    const maxAllergenToday = familyPrefs?.maxAllergenDishesPerDay ?? 1;

    // Helper mode: track level-3 count per day (hard cap = 1)
    let level3CountToday = 0;

    for (let slot = 0; slot < adultSlots; slot++) {
      const slotTemplate = useSmallTemplate ? SLOT_PREFERRED_CATS_SMALL : SLOT_PREFERRED_CATS;
      const preferredCats = slotTemplate[slot] ?? [];

      // For small families: slot 2 is the soup slot; otherwise slot 3
      const isSoupSlot = useSmallTemplate ? slot === 2 : slot === 3;

      // Build scored candidates for this slot
      const allCandidates = pool
        .filter(d => !usedIds.has(d.id) && !dayDishes.some(p => p.id === d.id))
        .filter(d => {
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

          // Staple dishes ONLY allowed in slot 4 (standard template)
          if (!useSmallTemplate) {
            if (isStaple && CARB_BLOCKED_SLOTS.has(slot)) return false;
            if (slot === 4 && !isStaple) return false;
          } else {
            // Small template: no staple slot — block staple entirely
            if (isStaple) return false;
          }

          // Soup slot: only allow soups (or light dishes if no soup available)
          if (isSoupSlot && !isSoup && cat !== 'plant' && cat !== 'other') return false;
          // Non-soup slots (standard): block soups from slots 0, 1, 4
          if (!useSmallTemplate && isSoup && (slot === 0 || slot === 1 || slot === 4)) return false;
          // Non-soup slots (small template): block soups from slots 0, 1
          if (useSmallTemplate && isSoup && slot !== 2) return false;

          return true;
        })
        .map(d => {
          // Helper mode hard cap: skip level-3 dish if already have one today
          if (helperMode && level3CountToday >= 1 && (d.execution_level ?? 2) === 3) return null;

          let score = scoreForWeek({
            dish: d, profile, prefScores, recentIds,
            pickedIngredients: [...pickedIngredients, ...dayIngredients],
            pickedTitleKeywords,
            dayIndex,
            spiceBoost,
            ageGroup,
            healthPrefs,
            helperMode,
          });

          // ── Family multi-goal scoring ───────────────────────────────────
          if (familyPrefs && Object.keys(familyPrefs.goalWeights).length > 0) {
            const totalWeight = Object.values(familyPrefs.goalWeights).reduce((a, b) => a + b, 0);
            score += familyGoalScore(d, familyPrefs.goalWeights, totalWeight);
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
          if (!useSmallTemplate && dishesPerDay >= 4) {
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

      const picked = weightedRandom(allCandidates, 1)[0]?.dish;
      if (!picked) break;

      dayDishes.push(picked);
      dayIngredients.push(picked.main_ingredient ?? 'other');
      usedIds.add(picked.id);

      // Track level-3 count for helper mode hard cap
      if (helperMode && (picked.execution_level ?? 2) === 3) level3CountToday++;

      // Track allergen dish count for today's soft-cap
      if (familyPrefs && familyPrefs.allergyMembers.length > 0) {
        const isAllergen = familyPrefs.allergyMembers.some(({ allergies }) =>
          allergies.some(a => dishTriggersAllergy(picked, a))
        );
        if (isAllergen) allergenDishCountToday++;
      }

      // Track title keyword for weekly dedup
      const kw = extractTitleKeyword(picked.title_zh ?? picked.title ?? '');
      if (kw) pickedTitleKeywords.push(kw);

      const cat = ingCategory(picked.main_ingredient ?? 'other');
      weeklyCatCounts[cat] = (weeklyCatCounts[cat] ?? 0) + 1;
    }

    // ── Kid-dedicated dish slots ──────────────────────────────────────────────
    // Scored separately with child-friendly criteria: no spicy, prefer light/sweet.
    // They're added to the same day.dishes array so the whole table shares them.
    const kidDishes: any[] = [];
    if (kidSlots > 0) {
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
          });
          const flavors: string[] = d.flavor_tags ?? [];
          if (flavors.includes('sweet'))  s += 0.25;
          if (flavors.includes('light'))  s += 0.20;
          if (flavors.includes('savory')) s += 0.10;
          return { dish: d, score: s };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      weightedRandom(kidCandidates, kidSlots).forEach(c => {
        kidDishes.push(c.dish);
        const kw = extractTitleKeyword(c.dish.title_zh ?? c.dish.title ?? '');
        if (kw) pickedTitleKeywords.push(kw);
        const cat = ingCategory(c.dish.main_ingredient ?? 'other');
        weeklyCatCounts[cat] = (weeklyCatCounts[cat] ?? 0) + 1;
      });
    }

    // Track for next day's scoring
    dayIngredients.forEach(ing => pickedIngredients.push(ing));

    // ── Generate lunch as a 3-dish 套餐 ─────────────────────────────────
    // Lunch is intentionally a fixed-shape "set meal" regardless of family
    // size — portions scale outside this algo, not the dish count:
    //   • slot 0: 主食 / 盖饭 / 意面 / 拌面 / 炒饭 (one-bowl, includes carbs + some protein)
    //   • slot 1: 1 份配菜（蔬菜/凉菜/小炒）
    //   • slot 2: 1 份汤
    // This matches the HK family lunch pattern (think 茶餐厅 set lunch) and
    // is much faster to prep than the previous "scattered 4 dishes" lunch.
    const dinnerIds = new Set(dayDishes.map(d => d.id));

    const scoreLunch = (d: any) => {
      let score = scoreForWeek({
        dish: d, profile, prefScores, recentIds,
        pickedIngredients: dayIngredients,
        pickedTitleKeywords,         // share weekly title dedup (no repeating 娃娃菜 in lunch either)
        dayIndex, spiceBoost, ageGroup, healthPrefs,
      });
      if ((d.flavor_tags ?? []).includes('light')) score += 0.15;
      return { dish: d, score };
    };

    // 1. staple pool — rice bowls / pasta / noodles / 炒饭 / 盖饭
    const staplePool = pool
      .filter(d => !dinnerIds.has(d.id))
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
      .filter(d => !dinnerIds.has(d.id))
      .filter(d => {
        const ct = d.course_type ?? '';
        const cat = ingCategory(d.main_ingredient ?? 'other');
        if (ct === 'staple' || ct === 'soup' || ct === 'dessert') return false;
        return cat === 'plant' || ct === 'veggie_dish';
      })
      .map(scoreLunch)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    // 3. soup pool — same as dinner soup pool
    const soupPool = pool
      .filter(d => !dinnerIds.has(d.id))
      .filter(d => (d.course_type ?? '') === 'soup')
      .map(scoreLunch)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const stapleLunch = weightedRandom(staplePool, 1).map(c => enrichRaw(c.dish));
    const veggieLunch = weightedRandom(veggiePool, 1).map(c => enrichRaw(c.dish));
    const soupLunch   = weightedRandom(soupPool,   1).map(c => enrichRaw(c.dish));

    // Track lunch picks in pickedTitleKeywords so they don't repeat across days
    [...stapleLunch, ...veggieLunch, ...soupLunch].forEach(d => {
      const kw = extractTitleKeyword(d.title_zh ?? d.title ?? '');
      if (kw) pickedTitleKeywords.push(kw);
    });

    const lunchDishes = [...stapleLunch, ...veggieLunch, ...soupLunch];

    days.push({
      date: dateForDayIndex(weekStart, dayIndex),
      dayIndex,
      dayLabel: DAY_LABELS[dayIndex],
      dishes: [...dayDishes, ...kidDishes].map(d => enrichRaw(d)),
      lunchDishes,
    });
  }

  return { weekStart, days };
}

// ── Supabase persistence ──────────────────────────────────────────────────────

async function loadFromDB(userId: string, weekStart: string): Promise<WeeklyMenu | null> {
  const [dinnerRes, lunchRes] = await Promise.all([
    supabase
      .from('user_weekly_menus')
      .select('day_index, dish_ids, swapped_dish_ids')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('meal_type', 'dinner')
      .order('day_index'),
    supabase
      .from('user_weekly_menus')
      .select('day_index, dish_ids')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('meal_type', 'lunch')
      .order('day_index'),
  ]);

  if (dinnerRes.error || !dinnerRes.data || dinnerRes.data.length < 7) return null;
  // Force regeneration if lunch rows are missing (e.g. saved before lunch was implemented)
  if (!lunchRes.data || lunchRes.data.length === 0) return null;

  const allIds = [
    ...dinnerRes.data.flatMap(r => (r.swapped_dish_ids ?? r.dish_ids) as string[]),
    ...(lunchRes.data ?? []).flatMap(r => r.dish_ids as string[]),
  ];
  const { data: dishRows } = await supabase.from('dishes').select('*').in('id', allIds);
  if (!dishRows) return null;

  const dishMap = new Map(dishRows.map(d => [d.id, d]));
  const lunchMap = new Map(
    (lunchRes.data ?? []).map(r => [r.day_index as number, (r.dish_ids as string[])])
  );

  const days: WeeklyDayMenu[] = dinnerRes.data.map(row => {
    const dinnerIds = (row.swapped_dish_ids ?? row.dish_ids) as string[];
    const lunchIds  = lunchMap.get(row.day_index as number) ?? [];
    const dayIndex  = row.day_index as number;
    return {
      date:        dateForDayIndex(weekStart, dayIndex),
      dayIndex,
      dayLabel:    DAY_LABELS[dayIndex],
      dishes:      dinnerIds.map(id => dishMap.get(id)).filter(Boolean).map(d => enrichRaw(d)),
      lunchDishes: lunchIds.map(id => dishMap.get(id)).filter(Boolean).map(d => enrichRaw(d)),
    };
  });

  return { weekStart, days };
}

async function saveToDB(userId: string, menu: WeeklyMenu): Promise<void> {
  const rows = menu.days.flatMap(day => [
    {
      user_id:    userId,
      week_start: menu.weekStart,
      day_index:  day.dayIndex,
      meal_type:  'dinner',
      dish_ids:   day.dishes.map(d => d.id),
    },
    ...(day.lunchDishes.length > 0 ? [{
      user_id:    userId,
      week_start: menu.weekStart,
      day_index:  day.dayIndex,
      meal_type:  'lunch',
      dish_ids:   day.lunchDishes.map(d => d.id),
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

export function useWeeklyMenu() {
  const [weeklyMenu, setWeeklyMenu] = useState<WeeklyMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-generate when user updates preferences or eating selection changes
  useEffect(() => {
    const handler = () => {
      const weekStart = getMondayISO();
      localStorage.removeItem(getCacheKey(weekStart));
      setWeeklyMenu(null);
      setRefreshKey(k => k + 1);
    };
    window.addEventListener('nutri-prefs-changed', handler);
    return () => window.removeEventListener('nutri-prefs-changed', handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      setLoading(true);

      const weekStart = getMondayISO();
      const userId    = localStorage.getItem('nutri_user_id') ?? 'anonymous';

      // 1. Try DB cache first — but SKIP if algo version has changed since last save.
      // The key "weekly_menu_algo_ver" tracks which version generated the DB rows.
      // If it differs from ALGO_VERSION, the stored rows are stale and must be regenerated.
      const savedAlgoVer = localStorage.getItem('weekly_menu_algo_ver');
      const dbCacheValid = savedAlgoVer === ALGO_VERSION;

      if (dbCacheValid) {
        const cached = await loadFromDB(userId, weekStart);
        if (cached && !cancelled) {
          setWeeklyMenu(cached);
          setLoading(false);
          return;
        }
      }

      // 2. Try localStorage cache — key includes headcount + eating selection
      const { dishesPerDay, kidSlots } = calcDishesForToday();
      const lsKey = getCacheKey(weekStart);
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

        // Fetch dish pool (dinner + all-type, limit 400)
        let poolQuery = supabase
          .from('dishes')
          .select('*')
          .or('meal_type.in.(lunch,dinner,all),meal_type.is.null')
          .limit(400);

        // Vegetarian-only filter at DB level (optimization)
        if (localPrefs.vegetarianOnly) {
          poolQuery = poolQuery.eq('is_vegan', true);
        }

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
        const menu = generateWeekPlan(
          pool, profile, prefScores, recentIds, dishesPerDay, kidSlots,
          spiceBoost, profile.age_group, healthPrefs, familyPrefs, helperMode,
        );

        if (cancelled) return;

        // Persist — mark which algo version generated this menu so DB cache
        // can be invalidated on next algo upgrade (see weekly_menu_algo_ver check above)
        localStorage.setItem(lsKey, JSON.stringify(menu));
        localStorage.setItem('weekly_menu_algo_ver', ALGO_VERSION); // tracks version for DB cache validity
        saveToDB(userId, menu).catch(() => {});
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
  }, [refreshKey]);

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

    const userId = localStorage.getItem('nutri_user_id') ?? 'anonymous';
    const day = updated.days[dayIndex];
    await supabase.from('user_weekly_menus').upsert({
      user_id:          userId,
      week_start:       weeklyMenu.weekStart,
      day_index:        dayIndex,
      meal_type:        'dinner',
      dish_ids:         weeklyMenu.days[dayIndex].dishes.map(d => d.id),
      swapped_dish_ids: day.dishes.map(d => d.id),
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
