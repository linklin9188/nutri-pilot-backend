/**
 * translate-cook-steps.ts — Day 4 helper-locale step translation
 *
 * SPEC: TICKET-20260520-026 §B. For each dish missing one or more of the
 * helper-locale step arrays (cook_steps_json_en / _tl / _id), iterate the
 * dish's cook_steps_json steps and call gemini-proxy/translate × 3 langs
 * × N steps. In --live mode (with AIEATS_PROD_TRANSLATE=true PROD_GUARD),
 * write the resulting per-language arrays back to dishes.
 *
 * Schema checks (defense-in-depth, per LEARNED_SKILLS
 * `defense-in-depth-schema-check-target-and-source`):
 *   1. dishes.cook_steps_json (source) — already provisioned ✓
 *   2. dishes.cook_steps_json_en / _tl / _id (target) — added by Database
 *      migration 031 (待派). If any column is missing, the script aborts
 *      gracefully with a clear message instead of letting the UPDATE crash.
 *
 * Run modes:
 *   • Default (DRY-RUN) — counts dishes + would-translate calls, no Gemini hits.
 *   • --live + AIEATS_PROD_TRANSLATE=true — actually calls gemini-proxy and writes.
 *
 * Why dry-run defaults to NOT calling translate: gemini-proxy/translate has a
 * 50/day per-user quota. Repeated dry-runs would burn through the budget
 * without any DB write — the SQL count gives 95% of the diagnostic value at
 * 0 Gemini cost.
 *
 * Run:
 *   npx tsx scripts/translate-cook-steps.ts
 *   npx tsx scripts/translate-cook-steps.ts --batch=10
 *   AIEATS_PROD_TRANSLATE=true npx tsx scripts/translate-cook-steps.ts --live
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const DRY_RUN  = !process.argv.includes('--live');
const BATCH = (() => {
  const a = process.argv.find(a => a.startsWith('--batch='));
  return a ? parseInt(a.split('=')[1], 10) : 5;
})();
const PROD_GUARD = process.env.AIEATS_PROD_TRANSLATE === 'true';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SCRIPT_USER_ID = 'script:translate-cook-steps';

const TARGET_LANGS = ['en', 'tl', 'id'] as const;
type Lang = typeof TARGET_LANGS[number];

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface ColCheck {
  ok: boolean;
  missingCols: string[];
  presentCols: string[];
}

async function checkDishesColumns(): Promise<ColCheck> {
  const required = ['cook_steps_json', 'cook_steps_json_en', 'cook_steps_json_tl', 'cook_steps_json_id'];
  const { rows } = await db.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dishes'
      AND column_name = ANY($1::text[])
  `, [required]);
  const cols = new Set(rows.map(r => r.column_name));
  const missing = required.filter(c => !cols.has(c));
  return { ok: missing.length === 0, missingCols: missing, presentCols: [...cols] };
}

interface DishRow {
  id: string;
  title_zh: string | null;
  cook_steps_json: unknown;
}

async function callTranslate(sourceText: string, lang: Lang): Promise<string | null> {
  if (!SUPABASE_URL) return null;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gemini-proxy`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      user_id:     SCRIPT_USER_ID,
      endpoint:    'translate',
      source_text: sourceText,
      target_lang: lang,
      domain:      'cooking',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error(`  callTranslate ${lang} HTTP ${res.status}: ${t.slice(0, 150)}`);
    return null;
  }
  const j = await res.json() as { translation?: string };
  return j.translation ?? null;
}

function extractSourceText(step: any): string {
  if (typeof step === 'string') return step;
  if (step && typeof step === 'object') {
    return String(step.action_zh ?? step.zh ?? step.text ?? '');
  }
  return '';
}

async function rollup(): Promise<void> {
  console.log(`[translate-cook-steps] mode=${DRY_RUN ? 'DRY-RUN' : 'LIVE'} batch=${BATCH} targets=${TARGET_LANGS.join('/')}`);

  if (!DRY_RUN && !PROD_GUARD) {
    console.error('');
    console.error('[translate-cook-steps] REFUSING TO LIVE-UPDATE — AIEATS_PROD_TRANSLATE env not set.');
    console.error('  Safety guard so a stray `npx tsx ... --live` cannot touch prod.');
    console.error('  Set AIEATS_PROD_TRANSLATE=true to enable live writes, or drop --live for dry-run.');
    process.exit(1);
  }

  if (!DRY_RUN && !SUPABASE_URL) {
    console.error('[translate-cook-steps] VITE_SUPABASE_URL / SUPABASE_URL missing in .env — cannot call gemini-proxy.');
    process.exit(1);
  }

  // Schema check: source + target columns
  const schema = await checkDishesColumns();
  if (!schema.ok) {
    console.log('');
    console.log('[translate-cook-steps] SCHEMA NOT READY — dishes table missing columns');
    console.log(`  present : ${schema.presentCols.join(', ')}`);
    console.log(`  missing : ${schema.missingCols.join(', ')}`);
    console.log('  Reason  : Database migration 031 (待派) is supposed to add the per-language step columns.');
    console.log('  Action  : Translation aborted. would-translate count: 0');
    console.log('            Re-run after Database adds cook_steps_json_en / _tl / _id.');
    return;
  }

  // SELECT dishes still missing any of the 3 target columns
  const { rows } = await db.query<DishRow>(
    `SELECT id, title_zh, cook_steps_json
       FROM dishes
       WHERE cook_steps_json IS NOT NULL
         AND (cook_steps_json_en IS NULL OR cook_steps_json_tl IS NULL OR cook_steps_json_id IS NULL)
       ORDER BY id
       LIMIT $1`,
    [BATCH],
  );

  if (rows.length === 0) {
    console.log('[translate-cook-steps] No dishes need translation. Done.');
    return;
  }

  console.log('');
  console.log(`[translate-cook-steps] ${rows.length} dish(es) need translation:`);

  let totalCalls = 0;
  let touchedDishes = 0;

  for (const dish of rows) {
    const steps: any[] = Array.isArray(dish.cook_steps_json) ? dish.cook_steps_json as any[] : [];
    const stepsCount = steps.length;
    const callsForDish = stepsCount * TARGET_LANGS.length;
    totalCalls += callsForDish;
    console.log(`  - ${dish.id}  "${dish.title_zh ?? '(无标题)'}"  ${stepsCount} steps → ${callsForDish} translate calls`);

    if (DRY_RUN) continue;

    // LIVE path
    const langArrays: Record<Lang, any[]> = { en: [], tl: [], id: [] };
    let stepFailed = false;
    for (const step of steps) {
      const sourceText = extractSourceText(step);
      if (!sourceText) {
        for (const lang of TARGET_LANGS) langArrays[lang].push(step);
        continue;
      }
      for (const lang of TARGET_LANGS) {
        const t = await callTranslate(sourceText, lang);
        if (t === null) {
          stepFailed = true;
          break;
        }
        const stepObj = typeof step === 'object' && step !== null ? step : { action_zh: sourceText };
        langArrays[lang].push({ ...stepObj, action: t, lang });
      }
      if (stepFailed) break;
    }
    if (stepFailed) {
      console.log(`    ✗ translate failures encountered — skipping write for this dish`);
      continue;
    }
    await db.query(
      `UPDATE dishes
         SET cook_steps_json_en = $2::jsonb,
             cook_steps_json_tl = $3::jsonb,
             cook_steps_json_id = $4::jsonb
       WHERE id = $1::uuid`,
      [dish.id, JSON.stringify(langArrays.en), JSON.stringify(langArrays.tl), JSON.stringify(langArrays.id)],
    );
    touchedDishes++;
    console.log(`    ✓ wrote 3 lang arrays back to dishes`);
  }

  console.log('');
  if (DRY_RUN) {
    console.log(`[translate-cook-steps] DRY-RUN: would call translate ${totalCalls} times across ${rows.length} dish(es).`);
    console.log('[translate-cook-steps] No translate calls made. No DB writes performed.');
  } else {
    console.log(`[translate-cook-steps] LIVE: ${touchedDishes}/${rows.length} dish(es) updated, ${totalCalls} translate calls attempted.`);
  }
}

rollup()
  .then(() => db.end())
  .catch(e => {
    console.error('[translate-cook-steps] crashed:', e);
    db.end();
    process.exit(1);
  });
