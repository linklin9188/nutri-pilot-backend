/**
 * gen-dish-steps.ts
 *
 * Generates prep_steps_json + cook_steps_json for all dishes that don't have them.
 *
 * prep_steps_json — tray-based ingredient prep for domestic helper (菲佣):
 *   tray A: main protein | B: hard veg/root | C: soft veg/leafy
 *   D: aromatics (葱姜蒜) | E: pre-mixed sauces | F: garnish (optional)
 *
 * cook_steps_json — precise step-by-step for cooking robot:
 *   each step has heat level, duration, weight, and observable cue
 *
 * Usage:
 *   npx tsx scripts/gen-dish-steps.ts --dry-run
 *   npx tsx scripts/gen-dish-steps.ts --limit=50
 *   npx tsx scripts/gen-dish-steps.ts           # all pending
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const GEMINI_KEY   = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
if (!GEMINI_KEY) { console.error('❌ 请先设置 VITE_GEMINI_API_KEY'); process.exit(1); }
const DB_URL = process.env.DIRECT_DATABASE_URL
  ?? 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const DRY_RUN   = process.argv.includes('--dry-run');
const FORCE     = process.argv.includes('--force');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const BATCH     = 8;    // dishes per Gemini call (steps are longer, use smaller batch)
const PAUSE     = 2500; // ms between batches

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Types ─────────────────────────────────────────────────────────────────────

interface DishRow {
  id: string;
  title_zh: string;
  description_zh: string;
  main_ingredient: string;
  course_type: string;
  origin_cuisine: string;
}

interface PrepStep {
  tray: 'A' | 'B' | 'C' | 'D' | 'E';
  ingredient_zh: string;
  ingredient_en: string;
  amount_g: number;
  action_zh: string;   // precise: cut size, rinse, soak, etc. (菲佣备菜用)
  action_en: string;
}

interface CookStep {
  step: number;
  action_zh: string;   // heat level (大火/中火/小火, or °C for oven/steak) + duration + visual cue
  action_en: string;
  duration_min: number;
}

interface GeminiResult {
  dish_id: string;
  prep_steps: PrepStep[];
  cook_steps: CookStep[];
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async function generateBatch(dishes: DishRow[]): Promise<GeminiResult[]> {
  const prompt = `你是专业厨师，同时也是家庭烹饪机器人系统的数据工程师。
我会给你一批中文菜肴，为每道菜生成两份精确指令：

【1】prep_steps（菲佣备菜指令）
格位规则（严格按照以下分类，不要自创新类别）：
- A格：主菜食材（主蛋白：肉类/海鲜/豆腐/蛋类等，每种单独列出）
- B格：配菜（辅助蔬菜：土豆/胡萝卜/莲藕/茄子等，每种单独列出）
- C格：配料（补充性食材：葱花/香菜/芝麻/花生等点缀类配料）
- D格：调料（所有调味品：葱姜蒜/生抽/老抽/料酒/糖/盐/酱料等，把需要提前混合的酱汁合并为一条"预混酱汁"）
- E格：其他（难以归类的食材，尽量少用此类）

要求：
- amount_g：精确克数（单人份，2人家庭）
- action_zh：菲佣能执行的精确操作，必须含切法尺寸（如"切块3cm×3cm"）或处理方式（如"冷水浸泡10分钟去血水"、"切末"、"拍碎"）
- 每格最多3条，总步骤不超过10条
- 不要使用F格（已废弃）

【2】cook_steps（烹饪机器人执行步骤）
要求：
- 8-12步，按顺序执行
- 每步必须包含：火候（只写大火/中火/小火三档，烤箱/牛排等西式菜写温度如"180°C"）、时长（X分钟或X秒）、引用格位（如"A格鸡肉"）
- 不要写档位数字（不要"9档"、"level 9"等）
- 用可观察判断标准（如"变色"、"出香味"、"冒大泡"）
- 不要写"适量"，所有用量要具体
- duration_min：该步骤耗时（分钟，可以是0.5=30秒）

输入（JSON数组）：
${JSON.stringify(dishes.map(d => ({
  dish_id: d.id,
  name: d.title_zh,
  desc: d.description_zh,
  main_ingredient: d.main_ingredient,
  course_type: d.course_type,
  cuisine: d.origin_cuisine,
})), null, 2)}

返回纯JSON数组，格式：
[
  {
    "dish_id": "uuid",
    "prep_steps": [
      {"tray": "A", "ingredient_zh": "鸡腿肉", "ingredient_en": "Chicken thigh", "amount_g": 200, "action_zh": "去骨切块3cm×3cm，冷水浸泡10分钟去血水，沥干", "action_en": "Debone and cut into 3×3cm pieces, soak in cold water 10 min to remove blood, drain"},
      {"tray": "B", "ingredient_zh": "土豆", "ingredient_en": "Potato", "amount_g": 150, "action_zh": "去皮切滚刀块约3cm，泡冷水防氧化", "action_en": "Peel, cut into 3cm rolling cuts, soak in cold water to prevent browning"},
      {"tray": "D", "ingredient_zh": "预混酱汁", "ingredient_en": "Sauce mix", "amount_g": 50, "action_zh": "碗中混合：生抽20ml + 老抽10ml + 料酒15ml + 糖5g，搅匀备用", "action_en": "Mix in bowl: 20ml light soy + 10ml dark soy + 15ml Shaoxing wine + 5g sugar"},
      {"tray": "D", "ingredient_zh": "姜蒜", "ingredient_en": "Ginger & Garlic", "amount_g": 15, "action_zh": "姜切片2mm厚，蒜拍碎", "action_en": "Slice ginger 2mm thick, smash garlic cloves"},
      {"tray": "C", "ingredient_zh": "葱花", "ingredient_en": "Spring onion", "amount_g": 10, "action_zh": "葱切末，装小碗备用（上桌前撒）", "action_en": "Finely chop, place in small bowl (sprinkle before serving)"}
    ],
    "cook_steps": [
      {"step": 1, "action_zh": "锅中加食用油30ml，大火烧热1分钟至油面微微冒烟", "action_en": "Add 30ml oil, high heat for 1 min until oil shimmers", "duration_min": 1},
      {"step": 2, "action_zh": "下D格姜蒜，中火爆香30秒至出香味", "action_en": "Add D-tray ginger & garlic, medium heat for 30 sec until fragrant", "duration_min": 0.5},
      {"step": 3, "action_zh": "下A格鸡肉，大火翻炒2分钟至表面全部变色", "action_en": "Add A-tray chicken, high heat stir-fry 2 min until all surfaces change color", "duration_min": 2}
    ]
  }
]

只返回JSON，不要其他文字。`;

  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    );
    if (res.ok) break;
    if ([429, 503].includes(res.status) && attempt < 3) {
      const wait = attempt * 6000;
      console.log(`\n  ⏳ Gemini ${res.status}, retry ${attempt}/3 in ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    }
  }

  const data = await res!.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as GeminiResult[];
}

// ── Validate ──────────────────────────────────────────────────────────────────

const VALID_TRAYS = new Set(['A', 'B', 'C', 'D', 'E']);

function validate(r: GeminiResult): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!r.prep_steps?.length) issues.push('empty prep_steps');
  if (!r.cook_steps?.length) issues.push('empty cook_steps');
  for (const p of r.prep_steps ?? []) {
    if (!VALID_TRAYS.has(p.tray)) issues.push(`invalid tray: ${p.tray}`);
    if (!p.ingredient_zh)         issues.push('missing ingredient_zh');
    if (!p.action_zh)             issues.push('missing prep action_zh');
    if (p.amount_g <= 0 || p.amount_g > 1000) issues.push(`suspicious amount: ${p.amount_g}g`);
  }
  for (const s of r.cook_steps ?? []) {
    if (!s.action_zh) issues.push(`step ${s.step} missing action_zh`);
    if (s.duration_min < 0 || s.duration_min > 120) issues.push(`step ${s.step} suspicious duration`);
  }
  if ((r.cook_steps?.length ?? 0) < 5) issues.push('too few cook steps');
  return { ok: issues.length === 0, issues };
}

// ── UUID fuzzy match (Gemini sometimes mis-transcribes UUIDs) ─────────────────

function resolveId(returnedId: string, batch: DishRow[]): string | null {
  if (batch.some(d => d.id === returnedId)) return returnedId;
  const fuzzy = batch.find(d => {
    const a = d.id.replace(/-/g, '');
    const b = returnedId.replace(/-/g, '');
    if (Math.abs(a.length - b.length) > 2) return false;
    let diff = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) diff++;
      if (diff > 2) return false;
    }
    return true;
  });
  return fuzzy?.id ?? null;
}

// ── DB writer ─────────────────────────────────────────────────────────────────

async function writeResults(pg: Client, results: GeminiResult[], batch: DishRow[]): Promise<number> {
  let written = 0;
  for (const r of results) {
    const { ok, issues } = validate(r);
    if (!ok) {
      console.log(`\n  ⚠️  ${r.dish_id}: ${issues.join(', ')} — skipping`);
      continue;
    }

    const id = resolveId(r.dish_id, batch);
    if (!id) { console.log(`\n  ⚠️  ${r.dish_id}: UUID not found in batch — skipping`); continue; }

    await pg.query(
      `UPDATE dishes SET prep_steps_json = $1, cook_steps_json = $2 WHERE id = $3`,
      [JSON.stringify(r.prep_steps), JSON.stringify(r.cook_steps), id]
    );
    written++;
  }
  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🍳 Dish Steps Generator  DRY_RUN=${DRY_RUN}  FORCE=${FORCE}`);

  let query = sb.from('dishes')
    .select('id, title_zh, description_zh, main_ingredient, course_type, origin_cuisine');
  if (!FORCE) query = query.is('prep_steps_json', null);

  const { data: allDishes, error } = await query;
  if (error || !allDishes) { console.error('Fetch error:', error); process.exit(1); }

  const dishes = isFinite(LIMIT) ? allDishes.slice(0, LIMIT) : allDishes;
  console.log(`📊 Dishes to process: ${dishes.length}${isFinite(LIMIT) ? ` (limited, total pending: ${allDishes.length})` : ''}\n`);

  if (DRY_RUN) {
    const sample = dishes.slice(0, 2) as DishRow[];
    console.log('🔍 DRY RUN — previewing 2 dishes...\n');
    const results = await generateBatch(sample);
    results.forEach(r => {
      const dish = sample.find(d => d.id === r.dish_id);
      console.log(`\n【${dish?.title_zh}】`);
      console.log('  备菜:');
      r.prep_steps.forEach(p => console.log(`    ${p.tray}格 ${p.ingredient_zh} ${p.amount_g}g — ${p.action_zh}`));
      console.log('  烹饪:');
      r.cook_steps.slice(0, 3).forEach(s => console.log(`    步骤${s.step} (${s.duration_min}min): ${s.action_zh}`));
      console.log('    ...');
    });
    return;
  }

  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  let processed = 0, errors = 0;
  const total = dishes.length;
  const totalBatches = Math.ceil(total / BATCH);

  for (let i = 0; i < total; i += BATCH) {
    const batch = dishes.slice(i, i + BATCH) as DishRow[];
    const batchNum = Math.floor(i / BATCH) + 1;
    process.stdout.write(`\rBatch ${batchNum}/${totalBatches} (${i + 1}–${Math.min(i + BATCH, total)}/${total})...`);

    try {
      const results = await generateBatch(batch);
      const written = await writeResults(pg, results, batch);
      processed += written;
    } catch (e: any) {
      errors += batch.length;
      console.error(`\n  ❌ Batch ${batchNum} failed: ${e.message}`);
    }

    if (i + BATCH < total) await new Promise(r => setTimeout(r, PAUSE));
  }

  await pg.end();

  const { count: ready } = await sb.from('dishes')
    .select('*', { count: 'exact', head: true })
    .not('prep_steps_json', 'is', null);
  const { count: total_count } = await sb.from('dishes')
    .select('*', { count: 'exact', head: true });

  console.log(`\n\n✅ Done!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Errors:    ${errors}`);
  console.log(`   DB ready:  ${ready}/${total_count} dishes have steps`);
}

main().catch(e => { console.error(e); process.exit(1); });
