-- Nutrition data needed to implement the rest of the 中国营养主厨 rules:
--   - 30 / 40 / 30 三餐能量分配 → need per-serving kcal
--   - 油 25-30g / 盐 <5g / 糖 <25g 每日上限 → need per-dish level estimates
--   - 鱼 / 肉 / 蛋 / 奶 / 豆 每日必现 → need protein_source per dish
--   - 12 食物 / 天 + 25 / 周 → use protein_source + cook_method diversity
--   - 烹饪方式不重复（4 道炒 太单调）→ need cook_method
--
-- All fields are filled by scripts/backfill-dish-nutrition.ts which uses
-- Claude haiku to evaluate each row's prep_steps_json + cook_steps_json
-- + title + main_ingredient and produce a structured JSON answer.

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS nutrition_kcal_per_serving  INT,
  ADD COLUMN IF NOT EXISTS oil_level    TEXT CHECK (oil_level   IS NULL OR oil_level   IN ('low','mid','high')),
  ADD COLUMN IF NOT EXISTS salt_level   TEXT CHECK (salt_level  IS NULL OR salt_level  IN ('low','mid','high')),
  ADD COLUMN IF NOT EXISTS sugar_level  TEXT CHECK (sugar_level IS NULL OR sugar_level IN ('low','mid','high')),
  ADD COLUMN IF NOT EXISTS protein_source TEXT[],
  ADD COLUMN IF NOT EXISTS cook_method  TEXT CHECK (cook_method IS NULL OR cook_method IN
    ('stir_fry','steam','boil','stew','pan_fry','deep_fry','grill','roast','bake','mix_cold','raw','blanch','braise'));

-- Partial index — frequently we filter "low salt only" or
-- "non-deep-fry only" so a partial index helps.
CREATE INDEX IF NOT EXISTS dishes_low_salt_idx ON dishes(id) WHERE salt_level = 'low';
CREATE INDEX IF NOT EXISTS dishes_low_oil_idx  ON dishes(id) WHERE oil_level  = 'low';
