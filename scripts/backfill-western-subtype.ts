/**
 * backfill-western-subtype.ts — classify origin_cuisine='western' dishes into
 * one of 8 sub-buckets defined by migration 018:
 *   french | italian | spanish | american | american_fine
 *   | british | german | other_western
 *
 * Currently all 113 western dishes have western_subtype = NULL. This blocks
 * Composer from making sub-cuisine-aware selections in western banquets
 * (e.g. user picks cuisine='western' + the table currently leans toward
 * trattoria — should be italian-only, not a French/American mix).
 *
 * Uses claude-haiku-4-5 with strict enum output. Batch 12, ~10 minutes total
 * including retries.
 *
 * Run:
 *   npx tsx scripts/backfill-western-subtype.ts --dry-run --limit=8
 *   npx tsx scripts/backfill-western-subtype.ts
 *   npx tsx scripts/backfill-western-subtype.ts --force          # re-classify
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('❌ ANTHROPIC_API_KEY missing'); process.exit(1); }

const MODEL = 'claude-haiku-4-5';
const BATCH = 12;
const FORCE = process.argv.includes('--force');
const DRY   = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const a = process.argv.find(a => a.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const ALLOWED = new Set([
  'french', 'italian', 'spanish',
  'american', 'american_fine',
  'british', 'german', 'other_western',
]);

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface Row {
  id: string;
  title_zh: string;
  title_en: string | null;
  description_zh: string | null;
  description_en: string | null;
  main_ingredient: string | null;
  cook_method: string | null;
}

interface Classification {
  dish_id: string;
  subtype: string;
}

const SYSTEM = `You are classifying western dishes into 8 sub-cuisines for a
Hong Kong household menu app. For each dish, pick exactly ONE label.

Output a strict JSON ARRAY with elements:
  { "dish_id": "<exact uuid from input>", "subtype": "<one_of_8>" }

Allowed subtypes:

- french          法餐: coq au vin, boeuf bourguignon, ratatouille, bouillabaisse,
                  niçoise, soufflé, croissant, crepe, foie gras, beurre blanc 类菜.
- italian         意餐: pasta (carbonara/bolognese/aglio e olio/pesto/alfredo),
                  risotto, pizza, lasagna, gnocchi, tiramisù, caprese, antipasti,
                  osso buco, panini.
- spanish         西班牙: paella, tapas, gazpacho, jamón, tortilla española,
                  patatas bravas, sangria 类.
- american        美式 casual: burger, BBQ, mac & cheese, Caesar salad, Cobb
                  salad, pancakes, waffles, hot dog, buffalo wings, meatloaf,
                  Philly cheesesteak, pulled pork, mashed potato, coleslaw,
                  potato salad, fried chicken (KFC-style), club sandwich.
- american_fine   美式高端 fine dining: steak house cuts (ribeye/filet mignon),
                  surf & turf, lobster thermidor in American context,
                  oysters Rockefeller, Caesar in formal version, prime rib roast.
- british         英式: fish & chips, shepherd's pie, cottage pie, beef
                  Wellington, Sunday roast, bangers and mash, full English
                  breakfast, scotch egg, sticky toffee pudding.
- german          德式: sausage 类 (bratwurst/weisswurst/currywurst),
                  schnitzel, sauerkraut, pretzel, kartoffelpuffer, spaetzle.
- other_western   其他: Mediterranean (Greek/Turkish/Moroccan), Eastern European
                  (Polish/Hungarian/Russian), Nordic, Portuguese, Swiss, generic
                  "European-style" that doesn't fit the above 7. Use this
                  sparingly — prefer the specific 7 when the dish clearly belongs.

Edge cases:
- "Caesar salad" 是 american (起源美国 Tijuana).
- "Coleslaw" / "Potato salad" 是 american side.
- "Hummus" 是 other_western (Mediterranean/Middle Eastern).
- "Caprese / Bruschetta" 是 italian 即使是冷盘.
- "Greek salad" 是 other_western (Mediterranean).
- 一般"西式炖肉" 没明确国别 → other_western.
- Pizza margherita / spaghetti → italian (不是 american 即使 hong kong 餐厅卖).

Return ONLY a valid JSON array (no markdown fence, no commentary).`;

function buildUserMessage(rows: Row[]): string {
  return rows.map((r, i) =>
    `[${i + 1}] dish_id=${r.id}
title: ${r.title_zh}${r.title_en ? ` (${r.title_en})` : ''}
main: ${r.main_ingredient ?? '-'} · method: ${r.cook_method ?? '-'}
desc_zh: ${(r.description_zh ?? '').slice(0, 120)}
desc_en: ${(r.description_en ?? '').slice(0, 120)}`
  ).join('\n\n');
}

async function callClaude(rows: Row[]): Promise<Classification[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 2048,
      system:     SYSTEM,
      messages: [{ role: 'user', content: buildUserMessage(rows) }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j: any = await res.json();
  let raw: string = j.content?.[0]?.text ?? '[]';
  raw = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Claude did not return array');
  return parsed as Classification[];
}

(async () => {
  const where = FORCE
    ? `WHERE origin_cuisine = 'western'`
    : `WHERE origin_cuisine = 'western' AND western_subtype IS NULL`;
  const limitClause = Number.isFinite(LIMIT) ? `LIMIT ${LIMIT}` : '';
  const { rows: todo } = await db.query<Row>(`
    SELECT id, title_zh, title_en, description_zh, description_en,
           main_ingredient, cook_method
    FROM dishes
    ${where}
    ORDER BY id
    ${limitClause}
  `);

  console.log(`🍷 ${todo.length} western dishes to classify (BATCH=${BATCH}, MODEL=${MODEL}, FORCE=${FORCE}, DRY=${DRY})`);
  if (todo.length === 0) { await db.end(); return; }

  let done = 0, errors = 0, invalidEnum = 0;
  const distribution: Record<string, number> = {};
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    process.stdout.write(`Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(todo.length / BATCH)}…`);
    let cls: Classification[];
    try {
      cls = await callClaude(slice);
    } catch (e: any) {
      console.log(` ❌ ${e.message}`);
      errors += slice.length;
      continue;
    }
    const map = new Map(cls.map(c => [c.dish_id, (c.subtype ?? '').toLowerCase()]));
    const writes: { id: string; subtype: string }[] = [];
    for (const r of slice) {
      const s = map.get(r.id);
      if (!s) { errors++; continue; }
      if (!ALLOWED.has(s)) { invalidEnum++; continue; }
      writes.push({ id: r.id, subtype: s });
      distribution[s] = (distribution[s] ?? 0) + 1;
    }
    if (DRY) {
      for (const w of writes) {
        const t = slice.find(r => r.id === w.id)?.title_zh ?? '?';
        console.log(`\n  [dry] ${t.padEnd(20)}  → ${w.subtype}`);
      }
    } else {
      for (const w of writes) {
        await db.query(`UPDATE dishes SET western_subtype=$1 WHERE id=$2`, [w.subtype, w.id]);
      }
    }
    done += writes.length;
    process.stdout.write(` ✅ (+${writes.length})\n`);
  }

  console.log(`\n📊 Done: ${done} ✅ ${errors} ⚠ ${invalidEnum} invalid_enum`);
  console.log('Distribution:', JSON.stringify(distribution, null, 2));
  await db.end();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
