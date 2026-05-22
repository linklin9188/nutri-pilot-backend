/**
 * feedback-rollup.ts — TICKET-20260522-018 §B (live: --commit writes pref_scores)
 *
 * Aggregates user_feedback_helper rows over a sliding window (default 7d), then
 * computes per-user × per-axis score, persists to user_profiles.pref_scores jsonb.
 *
 *   axis     = pmc:* | cuisine:* | tag:*   (CEO ack 2026-05-22, TICKET-018)
 *   signal   = +1 for rating_good, -1 for rating_bad, 0 for rating_okay
 *              cant_understand/too_hard/missing_ingredient are step-level —
 *              skipped here (Day-2 prep_steps pipeline owns them, see
 *              feedback-to-prompt.ts).
 *   score(axis) = mean(signal) over axis bucket
 *   n(axis)     = row count in bucket — algo uses n>=30 as learned threshold
 *
 * Persisted jsonb format (matches migration 070 COMMENT):
 *   user_profiles.pref_scores = {
 *     "pmc:red":          {"score": 0.8, "n": 42},
 *     "cuisine:cantonese":{"score":-0.5, "n": 12},
 *     "tag:low_sodium":   {"score": 1.0, "n":  5}
 *   }
 *
 * Algorithm consumption (useWeeklyMenu.ts:3122-3134) reads this jsonb and
 * passes to scoreForWeek as Record<string, number>. NOTE: current v54 reader
 * casts to `Record<string, number>` directly — axis keys here use the
 * pmc / cuisine / tag prefixed convention agreed with CEO, so Algorithm reader will
 * receive object-typed values until v55 adds the unwrap step. Until then,
 * useWeeklyMenu falls back to user_preference_scores cold-start. Backend's
 * rollup write is correct per CEO contract; Algorithm reader update is a
 * separate phase. See _bridge/telepot_response_backend.md TICKET-018 §B.
 *
 * Run:
 *   npx tsx scripts/feedback-rollup.ts                # default: 7d window, dry-run
 *   npx tsx scripts/feedback-rollup.ts --window-days=14
 *   npx tsx scripts/feedback-rollup.ts --commit       # writes pref_scores
 */
import { createClient } from '@supabase/supabase-js';

// GHA cron passes SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY as env secrets;
// local dev falls back to the bundled anon-publishable key (RLS USING(true) allows
// user_profiles UPDATE either way — service-role just bypasses RLS for safety).
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const COMMIT     = process.argv.includes('--commit');
const WINDOW_ARG = process.argv.find(a => a.startsWith('--window-days='));
const WINDOW_DAYS = WINDOW_ARG ? parseInt(WINDOW_ARG.split('=')[1], 10) : 7;
const COLDSTART_CONF = 0.35;
const LEARNED_CONF   = 1.50;
const SIGNAL_THRESHOLD = 30;

interface FbRow { id: string; user_id: string; dish_id: string | null; feedback_type: string; created_at: string }
interface DishRow { id: string; protein_main_class: string | null; origin_cuisine: string | null; health_benefit_tags: string[] | null }

function signalOf(fbType: string): number | null {
  if (fbType === 'rating_good') return +1;
  if (fbType === 'rating_bad')  return -1;
  if (fbType === 'rating_okay') return 0;
  return null; // step-level events skipped
}

