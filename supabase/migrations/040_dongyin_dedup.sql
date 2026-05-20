-- 040_dongyin_dedup.sql
-- P17 — 冬阴功汤 2 行 dedup（033 方案 A 5 步零数据丢失 FK 迁移 pattern）
-- 工单：TELEPOT-20260520-054 §A
--
-- 保留：5422f901-45bb-4857-852c-f51040f700b5（prep=8/cook=8 更丰富）
-- 删除：9a728f98-72d0-408d-9f68-c82f4a92173d（prep=5/cook=5）

BEGIN;

-- §1) 备份（含双行）
CREATE TABLE IF NOT EXISTS _archive_dongyin_pre_dedup_20260520_1610 AS
  SELECT * FROM dishes WHERE title_zh = '冬阴功汤';

-- §2) UPDATE dish_ingredients FK 迁移
UPDATE dish_ingredients
SET dish_id = '5422f901-45bb-4857-852c-f51040f700b5'::uuid
WHERE dish_id = '9a728f98-72d0-408d-9f68-c82f4a92173d'::uuid;

-- §3a) DELETE 必 PK 冲突的 user_dish_history 行
DELETE FROM user_dish_history h1
WHERE h1.dish_id = '9a728f98-72d0-408d-9f68-c82f4a92173d'::uuid
  AND EXISTS (
    SELECT 1 FROM user_dish_history h2
    WHERE h2.dish_id = '5422f901-45bb-4857-852c-f51040f700b5'::uuid
      AND h2.user_id = h1.user_id
      AND h2.served_date = h1.served_date
  );

-- §3b) UPDATE 不冲突的 user_dish_history 行
UPDATE user_dish_history
SET dish_id = '5422f901-45bb-4857-852c-f51040f700b5'::uuid
WHERE dish_id = '9a728f98-72d0-408d-9f68-c82f4a92173d'::uuid;

-- §4) user_weekly_menus.dish_ids array_replace
UPDATE user_weekly_menus
SET dish_ids = array_replace(
  dish_ids,
  '9a728f98-72d0-408d-9f68-c82f4a92173d'::uuid,
  '5422f901-45bb-4857-852c-f51040f700b5'::uuid
)
WHERE dish_ids @> ARRAY['9a728f98-72d0-408d-9f68-c82f4a92173d']::uuid[];

-- §5) DELETE 主行（此时 CASCADE 表上 0 引用，安全）
DELETE FROM dishes WHERE id = '9a728f98-72d0-408d-9f68-c82f4a92173d'::uuid;

COMMIT;
