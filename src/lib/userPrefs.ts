/**
 * userPrefs — Central preference reader
 *
 * Single source of truth for user food preferences.
 * Priority: quickPrefs (anonymous) → Supabase user_profiles → legacy nutri_prefs
 *
 * This is the bridge between the QuickSetup 3-question flow and the
 * recommendation algorithms in useSupabaseMenu + useWeeklyMenu.
 */

export interface UserPrefs {
  // Hard filters (remove matching dishes entirely)
  avoidTags:        string[];       // flavor_tags / health_benefit_tags to exclude
  avoidIngredients: string[];       // main_ingredient values to exclude
  vegetarianOnly:   boolean;        // show only veggie/vegan dishes

  // Health conditions — drive hard filters + scoring adjustments
  healthConditions: string[];       // 'hypertension' | 'diabetes' | 'gout'
  preferLowSodium:  boolean;        // driven by hypertension
  preferLowSugar:   boolean;        // driven by diabetes
  avoidHighPurine:  boolean;        // driven by gout

  // Soft signals for scoring
  spiceLevel:       'none' | 'mild' | 'medium' | 'hot';
  spiceBoost:       number;         // +/- applied to spicy dishes during scoring
  dietaryGoal:      string | null;  // 'fatloss' | 'muscle' | 'balanced' | 'nourish'
  tastePref:        string | null;  // 'light' | 'default' | 'veggie' | ...

  // Display helpers
  avoidLabels:      string[];       // human-readable labels for UI chips
}

// ── Mappings ──────────────────────────────────────────────────────────────────

// QuickSetup avoid option → what to exclude from dish DB
const AVOID_OPTION_MAP: Record<string, {
  tags?: string[];
  ingredients?: string[];
  vegetarianOnly?: boolean;
  label: string;
}> = {
  seafood:  { tags: ['seafood'], ingredients: ['seafood', 'fish', 'shrimp', 'crab', 'shellfish', 'squid', 'scallop', 'clam', 'lobster', 'salmon', 'tuna', 'cod', 'hairtail', 'seabass', 'oyster'], label: '不吃海鲜' },
  veggie:   { vegetarianOnly: true,           label: '素食' },
  cilantro: { tags: ['cilantro'],             label: '不吃香菜' },
  onion:    { tags: ['onion', 'garlic'],      label: '不吃葱蒜' },
  beef:     { ingredients: ['beef', 'lamb', 'mutton'], label: '忌牛羊肉' },
  peanut:   { tags: ['peanut'],               label: '花生过敏' },
  dairy:    { tags: ['dairy', 'milk'],        label: '忌乳制品' },
};

// Health condition → hard filter rules
// High-purine ingredients to block for gout
const GOUT_AVOID_INGREDIENTS = ['shellfish', 'crab', 'scallop', 'clam', 'oyster', 'liver', 'kidney'];

export function resolveHealthFilters(conditions: string[]): {
  avoidTags: string[];
  avoidIngredients: string[];
  preferLowSodium: boolean;
  preferLowSugar: boolean;
  avoidHighPurine: boolean;
} {
  const avoidTags: string[] = [];
  const avoidIngredients: string[] = [];
  let preferLowSodium = false;
  let preferLowSugar  = false;
  let avoidHighPurine = false;

  if (conditions.includes('hypertension')) {
    avoidTags.push('salty', 'very_salty');
    preferLowSodium = true;
  }
  if (conditions.includes('diabetes')) {
    avoidTags.push('sweet', 'very_sweet');
    preferLowSugar = true;
  }
  if (conditions.includes('gout')) {
    avoidIngredients.push(...GOUT_AVOID_INGREDIENTS);
    avoidHighPurine = true;
  }
  return { avoidTags, avoidIngredients, preferLowSodium, preferLowSugar, avoidHighPurine };
}

// QuickSetup goal → dietary_goal tag used in health_benefit_tags scoring
const GOAL_MAP: Record<string, string> = {
  fatloss:  'fat_loss',
  muscle:   'muscle_gain',
  balanced: 'maintain',
  nourish:  'nourish',
};

// QuickSetup spice level → score modifier applied to spicy-tagged dishes
const SPICE_BOOST: Record<string, number> = {
  none:   -0.80,   // virtually removes all spicy dishes
  mild:   -0.30,
  medium:  0.0,
  hot:    +0.25,
};

// ── Core reader ──────────────────────────────────────────────────────────────

