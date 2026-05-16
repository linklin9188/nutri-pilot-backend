-- 公众号网页授权 (snsapi_userinfo) returns openid (per-account) + unionid
-- (cross-account, only when the official account is bound to an open-platform
-- account). Persist both so a returning user is matched even if they later
-- log in via a different WeChat surface (mini-program, app) under the same
-- unionid.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS wechat_openid  TEXT,
  ADD COLUMN IF NOT EXISTS wechat_unionid TEXT;

-- Unique partial constraints — multiple rows with NULL allowed, but two
-- profiles can't share the same WeChat identity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_wechat_openid
  ON public.user_profiles(wechat_openid) WHERE wechat_openid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_wechat_unionid
  ON public.user_profiles(wechat_unionid) WHERE wechat_unionid IS NOT NULL;
