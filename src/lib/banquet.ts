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
import { getUserId } from './userId';
import { callComposer, toSummary, type BucketKey, type ComposerResult } from './composerClient';
import { ALGO_VERSION } from '../hooks/useWeeklyMenu';
import type { SupabaseDish } from '../hooks/useSupabaseMenu';

// Composer Agent v1 — see .claude/skills/menu-scoring-philosophy/SKILL.md
// Rule 8 for the design contract this implementation honors.
const COMPOSER_PROMPT_VERSION = 'composer_v1.0';

/** v1 segment inference: cantonese-hometown users get 'B', everyone else 'A'.
 *  Real A/B segmentation arrives later; this is a placeholder so the column
 *  is populated for future analytics. */
function inferSegment(): 'A' | 'B' {
  try {
    const h = localStorage.getItem('userHometown');
    return h === 'cantonese' ? 'B' : 'A';
  } catch {
    return 'A';
  }
}

// ── Public types ─────────────────────────────────────────────────────────────

// Occasion was removed in favour of letting the headcount mix (adults / kids /
// elders) and specialNeeds drive the menu directly — the supposed differences
// between 'friends gathering' / 'colleague gathering' / 'elder celebration'
// produced near-identical scoring once measured. The type alias is kept so
// callers don't break but every value resolves to the same neutral preset.
export type BanquetOccasion = 'home_gathering';

export type CuisineStyle =
  | 'chinese'
  | 'western'
  | 'mixed'
  | 'japanese';

/** Avoid options the user can toggle right inside the banquet flow.
 *  Stacks on top of whatever the global userPrefs already excludes. */
export type BanquetAvoidId =
  | 'seafood'      // 不吃海鲜
  | 'veggie'       // 全素
  | 'spicy'        // 完全不辣
  | 'beef'         // 忌牛羊肉
  | 'peanut'       // 花生过敏
  | 'dairy'        // 忌乳制品
  | 'cilantro'     // 不吃香菜
  | 'onion'        // 不吃葱蒜
  | 'five_pungent'; // 不吃五辛（佛家素）

/** Optional menu biases. 'growth' boosts calcium/protein-rich dishes for
 *  kids; 'pregnancy' boosts folate / iron / calcium / safe-DHA dishes
 *  while hard-blocking unsafe items (raw fish, high-mercury fish, etc.). */
export type BanquetSpecialNeed =
  | 'growth'        // 助长高（儿童成长）
  | 'pregnancy';    // 孕妇（怀孕）

export interface BanquetOptions {
  /** Reserved for backwards-compat — always 'home_gathering'. The headcount
   *  mix below is what actually drives the menu. */
  occasion?:     BanquetOccasion;
  adults:        number;
  kids:          number;
  elders:        number;
  cuisineStyle:  CuisineStyle;
  /** Per-banquet avoids selected in the wizard. Empty = use just userPrefs. */
  extraAvoid?:   BanquetAvoidId[];
  /** Optional dietary biases (e.g. growth for kids). */
  specialNeeds?: BanquetSpecialNeed[];
}

// What each banquet-flow avoid actually excludes from the dish pool.
const BANQUET_AVOID_RULES: Record<BanquetAvoidId, {
  ingredients?: string[];     // main_ingredient values
  tags?:        string[];     // flavor / health tags
  titleKeywords?: string[];   // safety net for missing tags
  vegetarianOnly?: boolean;
}> = {
  seafood:  { ingredients: ['seafood', 'fish', 'shrimp', 'crab', 'shellfish', 'squid', 'scallop', 'clam', 'lobster', 'salmon', 'tuna', 'cod', 'hairtail', 'seabass', 'oyster'],
              titleKeywords: ['鱼', '虾', '蟹', '贝', '鱿鱼', '龙虾', '带鱼', '生蚝', '海鲜'] },
  veggie:   { vegetarianOnly: true },
  spicy:    { tags: ['spicy', 'very_spicy', 'extra_spicy'] },
  beef:     { ingredients: ['beef', 'lamb', 'mutton'], titleKeywords: ['牛肉', '羊肉', '牛排', '羊排'] },
  peanut:   { tags: ['peanut'], titleKeywords: ['花生'] },
  dairy:    { tags: ['dairy', 'milk'], titleKeywords: ['芝士', '奶酪', '奶油', '黄油', '牛奶', '乳酪', 'cheese', 'cream', 'butter', 'milk'] },
  cilantro: { tags: ['cilantro'], titleKeywords: ['香菜'] },
  onion:    { tags: ['onion', 'garlic'], titleKeywords: ['葱', '蒜', '洋葱'] },
  // Buddhist 五辛: 葱 / 蒜 / 韭 / 薤 / 兴渠. Strict — vegetarian + no allium family.
  five_pungent: {
    vegetarianOnly: true,
    ingredients: ['onion', 'garlic', 'leek', 'chives', 'shallot', 'scallion'],
    tags: ['onion', 'garlic'],
    titleKeywords: ['葱', '蒜', '韭', '洋葱', '薤'],
  },
};

