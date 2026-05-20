/**
 * snapshot-data-health.ts — Day 12 daily snapshot of data_health_summary view
 *
 * Spec : TICKET-20260520-063 §C
 *
 * Runs SELECT * FROM data_health_summary (created by Database 057/062) and
 * prints every row to stdout. GitHub Actions captures the log so the CEO can
 * see the morning health snapshot in the workflow run page.
 *
 * Note: TICKET-063 §C originally asked the snapshot to INSERT into a
 * `data_health_history` table for trend analysis. As of 2026-05-20T20:55 that
 * table is NOT yet provisioned (Database has not built it; the suggested
 * fallback `_archive_data_health` also doesn't exist). The script therefore
 * only console.logs — the GitHub Actions workflow log is the history archive
 * for now. Database can later add `data_health_history` (jsonb column for
 * generic shape) and a follow-up ticket will switch this script to INSERT.
 *
 * Run:
 *   npx tsx scripts/snapshot-data-health.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function snapshot(): Promise<void> {
  console.log('=== Aieats data_health_summary snapshot ===');
  console.log(`captured_at_utc : ${new Date().toISOString()}`);

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

  const { rows } = await db.query('SELECT * FROM data_health_summary');
  console.log(`rows_returned   : ${rows.length}`);
  console.log('--- rows ---');
  for (const r of rows) {
    console.log(JSON.stringify(r));
  }
  console.log('=== end snapshot ===');
}

snapshot()
  .then(() => db.end())
  .catch((e) => {
    console.error('[snapshot-data-health] crashed:', e);
    db.end();
    process.exit(1);
  });
