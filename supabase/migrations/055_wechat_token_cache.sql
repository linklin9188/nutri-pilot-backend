-- Migration 055 — wechat_token_cache (Backend 越界，跨部门补漏)
--
-- TICKET-20260520-066 §B. Backend writes this migration with CEO's explicit
-- cross-department authorization (per TICKET-064 §A precedent + 066 §B inline
-- "建议建表 ... CEO 已授权"). Reason: Backend's wechat-jssdk-signature edge
-- function needs a shared cache for the WeChat access_token + jsapi_ticket
-- (both 7200s TTL from WeChat side). Edge functions are stateless across
-- invocations, so the cache must be in DB/KV — not in-memory.
--
-- Idempotent (IF NOT EXISTS) so re-running on a project where it's partially
-- applied is safe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wechat_token_cache (
  key         text PRIMARY KEY,           -- e.g. 'access_token' or 'jsapi_ticket'
  value       text NOT NULL,              -- the cached token / ticket
  expires_at  timestamptz NOT NULL,       -- when WeChat says this token expires (~now() + 7200s)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wechat_token_cache_expires
  ON public.wechat_token_cache(expires_at);

ALTER TABLE public.wechat_token_cache ENABLE ROW LEVEL SECURITY;

-- The cache is service-role only — never expose tokens to the anon client.
-- No RLS policy is created on purpose; service_role bypasses RLS, and anon
-- requests will be denied by default (no policy = deny).

COMMIT;
