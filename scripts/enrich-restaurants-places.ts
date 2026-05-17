/**
 * scripts/enrich-restaurants-places.ts
 *
 * One-time backfill: query Google Places API (New) for every hardcoded
 * restaurant in src/lib/hkRestaurants.ts, download the top photo, upload
 * to Supabase Storage bucket 'restaurant-photos/<id>.jpg', and upsert the
 * restaurant_places row (place_id / address / rating / price_level /
 * phone / maps_url / image_url).
 *
 * Run locally (no HTTP referrer restriction on the Places key — see user
 * 2026-05-17 note: $200/mo free quota absorbs any worst-case abuse during
 * the run window; delete the key in Google Cloud Console after backfill
 * completes — frontend never touches Google again).
 *
 * Flags:
 *   --limit=N       cap to first N restaurants (testing)
 *   --force         re-enrich rows that already have a row in DB
 *   --filter=<keyword>  only restaurants whose id OR name matches
 *
 * Env (read from .env):
 *   GOOGLE_PLACES_KEY     — Places API (New) key
 *   VITE_SUPABASE_URL     — supabase project URL
 *   VITE_SUPABASE_ANON_KEY — anon key for storage upload + DB write
 *   DIRECT_DATABASE_URL   — pg connection for the upsert
 */
import { Client as PgClient } from 'pg';
import { createClient as createSupa } from '@supabase/supabase-js';
import 'dotenv/config';
import { HK_RESTAURANTS } from '../src/lib/hkRestaurants';

// ── Args ──────────────────────────────────────────────────────────────
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='));
const LIMIT      = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const FORCE      = process.argv.includes('--force');
const FILTER_ARG = process.argv.find(a => a.startsWith('--filter='));
const FILTER     = FILTER_ARG ? FILTER_ARG.split('=')[1].toLowerCase() : null;

// ── Env ───────────────────────────────────────────────────────────────
const PLACES_KEY = process.env.GOOGLE_PLACES_KEY ?? '';
const SUPA_URL   = process.env.VITE_SUPABASE_URL ?? '';
const SUPA_KEY   = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const DB_URL     = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

