/**
 * feedback-to-prompt.ts — Day 2 helper-feedback rollup (dry-run only)
 *
 * Implements docs/SPEC_day2_feedback_pipeline.md §3.1 — aggregates the last 7
 * days of helper feedback by (dish_id, feedback_type, step_index) and lists
 * dishes that would have dishes.meta.prep_steps_json_needs_regen flipped on.
 *
 * Threshold: a single dish_id collecting ≥3 same-type feedback entries
 * (cant_understand / too_hard / missing_ingredient) crosses the bar.
 *
 * Dry-run ONLY. The script never writes to dishes.meta in this ticket
 * (TELEPOT-20260520-014 §D explicitly defers real writes to Day 3). The
 * cron registration (pg_cron / GitHub Actions schedule) is also Day 3.
 *
 * Schema check: helper feedback lives in a NEW dedicated table named
 * `user_feedback_helper` (CEO chose this name to avoid colliding with the
 * legacy user_feedback table — see TICKET-20260520-018). The new table is
 * provisioned by Database TICKET-016 with the HELPER-FEEDBACK shape required
 * by SPEC §3.1: dish_id / feedback_type / step_index / created_at. If the
 * table or its required columns are missing, the script aborts gracefully
 * with a clear message instead of crashing, so the cron entry can be
 * installed before the Database part lands.
 *
 * Run:
 *   npx tsx scripts/feedback-to-prompt.ts
 *   npx tsx scripts/feedback-to-prompt.ts --window-days=14
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const HELPER_FEEDBACK_TYPES = ['cant_understand', 'too_hard', 'missing_ingredient'] as const;
const THRESHOLD = 3;
const WINDOW_DAYS = (() => {
  const a = process.argv.find(a => a.startsWith('--window-days='));
  return a ? parseInt(a.split('=')[1], 10) : 7;
})();

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface SchemaCheck {
  ok: boolean;
  missingCols: string[];
  presentCols: string[];
}

async function checkSchema(): Promise<SchemaCheck> {
  const { rows } = await db.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_feedback_helper'
  `);
  const cols = new Set(rows.map(r => r.column_name));
  const required = ['dish_id', 'feedback_type', 'step_index'];
  const missing = required.filter(c => !cols.has(c));
  return { ok: missing.length === 0, missingCols: missing, presentCols: [...cols] };
}

interface RollupRow {
  dish_id: string;
  feedback_type: string;
  step_index: number | null;
  n: string;  // pg COUNT(*) returns bigint → string
}

async function rollup(): Promise<void> {
  console.log(`[feedback-to-prompt] dry-run only (real writes deferred to Day 3)`);
  console.log(`[feedback-to-prompt] window=${WINDOW_DAYS}d, threshold=${THRESHOLD}, types=${HELPER_FEEDBACK_TYPES.join('|')}`);

  const schema = await checkSchema();
  if (!schema.ok) {
    console.log('');
    console.log('[feedback-to-prompt] SCHEMA NOT READY');
    console.log(`  user_feedback_helper present cols : ${schema.presentCols.join(', ')}`);
    console.log(`  user_feedback_helper missing cols : ${schema.missingCols.join(', ')}`);
    console.log('  Reason : user_feedback_helper (Database TICKET-016) is not yet in production,');
    console.log('           or it exists but is missing SPEC §3.1 columns');
    console.log('           (dish_id / feedback_type / step_index).');
    console.log('  Action : Rollup aborted gracefully. would-mark count: 0');
    console.log('           Re-run after Database creates user_feedback_helper.');
    return;
  }

  const { rows } = await db.query<RollupRow>(
    `SELECT dish_id, feedback_type, step_index, COUNT(*) AS n
     FROM user_feedback_helper
     WHERE feedback_type = ANY($1::text[])
       AND created_at >= NOW() - ($2::int || ' days')::interval
     GROUP BY dish_id, feedback_type, step_index
     HAVING COUNT(*) >= $3`,
    [Array.from(HELPER_FEEDBACK_TYPES), WINDOW_DAYS, THRESHOLD],
  );

  if (rows.length === 0) {
    console.log('');
    console.log('[feedback-to-prompt] No (dish, type, step) tuples crossed the threshold.');
    console.log('[feedback-to-prompt] would-mark count: 0');
    return;
  }

  console.log('');
  console.log(`[feedback-to-prompt] ${rows.length} (dish, type, step) tuples crossed the threshold:`);
  for (const r of rows) {
    console.log(`  - dish_id=${r.dish_id} type=${r.feedback_type} step=${r.step_index ?? '-'} count=${r.n}`);
  }
  const uniqDishes = new Set(rows.map(r => r.dish_id)).size;
  console.log('');
  console.log(`[feedback-to-prompt] DRY-RUN: would set dishes.meta.prep_steps_json_needs_regen=true on ${uniqDishes} dishes.`);
  console.log('[feedback-to-prompt] No writes performed. Day 3 ticket flips the real-write path.');
}

rollup()
  .then(() => db.end())
  .catch(e => {
    console.error('[feedback-to-prompt] crashed:', e);
    db.end();
    process.exit(1);
  });
