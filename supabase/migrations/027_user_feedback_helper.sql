-- 027_user_feedback_helper.sql
-- 数据飞轮起点 — UI Day 1 / HelperCook 1-tap / Algorithm consumeRatings / Backend rollup 的落库目标
-- 依据：docs/SPEC_day2_feedback_pipeline.md §2.1 + §2.2
-- 工单：TELEPOT-20260520-016（CEO 方案 B 变体）
--
-- 表名说明：
--   生产已存在旧 user_feedback 表（来自 nutri_pilot_feedback_schema.sql 手工 init seed），
--   schema 完全不同（自然语言反馈 + AI 信号分类，给 useFeedbackInput.ts 旧路径用）。
--   本表 user_feedback_helper 是"点按行为离散动作"飞轮专用，与旧表完全独立。
--   零数据丢失，零现表改动。
--
-- 安全模型：anon-first（与 025/026 一致），RLS USING/WITH CHECK (true)，
-- 应用层用 WHERE user_id = getUserId() 做过滤（CLAUDE.md 不变量 #1）。
-- dish_id FK→dishes(id) 是允许的，user_id 是 text 列无 FK——
-- 任何 FK→auth.users 都禁止。

BEGIN;

-- §1 user_feedback_helper 主表
CREATE TABLE IF NOT EXISTS user_feedback_helper (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  dish_id uuid REFERENCES dishes(id) ON DELETE SET NULL,
  step_index int,
  feedback_type text NOT NULL CHECK (feedback_type IN (
    'cant_understand', 'too_hard', 'missing_ingredient',
    'rating_good', 'rating_okay', 'rating_bad'
  )),
  locale text,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_helper_user_dish
  ON user_feedback_helper(user_id, dish_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_helper_type_time
  ON user_feedback_helper(feedback_type, created_at DESC);

ALTER TABLE user_feedback_helper ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_feedback_helper_anon_insert" ON user_feedback_helper;
CREATE POLICY "user_feedback_helper_anon_insert" ON user_feedback_helper
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "user_feedback_helper_anon_read" ON user_feedback_helper;
CREATE POLICY "user_feedback_helper_anon_read" ON user_feedback_helper
  FOR SELECT USING (true);

-- §2 prefscores_training_log（不变，名字本来就独立）
CREATE TABLE IF NOT EXISTS prefscores_training_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  trained_at timestamptz DEFAULT now(),
  feedback_count int NOT NULL,
  prev_top_dishes jsonb,
  next_top_dishes jsonb,
  delta_summary text
);
CREATE INDEX IF NOT EXISTS idx_prefscores_log_user
  ON prefscores_training_log(user_id, trained_at DESC);
ALTER TABLE prefscores_training_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prefscores_training_log_anon_insert" ON prefscores_training_log;
CREATE POLICY "prefscores_training_log_anon_insert" ON prefscores_training_log
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "prefscores_training_log_anon_read" ON prefscores_training_log;
CREATE POLICY "prefscores_training_log_anon_read" ON prefscores_training_log
  FOR SELECT USING (true);

COMMIT;
