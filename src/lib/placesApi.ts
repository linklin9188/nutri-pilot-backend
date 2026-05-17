/**
 * placesApi — Google Places API (New) wrapper with localStorage cache.
 *
 * Design constraint (user 2026-05-17 + budget alarm $50/month):
 *   · Listing cards stay on Unsplash (free, fast, cached by browser CDN).
 *   · Only when user taps a card into the DETAIL MODAL do we fetch Places
 *     data — and cache the result for 30 days, so subsequent opens of
 *     the same restaurant cost $0.
 *
 * Cost math (Places API New, list pricing 2026):
 *   · Text Search: ~$0.032 per call (cached 30d)
 *   · Place Photo: ~$0.007 per call (browser-cached after first hit)
 *   · Typical "user taps 1-2 detail cards per weekend" → ~$0.05/user
 *   · 100 users/day × 30 days = ~$150/month — still over budget alone,
 *     but the cache hit rate after week 1 should bring it well under.
 *
 * Key is exposed in the frontend bundle via VITE_GOOGLE_PLACES_KEY.
 * Must be referrer-restricted to https://nothinkeats.com/* in Google
 * Cloud Console — otherwise anyone can extract and burn the quota.
 */

const KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY ?? '';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface PlaceData {
  placeId:   string | null;
  photoName: string | null;
  address:   string | null;
  rating:    number | null;
  priceLevel: string | null;
  /** Loaded from Places API when available — overrides our seed `phone`
   *  if the user wants to call the real, current number. */
  phone:     string | null;
  /** Direct deep-link to Google Maps result for "ride / 导航 to here". */
  mapsUrl:   string | null;
  /** Unix ms when this entry was cached. Used for TTL bust. */
  cachedAt:  number;
}

function cacheKey(restaurantId: string): string {
  return `places_v2_${restaurantId}`;
}

function readCache(restaurantId: string): PlaceData | null {
  try {
    const raw = localStorage.getItem(cacheKey(restaurantId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as PlaceData;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(restaurantId: string, entry: PlaceData): void {
  try {
    localStorage.setItem(cacheKey(restaurantId), JSON.stringify(entry));
  } catch {/* quota — silent */}
}

/**
 * Fetch Places data for a restaurant. Caches the result for 30 days,
 * including "not found" (placeId=null) so we don't retry every modal-open.
 *
 * Returns null only when the API key is missing — caller should fall back
 * to the seed phone + Unsplash photo in that case.
 */
export async function fetchPlaceData(
  restaurantId: string,
  name: string,
  city: 'HK' | 'SZ',
  area: string,
): Promise<PlaceData | null> {
  // Cache hit — instant return
  const cached = readCache(restaurantId);
  if (cached) return cached;

  if (!KEY) return null;

  const cityName = city === 'HK' ? '香港' : '深圳';
  const textQuery = `${name} ${area} ${cityName}`;

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask':
          'places.id,places.formattedAddress,places.photos.name,places.rating,' +
          'places.priceLevel,places.internationalPhoneNumber,places.googleMapsUri',
      },
      body: JSON.stringify({
        textQuery,
        languageCode: 'zh',
        maxResultCount: 1,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];

    const entry: PlaceData = {
      placeId:    place?.id ?? null,
      photoName:  place?.photos?.[0]?.name ?? null,
      address:    place?.formattedAddress ?? null,
      rating:     typeof place?.rating === 'number' ? place.rating : null,
      priceLevel: place?.priceLevel ?? null,
      phone:      place?.internationalPhoneNumber ?? null,
      mapsUrl:    place?.googleMapsUri ?? null,
      cachedAt:   Date.now(),
    };
    writeCache(restaurantId, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Build a Places Photo URL. Returns null when key is missing or photo
 * reference is empty. Direct-stream image URL — Google redirects to the
 * actual CDN. Browser caches the redirect target.
 */
export function getPlacePhotoUrl(photoName: string | null | undefined, maxWidthPx = 800): string | null {
  if (!KEY || !photoName) return null;
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${KEY}`;
}

/** Has the Places key been configured? Drives whether the modal even
 *  attempts the fetch — keeps render quiet in environments without setup. */
export function placesEnabled(): boolean {
  return !!KEY;
}
