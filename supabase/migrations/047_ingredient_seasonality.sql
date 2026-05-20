-- 047_ingredient_seasonality.sql
-- 实施 ingredient_seasonality 表 —— 24 节气 → 时令食材映射的 DB 化
-- 工单：TELEPOT-20260520-065 §A
--
-- 原 INGREDIENT_SEASONALITY map 硬编码在 src/hooks/useWeeklyMenu.ts:135 (ALGO_VERSION v43)。
-- 本表把数据迁到 DB，Algorithm 064 axis 31 可切 DB 数据源（forward-compat）。
-- 表结构按食材正向存储：一行一食材，solar_terms 数组列存"该食材出现在哪些节气"。
--
-- RLS: 匿名 SELECT 开放（食材-节气是公共数据，无 PII；写入仅 service role）。
-- 不变量 #1 自检：纯新表，无 FK→auth.users
-- 不变量 #4：不动 ALGO_VERSION（v43 保持，axis 31 切换由 Algorithm 控）

BEGIN;

CREATE TABLE IF NOT EXISTS ingredient_seasonality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('fruit', 'vegetable', 'meat', 'seafood', 'staple', 'other')),
  solar_terms text[] NOT NULL,
  peak_solar_term text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_seasonality_category
  ON ingredient_seasonality(category, ingredient_name);

ALTER TABLE ingredient_seasonality ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ingredient_seasonality_anon_read" ON ingredient_seasonality;
CREATE POLICY "ingredient_seasonality_anon_read" ON ingredient_seasonality
  FOR SELECT USING (true);

COMMIT;
