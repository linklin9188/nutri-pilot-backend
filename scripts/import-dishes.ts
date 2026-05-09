/**
 * Bulk dish importer — reads dishes.csv and upserts into Supabase.
 *
 * CSV format (first row = header, UTF-8, comma-separated):
 *   title_zh, title_en, meal_type, origin_cuisine, flavor_tags,
 *   health_benefit_tags, main_ingredient, seasonal_tag,
 *   description_zh, description_en
 *
 * Run: npx tsx scripts/import-dishes.ts
 *      Place your dishes.csv next to this file (scripts/dishes.csv)
 *
 * Notes:
 *   • flavor_tags / health_benefit_tags: use | as separator within the cell
 *     e.g.  light|seafood   or   damp_clear|maintain
 *   • meal_type: breakfast | lunch | dinner | all
 *   • origin_cuisine: cantonese | sichuan | jiangnan | northern |
 *                     western | japanese_korean | southeast_asian
 *   • main_ingredient: beef | chicken | pork | fish | shrimp | crab |
 *                      squid | scallop | clam | salmon | cod | seabass |
 *                      hairtail | duck | lamb | egg | tofu | mushroom |
 *                      veggie | carb | dessert | other
 *   • seasonal_tag: All-Season/Balanced | Spring | Summer | Autumn | Winter
 *   • image_url: leave blank — run gen-dish-images.ts to fill it
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { config } from 'dotenv';
config();

const CSV_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), 'dishes.csv');

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── CSV parser (handles quoted fields) ──────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple split — handles quoted commas by joining overlong fields
    const cells: string[] = [];
    let inQuote = false;
    let cell = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { cells.push(cell.trim()); cell = ''; }
      else { cell += ch; }
    }
    cells.push(cell.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').replace(/^"|"$/g, '').trim(); });
    results.push(row);
  }
  return results;
}

// ── Tag parsers ──────────────────────────────────────────────────────────────
function parseTags(val: string): string[] {
  return val.split('|').map(t => t.trim()).filter(Boolean);
}

// ── Allowed enum values ──────────────────────────────────────────────────────
const CUISINES = new Set([
  'cantonese','sichuan','jiangnan','northern','western','japanese_korean','southeast_asian',
]);
const MEAL_TYPES = new Set(['breakfast','lunch','dinner','all']);

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found: ${CSV_PATH}`);
    console.error('   Create scripts/dishes.csv using the template in scripts/dishes-template.csv');
    process.exit(1);
  }

  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(text);
  console.log(`📋 ${rows.length} rows found in CSV`);

  await client.connect();
  console.log('🔗 Connected to DB');

  let ok = 0, skipped = 0;

  for (const row of rows) {
    const titleZh = row['title_zh'];
    if (!titleZh) { skipped++; continue; }

    const mealType   = MEAL_TYPES.has(row['meal_type'])    ? row['meal_type']    : 'dinner';
    const cuisine    = CUISINES.has(row['origin_cuisine'])  ? row['origin_cuisine'] : 'cantonese';
    const flavorTags = parseTags(row['flavor_tags'] ?? '');
    const healthTags = parseTags(row['health_benefit_tags'] ?? '');
    const ingredient = row['main_ingredient'] || 'other';
    const seasonal   = row['seasonal_tag']    || 'All-Season/Balanced';

    await client.query(`
      INSERT INTO dishes
        (title_zh, title_en, meal_type, origin_cuisine,
         flavor_tags, health_benefit_tags, main_ingredient,
         seasonal_tag, description_zh, description_en, image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'')
      ON CONFLICT (title_zh) DO UPDATE SET
        title_en           = EXCLUDED.title_en,
        meal_type          = EXCLUDED.meal_type,
        origin_cuisine     = EXCLUDED.origin_cuisine,
        flavor_tags        = EXCLUDED.flavor_tags,
        health_benefit_tags = EXCLUDED.health_benefit_tags,
        main_ingredient    = EXCLUDED.main_ingredient,
        seasonal_tag       = EXCLUDED.seasonal_tag,
        description_zh     = EXCLUDED.description_zh,
        description_en     = EXCLUDED.description_en
    `, [
      titleZh,
      row['title_en']       || null,
      mealType,
      cuisine,
      flavorTags,
      healthTags,
      ingredient,
      seasonal,
      row['description_zh'] || null,
      row['description_en'] || null,
    ]);

    ok++;
  }

  console.log(`✅ ${ok} dishes upserted, ${skipped} rows skipped (missing title_zh)`);
  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
