-- 033_mapo_doufu_dedup.sql
-- P12 修复：麻婆豆腐 2 行 dedup（CEO 批准方案 A，5 步零数据丢失 FK 迁移）
-- 工单：TELEPOT-20260520-033 §B / ACK_FROM_CEO 2026-05-20T13:35:00+08:00
--
-- dedup 决策：
--   保留：d94044cf-7d16-4239-a577-8945420aeea4（prep_steps=7 / cook_steps=8 更丰富）
--   删除：4eb35a1d-8edb-4699-a754-d857be81376a（prep_steps=5 / cook_steps=7）
--
-- 数据完整性保护（CASCADE 风险见 telepot_response_database.md NOTES）：
--   4eb35a1d 被 7 张 FK 表引用：
--     - dish_ingredients (CASCADE, 8 行) → 必须迁移到 d94044cf 否则下游 shopping list 损坏
--     - user_dish_history (CASCADE, 2 行) → 迁移 + DELETE 1 行 PK 冲突
--     - user_weekly_menus.dish_ids (uuid[] 无 FK, 2 行) → array_replace
--     - 其他 4 张表 0 引用
--
-- 安全模型：
--   - BEGIN/COMMIT 包裹，任一步失败回滚干净
--   - 备份表 _archive_mapo_dedup_20260520_1437 保底
--   - 不变量 #1 自检：无 FK→auth.users
--   - 不变量 #6 自检：所有 uuid cast 显式 ::uuid

BEGIN;

-- §1) 备份待删行（CEO 工单硬约束）
CREATE TABLE IF NOT EXISTS _archive_mapo_dedup_20260520_1437 AS
  SELECT * FROM dishes WHERE title_zh = '麻婆豆腐';

-- §2) 迁移 dish_ingredients（8 行）：FK 列 UPDATE 到保留 row
UPDATE dish_ingredients
SET dish_id = 'd94044cf-7d16-4239-a577-8945420aeea4'::uuid
WHERE dish_id = '4eb35a1d-8edb-4699-a754-d857be81376a'::uuid;

-- §3) 处理 user_dish_history（PK 复合 (user_id, dish_id, served_date)）：
--    先 DELETE 必 PK 冲突的行（同一 user + served_date 但 dish_id 不同），再 UPDATE 不冲突的行
--    本轮已知 preview-user/2026-05-13 是必冲突行（preview-user 在 d94044cf 上也有同日历史）

-- §3a) DELETE 必冲突行（用 EXISTS 子查询，不写死 user_id 通用）
DELETE FROM user_dish_history h1
WHERE h1.dish_id = '4eb35a1d-8edb-4699-a754-d857be81376a'::uuid
  AND EXISTS (
    SELECT 1 FROM user_dish_history h2
    WHERE h2.dish_id = 'd94044cf-7d16-4239-a577-8945420aeea4'::uuid
      AND h2.user_id = h1.user_id
      AND h2.served_date = h1.served_date
  );

-- §3b) UPDATE 剩余不冲突行
UPDATE user_dish_history
SET dish_id = 'd94044cf-7d16-4239-a577-8945420aeea4'::uuid
WHERE dish_id = '4eb35a1d-8edb-4699-a754-d857be81376a'::uuid;

-- §4) user_weekly_menus.dish_ids 数组替换（2 行）
UPDATE user_weekly_menus
SET dish_ids = array_replace(
  dish_ids,
  '4eb35a1d-8edb-4699-a754-d857be81376a'::uuid,
  'd94044cf-7d16-4239-a577-8945420aeea4'::uuid
)
WHERE dish_ids @> ARRAY['4eb35a1d-8edb-4699-a754-d857be81376a']::uuid[];

-- §5) 现在 CASCADE 表上 4eb35a1d 引用应为 0，安全 DELETE
DELETE FROM dishes
WHERE id = '4eb35a1d-8edb-4699-a754-d857be81376a'::uuid;

COMMIT;