// Growth-friendly ingredients for kids (calcium + protein + zinc).
const GROWTH_BOOST_INGREDIENTS = new Set([
  'tofu', 'milk', 'cheese', 'yogurt', 'egg', 'salmon', 'sardine',
  'beef', 'chicken', 'pork', 'shrimp', 'fish',
  'spinach', 'broccoli', 'bok_choy', 'kale', 'sesame', 'walnut', 'cashew',
]);

// Pregnancy-friendly ingredients — folate, iron, calcium, omega-3, protein.
// Liver is rich in iron but contains very high vitamin A; intentionally NOT
// included to avoid hypervitaminosis A risk in pregnancy.
const PREGNANCY_BOOST_INGREDIENTS = new Set([
  'spinach', 'broccoli', 'bok_choy', 'kale', 'asparagus',  // folate
  'tofu', 'milk', 'cheese', 'yogurt', 'sesame',            // calcium
  'beef', 'pork', 'chicken', 'egg',                        // iron + protein
  'salmon', 'sardine',                                     // safe-DHA fish
  'sweet_potato', 'pumpkin', 'carrot',                     // vitamin A from beta-carotene (safe)
]);

// Pregnancy-unsafe items — hard filter, regardless of cuisine. Covers raw
// proteins, high-mercury fish, alcohol-cooked dishes, unpasteurised soft
// cheeses, and cured / smoked meats with listeria risk.
const PREGNANCY_AVOID_TITLE_KEYWORDS = [
  '生鱼片', '刺身', '寿司', '生蚝', '生蛋', '溏心', '太阳蛋',
  '金枪鱼', '吞拿鱼', '剑鱼', '旗鱼', '鲨鱼', '马林鱼', '马鲛鱼',
  '醉', '酒酿', '黄酒', '米酒', '料酒', '烈酒',
  '布里', '卡门贝尔', 'brie', 'camembert', 'feta', '蓝纹', 'blue cheese',
  '生火腿', '帕尔玛火腿', 'prosciutto', '腊肉', '腌肉',
  '动物肝', '猪肝', '鸡肝', '鹅肝', 'liver', 'foie gras',
];
const PREGNANCY_AVOID_INGREDIENTS = new Set([
  'tuna', 'swordfish', 'shark', 'marlin', 'mackerel_king',
  'liver', 'pork_liver', 'chicken_liver', 'organ',
]);
const PREGNANCY_AVOID_TAGS = ['raw', 'sashimi', 'high_mercury', 'alcohol', 'cured'];

function passesPregnancy(dish: SupabaseDish): boolean {
  const title = (((dish as any).title_zh ?? '') + ' ' + ((dish as any).title_en ?? '')).toLowerCase();
  const ingredient = ((dish as any).main_ingredient ?? '') as string;
  const allTags = [
    ...(((dish as any).flavor_tags ?? []) as string[]),
    ...(((dish as any).health_benefit_tags ?? []) as string[]),
  ];
  if (PREGNANCY_AVOID_INGREDIENTS.has(ingredient)) return false;
  if (PREGNANCY_AVOID_TAGS.some(t => allTags.includes(t))) return false;
  if (PREGNANCY_AVOID_TITLE_KEYWORDS.some(k => title.includes(k.toLowerCase()))) return false;
  return true;
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
  /** Composer Agent v1 fields. Present only when LLM branch succeeded;
   *  local-fallback paths leave them undefined. UI does NOT render
   *  narrative/tradeoffs in v1 (per Rule 8 — observe quality in
   *  menu_evals first); they're persisted so future v1.1 can light them up. */
  composer_run_id?: string;
  narrative?:       string;
  tradeoffs?:       string[];
  /** Eval row id from menu_evals — used by ResultStep callbacks to
   *  UPDATE outcome when the user swaps / accepts / replans. */
  eval_id?:         string;
}

