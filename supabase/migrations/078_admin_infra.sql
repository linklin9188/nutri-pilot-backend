-- 078_admin_infra.sql
-- 工单：TELEPOT-20260523-001 (Admin sprint 0)
-- §A is_admin column + admin_users_view + RLS placeholder
--
-- 决策：
--   1. is_premium 直接读 user_profiles.is_pro（前端 useSubscription 也读这列，
--      避免假设 stripe_events.user_id schema —— CLAUDE.md 指出 migration 004
--      已 drop stripe_events.user_id FK；当前生产 stripe_events 是 customer-keyed
--      不是 user-keyed，要还原 user 链得 join stripe_customer_id 多一跳）
--   2. view 用 security_invoker = on（PG 15+），让 view 继承调用者 RLS 而非
--      view owner RLS。配合 002 sprint JWT 接入后做 row-level 收紧。
--   3. 当前 sprint 0 view 不加 row policy —— anon-first app 没有 JWT，policy
--      EXISTS check current_setting('request.jwt.claim.sub') 永远 NULL 会
--      block 所有 SELECT；admin gate 改由 backend (server.js /api/admin/*)
--      在 service_role key 上做（查 user_profiles.is_admin 判断调用者）。
--   4. 老板 userId 占位 UPDATE 留空（CEO 实查 telepot_response_ui localStorage
--      后填 + 单独 SQL 跑；本 migration 跑完即可）。
--
-- 不变量自检：
--   #1 不 FK→auth.users（is_admin 是 plain boolean）
--   #2 不动 stripe_events / Stripe webhook
--   #3 ALGO_VERSION 不动（新表，不动算法）
--   #4 view 不暴露 stripe_customer_id / email 等敏感字段（002 sprint 再 case-by-case）
--   #5 ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE VIEW 保幂等

BEGIN;

-- =========================================================================
-- §A1. user_profiles.is_admin
-- =========================================================================
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.is_admin IS
  'TICKET-001 sprint 0 — admin role flag. server.js /api/admin/* 路径检查
   该列判断调用者是否管理员。anon-first app 没 JWT，所以 admin gate 在
   backend service_role 层做不在 RLS 层。default false 安全语义。';

-- =========================================================================
-- §A2. admin_users_view — 每行 = 1 个用户聚合
-- =========================================================================
CREATE OR REPLACE VIEW admin_users_view
  WITH (security_invoker = on)
AS
SELECT
  up.id                                       AS id,
  up.display_name                             AS display_name,
  up.hometown_cuisine                         AS hometown_cuisine,
  up.dietary_goal                             AS dietary_goal,
  up.created_at                               AS created_at,
  up.is_pro                                   AS is_premium,
  ml.last_active_at                           AS last_active_at,
  COALESCE(wm.menu_count, 0)::int             AS menu_count,
  ri.referrer_user_id                         AS referrer_id,
  COALESCE(ro.referred_count, 0)::int         AS referred_count,
  (up.created_at + interval '30 days')        AS trial_end_at,
  (now() < up.created_at + interval '30 days') AS is_trial_active
FROM user_profiles up
LEFT JOIN (
  -- last_active_at = MAX(meal_logs.created_at) per user
  SELECT user_id, MAX(created_at) AS last_active_at
    FROM meal_logs
   GROUP BY user_id
) ml ON ml.user_id = up.id
LEFT JOIN (
  -- menu_count = COUNT user_weekly_menus per user
  SELECT user_id, COUNT(*) AS menu_count
    FROM user_weekly_menus
   GROUP BY user_id
) wm ON wm.user_id = up.id
LEFT JOIN (
  -- referrer_id: WHO referred this user (referred_user_id = up.id)
  -- 077 列名: referrer_user_id / referred_user_id（工单写的 inviter_id / invitee_id 是笔误）
  SELECT referred_user_id, MIN(referrer_user_id) AS referrer_user_id
    FROM referrals
   GROUP BY referred_user_id
) ri ON ri.referred_user_id = up.id
LEFT JOIN (
  -- referred_count: how many users this user referred
  SELECT referrer_user_id, COUNT(*) AS referred_count
    FROM referrals
   GROUP BY referrer_user_id
) ro ON ro.referrer_user_id = up.id;

COMMENT ON VIEW admin_users_view IS
  'TICKET-001 sprint 0 — admin 用户聚合视图。每行 = 1 user_profiles. 字段:
   id / display_name / hometown_cuisine / dietary_goal / created_at /
   is_premium (=user_profiles.is_pro) / last_active_at (MAX meal_logs.created_at) /
   menu_count (COUNT user_weekly_menus) / referrer_id (referrals.referrer_user_id) /
   referred_count (COUNT referrals) / trial_end_at (created_at + 30d) / is_trial_active.
   security_invoker=on → 继承调用者 RLS。当前 sprint 0 由 server.js /api/admin/*
   在 service_role 上 gate（检 user_profiles.is_admin）。002 sprint JWT 接入后
   再加 view 自身 policy 收紧。';

-- =========================================================================
-- §A3. 老板 userId 设 is_admin = true 占位
-- =========================================================================
-- CEO 实查 telepot_response 后 fill：
-- UPDATE user_profiles SET is_admin = true WHERE id = '<老板 userId 从 localStorage 取>';
--
-- 留空原因：本 migration 不 hardcode 任何具体 userId（避免历史 migration
-- 含 PII / 凭证）；老板 userId 由 CEO 跑单独一条 UPDATE。详 telepot_response_admin.md.

COMMIT;
