-- 029_dishes_meta_column.sql
-- dishes.meta jsonb 列补齐 —— Backend 022 rollup 真跑依赖
-- 工单：TELEPOT-20260520-023
--
-- 背景：rollup 跑 UPDATE dishes SET meta = jsonb_set(meta, '{prep_steps_json_needs_regen}', 'true')
-- 时报 42703（meta 列不存在）。本 migration 加 nullable jsonb 列 + 部分索引。
--
-- 安全性：
--   - meta 列 nullable，所有现有 731 行 meta=NULL（不影响现有数据）
--   - 部分索引仅在 needs_regen='true' 时建，空间开销最小
--   - 不动 dishes 任何其他列
--   - 不变量 #1 自检：不加 FK→auth.users（meta 是 jsonb 列无 FK）

BEGIN;

-- dishes 表加 meta jsonb 列
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS meta jsonb;

-- 部分索引（按 meta->>'prep_steps_json_needs_regen' 查询，只索引 'true' 行节空间）
CREATE INDEX IF NOT EXISTS idx_dishes_meta_needs_regen
  ON dishes ((meta->>'prep_steps_json_needs_regen'))
  WHERE meta->>'prep_steps_json_needs_regen' = 'true';

COMMIT;
