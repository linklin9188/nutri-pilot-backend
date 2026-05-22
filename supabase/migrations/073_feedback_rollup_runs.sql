-- 073_feedback_rollup_runs.sql
-- 工单：TELEPOT-20260522-020 §A
-- 解 Backend 018 §B blocker：feedback-rollup --commit 真跑时 audit insert
-- 走 graceful skip（表不存在）。本 migration 建 audit 表，Backend 020 §B 拿来写入。
--
-- 写入方：feedback-rollup edge fn（service-role；无 RLS）
-- 读取方：CEO / Lead 日报巡检 + 未来可能的 Grafana panel
--
-- 不变量自检：
--   #1 无 FK→auth.users（独立 audit 表，users_affected 是 count 非 id）
--   #2 不涉 Gemini                  #3 不涉 Stripe
--   #4 ALGO_VERSION 不动（schema 优化不动算法）
--   CREATE TABLE IF NOT EXISTS 保幂等

BEGIN;

CREATE TABLE IF NOT EXISTS feedback_rollup_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at          timestamptz NOT NULL DEFAULT now(),
  window_days     integer NOT NULL,
  users_affected  integer NOT NULL,
  axes_computed   integer NOT NULL,
  rows_written    integer NOT NULL,
  errors          integer NOT NULL DEFAULT 0,
  triggered_by    text NOT NULL,     -- 'manual' / 'github_actions_cron' / 'edge_cron'
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 最近运行倒序 — 日报 / 巡检主要查询路径
CREATE INDEX IF NOT EXISTS idx_feedback_rollup_runs_run_at_desc
  ON feedback_rollup_runs (run_at DESC);

-- 按触发源分桶倒序 — 区分 cron vs 手动，方便排查
CREATE INDEX IF NOT EXISTS idx_feedback_rollup_runs_trigger_run_at
  ON feedback_rollup_runs (triggered_by, run_at DESC);

COMMENT ON TABLE feedback_rollup_runs IS
  'Audit log for feedback-rollup runs. One row per --commit invocation (manual / cron). Written by Backend 020 §B edge fn with service-role.';

COMMIT;
