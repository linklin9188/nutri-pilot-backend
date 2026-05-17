-- 016_restaurant_places.sql
--
-- One-time Places API enrichment cache. Local Node script fetches Places
-- data (photos, address, rating) once per restaurant and writes here; the
-- frontend only reads this table and the public Storage bucket — never
-- calls Google directly. The Places API key gets deleted after backfill.
--
-- Architecture (user-confirmed 2026-05-17):
--   scripts/enrich-restaurants-places.ts (local Mac, Node) →
--     Places API → photo bytes →
--       storage.objects bucket 'restaurant-photos' (public URL) +
--       public.restaurant_places (DB row)
--   src/lib/placesApi.ts (frontend) ← public.restaurant_places (anon SELECT)
--   src/components/RestaurantCard.tsx ← image_url + address + rating

CREATE TABLE IF NOT EXISTS public.restaurant_places (
  restaurant_id  TEXT        PRIMARY KEY,
  place_id       TEXT,
  name_official  TEXT,        -- name as returned by Places (e.g. 'Tim Ho Wan (Central)')
  address        TEXT,
  rating         NUMERIC,
  price_level    TEXT,
  phone          TEXT,
  maps_url       TEXT,
  image_url      TEXT,        -- Supabase Storage public URL of the downloaded JPG
  raw_response  JSONB,
  enriched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_places_enriched_at
  ON public.restaurant_places(enriched_at DESC);

-- Anon read access (custom auth — see CLAUDE.md). Frontend uses the
-- anon key; we don't want to force login just to see restaurant data.
ALTER TABLE public.restaurant_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_restaurant_places" ON public.restaurant_places;
CREATE POLICY "anon_read_restaurant_places"
  ON public.restaurant_places
  FOR SELECT
  USING (true);

-- Anon write — the local backfill script also uses the anon key
-- (DATABASE_URL via pg.Client which bypasses RLS anyway, but kept for
-- belt-and-suspenders parity with other test-phase tables).
DROP POLICY IF EXISTS "anon_write_restaurant_places" ON public.restaurant_places;
CREATE POLICY "anon_write_restaurant_places"
  ON public.restaurant_places
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Storage bucket for the actual JPGs ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-photos', 'restaurant-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read on the bucket — anyone can <img src=...> the photos.
DROP POLICY IF EXISTS "public_read_restaurant_photos" ON storage.objects;
CREATE POLICY "public_read_restaurant_photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'restaurant-photos');

-- Anon write/upsert for the script (uses anon key on storage.from).
DROP POLICY IF EXISTS "anon_write_restaurant_photos" ON storage.objects;
CREATE POLICY "anon_write_restaurant_photos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'restaurant-photos')
  WITH CHECK (bucket_id = 'restaurant-photos');
