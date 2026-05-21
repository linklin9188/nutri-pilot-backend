-- 064_dishes_micronutrients.sql
-- 工单：TELEPOT-20260521-006（dishes +4 微量营养素列 — Backend 005 阻塞解锁）
--
-- Backend 005 实查发现 dishes 只有 3/7 原子营养素：
--   ✓ protein_g / fat_g / carb_g
--   ✗ calcium_mg / iron_mg / fiber_g / vitamin_c_mg
-- 本棒加 4 缺失列 + 复合 index（仅索引非 NULL 行）。
--
-- 不变量自检：
--   #1 无 FK 改动
--   #2 dish_ids 未触
--   #4 ALGO_VERSION 不需 bump（仅扩字段，未改算法逻辑）
--   #6 dish.id uuid 未变
--   ADD COLUMN IF NOT EXISTS 保幂等，重跑 0 副作用

BEGIN;

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS calcium_mg     double precision,
  ADD COLUMN IF NOT EXISTS iron_mg        double precision,
  ADD COLUMN IF NOT EXISTS fiber_g        double precision,
  ADD COLUMN IF NOT EXISTS vitamin_c_mg   double precision;

-- 部分索引：只索引已填充的行（Backend 005 跑完前大量 NULL，避免索引膨胀）
CREATE INDEX IF NOT EXISTS idx_dishes_micronutrients
  ON dishes(calcium_mg, iron_mg, fiber_g, vitamin_c_mg)
  WHERE calcium_mg IS NOT NULL;

COMMIT;
