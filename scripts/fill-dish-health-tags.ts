/**
 * fill-dish-health-tags.ts — TICKET-20260521-010
 *
 * Backfill dishes.health_benefit_tags with 12 wellness tags via Gemini Flash,
 * routed through supabase/functions/gemini-proxy (endpoint='health_tag').
 *
 * Merge semantics: never overwrite. Result = SELECT ARRAY_AGG(DISTINCT t)
 * FROM unnest(existing || new) t. Existing goal tags (high_protein /
 * lose_weight / muscle_gain / maintain / detox) are preserved verbatim;
 * we only ADD the wellness tags Gemini suggests.
 *
 * Per-dish call (1 dish per Gemini round-trip) — short prompt, short output,
 * lets us validate each row independently. Skip on JSON parse / enum violation.
 *
 * Usage:
 *   npx tsx scripts/fill-dish-health-tags.ts --dry-run --limit=5    # preview
 *   npx tsx scripts/fill-dish-health-tags.ts --limit=5              # small batch
 *   npx tsx scripts/fill-dish-health-tags.ts                        # full run
 */
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { config } from 'dotenv';
config();

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const PROXY_URL    = `${SUPABASE_URL}/functions/v1/gemini-proxy`;
const DB_URL       = process.env.DIRECT_DATABASE_URL ?? 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

// Dedicated user_id for backfill — quota tracking separate from real users.
const BOT_USER_ID = 'backfill-bot-010';

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const DRY_RUN   = process.argv.includes('--dry-run');
const RESUME    = process.argv.includes('--resume'); // skip dishes that already have any health_benefit_tags
const PAUSE     = 600; // ms between calls — gemini-proxy is rate-limited, be polite

const WELLNESS_TAGS = [
  'low_sodium', 'low_sugar', 'low_purine',
  'blood_tonic', 'sleep_aid', 'yin_nourish', 'qi_tonic', 'mood_boost',
  'anti_aging', 'beauty', 'anti_inflammation', 'eye_care',
] as const;
const TAG_SET = new Set<string>(WELLNESS_TAGS);

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

interface Ingredient { name_zh: string; is_main: boolean; }
interface DishRow {
  id: string;
  title_zh: string;
  main_ingredient: string | null;
  cook_method: string | null;
  course_type: string | null;
  health_benefit_tags: string[] | null;
  ingredients: Ingredient[];
}

function buildPrompt(d: DishRow): string {
  const ingredientList = d.ingredients
    .map(i => `${i.is_main ? '★' : '·'}${i.name_zh}`)
    .join(', ');
  return `你是中医营养师。根据菜的食材+做法，从 12 个 wellness 标签中挑出**实际命中**的（0-5 个）。**没有命中的不要给**——宁可少给也不要硬凑。

12 个 wellness 标签（只能从这里挑）：
- low_sodium  (清淡少盐: 凉拌/清蒸/水煮，避免酱油/盐/酱料过重)
- low_sugar   (低糖: 避免糖、蜜汁、糖醋、甜品，主食类糙米/燕麦/全麦也属)
- low_purine  (低嘌呤: 避免内脏/海鲜/浓汤/啤酒，豆腐/蔬菜/淡水鱼可)
- blood_tonic (补血: 红枣/桂圆/动物肝脏/红肉/红糖/黑木耳/菠菜)
- sleep_aid   (安神助眠: 莲子/百合/桂圆/小米/酸枣仁/牛奶)
- yin_nourish (滋阴: 银耳/百合/雪梨/木耳/蜂蜜/猪皮/鸭肉)
- qi_tonic    (补气: 黄芪/人参/山药/鸡肉/糯米/红枣/桂圆)
- mood_boost  (舒缓情绪: 巧克力/坚果/三文鱼/香蕉/燕麦/茶)
- anti_aging  (抗衰: 核桃/黑芝麻/枸杞/蓝莓/番茄/绿茶/葡萄)
- beauty      (美容养颜: 银耳/胶原蛋白/猪皮/燕窝/草莓/奇异果)
- anti_inflammation (抗炎: 三文鱼/橄榄油/姜黄/姜/西兰花/绿茶)
- eye_care    (护眼: 胡萝卜/南瓜/蓝莓/枸杞/菠菜/动物肝脏)

输入菜：
- 名称: ${d.title_zh}
- 主料: ${d.main_ingredient ?? '-'}
- 做法: ${d.cook_method ?? '-'}
- 类型: ${d.course_type ?? '-'}
- 食材: ${ingredientList || '(无)'}

只返回 JSON：{"tags": ["xxx", "yyy"]}。tags 数组里只能是上述 12 个英文 key 中的子集。无命中返回 {"tags": []}。`;
}

