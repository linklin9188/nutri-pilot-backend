-- 071_user_profiles_pref_scores_gin.sql
-- 工单：TELEPOT-20260522-019 §A
-- Backend 018 §B (commit 8849447) feedback-rollup 真跑后，pref_scores jsonb
-- 被 Algorithm reader 每菜单生成时调用：`pref_scores->'pmc:red'` /
-- `pref_scores ? 'cuisine:cantonese'` 等 path query 当前全表扫。
-- jsonb_path_ops 体积比 default jsonb_ops 小约 50%，更适合 `?` / `@>` 工作集。
--
-- 不变量自检：
--   #1 无 FK 改动                #2 不涉 Gemini
--   #3 不涉 Stripe                #4 ALGO_VERSION 不动（index 优化不动算法）
--   IF NOT EXISTS 保幂等

BEGIN;

CREATE INDEX IF NOT EXISTS idx_user_profiles_pref_scores_gin
  ON user_profiles USING gin (pref_scores jsonb_path_ops);

COMMENT ON INDEX idx_user_profiles_pref_scores_gin IS
  'Backend 018 feedback-rollup writes user_profiles.pref_scores; Algorithm v55+ reader hits jsonb path / containment ops. jsonb_path_ops chosen for compactness — index works for `?` and `@>` only.';

COMMIT;
