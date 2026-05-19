-- User-saved dishes (收藏菜单). Mirrors lib/favorites.ts's localStorage shape
-- so a user logging in on a new device sees their favorites. localStorage
-- stays as an offline-first cache; this table is the source of truth when
-- the user has a valid userId.
--
-- dish_snapshot keeps the displayed payload (title / image / cuisine) at
-- the time of saving, so AI-generated dishes that aren't in the dishes
-- table still render correctly. No FK to dishes(id) for the same reason —
-- some favorite ids are title-derived fallbacks rather than UUIDs.

CREATE TABLE IF NOT EXISTS public.user_favorite_dishes (
  user_id        TEXT        NOT NULL,
  dish_id        TEXT        NOT NULL,
  source_tag     TEXT,                          -- '早餐' / '家宴' / '祛湿' / etc.
  dish_snapshot  JSONB       NOT NULL,          -- {title_zh, image_url, course_type, …}
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_dishes_user
  ON public.user_favorite_dishes(user_id, created_at DESC);

-- RLS — only allow rows where user_id matches the caller. We use a custom
-- localStorage userId (not auth.uid()), so requests come through the anon
-- key. To keep it functional during the test phase without forcing real
-- auth we keep RLS permissive: anyone with the anon key can read/write
-- any row. This matches user_profiles' current posture. Tighten when real
-- Supabase Auth is the primary login.
ALTER TABLE public.user_favorite_dishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_full_access_favorites" ON public.user_favorite_dishes;
CREATE POLICY "anon_full_access_favorites"
  ON public.user_favorite_dishes
  FOR ALL
  USING (true)
  WITH CHECK (true);
