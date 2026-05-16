/**
 * backfill-dish-nutrition.ts — fill the 5 P1 nutrition fields:
 *   nutrition_kcal_per_serving INT
 *   oil_level / salt_level / sugar_level (low/mid/high)
 *   protein_source TEXT[]
 *   cook_method TEXT
 *
 * Uses claude-haiku-4-5 because the task is structured-output JSON
 * classification on short text — haiku is fast + cheap + accurate
 * enough. Batches 8 dishes per request, costs ~$0.001/dish for 523
 * dishes ≈ ~$0.50 total.
 *
 * Run:
 *   npx tsx scripts/backfill-dish-nutrition.ts                # all empty rows
 *   npx tsx scripts/backfill-dish-nutrition.ts --limit=10     # first 10
 *   npx tsx scripts/backfill-dish-nutrition.ts --force        # re-eval all
 *   npx tsx scripts/backfill-dish-nutrition.ts --dry-run      # preview only
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('❌ ANTHROPIC_API_KEY missing'); process.exit(1); }

const MODEL  = 'claude-haiku-4-5';
const BATCH  = 8;
const FORCE  = process.argv.includes('--force');
const DRY    = process.argv.includes('--dry-run');
const LIMIT  = (() => {
  const a = process.argv.find(a => a.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

interface Row {
  id: string;
  title_zh: string;
  main_ingredient: string | null;
  course_type: string | null;
  flavor_tags: string[] | null;
  health_benefit_tags: string[] | null;
  prep_steps_json: any[] | null;
  cook_steps_json: any[] | null;
}

const SYSTEM = `You are a clinical nutritionist evaluating Chinese home-cooking dishes for a recommendation app. For each dish, output a structured JSON object with these exact fields:

{
  "kcal":        integer 估算 per serving (one adult), 50–800 reasonable range,
  "oil":         "low" | "mid" | "high",
  "salt":        "low" | "mid" | "high",
  "sugar":       "low" | "mid" | "high",
  "protein":     array of: "fish" | "meat" | "poultry" | "egg" | "dairy" | "soy" | "shellfish" | "tofu" | "none",
  "method":      one of: "stir_fry" | "steam" | "boil" | "stew" | "pan_fry" | "deep_fry" | "grill" | "roast" | "bake" | "mix_cold" | "raw" | "blanch" | "braise"
}

Calibration:
- kcal: a plain stir-fried veggie ≈ 120; a soup ≈ 80–150; a stir-fried meat ≈ 300–450; deep-fried ≈ 500–700; staple (rice/noodle/dumpling) ≈ 250–450; dessert ≈ 200–400.
- oil low = ≤ 1 tbsp; mid = 2 tbsp; high = deep-fried OR > 2 tbsp.
- salt low = no added salt / 凉拌少盐; mid = 标准 1 tsp 酱油/盐; high = 重盐 / 卤水 / 红烧 / 多酱.
- sugar low = no added sugar; mid = 1 tsp; high = 糖醋 / 甜品 / 蜜汁 / >1 tbsp.
- protein: include ALL sources present (e.g. 西红柿炒蛋 → ["egg"]; 麻婆豆腐 → ["soy","tofu","meat"]; 清炒油菜 → ["none"]).
- method: pick the DOMINANT cooking action.

Return ONLY valid JSON, no markdown fence, no explanation.`;

function buildUserMessage(rows: Row[]): string {
  const items = rows.map((r, i) => {
    const prepText = (r.prep_steps_json ?? []).map((s: any) => `${s.ingredient_zh ?? ''}(${s.amount_g ?? 0}g): ${s.action_zh ?? ''}`).join(' | ');
    const cookText = (r.cook_steps_json ?? []).map((s: any) => s.action_zh ?? '').join(' → ');
    return `[${i+1}] id=${r.id}
title: ${r.title_zh}
main_ingredient: ${r.main_ingredient ?? '-'}
course_type: ${r.course_type ?? '-'}
flavor_tags: ${(r.flavor_tags ?? []).join(',')}
prep: ${prepText.slice(0, 400)}
cook: ${cookText.slice(0, 400)}`;
  }).join('\n\n');

  return `Evaluate these ${rows.length} dishes. Return a JSON array of ${rows.length} objects in the SAME order, each shaped like:
{"kcal":N,"oil":"...","salt":"...","sugar":"...","protein":[...],"method":"..."}

${items}`;
}

async function callClaude(rows: Row[]): Promise<any[]> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserMessage(rows) }],
    }),
  });
  if (!resp.ok) throw new Error(`${resp.status}: ${(await resp.text()).slice(0,300)}`);
  const data = await resp.json() as any;
  const text = (data.content?.[0]?.text ?? '').trim()
                .replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  // The model may wrap in object or return bare array — handle both
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : (parsed.dishes ?? parsed.results ?? []);
}

function clamp(v: any, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function pickEnum(v: any, allowed: string[], fallback: string | null): string | null {
  const s = String(v ?? '').toLowerCase();
  return allowed.includes(s) ? s : fallback;
}

(async () => {
  const where = FORCE ? '' : `WHERE nutrition_kcal_per_serving IS NULL OR cook_method IS NULL`;
  const limitClause = Number.isFinite(LIMIT) ? `LIMIT ${Math.floor(LIMIT)}` : '';
  const { rows: todo } = await db.query<Row>(`
    SELECT id, title_zh, main_ingredient, course_type, flavor_tags, health_benefit_tags, prep_steps_json, cook_steps_json
    FROM dishes
    ${where}
    ORDER BY title_zh
    ${limitClause}
  `);

  console.log(`🧪 ${todo.length} dishes to process (BATCH=${BATCH}, MODEL=${MODEL}, FORCE=${FORCE}, DRY=${DRY})`);
  if (todo.length === 0) { await db.end(); return; }

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    process.stdout.write(`Batch ${Math.floor(i/BATCH)+1}/${Math.ceil(todo.length/BATCH)} (${i+1}–${i+slice.length}/${todo.length})… `);
    try {
      const results = await callClaude(slice);
      if (results.length !== slice.length) {
        throw new Error(`expected ${slice.length} results, got ${results.length}`);
      }

      for (let j = 0; j < slice.length; j++) {
        const r = slice[j];
        const a = results[j] ?? {};
        const kcal   = clamp(a.kcal, 30, 1200, 250);
        const oil    = pickEnum(a.oil,   ['low','mid','high'], 'mid');
        const salt   = pickEnum(a.salt,  ['low','mid','high'], 'mid');
        const sugar  = pickEnum(a.sugar, ['low','mid','high'], 'low');
        const proteinRaw = Array.isArray(a.protein) ? a.protein : [];
        const proteinAllowed = new Set(['fish','meat','poultry','egg','dairy','soy','shellfish','tofu','none']);
        const protein = [...new Set(proteinRaw
          .map((s: any) => String(s).toLowerCase())
          .filter((s: string) => proteinAllowed.has(s)))];
        if (protein.length === 0) protein.push('none');
        const method = pickEnum(a.method, [
          'stir_fry','steam','boil','stew','pan_fry','deep_fry','grill','roast','bake','mix_cold','raw','blanch','braise'
        ], 'stir_fry');

        if (!DRY) {
          await db.query(`
            UPDATE dishes SET
              nutrition_kcal_per_serving = $1,
              oil_level = $2, salt_level = $3, sugar_level = $4,
              protein_source = $5,
              cook_method = $6
            WHERE id = $7
          `, [kcal, oil, salt, sugar, protein, method, r.id]);
        }
        ok++;
      }
      console.log(`✅`);
    } catch (e: any) {
      console.log(`⚠️ ${e.message?.slice(0,100)}`);
      fail += slice.length;
    }
  }

  console.log(`\n📊 Done: ${ok} ✅  ${fail} ⚠`);
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
