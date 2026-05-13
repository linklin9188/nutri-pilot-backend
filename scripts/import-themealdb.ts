/**
 * import-themealdb.ts
 *
 * 从 TheMealDB 免费 API 批量抓取菜谱，用 Gemini 补全中文字段，写入 Supabase dishes 表。
 *
 * 覆盖菜系：Chinese / Japanese / Indian / Thai / Vietnamese / Malaysian /
 *           French / Italian / American / Greek / Mexican / Spanish / Turkish
 *
 * Usage:
 *   npx tsx scripts/import-themealdb.ts              # 全量导入
 *   npx tsx scripts/import-themealdb.ts --dry-run    # 只打印，不写库
 *   npx tsx scripts/import-themealdb.ts --limit=50   # 最多导入 N 道
 *   npx tsx scripts/import-themealdb.ts --area=Japanese  # 只跑一个菜系
 */

import pg from 'pg';
import { config } from 'dotenv';
config();

const DB_URL        = process.env.DIRECT_DATABASE_URL!;
const GEMINI_KEY    = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL  = 'gemini-2.5-flash';
const GEMINI_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
const MEALDB_BASE   = 'https://www.themealdb.com/api/json/v1/1';

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity;
const AREA_ARG  = process.argv.find(a => a.startsWith('--area='))?.split('=')[1];
const BATCH     = 4;   // dishes per Gemini call
const PAUSE_MS  = 3000;

if (!GEMINI_KEY) { console.error('❌ 请设置 GEMINI_API_KEY 环境变量'); process.exit(1); }

// ── TheMealDB area → our origin_cuisine mapping ──────────────────────────────
const AREA_MAP: Record<string, string> = {
  Chinese:    'cantonese',
  Japanese:   'japanese_korean',
  Korean:     'japanese_korean',
  Indian:     'southeast_asian',
  Thai:       'southeast_asian',
  Vietnamese: 'southeast_asian',
  Malaysian:  'southeast_asian',
  Filipino:   'southeast_asian',
  French:     'western',
  Italian:    'western',
  American:   'western',
  British:    'western',
  Canadian:   'western',
  Mexican:    'western',
  Spanish:    'western',
  Greek:      'western',
  Turkish:    'western',
  Moroccan:   'western',
  Jamaican:   'western',
  Croatian:   'western',
  Dutch:      'western',
  Egyptian:   'western',
  Irish:      'western',
  Polish:     'western',
  Portuguese: 'western',
  Russian:    'western',
  Tunisian:   'western',
  Ukrainian:  'western',
};

// Prioritise non-western areas first to balance the DB (we already have 118 western)
const PRIORITY_AREAS = [
  'Chinese', 'Japanese', 'Korean', 'Indian', 'Thai', 'Vietnamese',
  'Malaysian', 'Filipino', 'Greek', 'Turkish', 'Moroccan',
  'Mexican', 'Italian', 'French', 'American', 'British',
];

// ── TheMealDB API helpers ─────────────────────────────────────────────────────

interface MealSummary { idMeal: string; strMeal: string; }
interface MealDetail {
  idMeal: string;
  strMeal: string;
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strMealThumb: string;
  strTags: string | null;
  strYoutube: string;
  [key: string]: string | null; // strIngredient1..20, strMeasure1..20
}

async function fetchAreas(): Promise<string[]> {
  const r = await fetch(`${MEALDB_BASE}/list.php?a=list`);
  const j = await r.json() as { meals: { strArea: string }[] };
  return (j.meals ?? []).map(m => m.strArea);
}

async function fetchMealsByArea(area: string): Promise<MealSummary[]> {
  const r = await fetch(`${MEALDB_BASE}/filter.php?a=${encodeURIComponent(area)}`);
  const j = await r.json() as { meals: MealSummary[] | null };
  return j.meals ?? [];
}

async function fetchMealDetail(id: string): Promise<MealDetail | null> {
  const r = await fetch(`${MEALDB_BASE}/lookup.php?i=${id}`);
  const j = await r.json() as { meals: MealDetail[] | null };
  return j.meals?.[0] ?? null;
}

function extractIngredients(meal: MealDetail): { name: string; measure: string }[] {
  const result: { name: string; measure: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    const measure = meal[`strMeasure${i}`]?.trim() ?? '';
    if (name) result.push({ name, measure });
  }
  return result;
}

// ── Gemini enrichment ─────────────────────────────────────────────────────────

interface EnrichedDish {
  title_zh: string;
  description_zh: string;
  description_en: string;
  main_ingredient: string;
  course_type: string;
  meal_type: string;
  flavor_tags: string[];
  health_benefit_tags: string[];
  seasonal_tag: string;
  is_vegan: boolean;
  origin_cuisine_override?: string; // only set if Gemini disagrees with area mapping
}

