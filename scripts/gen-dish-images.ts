/**
 * AI image generation for dishes
 *
 * For each dish with an empty image_url:
 *   1. Build a food-photography prompt from title_zh + title_en + tags
 *   2. Call Gemini Imagen 3 to generate a 1:1 food photo
 *   3. Upload PNG to Supabase Storage (bucket: dish-images)
 *   4. Write the public URL back to dishes.image_url
 *
 * Run:  npx tsx scripts/gen-dish-images.ts
 * Flags:
 *   --all      Regenerate images even for dishes that already have one
 *   --limit N  Only process N dishes (useful for testing, default: 10)
 *
 * Prerequisites:
 *   • GEMINI_API_KEY in .env
 *   • VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env  (or SERVICE_ROLE_KEY)
 *   • Supabase Storage bucket named "dish-images" must exist and be public
 *     → Dashboard → Storage → New bucket → name: dish-images → Public: ✓
 */

import pg from 'pg';
import { config } from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

config();

const genai   = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
);
const db = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(dish: {
  title_zh: string;
  title_en: string | null;
  origin_cuisine: string;
  flavor_tags: string[];
  main_ingredient: string;
}): string {
  const name = dish.title_en
    ? `${dish.title_zh} (${dish.title_en})`
    : dish.title_zh;

  const style: Record<string, string> = {
    cantonese:       'delicate Cantonese cuisine, steamed or lightly seasoned',
    sichuan:         'bold Sichuan cuisine with rich red chili oil',
    jiangnan:        'refined Jiangnan cuisine, subtle flavors',
    northern:        'hearty northern Chinese cuisine',
    western:         'Western-style plating',
    japanese_korean: 'Japanese or Korean style, minimalist plating',
    southeast_asian: 'Southeast Asian cuisine, vibrant colors',
  };
  const cuisineHint = style[dish.origin_cuisine] ?? 'Chinese home-style cuisine';

  const tagsHint = dish.flavor_tags.includes('light')
    ? 'light and clean presentation'
    : dish.flavor_tags.includes('spicy')
    ? 'rich chili-red coloring'
    : 'golden, appetizing appearance';

  return (
    `Professional food photography of "${name}", ${cuisineHint}. ` +
    `${tagsHint}. ` +
    `Shot on a clean wooden or marble surface, overhead or 45-degree angle, ` +
    `natural window light, shallow depth of field, restaurant-quality plating, ` +
    `vibrant colors, no text, no watermark, square crop 1:1.`
  );
}

// ── Parse CLI flags ───────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const forceAll = args.includes('--all');
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const LIMIT   = limitArg ? parseInt(limitArg) : 10;

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await db.connect();
  console.log('🔗 Connected to DB');

  const whereClause = forceAll ? '' : `WHERE (image_url IS NULL OR image_url = '')`;
  const { rows: dishes } = await db.query<{
    id: string;
    title_zh: string;
    title_en: string | null;
    origin_cuisine: string;
    flavor_tags: string[];
    main_ingredient: string;
  }>(`
    SELECT id, title_zh, title_en, origin_cuisine, flavor_tags, main_ingredient
    FROM dishes
    ${whereClause}
    ORDER BY title_zh
    LIMIT $1
  `, [LIMIT]);

  console.log(`🎨 Generating images for ${dishes.length} dishes (limit=${LIMIT}, forceAll=${forceAll})\n`);

  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i];
    console.log(`[${i + 1}/${dishes.length}] ${dish.title_zh}`);

    try {
      const prompt = buildPrompt(dish);

      // Call Imagen 3 via Gemini API
      const result = await genai.models.generateImages({
        model:  'imagen-3.0-generate-002',
        prompt,
        config: { numberOfImages: 1, aspectRatio: '1:1', outputMimeType: 'image/png' },
      });

      const imgData = result.generatedImages?.[0]?.image?.imageBytes;
      if (!imgData) { console.warn('  ⚠ No image returned, skipping'); continue; }

      // Upload to Supabase Storage
      const fileName  = `${dish.id}.png`;
      const buffer    = Buffer.from(imgData, 'base64');
      const { error: uploadErr } = await supabase.storage
        .from('dish-images')
        .upload(fileName, buffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadErr) { console.warn(`  ⚠ Upload failed: ${uploadErr.message}`); continue; }

      // Get public URL
      const { data: urlData } = supabase.storage.from('dish-images').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // Write back to DB
      await db.query(
        `UPDATE dishes SET image_url = $1 WHERE id = $2`,
        [publicUrl, dish.id],
      );

      console.log(`  ✅ ${publicUrl}`);
    } catch (err: any) {
      console.warn(`  ⚠ Error: ${err?.message ?? err}`);
    }

    // Respect Imagen rate limit (~2 req/s)
    await new Promise(r => setTimeout(r, 600));
  }

  await db.end();
  console.log('\n✅ Image generation complete');
}

main().catch(err => { console.error(err); process.exit(1); });
