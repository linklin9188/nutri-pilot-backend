-- 041_margherita_dedup.sql
-- P17 — 玛格丽特披萨 2 行 dedup（5 步 pattern）
-- 保留：7ccf1cbd-9b86-42a0-8054-8c829bce43ce（prep=5/cook=8 更丰富）
-- 删除：7f96d99b-f7ba-4407-9cc2-b2397a84147b（prep=4/cook=8）

BEGIN;

CREATE TABLE IF NOT EXISTS _archive_margherita_pre_dedup_20260520_1610 AS
  SELECT * FROM dishes WHERE title_zh = '玛格丽特披萨';

UPDATE dish_ingredients
SET dish_id = '7ccf1cbd-9b86-42a0-8054-8c829bce43ce'::uuid
WHERE dish_id = '7f96d99b-f7ba-4407-9cc2-b2397a84147b'::uuid;

DELETE FROM user_dish_history h1
WHERE h1.dish_id = '7f96d99b-f7ba-4407-9cc2-b2397a84147b'::uuid
  AND EXISTS (
    SELECT 1 FROM user_dish_history h2
    WHERE h2.dish_id = '7ccf1cbd-9b86-42a0-8054-8c829bce43ce'::uuid
      AND h2.user_id = h1.user_id
      AND h2.served_date = h1.served_date
  );

UPDATE user_dish_history
SET dish_id = '7ccf1cbd-9b86-42a0-8054-8c829bce43ce'::uuid
WHERE dish_id = '7f96d99b-f7ba-4407-9cc2-b2397a84147b'::uuid;

UPDATE user_weekly_menus
SET dish_ids = array_replace(
  dish_ids,
  '7f96d99b-f7ba-4407-9cc2-b2397a84147b'::uuid,
  '7ccf1cbd-9b86-42a0-8054-8c829bce43ce'::uuid
)
WHERE dish_ids @> ARRAY['7f96d99b-f7ba-4407-9cc2-b2397a84147b']::uuid[];

DELETE FROM dishes WHERE id = '7f96d99b-f7ba-4407-9cc2-b2397a84147b'::uuid;

COMMIT;