const MAIN_ING_VALUES = [
  'beef','chicken','pork','fish','shrimp','crab','squid','scallop','clam',
  'salmon','cod','seabass','hairtail','duck','lamb','egg','tofu','mushroom',
  'veggie','carb','dessert','other',
];
const COURSE_TYPES   = ['soup','main_protein','veggie_dish','staple','dessert'];
const MEAL_TYPES     = ['breakfast','lunch','dinner','all'];
const ORIGIN_VALUES  = ['cantonese','sichuan','jiangnan','northern','western','japanese_korean','southeast_asian'];
const FLAVOR_VALUES  = ['spicy','light','savory','sweet','sour','umami','seafood','aromatic'];
const HEALTH_VALUES  = ['maintain','lose_weight','muscle_gain','high_protein','low_sodium',
                        'low_sugar','low_purine','anti_aging','boost_immunity','damp_clear','detox'];
const SEASONAL_VALUES = ['All-Season/Balanced','Spring','Summer','Autumn','Winter'];

async function enrichBatch(meals: { detail: MealDetail; originCuisine: string }[]): Promise<(EnrichedDish | null)[]> {
  const items = meals.map(({ detail }, i) => {
    const ings = extractIngredients(detail).map(x => x.name).slice(0, 6).join(',');
    return `[${i}]"${detail.strMeal}"|${detail.strArea}|${detail.strCategory}|${ings}`;
  });

  const prompt = `中文菜谱专家。为以下${items.length}道菜生成JSON数组，每项字段：
title_zh(2-8字中文名)|description_zh(15字描述)|description_en(10字描述)|main_ingredient(${MAIN_ING_VALUES.join('/')})|course_type(${COURSE_TYPES.join('/')})|meal_type(${MEAL_TYPES.join('/')})|flavor_tags(从${FLAVOR_VALUES.join('/')}选1-2个数组)|health_benefit_tags(从${HEALTH_VALUES.join('/')}选1-2个数组)|seasonal_tag(${SEASONAL_VALUES.join('/')})|is_vegan(bool)|origin_cuisine_override(null或${ORIGIN_VALUES.join('/')})

菜品:
${items.join('\n')}

只返回JSON数组，无任何额外文字。`;

  let attempts = 0;
  while (attempts < 3) {
    try {
      const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
          },
        }),
      });
      const data = await resp.json() as any;
      let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === meals.length) {
        return parsed as EnrichedDish[];
      }
    } catch (e) {
      console.warn(`  Gemini attempt ${attempts + 1} failed:`, e);
    }
    attempts++;
    await sleep(2000);
  }
  return meals.map(() => null);
}

// ── Execution level (mirrors scripts/tag-execution-level.ts logic) ───────────

const LEVEL1_TITLE = [
  '清蒸','蒸','白切','白灼','凉拌','拌','煮','水煮','卤','炖','焖',
  '盐水','白斩','粥','汤','steam','boil','poach','stew','slow cook',
];
const LEVEL3_TITLE = [
  '红烧','麻婆','回锅','爆炒','干煸','鱼香','夫妻','水煮鱼','酸菜鱼',
  '剁椒','铁板','东坡','狮子头','梅菜扣','糖醋','锅包肉','粉蒸','扣肉',
  '炸','油炸','脆皮','crispy','deep fry','deep-fry',
];

