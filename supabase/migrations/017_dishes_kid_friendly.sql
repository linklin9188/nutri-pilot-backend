-- 017_dishes_kid_friendly.sql
--
-- Boolean tag for "kid-friendly" dishes. Drives a +0.20 score bonus in
-- scoreDish when the household has kids (nutri_kids > 0), so families
-- with children see milder / more familiar formats float up automatically.
--
-- Backfill heuristic (intentionally permissive; users can hand-fix later):
--   · NOT spicy / very_salty (kids can't handle)
--   · oil_level != 'high' (greasy bad for growing kids)
--   · familiar protein category (no organ meats, no raw seafood)
--
-- Specific kid-favorite formats (蒸蛋 / 番茄炒蛋 / 蛋花汤 / 红烧肉 / 鸡腿
-- 牛奶炖蛋 / 小笼包 / 排骨米饭 …) all pass this filter naturally.

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS is_kid_friendly BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_dishes_kid_friendly
  ON dishes(is_kid_friendly) WHERE is_kid_friendly = TRUE;

-- Backfill: tag the safe set as kid-friendly.
UPDATE dishes SET is_kid_friendly = TRUE
WHERE
  -- Exclude spicy / very salty by flavor tag
  NOT ('spicy'      = ANY(COALESCE(flavor_tags, ARRAY[]::TEXT[])))
  AND NOT ('very_salty' = ANY(COALESCE(flavor_tags, ARRAY[]::TEXT[])))
  AND NOT ('fried'      = ANY(COALESCE(flavor_tags, ARRAY[]::TEXT[])))
  -- Exclude high-oil dishes (when graded)
  AND (oil_level IS NULL OR oil_level != 'high')
  -- Only familiar protein categories
  AND COALESCE(main_ingredient, '') IN (
    'poultry','pork','beef','egg','tofu','grain','fish',
    'carb','veggie','fruit','dairy','shellfish','seafood','soy'
  )
  -- Exclude obvious organ / raw-fish / spicy-naming patterns
  AND title_zh NOT LIKE '%肝%'
  AND title_zh NOT LIKE '%腰花%'
  AND title_zh NOT LIKE '%肠%'
  AND title_zh NOT LIKE '%血%'
  AND title_zh NOT LIKE '%刺身%'
  AND title_zh NOT LIKE '%生鱼%'
  AND title_zh NOT LIKE '%麻辣%'
  AND title_zh NOT LIKE '%剁椒%';

COMMENT ON COLUMN dishes.is_kid_friendly IS
  'TRUE when dish is suitable for households with kids (nutri_kids>0). Drives a +0.20 bias in scoreDish; auto-tagged at migration 017 by mild + familiar heuristic; manually adjustable.';
