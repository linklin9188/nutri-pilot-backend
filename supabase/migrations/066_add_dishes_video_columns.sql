-- 066_add_dishes_video_columns.sql
-- 工单：TELEPOT-20260521-012 §B
-- Add video tutorial columns per memory project_video_tutorial_scope
-- Scope: lunch/dinner × (meat/seafood/HK-GD-soup/complex-soup) only.
-- Other dishes (breakfast/vegetable/simple-soup) keep video_url NULL.
--
-- 不变量自检：
--   #1 无 FK 改动                             #2 dish_ids 未触
--   #4 ALGO_VERSION 不需 bump（仅扩字段，未改算法逻辑）
--   #6 dish.id uuid 未变
--   ADD COLUMN IF NOT EXISTS 保幂等，重跑 0 副作用

BEGIN;

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS video_url      TEXT,
  ADD COLUMN IF NOT EXISTS video_lang     TEXT,  -- 'en' / 'zh' / 'tl' / 'id'
  ADD COLUMN IF NOT EXISTS video_platform TEXT;  -- 'youtube' / 'bilibili' / 'youtube_search'

-- 部分索引：仅索引已挂视频的行，避免 NULL 行膨胀索引
CREATE INDEX IF NOT EXISTS idx_dishes_video_url_notnull
  ON dishes(id)
  WHERE video_url IS NOT NULL;

COMMIT;
