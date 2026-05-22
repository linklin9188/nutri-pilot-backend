-- 074_meal_logs.sql
-- 工单：TELEPOT-20260522-021 §A
-- 建 meal_logs 表 — 解 Backend 020 §A weekStats 第 1 个 blocker：
-- "用户本周吃过什么查不到 → deficits=[]"。
--
-- 业务模型：
--   - 写入方：UI 023（用户标记 "吃过"）+ Backend cron（订单完成自动写入）
--   - 读取方：weekStats edge fn（聚合 7 日营养）+ 未来 dish-affinity 推荐
--   - append-only 历史记录：禁 UPDATE / DELETE（用户改主意 → 新插一条 portion=0 抵消）
--
-- 不变量自检：
--   #1 不 FK→auth.users（user_id text 参考 application userId / user_profiles.id）
--   #2 不涉 Gemini                #3 不涉 Stripe
--   #4 ALGO_VERSION 不动（schema 优化）
--   CREATE TABLE IF NOT EXISTS 保幂等

BEGIN;

CREATE TABLE IF NOT EXISTS meal_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,           -- 对齐 user_profiles.id text PK，不 FK auth.users
  dish_id      uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  consumed_at  timestamptz NOT NULL DEFAULT now(),
  meal_type    text NOT NULL
               CHECK (meal_type IN ('breakfast','lunch','dinner','snack','fruit')),
  portion      numeric NOT NULL DEFAULT 1.0,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- weekStats 主路径：某用户最近 N 天 ORDER BY consumed_at DESC
CREATE INDEX IF NOT EXISTS idx_meal_logs_user_consumed_at
  ON meal_logs (user_id, consumed_at DESC);

-- dish 反查路径："这道菜被多少人吃过 / 哪些时段"
CREATE INDEX IF NOT EXISTS idx_meal_logs_dish_id
  ON meal_logs (dish_id);

-- RLS：anon-first，与项目其他表（household_members migration 025）一致
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;

-- SELECT：USING (true) — 应用层用 .eq('user_id', userId) 收口。
-- 未来接入 JWT 后改 USING (user_id = current_setting('request.jwt.claim.sub')) 收紧
CREATE POLICY meal_logs_anon_select ON meal_logs
  FOR SELECT TO anon, authenticated
  USING (true);

-- INSERT：WITH CHECK (true) — UI 023 / Backend cron 写入路径
CREATE POLICY meal_logs_anon_insert ON meal_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- UPDATE / DELETE：不创建 policy（默认拒绝 = append-only 语义）

COMMENT ON TABLE meal_logs IS
  'User meal consumption log (append-only). Reader: weekStats edge fn aggregates last 7 days. Writer: UI 023 manual mark + Backend cron from completed orders. RLS USING (true) — application layer filters by user_id; JWT-based tightening pending Smell 3 phase 2.';

COMMENT ON COLUMN meal_logs.user_id IS
  'Application userId (matches user_profiles.id text PK). NOT FK to auth.users per hard invariant #1.';

COMMIT;
