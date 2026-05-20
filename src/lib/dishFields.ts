/**
 * dishFields.ts — explicit column list for `dishes` table SELECTs.
 *
 * Why this file exists: migration 020 added an `embedding vector(768)`
 * column. After embedding backfill (scripts/backfill-dish-embeddings.ts)
 * every row has a ~8KB stringified vector. A naive `select('*').limit(400)`
 * now ships ~3MB of data per call — slow on mobile networks and large
 * enough to look like an outright failure when the JSON parse stalls.
 *
 * Use DISH_FIELDS in place of '*' anywhere the embedding isn't actually
 * consumed (which is everywhere except scripts/backfill-dish-embeddings.ts
 * and any future similarity-search call site).
 */

export const DISH_FIELDS = [
  'id',
  'title_zh',
  'title_en',
  'origin_cuisine',
  'flavor_tags',
  'health_benefit_tags',
  'seasonal_tag',
  'image_url',
  'prep_steps_json',
  'cook_steps_json',
  'main_ingredient',
  'description_zh',
  'description_en',
  'meal_type',
  'is_vegan',
  'course_type',
  'protein_g',
  'carb_g',
  'fat_g',
  'cook_time_min',
  'source',
  'ingredients_ready',
  'employer_crown_likes',
  'times_kept_in_menu',
  'times_employer_swapped',
  'times_cooked',
  'times_posted',
  'repeat_rate',
  'health_score',
  'last_scored_at',
  'execution_level',
  'xiaomei_compatible',
  'xiaomei_incompat_reason',
  'nutrition_kcal_per_serving',
  'oil_level',
  'salt_level',
  'sugar_level',
  'protein_source',
  'cook_method',
  'cultural_note',
  'is_kid_friendly',
  'kid_acceptance_score',
  'hk_availability_score',
  'average_cost_hkd',
  'helper_friendly_score',
  'western_subtype',
  'last_backfilled_at',
  'festival_tags',  // text[] — TICKET-025 §A axis 27（Database 024 §B 落地后命中）
  // ── TICKET-046 §B axis 29: SPECIAL HEALTH GOALS (Database migration 037 后命中) ──
  // 未上线时 SELECT 返回 undefined → scoreForWeek axis 29 子分支自动跳过
  'is_prenatal_friendly',
  'is_lactation_friendly',
  'is_elderly_friendly',

  // intentionally EXCLUDED: 'embedding' (vector(768), ~8KB stringified per row)
].join(',');
