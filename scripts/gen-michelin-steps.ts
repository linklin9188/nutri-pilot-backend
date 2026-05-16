/**
 * gen-michelin-steps.ts
 *
 * Generates BOTH the home-helper version and the pro-chef version of
 * prep+cook instructions for each michelin_dishes row.
 *
 *   home_prep_steps + home_cook_steps   — 家庭厨房工具，菲佣可执行
 *   chef_prep_steps + chef_cook_steps   — 上门米其林大厨带专业器具版（sous vide / 烟熏柜 / 喷枪 / 摆盘）
 *
 * Uses Claude Haiku for cost/speed. One Claude call per dish (paired).
 */

import { Client } from 'pg';
import { config } from 'dotenv';
config();

const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY ?? '';
if (!CLAUDE_KEY) { console.error('❌ ANTHROPIC_API_KEY missing'); process.exit(1); }

const DB_URL = process.env.DIRECT_DATABASE_URL!;
const MODEL = 'claude-haiku-4-5';

const args = process.argv.slice(2);
const LIMIT_ARG = args.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

interface Row {
  id: string;
  name_zh: string;
  name_en: string | null;
  restaurant_name_zh: string;
  signature_technique: string;
  cuisine_style: string;
  course_type: string;
  main_ingredient: string;
  plating_note_zh: string | null;
}

const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const { rows: pending } = await pg.query<Row>(`
  SELECT id, name_zh, name_en, restaurant_name_zh, signature_technique,
         cuisine_style, course_type, main_ingredient, plating_note_zh
  FROM michelin_dishes
  WHERE home_prep_steps_json IS NULL OR chef_prep_steps_json IS NULL
  ORDER BY created_at ASC
`);

const todo = isFinite(LIMIT) ? pending.slice(0, LIMIT) : pending;
console.log(`🍳 Michelin step gen: ${todo.length} dishes pending\n`);

const SYSTEM = '你是专业厨师 + 米其林餐厅厨房咨询师。任务：给同一道米其林菜，生成两套完整的备菜+烹饪指令，分别面向家庭场景和上门大厨场景。你只返回纯 JSON，不带解释文字、markdown 围栏。';

function buildPrompt(r: Row): string {
  return `这是一道米其林/黑珍珠招牌菜，由${r.restaurant_name_zh}主厨。

菜名: ${r.name_zh} (${r.name_en ?? ''})
出处餐厅: ${r.restaurant_name_zh}
菜系: ${r.cuisine_style}
课程: ${r.course_type}
主料: ${r.main_ingredient}
招牌技法: ${r.signature_technique}
摆盘: ${r.plating_note_zh ?? '精致摆盘'}

请生成 4 个数组：

【1】home_prep_steps（家常版备菜，菲佣可执行）
格位规则同普通菜：A 主料 / B 配菜 / C 配料 / D 调料 / E 其他。
要求：amount_g 精确克数（2人份）、action_zh 含切法/处理。每格最多 3 条。

【2】home_cook_steps（家常版烹饪）
8-12 步，每步含火候(大火/中火/小火 或 °C) + 时长(分钟) + 引用格位。
家常厨房工具(炒锅/蒸锅/烤箱)，不用 sous vide / 烟熏柜。

【3】chef_prep_steps（米其林大厨上门版备菜）
格位 A/B/C/D/E。大厨会带专业器具。可以涉及：
- 食材预处理: 风干 / 腌制 / 浸泡 / 卤水
- 调料: 自制酱料 / 高汤吊制 / 复合香料
- 数量按一桌 8 人份(放大 4x)

【4】chef_cook_steps（米其林大厨版烹饪）
12-20 步，体现专业技法：
- 低温慢煮 sous vide / 真空封装
- 明火炙烤 / 烟熏 / 球化 / 液氮
- 多步酱汁还原 reduction
- 摆盘细节(微型蔬菜 / 食用花 / 海盐颗粒 / 油画式 plating)
用 ${r.signature_technique} 为核心技法展开。

返回纯 JSON:
{
  "home_prep_steps": [
    {"tray":"A","ingredient_zh":"...","ingredient_en":"...","amount_g":N,"action_zh":"...","action_en":"..."}
  ],
  "home_cook_steps": [
    {"step":1,"action_zh":"...","action_en":"...","duration_min":N}
  ],
  "chef_prep_steps": [
    {"tray":"A","ingredient_zh":"...","ingredient_en":"...","amount_g":N,"action_zh":"...","action_en":"..."}
  ],
  "chef_cook_steps": [
    {"step":1,"action_zh":"...","action_en":"...","duration_min":N}
  ]
}`;
}

