/**
 * gen-dish-steps-claude.ts
 *
 * Claude-API version of gen-dish-steps.ts. Used when Gemini geo-blocks
 * the user's IP. Same output shape — generates prep_steps_json +
 * cook_steps_json for dishes that don't have them yet.
 *
 * Setup:
 *   1. Put ANTHROPIC_API_KEY=sk-ant-... in .env (or set as env var)
 *   2. npx tsx scripts/gen-dish-steps-claude.ts
 *
 * Idempotent — only picks dishes where prep_steps_json IS NULL.
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const CLAUDE_KEY   = process.env.ANTHROPIC_API_KEY ?? '';
if (!CLAUDE_KEY) { console.error('❌ 请先设置 ANTHROPIC_API_KEY'); process.exit(1); }
const DB_URL = process.env.DIRECT_DATABASE_URL
  ?? 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const DRY_RUN   = process.argv.includes('--dry-run');
const FORCE     = process.argv.includes('--force');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const BATCH     = 6;     // Claude handles slightly smaller batches for safety
const PAUSE     = 2000;  // ms between batches

const MODEL = 'claude-haiku-4-5';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  action_zh: string;
  action_en: string;
  // ── Simply Chinese Feasts 4D — Suzie's Twist substitutes ─────────────
  // Pantry-friendly swaps when the primary ingredient is unavailable.
  // 1-3 items ordered closest analogue first. Omitted when no reasonable
  // swap exists (e.g. "整鸡" doesn't really swap).
  substitutes_zh?: string[];
  substitutes_en?: string[];
}

interface CookStep {
  step: number;
  action_zh: string;
  action_en: string;
  duration_min: number;
  // ── Simply Chinese Feasts 4D — 物性目标 / state target ─────────────────
  // Sensory checkpoint that tells a human cook "this step is actually done".
  // E.g. "肉变色 / 皮金黄酥脆 / 汤汁挂勺 / 静置定色". Required for non-robot
  // execution — duration alone is too mechanical.
  state_target_zh?: string;
  state_target_en?: string;
}

interface ClaudeResult {
  dish_id: string;
  prep_steps: PrepStep[];
  cook_steps: CookStep[];
  // ── Simply Chinese Feasts 4D — 文化背景 / cultural_note ───────────────
  // One-paragraph (≤120字) backstory: origin, festival, family meaning.
  // OPTIONAL — only generated for festive / regional-iconic / family
  // tradition dishes. Most everyday stir-fries leave this null.
  cultural_note?: string | null;
}

const SYSTEM_PROMPT = `你是专业厨师，同时也是家庭烹饪机器人系统的数据工程师。你的任务是为每道菜生成精确的备菜清单 + 烹饪步骤（依照 Simply Chinese Feasts 四维框架：基本词汇 / 烹饪术语 / 操作序列 / 物性目标）。你必须只返回纯 JSON 数组，不带任何解释文字、markdown 围栏或注释。`;

function buildPrompt(dishes: DishRow[]): string {
  return `我会给你一批中文菜肴，为每道菜按 Simply Chinese Feasts 四维框架生成三份指令：

【1】prep_steps（菲佣备菜指令）
格位规则（严格按照以下分类，不要自创新类别）：
- A格：主菜食材（主蛋白：肉类/海鲜/豆腐/蛋类等，每种单独列出）
- B格：配菜（辅助蔬菜：土豆/胡萝卜/莲藕/茄子等，每种单独列出）
- C格：配料（补充性食材：葱花/香菜/芝麻/花生等点缀类配料）
- D格：调料（所有调味品：葱姜蒜/生抽/老抽/料酒/糖/盐/酱料等，把需要提前混合的酱汁合并为一条"预混酱汁"）
- E格：其他（难以归类的食材，尽量少用此类）

要求：
- amount_g：精确克数（4 人家庭一道菜的总量；如菜本身就是 2 人份家常菜请按 4 口家折算）
- action_zh：菲佣能执行的精确操作，必须含切法尺寸（如"切块3cm×3cm"）或处理方式（如"冷水浸泡10分钟去血水"、"切末"、"拍碎"）
- 每格最多3条，总步骤不超过10条
- 不要使用F格（已废弃）
- substitutes_zh / substitutes_en（Suzie's Twist 可选）：当主料/重要配料在普通超市可能找不到时，列出 1-3 个最接近的替代品（如"虎皮椒"→["羊角椒","螺丝椒","二荆条"]、"叉烧"→["烧肉","蜜汁肉脯"]）。简单常见的食材（葱姜蒜、米饭、鸡蛋）不需要 substitutes，留空数组或省略字段。

【2】cook_steps（烹饪机器人 & 家庭厨师执行步骤）
要求：
- 8-12步，按顺序执行
- 每步必须包含：火候（只写大火/中火/小火三档，烤箱/牛排等西式菜写温度如"180°C"）、时长（X分钟或X秒）、引用格位（如"A格鸡肉"）
- 不要写档位数字（不要"9档"、"level 9"等）
- 用可观察判断标准（如"变色"、"出香味"、"冒大泡"）
- 不要写"适量"，所有用量要具体
- duration_min：该步骤耗时（分钟，可以是0.5=30秒）
- state_target_zh / state_target_en（物性目标，Simply Chinese Feasts 4D）：该步骤完成时的感官标志，让没有计时器的家庭主厨/菲佣也能判断"这步做完了"。每步都要写一条，长度 6-18 字：
  · 例：肉变色、汤色奶白、葱花焦香、油起鱼眼泡、蛋液凝固、皮金黄酥脆、汤汁挂勺、静置定色、面糊起鱼眼泡
  · 焯水/煮汤类：何时关火（"虾红即关火"/"水开 30 秒"）
  · 翻炒类：何时下一料（"蒜末焦黄前下肉"）

【3】cultural_note（文化背景，可选）
仅当此菜是节庆 / 地域名菜 / 家庭传承经典 时填写（≤100字中文），交代来源、节日、家庭含义。
适合写：饺子、年糕、汤圆、粽子、月饼、佛跳墙、宫保鸡丁、麻婆豆腐、回锅肉、白切鸡、东坡肉、生煎、肉夹馍、油泼面 等。
不适合写：普通炒青菜、家常蒸蛋、白米饭 等日常菜——省略该字段或返回 null。

输入（JSON数组）：
${JSON.stringify(dishes.map(d => ({
  dish_id: d.id,
  name: d.title_zh,
  desc: d.description_zh,
  main_ingredient: d.main_ingredient,
  course_type: d.course_type,
  cuisine: d.origin_cuisine,
})), null, 2)}

返回纯JSON数组，每个元素必须有 dish_id / prep_steps / cook_steps 三个字段（cultural_note 可选）。
不要 markdown 代码围栏，不要前后文字，只返回 JSON 数组。`;
}

async function generateBatch(dishes: DishRow[]): Promise<ClaudeResult[]> {
  const prompt = buildPrompt(dishes);

  let res: Response | null = null;
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  8000,
        temperature: 0.1,
        system:      SYSTEM_PROMPT,
        messages:    [{ role: 'user', content: prompt }],
      }),
    });
    if (res.ok) break;
    lastErr = await res.text();
    if ([429, 503, 529].includes(res.status) && attempt < 3) {
      const wait = attempt * 4000;
      console.log(`\n  ⏳ Claude ${res.status}, retry ${attempt}/3 in ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      throw new Error(`Claude ${res.status}: ${lastErr}`);
    }
  }

  const data: any = await res!.json();
  const text: string = data.content?.[0]?.text ?? '[]';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const m = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  const jsonStr = m ? m[0] : cleaned;
  const raw = JSON.parse(jsonStr) as any[];

  if (process.env.DEBUG_CLAUDE === '1' && raw[0]) {
    console.log('\n--- DEBUG raw first item ---');
    console.log('  top keys:', Object.keys(raw[0]));
    console.log('  prep_steps[0]:', JSON.stringify(raw[0].prep_steps?.[0]).slice(0, 300));
    console.log('  cook_steps[0]:', JSON.stringify(raw[0].cook_steps?.[0]).slice(0, 300));
  }

  // Claude haiku tends to nest prep_steps as { category, category_name, items: [...] }
  // and rename fields (step_num vs step, action vs action_zh, ingredient vs
  // ingredient_zh). Normalize to the flat schema the validator expects.
  return raw.map(normalizeClaudeResult);
}

// Field-name aliases — Claude haiku rotates between these freely
const NAME_FIELDS    = ['ingredient_zh', 'ingredient', 'name_zh', 'name', 'item', 'ingredient_name'];
const NAME_EN_FIELDS = ['ingredient_en', 'name_en', 'english_name'];
const AMOUNT_FIELDS  = ['amount_g', 'amount', 'weight_g', 'grams', 'weight'];
const ACTION_FIELDS  = ['action_zh', 'action', 'prep_zh', 'description', 'instruction', 'instruction_zh', 'prep_action'];
const ACTION_EN_FIELDS = ['action_en', 'prep_en', 'instruction_en', 'description_en'];
const STEP_FIELDS     = ['step', 'step_num', 'step_number', 'order'];
const DURATION_FIELDS = ['duration_min', 'duration', 'time_min', 'minutes', 'time'];
const SUBS_ZH_FIELDS  = ['substitutes_zh', 'substitutes', 'subs_zh', 'alt_zh', 'alternatives_zh'];
const SUBS_EN_FIELDS  = ['substitutes_en', 'subs_en', 'alt_en', 'alternatives_en'];
const STATE_ZH_FIELDS = ['state_target_zh', 'state_target', 'state_zh', 'doneness_zh', 'sign_zh', 'sign'];
const STATE_EN_FIELDS = ['state_target_en', 'state_en', 'doneness_en', 'sign_en'];
const CULTURE_FIELDS  = ['cultural_note', 'culture', 'background', 'origin_note', 'note', 'cultural_background'];

function pickArray(obj: any, fields: string[]): string[] {
  for (const f of fields) {
    const v = obj?.[f];
    if (Array.isArray(v) && v.length > 0) {
      return v.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 3);
    }
    if (typeof v === 'string' && v.trim()) {
      // Sometimes Claude returns "A / B / C" as a single string
      return v.split(/[/、,，]/).map(s => s.trim()).filter(Boolean).slice(0, 3);
    }
  }
  return [];
}

function pick(obj: any, fields: string[], fallback: any = '') {
  for (const f of fields) {
    if (obj?.[f] !== undefined && obj[f] !== null && obj[f] !== '') return obj[f];
  }
  return fallback;
}

function normalizeClaudeResult(r: any): ClaudeResult {
  const prepSteps: PrepStep[] = [];
  for (const p of r.prep_steps ?? []) {
    if (Array.isArray(p.items)) {
      // Nested style: tray-level group with items array inside
      const tray = (p.category ?? p.tray ?? p.group ?? 'E') as PrepStep['tray'];
      for (const item of p.items) {
        const subsZh = pickArray(item, SUBS_ZH_FIELDS);
        const subsEn = pickArray(item, SUBS_EN_FIELDS);
        prepSteps.push({
          tray,
          ingredient_zh: pick(item, NAME_FIELDS, ''),
          ingredient_en: pick(item, NAME_EN_FIELDS, ''),
          amount_g:      Number(pick(item, AMOUNT_FIELDS, 0)) || 0,
          action_zh:     pick(item, ACTION_FIELDS, ''),
          action_en:     pick(item, ACTION_EN_FIELDS, ''),
          ...(subsZh.length > 0 ? { substitutes_zh: subsZh } : {}),
          ...(subsEn.length > 0 ? { substitutes_en: subsEn } : {}),
        });
      }
    } else {
      // Flat style: each step IS one ingredient
      const subsZh = pickArray(p, SUBS_ZH_FIELDS);
      const subsEn = pickArray(p, SUBS_EN_FIELDS);
      prepSteps.push({
        tray:          (p.tray ?? p.category ?? p.group ?? 'E') as PrepStep['tray'],
        ingredient_zh: pick(p, NAME_FIELDS, ''),
        ingredient_en: pick(p, NAME_EN_FIELDS, ''),
        amount_g:      Number(pick(p, AMOUNT_FIELDS, 0)) || 0,
        action_zh:     pick(p, ACTION_FIELDS, ''),
        action_en:     pick(p, ACTION_EN_FIELDS, ''),
        ...(subsZh.length > 0 ? { substitutes_zh: subsZh } : {}),
        ...(subsEn.length > 0 ? { substitutes_en: subsEn } : {}),
      });
    }
  }

  const cookSteps: CookStep[] = (r.cook_steps ?? []).map((s: any, i: number) => {
    const stateZh = String(pick(s, STATE_ZH_FIELDS, '') ?? '').trim();
    const stateEn = String(pick(s, STATE_EN_FIELDS, '') ?? '').trim();
    return {
      step:         Number(pick(s, STEP_FIELDS, i + 1)) || i + 1,
      action_zh:    pick(s, ACTION_FIELDS, ''),
      action_en:    pick(s, ACTION_EN_FIELDS, ''),
      duration_min: Number(pick(s, DURATION_FIELDS, 0)) || 0,
      ...(stateZh ? { state_target_zh: stateZh } : {}),
      ...(stateEn ? { state_target_en: stateEn } : {}),
    } as CookStep;
  });

  const culture = String(pick(r, CULTURE_FIELDS, '') ?? '').trim();

  return {
    dish_id: r.dish_id,
    prep_steps: prepSteps,
    cook_steps: cookSteps,
    cultural_note: culture && culture.length >= 8 ? culture.slice(0, 280) : null,
  };
}

// ── Validate ──────────────────────────────────────────────────────────────────

const VALID_TRAYS = new Set(['A', 'B', 'C', 'D', 'E']);

function validate(r: ClaudeResult): { ok: boolean; issues: string[] } {
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
    // 240 min cap — old fire soups / braises legitimately reach ~3h.
    if (s.duration_min < 0 || s.duration_min > 240) issues.push(`step ${s.step} suspicious duration`);
  }
  if ((r.cook_steps?.length ?? 0) < 5) issues.push('too few cook steps');
  return { ok: issues.length === 0, issues };
}

// ── UUID fuzzy match (LLMs sometimes mis-transcribe UUIDs) ────────────────────

function resolveId(returnedId: string, batch: DishRow[]): string | null {
  if (batch.some(d => d.id === returnedId)) return returnedId;
  const fuzzy = batch.find(d => {
    const a = d.id.replace(/-/g, '');
    const b = (returnedId || '').replace(/-/g, '');
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

async function writeResults(pg: Client, results: ClaudeResult[], batch: DishRow[]): Promise<number> {
  let written = 0;
  for (const r of results) {
    const { ok, issues } = validate(r);
    if (!ok) {
      console.log(`\n  ⚠️  ${r.dish_id}: ${issues.join(', ')} — skipping`);
      continue;
    }
    const dishId = resolveId(r.dish_id, batch);
    if (!dishId) {
      console.log(`\n  ⚠️  ${r.dish_id}: UUID not in batch — skipping`);
      continue;
    }
    // cultural_note: only overwrite when Claude returned one — we don't
    // want to wipe a manually-edited backstory by setting it to NULL.
    // The column is added in migration 010_dishes_cultural_note.sql; if
    // the column doesn't exist yet (older DB), the UPDATE silently
    // ignores the column via COALESCE-equivalent? Postgres would error,
    // so we fall back to a no-cultural-note UPDATE on column-missing
    // errors.
    if (r.cultural_note) {
      try {
        await pg.query(
          `UPDATE dishes SET prep_steps_json = $1, cook_steps_json = $2, cultural_note = $3 WHERE id = $4`,
          [JSON.stringify(r.prep_steps), JSON.stringify(r.cook_steps), r.cultural_note, dishId]
        );
      } catch (e: any) {
        // 42703 = undefined_column (migration 010 not run yet)
        if (e?.code === '42703') {
          await pg.query(
            `UPDATE dishes SET prep_steps_json = $1, cook_steps_json = $2 WHERE id = $3`,
            [JSON.stringify(r.prep_steps), JSON.stringify(r.cook_steps), dishId]
          );
        } else throw e;
      }
    } else {
      await pg.query(
        `UPDATE dishes SET prep_steps_json = $1, cook_steps_json = $2 WHERE id = $3`,
        [JSON.stringify(r.prep_steps), JSON.stringify(r.cook_steps), dishId]
      );
    }
    written++;
  }
  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🍳 [Claude] Dish Steps Generator  MODEL=${MODEL}  DRY_RUN=${DRY_RUN}  FORCE=${FORCE}`);

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
      console.error(`\n  ❌ Batch ${batchNum} failed: ${e.message?.slice(0, 200)}`);
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
