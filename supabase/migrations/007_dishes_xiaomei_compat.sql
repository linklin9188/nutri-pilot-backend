-- Mark which dishes can be cooked by a 小美 / Thermomix-class cooking robot.
--
-- A user who tells the app "我有小美" gets a 🤖 badge on every dish that
-- the robot can plausibly make end-to-end (chop / stir / heat / steam /
-- simmer / sauce reduction) — and a score boost in the recommendation
-- pool so robot-doable dishes float to the top of their menu.
--
-- We don't FK to a separate xiaomei_recipes table because the user
-- doesn't need recipe IDs — they just need to know "robot can do this,
-- great, hand it to the robot" vs "needs oven / deep fryer / manual
-- folding". A backfill script flags dishes by scanning cook_steps_json
-- for incompatible operations (烤箱 / 油炸 / 烤架 / 包饺子 / sashimi …).
--
-- Default FALSE so unlabeled rows are conservatively excluded.

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS xiaomei_compatible BOOLEAN NOT NULL DEFAULT FALSE;

-- Optional human-readable reason for why a dish is NOT compatible, for
-- when we surface this in the UI ("needs oven", "deep frying", etc.).
ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS xiaomei_incompat_reason TEXT;

CREATE INDEX IF NOT EXISTS dishes_xiaomei_compat_idx
  ON dishes(xiaomei_compatible)
  WHERE xiaomei_compatible = TRUE;