if (!PLACES_KEY) { console.error('❌ Missing GOOGLE_PLACES_KEY in .env'); process.exit(1); }
if (!SUPA_URL || !SUPA_KEY) { console.error('❌ Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(1); }
if (!DB_URL) { console.error('❌ Missing DIRECT_DATABASE_URL / DATABASE_URL'); process.exit(1); }

const BUCKET = 'restaurant-photos';
const PAUSE  = 250;  // ms between requests — gentle on Places API

interface PlaceResponse {
  id?: string;
  formattedAddress?: string;
  rating?: number;
  priceLevel?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  displayName?: { text?: string };
  photos?: Array<{ name?: string }>;
}

// ── Places API call ───────────────────────────────────────────────────
async function searchPlace(name: string, city: 'HK' | 'SZ', area: string): Promise<PlaceResponse | null> {
  const cityName = city === 'HK' ? '香港' : '深圳';
  const textQuery = `${name} ${area} ${cityName}`;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.photos.name,' +
        'places.rating,places.priceLevel,places.internationalPhoneNumber,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery, languageCode: 'zh', maxResultCount: 1 }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`  ⚠️ Search failed: ${res.status} ${body.slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  return data.places?.[0] ?? null;
}

// Place Photo Media — returns image bytes (Places API follows redirect for us).
async function fetchPhotoBytes(photoName: string): Promise<Buffer | null> {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${PLACES_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  ⚠️ Photo fetch failed: ${res.status}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🍽 Restaurants Places Enrichment`);
  console.log(`  · LIMIT=${isFinite(LIMIT) ? LIMIT : 'all'}  FORCE=${FORCE}  FILTER=${FILTER ?? 'none'}\n`);

  const supa = createSupa(SUPA_URL, SUPA_KEY);
  const pg = new PgClient({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  // Already-done set (skip unless --force)
  let alreadyDone = new Set<string>();
  if (!FORCE) {
    const { rows } = await pg.query(`SELECT restaurant_id FROM restaurant_places WHERE image_url IS NOT NULL`);
    alreadyDone = new Set(rows.map(r => r.restaurant_id));
    if (alreadyDone.size > 0) console.log(`  · Already enriched: ${alreadyDone.size} — skipping (use --force to redo)`);
  }

  const pool = HK_RESTAURANTS
    .filter(r => !r.hidden)
    .filter(r => !FILTER || r.id.toLowerCase().includes(FILTER) || r.name.toLowerCase().includes(FILTER))
    .filter(r => !alreadyDone.has(r.id));

  const todo = isFinite(LIMIT) ? pool.slice(0, LIMIT) : pool;
  console.log(`  · To process: ${todo.length}/${pool.length}\n`);

  let ok = 0, noMatch = 0, noPhoto = 0, fail = 0;

  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    const tag = `[${i + 1}/${todo.length}] ${r.name}`;
    process.stdout.write(tag.padEnd(40) + '…');

    try {
      const place = await searchPlace(r.name, r.city, r.area);
      if (!place) {
        process.stdout.write(' no match\n');
        await pg.query(
          `INSERT INTO restaurant_places (restaurant_id, raw_response) VALUES ($1, $2)
           ON CONFLICT (restaurant_id) DO UPDATE SET raw_response = EXCLUDED.raw_response, enriched_at = now()`,
          [r.id, JSON.stringify({ no_match: true })]
        );
        noMatch++;
        continue;
      }

      let imageUrl: string | null = null;
      const photoName = place.photos?.[0]?.name;
      if (photoName) {
        const bytes = await fetchPhotoBytes(photoName);
        if (bytes) {
          // Upload to Storage with upsert
          const path = `${r.id}.jpg`;
          const { error: upErr } = await supa.storage
            .from(BUCKET)
            .upload(path, bytes, { upsert: true, contentType: 'image/jpeg' });
          if (upErr) {
            console.error(`\n  ⚠️ Upload failed: ${upErr.message}`);
          } else {
            const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(path);
            imageUrl = pub.publicUrl;
          }
        }
      }
      if (!imageUrl) noPhoto++;

      await pg.query(
        `INSERT INTO restaurant_places
          (restaurant_id, place_id, name_official, address, rating,
           price_level, phone, maps_url, image_url, raw_response, enriched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (restaurant_id) DO UPDATE SET
           place_id      = EXCLUDED.place_id,
           name_official = EXCLUDED.name_official,
           address       = EXCLUDED.address,
           rating        = EXCLUDED.rating,
           price_level   = EXCLUDED.price_level,
           phone         = EXCLUDED.phone,
           maps_url      = EXCLUDED.maps_url,
           image_url     = COALESCE(EXCLUDED.image_url, restaurant_places.image_url),
           raw_response  = EXCLUDED.raw_response,
           enriched_at   = now()`,
        [
          r.id,
          place.id ?? null,
          place.displayName?.text ?? null,
          place.formattedAddress ?? null,
          place.rating ?? null,
          place.priceLevel ?? null,
          place.internationalPhoneNumber ?? null,
          place.googleMapsUri ?? null,
          imageUrl,
          JSON.stringify(place),
        ]
      );
      ok++;
      process.stdout.write(` ✓${imageUrl ? ' 📷' : ''} ${place.rating ? `⭐${place.rating}` : ''}\n`);
    } catch (e: any) {
      fail++;
      process.stdout.write(` ❌ ${e.message}\n`);
    }

    if (i + 1 < todo.length) await new Promise(rs => setTimeout(rs, PAUSE));
  }

  await pg.end();

  console.log(`\n📊 Done:`);
  console.log(`   ok:        ${ok}`);
  console.log(`   no match:  ${noMatch}`);
  console.log(`   no photo:  ${noPhoto}  (matched but no usable photo)`);
  console.log(`   fail:      ${fail}`);
}

main().catch(e => { console.error(e); process.exit(1); });
