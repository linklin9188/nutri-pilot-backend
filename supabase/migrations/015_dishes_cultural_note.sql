-- 015_dishes_cultural_note.sql
--
-- Simply Chinese Feasts 4D framework, Phase 3 — 文化背景 / cultural_note.
--
-- Adds an optional one-paragraph backstory to dishes (origin / festival /
-- family meaning). Populated only for festive, regional-iconic, or family-
-- tradition dishes (饺子、月饼、宫保鸡丁、白切鸡 …) — everyday dishes leave
-- it NULL.
--
-- Surfaces in:
--   - Dish detail page → "为什么这道菜" section
--   - Home → 节庆 / 文化菜 highlight rail when present
--
-- Written by scripts/gen-dish-steps-claude.ts (4D-prompt version) when the
-- model deems the dish culturally notable, and by future hand-curated
-- backfill for the canonical festive dishes.

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS cultural_note TEXT;

COMMENT ON COLUMN dishes.cultural_note IS
  '文化背景：origin / festival / family meaning. ≤280 chars. NULL for everyday dishes. Surfaces in dish detail and the 节庆 highlight rail.';
