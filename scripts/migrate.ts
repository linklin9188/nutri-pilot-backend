/**
 * Database migration script — run with: npx tsx scripts/migrate.ts
 * Creates all tables needed for the 6-axis recommendation system.
 */

import pg from 'pg';
import { config } from 'dotenv';

config(); // load .env

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
-- ── 1. user_profiles (Onboarding 5D data) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id                TEXT PRIMARY KEY,
  taste_preferences TEXT[]      DEFAULT '{}',
  curation_tags     TEXT[]      DEFAULT '{}',
  household_size    INT         DEFAULT 4,
  helper_language   TEXT        DEFAULT 'English',
  -- 5D scoring axes (mapped from onboarding)
  hometown_cuisine  TEXT,
  dietary_goal      TEXT,
  taste_pref        TEXT,
  age_group         TEXT,
  avoid_tags        TEXT[]      DEFAULT '{}',
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles' AND policyname = 'users_own_profile'
  ) THEN
    CREATE POLICY "users_own_profile" ON user_profiles
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── 2. user_preference_scores (Feedback EMA learning) ───────────────────────
CREATE TABLE IF NOT EXISTS user_preference_scores (
  user_id              TEXT PRIMARY KEY,
  -- Flavor axis
  pref_light           FLOAT DEFAULT 0,
  pref_spicy           FLOAT DEFAULT 0,
  pref_sweet           FLOAT DEFAULT 0,
  pref_salty           FLOAT DEFAULT 0,
  pref_sour            FLOAT DEFAULT 0,
  pref_seafood         FLOAT DEFAULT 0,
  pref_veggie          FLOAT DEFAULT 0,
  -- Health axis
  pref_damp_clear      FLOAT DEFAULT 0,
  pref_muscle_gain     FLOAT DEFAULT 0,
  pref_lose_weight     FLOAT DEFAULT 0,
  pref_maintain        FLOAT DEFAULT 0,
  pref_detox           FLOAT DEFAULT 0,
  pref_authentic_hk    FLOAT DEFAULT 0,
  -- Cuisine axis
  pref_cantonese       FLOAT DEFAULT 0,
  pref_sichuan         FLOAT DEFAULT 0,
  pref_jiangnan        FLOAT DEFAULT 0,
  pref_northern        FLOAT DEFAULT 0,
  pref_western         FLOAT DEFAULT 0,
  pref_japanese_korean FLOAT DEFAULT 0,
  pref_southeast_asian FLOAT DEFAULT 0,
  -- Meta
  feedback_count       INT         DEFAULT 0,
  last_updated         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_preference_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_preference_scores' AND policyname = 'users_own_scores'
  ) THEN
    CREATE POLICY "users_own_scores" ON user_preference_scores
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── 3. user_feedback (Raw text feedback log) ────────────────────────────────
CREATE TABLE IF NOT EXISTS user_feedback (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,
  feedback_text   TEXT        NOT NULL,
  flavor_signals  JSONB       DEFAULT '{}',
  health_signals  JSONB       DEFAULT '{}',
  cuisine_signal  TEXT,
  is_dish_request BOOLEAN     DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_user_idx ON user_feedback (user_id);
CREATE INDEX IF NOT EXISTS user_feedback_date_idx ON user_feedback (created_at DESC);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_feedback' AND policyname = 'feedback_insert'
  ) THEN
    CREATE POLICY "feedback_insert" ON user_feedback FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_feedback' AND policyname = 'feedback_select'
  ) THEN
    CREATE POLICY "feedback_select" ON user_feedback FOR SELECT USING (true);
  END IF;
END $$;


-- ── 4. dish_requests (Menu expansion wishlist) ───────────────────────────────
CREATE TABLE IF NOT EXISTS dish_requests (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_text     TEXT        NOT NULL,
  inferred_cuisine TEXT,
  request_count    INT         DEFAULT 1,
  status           TEXT        DEFAULT 'pending'
                   CHECK (status IN ('pending', 'under_review', 'added', 'declined')),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dish_requests_status_idx
  ON dish_requests (status, request_count DESC);

ALTER TABLE dish_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dish_requests' AND policyname = 'dish_request_insert'
  ) THEN
    CREATE POLICY "dish_request_insert" ON dish_requests FOR INSERT WITH CHECK (true);
  END IF;
END $$;
`;

async function migrate() {
  await client.connect();
  console.log('🔗 Connected to Supabase PostgreSQL');

  try {
    await client.query(SQL);
    console.log('✅ All tables created / verified successfully');

    // Verify
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('user_profiles','user_preference_scores','user_feedback','dish_requests')
      ORDER BY table_name;
    `);
    console.log('📋 Tables confirmed:', rows.map(r => r.table_name).join(', '));
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
