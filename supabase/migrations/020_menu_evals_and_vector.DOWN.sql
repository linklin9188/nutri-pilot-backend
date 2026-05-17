-- ============================================================================
-- ROLLBACK for 020_menu_evals_and_vector.sql
-- ============================================================================
-- ⚠️ DESTRUCTIVE. Read before running:
--   - DROP TABLE menu_evals: all eval history lost
--   - DROP COLUMN dishes.embedding: any populated vectors lost
--   - DOES NOT drop the vector extension (other future migrations may need it).
--     To remove extension entirely (rarely needed):
--       DROP EXTENSION vector;  -- run separately, with explicit ack
--
-- The bytea placeholder is NOT restored. If you re-roll-forward, the next
-- migration should add embedding directly as vector(768), skipping the bytea
-- placeholder step (that was 018-era scaffolding).
-- ============================================================================

BEGIN;

-- Drop menu_evals indexes first (DROP TABLE would cascade them anyway,
-- but explicit listing makes the rollback easier to audit).
DROP INDEX IF EXISTS menu_evals_pending_outcome_idx;
DROP INDEX IF EXISTS menu_evals_composer_run_idx;
DROP INDEX IF EXISTS menu_evals_agent_scenario_idx;
DROP INDEX IF EXISTS menu_evals_user_week_idx;
DROP INDEX IF EXISTS menu_evals_user_created_idx;

DROP TABLE IF EXISTS menu_evals;

-- Remove vector column from dishes (no bytea restoration — see header).
ALTER TABLE dishes DROP COLUMN IF EXISTS embedding;

-- Remove tracker entry
DELETE FROM supabase_migrations.schema_migrations WHERE version = '020';

COMMIT;
