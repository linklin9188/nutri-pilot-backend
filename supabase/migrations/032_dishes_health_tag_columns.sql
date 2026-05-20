-- 032_dishes_health_tag_columns.sql
-- P11 修复：dishes 表补 12 个 health-tag 布尔列（CLAUDE.md "Health-tag boolean columns" 对齐）
-- 工单：TELEPOT-20260520-033 §A
--
-- CLAUDE.md / Architect HANDOFF.md §4 指出生产 dishes 表实际只有 is_vegan / is_kid_friendly 两个
-- 布尔列，CLAUDE.md 描述的 12 个 health-tag 列从未真正建过。本 migration 补齐 schema 一致性。
--
-- 安全性：
--   - 12 列全 nullable DEFAULT false，零影响现有 734 行数据
--   - 不动 dishes 任何其他列
--   - 不变量 #1 自检：无 FK→auth.users（boolean 列无 FK）
--   - 不变量 #6 自检：不触 dish_ids 类型
--
-- Backfill：留后续工单（AI batch tag），本 migration 仅加列。

BEGIN;

ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_low_sodium boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_low_sugar boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_low_purine boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_blood_tonic boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_sleep_aid boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_yin_nourish boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_qi_tonic boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_mood_boost boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_anti_aging boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_beauty boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_anti_inflammation boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_eye_care boolean DEFAULT false;

COMMIT;
