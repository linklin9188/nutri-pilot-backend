/**
 * AI food image generation pipeline
 *
 * Model: gemini-2.5-flash-image (supports image generation via generateContent)
 * Storage: Supabase Storage bucket "dish-images" (public)
 *
 * Run:  npx tsx scripts/gen-dish-images.ts --limit=10
 * Flags:
 *   --all       Regenerate even dishes that already have image_url
 *   --limit=N   Process N dishes (default: 10)
 *   --vegan     Only process is_vegan dishes
 */

import pg from 'pg';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL   = 'gemini-2.5-flash-image';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
);

// Use Pool so long-running scripts don't lose the connection
const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
});

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const forceAll = args.includes('--all');
const veganOnly = args.includes('--vegan');
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const LIMIT    = limitArg ? parseInt(limitArg) : 10;
// Scope to dishes seeded by a specific batch (matches dishes.source column).
// Useful for targeting "the 9 dishes I just inserted" without touching the
// 200+ dishes that have been image-NULL since the start of the project.
const sourceArg = args.find(a => a.startsWith('--source='))?.split('=')[1];

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(dish: {
  title_zh: string;
  title_en: string | null;
  origin_cuisine: string;
  flavor_tags: string[];
  main_ingredient: string;
  is_vegan: boolean;
}): string {
  const name = dish.title_en
    ? `${dish.title_zh} (${dish.title_en})`
    : dish.title_zh;

  const styleMap: Record<string, string> = {
    cantonese:       'delicate Cantonese cuisine, lightly seasoned, elegant',
    sichuan:         'bold Sichuan cuisine with rich red chili oil, vibrant',
    jiangnan:        'refined Jiangnan cuisine, subtle golden tones',
    northern:        'hearty northern Chinese cuisine, rustic warmth',
    western:         'Western restaurant-style plating, clean and modern',
    japanese_korean: 'Japanese or Korean style, minimalist zen plating',
    southeast_asian: 'Southeast Asian cuisine, vibrant tropical colors',
  };
  const cuisineHint = styleMap[dish.origin_cuisine] ?? 'Chinese home-style cuisine';

  const tagsHint = dish.flavor_tags.includes('light')
    ? 'light, clean, fresh presentation'
    : dish.flavor_tags.includes('spicy')
    ? 'rich chili-red coloring, steaming hot'
    : dish.flavor_tags.includes('sweet')
    ? 'golden caramelized, glossy sauce'
    : 'appetizing golden-brown appearance';

  const veganHint = dish.is_vegan
    ? 'plant-based, fresh vegetables visible, vibrant green accents, '
    : '';

  return (
    `Professional food photography of "${name}", ${cuisineHint}. ` +
    `${veganHint}${tagsHint}. ` +
    `Shot overhead or at 45-degree angle on a clean wooden or marble surface, ` +
    `natural window light, shallow depth of field, ` +
    `restaurant-quality plating, vibrant colors, no text, no watermark, square 1:1 crop.`
  );
}

// ── Generate one image via Gemini ─────────────────────────────────────────────
async function generateImage(prompt: string): Promise<Buffer | null> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });

  const json = await res.json() as any;
  if (!res.ok) throw new Error(json.error?.message ?? JSON.stringify(json));

  const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('No image in response');

  return Buffer.from(imgPart.inlineData.data, 'base64');
}

// ── Upload to Supabase Storage ────────────────────────────────────────────────
async function uploadImage(dishId: string, imageBuffer: Buffer): Promise<string> {
  const fileName = `${dishId}.png`;
  const { error } = await supabase.storage
    .from('dish-images')
    .upload(fileName, imageBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from('dish-images').getPublicUrl(fileName);
  return data.publicUrl;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Pool connects on demand — no explicit connect() needed
  console.log('🔗 DB pool ready');

  const conditions: string[] = [];
  if (!forceAll) conditions.push(`(image_url IS NULL OR image_url = '')`);
  if (veganOnly) conditions.push(`is_vegan = true`);
  if (sourceArg) conditions.push(`source = '${sourceArg.replace(/'/g, "''")}'`);

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: dishes } = await db.query<{
    id: string;
    title_zh: string;
    title_en: string | null;
    origin_cuisine: string;
    flavor_tags: string[];
    main_ingredient: string;
    is_vegan: boolean;
  }>(`
    SELECT id, title_zh, title_en, origin_cuisine, flavor_tags, main_ingredient, is_vegan
    FROM dishes
    ${whereClause}
    ORDER BY title_zh
    LIMIT $1
  `, [LIMIT]);

  console.log(`\n🎨 Generating images for ${dishes.length} dishes`);
  console.log(`   Model: ${GEMINI_MODEL} · limit=${LIMIT} · forceAll=${forceAll}\n`);

  let ok = 0, failed = 0;

  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i];
    process.stdout.write(`[${i + 1}/${dishes.length}] ${dish.title_zh} … `);

    try {
      const prompt = buildPrompt(dish);
      const imgBuffer = await generateImage(prompt);
      if (!imgBuffer) { console.log('⚠ no image'); failed++; continue; }

      const publicUrl = await uploadImage(dish.id, imgBuffer);

      await db.query(
        `UPDATE dishes SET image_url = $1 WHERE id = $2`,
        [publicUrl, dish.id],
      );

      console.log(`✅`);
      ok++;
    } catch (err: any) {
      console.log(`⚠ ${err?.message?.slice(0, 80)}`);
      failed++;
    }

    // ~1.5s between requests to stay within rate limits
    if (i < dishes.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n📊 Done: ${ok} ✅  ${failed} ⚠`);
  await db.end();
}

// Pool doesn't need connect() — remove from main


main().catch(err => { console.error(err); process.exit(1); });
