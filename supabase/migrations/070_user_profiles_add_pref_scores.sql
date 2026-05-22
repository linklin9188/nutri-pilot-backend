-- 070_user_profiles_add_pref_scores.sql
-- 工单：TELEPOT-20260522-018 §A
-- 解锁 Backend 018 feedback-rollup.ts 真跑（Algorithm v54 消费路径已就绪）
-- 消费方：useWeeklyMenu.ts (v54+) prefScores reader
-- 写入方：feedback-rollup.ts edge function（Backend 018 cron 03:30 HKT）
-- 格式：{"pmc:red": {"score": 0.8, "n": 42}, "cuisine:cantonese": {...}, "tag:*": {...}}
--
-- 不变量自检：
--   #1 无 FK→auth.users（仅加 jsonb 列）
--   #2 不直连 Gemini
--   #3 Stripe 白名单不动
--   #4 ALGO_VERSION 不动（DB schema 优化，算法消费路径已在 v54）
--   IF NOT EXISTS 保幂等；DEFAULT '{}' 保证旧行非 null

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS pref_scores JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_profiles.pref_scores IS
  'feedback rollup output: per-user per-axis confidence-weighted scores. Keys: pmc:* / cuisine:* / tag:*. Cron-written 03:30 HKT by feedback-rollup edge fn.';
