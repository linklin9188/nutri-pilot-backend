-- 039_dishes_special_health.sql
-- Day 11 §A：dishes 表加 3 个 special health boolean 列
-- 依据：SPEC_special_health_goals.md §3（Algorithm 043 §C 起草，046 §A 让 Database 实施）
-- 工单：TELEPOT-20260520-048
--
-- 3 列语义：
--   is_prenatal_friendly   备孕/孕期友好（高叶酸 / 高铁 / 易消化 / 避生冷）
--   is_lactation_friendly  哺乳期友好（高蛋白 / 高钙 / 通乳食材）
--   is_elderly_friendly    老年友好（软烂易嚼 / 低盐 / 低糖 / 易消化）
--
-- 安全性：
--   - 3 列 nullable DEFAULT false，零影响现有 752 行
--   - 不动 dishes 其他列
--   - 不变量 #1 自检：boolean 列无 FK
--   - 不变量 #4：未触 ALGO_VERSION（保持 v42）
--
-- Backfill：留后续工单（AI batch tag）。本 migration 仅加 schema。

BEGIN;

ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_prenatal_friendly boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_lactation_friendly boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_elderly_friendly boolean DEFAULT false;

COMMIT;
