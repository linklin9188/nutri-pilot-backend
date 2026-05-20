/**
 * snapshot-data-health.ts — daily snapshot of data_health_summary view
 *
 * TICKET-20260520-063 §C: initial dry-run / console.log only.
 * TICKET-20260520-064 §B: cut over to live INSERT into data_health_history
 *                         (table provisioned by migration 049 above).
 *
 * Runs SELECT * FROM data_health_summary (created by Database 057/062) and
 * either (dry-run) prints each row to stdout, or (live + PROD_GUARD) INSERTs
 * each row into data_health_history with timestamp + jsonb metadata so the
 * CEO can see day-over-day health trends.
 *
 * Run modes:
 *   • Default (DRY-RUN) — SELECT + console.log; no DB writes.
 *   • --live + AIEATS_PROD_SNAPSHOT=true — INSERT one row per data_health_summary row.
 *
 * Why PROD_GUARD: matches the rollup / translate scripts. A stray `npx tsx
 * --live` from a dev machine should NOT silently pollute production trend
 * data — the AIEATS_PROD_SNAPSHOT=true env var is the explicit opt-in.
 *
 * Run:
 *   npx tsx scripts/snapshot-data-health.ts                     # dry-run
 *   AIEATS_PROD_SNAPSHOT=true npx tsx scripts/snapshot-data-health.ts --live
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const DRY_RUN = !process.argv.includes('--live');
const PROD_GUARD = process.env.AIEATS_PROD_SNAPSHOT === 'true';

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface SummaryRow {
  table_name:      string;
  total_rows:      string;  // pg bigint → string
  missing_details: Record<string, unknown> | null;
}

async function snapshot(): Promise<void> {
  console.log(`=== Aieats data_health_summary snapshot ===`);
  console.log(`captured_at_utc : ${new Date().toISOString()}`);
  console.log(`mode            : ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);

  if (!DRY_RUN && !PROD_GUARD) {
    console.error('');
    console.error('[snapshot-data-health] REFUSING TO LIVE-INSERT — AIEATS_PROD_SNAPSHOT env not set.');
    console.error('  Safety guard so a stray `npx tsx ... --live` cannot touch prod history.');
    process.exit(1);
  }

  // Verify the view exists before SELECT to fail with a clean message.
  const { rows: existsRows } = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT FROM information_schema.views
       WHERE table_schema = 'public' AND table_name = 'data_health_summary'
     ) AS exists`,
  );
  if (!existsRows[0]?.exists) {
    console.error('data_health_summary view not found. Aborting snapshot.');
    process.exit(1);
  }

  const { rows } = await db.query<SummaryRow>('SELECT * FROM data_health_summary');
  console.log(`rows_returned   : ${rows.length}`);
  console.log('--- rows ---');

  let inserted = 0;
  for (const r of rows) {
    console.log(JSON.stringify(r));
    if (DRY_RUN) continue;

    // LIVE — INSERT INTO data_health_history. The 3 dedicated numeric columns
    // are pulled out of metadata for fast querying; the full payload also goes
    // into `metadata` jsonb so anything we forgot is still recoverable.
    const md = r.missing_details ?? {};
    const missingImage     = typeof (md as any).missing_image     === 'number' ? (md as any).missing_image     : null;
    const missingNutrition = typeof (md as any).missing_nutrition === 'number' ? (md as any).missing_nutrition : null;
    const withIngredients  = typeof (md as any).with_ingredients  === 'number' ? (md as any).with_ingredients  : null;

    await db.query(
      `INSERT INTO data_health_history
         (table_name, total_rows, missing_image, missing_nutrition, with_ingredients, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [r.table_name, Number(r.total_rows), missingImage, missingNutrition, withIngredients, JSON.stringify(md)],
    );
    inserted++;
  }

  console.log(`=== end snapshot ===`);
  if (!DRY_RUN) {
    console.log(`inserted ${inserted} row(s) into data_health_history`);
  } else {
    console.log(`DRY-RUN: would insert ${rows.length} row(s) into data_health_history`);
  }
}

snapshot()
  .then(() => db.end())
  .catch((e) => {
    console.error('[snapshot-data-health] crashed:', e);
    db.end();
    process.exit(1);
  });
