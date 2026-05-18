-- ============================================================================
-- Migration: 023_menu_evals_anon_update
-- Created:   2026-05-18
-- Author:    Aieats team
-- ============================================================================
-- Purpose:
--   Add the missing UPDATE policy to menu_evals so anon clients can patch
--   outcome / resolved_at fields after a Composer row is initially inserted.
--
-- Why this exists:
--   Migration 020 created menu_evals with INSERT + SELECT anon policies
--   only. The intended flow is:
--     1. planBanquet inserts a row with outcome=NULL (covered by 020's
--        menu_evals_insert_anon policy).
--     2. UI events (swap / replan / verify) call updateEvalOutcome which
--        runs supabase.from('menu_evals').update({outcome: '...'}).eq('id', evalId)
--     3. Without an UPDATE policy, PostgREST + RLS silently returns 0
--        rows affected (no error object), so the frontend's `if (error)`
--        check never fires — the outcome stays NULL forever and v1
--        observability is broken.
--
-- Risk profile:
--   Same level as menu_evals_insert_anon (USING (true) — any anon caller
--   can update any row). Acceptable for v1 per the anonymous-auth design
--   decision documented in CLAUDE.md. v2 should funnel outcome updates
--   through a service-role edge function alongside the Composer call.
-- ============================================================================

BEGIN;

CREATE POLICY "menu_evals_update_anon"
  ON menu_evals FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Record in the tracker (same pg.Client direct-INSERT pattern as 018/020).
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('023', 'menu_evals_anon_update')
ON CONFLICT (version) DO NOTHING;

COMMIT;
