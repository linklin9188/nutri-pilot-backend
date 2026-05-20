-- Migration 049 — data_health_history (Backend 越界，跨部门补漏)
--
-- TICKET-20260520-064 §A. Backend writes this migration with CEO's explicit
-- cross-department authorization (CLAUDE_BACKEND.md normally forbids touching
-- supabase/migrations/ — that's Database's surface). Reason: Database is
-- occupied with TICKET-065 (ingredient_seasonality) and Backend's daily
-- snapshot cron from TICKET-063 needs this table immediately to stop being
-- console.log-only and start writing real history rows.
--
-- Idempotent (IF NOT EXISTS) so re-running the migration on a project where
-- it's partially applied is safe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.data_health_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at       timestamptz NOT NULL DEFAULT now(),
  table_name        text NOT NULL,
  total_rows        int NOT NULL,
  missing_image     int,
  missing_nutrition int,
  with_ingredients  int,
  metadata          jsonb         -- the full data_health_summary.missing_details payload for that row
);

CREATE INDEX IF NOT EXISTS idx_data_health_history_snapshot
  ON public.data_health_history(snapshot_at DESC);

ALTER TABLE public.data_health_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_health_history_anon_read" ON public.data_health_history;
CREATE POLICY "data_health_history_anon_read"
  ON public.data_health_history FOR SELECT
  USING (true);

COMMIT;