function calcExecutionLevel(row: {
  title_zh?: string; title_en?: string;
  course_type?: string; main_ingredient?: string; flavor_tags?: string[];
}): number {
  const title = ((row.title_zh ?? '') + ' ' + (row.title_en ?? '')).toLowerCase();
  if (LEVEL1_TITLE.some(kw => title.includes(kw))) return 1;
  if (LEVEL3_TITLE.some(kw => title.includes(kw))) return 3;
  if ((row.flavor_tags ?? []).includes('spicy') && row.course_type === 'main_protein') return 3;
  if (['beef','lamb'].includes(row.main_ingredient ?? '') && row.course_type === 'main_protein') return 3;
  if (row.main_ingredient === 'egg') return 1;
  if (['soup','staple','dessert'].includes(row.course_type ?? '')) return 1;
  return 2;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getExistingTitles(db: pg.Client): Promise<Set<string>> {
  const { rows } = await db.query(`SELECT LOWER(title_en) as t FROM dishes`);
  return new Set(rows.map((r: any) => r.t as string));
}

async function upsertDishes(db: pg.Client, rows: any[]): Promise<number> {
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
        row.image_url, row.is_vegan, row.execution_level,
      ]);
      inserted++;
    } catch (e: any) {
      console.warn(`  ⚠ skip ${row.title_en}: ${e.message}`);
    }
  }
  return inserted;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  if (!DRY_RUN) await db.connect();

  console.log('🍽  TheMealDB → Supabase 导入器');
  console.log(`   模式: ${DRY_RUN ? 'DRY-RUN (不写库)' : '写入数据库'}`);
  console.log(`   上限: ${LIMIT === Infinity ? '无限制' : LIMIT + ' 道'}`);
  if (AREA_ARG) console.log(`   只处理: ${AREA_ARG}`);
  console.log('');

  // Get existing titles to skip duplicates
  const existingTitles = DRY_RUN ? new Set<string>() : await getExistingTitles(db);
  console.log(`📦 现有菜品: ${existingTitles.size} 道\n`);

  // Determine which areas to process
  const allAreas = await fetchAreas();
  let areas = PRIORITY_AREAS.filter(a => allAreas.includes(a));
  if (AREA_ARG) areas = [AREA_ARG];

  let totalImported = 0;
  let totalSkipped  = 0;
  let totalFailed   = 0;

  for (const area of areas) {
    if (totalImported >= LIMIT) break;

    const originCuisine = AREA_MAP[area] ?? 'western';
    console.log(`\n🌍 处理菜系: ${area} → ${originCuisine}`);

    const summaries = await fetchMealsByArea(area);
    console.log(`   找到 ${summaries.length} 道菜`);

    // Fetch full details, skip already-imported
    const pending: { detail: MealDetail; originCuisine: string }[] = [];
    for (const s of summaries) {
      if (totalImported + pending.length >= LIMIT) break;
      if (existingTitles.has(s.strMeal.toLowerCase())) {
        totalSkipped++;
        continue;
      }
      const detail = await fetchMealDetail(s.idMeal);
      if (!detail) continue;
      await sleep(200); // gentle rate limit
      pending.push({ detail, originCuisine });
    }

    if (pending.length === 0) {
      console.log(`   ⏩ 全部已存在，跳过`);
      continue;
    }

    console.log(`   待导入: ${pending.length} 道`);

    // Process in batches
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      process.stdout.write(`   Gemini 批次 ${Math.floor(i/BATCH)+1}/${Math.ceil(pending.length/BATCH)} (${batch.length}道)...`);

      const enriched = await enrichBatch(batch);

      const rows: any[] = [];
      for (let j = 0; j < batch.length; j++) {
        const e = enriched[j];
        const { detail } = batch[j];
        if (!e) { totalFailed++; continue; }

        // Sanitise
        const baseRow = {
          title_zh:           e.title_zh?.slice(0, 50) || detail.strMeal,
          title_en:           detail.strMeal,
          meal_type:          MEAL_TYPES.includes(e.meal_type) ? e.meal_type : 'dinner',
          origin_cuisine:     (e.origin_cuisine_override && ORIGIN_VALUES.includes(e.origin_cuisine_override))
                                ? e.origin_cuisine_override
                                : originCuisine,
          main_ingredient:    MAIN_ING_VALUES.includes(e.main_ingredient) ? e.main_ingredient : 'other',
          course_type:        COURSE_TYPES.includes(e.course_type) ? e.course_type : 'main_protein',
          flavor_tags:        (e.flavor_tags ?? []).filter((t: string) => FLAVOR_VALUES.includes(t)),
          health_benefit_tags:(e.health_benefit_tags ?? []).filter((t: string) => HEALTH_VALUES.includes(t)),
          seasonal_tag:       SEASONAL_VALUES.includes(e.seasonal_tag) ? e.seasonal_tag : 'All-Season/Balanced',
          description_zh:     e.description_zh?.slice(0, 200) || '',
          description_en:     e.description_en?.slice(0, 200) || '',
          image_url:          detail.strMealThumb || null,
          is_vegan:           !!e.is_vegan,
        };
        const row = { ...baseRow, execution_level: calcExecutionLevel(baseRow) };

        if (DRY_RUN) {
          console.log(`\n     [DRY] ${row.title_en} → ${row.title_zh} | ${row.origin_cuisine} | ${row.main_ingredient}`);
        } else {
          rows.push(row);
          existingTitles.add(row.title_en.toLowerCase());
        }
      }

      if (!DRY_RUN && rows.length > 0) {
        const n = await upsertDishes(db, rows);
        totalImported += n;
        console.log(` ✅ +${n}`);
      } else if (DRY_RUN) {
        totalImported += batch.length;
      } else {
        console.log(' (0 新增)');
      }

      if (i + BATCH < pending.length) await sleep(PAUSE_MS);
    }
  }

  if (!DRY_RUN) await db.end();

  console.log('\n══════════════════════════════');
  console.log(`✅ 导入完成`);
  console.log(`   新增: ${totalImported} 道`);
  console.log(`   跳过(已存在): ${totalSkipped} 道`);
  console.log(`   失败: ${totalFailed} 道`);
}

main().catch(e => { console.error(e); process.exit(1); });
