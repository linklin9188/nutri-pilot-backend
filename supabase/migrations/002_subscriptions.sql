-- ============================================================
-- Migration 002 — Pro subscription columns + stripe_events table
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Add subscription columns to user_profiles ─────────────
-- is_pro is the single boolean the frontend reads via useSubscription().
-- The Stripe webhook keeps it in sync with the live subscription status.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_pro                boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_plan     text,           -- 'pro_monthly' | 'pro_yearly' | null
  ADD COLUMN IF NOT EXISTS subscription_end_at   timestamptz,    -- null → perpetual / unknown
  ADD COLUMN IF NOT EXISTS stripe_customer_id    text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer
  ON user_profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_subscription
  ON user_profiles(stripe_subscription_id);

-- ── 2. stripe_events — webhook idempotency log ───────────────
-- Stripe retries failed webhook deliveries. Storing the event id lets the
-- handler short-circuit on retries and gives us an audit trail.

CREATE TABLE IF NOT EXISTS stripe_events (
  id              text PRIMARY KEY,           -- Stripe event id (evt_...)
  type            text NOT NULL,              -- e.g. checkout.session.completed
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id     text,
  subscription_id text,
  payload         jsonb NOT NULL,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_user ON stripe_events(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_subscription ON stripe_events(subscription_id);

-- ── 3. RLS for subscription columns ──────────────────────────
-- user_profiles already has RLS from migration 001. Subscription columns
-- are readable by the owner; writes happen ONLY via the service-role key
-- in the Edge Function webhook handler.

-- (Existing self-read / self-write policies on user_profiles already cover
--  these columns. Service-role key bypasses RLS so the webhook can write.)

-- stripe_events should never be readable from the client:
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies = deny all anon/authenticated reads. Only service role can touch it.
