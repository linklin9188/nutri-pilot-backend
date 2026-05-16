/**
 * gen-chinese-dishes.ts
 *
 * 让 Gemini 直接生成中国家常菜（以广东菜为主）并写入 Supabase dishes 表。
 * 不依赖 TheMealDB — 菜名和元数据全部由 Gemini 生成。
 *
 * Usage:
 *   npx tsx scripts/gen-chinese-dishes.ts              # 全量
 *   npx tsx scripts/gen-chinese-dishes.ts --dry-run    # 只打印，不写库
 *   npx tsx scripts/gen-chinese-dishes.ts --limit=50   # 最多导入 N 道
 */

import pg from 'pg';
import { config } from 'dotenv';
config();

const DB_URL       = process.env.DIRECT_DATABASE_URL!;
const GEMINI_KEY   = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity;
const BATCH     = 20;  // dishes per Gemini call
const PAUSE_MS  = 3000;

if (!GEMINI_KEY) { console.error('❌ 请设置 GEMINI_API_KEY 环境变量'); process.exit(1); }
if (!DB_URL)     { console.error('❌ 请设置 DIRECT_DATABASE_URL 环境变量'); process.exit(1); }

// ── Valid enum values ──────────────────────────────────────────────────────────

const MAIN_ING_VALUES = [
  'beef','chicken','pork','fish','shrimp','crab','squid','scallop','clam',
  'salmon','cod','seabass','hairtail','duck','lamb','egg','tofu','mushroom',
  'veggie','carb','dessert','other',
];
const COURSE_TYPES    = ['soup','main_protein','veggie_dish','staple','dessert'];
const MEAL_TYPES      = ['breakfast','lunch','dinner','all'];
const ORIGIN_VALUES   = ['cantonese','sichuan','jiangnan','northern','western','japanese_korean','southeast_asian'];
const FLAVOR_VALUES   = ['spicy','light','savory','sweet','sour','umami','seafood','aromatic'];
const HEALTH_VALUES   = ['maintain','lose_weight','muscle_gain','high_protein','low_sodium',
                         'low_sugar','low_purine','anti_aging','boost_immunity','damp_clear','detox'];
const SEASONAL_VALUES = ['All-Season/Balanced','Spring','Summer','Autumn','Winter'];

// ── Cuisine batches to generate ────────────────────────────────────────────────

interface CuisineBatch {
  label: string;           // display name
  origin_cuisine: string;  // DB value
  count: number;           // how many dishes to generate
  hint: string;            // Gemini guidance for dish style
}

const CUISINE_BATCHES: CuisineBatch[] = [
  // User request 2026-05-15: focus on 顺德 + 潮汕 (25 each), 50 total.
  // 10 潮汕 already inserted in earlier --limit=10 test; dedup will skip those.
  {
    label: '顺德菜',
    origin_cuisine: 'cantonese',
    count: 25,
    hint: '顺德菜（粤菜清鲜嫩滑分支）：双皮奶 / 大良炒鲜奶 / 顺德鱼生 / 均安蒸猪 / 桑拿鱼 / 陈村粉 / 顺德鱼皮饺 / 容桂煎水蟹饭 / 顺德渔家烧鹅。强调"清鲜嫩滑"和广府水乡风味',
  },
  {
    label: '潮汕菜',
    origin_cuisine: 'cantonese',
    count: 25,
    hint: '潮汕菜：卤水鹅 / 蚝烙 / 鱼饭 / 紫菜汤 / 牛肉丸汤 / 沙茶面 / 砂锅粥 / 朥饼 / 普宁豆酱鸡 / 反沙芋头 / 潮汕粿条 / 鱼露空心菜。强调潮汕地方风味，工夫茶配菜',
  },
];

// ── Execution level ────────────────────────────────────────────────────────────

const LEVEL1_KW = ['清蒸','蒸','白切','白灼','凉拌','拌','煮','水煮','卤','炖','焖','盐水','粥','汤','煲'];
const LEVEL3_KW = ['红烧','麻婆','回锅','爆炒','干煸','鱼香','夫妻','水煮鱼','酸菜鱼','剁椒',
                   '铁板','东坡','狮子头','梅菜扣','糖醋','锅包肉','粉蒸','扣肉','炸','油炸','脆皮','干锅'];