// Same tolerant normalizer as the regular script
const NAME_FIELDS    = ['ingredient_zh','ingredient','name_zh','name','item','ingredient_name'];
const NAME_EN_FIELDS = ['ingredient_en','name_en','english_name'];
const AMOUNT_FIELDS  = ['amount_g','amount','weight_g','grams','weight'];
const ACTION_FIELDS  = ['action_zh','action','prep_zh','description','instruction','instruction_zh'];
const ACTION_EN_FIELDS = ['action_en','prep_en','instruction_en','description_en'];
const STEP_FIELDS    = ['step','step_num','step_number','order'];
const DURATION_FIELDS = ['duration_min','duration','time_min','minutes','time'];

function pick(o: any, fields: string[], fallback: any = '') {
  for (const f of fields) if (o?.[f] !== undefined && o[f] !== null && o[f] !== '') return o[f];
  return fallback;
}

function normalizePrep(arr: any[]): any[] {
  const out: any[] = [];
  for (const p of arr ?? []) {
    if (Array.isArray(p.items)) {
      const tray = p.category ?? p.tray ?? p.group ?? 'E';
      for (const it of p.items) {
        out.push({
          tray,
          ingredient_zh: pick(it, NAME_FIELDS, ''),
          ingredient_en: pick(it, NAME_EN_FIELDS, ''),
          amount_g:      Number(pick(it, AMOUNT_FIELDS, 0)) || 0,
          action_zh:     pick(it, ACTION_FIELDS, ''),
          action_en:     pick(it, ACTION_EN_FIELDS, ''),
        });
      }
    } else {
      out.push({
        tray:          p.tray ?? p.category ?? p.group ?? 'E',
        ingredient_zh: pick(p, NAME_FIELDS, ''),
        ingredient_en: pick(p, NAME_EN_FIELDS, ''),
        amount_g:      Number(pick(p, AMOUNT_FIELDS, 0)) || 0,
        action_zh:     pick(p, ACTION_FIELDS, ''),
        action_en:     pick(p, ACTION_EN_FIELDS, ''),
      });
    }
  }
  return out;
}

function normalizeCook(arr: any[]): any[] {
  return (arr ?? []).map((s: any, i: number) => ({
    step:         Number(pick(s, STEP_FIELDS, i + 1)) || i + 1,
    action_zh:    pick(s, ACTION_FIELDS, ''),
    action_en:    pick(s, ACTION_EN_FIELDS, ''),
    duration_min: Number(pick(s, DURATION_FIELDS, 0)) || 0,
  }));
}

async function callClaude(r: Row): Promise<any> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  8000,
      temperature: 0.2,
      system:      SYSTEM,
      messages:    [{ role: 'user', content: buildPrompt(r) }],
    }),
  });
  if (!resp.ok) throw new Error(`${resp.status}: ${(await resp.text()).slice(0,200)}`);
  const data = await resp.json() as any;
  const text = data.content?.[0]?.text ?? '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : cleaned);
}

let ok = 0, fail = 0;
for (let i = 0; i < todo.length; i++) {
  const r = todo[i];
  process.stdout.write(`[${i+1}/${todo.length}] ${r.name_zh} … `);
  try {
    const j = await callClaude(r);
    const home_prep = normalizePrep(j.home_prep_steps);
    const home_cook = normalizeCook(j.home_cook_steps);
    const chef_prep = normalizePrep(j.chef_prep_steps);
    const chef_cook = normalizeCook(j.chef_cook_steps);
    if (home_prep.length === 0 || chef_prep.length === 0) throw new Error('empty');
    await pg.query(`
      UPDATE michelin_dishes
      SET home_prep_steps_json = $1, home_cook_steps_json = $2,
          chef_prep_steps_json = $3, chef_cook_steps_json = $4
      WHERE id = $5
    `, [
      JSON.stringify(home_prep),
      JSON.stringify(home_cook),
      JSON.stringify(chef_prep),
      JSON.stringify(chef_cook),
      r.id,
    ]);
    console.log(`✅ home=${home_prep.length}p/${home_cook.length}c · chef=${chef_prep.length}p/${chef_cook.length}c`);
    ok++;
  } catch (e: any) {
    console.log(`⚠️ ${e.message?.slice(0, 80)}`);
    fail++;
  }
  await new Promise(r => setTimeout(r, 1500));
}

console.log(`\n📊 Done: ${ok} ✅  ${fail} ⚠`);
await pg.end();
