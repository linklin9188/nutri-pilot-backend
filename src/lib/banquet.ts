/**
 * banquet.ts — Banquet menu planning algorithm
 *
 * Given an occasion, headcount breakdown (adults/kids/elders), and cuisine
 * style, build a balanced multi-course menu by sampling from the dishes table.
 *
 * Course composition follows traditional 中式宴席 proportions:
 *   ~20% cold dishes, ~45% main proteins, ~15% staples, ~10% soup, ~10% dessert.
 * For 10 guests that lands around 12 dishes; for 20 guests around 22.
 *
 * The algorithm tags 2 dishes as "kid-friendly" whenever children are present,
 * preferring non-spicy / colorful / familiar items. Allergy & avoid lists from
 * userPrefs are honored as hard filters.
 */

import { supabase } from './supabase';
import { getUserPrefs } from './userPrefs';
import type { SupabaseDish } from '../hooks/useSupabaseMenu';

// ── Public types ─────────────────────────────────────────────────────────────

export type BanquetOccasion =
  | 'friends'             // 朋友聚餐
  | 'kids_party'          // 儿童派对
  | 'elder_celebration'   // 长辈寿宴
  | 'family_feast'        // 家庭团圆 (春节/中秋)
  | 'business'            // 商务宴请
  | 'colleague';          // 同事聚会

export type CuisineStyle =
  | 'chinese'
  | 'western'
  | 'mixed'
  | 'japanese';

export interface BanquetOptions {
  occasion:      BanquetOccasion;
  adults:        number;
  kids:          number;
  elders:        number;
  cuisineStyle:  CuisineStyle;
}

export interface BanquetCourse {
  /** Internal id: cold / main / staple / soup / dessert */
  key:   'cold' | 'main' | 'staple' | 'soup' | 'dessert';
  label: string;       // 凉菜 / 主菜 / 主食 / 汤品 / 甜品
  emoji: string;
  dishes: BanquetDish[];
}

export interface BanquetDish extends SupabaseDish {
  /** True when the dish is recommended specifically for children at this table. */
  kidFriendly?: boolean;
}

export interface BanquetMenu {
  options:      BanquetOptions;
  headcount:    number;
  totalDishes:  number;
  courses:      BanquetCourse[];
}

// ── Occasion metadata (shown in UI + drives scoring) ─────────────────────────

export const OCCASIONS: Record<BanquetOccasion, {
  label: string;
  sub:   string;
  emoji: string;
  /** Health-benefit / flavor tag bonuses applied during scoring. */
  bonusTags: string[];
  /** Tags to push down (negative score). */
  penaltyTags: string[];
  /** "Centerpiece" main_ingredient values that get a big boost (one per menu). */
  signatureIngredients?: string[];
}> = {
  friends: {
    label: '朋友聚餐',
    sub:   '轻松愉快，荤素均衡',
    emoji: '👨‍👩‍👧‍👦',
    bonusTags: ['popular', 'shareable'],
    penaltyTags: [],
  },
  kids_party: {
    label: '儿童派对',
    sub:   '颜色丰富，不辣易吃',
    emoji: '🎂',
    bonusTags: ['sweet', 'crispy'],
    penaltyTags: ['very_spicy', 'spicy', 'extra_spicy'],
  },
  elder_celebration: {
    label: '长辈寿宴',
    sub:   '滋补软糯，寓意吉祥',
    emoji: '🎉',
    bonusTags: ['nourish', 'soft', 'light'],
    penaltyTags: ['very_spicy', 'fried'],
    signatureIngredients: ['fish', 'noodle', 'chicken'],
  },
  family_feast: {
    label: '家庭团圆',
    sub:   '大菜上桌，年味十足',
    emoji: '🧧',
    bonusTags: ['festive', 'savory'],
    penaltyTags: [],
    signatureIngredients: ['fish', 'pork', 'chicken', 'duck'],
  },
  business: {
    label: '商务宴请',
    sub:   '体面精致，贵气得体',
    emoji: '💼',
    bonusTags: ['premium', 'elegant'],
    penaltyTags: ['casual'],
    signatureIngredients: ['seafood', 'beef', 'fish'],
  },
  colleague: {
    label: '同事聚会',
    sub:   '人人爱吃，预算友好',
    emoji: '🥂',
    bonusTags: ['popular'],
    penaltyTags: [],
  },
};

export const CUISINES: Record<CuisineStyle, { label: string; emoji: string }> = {
  chinese:  { label: '中式',  emoji: '🥢' },
  western:  { label: '西式',  emoji: '🍝' },
  mixed:    { label: '中西混搭', emoji: '🌏' },
  japanese: { label: '日式',  emoji: '🍣' },
};

// ── Course composition rules ─────────────────────────────────────────────────

interface CourseTarget { key: BanquetCourse['key']; ratio: number; min: number; }