// ── Dynamic tag bonuses driven by who's at the table ─────────────────────────
// Replaces the OCCASIONS preset list. With more kids the menu drifts toward
// sweet/crispy/colorful and away from spicy; with more elders toward soft /
// nourish / light and away from very_spicy / fried. Adult-dominated tables
// fall back to neutral 'shareable' scoring.

interface DynamicScoring { bonusTags: string[]; penaltyTags: string[]; signatureIngredients?: string[]; }

function scoringFromHeadcount(opts: BanquetOptions): DynamicScoring {
  const bonus: Set<string> = new Set();
  const penalty: Set<string> = new Set();
  const signature: Set<string> = new Set();

  if (opts.kids > 0) {
    bonus.add('sweet');
    bonus.add('crispy');
    penalty.add('very_spicy');
    penalty.add('spicy');
    penalty.add('extra_spicy');
    penalty.add('bitter');
  }
  if (opts.elders > 0) {
    bonus.add('nourish');
    bonus.add('soft');
    bonus.add('light');
    penalty.add('very_spicy');
    penalty.add('fried');
    signature.add('fish');
    signature.add('chicken');
  }
  if (opts.adults > 0 && opts.kids === 0 && opts.elders === 0) {
    bonus.add('shareable');
    bonus.add('popular');
  }

  return {
    bonusTags:   [...bonus],
    penaltyTags: [...penalty],
    signatureIngredients: signature.size > 0 ? [...signature] : undefined,
  };
}

export const AVOID_LABELS: Record<BanquetAvoidId, { label: string; emoji: string }> = {
  seafood:      { label: '不吃海鲜',     emoji: '🦐' },
  veggie:       { label: '全素',         emoji: '🥦' },
  spicy:        { label: '完全不辣',     emoji: '🥛' },
  beef:         { label: '忌牛羊肉',     emoji: '🐄' },
  peanut:       { label: '花生过敏',     emoji: '🥜' },
  dairy:        { label: '忌乳制品',     emoji: '🥛' },
  cilantro:     { label: '不吃香菜',     emoji: '🌿' },
  onion:        { label: '不吃葱蒜',     emoji: '🧄' },
  five_pungent: { label: '不吃五辛（佛家）', emoji: '🪷' },
};

export const SPECIAL_NEED_LABELS: Record<BanquetSpecialNeed, { label: string; emoji: string; sub: string }> = {
  growth:    { label: '助长高',  emoji: '📏', sub: '钙·蛋白·锌的儿童成长营养' },
  pregnancy: { label: '孕妇',    emoji: '🤰', sub: '叶酸·铁·钙·安全 DHA，自动避开生食 / 高汞鱼 / 酒酿' },
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

  const dyn = scoringFromHeadcount(opts);

  for (const tag of dyn.bonusTags) {
    if (flavorTags.includes(tag) || healthTags.includes(tag)) score += 0.15;
  }
  for (const tag of dyn.penaltyTags) {
    if (flavorTags.includes(tag)) score -= 0.30;
  }
  if (dyn.signatureIngredients?.includes(ingredient)) score += 0.10;

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

  // Special-need scoring biases
  if (opts.specialNeeds?.includes('growth') && GROWTH_BOOST_INGREDIENTS.has(ingredient)) {
    score += 0.20;
  }
  if (opts.specialNeeds?.includes('pregnancy') && PREGNANCY_BOOST_INGREDIENTS.has(ingredient)) {
    score += 0.20;
  }

  // Engagement signal — community-loved dishes float up
  const employerLikes = ((dish as any).employer_crown_likes ?? 0) as number;
  if (employerLikes > 0) score += Math.min(0.15, employerLikes * 0.02);

  return score;
}

