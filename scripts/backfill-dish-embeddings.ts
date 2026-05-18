/**
 * backfill-dish-embeddings.ts — generate 768d Gemini embeddings for dishes.
 *
 * Reads rows WHERE embedding IS NULL OR last_backfilled_at IS NULL, builds a
 * compact semantic text for each dish (title + cuisine + tags + description +
 * cultural note), calls Gemini gemini-embedding-001 :embedContent with
 * outputDimensionality=768 (L2-normalized client-side per Gemini docs since
 * we're below the model's native 3072d), then writes the 768-d vector into
 * dishes.embedding (pgvector) plus dishes.last_backfilled_at = NOW().
 *
 * Idempotent: re-running picks up only un-embedded rows unless --force.
 *
 * Why direct Gemini (not gemini-proxy):
 *   - gemini-proxy only exposes :generateContent endpoints; :embedContent /
 *     :batchEmbedContents are not in its allow-list.
 *   - The "no frontend Gemini key" invariant covers the Vite bundle only.
 *     This is a server-side backfill running on the operator's machine with
 *     the key in .env (DIRECT_DATABASE_URL is here for the same reason).
 *
 * Usage:
 *   npx tsx scripts/backfill-dish-embeddings.ts --limit 3 --dry-run
 *   npx tsx scripts/backfill-dish-embeddings.ts --limit 3
 *   npx tsx scripts/backfill-dish-embeddings.ts                    # all
 *   npx tsx scripts/backfill-dish-embeddings.ts --force --limit 10  # re-embed
 *
 * Flags:
 *   --limit N        process at most N rows (default: unlimited)
 *   --concurrency N  parallel embedContent calls (default 5)
 *   --dry-run        print built texts, no API call, no DB write
 *   --force          re-embed rows that already have an embedding
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  // Treat next token as value unless it looks like another flag.
  if (!v || v.startsWith('--')) return 'true';
  return v;
}
const LIMIT       = arg('limit') ? parseInt(arg('limit')!, 10) : undefined;
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '5')!, 10));
const DRY_RUN     = arg('dry-run') === 'true';
const FORCE       = arg('force') === 'true';

// ---------------------------------------------------------------------------
// Gemini config
// ---------------------------------------------------------------------------
// gemini-embedding-001 is the current GA embedding model on this key
// (text-embedding-004 is not enabled). Native dimensionality is 3072; we
// request 768 to match dishes.embedding vector(768). Per Gemini docs, when
// outputDimensionality < native (3072) the vector is NOT auto-normalized,
// so we L2-normalize client-side before storing.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL          = 'models/gemini-embedding-001';
const EMBED_URL      = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:embedContent`;
const OUTPUT_DIM     = 768;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DishRow {
  id: string;
  title_zh: string | null;
  title_en: string | null;
  origin_cuisine: string | null;
  meal_type: string | null;
  course_type: string | null;
  main_ingredient: string | null;
  description_zh: string | null;
  description_en: string | null;
  flavor_tags: string[] | null;
  health_benefit_tags: string[] | null;
  protein_source: string[] | null;
  seasonal_tag: string | null;
  cook_method: string | null;
  cultural_note: string | null;
  western_subtype: string | null;
}

// ---------------------------------------------------------------------------
// Text builder: compact semantic prompt for the dish.
// ---------------------------------------------------------------------------
function buildText(d: DishRow): string {
  const arr = (a: string[] | null) =>
    Array.isArray(a) && a.length > 0 ? a.filter(Boolean).join(', ') : '';

  const head = [d.title_zh, d.title_en ? `(${d.title_en})` : ''].filter(Boolean).join(' ');

  const meta1: string[] = [];
  if (d.origin_cuisine)  meta1.push(`菜系 ${d.origin_cuisine}`);
  if (d.meal_type)       meta1.push(`餐别 ${d.meal_type}`);
  if (d.course_type)     meta1.push(`类型 ${d.course_type}`);
  if (d.main_ingredient) meta1.push(`主料 ${d.main_ingredient}`);
  if (d.western_subtype) meta1.push(`西餐子类 ${d.western_subtype}`);

  const meta2: string[] = [];
  const flavor  = arr(d.flavor_tags);
  const protein = arr(d.protein_source);
  if (flavor)         meta2.push(`口味 ${flavor}`);
  if (d.cook_method)  meta2.push(`烹法 ${d.cook_method}`);
  if (protein)        meta2.push(`蛋白 ${protein}`);

  const meta3: string[] = [];
  const health = arr(d.health_benefit_tags);
  if (health)            meta3.push(`功效 ${health}`);
  if (d.seasonal_tag)    meta3.push(`时令 ${d.seasonal_tag}`);

  const desc: string[] = [];
  if (d.description_zh) desc.push(d.description_zh.trim());
  if (d.description_en) desc.push(d.description_en.trim());

  const lines = [head];
  if (meta1.length) lines.push(meta1.join(' | '));
  if (meta2.length) lines.push(meta2.join(' | '));
  if (meta3.length) lines.push(meta3.join(' | '));
  if (desc.length)  lines.push('描述：' + desc.join(' / '));
  if (d.cultural_note) lines.push('文化：' + d.cultural_note.trim());

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Gemini :embedContent (single doc) with retry on 429/5xx, plus L2 normalize.
// ---------------------------------------------------------------------------
function l2Normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  if (n === 0) return v;
  return v.map(x => x / n);
}

async function embedOne(text: string): Promise<number[]> {
  const body = {
    model: MODEL,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: OUTPUT_DIM,
  };

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${EMBED_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j: { embedding: { values: number[] } } = await res.json();
      return l2Normalize(j.embedding.values);
    }
    const txt = await res.text();
    lastErr = new Error(`Gemini ${res.status}: ${txt.slice(0, 240)}`);
    // Retry on 429 / 5xx only.
    if (res.status !== 429 && res.status < 500) break;
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1) ** 2));
  }
  throw lastErr ?? new Error('Gemini call failed');
}

// Bounded-concurrency map: run `fn` over `items` with at most `n` in flight.
async function mapPool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  if (!GEMINI_API_KEY && !DRY_RUN) {
    console.error('Missing GEMINI_API_KEY in .env');
    process.exit(1);
  }

  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const where = FORCE
    ? `TRUE`
    : `embedding IS NULL OR last_backfilled_at IS NULL`;
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : '';

  const { rows } = await c.query<DishRow>(`
    SELECT id, title_zh, title_en, origin_cuisine, meal_type, course_type,
           main_ingredient, description_zh, description_en,
           flavor_tags, health_benefit_tags, protein_source,
           seasonal_tag, cook_method, cultural_note, western_subtype
    FROM dishes
    WHERE ${where}
    ORDER BY id
    ${limitSql}
  `);

  console.log(`[plan] ${rows.length} dish(es) to embed · concurrency=${CONCURRENCY} · ` +
              `dry-run=${DRY_RUN} · force=${FORCE}`);
  if (rows.length === 0) { await c.end(); return; }

  if (DRY_RUN) {
    for (const d of rows.slice(0, 3)) {
      console.log('\n--- sample text for', d.title_zh, `(${d.id})`, '---');
      console.log(buildText(d));
    }
    if (rows.length > 3) console.log(`\n(... ${rows.length - 3} more not shown)`);
    await c.end();
    return;
  }

  // Process in fixed-size chunks so DB commits stay small (and progress shows
  // up). Within each chunk, run embedContent calls in parallel up to CONCURRENCY.
  const CHUNK = 25;
  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const texts = slice.map(buildText);
    const vectors = await mapPool(texts, CONCURRENCY, embedOne);

    if (vectors[0].length !== OUTPUT_DIM) {
      throw new Error(`Expected ${OUTPUT_DIM}-d vector, got ${vectors[0].length}`);
    }

    await c.query('BEGIN');
    try {
      for (let k = 0; k < slice.length; k++) {
        const lit = '[' + vectors[k].join(',') + ']';
        await c.query(
          `UPDATE dishes SET embedding = $1::vector, last_backfilled_at = NOW() WHERE id = $2`,
          [lit, slice[k].id],
        );
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }

    done += slice.length;
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[chunk ${Math.floor(i / CHUNK) + 1}/${Math.ceil(rows.length / CHUNK)}] ` +
                `+${slice.length}  total ${done}/${rows.length}  (${dt}s)`);
  }

  // Sanity tail-check.
  const { rows: stat } = await c.query<{ total: number; embedded: number }>(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
    FROM dishes
  `);
  console.log(`\nDone. dishes total=${stat[0].total}, embedded=${stat[0].embedded}`);
  await c.end();
})().catch(e => { console.error('backfill FAILED:', e); process.exit(1); });
