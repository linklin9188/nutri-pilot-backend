-- Migration 003 — Swap event tracking
-- =====================================================================
-- Every time a user replaces a dish (either via the Home '换菜' button
-- that re-rolls all dishes, the per-dish sync_alt button on Home, or
-- the swap drawer on WeeklyMenu), we record:
--   - which dish they rejected,
--   - which dish they kept instead,
--   - context (meal_type, source page).
--
-- This is a stronger preference signal than 'recordEngagement' (a user
-- viewing a dish) because the user is actively saying "not this one".
-- The frontend useFeedbackEngine reads these events to apply negative
-- EMA to the rejected dish's tags + positive EMA to the replacement.
--
-- No RLS — matches user_dish_history / user_preference_scores convention
-- in this beta phase.

CREATE TABLE IF NOT EXISTS user_swap_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  rejected_dish_id    uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  replacement_dish_id uuid REFERENCES dishes(id) ON DELETE SET NULL,
  meal_type           text,      -- '早餐' | '午餐' | '晚餐'
  source              text,      -- 'home_swap_all' | 'home_per_dish' | 'weekly_swap'
  swapped_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_events_user_recent
  ON user_swap_events(user_id, swapped_at DESC);

CREATE INDEX IF NOT EXISTS idx_swap_events_rejected_dish
  ON user_swap_events(rejected_dish_id);

COMMENT ON TABLE user_swap_events IS
  '用户换菜记录 — 拒绝信号 > 推荐曝光信号，用于训练偏好打分';
COMMENT ON COLUMN user_swap_events.source IS
  'home_swap_all / home_per_dish / weekly_swap';