(async () => {
  console.log(`[feedback-rollup] mode=${COMMIT ? 'COMMIT (live writes)' : 'DRY-RUN'}  window=${WINDOW_DAYS}d`);
  console.log();

  const sinceISO = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  console.log(`[feedback-rollup] window since ${sinceISO}`);

  // 1) pull rolling-window feedback rows.
  const { data: fb, error: fbErr } = await sb
    .from('user_feedback_helper')
    .select('id, user_id, dish_id, feedback_type, created_at')
    .gte('created_at', sinceISO);
  if (fbErr) { console.error('fb fetch failed:', fbErr.message); process.exit(1); }
  console.log(`[feedback-rollup] feedback rows in window: ${fb?.length ?? 0}`);
  if (!fb?.length) { console.log('  (no feedback this window — nothing to roll up)'); return; }

  // 2) JOIN dishes for axis derivation
  const dishIds = [...new Set(fb.map(r => r.dish_id).filter(Boolean) as string[])];
  const { data: dishes, error: dErr } = await sb
    .from('dishes')
    .select('id, protein_main_class, origin_cuisine, health_benefit_tags')
    .in('id', dishIds);
  if (dErr) { console.error('dish fetch failed:', dErr.message); process.exit(1); }
  const dishById = new Map<string, DishRow>((dishes ?? []).map(d => [d.id, d as DishRow]));
  console.log(`[feedback-rollup] joined ${dishById.size} distinct dishes`);

  // 3) per-user × per-axis signal aggregation.
  // axis key examples: "pmc:red", "cuisine:cantonese", "tag:low_sodium"
  type Bucket = { signals: number[] };
  const perUser: Map<string, Map<string, Bucket>> = new Map();
  const pushSignal = (userId: string, axisKey: string, signal: number) => {
    if (!perUser.has(userId)) perUser.set(userId, new Map());
    const m = perUser.get(userId)!;
    if (!m.has(axisKey)) m.set(axisKey, { signals: [] });
    m.get(axisKey)!.signals.push(signal);
  };

  let skippedStep = 0;
  let skippedDishless = 0;
  for (const row of fb as FbRow[]) {
    const sig = signalOf(row.feedback_type);
    if (sig === null) { skippedStep++; continue; }
    if (!row.dish_id) { skippedDishless++; continue; }
    const d = dishById.get(row.dish_id);
    if (!d) continue;
    if (d.protein_main_class) pushSignal(row.user_id, `pmc:${d.protein_main_class}`, sig);
    if (d.origin_cuisine)     pushSignal(row.user_id, `cuisine:${d.origin_cuisine}`, sig);
    for (const t of d.health_benefit_tags ?? []) {
      pushSignal(row.user_id, `tag:${t}`, sig);
    }
  }
  console.log(`[feedback-rollup] step-level skipped=${skippedStep} dishless skipped=${skippedDishless}`);
  console.log(`[feedback-rollup] users with rollup data: ${perUser.size}`);

  // 4) compute pref_scores jsonb per user — format matches migration 070 COMMENT.
  const userPrefScores: Record<string, Record<string, { score: number; n: number }>> = {};
  let totalAxesUpdated = 0;
  for (const [userId, axes] of perUser) {
    userPrefScores[userId] = {};
    for (const [axisKey, bucket] of axes) {
      const n = bucket.signals.length;
      const mean = n === 0 ? 0 : bucket.signals.reduce((a, b) => a + b, 0) / n;
      userPrefScores[userId][axisKey] = { score: +mean.toFixed(3), n };
      totalAxesUpdated++;
    }
  }
  console.log(`[feedback-rollup] total (user × axis) rows computed: ${totalAxesUpdated}`);

  // 5) preview first 3 users' rollup for sanity check.
  const previewUsers = [...perUser.keys()].slice(0, 3);
  for (const u of previewUsers) {
    console.log(`\n[preview] user=${u.slice(0, 12)}…  axes=${Object.keys(userPrefScores[u]).length}`);
    const sorted = Object.entries(userPrefScores[u]).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    for (const [k, v] of sorted) {
      const learned = v.n >= SIGNAL_THRESHOLD ? 'learned' : 'cold';
      console.log(`   ${k.padEnd(28)} n=${String(v.n).padStart(3)}  score=${String(v.score).padStart(6)}  (${learned})`);
    }
  }

  if (!COMMIT) {
    console.log(`\n[DRY-RUN] no UPDATE on user_profiles.pref_scores; no audit row inserted.`);
    console.log(`[DRY-RUN] would write ${perUser.size} users × ${totalAxesUpdated} axes total.`);
    return;
  }

  // 6) COMMIT — UPDATE user_profiles.pref_scores per user.
  console.log(`\n[COMMIT] writing pref_scores for ${perUser.size} users…`);
  let okUsers = 0;
  let errUsers = 0;
  for (const [userId, jsonb] of Object.entries(userPrefScores)) {
    const { error: upErr } = await sb
      .from('user_profiles')
      .update({ pref_scores: jsonb })
      .eq('id', userId);
    if (upErr) {
      errUsers++;
      console.error(`   UPDATE failed for user=${userId.slice(0, 12)}…: ${upErr.message}`);
    } else {
      okUsers++;
    }
  }
  console.log(`[COMMIT] user_profiles.pref_scores written — ok=${okUsers} err=${errUsers}`);

  // 7) audit INSERT into feedback_rollup_runs (graceful degrade if table missing).
  const { error: auditErr } = await sb
    .from('feedback_rollup_runs')
    .insert({
      run_at:           new Date().toISOString(),
      users_affected:   okUsers,
      axes_updated:     totalAxesUpdated,
    });
  if (auditErr) {
    console.warn(`[AUDIT-DEGRADED] feedback_rollup_runs INSERT skipped: ${auditErr.message}`);
    console.warn(`                 (Database task pending: CREATE TABLE feedback_rollup_runs (id uuid PK, run_at timestamptz, users_affected int, axes_updated int);)`);
  } else {
    console.log(`[AUDIT] feedback_rollup_runs row inserted — users=${okUsers} axes=${totalAxesUpdated}`);
  }
})();
