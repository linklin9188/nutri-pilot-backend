/**
 * gen-michelin-images.ts
 *
 * Generates dish photography for michelin_dishes rows using Gemini's
 * image-generation model, then uploads to Supabase Storage bucket
 * `dish-images` (same bucket as regular dishes).
 *
 * Prompts emphasize the restaurant's tier — fine-dining plating, dark
 * background, professional lighting — versus the home dish photos.
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

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
});

const args = process.argv.slice(2);
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

interface Row {
  id: string;
  name_zh: string;
  name_en: string | null;
  restaurant_name_zh: string;
  cuisine_style: string;
  plating_note_zh: string | null;
}

async function fetchPending(): Promise<Row[]> {
  const { rows } = await db.query(
    `SELECT id, name_zh, name_en, restaurant_name_zh, cuisine_style, plating_note_zh
     FROM michelin_dishes
     WHERE image_url IS NULL OR image_url = ''
     ORDER BY created_at ASC`
  );
  return rows;
}

function buildPrompt(row: Row): string {
  return `A professional Michelin-restaurant style food photograph of "${row.name_en ?? row.name_zh}" (中文菜名: ${row.name_zh}), as served at ${row.restaurant_name_zh}.

Style:
- Fine-dining presentation. Plating note: ${row.plating_note_zh ?? '极致简约 / 精致摆盘'}.
- Cuisine style: ${row.cuisine_style.replace('_',' ')}.
- Dark moody background (slate / wood / black linen), single overhead light source.
- Shallow depth of field, 45° angle, magazine-grade composition.
- No text, no watermark, no humans, no utensils overflowing the frame.
- Square aspect, food fills 60-70% of the frame.

Output: a single high-quality square image (1024x1024 preferred).`;
}

async function generateImage(row: Row): Promise<string | null> {
  const resp = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(row) }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!resp.ok) {
    console.error(`  ❌ Gemini ${resp.status}: ${(await resp.text()).slice(0, 150)}`);
    return null;
  }
  const data = await resp.json() as any;
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!part) return null;
  return part.inlineData.data;  // base64 PNG/JPEG
}

async function uploadToSupabase(base64: string, id: string): Promise<string | null> {
  const buf = Buffer.from(base64, 'base64');
  const path = `michelin/${id}.png`;
  const { error } = await supabase.storage
    .from('dish-images')
    .upload(path, buf, { contentType: 'image/png', upsert: true });
  if (error) { console.error(`  ❌ upload: ${error.message}`); return null; }
  return supabase.storage.from('dish-images').getPublicUrl(path).data.publicUrl;
}

async function main() {
  const all = await fetchPending();
  const todo = isFinite(LIMIT) ? all.slice(0, LIMIT) : all;
  console.log(`🎨 Generating michelin images: ${todo.length} pending\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    process.stdout.write(`[${i+1}/${todo.length}] ${r.name_zh} … `);
    const b64 = await generateImage(r);
    if (!b64)        { console.log('⚠️ gen failed'); fail++; continue; }
    const url = await uploadToSupabase(b64, r.id);
    if (!url)        { console.log('⚠️ upload failed'); fail++; continue; }
    await db.query(`UPDATE michelin_dishes SET image_url = $1 WHERE id = $2`, [url, r.id]);
    console.log('✅');
    ok++;
  }

  console.log(`\n📊 Done: ${ok} ✅  ${fail} ⚠`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