// Applies an avoid rule set as a hard filter. Returns true if the dish passes.
function passesAvoid(dish: SupabaseDish, avoidIds: BanquetAvoidId[]): boolean {
  const title    = (((dish as any).title_zh ?? '') + ' ' + ((dish as any).title_en ?? '')).toLowerCase();
  const ingredient = ((dish as any).main_ingredient ?? '') as string;
  const flavorTags = ((dish as any).flavor_tags ?? []) as string[];
  const healthTags = ((dish as any).health_benefit_tags ?? []) as string[];
  const allTags = [...flavorTags, ...healthTags];

  for (const id of avoidIds) {
    const rule = BANQUET_AVOID_RULES[id];
    if (rule.vegetarianOnly && !(dish as any).is_vegan) return false;
    if (rule.ingredients?.includes(ingredient)) return false;
    if (rule.tags?.some(t => allTags.includes(t))) return false;
    if (rule.titleKeywords?.some(k => title.includes(k.toLowerCase()))) return false;
  }
  return true;
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

  // ── Step ① Hard filters: global userPrefs + per-banquet avoids + pregnancy.
  const prefs = getUserPrefs();
  const extraAvoid = opts.extraAvoid ?? [];
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
    if (!passesAvoid(d, extraAvoid)) return false;
    if (opts.specialNeeds?.includes('pregnancy') && !passesPregnancy(d)) return false;
    return true;
  });

  const hasKids = opts.kids > 0;

  // ── Step ② Bucket the pool by course type.
  const byCourse: Record<BanquetCourse['key'], SupabaseDish[]> = {
    cold: [], main: [], staple: [], soup: [], dessert: [],
  };
  for (const dish of pool) {
    if (isCold(dish)) { byCourse.cold.push(dish); continue; }
    const bucket = bucketOf(dish);
    if (bucket) byCourse[bucket].push(dish);
  }

  // ── Step ④ Composer branch (LLM-driven selection). On any failure we
  //          silently fall back to the local scoreDish + weightedSample
  //          path below — per Rule 8.4 the user is never told.
  let courses: BanquetCourse[] | null = null;
  let composerRunId: string | undefined;
  let narrative:     string | undefined;
  let tradeoffs:     string[] | undefined;
  let evalId:        string | undefined;

  try {
    const composerResult = await callComposer({
      scenario: 'banquet',
      user_context: {
        headcount: { adults: opts.adults, kids: opts.kids, elders: opts.elders },
        cuisine_style: opts.cuisineStyle,
        extra_avoid:   extraAvoid,
        special_needs: opts.specialNeeds ?? [],
        global_prefs: {
          avoid_tags:        prefs.avoidTags ?? [],
          avoid_ingredients: prefs.avoidIngredients ?? [],
          vegetarian_only:   !!prefs.vegetarianOnly,
        },
      },
      buckets: {
        cold:    byCourse.cold.map(toSummary),
        main:    byCourse.main.map(toSummary),
        staple:  byCourse.staple.map(toSummary),
        soup:    byCourse.soup.map(toSummary),
        dessert: byCourse.dessert.map(toSummary),
      },
      bucket_targets: {
        cold:    counts.cold,
        main:    counts.main,
        staple:  counts.staple,
        soup:    counts.soup,
        dessert: counts.dessert,
      },
      algo_version: ALGO_VERSION,
    });

    courses = assembleCoursesFromComposer(composerResult, byCourse, opts);
    composerRunId = crypto.randomUUID();
    narrative     = composerResult.theme_narrative;
    tradeoffs     = composerResult.tradeoffs;

    // Write success row to menu_evals (outcome=null, updated by UI events).
    evalId = await writeComposerEval({
      composer_run_id: composerRunId,
      output: composerResult,
      courses,
      success: true,
    });
  } catch (e) {
    console.warn('Composer failed, fallback to local algo:', e);
    // Write failure row so fallback rate is observable; outcome stays null.
    try {
      await writeComposerEval({
        composer_run_id: undefined,
        output: null,
        courses: null,
        success: false,
        fallback_reason: e instanceof Error ? e.message : String(e),
      });
    } catch (logErr) {
      console.warn('menu_evals fallback write also failed:', logErr);
    }
  }

  // ── Step ④ (fallback) Local scoreDish + weightedSample.
  if (!courses) {
    const used = new Set<string>();
    const built: BanquetCourse[] = [];
    for (const t of COURSE_TEMPLATE) {
      const targetCount = counts[t.key];
      const candidates = byCourse[t.key]
        .filter(d => !used.has(d.id))
        .map(d => ({ value: d, score: scoreDish(d, opts, hasKids) }));

      const picked = weightedSample(candidates, targetCount);
      picked.forEach(d => used.add(d.id));

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

      built.push({
        key:   t.key,
        label: COURSE_LABELS[t.key].label,
        emoji: COURSE_LABELS[t.key].emoji,
        dishes: enriched,
      });
    }
    courses = built;
  }

  return {
    composer_run_id: composerRunId,
    narrative,
    tradeoffs,
    eval_id: evalId,
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

// ── Composer integration helpers ─────────────────────────────────────────────

/** Resolve Composer's id-only output back into BanquetCourse[] using the
 *  bucketed pool the caller passed to the Composer. Skips ids missing from
 *  the pool defensively even though the edge function already validated. */
function assembleCoursesFromComposer(
  result:   ComposerResult,
  byCourse: Record<BanquetCourse['key'], SupabaseDish[]>,
  opts:     BanquetOptions,
): BanquetCourse[] {
  const courses: BanquetCourse[] = [];
  const hasKids = opts.kids > 0;
  for (const t of COURSE_TEMPLATE) {
    const k = t.key as BucketKey;
    const idMap = new Map(byCourse[t.key].map(d => [d.id, d]));
    const dishes: BanquetDish[] = [];
    for (const id of (result.selected_dishes[k] ?? [])) {
      const d = idMap.get(id);
      if (d) dishes.push({ ...d });
    }
    if (hasKids && t.key === 'main') {
      let marked = 0;
      for (const d of dishes) {
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
      dishes,
    });
  }
  return courses;
}

interface WriteEvalArgs {
  composer_run_id: string | undefined;
  output:          ComposerResult | null;
  courses:         BanquetCourse[] | null;
  success:         boolean;
  fallback_reason?: string;
}

/** Insert one menu_evals row for this Composer run.
 *  - success=true:  the LLM branch ran cleanly. outcome stays null until
 *                   a UI event (swap/replan/verify) calls updateEvalOutcome().
 *  - success=false: silent fallback path was taken; eval_metrics records
 *                   fallback_used / fallback_reason for ops telemetry. */
async function writeComposerEval(args: WriteEvalArgs): Promise<string | undefined> {
  const userId = getUserId();
  if (!userId) return undefined;

  const dishIds = args.courses
    ? args.courses.flatMap(c => c.dishes.map(d => d.id))
    : [];

  const row: Record<string, unknown> = {
    agent:                 'composer',
    scenario:              'banquet',
    user_id:               userId,
    segment:               inferSegment(),
    algo_version_consumed: ALGO_VERSION,
    prompt_version:        COMPOSER_PROMPT_VERSION,
    dish_ids:              dishIds,
    output_json:           args.output,
    outcome:               null,
  };
  if (args.composer_run_id) row.composer_run_id = args.composer_run_id;
  if (!args.success) {
    row.eval_metrics = {
      fallback_used:   true,
      fallback_reason: args.fallback_reason ?? 'unknown',
    };
  } else if (args.output) {
    row.eval_metrics = { theme_narrative: args.output.theme_narrative };
    row.tradeoffs    = args.output.tradeoffs ?? [];
  }

  const { data, error } = await supabase
    .from('menu_evals')
    .insert(row)
    .select('id')
    .single();
  if (error) {
    console.warn('menu_evals insert error:', error);
    return undefined;
  }
  return (data as { id: string } | null)?.id;
}

/** Patch a menu_evals row when the user takes an action on the result screen.
 *  Used by Banquet.tsx ResultStep callbacks (swap / accept / replan). */
export async function updateEvalOutcome(
  evalId: string,
  outcome: 'revised' | 'rejected' | 'user_accepted',
): Promise<void> {
  if (!evalId) return;
  const patch: Record<string, unknown> = { outcome };
  if (outcome === 'user_accepted') {
    patch.resolved_at = new Date().toISOString();
  }
  const { error } = await supabase.from('menu_evals').update(patch).eq('id', evalId);
  if (error) console.warn('menu_evals outcome update failed:', error);
}
