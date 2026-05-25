-- 093_trial_end_at.sql
-- 工单：TELEPOT-20260525-078 P0 — 30 天免费体验硬接 (老板拍板双收入商业模式)
--
-- 背景：
--   - migration 078 admin view 算 `trial_end_at = created_at + 30 days`，但只是
--     view 派生字段，前端 useSubscription 不读它 → 试用期"软"概念，从未真触发
--     paywall。
--   - 老板原话 (2026-05-25)："用户也可以收费, 免费体验一个月, 之后还是收费,
--     任何用户免费体验一个月, 不过都是按照订阅模式, 一个月后没有取消就再收费。"
--   - 双收入模式落地：所有新老用户 30 天免费试用 → 到期 + is_pro=false →
--     Pro 工具 paywall (前端 ProGate / useSubscription 兜底)。
--
-- 本 migration 落地：
--   §1 ALTER TABLE 加 trial_end_at timestamptz (nullable, 兼容旧 row)
--   §2 UPDATE 溯及既往：所有现存 row.trial_end_at = created_at + 30 days
--   §3 trigger fn_set_trial_end_at: BEFORE INSERT 自动塞 30 天后
--
-- 不变量自检：
--   #1 不 FK→auth.users（trial_end_at 是 plain timestamptz）
--   #2 不动 stripe_events / Stripe webhook / Pricing
--   #3 ALGO_VERSION 不动（业务字段，非算法）
--   #4 ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE FUNCTION 保幂等
--   #5 trigger DROP IF EXISTS + CREATE 保幂等
--   #6 nullable 不破现有 INSERT 路径 (任何缺省 INSERT 仍 work，trigger 兜底)

BEGIN;

-- =========================================================================
-- §1. user_profiles.trial_end_at
-- =========================================================================
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS trial_end_at timestamptz;

COMMENT ON COLUMN user_profiles.trial_end_at IS
  'TICKET-078: 免费体验到期时间 (注册 + 30 天). 到期 + is_pro=false →
   Pro 工具 paywall (前端 useSubscription 读这列算 tier=trial/expired)。
   Nullable 是兼容历史；BEFORE INSERT trigger 保证新 row 永远非空。';

-- =========================================================================
-- §2. 溯及既往：现存 row 全部按 created_at + 30 天回填
-- =========================================================================
-- 注：078 §A1.5 已说明 created_at 对存量行 = migration 落地日 (default now())，
-- 不是真实注册时间。所以"溯及既往"对存量用户实际是从今天起 30 天。
-- 老板原话 "任何用户免费体验一个月" → 这是产品意图，存量也享 30 天 OK。
UPDATE user_profiles
SET trial_end_at = created_at + interval '30 days'
WHERE trial_end_at IS NULL;

-- =========================================================================
-- §3. BEFORE INSERT trigger — 新 row 自动设 trial_end_at
-- =========================================================================
CREATE OR REPLACE FUNCTION fn_set_trial_end_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.trial_end_at IS NULL THEN
    NEW.trial_end_at := COALESCE(NEW.created_at, now()) + interval '30 days';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION fn_set_trial_end_at() IS
  'TICKET-078: 新建 user_profiles row 时自动设 trial_end_at = created_at + 30d.
   IF trial_end_at IS NULL 兜底 — 允许调用方显式传 (e.g. 邀请激活赠送延长试用)
   而不被 trigger 覆盖。';

DROP TRIGGER IF EXISTS trg_set_trial_end_at ON user_profiles;
CREATE TRIGGER trg_set_trial_end_at
  BEFORE INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_set_trial_end_at();

COMMIT;
