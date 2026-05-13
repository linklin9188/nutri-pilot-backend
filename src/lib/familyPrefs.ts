/**
 * familyPrefs.ts — Family-aware preference aggregation
 *
 * Design: each member has their own goals + allergies.
 * Allergens are NOT hard-excluded from menus — instead capped at ≤25% of
 * daily dishes (1 out of 4). Allergic members simply skip that dish.
 *
 * localStorage keys:
 *   family_members  → FamilyMember[] JSON
 *   home_today      → comma-separated member IDs (or 'all')
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type GoalId =
  | 'muscle_gain'   // 增肌
  | 'fat_loss'      // 减脂
  | 'blood_tonic'   // 补气血
  | 'growth'        // 长高成长 (kids)
  | 'nourish'       // 养生调理
  | 'maintain';     // 均衡

export type AllergyId =
  | 'seafood'       // 海鲜
  | 'dairy'         // 乳制品
  | 'peanut'        // 花生
  | 'gluten'        // 麸质
  | 'beef_lamb'     // 牛羊肉
  | 'egg';          // 蛋

export type ConditionId =
  | 'low_blood_pressure'  // 低血压
  | 'anemia'              // 贫血
  | 'hypertension'        // 高血压
  | 'diabetes'            // 糖尿病
  | 'gout'                // 痛风
  | 'skin_allergy';       // 皮肤过敏

export interface FamilyMember {
  id: string;
  name: string;
  emoji: string;
  relation: 'adult' | 'child';
  goals: GoalId[];
  allergies: AllergyId[];
  conditions: ConditionId[];
}

// ── Goal → DB health_benefit_tag mapping ─────────────────────────────────────

const GOAL_TO_DB_TAGS: Record<GoalId, string[]> = {
  muscle_gain: ['muscle_gain'],
  fat_loss:    ['fat_loss', 'lose_weight'],
  blood_tonic: ['nourish'],        // proxy: nourish tag + iron ingredient bonus
  growth:      ['muscle_gain', 'maintain'],
  nourish:     ['nourish'],
  maintain:    ['maintain'],
};

// Iron-rich ingredients that boost blood_tonic goal score
export const IRON_RICH_INGREDIENTS = new Set([
  'pork_liver', 'liver', 'organ', 'pork_blood', 'lamb', 'beef',
  'spinach', 'black_fungus', 'red_dates', 'wolfberry',
]);

// Calcium-rich non-dairy ingredients (for kids with dairy allergy)
export const CALCIUM_RICH_INGREDIENTS = new Set([
  'tofu', 'spinach', 'broccoli', 'bok_choy', 'kale', 'sesame', 'sardine',
]);

// Allergy → which DB main_ingredient values to penalize (NOT hard-block)
export const ALLERGY_INGREDIENTS: Record<AllergyId, string[]> = {
  seafood:  ['seafood', 'fish', 'shrimp', 'crab', 'shellfish', 'squid', 'scallop',
             'clam', 'lobster', 'salmon', 'tuna', 'cod', 'hairtail', 'seabass', 'oyster'],
  dairy:    ['dairy', 'milk', 'cheese', 'butter'],
  peanut:   ['peanut'],
  gluten:   ['wheat', 'barley', 'rye'],
  beef_lamb:['beef', 'lamb', 'mutton'],
  egg:      ['egg', 'eggs'],
};

// Title keywords that signal allergen presence (safety net for missing tags)
export const ALLERGY_TITLE_KEYWORDS: Record<AllergyId, string[]> = {
  seafood:  ['海鲜', '鱼', '虾', '蟹', '贝', '鱿鱼', '龙虾', '带鱼', '生蚝', 'seafood', 'fish', 'prawn', 'shrimp', 'crab'],
  dairy:    ['芝士', '奶酪', '奶油', '黄油', '牛奶', '乳酪', 'cheese', 'cream', 'butter', 'milk'],
  peanut:   ['花生', 'peanut'],
  gluten:   ['面包', '小麦', 'wheat', 'bread'],
  beef_lamb:['牛肉', '羊肉', '牛柳', '牛排', '羊排', 'beef', 'lamb'],
  egg:      ['鸡蛋', '蛋花', '炒蛋', '蒸蛋', 'egg'],
};

// ── Dish allergen check ───────────────────────────────────────────────────────

export function dishTriggersAllergy(dish: { main_ingredient?: string; title_zh?: string; title_en?: string }, allergy: AllergyId): boolean {
  const ingList = ALLERGY_INGREDIENTS[allergy];
  const kwList  = ALLERGY_TITLE_KEYWORDS[allergy];
  if (!ingList || !kwList) return false; // unknown allergy type — safe default
  const ingredient = dish.main_ingredient ?? '';
  if (ingList.includes(ingredient)) return true;
  const title = ((dish.title_zh ?? '') + ' ' + (dish.title_en ?? '')).toLowerCase();
  return kwList.some(kw => title.includes(kw.toLowerCase()));
}

export function dishAllergyFor(dish: { main_ingredient?: string; title_zh?: string; title_en?: string }, members: FamilyMember[]): FamilyMember[] {
  return members.filter(m => m.allergies.some(a => dishTriggersAllergy(dish, a)));
}

// ── Storage helpers ───────────────────────────────────────────────────────────

// ── Convert nutri_family_members (Settings format) → FamilyMember ────────────

function convertNutriMembers(
  raw: Array<{ id: string; name: string; lifeStage: string; needs: string[] }>
): FamilyMember[] {
  const NEEDS_TO_GOAL: Record<string, GoalId> = {
    '减脂': 'fat_loss', '增肌': 'muscle_gain',
    '养生': 'nourish',  '均衡营养': 'maintain',
  };
  const NEEDS_TO_ALLERGY: Record<string, AllergyId> = {
    '不吃海鲜': 'seafood', '忌乳制品': 'dairy',
    '花生过敏': 'peanut',  '忌牛羊肉': 'beef_lamb',
  };
  const NEEDS_TO_CONDITION: Record<string, ConditionId> = {
    '高血压': 'hypertension', '糖尿病': 'diabetes',
    '痛风':   'gout',         '贫血':   'anemia',
    '低血压': 'low_blood_pressure',
  };
  const STAGE_GOALS: Record<string, GoalId[]> = {
    '孕期': ['nourish'], '哺乳期': ['nourish'],
    '老人': ['nourish'], '儿童': ['growth', 'maintain'],
  };

  return raw.map(m => {
    const stageGoals: GoalId[] = STAGE_GOALS[m.lifeStage] ?? [];
    const needsGoals: GoalId[] = m.needs.map(n => NEEDS_TO_GOAL[n]).filter(Boolean) as GoalId[];
    const goals = [...new Set([...stageGoals, ...needsGoals])] as GoalId[];
    return {
      id: m.id,
      name: m.name || '成员',
      emoji: m.lifeStage === '儿童' ? '🧒' : '🧑',
      relation: (m.lifeStage === '儿童' ? 'child' : 'adult') as 'adult' | 'child',
      goals: goals.length > 0 ? goals : ['maintain' as GoalId],
      allergies: m.needs.map(n => NEEDS_TO_ALLERGY[n]).filter(Boolean) as AllergyId[],
      conditions: m.needs.map(n => NEEDS_TO_CONDITION[n]).filter(Boolean) as ConditionId[],
    };
  });
}

export function loadFamilyMembers(): FamilyMember[] {
  // Prefer new-format family_members if it exists
  try {
    const raw = localStorage.getItem('family_members');
    if (raw) {
      const parsed = JSON.parse(raw) as FamilyMember[];
      if (parsed.length > 0) return parsed;
    }
  } catch {}
  // Fall back to nutri_family_members (Settings page format)
  try {
    const raw = localStorage.getItem('nutri_family_members');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return convertNutriMembers(parsed);
    }
  } catch {}
  return [];
}

export function saveFamilyMembers(members: FamilyMember[]) {
  localStorage.setItem('family_members', JSON.stringify(members));
  window.dispatchEvent(new Event('nutri-prefs-changed'));
}

export function loadHomeToday(members: FamilyMember[]): string[] {
  // Try home_today (old format: comma-separated)
  const raw1 = localStorage.getItem('home_today');
  if (raw1 && raw1 !== 'all') {
    const ids = raw1.split(',').filter(Boolean);
    const valid = ids.filter(id => members.some(m => m.id === id));
    if (valid.length > 0) return valid;
  }
  // Fall back to nutri_eating_today (Home page format: JSON array)
  try {
    const raw2 = localStorage.getItem('nutri_eating_today');
    if (raw2) {
      const ids: string[] = JSON.parse(raw2);
      const valid = ids.filter(id => members.some(m => m.id === id));
      if (valid.length > 0) return valid;
    }
  } catch {}
  return members.map(m => m.id);
}

export function saveHomeToday(ids: string[]) {
  localStorage.setItem('home_today', ids.join(','));
  window.dispatchEvent(new Event('nutri-home-changed'));
}

// ── Aggregated family prefs for menu generation ───────────────────────────────

export interface FamilyMenuPrefs {
  // Goal weights: normalized 0–1, summing to ≥1 possible (multiple members)
  goalWeights: Partial<Record<GoalId, number>>;

  // Members with allergies who are home today (used for soft-cap logic)
  allergyMembers: Array<{ member: FamilyMember; allergies: AllergyId[] }>;

  // Max allergen dishes allowed per day (25% cap)
  maxAllergenDishesPerDay: number;

  // All members home today
  homeMembers: FamilyMember[];
}

export function getFamilyMenuPrefs(dishesPerDay = 4): FamilyMenuPrefs {
  const members = loadFamilyMembers();
  if (members.length === 0) {
    return {
      goalWeights: {},
      allergyMembers: [],
      maxAllergenDishesPerDay: Math.floor(dishesPerDay * 0.25),
      homeMembers: [],
    };
  }

  const homeIds = loadHomeToday(members);
  const homeMembers = members.filter(m => homeIds.includes(m.id));
  const active = homeMembers.length > 0 ? homeMembers : members;

  // Goal weights: count how many members share each goal
  const goalCounts: Partial<Record<GoalId, number>> = {};
  for (const m of active) {
    for (const g of m.goals) {
      goalCounts[g] = (goalCounts[g] ?? 0) + 1;
    }
  }
  // Normalize by member count
  const n = active.length;
  const goalWeights: Partial<Record<GoalId, number>> = {};
  for (const [g, count] of Object.entries(goalCounts) as [GoalId, number][]) {
    goalWeights[g] = count / n;
  }

  // Members with allergies (for UI labelling and soft-cap)
  const allergyMembers = active
    .filter(m => m.allergies.length > 0)
    .map(m => ({ member: m, allergies: m.allergies }));

  return {
    goalWeights,
    allergyMembers,
    maxAllergenDishesPerDay: Math.max(1, Math.floor(dishesPerDay * 0.25)),
    homeMembers: active,
  };
}

// ── Score contribution from family goals ──────────────────────────────────────

export function familyGoalScore(
  dish: { health_benefit_tags?: string[]; main_ingredient?: string },
  goalWeights: Partial<Record<GoalId, number>>,
  totalWeight: number,
): number {
  if (totalWeight === 0) return 0;
  const healthTags: string[] = dish.health_benefit_tags ?? [];
  const ingredient = dish.main_ingredient ?? '';
  let score = 0;

  for (const [goal, weight] of Object.entries(goalWeights) as [GoalId, number][]) {
    const w = weight / totalWeight;
    const targetTags = GOAL_TO_DB_TAGS[goal] ?? [goal];
    if (targetTags.some(t => healthTags.includes(t))) {
      score += 0.30 * w;
    }
    // Extra: blood_tonic → iron-rich ingredient bonus
    if (goal === 'blood_tonic' && IRON_RICH_INGREDIENTS.has(ingredient)) {
      score += 0.25 * w;
    }
    // Extra: growth (kids) → calcium-rich non-dairy ingredient bonus
    if (goal === 'growth' && CALCIUM_RICH_INGREDIENTS.has(ingredient)) {
      score += 0.15 * w;
    }
  }

  return score;
}

// ── Default members helper (seed from quickPrefs if no family set) ────────────

export function seedDefaultMembersFromQuickPrefs() {
  const existing = loadFamilyMembers();
  if (existing.length > 0) return; // already set

  const prefs = (() => { try { return JSON.parse(localStorage.getItem('quickPrefs') ?? '{}'); } catch { return {}; } })();
  const adults = parseInt(localStorage.getItem('nutri_adults') ?? '2', 10);
  const kids   = parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10);

  const goal = prefs.goal as GoalId | undefined;
  const members: FamilyMember[] = [];

  // Add primary adult
  members.push({
    id: 'member_1',
    name: '我',
    emoji: '🧑',
    relation: 'adult',
    goals: goal ? [goal] : ['maintain'],
    allergies: parseAllergyList(prefs.avoid ?? []),
    conditions: parseConditionList(prefs.health ?? []),
  });

  // Add second adult if present
  if (adults >= 2) {
    members.push({ id: 'member_2', name: '另一半', emoji: '🧑', relation: 'adult', goals: ['maintain'], allergies: [], conditions: [] });
  }

  // Add children
  for (let i = 0; i < kids; i++) {
    members.push({
      id: `member_child_${i + 1}`,
      name: `孩子${i + 1}`,
      emoji: i % 2 === 0 ? '👧' : '👦',
      relation: 'child',
      goals: ['growth', 'maintain'],
      allergies: parseAllergyList(prefs.avoid ?? []),  // same avoid as parent by default
      conditions: [],
    });
  }

  saveFamilyMembers(members);
}

function parseAllergyList(avoid: string[]): AllergyId[] {
  const map: Record<string, AllergyId> = {
    seafood: 'seafood', dairy: 'dairy', peanut: 'peanut', beef_lamb: 'beef_lamb', egg: 'egg',
  };
  return avoid.map(a => map[a]).filter(Boolean) as AllergyId[];
}

function parseConditionList(health: string[]): ConditionId[] {
  return health.filter(h => h !== 'none') as ConditionId[];
}