const COURSE_TEMPLATE: CourseTarget[] = [
  { key: 'cold',    ratio: 0.20, min: 2 },
  { key: 'main',    ratio: 0.45, min: 4 },
  { key: 'staple',  ratio: 0.15, min: 1 },
  { key: 'soup',    ratio: 0.10, min: 1 },
  { key: 'dessert', ratio: 0.10, min: 1 },
];

const COURSE_LABELS: Record<BanquetCourse['key'], { label: string; emoji: string }> = {
  cold:    { label: '凉菜', emoji: '🥗' },
  main:    { label: '主菜', emoji: '🍖' },
  staple:  { label: '主食', emoji: '🍚' },
  soup:    { label: '汤品', emoji: '🍲' },
  dessert: { label: '甜品', emoji: '🍮' },
};

// ── DB course_type → our bucket ──────────────────────────────────────────────

function bucketOf(dish: SupabaseDish): BanquetCourse['key'] | null {
  const ct = (dish as any).course_type as string | null;
  if (ct === 'dessert') return 'dessert';
  if (ct === 'soup')    return 'soup';
  if (ct === 'staple')  return 'staple';
  if (ct === 'main_protein' || ct === 'veggie_dish') return 'main';
  return null;  // skip dishes with unknown course_type
}

// Cold dishes are not a separate course_type in the schema; detect via title
// keywords / flavor tags as a heuristic until we add a dedicated column.
// '酱' was previously here and caused false positives like 炸酱面 (a hot staple)
// and 芝麻酱扁豆 — dropped. '皮蛋豆腐'/'凉粉' kept as specific cold-dish names.
const COLD_TITLE_KEYWORDS = ['凉拌', '凉菜', '泡椒', '醉', '麻辣', '口水鸡', '夫妻肺片', '皮蛋', '凉粉', '蒜泥'];
function isCold(dish: SupabaseDish): boolean {
  const title = ((dish as any).title_zh ?? '') as string;
  const flavorTags = ((dish as any).flavor_tags ?? []) as string[];
  if (flavorTags.includes('cold')) return true;
  // Hot staples like 炸酱面 / 拌面 should not be cold even if name matches.
  const courseType = ((dish as any).course_type ?? '') as string;
  if (courseType === 'staple' || courseType === 'soup') return false;
  return COLD_TITLE_KEYWORDS.some(k => title.includes(k));
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreDish(dish: SupabaseDish, opts: BanquetOptions, hasKids: boolean): number {
  let score = 0.50;
  const flavorTags = ((dish as any).flavor_tags ?? []) as string[];
  const healthTags = ((dish as any).health_benefit_tags ?? []) as string[];
  const cuisine    = ((dish as any).origin_cuisine ?? '') as string;
  const ingredient = ((dish as any).main_ingredient ?? '') as string;

  const occasion = OCCASIONS[opts.occasion];

  // Occasion tag bonuses
  for (const tag of occasion.bonusTags) {
    if (flavorTags.includes(tag) || healthTags.includes(tag)) score += 0.15;
  }
  for (const tag of occasion.penaltyTags) {
    if (flavorTags.includes(tag)) score -= 0.30;
  }
  if (occasion.signatureIngredients?.includes(ingredient)) score += 0.10;

  // Cuisine style match
  if (opts.cuisineStyle === 'chinese' && /chinese|cantonese|sichuan|hunan|jiangsu|northern/i.test(cuisine)) score += 0.20;
  if (opts.cuisineStyle === 'western' && /western|american|european|italian|french/i.test(cuisine)) score += 0.20;
  if (opts.cuisineStyle === 'japanese' && /japanese/i.test(cuisine)) score += 0.30;
  // Mixed: small bonus for variety — handled at the diversity step.

  // Kid-friendly bonus when children are at the table
  if (hasKids) {
    const kidFriendly =
      !flavorTags.includes('very_spicy') &&
      !flavorTags.includes('spicy') &&
      !flavorTags.includes('bitter') &&
      ((dish as any).cook_time_min ?? 0) < 60;
    if (kidFriendly) score += 0.08;
  }

  // Engagement signal — community-loved dishes float up
  const employerLikes = ((dish as any).employer_crown_likes ?? 0) as number;
  if (employerLikes > 0) score += Math.min(0.15, employerLikes * 0.02);

  return score;
}

// Weighted random sampling (highest score = highest probability).
function weightedSample<T>(items: { value: T; score: number }[], count: number): T[] {
  const picked: T[] = [];
  const pool = items.map(i => ({ ...i }));
  for (let n = 0; n < count && pool.length > 0; n++) {
    const total = pool.reduce((s, i) => s + Math.max(0.01, i.score), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0.01, pool[i].score);
      if (r <= 0) { idx = i; break; }
    }
    picked.push(pool[idx].value);
    pool.splice(idx, 1);
  }
  return picked;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function planBanquet(opts: BanquetOptions): Promise<BanquetMenu> {
  const headcount = opts.adults + opts.kids + opts.elders;
  // Each guest averages ~1.0 dish equivalent; kids/elders eat a bit less.
  const dishLoad  = opts.adults + opts.kids * 0.5 + opts.elders * 0.8;
  const totalDishes = Math.max(6, Math.round(dishLoad * 1.1));

  // Compute per-course targets from the template, ensuring the integer ratios
  // still sum to totalDishes by rounding the last course.
  const counts: Record<BanquetCourse['key'], number> = {
    cold: 0, main: 0, staple: 0, soup: 0, dessert: 0,
  };
  let allocated = 0;
  COURSE_TEMPLATE.forEach((t, i) => {
    const isLast = i === COURSE_TEMPLATE.length - 1;
    const n = isLast
      ? Math.max(t.min, totalDishes - allocated)
      : Math.max(t.min, Math.round(totalDishes * t.ratio));
    counts[t.key] = n;
    allocated += n;
  });

  // Fetch a generous dish pool. Apply hard filters from userPrefs.
  const prefs = getUserPrefs();
  const { data: rawPool } = await supabase
    .from('dishes')
    .select('*')
    .limit(600);
  const pool: SupabaseDish[] = (rawPool ?? []).filter(d => {
    const allTags = [
      ...((d as any).flavor_tags ?? []),
      ...((d as any).health_benefit_tags ?? []),
    ] as string[];
    if (prefs.avoidTags.some(t => allTags.includes(t))) return false;
    if (prefs.avoidIngredients.includes((d as any).main_ingredient ?? '')) return false;
    if (prefs.vegetarianOnly && !(d as any).is_vegan) return false;
    return true;
  });

  const hasKids = opts.kids > 0;
  const used = new Set<string>();

  // Bucket the pool by course
  const byCourse: Record<BanquetCourse['key'], SupabaseDish[]> = {
    cold: [], main: [], staple: [], soup: [], dessert: [],
  };
  for (const dish of pool) {
    if (isCold(dish)) { byCourse.cold.push(dish); continue; }
    const bucket = bucketOf(dish);
    if (bucket) byCourse[bucket].push(dish);
  }

  // Score & sample per course
  const courses: BanquetCourse[] = [];
  for (const t of COURSE_TEMPLATE) {
    const targetCount = counts[t.key];
    const candidates = byCourse[t.key]
      .filter(d => !used.has(d.id))
      .map(d => ({ value: d, score: scoreDish(d, opts, hasKids) }));

    const picked = weightedSample(candidates, targetCount);
    picked.forEach(d => used.add(d.id));

    // Mark up to 2 dishes as kid-friendly in the main course when kids present
    const enriched: BanquetDish[] = picked.map(d => ({ ...d }));
    if (hasKids && t.key === 'main') {
      let marked = 0;
      for (const d of enriched) {
        if (marked >= Math.min(2, Math.ceil(opts.kids / 4))) break;
        const ft = ((d as any).flavor_tags ?? []) as string[];
        if (!ft.includes('spicy') && !ft.includes('very_spicy') && !ft.includes('bitter')) {
          (d as BanquetDish).kidFriendly = true;
          marked++;
        }
      }
    }

    courses.push({
      key:   t.key,
      label: COURSE_LABELS[t.key].label,
      emoji: COURSE_LABELS[t.key].emoji,
      dishes: enriched,
    });
  }

  return {
    options:     opts,
    headcount,
    totalDishes: courses.reduce((s, c) => s + c.dishes.length, 0),
    courses,
  };
}

/**
 * Swap one dish in a generated menu for another candidate from the same
 * bucket. Used by the "换一道" button on the result screen.
 */
export async function swapBanquetDish(
  menu:    BanquetMenu,
  courseKey: BanquetCourse['key'],
  oldId:   string,
): Promise<BanquetDish | null> {
  const prefs = getUserPrefs();
  const { data: rawPool } = await supabase.from('dishes').select('*').limit(600);
  if (!rawPool) return null;

  const usedIds = new Set<string>(
    menu.courses.flatMap(c => c.dishes.map(d => d.id))
  );

  const candidates = rawPool
    .filter(d => !usedIds.has(d.id))
    .filter(d => {
      const allTags = [
        ...((d as any).flavor_tags ?? []),
        ...((d as any).health_benefit_tags ?? []),
      ] as string[];
      if (prefs.avoidTags.some(t => allTags.includes(t))) return false;
      if (prefs.avoidIngredients.includes((d as any).main_ingredient ?? '')) return false;
      return true;
    })
    .filter(d => {
      if (courseKey === 'cold')    return isCold(d);
      if (courseKey === 'dessert') return bucketOf(d) === 'dessert';
      if (courseKey === 'soup')    return bucketOf(d) === 'soup';
      if (courseKey === 'staple')  return bucketOf(d) === 'staple';
      if (courseKey === 'main')    return bucketOf(d) === 'main' && !isCold(d);
      return false;
    });

  if (candidates.length === 0) return null;
  const hasKids = menu.options.kids > 0;
  const scored = candidates.map(d => ({
    value: d, score: scoreDish(d, menu.options, hasKids),
  }));
  return weightedSample(scored, 1)[0] as BanquetDish ?? null;
}
