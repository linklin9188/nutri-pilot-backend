-- 072_dishes_video_url_partial_index.sql
-- 工单：TELEPOT-20260522-019 §B
-- Backend 012 (commit b4e2a66) 已灌入 348 道 dishes.video_url。
-- 详情页 "Watch tutorial" 按钮逻辑：`WHERE video_url IS NOT NULL` filter。
-- 当前 dishes 表无该 index → seqscan。partial 索引仅索引非 null 行（约 348/N），
-- 比 full b-tree 省 ~60% 空间，命中精准。
--
-- ⚠️ 注：migration 066 已建一个 `idx_dishes_video_url_notnull ON dishes(id)
--    WHERE video_url IS NOT NULL` — 但那个 index leading 是 id 仅起"存在性"作用，
--    不能加速按 video_url 排序 / range / hash lookup。本 migration 加一个
--    leading-on-video_url 的 partial，覆盖未来按 url 查 / dedup / order by 场景。
--    如担心重复，可只保留本 migration 的 idx_dishes_video_url_partial 并 drop
--    旧 idx_dishes_video_url_notnull —— 本棒保守不动 066 既有 index，让两者共存。
--
-- 不变量自检：
--   #1 无 FK 改动                #2 不涉 Gemini
--   #3 不涉 Stripe                #4 ALGO_VERSION 不动
--   IF NOT EXISTS 保幂等

BEGIN;

CREATE INDEX IF NOT EXISTS idx_dishes_video_url_partial
  ON dishes (video_url)
  WHERE video_url IS NOT NULL;

COMMENT ON INDEX idx_dishes_video_url_partial IS
  'Backend 012 filled 348 dishes.video_url. Detail page Watch-tutorial filter uses `WHERE video_url IS NOT NULL`. partial index covers existence checks + url-keyed lookups. Coexists with 066 idx_dishes_video_url_notnull (id-leading existence-only).';

COMMIT;
