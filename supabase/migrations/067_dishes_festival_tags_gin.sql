-- 067_dishes_festival_tags_gin.sql
-- 工单：TELEPOT-20260522-013 §A
-- SCHEMA_AUDIT_20260521 §6 异常 B 落地：dishes.festival_tags 列缺 GIN index
-- 影响：PostgREST `cs '{春节}'` contains 查询当前全表 seqscan
--
-- 不变量自检：
--   #1 无 FK→auth.users
--   #2 不涉 Gemini
--   #3 不涉 Stripe
--   #4 ALGO_VERSION 不动（仅 index，未改算法）
--   IF NOT EXISTS 保幂等

BEGIN;

CREATE INDEX IF NOT EXISTS idx_dishes_festival_tags_gin
  ON dishes USING gin (festival_tags);

COMMIT;
