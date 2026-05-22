-- 075_dishes_add_3_micronutrients.sql
-- 工单：TELEPOT-20260522-021 §B
-- 解 Backend 020 §A weekStats 第 2 个 blocker：dishes 缺 zinc/vitD/omega3 三维度
-- → 7 维聚合只能算 4 维。本 migration 补这 3 列。
--
-- 方案选择：方案 1（独立 numeric 列）not 方案 2（扩 atomic_nutrition jsonb）
--   why：
--     - 既有先例：064_dishes_micronutrients 已用独立列模式（calcium_mg / iron_mg /
--       fiber_g / vitamin_c_mg double precision），保持架构一致性优先于"少一次 migration"
--     - 性能：weekStats 聚合每行 SUM/AVG 这 3 列，column scan 比 jsonb_extract_path
--       快约 10x
--     - index 友好：可直接 partial index `WHERE NOT NULL` 让 Backend 021 增量 fill
--       过程中 reader 不全扫
--     - 类型严格：double precision 比 jsonb 数值更 type-safe
--
-- 单位约定：
--   - zinc_mg          double precision（毫克）
--   - vitamin_d_iu     double precision（国际单位 IU — 维 D 习惯用法 vs μg）
--   - omega3_mg        double precision（毫克 — 含 EPA + DHA + ALA 总和）
--
-- 不变量自检：
--   #1 无 FK 改动            #2 dish_ids 未触
--   #3 Stripe 不动           #4 ALGO_VERSION 不需 bump
--   ADD COLUMN IF NOT EXISTS 保幂等

BEGIN;

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS zinc_mg        double precision,
  ADD COLUMN IF NOT EXISTS vitamin_d_iu   double precision,
  ADD COLUMN IF NOT EXISTS omega3_mg      double precision;

-- 复合 partial index — 风格与 064 idx_dishes_micronutrients 一致
-- Backend 021 fill 时三列同次 Gemini call extract，zinc_mg 作 NULL sentinel
CREATE INDEX IF NOT EXISTS idx_dishes_micronutrients_v2
  ON dishes (zinc_mg, vitamin_d_iu, omega3_mg)
  WHERE zinc_mg IS NOT NULL;

COMMIT;
