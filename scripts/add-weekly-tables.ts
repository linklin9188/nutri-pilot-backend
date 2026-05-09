/**
 * Migration: create user_dish_history and user_weekly_menus tables
 * Run: npx tsx scripts/add-weekly-tables.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
-- ── 1. Dish serve history (for 30-day non-repeat tracking) ─────────────────
CREATE TABLE IF NOT EXISTS user_dish_history (
  user_id     TEXT  NOT NULL,
  dish_id     UUID  NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  served_date DATE  NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, dish_id, served_date)
);

CREATE INDEX IF NOT EXISTS history_user_date_idx
  ON user_dish_history (user_id, served_date DESC);

-- ── 2. Weekly menu cache ────────────────────────────────────────────────────
-- Stores one row per day per user per week.
-- dish_ids is an ordered array of 5 dish UUIDs.
-- swapped_dish_ids tracks user overrides (null = no swap for that slot).
CREATE TABLE IF NOT EXISTS user_weekly_menus (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT    NOT NULL,
  week_start      DATE    NOT NULL,  -- always Monday
  day_index       INT     NOT NULL,  -- 0=Mon … 6=Sun
  meal_type       TEXT    NOT NULL DEFAULT 'dinner',
  dish_ids        UUID[]  NOT NULL,
  swapped_dish_ids UUID[] DEFAULT NULL,  -- user manual overrides
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, week_start, day_index, meal_type)
);

CREATE INDEX IF NOT EXISTS weekly_menu_user_week_idx
  ON user_weekly_menus (user_id, week_start, meal_type);

ALTER TABLE user_dish_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_weekly_menus  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_dish_history' AND policyname='history_rw') THEN
    CREATE POLICY "history_rw" ON user_dish_history FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_weekly_menus' AND policyname='weekly_rw') THEN
    CREATE POLICY "weekly_rw" ON user_weekly_menus FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

async function main() {
  await client.connect();
  console.log('🔗 Connected');
  await client.query(SQL);
  console.log('✅ Tables created: user_dish_history, user_weekly_menus');
  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
