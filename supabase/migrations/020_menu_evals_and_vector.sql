-- ============================================================================
-- Migration: 020_menu_evals_and_vector
-- Created:   2026-05-18
-- Target ALGO_VERSION on consumption: v38
-- Author:    Aieats team
-- Depends on: 018 (dishes.embedding bytea placeholder exists)
-- ============================================================================
-- Purpose:
--   1. Enable pgvector extension (into `extensions` schema, Supabase idiomatic)
--   2. Replace 018's dishes.embedding bytea placeholder with vector(768)
--   3. Create menu_evals table for Composer/Critic output + outcome tracking
--
-- Hard rules followed (CLAUDE.md):
--   - No FK→auth.users
--   - Custom auth: user_id is text, not uuid FK
--   - dish_ids columns use uuid[] not text[]
--   - No new column added that would force ALGO_VERSION bump
--
-- Decisions (per conversation):
--   - 019 (scoring_rules) abandoned: YAGNI + dual-source-of-truth risk
--   - IVFFlat index deferred until rows >= 5000
--   - menu_evals uses jsonb-heavy schema (outcomes still TBD)
--   - menu_evals denormalizes dish_ids (no FK; menu may never reach
--     user_weekly_menus if Critic rejects)
--   - vector extension installed in `extensions` schema, not `public`
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 1: Enable pgvector in extensions schema
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;


-- ----------------------------------------------------------------------------
-- SECTION 2: Verify 018 sentinel before replacing embedding column
-- ----------------------------------------------------------------------------
-- Forensic guard against the scenario "someone manually re-typed the column
-- between 018 and 020 without updating tracker". If sentinel comment is
-- missing/modified, abort rather than destroy unknown data.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  col_comment text;
BEGIN
  SELECT col_description(
    (SELECT oid FROM pg_class
       WHERE relname = 'dishes'
         AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')),
    (SELECT attnum FROM pg_attribute
       WHERE attrelid = (SELECT oid FROM pg_class
                          WHERE relname = 'dishes'
                            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
         AND attname = 'embedding')
  ) INTO col_comment;

  IF col_comment IS NULL OR col_comment NOT LIKE '%MIGRATION_005_PLACEHOLDER%' THEN
    -- Note: sentinel string is "005" because that was the logical migration
    -- number before renumbering to 018. Sentinel text was intentionally not
    -- changed in 018 SQL to preserve forensic traceability.
    RAISE EXCEPTION
      'embedding column sentinel missing or modified. Expected MIGRATION_005_PLACEHOLDER, got: %. Aborting.',
      COALESCE(col_comment, '<no comment>');
  END IF;

  RAISE NOTICE '✓ Sentinel verified: embedding column is 018 placeholder, safe to replace.';
END $$;


-- ----------------------------------------------------------------------------
-- SECTION 3: Replace bytea placeholder with vector(768)
-- ----------------------------------------------------------------------------
ALTER TABLE dishes DROP COLUMN embedding;

ALTER TABLE dishes
  ADD COLUMN embedding vector(768) DEFAULT NULL;

COMMENT ON COLUMN dishes.embedding IS
  'Gemini text-embedding-004 (768d) embedding of title + description. NULL = not yet generated. Populated by backfill pipeline keyed on dishes.last_backfilled_at.';


-- ----------------------------------------------------------------------------
-- SECTION 4: IVFFlat index DEFERRED (see commented block at end of file)
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- SECTION 5: menu_evals table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_evals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who/what produced this row
  agent           text NOT NULL CHECK (agent IN ('composer', 'critic', 'orchestrator')),
  scenario        text,                    -- 'banquet' / 'wellness' / 'school_balance_dinner' / 'custom_theme' / etc.
                                           -- NULL only for orchestrator-level rows
  composer_run_id uuid,                    -- Links Critic eval rows back to the Composer run they audited.
                                           -- NULL for Composer rows; populated for Critic rows.

  -- User context (custom auth, no FK)
  user_id         text NOT NULL,
  segment         text CHECK (segment IS NULL OR segment IN ('A', 'B', 'C', 'D')),

  -- Time axis (week_start required to support weekly replay queries)
  week_start      date,                    -- Monday of the week this menu is for. NULL for single-meal scenarios.
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,             -- When outcome was finalized (user_accepted, user_abandoned timestamp)

  -- Algo + prompt provenance
  algo_version_consumed text NOT NULL,     -- 'v37' at time of writing
  prompt_version  text,                    -- 'composer_v1.0', 'critic_v1.0', etc.

  -- The menu / output (denormalized copy — see header rationale)
  dish_ids        uuid[] DEFAULT '{}',     -- uuid[] per CLAUDE.md DB conventions
  output_json     jsonb,                   -- Full Composer/Critic JSON output for forensic replay

  -- Evaluation signals
  outcome         text CHECK (outcome IS NULL OR outcome IN (
                    'accepted',          -- Critic passed; user saw it
                    'revised',           -- Critic asked Composer to revise (loop 1)
                    'revised_2',         -- Critic asked Composer to revise (loop 2)
                    'rejected',          -- Critic blocked → needs_clarification surfaced to user
                    'user_accepted',     -- User saved / cooked from it
                    'user_swapped',      -- User swapped ≥1 dish
                    'user_abandoned'     -- User neither saved nor swapped within 24h
                  )),
  eval_metrics    jsonb DEFAULT '{}',     -- { "theme_coverage_rate": 0.72, "kid_friendly_ratio": 0.66, ... }
  tradeoffs       jsonb DEFAULT '[]',     -- Mirror of Composer's tradeoffs_to_surface
  critic_issues   jsonb DEFAULT '[]'      -- If agent='critic', the blocking issues found
);

COMMENT ON TABLE menu_evals IS
  'Composer/Critic agent outputs + user-behavior outcomes. jsonb-heavy by design (early stage). Created by migration 020.';


-- ----------------------------------------------------------------------------
-- SECTION 6: Indexes on menu_evals
-- ----------------------------------------------------------------------------
CREATE INDEX menu_evals_user_created_idx
  ON menu_evals (user_id, created_at DESC);

CREATE INDEX menu_evals_user_week_idx
  ON menu_evals (user_id, week_start)
  WHERE week_start IS NOT NULL;

CREATE INDEX menu_evals_agent_scenario_idx
  ON menu_evals (agent, scenario)
  WHERE scenario IS NOT NULL;

CREATE INDEX menu_evals_composer_run_idx
  ON menu_evals (composer_run_id)
  WHERE composer_run_id IS NOT NULL;

CREATE INDEX menu_evals_pending_outcome_idx
  ON menu_evals (created_at DESC)
  WHERE outcome IS NULL;


-- ----------------------------------------------------------------------------
-- SECTION 7: RLS for menu_evals
-- ----------------------------------------------------------------------------
ALTER TABLE menu_evals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_evals_insert_anon"
  ON menu_evals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "menu_evals_select_anon"
  ON menu_evals FOR SELECT
  USING (true);


-- ----------------------------------------------------------------------------
-- SECTION 8: Tracker INSERT
-- ----------------------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('020', 'menu_evals_and_vector')
ON CONFLICT (version) DO NOTHING;


COMMIT;


-- ============================================================================
-- DEFERRED: IVFFlat index (DO NOT UNCOMMENT until dishes row count >= 5000)
-- ============================================================================
-- CREATE INDEX dishes_embedding_ivfflat_idx
--   ON dishes USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 50);
--
-- Alternative HNSW (better recall, slower build):
-- CREATE INDEX dishes_embedding_hnsw_idx
--   ON dishes USING hnsw (embedding vector_cosine_ops);
-- ============================================================================
