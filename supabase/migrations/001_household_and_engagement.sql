-- ============================================================
-- Migration 001 — Household linking + Dish engagement tracking
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. households ───────────────────────────────────────────
-- One household per family. Employer creates it, helper joins.

CREATE TABLE IF NOT EXISTS households (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text,                          -- e.g. "Chan Family"
  invite_code   text UNIQUE,                   -- 6-digit code for helper to join
  created_at    timestamptz DEFAULT now()
);

-- Index for fast lookup by employer
CREATE INDEX IF NOT EXISTS idx_households_employer ON households(employer_id);

-- Auto-generate 6-digit invite code on insert
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_household_invite_code ON households;
CREATE TRIGGER trg_household_invite_code
  BEFORE INSERT ON households
  FOR EACH ROW EXECUTE FUNCTION generate_invite_code();

-- RLS
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer can manage own household"
  ON households FOR ALL
  USING (employer_id = auth.uid());

CREATE POLICY "helper can read household by invite code"
  ON households FOR SELECT
  USING (true);  -- fine-grained: helper queries by invite_code


-- ── 2. household_members ────────────────────────────────────
-- Links a helper to a household. Soft-delete via status.

CREATE TABLE IF NOT EXISTS household_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  helper_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'active'   -- 'active' | 'departed'
                CHECK (status IN ('active', 'departed')),
  joined_at     timestamptz DEFAULT now(),
  left_at       timestamptz,
  UNIQUE (household_id, helper_id)
);

CREATE INDEX IF NOT EXISTS idx_members_household ON household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_members_helper    ON household_members(helper_id);

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer can manage members"
  ON household_members FOR ALL
  USING (
    household_id IN (
      SELECT id FROM households WHERE employer_id = auth.uid()
    )
  );

CREATE POLICY "helper can read own membership"
  ON household_members FOR SELECT
  USING (helper_id = auth.uid());

CREATE POLICY "helper can insert own membership"
  ON household_members FOR INSERT
  WITH CHECK (helper_id = auth.uid());


-- ── 3. helper_reviews ───────────────────────────────────────
-- Employer rates each helper engagement (per household stint).
-- Bidirectional: helper can also see their own reviews.

CREATE TABLE IF NOT EXISTS helper_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  helper_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id     uuid NOT NULL REFERENCES auth.users(id),  -- employer
  overall_score   smallint NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  cooking_skill   smallint CHECK (cooking_skill BETWEEN 1 AND 5),
  reliability     smallint CHECK (reliability BETWEEN 1 AND 5),
  cleanliness     smallint CHECK (cleanliness BETWEEN 1 AND 5),
  comment         text,
  is_public       boolean DEFAULT true,   -- helper can choose to hide on next job
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_helper    ON helper_reviews(helper_id);
CREATE INDEX IF NOT EXISTS idx_reviews_household ON helper_reviews(household_id);

ALTER TABLE helper_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer can write review for own helper"
  ON helper_reviews FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid()
    AND household_id IN (
      SELECT id FROM households WHERE employer_id = auth.uid()
    )
  );

CREATE POLICY "anyone can read public reviews"
  ON helper_reviews FOR SELECT
  USING (is_public = true OR helper_id = auth.uid() OR reviewer_id = auth.uid());


-- ── 4. dishes — engagement tracking columns ─────────────────
-- Employer-centric signals for dish quality scoring.
-- health_score formula (weekly cron):
--   employer_crown_likes×0.40 + kept_rate×0.25 + repeat_rate×0.15
--   − swapped_rate×0.30

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS employer_crown_likes  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_kept_in_menu    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_employer_swapped integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_cooked          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_posted          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_rate           numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_score          numeric(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_scored_at        timestamptz DEFAULT NULL;

-- Convenience view: dishes with computed kept/swap rates
CREATE OR REPLACE VIEW dish_engagement AS
SELECT
  id,
  title_zh,
  employer_crown_likes,
  times_kept_in_menu,
  times_employer_swapped,
  times_cooked,
  times_posted,
  repeat_rate,
  health_score,
  last_scored_at,
  -- derived
  CASE
    WHEN (times_kept_in_menu + times_employer_swapped) = 0 THEN NULL
    ELSE ROUND(
      times_kept_in_menu::numeric /
      (times_kept_in_menu + times_employer_swapped), 3
    )
  END AS kept_rate,
  CASE
    WHEN (times_kept_in_menu + times_employer_swapped) = 0 THEN NULL
    ELSE ROUND(
      times_employer_swapped::numeric /
      (times_kept_in_menu + times_employer_swapped), 3
    )
  END AS swap_rate
FROM dishes;


-- ── 5. community_posts ──────────────────────────────────────
-- Stores helper photo check-in posts for the community feed.

CREATE TABLE IF NOT EXISTS community_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id    uuid REFERENCES households(id),
  dish_id         uuid REFERENCES dishes(id),
  dish_name       text NOT NULL,
  caption         text,
  photo_url       text NOT NULL,
  peer_likes      integer DEFAULT 0,
  employer_likes  integer DEFAULT 0,
  pts_earned      integer DEFAULT 15,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_helper    ON community_posts(helper_id);
CREATE INDEX IF NOT EXISTS idx_posts_created   ON community_posts(created_at DESC);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "helper can insert own post"
  ON community_posts FOR INSERT
  WITH CHECK (helper_id = auth.uid());

CREATE POLICY "anyone can read posts"
  ON community_posts FOR SELECT
  USING (true);

CREATE POLICY "helper can delete own post"
  ON community_posts FOR DELETE
  USING (helper_id = auth.uid());


-- ── Done ────────────────────────────────────────────────────
-- Tables created:
--   households, household_members, helper_reviews, community_posts
-- Columns added to dishes:
--   employer_crown_likes, times_kept_in_menu, times_employer_swapped,
--   times_cooked, times_posted, repeat_rate, health_score, last_scored_at
-- View created: dish_engagement
