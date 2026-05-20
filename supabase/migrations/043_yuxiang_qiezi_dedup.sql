-- 043_yuxiang_qiezi_dedup.sql
-- P17 — 鱼香茄子 2 行 dedup（5 步 pattern）
-- 保留：d10fb39b-128e-4aab-93b7-df7a19d3121c（prep=5/cook=9 更丰富 + last_backfilled 更新）
-- 删除：b1aacb82-7a17-440f-aef3-79d8b3ece34b（prep=5/cook=6）

BEGIN;

CREATE TABLE IF NOT EXISTS _archive_yuxiang_qiezi_pre_dedup_20260520_1610 AS
  SELECT * FROM dishes WHERE title_zh = '鱼香茄子';

UPDATE dish_ingredients
SET dish_id = 'd10fb39b-128e-4aab-93b7-df7a19d3121c'::uuid
WHERE dish_id = 'b1aacb82-7a17-440f-aef3-79d8b3ece34b'::uuid;

DELETE FROM user_dish_history h1
WHERE h1.dish_id = 'b1aacb82-7a17-440f-aef3-79d8b3ece34b'::uuid
  AND EXISTS (
    SELECT 1 FROM user_dish_history h2
    WHERE h2.dish_id = 'd10fb39b-128e-4aab-93b7-df7a19d3121c'::uuid
      AND h2.user_id = h1.user_id
      AND h2.served_date = h1.served_date
  );

UPDATE user_dish_history
SET dish_id = 'd10fb39b-128e-4aab-93b7-df7a19d3121c'::uuid
WHERE dish_id = 'b1aacb82-7a17-440f-aef3-79d8b3ece34b'::uuid;

UPDATE user_weekly_menus
SET dish_ids = array_replace(
  dish_ids,
  'b1aacb82-7a17-440f-aef3-79d8b3ece34b'::uuid,
  'd10fb39b-128e-4aab-93b7-df7a19d3121c'::uuid
)
WHERE dish_ids @> ARRAY['b1aacb82-7a17-440f-aef3-79d8b3ece34b']::uuid[];

DELETE FROM dishes WHERE id = 'b1aacb82-7a17-440f-aef3-79d8b3ece34b'::uuid;

COMMIT;
