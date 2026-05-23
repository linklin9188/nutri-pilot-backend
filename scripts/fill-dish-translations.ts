/**
 * fill-dish-translations.ts — TICKET-20260523-022 §C
 *
 * Translate dishes.title_zh → {title_zh_hant, title_en} via Gemini Flash
 * (endpoint='translate_dish').
 *
 * Scope: ALL 924 dishes — though title_en already has 905/924 from prior
 * partial fills, we still re-cover the 19 NULLs. title_zh_hant is 0/924
 * (totally empty), so the bulk of cost lives there.
 *
 * Update semantics: NULL-only — never overwrites existing translations.
 *
 * Usage:
 *   npx tsx scripts/fill-dish-translations.ts --dry-run --limit=5
 *   npx tsx scripts/fill-dish-translations.ts --limit=10
 *   npx tsx scripts/fill-dish-translations.ts                    # full run
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const PROXY_URL    = `${SUPABASE_URL}/functions/v1/gemini-proxy`;
const BOT_USER_ID  = 'backfill-bot-022c';

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const DRY_RUN   = process.argv.includes('--dry-run');
const PAUSE     = 500;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

interface DishRow {
  id: string;
  title_zh: string;
  title_zh_hant: string | null;
  title_en: string | null;
}

function buildPrompt(d: DishRow): string {
  return `Translate the Chinese dish name "${d.title_zh}" into:
1. Traditional Chinese (Hong Kong / Cantonese style — prefer 港式 wording like 牛腩 / 牛仔骨 / 芒果布甸 over 大陸 wording)
2. English (food-menu style: concise, descriptive, no awkward literal translations)

Return ONLY this JSON (no markdown, no explanation):
{"title_zh_hant": "繁體中文菜名", "title_en": "English dish name"}`;
}

async function callProxy(d: DishRow): Promise<{ title_zh_hant?: string; title_en?: string }> {
  const body = {
    user_id: BOT_USER_ID,
    endpoint: 'translate_dish',
    contents: [{ role: 'user', parts: [{ text: buildPrompt(d) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body:    JSON.stringify(body),
    });
    if (res.ok) {
      const wrap = await res.json();
      const gemText = wrap?.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const cleaned = String(gemText).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const out: { title_zh_hant?: string; title_en?: string } = {};
      if (typeof parsed?.title_zh_hant === 'string' && parsed.title_zh_hant.trim()) {
        out.title_zh_hant = parsed.title_zh_hant.trim();
      }
      if (typeof parsed?.title_en === 'string' && parsed.title_en.trim()) {
        out.title_en = parsed.title_en.trim();
      }
      return out;
    }
    if ([429, 502, 503].includes(res.status) && attempt < 3) {
      const wait = attempt * 5000;
      console.log(`\n  ⏳ proxy ${res.status} (attempt ${attempt}/3) — sleep ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    const errText = await res.text();
    throw new Error(`proxy ${res.status}: ${errText.slice(0, 200)}`);
  }
  throw new Error('exhausted retries');
}

async function main() {
  console.log(`\n🌐 Dish translation — LIMIT=${LIMIT === Infinity ? 'all' : LIMIT}  DRY=${DRY_RUN}\n`);

  // Pull dishes that need at least one missing translation
  const { data, error } = await sb
    .from('dishes')
    .select('id, title_zh, title_zh_hant, title_en')
    .order('title_zh');
  if (error) { console.error('SELECT failed:', error.message); process.exit(1); }

  const candidates = (data ?? []).filter(d => d.title_zh_hant == null || d.title_en == null) as DishRow[];
  console.log(`Total: ${data?.length ?? 0}  Need fill (zh_hant NULL OR en NULL): ${candidates.length}\n`);
  const limited = LIMIT === Infinity ? candidates : candidates.slice(0, LIMIT);

  let ok = 0, skip = 0, err = 0, fields = 0;
  for (let i = 0; i < limited.length; i++) {
    const d = limited[i];
    try {
      const t = await callProxy(d);
      const patch: Record<string, string> = {};
      if (t.title_zh_hant && d.title_zh_hant == null) patch.title_zh_hant = t.title_zh_hant;
      if (t.title_en && d.title_en == null)           patch.title_en      = t.title_en;
      if (Object.keys(patch).length === 0) {
        skip++;
        process.stdout.write(`[${i+1}/${limited.length}] ${d.title_zh.padEnd(20)} skip (Gemini returned existing-only)\n`);
      } else if (!DRY_RUN) {
        const { error: upErr } = await sb.from('dishes').update(patch).eq('id', d.id);
        if (upErr) {
          err++;
          process.stdout.write(`[${i+1}/${limited.length}] ${d.title_zh.padEnd(20)} FAIL: ${upErr.message.slice(0, 60)}\n`);
        } else {
          ok++;
          fields += Object.keys(patch).length;
          process.stdout.write(`[${i+1}/${limited.length}] ${d.title_zh.padEnd(20)} ✅ ${patch.title_zh_hant ?? '-'} / ${patch.title_en ?? '-'}\n`);
        }
      } else {
        ok++;
        fields += Object.keys(patch).length;
        process.stdout.write(`[${i+1}/${limited.length}] ${d.title_zh.padEnd(20)} [DRY] ${JSON.stringify(patch)}\n`);
      }
    } catch (e: any) {
      err++;
      process.stdout.write(`[${i+1}/${limited.length}] ${d.title_zh.padEnd(20)} ❌ ${e.message.slice(0, 100)}\n`);
    }
    await new Promise(r => setTimeout(r, PAUSE));
  }
  console.log(`\n✅ Done!  ok=${ok}  skip=${skip}  err=${err}  fields=${fields}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
