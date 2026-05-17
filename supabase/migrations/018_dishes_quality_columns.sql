-- ============================================================================
-- Migration: 018_dishes_quality_columns
-- (Logical name from parallel session: "005_dishes_quality_columns";
--  renumbered to 018 because file slots 005 / 006 / 007 are already taken
--  by earlier migrations in this repo. Schema_migrations tracker also
--  recorded as version='018'.)
--
-- Created:   2026-05-18
-- Target ALGO_VERSION on consumption: v38
-- Author:    Aieats team (parallel-session collab, audited)
-- ============================================================================
-- Purpose:
--   Add 7 quality-evaluation columns to the dishes table to support:
--     - Composer Agent (theme-based menu composition)
--     - Critic Agent (audit scoring)
--     - Future western-cuisine subdivision (日式/法式/意式/美式)
--     - Embedding-based similarity search (column added here, vector
--       extension + index in a later migration)
--     - Backfill tracking (which dishes still need data enrichment)
--
-- Hard rules followed:
--   - No FK→auth.users (custom auth, see CLAUDE.md)
--   - No existing column modified
--   - All new columns have safe defaults → existing reads/writes unaffected
--   - 17-axis scoring in useWeeklyMenu.ts does NOT consume these yet,
--     so ALGO_VERSION bump is NOT required by this migration alone.
-- ============================================================================

BEGIN;

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS kid_acceptance_score numeric(3,2)
    DEFAULT 0.50
    CHECK (kid_acceptance_score IS NULL OR (kid_acceptance_score >= 0 AND kid_acceptance_score <= 1));

COMMENT ON COLUMN dishes.kid_acceptance_score IS
  'Continuous kid-friendliness score 0.00-1.00. Separate from is_kid_friendly (bool). 0.50 = unknown/pending backfill. Used by Composer Agent for ranking among kid-friendly candidates.';

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS hk_availability_score numeric(3,2)
    DEFAULT 0.50
    CHECK (hk_availability_score IS NULL OR (hk_availability_score >= 0 AND hk_availability_score <= 1));

COMMENT ON COLUMN dishes.hk_availability_score IS
  'HK ingredient sourcing ease 0.00-1.00. 1.0=all at Wellcome/ParknShop year-round; 0.3=needs Taobao 集运 or specialty store. 0.50 = pending backfill.';

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS average_cost_hkd numeric(6,2)
    DEFAULT NULL
    CHECK (average_cost_hkd IS NULL OR (average_cost_hkd >= 0 AND average_cost_hkd <= 2000));

COMMENT ON COLUMN dishes.average_cost_hkd IS
  'Estimated cost per serving in HKD. NULL = not yet estimated. Cap 2000 = sanity bound (no normal home dish exceeds this).';

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS helper_friendly_score numeric(3,2)
    DEFAULT 0.50
    CHECK (helper_friendly_score IS NULL OR (helper_friendly_score >= 0 AND helper_friendly_score <= 1));

COMMENT ON COLUMN dishes.helper_friendly_score IS
  'Helper executability 0.00-1.00 from English recipe. Distinct from execution_level (pure difficulty). 0.50 = pending backfill.';

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS western_subtype text
    DEFAULT NULL
    CHECK (
      western_subtype IS NULL
      OR western_subtype IN (
        'french',
        'italian',
        'spanish',
        'american',
        'american_fine',
        'british',
        'german',
        'other_western'
      )
    );

COMMENT ON COLUMN dishes.western_subtype IS
  'Subdivision of origin_cuisine=western. NULL for all non-western dishes. Resolves 痛点 #4: western originally undifferentiated.';

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS embedding bytea DEFAULT NULL;

COMMENT ON COLUMN dishes.embedding IS
  'PLACEHOLDER ONLY (bytea). Will be replaced by vector(768) in a later migration. Do not populate until that migration runs. Sentinel: MIGRATION_005_PLACEHOLDER';

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS last_backfilled_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN dishes.last_backfilled_at IS
  'Last time this dish ran through the quality-score backfill pipeline. NULL = never enriched. Used by backfill cron to pick next batch.';

CREATE INDEX IF NOT EXISTS dishes_western_subtype_idx
  ON dishes (western_subtype)
  WHERE western_subtype IS NOT NULL;

CREATE INDEX IF NOT EXISTS dishes_backfill_queue_idx
  ON dishes (last_backfilled_at NULLS FIRST);

COMMIT;
