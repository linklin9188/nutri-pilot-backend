-- Per-user, per-day, per-endpoint counter used by the L1 rate-limit
-- layer. Edge functions (parse-intent, create-checkout-session, …)
-- upsert into this table before doing any expensive work and reject
-- requests once the daily quota is exceeded. Counters reset at
-- midnight UTC.
--
-- Why a table not a Redis-style cache: zero infra, transactional
-- upsert, free for our scale (≤10K users × ~5 hits/day = 50K rows/day
-- which Postgres yawns at). Old rows can be pruned by a daily cron
-- if size becomes an issue (DELETE WHERE day < now()::date - 7).
--
-- Applied to remote DB on 2026-05-17.

CREATE TABLE IF NOT EXISTS public.api_usage_daily (
  user_id    TEXT        NOT NULL,
  day        DATE        NOT NULL,
  endpoint   TEXT        NOT NULL,
  count      INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_day ON public.api_usage_daily(day);