async function callProxy(d: DishRow): Promise<string[]> {
  const body = {
    user_id: BOT_USER_ID,
    endpoint: 'health_tag',
    contents: [{ role: 'user', parts: [{ text: buildPrompt(d) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };

  // 3-attempt retry on 429 (quota) / 502 (gemini upstream) / 503
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    if ([429, 502, 503].includes(res.status) && attempt < 3) {
      const wait = attempt * 5000;
      console.log(`\n  ⏳ proxy ${res.status} (attempt ${attempt}/3) — sleep ${wait/1000}s`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    const errText = await res.text();
    throw new Error(`proxy ${res.status}: ${errText.slice(0, 200)}`);
  }
  if (!res!.ok) throw new Error(`proxy failed after 3 retries`);

  const wrap = await res!.json();
  // gemini-proxy returns { data: <gemini-response>, remaining }
  const gemText = wrap?.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"tags":[]}';
  const cleaned = String(gemText).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`JSON parse fail: ${e.message} | raw=${cleaned.slice(0, 100)}`);
  }
  const tags = Array.isArray(parsed?.tags) ? parsed.tags : [];
  // Enum filter — drop anything not in the 12 whitelist
  const filtered = [...new Set(
    tags
      .map((t: any) => String(t).toLowerCase().trim())
      .filter((t: string) => TAG_SET.has(t))
  )];
  return filtered;
}

async function mergeAndUpdate(pg: Client, dishId: string, newTags: string[]): Promise<{ before: number; after: number; added: string[] }> {
  if (newTags.length === 0) return { before: 0, after: 0, added: [] };

  // ARRAY_AGG(DISTINCT) merge — preserves existing goal tags + adds new wellness tags
  const result = await pg.query<{ before_tags: string[] | null; after_tags: string[] }>(
    `WITH cur AS (
       SELECT health_benefit_tags AS t FROM dishes WHERE id = $1
     ),
     merged AS (
       SELECT ARRAY(
         SELECT DISTINCT x
         FROM unnest(COALESCE((SELECT t FROM cur), ARRAY[]::text[]) || $2::text[]) x
         WHERE x IS NOT NULL AND x <> ''
       ) AS t
     )
     UPDATE dishes
     SET health_benefit_tags = (SELECT t FROM merged)
     WHERE id = $1
     RETURNING
       (SELECT t FROM cur) AS before_tags,
       health_benefit_tags AS after_tags`,
    [dishId, newTags]
  );
  const row = result.rows[0];
  const before = row?.before_tags?.length ?? 0;
  const after  = row?.after_tags?.length ?? 0;
  const added  = newTags.filter(t => !(row?.before_tags ?? []).includes(t));
  return { before, after, added };
}

async function main() {
  console.log(`\n🌿 Health-tag Backfill — LIMIT=${LIMIT === Infinity ? 'all' : LIMIT}  DRY=${DRY_RUN}\n`);

  // Pull all dishes — we'll backfill every row to bump 9 low-coverage tags.
  // Existing 'low_sugar' / 'low_purine' rows still benefit (other 10 tags may add).
  const { data: rawDishes, error: e1 } = await sb
    .from('dishes')
    .select('id, title_zh, main_ingredient, cook_method, course_type, health_benefit_tags')
    .not('title_zh', 'is', null)
    .order('title_zh');
  if (e1 || !rawDishes) { console.error('Fetch dishes:', e1); process.exit(1); }

  // Pull ingredients per dish (used as prompt feature)
  const { data: rawIngs, error: e2 } = await sb
    .from('dish_ingredients')
    .select('dish_id, name_zh, is_main');
  if (e2 || !rawIngs) { console.error('Fetch ingredients:', e2); process.exit(1); }
  const ingByDish = new Map<string, Ingredient[]>();
  for (const r of rawIngs) {
    if (!r.dish_id) continue;
    const arr = ingByDish.get(r.dish_id) ?? [];
    arr.push({ name_zh: r.name_zh ?? '', is_main: !!r.is_main });
    ingByDish.set(r.dish_id, arr);
  }

  const dishes: DishRow[] = rawDishes.map(d => ({
    id: d.id,
    title_zh: d.title_zh,
    main_ingredient: d.main_ingredient,
    cook_method: d.cook_method,
    course_type: d.course_type,
    health_benefit_tags: d.health_benefit_tags,
    ingredients: ingByDish.get(d.id) ?? [],
  }));

  // --resume: drop dishes that already have ≥1 health_benefit_tag (only fill the truly empty rows)
  const candidates = RESUME
    ? dishes.filter(d => !d.health_benefit_tags || d.health_benefit_tags.length === 0)
    : dishes;
  const subset = isFinite(LIMIT) ? candidates.slice(0, LIMIT) : candidates;
  console.log(`📊 Total: ${dishes.length} | Candidates: ${candidates.length}${RESUME ? ' (resume mode — NULL/empty only)' : ''} | Processing: ${subset.length}\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — preview tags only, no DB writes\n');
    for (const d of subset.slice(0, 5)) {
      try {
        const tags = await callProxy(d);
        console.log(`【${d.title_zh}】 main=${d.main_ingredient} method=${d.cook_method}`);
        console.log(`   existing: ${JSON.stringify(d.health_benefit_tags)}`);
        console.log(`   suggested wellness: ${JSON.stringify(tags)}`);
      } catch (e: any) {
        console.log(`【${d.title_zh}】 ❌ ${e.message?.slice(0, 200)}`);
      }
      await new Promise(r => setTimeout(r, PAUSE));
    }
    return;
  }

  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  let updated = 0, skipped = 0, errors = 0, tagsAdded = 0;
  const total = subset.length;

  for (let i = 0; i < total; i++) {
    const d = subset[i];
    const pos = `${i + 1}/${total}`;
    process.stdout.write(`\r[${pos}] ${d.title_zh.slice(0, 18).padEnd(18)} OK=${updated} skip=${skipped} err=${errors} added=${tagsAdded}`);

    try {
      const newTags = await callProxy(d);
      if (newTags.length === 0) { skipped++; }
      else {
        const r = await mergeAndUpdate(pg, d.id, newTags);
        if (r.added.length > 0) {
          updated++;
          tagsAdded += r.added.length;
        } else {
          skipped++;
        }
      }
    } catch (e: any) {
      errors++;
      console.error(`\n  ❌ ${d.title_zh}: ${e.message?.slice(0, 160)}`);
    }
    if (i + 1 < total) await new Promise(r => setTimeout(r, PAUSE));
  }

  await pg.end();
  console.log(`\n\n✅ Done!\n   Updated: ${updated}\n   Skipped: ${skipped} (no new tags suggested)\n   Errors:  ${errors}\n   Tags added (total): ${tagsAdded}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
