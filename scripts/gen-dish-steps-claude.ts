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
import { config } from 'dotenv';
config();

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
const TITLE_ARG = process.argv.find(a => a.startsWith('--title='));
const TITLE     = TITLE_ARG ? TITLE_ARG.split('=')[1] : null;
const MISSING_4D = process.argv.includes('--missing-4d');
// BATCH halved from 6 → 3 because the 4D prompt's bilingual prep/cook +
// substitutes + state_target + cultural_note output for 6 dishes routinely
// blew past the 8000-token cap (528/698 batches failed mid-JSON with
// "Expected ',' or '}' …"). With BATCH=3 the per-call output sits around
// 6-8k tokens, well inside the 20k cap.
const BATCH     = 3;
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
  return `我会给你一批中文菜肴。为每道菜返回结构化 JSON，包含 prep_steps + cook_steps + 可选 cultural_note。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要 / 不可违反】prep_steps tray 分类
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

每条 prep_step 的 tray 字段只能是 A / B / C / D（极少数 E）：

  A格 = 主蛋白：肉类 / 海鲜 / 豆腐 / 蛋类（每种单独一条）
  B格 = 配菜蔬菜：土豆 / 胡萝卜 / 莲藕 / 茄子 / 芥兰 / 西兰花 / 节瓜 / 笋（每种单独一条）
  C格 = 配料/点缀：葱花 / 香菜 / 芝麻 / 花生 / 木耳 / 粉丝 / 香菇 / 干红椒
  D格 = 调料：生抽 / 老抽 / 料酒 / 糖 / 盐 / 醋 / 蚝油 / 豆瓣酱 / 蒜末 / 姜末 / 葱段 / 食用油
        ⚠️ 葱姜蒜 进 D 格，不是 C 格
        ⚠️ 所有需要提前混合的酱料合并为一条 "预混酱汁" 放 D 格

约束（违反 = 数据被废弃）：
  ⛔ 每道菜的 prep_steps 必须横跨 ≥ 2 个不同 tray（例如 A+D，或 A+B+D）
  ⛔ E 格是 fallback，每道菜不得超过 1 条 E 格
  ⛔ F 格已废弃，永远不要用

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【prep_steps 字段】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- tray (必填)：A/B/C/D/E
- ingredient_zh / ingredient_en
- amount_g：4 人份总克数（若菜本身是 2 人份家常菜请按 4 口家折算）
- action_zh：菲佣能执行的具体操作，含切法尺寸（"切块3cm×3cm"）或处理方式（"冷水浸泡10分钟去血水"、"切末"、"拍碎"）
- action_en
- substitutes_zh / substitutes_en (条件必填，规则见下)
- 每格最多 3 条，总步骤 ≤ 10 条

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【何时必须写 substitutes_zh】Suzie's Twist
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

对以下类别的食材，**必须**列 1-3 个替代品（按最接近排序）：

  · 港式烧腊：叉烧→["烧肉","蜜汁排骨"]、烧鹅→["烧鸭","卤鸭"]、烧腊→["卤味","白切鸡"]
  · 特殊辣椒：螺丝椒→["二荆条","羊角椒"]、虎皮椒→["螺丝椒","二荆条"]、灯笼椒→["红甜椒"]
  · 发酵酱料：腐乳→["豆瓣酱","面豉酱"]、虾酱→["鱼露+虾米","XO酱"]、普宁豆酱→["豆瓣酱","黄豆酱"]、老干妈→["豆瓣酱+花椒","辣椒酱"]、XO酱→["豆豉酱","海鲜酱"]
  · 酒类：花雕→["黄酒","料酒"]、玫瑰露→["白酒+蜂蜜","料酒"]、米酒→["清酒","料酒"]
  · 干货：海参→["花胶","干鲍鱼"]、瑶柱→["虾干","干贝"]、海米→["小虾米","虾皮"]
  · 区域蔬菜：节瓜→["冬瓜","西葫芦"]、芥菜→["芥兰","菜心"]、白苋菜→["菠菜","小白菜"]

**不写**（这些到处都有）：葱姜蒜、米饭、鸡蛋、猪肉、鸡肉、牛肉、生抽老抽、糖盐醋油、白菜、土豆、胡萝卜、西红柿。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【cook_steps 字段】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- step (1-indexed)
- action_zh：火候 + 时长 + 引用格位（如 "大火 2 分钟，A 格猪肉末炒散变色"）
  · 火候只写"大火 / 中火 / 小火"，西式菜写温度（"180°C"），不要档位数字
  · 不要"适量"，所有用量要具体
- action_en
- duration_min（可 0.5=30秒）
- state_target_zh (必填)：该步完成时的感官 checkpoint，6-18 字
  · 例："肉末变色无粉红"、"油起鱼眼泡"、"汤色奶白"、"葱花焦香"、"皮金黄酥脆"、"汤汁挂勺"、"虾红即关火"
  · 焯水/煮汤类：何时关火；翻炒类：何时下一料
- state_target_en

总步骤 8-12 步。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【cultural_note (可选)】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

仅当此菜是节庆 / 地域名菜 / 家庭传承 时填写（≤100字中文，交代来源、节日、家庭含义）。
- 适合：饺子、月饼、年糕、汤圆、粽子、宫保鸡丁、麻婆豆腐、回锅肉、白切鸡、东坡肉、生煎、肉夹馍、佛跳墙
- 不适合：普通炒青菜、家常蒸蛋、白米饭 — 返回 null 或省略字段

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【输入 JSON】
${JSON.stringify(dishes.map(d => ({
  dish_id: d.id,
  name: d.title_zh,
  desc: d.description_zh,
  main_ingredient: d.main_ingredient,
  course_type: d.course_type,
  cuisine: d.origin_cuisine,
})), null, 2)}

返回纯 JSON 数组，元素含 dish_id / prep_steps / cook_steps（cultural_note 可选）。
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
        max_tokens:  20000,
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
    // 2000g cap matches the new 4-person prompt: pork shoulder for 蜜汁叉烧
    // legitimately runs 1200-1500g, 整鸡 1.5-2kg, 整鱼 1kg+. Anything beyond
    // 2kg is almost certainly a typo (10000g instead of 100g).
    if (p.amount_g <= 0 || p.amount_g > 2000) issues.push(`suspicious amount: ${p.amount_g}g`);
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
    .select('id, title_zh, description_zh, main_ingredient, course_type, origin_cuisine, cook_steps_json');
  if (!FORCE && !MISSING_4D) query = query.is('prep_steps_json', null);
  if (TITLE)  query = query.ilike('title_zh', `%${TITLE}%`);

  const { data: allDishes, error } = await query;
  if (error || !allDishes) { console.error('Fetch error:', error); process.exit(1); }

  // --missing-4d: only retry dishes that don't yet have the 4D state_target_zh
  // marker on cook_steps. Used to resume after a batch failure (the first run
  // dropped 528/698 due to the now-fixed 8k token cap) without re-doing the
  // ~100 already-completed dishes.
  let filtered = allDishes;
  if (MISSING_4D) {
    filtered = allDishes.filter((d: any) => {
      const cookText = JSON.stringify(d.cook_steps_json ?? '');
      return !cookText.includes('state_target_zh');
    });
    console.log(`🔁 --missing-4d filter: ${filtered.length}/${allDishes.length} dishes lack state_target_zh`);
  }

  const dishes = isFinite(LIMIT) ? filtered.slice(0, LIMIT) : filtered;
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
