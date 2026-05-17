/**
 * placesApi — read pre-enriched Places data from Supabase.
 *
 * Architecture (user-confirmed 2026-05-17):
 *   Local Node script `scripts/enrich-restaurants-places.ts` runs once
 *   against Google Places API, downloads photos into Supabase Storage,
 *   and writes the metadata into `public.restaurant_places`. The Places
 *   API key is then DELETED — the frontend never touches Google.
 *
 * This file is the frontend reader. Returns the same shape as before
 * (so RestaurantCard's existing callsite stays unchanged) but the
 * `imageUrl` field is now a Supabase Storage public URL, not a Google
 * Photo URL with an embedded key.
 *
 * Cache:
 *   In-memory map keyed by restaurant_id. Survives router transitions
 *   within a single page load. We don't persist to localStorage because
 *   the DB is fast (single select by primary key) and we want updates
 *   to image_url to propagate without a stale cache hangover.
 */
import { supabase } from './supabase';

export interface PlaceData {
  placeId:    string | null;
  imageUrl:   string | null;   // Supabase Storage public URL
  address:    string | null;
  rating:     number | null;
  priceLevel: string | null;
  phone:      string | null;
  mapsUrl:    string | null;
}

const memoryCache = new Map<string, PlaceData | null>();
const inflight   = new Map<string, Promise<PlaceData | null>>();

/**
 * Fetch enrichment data for a restaurant by id. Returns null when not
 * enriched yet (the backfill script hasn't run for this restaurant)
 * or when the row exists but had no Places match.
 */
export async function fetchPlaceData(restaurantId: string): Promise<PlaceData | null> {
  if (memoryCache.has(restaurantId)) return memoryCache.get(restaurantId) ?? null;
  // De-dupe concurrent calls for the same restaurant (e.g. multiple cards
  // mount the modal simultaneously).
  const pending = inflight.get(restaurantId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const { data } = await supabase
        .from('restaurant_places')
        .select('place_id, image_url, address, rating, price_level, phone, maps_url')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (!data) {
        memoryCache.set(restaurantId, null);
        return null;
      }
      const entry: PlaceData = {
        placeId:    data.place_id    ?? null,
        imageUrl:   data.image_url   ?? null,
        address:    data.address     ?? null,
        rating:     typeof data.rating === 'number' ? data.rating : null,
        priceLevel: data.price_level ?? null,
        phone:      data.phone       ?? null,
        mapsUrl:    data.maps_url    ?? null,
      };
      memoryCache.set(restaurantId, entry);
      return entry;
    } catch {
      memoryCache.set(restaurantId, null);
      return null;
    } finally {
      inflight.delete(restaurantId);
    }
  })();
  inflight.set(restaurantId, promise);
  return promise;
}