export function getUserPrefs(): UserPrefs {
  // ── Read quickPrefs (QuickSetup anonymous flow) ───────────────────────────
  const raw = localStorage.getItem('quickPrefs');
  if (raw) {
    try {
      const prefs = JSON.parse(raw) as {
        goal?:   string;
        spice?:  string;
        avoid?:  string[];
        health?: string[];   // health conditions from step 4
      };

      const spiceLevel = (prefs.spice ?? 'medium') as UserPrefs['spiceLevel'];
      const avoidList  = prefs.avoid ?? ['none'];

      const avoidTags:        string[] = [];
      const avoidIngredients: string[] = [];
      const avoidLabels:      string[] = [];
      let   vegetarianOnly             = false;

      // Always block spicy when spice=none
      if (spiceLevel === 'none') avoidTags.push('spicy');
      if (spiceLevel === 'mild') avoidTags.push('very_spicy', 'extra_spicy');

      for (const opt of avoidList) {
        if (opt === 'none') continue;
        const mapping = AVOID_OPTION_MAP[opt];
        if (!mapping) continue;
        if (mapping.tags)         avoidTags.push(...mapping.tags);
        if (mapping.ingredients)  avoidIngredients.push(...mapping.ingredients);
        if (mapping.vegetarianOnly) vegetarianOnly = true;
        avoidLabels.push(mapping.label);
      }

      // Health conditions
      const healthConditions = (prefs.health ?? ['none']).filter(h => h !== 'none');
      const healthFilters = resolveHealthFilters(healthConditions);

      return {
        avoidTags:        [...new Set([...avoidTags, ...healthFilters.avoidTags])],
        avoidIngredients: [...new Set([...avoidIngredients, ...healthFilters.avoidIngredients])],
        vegetarianOnly,
        healthConditions,
        preferLowSodium:  healthFilters.preferLowSodium,
        preferLowSugar:   healthFilters.preferLowSugar,
        avoidHighPurine:  healthFilters.avoidHighPurine,
        spiceLevel,
        spiceBoost:   SPICE_BOOST[spiceLevel] ?? 0,
        dietaryGoal:  GOAL_MAP[prefs.goal ?? 'balanced'] ?? 'maintain',
        tastePref:    prefs.goal === 'fatloss' ? 'light' : prefs.goal === 'nourish' ? 'light' : 'default',
        avoidLabels,
      };
    } catch { /* fall through */ }
  }

  // ── Legacy nutri_prefs fallback ───────────────────────────────────────────
  const legacySpice  = localStorage.getItem('userSpice') as UserPrefs['spiceLevel'] | null;
  const legacyAvoid  = (localStorage.getItem('userAvoid') ?? '').split(',').filter(Boolean);
  const legacyDiet   = localStorage.getItem('userDiet');
  const spiceLevel   = legacySpice ?? 'medium';

  const avoidTags:        string[] = [];
  const avoidIngredients: string[] = [];
  const avoidLabels:      string[] = [];
  let   vegetarianOnly             = false;

  if (spiceLevel === 'none') avoidTags.push('spicy');
  if (spiceLevel === 'mild') avoidTags.push('very_spicy', 'extra_spicy');

  for (const opt of legacyAvoid) {
    const mapping = AVOID_OPTION_MAP[opt];
    if (!mapping) continue;
    if (mapping.tags)         avoidTags.push(...mapping.tags);
    if (mapping.ingredients)  avoidIngredients.push(...mapping.ingredients);
    if (mapping.vegetarianOnly) vegetarianOnly = true;
    avoidLabels.push(mapping.label);
  }

  return {
    avoidTags:        [...new Set(avoidTags)],
    avoidIngredients: [...new Set(avoidIngredients)],
    vegetarianOnly,
    healthConditions: [],
    preferLowSodium:  false,
    preferLowSugar:   false,
    avoidHighPurine:  false,
    spiceLevel,
    spiceBoost:   SPICE_BOOST[spiceLevel] ?? 0,
    dietaryGoal:  GOAL_MAP[legacyDiet ?? 'balanced'] ?? 'maintain',
    tastePref:    legacyDiet === 'fatloss' ? 'light' : 'default',
    avoidLabels,
  };
}

/**
 * Save updated preferences back to quickPrefs (used by Settings page).
 * Merges with existing quickPrefs so other fields are preserved.
 */
export function saveUserPrefs(updates: {
  goal?:   string;
  spice?:  string;
  avoid?:  string[];
  health?: string[];
}) {
  const existing = (() => {
    try { return JSON.parse(localStorage.getItem('quickPrefs') ?? '{}'); } catch { return {}; }
  })();
  const merged = { ...existing, ...updates };
  localStorage.setItem('quickPrefs', JSON.stringify(merged));

  // Keep legacy keys in sync for backward-compat
  if (updates.spice) localStorage.setItem('userSpice', updates.spice);
  if (updates.avoid) localStorage.setItem('userAvoid', updates.avoid.join(','));
  if (updates.goal)  localStorage.setItem('userDiet', updates.goal);

  // Dispatch event so hooks re-run
  window.dispatchEvent(new Event('nutri-prefs-changed'));
}
