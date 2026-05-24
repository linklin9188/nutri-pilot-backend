-- 081_user_profile_enrich.sql
-- 工单：TELEPOT-20260524-026 P0 hot — 17:00 HKT deadline
-- 老板 16:05 拍板"先获取所有能获取的数据，未来都有用"
-- Backend 023 / UI 052 并行依赖本列
--
-- 11 列全 nullable，兼容存量用户（无 backfill）
--
-- 不变量自检：
--   #1 无 FK 改动              #2 不涉 Gemini
--   #3 Stripe 不动              #4 ALGO_VERSION 不动（profile 扩展不动评分）
--   ADD COLUMN IF NOT EXISTS 保幂等

BEGIN;

ALTER TABLE user_profiles
  -- 微信用户数据（wechat-mp 网页授权 + UnionID/OpenID 回调返回）
  ADD COLUMN IF NOT EXISTS avatar_url            text,           -- 头像 URL
  ADD COLUMN IF NOT EXISTS nickname              text,           -- 原始微信昵称（display_name 是用户可改的显示名）
  ADD COLUMN IF NOT EXISTS city                  text,           -- 微信返回城市
  ADD COLUMN IF NOT EXISTS province              text,           -- 微信返回省份
  ADD COLUMN IF NOT EXISTS country               text,           -- 微信返回国家
  ADD COLUMN IF NOT EXISTS wechat_sex            int,            -- 0 unknown / 1 男 / 2 女
  -- HTML5 geolocation
  ADD COLUMN IF NOT EXISTS location_lat          numeric(9,6),   -- 纬度
  ADD COLUMN IF NOT EXISTS location_lng          numeric(9,6),   -- 经度
  ADD COLUMN IF NOT EXISTS gps_accepted_at       timestamptz,    -- 用户授权位置时间戳
  -- 口味自由文本（老板 §F）
  ADD COLUMN IF NOT EXISTS taste_pref_free_text  text,           -- "我的口味"自由描述 ≤200 字
  -- helper 国籍（老板 §H）
  ADD COLUMN IF NOT EXISTS origin_country        text;           -- 'PH' / 'ID' / etc.

-- 列级注释 — 标注来源 / 用途，避免未来部门猜 schema
COMMENT ON COLUMN user_profiles.avatar_url           IS 'WeChat avatar URL from MP web auth callback (wechat-mp/).';
COMMENT ON COLUMN user_profiles.nickname             IS 'Raw WeChat nickname (display_name 是用户可改名).';
COMMENT ON COLUMN user_profiles.city                 IS 'City from WeChat MP user info.';
COMMENT ON COLUMN user_profiles.province             IS 'Province from WeChat MP user info.';
COMMENT ON COLUMN user_profiles.country              IS 'Country from WeChat MP user info (default CN if not provided).';
COMMENT ON COLUMN user_profiles.wechat_sex           IS '0=unknown / 1=male / 2=female per WeChat API spec.';
COMMENT ON COLUMN user_profiles.location_lat         IS 'HTML5 geolocation latitude, numeric(9,6) covers 6 decimal places ≈ 0.11m precision.';
COMMENT ON COLUMN user_profiles.location_lng         IS 'HTML5 geolocation longitude, numeric(9,6).';
COMMENT ON COLUMN user_profiles.gps_accepted_at      IS 'Timestamp when user granted geolocation permission. NULL = never granted.';
COMMENT ON COLUMN user_profiles.taste_pref_free_text IS 'Free-text taste preference description, ≤200 chars (no DB-level CHECK; app-layer enforces).';
COMMENT ON COLUMN user_profiles.origin_country       IS 'Helper origin country (e.g. PH / ID) for helper persona. NULL for non-helper users.';

COMMIT;