function calcExecutionLevel(title_zh: string, course_type: string, main_ingredient: string, flavor_tags: string[]): number {
  if (LEVEL1_KW.some(kw => title_zh.includes(kw))) return 1;
  if (LEVEL3_KW.some(kw => title_zh.includes(kw))) return 3;
  if (flavor_tags.includes('spicy') && course_type === 'main_protein') return 3;
  if (['beef','lamb'].includes(main_ingredient) && course_type === 'main_protein') return 3;
  if (main_ingredient === 'egg') return 1;
  if (['soup','staple','dessert'].includes(course_type)) return 1;
  return 2;
}

// ── Gemini generation ──────────────────────────────────────────────────────────

interface GeneratedDish {
  title_zh: string;
  title_en: string;
  description_zh: string;
  description_en: string;
  main_ingredient: string;
  course_type: string;
  meal_type: string;
  flavor_tags: string[];
  health_benefit_tags: string[];
  seasonal_tag: string;
  is_vegan: boolean;
}

async function generateBatch(batch: CuisineBatch, existingZh: Set<string>, count: number): Promise<GeneratedDish[]> {
  // Show Gemini the FULL existing list, not just 30. With ~300+ existing
  // Chinese dishes the truncation made dedup nearly useless.
  const existingList = [...existingZh].join('、');

  const prompt = `你是中餐菜谱专家。请生成${count}道【${batch.hint}】的菜品，以JSON数组格式返回。

每道菜必须包含以下字段：
- title_zh: 2-8字中文菜名（必须是真实菜名，不重复）
- title_en: 对应英文名（3-6个单词）
- description_zh: 15字以内的中文描述
- description_en: 10字以内的英文描述
- main_ingredient: 必须是以下之一: ${MAIN_ING_VALUES.join('/')}
- course_type: 必须是以下之一: ${COURSE_TYPES.join('/')}
- meal_type: 必须是以下之一: ${MEAL_TYPES.join('/')}
- flavor_tags: 从以下选1-3个组成数组: ${FLAVOR_VALUES.join('/')}
- health_benefit_tags: 从以下选1-2个组成数组: ${HEALTH_VALUES.join('/')}
- seasonal_tag: 必须是以下之一: ${SEASONAL_VALUES.join('/')}
- is_vegan: true或false

**差异化硬要求**（重要）：

A. 不只是菜名不同 — **做法、主料、地方风格、场合也必须明显不同**。
   反例（不要这样生成）：
     已有 "红烧肉" → 不要 "红烧五花肉" / "经典红烧肉" / "家常红烧肉"
     已有 "蒜蓉粉丝蒸娃娃菜" → 不要 "蒜蓉娃娃菜" / "粉丝蒸娃娃菜"
     已有 "排骨汤" → 不要 "猪排骨汤" / "排骨汤" 类换汤底但本质同
   正例：
     已有 "红烧肉" → 可以 "梅菜扣肉"（蒸法）/ "卤五花肉"（卤法）/ "回锅肉"（炒法）
     已有 "排骨汤" → 可以 "粉葛排骨汤"（药膳）/ "玉米排骨汤"（鲜甜）

B. 主料、烹饪方法、调味基底、地方流派至少**两项**跟所有已有菜不同。
C. 优先**地方分支**或**节庆/食疗变种**，避免简单变奏。

要求：
1. 菜名必须是真实存在的中国菜，不要创造虚假菜名
2. 严格避免以下所有已存在菜名（不光名字，做法相近也算重复）：
${existingList}
3. 只返回 JSON 数组，不要任何额外文字`;

  let attempts = 0;
  while (attempts < 4) {
    try {
      const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
          },
        }),
      });
      const data = await resp.json() as any;
      let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as GeneratedDish[];
      }
    } catch (e) {
      console.warn(`  Gemini attempt ${attempts + 1} failed:`, (e as Error).message);
    }
    attempts++;
    await sleep(2000);
  }
  return [];
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getExistingData(db: pg.Client): Promise<{ titleEn: Set<string>; titleZh: Set<string> }> {
  const { rows } = await db.query(`SELECT LOWER(title_en) as en, title_zh as zh FROM dishes`);
  return {
    titleEn: new Set(rows.map((r: any) => r.en as string)),
    titleZh: new Set(rows.map((r: any) => r.zh as string)),
  };
}

async function insertDishes(db: pg.Client, rows: any[]): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    try {
      await db.query(`
        INSERT INTO dishes (
          title_zh, title_en, meal_type, origin_cuisine, main_ingredient,
          course_type, flavor_tags, health_benefit_tags, seasonal_tag,
          description_zh, description_en, image_url, is_vegan, execution_level
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `, [
        row.title_zh, row.title_en, row.meal_type, row.origin_cuisine,
        row.main_ingredient, row.course_type,
        row.flavor_tags, row.health_benefit_tags,
        row.seasonal_tag, row.description_zh, row.description_en,
        null, row.is_vegan, row.execution_level,
      ]);
      inserted++;
    } catch (e: any) {
      if (process.env.DEBUG) console.warn(`  ⚠ skip ${row.title_zh}: ${e.message}`);
    }
  }
  return inserted;
}

