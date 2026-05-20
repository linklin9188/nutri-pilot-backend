/**
 * feedback-to-prompt.ts — Day 2/3 helper-feedback rollup
 *
 * Implements docs/SPEC_day2_feedback_pipeline.md §3.1 — aggregates the last 7
 * days of helper feedback by (dish_id, feedback_type, step_index) and flips
 * dishes.meta.prep_steps_json_needs_regen=true for dishes crossing the
 * threshold.
 *
 * Threshold: a single dish_id collecting ≥3 same-type feedback entries
 * (cant_understand / too_hard / missing_ingredient) crosses the bar.
 *
 * Run modes (TICKET-20260520-022 §A/§C):
 *   • Default (LIVE) — real UPDATEs on dishes.meta. Requires AIEATS_PROD_ROLLUP=true
 *     env var as a hard kill-switch so a stray `npx tsx` never touches prod.
 *   • --dry-run     — only log "would-mark"; skips UPDATE; no PROD_GUARD needed.
 *
 * Schema checks (defense-in-depth before live writes):
 *   1. user_feedback_helper exists + has dish_id/feedback_type/step_index (SPEC §3.1)
 *      Provisioned by Database TICKET-016.
 *   2. dishes.meta jsonb column exists (target of UPDATE). If missing, abort
 *      with a clear message instead of crashing the SQL — Database needs to
 *      add this column before live-run can succeed.
 *
 * Cron: see .github/workflows/feedback-rollup-daily.yml (TICKET-20260520-022 §B).
 *
 * Run:
 *   npx tsx scripts/feedback-to-prompt.ts --dry-run
 *   AIEATS_PROD_ROLLUP=true npx tsx scripts/feedback-to-prompt.ts
 *   AIEATS_PROD_ROLLUP=true npx tsx scripts/feedback-to-prompt.ts --window-days=14
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

// §A: default is LIVE (real updates). --dry-run flag opts back to dry-run.
const DRY_RUN = process.argv.includes('--dry-run');

// §C: PROD_GUARD prevents accidental writes. Only honored in live mode.
const PROD_GUARD = process.env.AIEATS_PROD_ROLLUP === 'true';

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface SchemaCheck {
  ok: boolean;
  missingCols: string[];
  presentCols: string[];
}

async function checkRollupSchema(): Promise<SchemaCheck> {
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

async function checkDishesMetaColumn(): Promise<boolean> {
  const { rows } = await db.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dishes' AND column_name = 'meta'
  `);
  return rows.length > 0;
}

interface RollupRow {
  dish_id: string;
  feedback_type: string;
  step_index: number | null;
  n: string;  // pg COUNT(*) returns bigint → string
}

async function fetchDishTitles(dishIds: string[]): Promise<Map<string, string>> {
  if (dishIds.length === 0) return new Map();
  const { rows } = await db.query<{ id: string; title_zh: string | null }>(
    `SELECT id, title_zh FROM dishes WHERE id = ANY($1::uuid[])`,
    [dishIds],
  );
  return new Map(rows.map(r => [r.id, r.title_zh ?? '(无标题)']));
}

async function rollup(): Promise<void> {
  console.log(`[feedback-to-prompt] mode=${DRY_RUN ? 'DRY-RUN' : 'LIVE'} window=${WINDOW_DAYS}d threshold=${THRESHOLD}`);
  console.log(`[feedback-to-prompt] types=${HELPER_FEEDBACK_TYPES.join('|')}`);

  // §C: PROD_GUARD enforces explicit opt-in before any live write
  if (!DRY_RUN && !PROD_GUARD) {
    console.error('');
    console.error('[feedback-to-prompt] REFUSING TO LIVE-UPDATE — AIEATS_PROD_ROLLUP env not set.');
    console.error('  This is a safety guard so a stray `npx tsx` cannot touch prod dishes.meta.');
    console.error('  Either pass --dry-run, or set AIEATS_PROD_ROLLUP=true to enable live writes.');
    process.exit(1);
  }

  // Schema check 1: user_feedback_helper source table
  const rollupSchema = await checkRollupSchema();
  if (!rollupSchema.ok) {
    console.log('');
    console.log('[feedback-to-prompt] SCHEMA NOT READY — source table user_feedback_helper');
    console.log(`  present cols : ${rollupSchema.presentCols.join(', ')}`);
    console.log(`  missing cols : ${rollupSchema.missingCols.join(', ')}`);
    console.log('  Reason : user_feedback_helper (Database TICKET-016) is not yet in production,');
    console.log('           or it exists but is missing SPEC §3.1 columns');
    console.log('           (dish_id / feedback_type / step_index).');
    console.log('  Action : Rollup aborted gracefully. would-mark count: 0');
    return;
  }

  // Schema check 2: dishes.meta target column — only required for live writes
  if (!DRY_RUN) {
    const hasMeta = await checkDishesMetaColumn();
    if (!hasMeta) {
      console.error('');
      console.error('[feedback-to-prompt] SCHEMA NOT READY — dishes.meta column missing');
      console.error('  Live-run requires dishes.meta jsonb column for prep_steps_json_needs_regen flag.');
      console.error('  Action : Live UPDATE aborted (would have crashed mid-loop). would-mark count: 0');
      console.error('           Database team must add dishes.meta jsonb column before live-run can succeed.');
      console.error('           Workaround until that lands: re-run with --dry-run to inspect what would change.');
      process.exit(1);
    }
  }

  // §A core rollup query — group by (dish, type, step), filter by threshold
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

  // Resolve dish titles for friendlier logs
  const titles = await fetchDishTitles([...new Set(rows.map(r => r.dish_id))]);

  console.log('');
  console.log(`[feedback-to-prompt] ${rows.length} (dish, type, step) tuples crossed the threshold:`);

  let touchedDishes = 0;
  const markedAt = new Date().toISOString();

  for (const r of rows) {
    const title = titles.get(r.dish_id) ?? '(unknown)';
    const stepLabel = r.step_index ?? '-';
    const line = `  - dish_id=${r.dish_id} title="${title}" type=${r.feedback_type} step=${stepLabel} count=${r.n}`;

    if (DRY_RUN) {
      console.log(`${line}  [DRY-RUN: would mark]`);
      continue;
    }

    // §A live UPDATE — merge {prep_steps_json_needs_regen, reason, step_index, marked_at}
    // into dishes.meta. jsonb_set with create_missing=true builds keys on the fly.
    await db.query(
      `UPDATE dishes
         SET meta = COALESCE(meta, '{}'::jsonb)
                     || jsonb_build_object(
                          'prep_steps_json_needs_regen', true,
                          'reason',     $2::text,
                          'step_index', $3::int,
                          'marked_at',  $4::text
                        )
       WHERE id = $1::uuid`,
      [r.dish_id, r.feedback_type, r.step_index, markedAt],
    );
    touchedDishes++;
    console.log(`${line}  [LIVE: marked dishes.meta.prep_steps_json_needs_regen=true]`);
  }

  console.log('');
  const uniqDishes = new Set(rows.map(r => r.dish_id)).size;
  if (DRY_RUN) {
    console.log(`[feedback-to-prompt] DRY-RUN: would mark ${uniqDishes} dishes (no DB writes performed).`);
  } else {
    console.log(`[feedback-to-prompt] LIVE: ${touchedDishes} UPDATE rows applied across ${uniqDishes} unique dishes.`);
  }
}

rollup()
  .then(() => db.end())
  .catch(e => {
    console.error('[feedback-to-prompt] crashed:', e);
    db.end();
    process.exit(1);
  });
