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
  dietaryGoal:      string | null;  // 'fatloss' | 'muscle' | 'balanced' | 'nourish' | 'pregnancy' | 'growth'
  tastePref:        string | null;  // 'light' | 'default' | 'veggie' | ...
  hometownCuisine:  string | null;  // matches dishes.origin_cuisine — cantonese / sichuan / jiangnan / …

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
  // low_blood_pressure & anemia: no hard ingredient blocks, but steer toward nourishing dishes
  // (scored via dietaryGoal preference; no exclusions needed)
  return { avoidTags, avoidIngredients, preferLowSodium, preferLowSugar, avoidHighPurine };
}

// QuickSetup goal → dietary_goal tag used in health_benefit_tags scoring.
// The values on the right must match values that actually appear in
// dishes.health_benefit_tags — otherwise goalScore stays at 0 for every
// dish and the user's selection has no effect (see the earlier 'default'
// taste bug that motivated readUserTaste()).
const GOAL_MAP: Record<string, string> = {
  fatloss:   'lose_weight',     // DB uses 'lose_weight', not 'fat_loss'
  muscle:    'muscle_gain',
  balanced:  'maintain',
  nourish:   'nourish',
  // pregnancy + growth: DB doesn't have dedicated 'pregnancy' / 'growth'
  // health_benefit_tags yet — would need a Gemini backfill pass. Until
  // then we map to the closest existing tag with enough coverage so the
  // user's selection isn't a no-op:
  //   pregnancy → 'high_protein' (83 dishes — protein-rich is the
  //     biggest single nutritional ask in pregnancy; iron + folate +
  //     calcium need a separate tag set)
  //   growth → 'muscle_gain' (49 dishes — overlap with kids/teens
  //     building bone + muscle mass)
  // TODO: tag dishes with 'pregnancy' and 'growth' (Gemini batch) so
  // these can be precise instead of approximate.
  pregnancy: 'high_protein',
  growth:    'muscle_gain',
};

// QuickSetup spice level → score modifier applied to spicy-tagged dishes
const SPICE_BOOST: Record<string, number> = {
  none:   -0.80,   // virtually removes all spicy dishes
  mild:   -0.30,
  medium:  0.0,
  hot:    +0.25,
};

// ── Core reader ──────────────────────────────────────────────────────────────

/**
 * Read the legacy `userTaste` localStorage value (set by Login.tsx — a
 * checkbox grid of light / spicy / savory / sweet). Returns the first
 * preference we can map to a dish flavor_tag. Used by both code paths
 * below so Login users get the same taste signal QuickSetup users get.
 *
 * Why this exists: until today, `tastePref` was derived purely from `goal`
 * (fatloss/nourish → 'light', else 'default'). The 'default' value matches
 * NO flavor_tag, so a Login user who selected 'Spicy / 无辣不欢' got
 * `tasteScore = 0` on every dish — exactly the "I picked spicy but see no
 * spicy" bug. Reading `userTaste` here repairs that signal end-to-end.
 *
 * If the user also explicitly selected a `userSpice` level, that wins for
 * spiceLevel; otherwise picking 'spicy' as a taste implies spiceLevel='hot'
 * (i.e. unlock the +0.25 spicy bonus too).
 */
/**
 * Read `userHometown` (set by Login.tsx) and return the first valid cuisine.
 * Used as a fallback when the Supabase user_profiles row doesn't have a
 * hometown_cuisine — which is the common case for anonymous QuickSetup
 * users and Login users on a fresh device (the upsert is fire-and-forget,
 * and the recommend hook runs before that promise resolves).
 *
 * Without this helper, the +30% hometown axis in scoreDish stays at 0 for
 * the entire onboarding window — exactly the kind of "I picked Cantonese
 * but I see equal numbers of all cuisines" complaint that motivated the
 * spice-tag readUserTaste() fix.
 */
const HOMETOWN_VALID = new Set([
  'sichuan', 'cantonese', 'jiangnan', 'northern',
  'huaiyang', 'shandong', 'anhui', 'fujian', 'zhejiang', 'hunan',
  'shanxi', 'yunnan_guizhou', 'chaoshan', 'shunde', 'taiwanese',
  'japanese_korean', 'southeast_asian', 'western',
]);
function readHometownCuisine(): string | null {
  const raw = (localStorage.getItem('userHometown') ?? '').toLowerCase();
  const first = raw.split(',').map(s => s.trim()).find(Boolean);
  if (first && HOMETOWN_VALID.has(first)) return first;
  return null;
}

function readUserTaste(): { tastePref: UserPrefs['tastePref']; impliedSpice: UserPrefs['spiceLevel'] | null } {
  const raw = (localStorage.getItem('userTaste') ?? '').toLowerCase();
  const tastes = raw.split(',').map(s => s.trim()).filter(Boolean);
  // Priority: spicy beats everything (strongest preference); then sweet /
  // savory / light. 'default' is only chosen when nothing matches.
  if (tastes.includes('spicy'))  return { tastePref: 'spicy',  impliedSpice: 'hot'  };
  if (tastes.includes('sweet'))  return { tastePref: 'sweet',  impliedSpice: null   };
  if (tastes.includes('savory')) return { tastePref: 'savory', impliedSpice: null   };
  if (tastes.includes('light'))  return { tastePref: 'light',  impliedSpice: null   };
  return { tastePref: null, impliedSpice: null };
}

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

      // QuickSetup explicitly asks the spice question, so quickPrefs.spice
      // is authoritative when present. Otherwise (rare — quickPrefs without
      // spice, e.g. partially-completed flow), fall back to userTaste:
      // selecting 'spicy' as a taste implies spiceLevel='hot'.
      const userTasteData = readUserTaste();
      const spiceLevel = (prefs.spice ?? userTasteData.impliedSpice ?? 'medium') as UserPrefs['spiceLevel'];
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
        // tastePref priority: explicit userTaste (e.g. 'spicy' / 'sweet') >
        // goal-derived hint (fatloss / nourish → 'light') > 'default'.
        // 'default' matches no flavor_tag and so contributes 0 to tasteScore
        // — better to leave it as null when we genuinely have nothing.
        tastePref:    userTasteData.tastePref
                      ?? (prefs.goal === 'fatloss' || prefs.goal === 'nourish' ? 'light' : 'default'),
        hometownCuisine: readHometownCuisine(),
        avoidLabels,
      };
    } catch { /* fall through */ }
  }

  // ── Legacy nutri_prefs fallback ───────────────────────────────────────────
  // This branch fires for users who came through Login.tsx (which sets
  // userTaste / userDiet but never writes quickPrefs).
  const legacySpice  = localStorage.getItem('userSpice') as UserPrefs['spiceLevel'] | null;
  const legacyAvoid  = (localStorage.getItem('userAvoid') ?? '').split(',').filter(Boolean);
  const legacyDiet   = localStorage.getItem('userDiet');
  const userTasteData = readUserTaste();
  // Spice: explicit userSpice > implied-from-userTaste > 'medium'.
  // So a Login user who only picked "Spicy / 无辣不欢" still gets the
  // +0.25 spicy boost even though there's no slider for spice level.
  const spiceLevel   = legacySpice ?? userTasteData.impliedSpice ?? 'medium';

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
    tastePref:    userTasteData.tastePref
                  ?? (legacyDiet === 'fatloss' ? 'light' : 'default'),
    hometownCuisine: readHometownCuisine(),
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