function validateAndClean(dish: GeneratedDish, originCuisine: string): any | null {
  if (!dish.title_zh || !dish.title_en) return null;
  const main_ingredient = MAIN_ING_VALUES.includes(dish.main_ingredient) ? dish.main_ingredient : 'other';
  const course_type     = COURSE_TYPES.includes(dish.course_type) ? dish.course_type : 'main_protein';
  const meal_type       = MEAL_TYPES.includes(dish.meal_type) ? dish.meal_type : 'dinner';
  const seasonal_tag    = SEASONAL_VALUES.includes(dish.seasonal_tag) ? dish.seasonal_tag : 'All-Season/Balanced';
  const flavor_tags     = (dish.flavor_tags ?? []).filter((t: string) => FLAVOR_VALUES.includes(t));
  const health_tags     = (dish.health_benefit_tags ?? []).filter((t: string) => HEALTH_VALUES.includes(t));

  return {
    title_zh: dish.title_zh.trim(),
    title_en: dish.title_en.trim(),
    description_zh: dish.description_zh?.trim() ?? '',
    description_en: dish.description_en?.trim() ?? '',
    main_ingredient,
    course_type,
    meal_type,
    origin_cuisine: originCuisine,
    flavor_tags,
    health_benefit_tags: health_tags,
    seasonal_tag,
    is_vegan: !!dish.is_vegan,
    execution_level: calcExecutionLevel(dish.title_zh, course_type, main_ingredient, flavor_tags),
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  if (!DRY_RUN) await db.connect();

  console.log('🥢  中国菜生成器');
  console.log(`   模式: ${DRY_RUN ? 'DRY-RUN (不写库)' : '写入数据库'}`);
  console.log(`   上限: ${LIMIT === Infinity ? '无限制' : LIMIT + ' 道'}\n`);

  const existing = DRY_RUN
    ? { titleEn: new Set<string>(), titleZh: new Set<string>() }
    : await getExistingData(db);
  console.log(`📦 现有菜品: ${existing.titleEn.size} 道\n`);

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const batch of CUISINE_BATCHES) {
    if (totalInserted >= LIMIT) break;

    const remaining = Math.min(batch.count, LIMIT - totalInserted);
    console.log(`\n🍽  ${batch.label} (目标 ${remaining} 道)`);

    // Generate in sub-batches of BATCH size
    const subBatches = Math.ceil(remaining / BATCH);
    let batchInserted = 0;

    for (let i = 0; i < subBatches; i++) {
      const want = Math.min(BATCH, remaining - i * BATCH);
      process.stdout.write(`   批次 ${i + 1}/${subBatches} (${want}道)... `);

      const generated = await generateBatch(batch, existing.titleZh, want);
      if (generated.length === 0) {
        console.log('(0 新增)');
        continue;
      }

      // Validate, deduplicate, clean
      const toInsert: any[] = [];
      for (const dish of generated) {
        const cleaned = validateAndClean(dish, batch.origin_cuisine);
        if (!cleaned) continue;
        if (existing.titleZh.has(cleaned.title_zh)) { totalSkipped++; continue; }
        if (existing.titleEn.has(cleaned.title_en.toLowerCase())) { totalSkipped++; continue; }
        toInsert.push(cleaned);
        existing.titleZh.add(cleaned.title_zh);
        existing.titleEn.add(cleaned.title_en.toLowerCase());
      }

      if (DRY_RUN) {
        console.log(`✅ +${toInsert.length} (dry-run)`);
        toInsert.forEach(d => console.log(`     • ${d.title_zh} / ${d.title_en} [L${d.execution_level}]`));
        batchInserted += toInsert.length;
      } else {
        const n = await insertDishes(db, toInsert);
        console.log(`✅ +${n}`);
        batchInserted += n;
        totalInserted += n;
      }

      if (i < subBatches - 1) await sleep(PAUSE_MS);
    }

    console.log(`   小计: ${batchInserted} 道`);
  }

  if (!DRY_RUN) await db.end();

  console.log('\n══════════════════════════════');
  console.log(`✅ 生成完成`);
  console.log(`   新增: ${totalInserted} 道`);
  console.log(`   跳过(已存在): ${totalSkipped} 道`);
}

main().catch(e => { console.error(e); process.exit(1); });
