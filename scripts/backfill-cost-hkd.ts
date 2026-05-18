/**
 * backfill-cost-hkd.ts — estimate average_cost_hkd per serving for
 * every dish. Migration 018 added the column (NUMERIC(6,2) NULL,
 * CHECK 0–2000) but every row is NULL.
 *
 * Cost is the household's marginal "food cost per adult serving" at
 * HK Wellcome/ParknShop/wet market 2026 price levels. Not menu price.
 *
 * Uses claude-haiku-4-5. Batch 10. ~720 dishes ≈ 6–8 minutes, ~$0.4.
 *
 * Filter:
 *   default — WHERE average_cost_hkd IS NULL  (idempotent)
 *   --force — re-estimate every dish
 *
 * Run:
 *   npx tsx scripts/backfill-cost-hkd.ts --dry-run --limit=10
 *   npx tsx scripts/backfill-cost-hkd.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('❌ ANTHROPIC_API_KEY missing'); process.exit(1); }

const MODEL = 'claude-haiku-4-5';
const BATCH = 10;
const FORCE = process.argv.includes('--force');
const DRY   = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const a = process.argv.find(a => a.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface Row {
  id: string;
  title_zh: string;
  title_en: string | null;
  origin_cuisine: string | null;
  main_ingredient: string | null;
  course_type: string | null;
  cook_method: string | null;
  description_zh: string | null;
  prep_steps_json: any[] | null;
}

interface Estimate {
  dish_id: string;
  cost_hkd: number;
}

const SYSTEM = `You are estimating per-adult-serving food cost in HKD for a
Hong Kong middle-class household, using 2026 Wellcome / ParknShop / wet
market price levels. This is the COST OF INGREDIENTS to make one serving
at home (not restaurant menu price). Output a strict JSON ARRAY:

  { "dish_id": "<exact uuid from input>", "cost_hkd": <number, 1 decimal> }

Calibration anchors (per adult serving):

  5–12   清水煮蔬菜 / 单一蔬菜炒 (素炒杂蔬, 凉拌黄瓜, 蒜蓉空心菜)
  12–20  鸡蛋类 (番茄炒蛋, 蒸蛋羹), 豆腐类 (麻婆豆腐 home version), 简单米饭面食
  20–35  常见家常猪/鸡 (青椒肉丝, 红烧肉, 蒜蓉鸡翅, 宫保鸡丁, 一般西式 pasta)
  35–55  普通牛肉 / 鱼类 (蒜蓉粉丝蒸鱼, 番茄牛肉, sirloin steak home, 普通三文鱼)
  55–90  海鲜常规 (白灼虾, 蒸生蚝, 蛤蜊汤, 美式 BBQ ribs, lamb chops),
         鸡腿肉外卖级
  90–160 高端肉/海鲜 (东星斑, 阿拉斯加帝王蟹少量, 和牛入门级, 鲍鱼罐头版,
         龙虾意面 home)
  160–400 fine-dining 家庭复刻 (整只龙虾, 神户和牛, 黑松露入菜, 鲍鱼新鲜级,
          大虾刺身拼盘)
  400–800 极高端宴客 (整只佛跳墙, 整只大龙虾配辅料, 帝王蟹整只, 高端日式
          omakase 家庭版)
  > 800   米其林级稀有食材 (鱼翅整碗, 鲨鱼鳍, 千金鲍鱼一头)

Other rules:
- 主食类 staple (米饭, 面条, 馒头, 饺子) 通常 8–25 HKD/份, 除非含高价主料.
- 汤类 soup 8–40 HKD/份 (老火汤食材累积 30–60 HKD 但一锅 6 人分摊).
- 甜品 dessert 10–35 HKD/份 (除非用进口巧克力/松露).
- 沙拉 light salad 12–25 HKD/份 (Caesar / Greek with feta 25–40).
- "卤味拼盘 / 烧腊拼盘" 多种肉 → 60–100 HKD/份.
- 凉菜冷盘成本通常低 (10–30) 除非含海鲜或高端肉.
- 不要超过 2000 HKD (DB 上限).

Return ONLY a valid JSON array (no markdown fence). Pair by dish_id.`;

function buildUserMessage(rows: Row[]): string {
  return rows.map((r, i) => {
    const prepText = (r.prep_steps_json ?? [])
      .map((s: any) => `${s.ingredient_zh ?? ''}(${s.amount_g ?? 0}g)`)
      .filter(Boolean)
      .slice(0, 12)
      .join(', ');
    return `[${i + 1}] dish_id=${r.id}
title: ${r.title_zh}${r.title_en ? ` (${r.title_en})` : ''}
origin: ${r.origin_cuisine ?? '-'} · course: ${r.course_type ?? '-'} · main: ${r.main_ingredient ?? '-'} · method: ${r.cook_method ?? '-'}
desc: ${(r.description_zh ?? '').slice(0, 100)}
ingredients (for 4 people, scale to 1 person): ${prepText || '-'}`;
  }).join('\n\n');
}

async function callClaude(rows: Row[]): Promise<Estimate[]> {
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
  return parsed as Estimate[];
}

function clamp(n: number): number {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  return Math.max(0, Math.min(2000, Math.round(n * 10) / 10));
}

(async () => {
  const where = FORCE
    ? ''
    : `WHERE average_cost_hkd IS NULL`;
  const limitClause = Number.isFinite(LIMIT) ? `LIMIT ${LIMIT}` : '';
  const { rows: todo } = await db.query<Row>(`
    SELECT id, title_zh, title_en, origin_cuisine, main_ingredient,
           course_type, cook_method, description_zh, prep_steps_json
    FROM dishes
    ${where}
    ORDER BY id
    ${limitClause}
  `);

  console.log(`💰 ${todo.length} dishes to estimate cost (BATCH=${BATCH}, MODEL=${MODEL}, FORCE=${FORCE}, DRY=${DRY})`);
  if (todo.length === 0) { await db.end(); return; }

  let done = 0, errors = 0;
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    process.stdout.write(`Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(todo.length / BATCH)}…`);
    let est: Estimate[];
    try {
      est = await callClaude(slice);
    } catch (e: any) {
      console.log(` ❌ ${e.message}`);
      errors += slice.length;
      continue;
    }
    const map = new Map(est.map(e => [e.dish_id, clamp(e.cost_hkd ?? 0)]));
    const writes: { id: string; cost: number }[] = [];
    for (const r of slice) {
      const c = map.get(r.id);
      if (c === undefined || c <= 0) { errors++; continue; }
      writes.push({ id: r.id, cost: c });
    }
    if (DRY) {
      for (const w of writes) {
        const t = slice.find(r => r.id === w.id)?.title_zh ?? '?';
        console.log(`\n  [dry] ${t.padEnd(20)} → HK$${w.cost}`);
      }
    } else {
      for (const w of writes) {
        await db.query(`UPDATE dishes SET average_cost_hkd=$1 WHERE id=$2`, [w.cost, w.id]);
      }
    }
    done += writes.length;
    process.stdout.write(` ✅ (+${writes.length})\n`);
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n📊 Done: ${done} ✅ ${errors} ⚠  (${dt}s)`);
  await db.end();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
