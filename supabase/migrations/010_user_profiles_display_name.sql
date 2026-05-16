-- Add display_name column to user_profiles.
--
-- 10+ code sites read or write user_profiles.display_name (Home, Settings,
-- HelperHome, Community, Login, WeChatCallback). The column never existed
-- in schema, so:
--   • All upserts mentioning display_name had it silently dropped by
--     PostgREST (or rejected, depending on schema cache state).
--   • All selects returned NULL — the helper name shown on Home and
--     Community always defaulted to "Helper" / empty.
--
-- Discovered while end-to-end testing the helper flow (16 May 2026).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;
