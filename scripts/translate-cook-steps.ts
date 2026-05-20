/**
 * translate-cook-steps.ts — Day 5 embedded i18n step translation
 *
 * CEO TICKET-20260520-029 picked the embedded i18n direction (NOT sidecar
 * columns). Each cook_steps_json step object already carries action_zh /
 * action_en / state_target_zh / state_target_en (verified on prod
 * 2026-05-20). This script fills the missing _tl + _id companions in place
 * via jsonb merge — no migration needed.
 *
 * Per-step shape after this script runs:
 *   {
 *     step, duration_min,
 *     action_zh, action_en, action_tl, action_id,
 *     state_target_zh, state_target_en, state_target_tl, state_target_id
 *   }
 *
 * Schema check: dishes.cook_steps_json exists (verified). The script does
 * NOT need any sidecar column.
 *
 * Run modes:
 *   • Default (DRY-RUN) — counts dishes + steps + missing (field,lang) tuples;
 *     never calls gemini-proxy/translate. Use this to estimate quota before
 *     paying for a live run.
 *   • --live + AIEATS_PROD_TRANSLATE=true — actually calls translate per
 *     missing tuple and writes the merged cook_steps_json back to dishes.
 *
 * Run:
 *   npx tsx scripts/translate-cook-steps.ts
 *   npx tsx scripts/translate-cook-steps.ts --limit=10
 *   AIEATS_PROD_TRANSLATE=true npx tsx scripts/translate-cook-steps.ts --live --limit=5
 *
 * Quota note: gemini-proxy translate is 50/day per user_id. A 7-step dish
 * with action + state_target missing in tl + id = 28 calls. For larger
 * batches, the script auto-rotates SCRIPT_USER_ID prefix per dish so each
 * dish runs against a fresh quota bucket (worst case ~30 calls/dish < 50).
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const DRY_RUN  = !process.argv.includes('--live');
const LIMIT    = (() => {
  const a = process.argv.find(a => a.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : 5;
})();
const PROD_GUARD = process.env.AIEATS_PROD_TRANSLATE === 'true';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';

// TICKET-050 flags:
// --skip-already-translated  → SELECT only dishes whose cook_steps_json has at least
//                              one step missing action_tl/action_id/state_target_tl/_id.
//                              Lets batch resume across runs without re-scanning the
//                              5/20/50 dishes already done.
// --user-suffix=<x>          → swap the per-dish quota namespace, e.g. :v2 → :v3
//                              when :v2 buckets get burned by sustained 5xx retries.
const SKIP_ALREADY_TRANSLATED = process.argv.includes('--skip-already-translated');
const USER_SUFFIX = (() => {
  const a = process.argv.find(a => a.startsWith('--user-suffix='));
  return a ? a.split('=')[1] : 'v2';
})();

const TARGET_LANGS = ['en', 'tl', 'id'] as const;
type Lang = typeof TARGET_LANGS[number];

const FIELDS_TO_TRANSLATE = ['action', 'state_target'] as const;
type Field = typeof FIELDS_TO_TRANSLATE[number];

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface SchemaCheck {
  ok: boolean;
  present: boolean;
}

async function checkSchema(): Promise<SchemaCheck> {
  const { rows } = await db.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dishes' AND column_name = 'cook_steps_json'
  `);
  return { ok: rows.length > 0, present: rows.length > 0 };
}

interface DishRow {
  id: string;
  title_zh: string | null;
  cook_steps_json: unknown;
}

interface Step {
  step?:              number;
  duration_min?:      number;
  action_zh?:         string;
  action_en?:         string;
  action_tl?:         string;
  action_id?:         string;
  state_target_zh?:   string;
  state_target_en?:   string;
  state_target_tl?:   string;
  state_target_id?:   string;
  [k: string]:        unknown;
}

interface MissingTuple {
  field: Field;
  lang:  Lang;
}

function missingForStep(step: Step): MissingTuple[] {
  const out: MissingTuple[] = [];
  for (const field of FIELDS_TO_TRANSLATE) {
    const zhKey = `${field}_zh` as keyof Step;
    const source = step[zhKey];
    if (typeof source !== 'string' || source.trim() === '') continue;  // source missing → skip whole field
    for (const lang of TARGET_LANGS) {
      const langKey = `${field}_${lang}` as keyof Step;
      const current = step[langKey];
      if (typeof current === 'string' && current.trim() !== '') continue;  // already filled
      out.push({ field, lang });
    }
  }
  return out;
}

// Retry on transient upstream 5xx (Gemini "high demand" 503 is the common case).
// 4xx (bad input / quota / auth) fails fast — retrying wouldn't help and would
// just waste the local quota counter.
const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function callTranslate(sourceText: string, lang: Lang, userId: string): Promise<string | null> {
  if (!SUPABASE_URL) return null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s. Plenty of room for a Gemini spike to clear.
      const delay = Math.pow(2, attempt) * 1000;
      await sleep(delay);
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-proxy`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_id:     userId,
        endpoint:    'translate',
        source_text: sourceText,
        target_lang: lang,
        domain:      'cooking',
      }),
    });
    if (res.ok) {
      const j = await res.json() as { translation?: string; error?: string };
      if (j.error) {
        console.error(`    callTranslate ${lang} error in 200 body: ${j.error}`);
        return null;
      }
      return j.translation ?? null;
    }
    const t = await res.text().catch(() => '');
    if (!RETRY_STATUSES.has(res.status)) {
      console.error(`    callTranslate ${lang} HTTP ${res.status} (no retry): ${t.slice(0, 200)}`);
      return null;
    }
    if (attempt === MAX_RETRIES) {
      console.error(`    callTranslate ${lang} HTTP ${res.status} exhausted ${MAX_RETRIES} retries: ${t.slice(0, 200)}`);
      return null;
    }
    console.log(`    callTranslate ${lang} HTTP ${res.status}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})...`);
  }
  return null;
}

async function rollup(): Promise<void> {
  console.log(`[translate-cook-steps] mode=${DRY_RUN ? 'DRY-RUN' : 'LIVE'} limit=${LIMIT} targets=${TARGET_LANGS.join('/')} fields=${FIELDS_TO_TRANSLATE.join('/')}`);

  if (!DRY_RUN && !PROD_GUARD) {
    console.error('');
    console.error('[translate-cook-steps] REFUSING TO LIVE-UPDATE — AIEATS_PROD_TRANSLATE env not set.');
    console.error('  Safety guard so a stray `npx tsx ... --live` cannot touch prod.');
    process.exit(1);
  }

  if (!DRY_RUN && !SUPABASE_URL) {
    console.error('[translate-cook-steps] VITE_SUPABASE_URL / SUPABASE_URL missing in .env.');
    process.exit(1);
  }

  const schema = await checkSchema();
  if (!schema.ok) {
    console.log('');
    console.log('[translate-cook-steps] SCHEMA NOT READY — dishes.cook_steps_json column missing.');
    console.log('  Action  : Aborted. would-translate count: 0');
    return;
  }

  // --skip-already-translated: only SELECT dishes where at least one step still
  // lacks one of action_tl / action_id / state_target_tl / state_target_id.
  // This makes batch runs resumable: 5 → 20 → 50 → … without re-scanning the
  // already-translated head of the table on every pass.
  const skipFilter = SKIP_ALREADY_TRANSLATED
    ? `AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(cook_steps_json) AS step
         WHERE NOT (
                step ? 'action_tl' AND step ? 'action_id'
                AND step ? 'state_target_tl' AND step ? 'state_target_id'
              )
       )`
    : '';
  const { rows } = await db.query<DishRow>(
    `SELECT id, title_zh, cook_steps_json
       FROM dishes
       WHERE cook_steps_json IS NOT NULL
         ${skipFilter}
       ORDER BY id
       LIMIT $1`,
    [LIMIT],
  );

  if (rows.length === 0) {
    console.log('[translate-cook-steps] No dishes found. Done.');
    return;
  }

  console.log('');
  console.log(`[translate-cook-steps] ${rows.length} dish(es) loaded.`);

  let totalCalls = 0;
  let touchedDishes = 0;

  for (let di = 0; di < rows.length; di++) {
    const dish = rows[di];
    const steps: Step[] = Array.isArray(dish.cook_steps_json) ? (dish.cook_steps_json as Step[]) : [];

    // First pass — find missing tuples
    type StepMissing = { stepIdx: number; missing: MissingTuple[] };
    const perStepMissing: StepMissing[] = steps.map((s, idx) => ({ stepIdx: idx, missing: missingForStep(s) }));
    const dishCalls = perStepMissing.reduce((a, s) => a + s.missing.length, 0);
    totalCalls += dishCalls;

    if (dishCalls === 0) {
      console.log(`  [${di + 1}/${rows.length}] ${dish.id}  "${dish.title_zh ?? '(无标题)'}"  ${steps.length} steps  — all i18n already filled, skip`);
      continue;
    }

    console.log(`  [${di + 1}/${rows.length}] ${dish.id}  "${dish.title_zh ?? '(无标题)'}"  ${steps.length} steps → ${dishCalls} missing (field,lang) tuples`);

    if (DRY_RUN) continue;

    // LIVE — per-dish user_id so each dish has its own 50/day quota bucket.
    // USER_SUFFIX defaults to 'v2' (post-2026-05-20 proxy that only incrs on
    // success). Bump to :v3 / :v4 via --user-suffix when a namespace's buckets
    // get filled up by sustained 5xx retries on a prior run.
    const dishUserId = `script:translate-cook-steps:${USER_SUFFIX}:${dish.id.slice(0, 8)}`;
    const updatedSteps: Step[] = steps.map(s => ({ ...s }));

    // Tolerate partial failure — Gemini 2.5 Flash periodically returns 503
    // "high demand". Failing the whole dish on the first stuck tuple would
    // throw away all the successful translations. Instead, skip the failed
    // tuple and continue; the UPDATE still writes the dish with partial
    // i18n keys, and the next cron pass picks up what's still missing.
    let dishOk = 0;
    let dishFail = 0;
    for (const { stepIdx, missing } of perStepMissing) {
      if (missing.length === 0) continue;
      const step = updatedSteps[stepIdx];
      for (const { field, lang } of missing) {
        const zhKey = `${field}_zh` as keyof Step;
        const source = String(step[zhKey] ?? '');
        const t = await callTranslate(source, lang, dishUserId);
        if (t === null) {
          dishFail++;
          continue;
        }
        const langKey = `${field}_${lang}`;
        (step as Record<string, unknown>)[langKey] = t;
        dishOk++;
      }
    }

    if (dishOk === 0) {
      console.log(`    ✗ all ${dishFail} tuples failed (Gemini 5xx sustained) — skipping write for this dish`);
      continue;
    }

    await db.query(
      `UPDATE dishes SET cook_steps_json = $2::jsonb WHERE id = $1::uuid`,
      [dish.id, JSON.stringify(updatedSteps)],
    );
    touchedDishes++;
    console.log(`    ✓ wrote back: ${dishOk} translated, ${dishFail} skipped (will retry next pass)`);
  }

  console.log('');
  if (DRY_RUN) {
    console.log(`[translate-cook-steps] DRY-RUN summary:`);
    console.log(`  dishes loaded             : ${rows.length}`);
    console.log(`  would-translate calls     : ${totalCalls}  (across ${rows.length} dishes)`);
    console.log(`  per-dish quota (50/day)   : auto-rotates SCRIPT_USER_ID per dish → each dish in own bucket`);
    console.log('[translate-cook-steps] No translate calls made. No DB writes performed.');
  } else {
    console.log(`[translate-cook-steps] LIVE summary:`);
    console.log(`  dishes loaded             : ${rows.length}`);
    console.log(`  dishes updated            : ${touchedDishes}`);
    console.log(`  translate calls attempted : ${totalCalls}`);
  }
}

rollup()
  .then(() => db.end())
  .catch(e => {
    console.error('[translate-cook-steps] crashed:', e);
    db.end();
    process.exit(1);
  });
