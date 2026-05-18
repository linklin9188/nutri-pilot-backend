/**
 * backfill-quality-scores.ts — fill 3 quality scores added in migration 018:
 *   kid_acceptance_score    NUMERIC(3,2)  0.00–1.00  (default 0.50)
 *   hk_availability_score   NUMERIC(3,2)  0.00–1.00  (default 0.50)
 *   helper_friendly_score   NUMERIC(3,2)  0.00–1.00  (default 0.50)
 *
 * Currently every dish is at the 0.50 default = no signal to Composer.
 * After backfill, Composer can actually rank candidates by these axes.
 *
 * Uses claude-haiku-4-5: short structured JSON, fast + cheap + accurate
 * enough. Batches 10 dishes per request. ~720 dishes ≈ 72 batches ≈
 * 6–8 minutes, ~$0.50 total.
 *
 * Filter:
 *   default — every dish that still has all three columns at 0.50
 *             (the unset signal — anything else was backfilled already)
 *   --force — re-evaluate every dish regardless
 *
 * Run:
 *   npx tsx scripts/backfill-quality-scores.ts --dry-run --limit=3
 *   npx tsx scripts/backfill-quality-scores.ts --limit=10
 *   npx tsx scripts/backfill-quality-scores.ts
 *   npx tsx scripts/backfill-quality-scores.ts --force
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
  flavor_tags: string[] | null;
  cook_method: string | null;
  description_zh: string | null;
  cook_time_min: number | null;
}

interface Score {
  dish_id: string;
  kid:    number;  // 0..1
  hk:     number;  // 0..1
  helper: number;  // 0..1
}

const SYSTEM = `You are evaluating Chinese / Asian / Western home dishes for an app
serving Hong Kong middle-class families (大陆港漂带孩子家庭、雇有菲佣/印佣的港式中产).
Output a strict JSON ARRAY where each element matches:

{ "dish_id": "<exact uuid from input>",
  "kid":    0..1 (kid acceptance),
  "hk":     0..1 (HK ingredient sourcing ease),
  "helper": 0..1 (Filipina/Indonesian helper executability) }

Calibration:

KID_ACCEPTANCE (儿童 4–10 岁接受度):
  0.95+  甜的/脆的/简单的/熟悉口味: 蒸蛋羹, 西红柿炒蛋, 炸鸡块, 蛋挞, 奶油浓汤
  0.75   清淡米饭面食, 香煎类: 清蒸鱼, 番茄牛肉, 蛋炒饭, 鸡腿肉
  0.55   一般成人菜: 红烧排骨, 普通炒菜
  0.30   微辣/苦/有特殊气味: 微辣川菜, 凉拌菜含醋, 香菜重的
  0.15   极辣/苦/内脏/腥重: 麻辣火锅, 苦瓜, 内脏类, 醉虾, 强烈臭味发酵食品
  0.05   严重不适合儿童: 烈酒入菜, 重辣川菜

HK_AVAILABILITY (香港食材采购易得性, 假设普通中产家庭):
  1.00   Wellcome/ParknShop 全年都有: 鸡蛋, 米, 西红柿, 鸡, 猪, 牛, 白菜, 葱
  0.90   超市/街市常见: 黄瓜, 茄子, 豆腐, 鲜虾, 鲈鱼, 三文鱼
  0.75   超市偶有/特色店: 莲藕, 西兰花, 帕马森芝士, 莫扎瑞拉, 意面, 红酒
  0.55   要去 City'super/Great 或淘宝集运: 折耳根, 新疆羊腿, 老抽精品, 特殊菌菇
  0.35   小众/季节性强: 鲥鱼, 某些野菜, 进口特殊调料
  0.20   非常难买/需海淘: 罕见地域食材

HELPER_FRIENDLY (菲佣/印佣按英文菜谱独立完成的难度):
  0.95   极简单, 看图就会: 煎鸡蛋, 蒸饭, 切水果
  0.80   照英文菜谱炒/煮即可: 炒蔬菜, 蒸鱼, 煮意面, 拌沙拉
  0.60   需要一些技巧但可学会: 红烧肉, 卤味, 中式炒菜, 西餐烤鸡
  0.40   依赖经验/火候/手感: 复杂酱汁, 蛋糕烘焙, 拉面, 卤水秘方
  0.20   传统手工/精细工艺: 包饺子, 揉面, 复杂中式点心, 鲍鱼炖煮
  0.10   罕见技艺: 现切刺身, 传统老火汤, 油温刁钻菜系

Round each score to exactly 2 decimals (e.g. 0.85). Return ONLY a valid JSON
array (no markdown fence, no commentary). Order does not matter — pair by
dish_id.`;

function buildUserMessage(rows: Row[]): string {
  return rows.map((r, i) =>
    `[${i + 1}] dish_id=${r.id}
title: ${r.title_zh}${r.title_en ? ` (${r.title_en})` : ''}
origin: ${r.origin_cuisine ?? '-'} · main: ${r.main_ingredient ?? '-'} · course: ${r.course_type ?? '-'} · method: ${r.cook_method ?? '-'}
flavor: ${(r.flavor_tags ?? []).join(',')} · cook_time_min: ${r.cook_time_min ?? '-'}
desc: ${(r.description_zh ?? '').slice(0, 120)}`
  ).join('\n\n');
}

async function callClaude(rows: Row[]): Promise<Score[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 4096,
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
  return parsed as Score[];
}

function clamp(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Math.max(0, Math.min(1, v));
}

(async () => {
  const where = FORCE
    ? ''
    : `WHERE kid_acceptance_score = 0.50
       AND hk_availability_score = 0.50
       AND helper_friendly_score = 0.50`;
  const limitClause = Number.isFinite(LIMIT) ? `LIMIT ${LIMIT}` : '';
  const { rows: todo } = await db.query<Row>(`
    SELECT id, title_zh, title_en, origin_cuisine, main_ingredient,
           course_type, flavor_tags, cook_method, description_zh, cook_time_min
    FROM dishes
    ${where}
    ORDER BY id
    ${limitClause}
  `);

  console.log(`🎯 ${todo.length} dishes to score (BATCH=${BATCH}, MODEL=${MODEL}, FORCE=${FORCE}, DRY=${DRY})`);
  if (todo.length === 0) { await db.end(); return; }

  let done = 0, errors = 0;
  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    process.stdout.write(`Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(todo.length / BATCH)}…`);
    let scores: Score[];
    try {
      scores = await callClaude(slice);
    } catch (e: any) {
      console.log(` ❌ ${e.message}`);
      errors += slice.length;
      continue;
    }

    // Pair by dish_id
    const map = new Map(scores.map(s => [s.dish_id, s]));
    const writes: { id: string; kid: number; hk: number; helper: number }[] = [];
    for (const r of slice) {
      const s = map.get(r.id);
      if (!s) { errors++; continue; }
      writes.push({
        id:     r.id,
        kid:    clamp(s.kid ?? 0.5),
        hk:     clamp(s.hk ?? 0.5),
        helper: clamp(s.helper ?? 0.5),
      });
    }

    if (DRY) {
      for (const w of writes) {
        const t = slice.find(r => r.id === w.id)?.title_zh ?? '?';
        console.log(`\n  [dry] ${t}  kid=${w.kid} hk=${w.hk} helper=${w.helper}`);
      }
    } else {
      for (const w of writes) {
        await db.query(
          `UPDATE dishes SET kid_acceptance_score=$1, hk_availability_score=$2, helper_friendly_score=$3 WHERE id=$4`,
          [w.kid, w.hk, w.helper, w.id]
        );
      }
    }
    done += writes.length;
    process.stdout.write(` ✅ (+${writes.length})\n`);
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n📊 Done: ${done} ✅ ${errors} ⚠  (${dt}s)`);
  await db.end();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
