/**
 * feedback-rollup.ts — TICKET-20260522-012 §B (skeleton, dry-run only)
 *
 * Aggregates user_feedback_helper rows over a sliding window (default 7d), then
 * computes per-user × per-axis signal strength, ready to be persisted as
 * user_profiles.pref_scores jsonb. Axis definition (per CEO 工单 §B):
 *
 *   axis     = dish.protein_main_class | dish.origin_cuisine | dish.health_benefit_tags[*]
 *   signal   = +1 for rating_good, -1 for rating_bad, 0 for rating_okay
 *              cant_understand/too_hard/missing_ingredient are step-level —
 *              skipped here (Day-2 prep_steps pipeline owns them, see
 *              feedback-to-prompt.ts).
 *   strength = mean(signal) over axis bucket (matches "mean signal strength" 工单语义)
 *   confidence(axis) = 1.50 if axis row count ≥ 30 else 0.35   (matches algo prefScores cold-start/learned split)
 *
 * BLOCKER (真跑前置, 见 §F of telepot_response):
 *   1. user_profiles.pref_scores jsonb 列不存在 (commit 292c6eb 写了 reader 但 DB
 *      migration 缺) → 真跑 INSERT/UPDATE pref_scores 会 PostgREST 4xx.
 *   2. 工单 "axis" 一词在 user_feedback_helper schema 里无对应列 (只有 feedback_type) —
 *      本骨架按 dish JOIN 推导 axis (上文规则), 待 CEO/Algorithm 确认是否一致.
 *   3. cron edge function 暂不部署 — 部署后会每天 03:30 HKT 写空 jsonb, 等
 *      上面 2 点 ack 后再 deploy 为 edge function + 加 Supabase Scheduler.
 *
 * Run:
 *   npx tsx scripts/feedback-rollup.ts                # default: 7d window, dry-run
 *   npx tsx scripts/feedback-rollup.ts --window-days=14
 *   npx tsx scripts/feedback-rollup.ts --commit       # blocked — will error out with note
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
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
  console.log(`[feedback-rollup] mode=${COMMIT ? 'COMMIT (blocked)' : 'DRY-RUN'}  window=${WINDOW_DAYS}d`);
  console.log();

  if (COMMIT) {
    console.error('[BLOCKER] --commit refused: user_profiles.pref_scores jsonb column does not exist yet.');
    console.error('          See telepot_response_backend.md §F. Awaiting Database migration that adds:');
    console.error('            ALTER TABLE user_profiles ADD COLUMN pref_scores JSONB DEFAULT \'{}\'::jsonb;');
    console.error('          AND CEO/Algorithm ack on axis derivation rule (see top-of-file comment).');
    process.exit(2);
  }

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

  // 4) compute pref_scores jsonb per user.
  const userPrefScores: Record<string, Record<string, { strength: number; n: number; confidence: number }>> = {};
  let totalAxesUpdated = 0;
  for (const [userId, axes] of perUser) {
    userPrefScores[userId] = {};
    for (const [axisKey, bucket] of axes) {
      const n = bucket.signals.length;
      const mean = n === 0 ? 0 : bucket.signals.reduce((a, b) => a + b, 0) / n;
      const confidence = n >= SIGNAL_THRESHOLD ? LEARNED_CONF : COLDSTART_CONF;
      userPrefScores[userId][axisKey] = { strength: +mean.toFixed(3), n, confidence };
      totalAxesUpdated++;
    }
  }
  console.log(`[feedback-rollup] total (user × axis) rows computed: ${totalAxesUpdated}`);

  // 5) DRY-RUN: print first 3 users' rollup for sanity check.
  const previewUsers = [...perUser.keys()].slice(0, 3);
  for (const u of previewUsers) {
    console.log(`\n[DRY] user=${u.slice(0, 12)}…  axes=${Object.keys(userPrefScores[u]).length}`);
    const sorted = Object.entries(userPrefScores[u]).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    for (const [k, v] of sorted) {
      console.log(`   ${k.padEnd(28)} n=${String(v.n).padStart(3)}  strength=${String(v.strength).padStart(6)}  conf=${v.confidence}`);
    }
  }

  console.log(`\n[DRY-RUN] no UPDATE on user_profiles.pref_scores (column doesn't exist).`);
  console.log(`[DRY-RUN] no INSERT into feedback_rollup_runs (would write run_at + users_affected=${perUser.size} + axes_updated=${totalAxesUpdated}).`);
  console.log(`[DRY-RUN] cron edge function NOT deployed — see telepot_response_backend.md §F blocker.`);
})();
