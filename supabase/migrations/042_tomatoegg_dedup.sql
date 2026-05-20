-- 042_tomatoegg_dedup.sql
-- P17 — 番茄炒蛋 2 行 dedup（5 步 pattern）
-- 保留：71d5d6f9-4ac4-4431-8b9e-a3518e38e5e3（prep=5/cook=8 更丰富）
-- 删除：9c1d4a2e-46ef-41ba-819c-fbd0837d935e（prep=4/cook=6）

BEGIN;

CREATE TABLE IF NOT EXISTS _archive_tomatoegg_pre_dedup_20260520_1610 AS
  SELECT * FROM dishes WHERE title_zh = '番茄炒蛋';

UPDATE dish_ingredients
SET dish_id = '71d5d6f9-4ac4-4431-8b9e-a3518e38e5e3'::uuid
WHERE dish_id = '9c1d4a2e-46ef-41ba-819c-fbd0837d935e'::uuid;

DELETE FROM user_dish_history h1
WHERE h1.dish_id = '9c1d4a2e-46ef-41ba-819c-fbd0837d935e'::uuid
  AND EXISTS (
    SELECT 1 FROM user_dish_history h2
    WHERE h2.dish_id = '71d5d6f9-4ac4-4431-8b9e-a3518e38e5e3'::uuid
      AND h2.user_id = h1.user_id
      AND h2.served_date = h1.served_date
  );

UPDATE user_dish_history
SET dish_id = '71d5d6f9-4ac4-4431-8b9e-a3518e38e5e3'::uuid
WHERE dish_id = '9c1d4a2e-46ef-41ba-819c-fbd0837d935e'::uuid;

UPDATE user_weekly_menus
SET dish_ids = array_replace(
  dish_ids,
  '9c1d4a2e-46ef-41ba-819c-fbd0837d935e'::uuid,
  '71d5d6f9-4ac4-4431-8b9e-a3518e38e5e3'::uuid
)
WHERE dish_ids @> ARRAY['9c1d4a2e-46ef-41ba-819c-fbd0837d935e']::uuid[];

DELETE FROM dishes WHERE id = '9c1d4a2e-46ef-41ba-819c-fbd0837d935e'::uuid;

COMMIT;
