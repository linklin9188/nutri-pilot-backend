/**
 * 100道净食（素食/佛教友好）菜单生成 + 导入
 *
 * 原则：
 *  - 纯素 / 无肉无蛋（部分素食可含蛋，但无肉腥）
 *  - 家常可做、工艺不复杂
 *  - 含中式素菜、西式素食、早餐全素
 *  - is_vegan = true
 *
 * Run:
 *   npx tsx scripts/import-vegan-dishes.ts --dry-run   # 先验证20道
 *   npx tsx scripts/import-vegan-dishes.ts             # 全量100道
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const db = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DRY_RUN    = process.argv.includes('--dry-run');
const BATCH_SIZE = 10;

// ── 100道净食菜单 ────────────────────────────────────────────────────────────
// [title_zh, title_en, meal_type, cuisine_hint]
type RawDish = [string, string, 'breakfast'|'lunch'|'dinner'|'all', 'chinese'|'western'];

const VEGAN_DISHES: RawDish[] = [
  // ── 中式素菜 · 热炒 (30道) ──────────────────────────────────────────────
  ['素炒三丝',       'Stir-fried Three Shreds',             'dinner','chinese'],
  ['清炒荷兰豆',     'Stir-fried Snow Peas',                'dinner','chinese'],
  ['蒜蓉炒菠菜',     'Garlic Spinach',                      'dinner','chinese'],
  ['手撕杏鲍菇',     'Hand-torn King Oyster Mushroom',      'dinner','chinese'],
  ['豆豉炒苦瓜',     'Bitter Melon with Black Bean Sauce',  'dinner','chinese'],
  ['醋溜白菜',       'Sweet & Sour Cabbage',                'dinner','chinese'],
  ['红烧豆腐',       'Braised Tofu',                        'dinner','chinese'],
  ['锅塌豆腐',       'Pan-fried Braised Tofu',              'dinner','chinese'],
  ['干煸豆角',       'Dry-fried String Beans',              'dinner','chinese'],
  ['素烧茄子',       'Vegan Braised Eggplant',              'dinner','chinese'],
  ['清炒莴笋',       'Stir-fried Lettuce Stem',             'dinner','chinese'],
  ['蒜泥拌黄瓜',     'Smashed Cucumber with Garlic',        'dinner','chinese'],
  ['凉拌豆腐丝',     'Cold Tofu Strips Salad',              'dinner','chinese'],
  ['素蚝油生菜',     'Lettuce with Vegan Oyster Sauce',     'dinner','chinese'],
  ['香煎南瓜饼',     'Pan-fried Pumpkin Cake',              'dinner','chinese'],
  ['油焖笋',         'Braised Bamboo Shoots',               'dinner','chinese'],
  ['虎皮辣椒',       'Tiger-skin Peppers',                  'dinner','chinese'],
  ['蒸南瓜',         'Steamed Pumpkin',                     'dinner','chinese'],
  ['素炒藕片',       'Stir-fried Lotus Root',               'dinner','chinese'],
  ['凉拌粉皮',       'Cold Mung Bean Sheet Jelly',          'dinner','chinese'],
  ['素炒木耳山药',   'Black Fungus & Yam Stir-fry',         'dinner','chinese'],
  ['番茄炖豆腐',     'Tomato Braised Tofu',                 'dinner','chinese'],
  ['素炒杂蔬',       'Mixed Vegetable Stir-fry',            'dinner','chinese'],
  ['蒜香西兰花',     'Garlic Broccoli',                     'dinner','chinese'],
  ['清炒四季豆',     'Stir-fried French Beans',             'dinner','chinese'],
  ['蒸冬瓜',         'Steamed Winter Melon',                'dinner','chinese'],
  ['香菇豆腐羹',     'Mushroom & Tofu Soup',                'dinner','chinese'],
  ['素酸辣汤',       'Vegan Hot & Sour Soup',               'dinner','chinese'],
  ['豆芽炒韭菜',     'Bean Sprouts with Chives',            'dinner','chinese'],
  ['椒盐蘑菇',       'Salt & Pepper Mushrooms',             'dinner','chinese'],

  // ── 中式素菜 · 主食类 (15道) ───────────────────────────────────────────
  ['素饺子',         'Vegan Dumplings',                     'dinner','chinese'],
  ['素春卷',         'Vegetable Spring Rolls',              'dinner','chinese'],
  ['素炒米饭',       'Vegan Fried Rice',                    'dinner','chinese'],
  ['番茄素面',       'Tomato Noodles',                      'dinner','chinese'],
  ['素炸酱面',       'Vegan Zhajiang Noodles',              'dinner','chinese'],
  ['南瓜米粥',       'Pumpkin Rice Porridge',               'dinner','chinese'],
  ['杂粮饭',         'Multigrain Rice',                     'dinner','chinese'],
  ['素汤圆',         'Sweet Rice Balls',                    'dinner','chinese'],
  ['红枣黑米粥',     'Red Date & Black Rice Porridge',      'dinner','chinese'],
  ['素包子',         'Vegan Steamed Buns',                  'dinner','chinese'],
  ['香菇蔬菜粥',     'Mushroom Vegetable Congee',           'dinner','chinese'],
  ['素水煮',         'Vegan Spicy Poached Vegetables',      'dinner','chinese'],
  ['红薯饭',         'Sweet Potato Rice',                   'dinner','chinese'],
  ['荷叶蒸饭',       'Lotus Leaf Steamed Rice',             'dinner','chinese'],
  ['素菜锅贴',       'Vegetable Pan-fried Dumplings',       'dinner','chinese'],

  // ── 中式素早餐 (15道) ──────────────────────────────────────────────────
  ['素粥配咸菜',     'Plain Congee with Pickled Vegetables','breakfast','chinese'],
  ['全素豆浆',       'Unsweetened Soy Milk',                'breakfast','chinese'],
  ['花生芝麻糊',     'Peanut & Sesame Paste',               'breakfast','chinese'],
  ['素菜煎饼',       'Vegetable Savory Crepe',              'breakfast','chinese'],
  ['红糖馒头',       'Brown Sugar Steamed Bun',             'breakfast','chinese'],
  ['蒸芋头',         'Steamed Taro',                        'breakfast','chinese'],
  ['薏米红枣粥',     'Barley & Red Date Porridge',          'breakfast','chinese'],
  ['核桃黑芝麻糊',   'Walnut & Black Sesame Paste',         'breakfast','chinese'],
  ['素月牙饺',       'Vegan Crescent Dumplings',            'breakfast','chinese'],
  ['燕麦豆浆',       'Oat Soy Milk',                       'breakfast','chinese'],
  ['糯米藕',         'Sticky Rice Stuffed Lotus Root',      'breakfast','chinese'],
  ['蒸山药',         'Steamed Chinese Yam',                 'breakfast','chinese'],
  ['素菜盒子',       'Vegan Veggie Pastry',                 'breakfast','chinese'],
  ['玉米汁',         'Corn Juice',                          'breakfast','chinese'],
  ['紫薯粥',         'Purple Sweet Potato Porridge',        'breakfast','chinese'],

  // ── 西式素食 · 主菜 (20道) ────────────────────────────────────────────
  ['烤蔬菜拼盘',     'Roasted Vegetable Platter',           'dinner','western'],
  ['素咖喱',         'Vegan Vegetable Curry',               'dinner','western'],
  ['蘑菇奶油意面',   'Creamy Mushroom Pasta',               'dinner','western'],
  ['素比萨',         'Vegan Margherita Pizza',              'dinner','western'],
  ['希腊素食沙拉',   'Greek Vegan Salad',                   'dinner','western'],
  ['鹰嘴豆炖菜',     'Chickpea Stew',                       'dinner','western'],
  ['番茄罗勒意面',   'Tomato Basil Pasta',                  'dinner','western'],
  ['烤南瓜浓汤',     'Roasted Pumpkin Soup',                'dinner','western'],
  ['扁豆红汤',       'Red Lentil Soup',                     'dinner','western'],
  ['素食汉堡',       'Vegan Veggie Burger',                 'dinner','western'],
  ['烤西葫芦卷',     'Stuffed Zucchini Rolls',              'dinner','western'],
  ['法式蔬菜炖',     'Ratatouille',                         'dinner','western'],
  ['素食塔可',       'Vegan Bean Tacos',                    'dinner','western'],
  ['鳄梨酱配薄脆',   'Guacamole & Tortilla Chips',          'dinner','western'],
  ['菠菜豆腐馅饼',   'Spinach Tofu Quiche',                 'dinner','western'],
  ['烤花椰菜',       'Roasted Cauliflower',                 'dinner','western'],
  ['藜麦蔬菜碗',     'Quinoa Veggie Bowl',                  'dinner','western'],
  ['素食千层面',     'Vegan Lasagna',                       'dinner','western'],
  ['番茄鹰嘴豆饭',   'Tomato Chickpea Rice',                'dinner','western'],
  ['烤甜椒塞饭',     'Stuffed Bell Peppers with Rice',      'dinner','western'],

  // ── 西式素早餐 (10道) ────────────────────────────────────────────────
  ['纯素燕麦粥',     'Vegan Oatmeal',                      'breakfast','western'],
  ['椰奶奇亚籽布丁', 'Coconut Chia Pudding',                'breakfast','western'],
  ['坚果能量球',     'Nut Energy Balls',                    'breakfast','western'],
  ['鳄梨多谷物吐司', 'Avocado Multigrain Toast',            'breakfast','western'],
  ['水果思慕雪碗',   'Fruit Smoothie Bowl',                 'breakfast','western'],
  ['全素格兰诺拉',   'Vegan Granola',                       'breakfast','western'],
  ['香蕉燕麦松饼',   'Banana Oat Pancakes',                 'breakfast','western'],
  ['蓝莓豆奶昔',     'Blueberry Soy Smoothie',             'breakfast','western'],
  ['素食三明治',     'Vegan Veggie Sandwich',               'breakfast','western'],
  ['枫糖华夫饼',     'Maple Syrup Waffles',                 'breakfast','western'],
];

// ── Gemini enrichment ───────────────────────────────────────────────────────
interface EnrichedDish {
  title_zh: string;
  title_en: string;
  meal_type: string;
  origin_cuisine: string;
  flavor_tags: string[];
  health_benefit_tags: string[];
  main_ingredient: string;
  seasonal_tag: string;
  description_zh: string;
  description_en: string;
}

const VALID_FLAVOR  = new Set(['light','spicy','sweet','salty','sour','seafood','veggie']);
const VALID_HEALTH  = new Set(['lose_weight','muscle_gain','maintain','detox','pregnancy','damp_clear','mood_boost','anti_inflammation','immunity','beauty']);

function sanitizeFlavors(tags: string[]): string[] {
  const ok = tags.filter(t => VALID_FLAVOR.has(t));
  return ok.length ? ok : ['light', 'veggie'];
}
function sanitizeHealth(tags: string[]): string[] {
  const ok = tags.filter(t => VALID_HEALTH.has(t));
  return ok.length ? ok : ['maintain'];
}

function buildPrompt(batch: RawDish[]): string {
  const list = batch.map(([zh, en, meal, style]) =>
    `- ${zh} (${en}) [meal:${meal}, style:${style}]`
  ).join('\n');

  return `You are a vegan culinary expert specializing in Buddhist-friendly and plant-based cooking.

All dishes below are VEGAN (no meat, fish, or animal products except soy milk/tofu).

For each dish, return a JSON array with EXACTLY these fields:
- title_zh: Chinese name as given
- origin_cuisine: one of [cantonese|sichuan|jiangnan|northern|western|japanese_korean|southeast_asian]
- flavor_tags: 1-3 from [light|spicy|sweet|salty|sour|veggie]
- health_benefit_tags: 1-3 from [lose_weight|muscle_gain|maintain|detox|mood_boost|anti_inflammation|immunity|beauty]
- main_ingredient: ONE of [veggie|tofu|mushroom|carb|dessert|other]
- seasonal_tag: one of [All-Season/Balanced|Spring|Summer|Autumn|Winter]
- description_zh: ≤15 Chinese characters, appetizing & highlighting vegan nature
- description_en: ≤20 English words, appetizing & highlighting plant-based benefits

Rules for vegan dishes:
- All must have "veggie" in flavor_tags
- Light soups/steamed → add "light"; spicy dishes → add "spicy"
- Breakfast items → health_benefit_tags include "maintain" or "immunity"
- Detox/salad/cleansing dishes → "detox" in health_benefit_tags
- Mood-lifting colorful dishes → "mood_boost"

Dishes:
${list}

Return ONLY a valid JSON array, no markdown.`;
}

async function enrichBatch(batch: RawDish[]): Promise<EnrichedDish[]> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(batch) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(JSON.stringify(json));
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  let parsed: any[] = [];
  try {
    parsed = JSON.parse(text.replace(/```json\n?/g,'').replace(/```/g,'').trim());
  } catch {
    console.warn('  ⚠ JSON parse failed');
  }

  return batch.map(([zh, en, meal, style], idx) => {
    const g = parsed[idx] ?? {};
    return {
      title_zh:            zh,
      title_en:            en,
      meal_type:           meal,
      origin_cuisine:      g.origin_cuisine ?? (style === 'western' ? 'western' : 'cantonese'),
      flavor_tags:         Array.isArray(g.flavor_tags) ? g.flavor_tags : ['light','veggie'],
      health_benefit_tags: Array.isArray(g.health_benefit_tags) ? g.health_benefit_tags : ['maintain'],
      main_ingredient:     g.main_ingredient ?? 'veggie',
      seasonal_tag:        g.seasonal_tag ?? 'All-Season/Balanced',
      description_zh:      g.description_zh ?? '',
      description_en:      g.description_en ?? '',
    };
  });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  // DRY RUN: only process first 20 dishes
  const dishesToProcess = DRY_RUN ? VEGAN_DISHES.slice(0, 20) : VEGAN_DISHES;

  console.log(`\n🌿 Nutri-Pilot 净食菜单生成`);
  console.log(`   ${dishesToProcess.length} 道净食菜 · batch=${BATCH_SIZE} · dry-run=${DRY_RUN}\n`);

  const batches = chunk(dishesToProcess, BATCH_SIZE);
  const allEnriched: EnrichedDish[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  [${i+1}/${batches.length}] ${batch[0][0]} … `);
    try {
      const enriched = await enrichBatch(batch);
      allEnriched.push(...enriched);
      console.log(`✅ (${enriched.length} dishes)`);
    } catch (err: any) {
      console.warn(`⚠ ${err?.message?.slice(0, 120)}`);
      batch.forEach(([zh, en, meal]) => allEnriched.push({
        title_zh: zh, title_en: en, meal_type: meal,
        origin_cuisine: 'cantonese', flavor_tags: ['light','veggie'],
        health_benefit_tags: ['maintain'], main_ingredient: 'veggie',
        seasonal_tag: 'All-Season/Balanced', description_zh: '', description_en: '',
      }));
    }
    if (i < batches.length - 1) await new Promise(r => setTimeout(r, 1100));
  }

  console.log(`\n📊 分类完成: ${allEnriched.length} 道净食菜`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 前3道:');
    allEnriched.slice(0, 3).forEach(d => console.log(JSON.stringify(d, null, 2)));
    return;
  }

  // ── Write to DB ────────────────────────────────────────────────────────────
  await db.connect();
  console.log('\n🔗 Connected to DB');

  let inserted = 0, skipped = 0;
  for (const d of allEnriched) {
    try {
      // Skip if already exists (title_zh dedup)
      const { rowCount: exists } = await db.query(
        `SELECT 1 FROM dishes WHERE title_zh = $1`, [d.title_zh]
      );
      if (exists && exists > 0) { skipped++; continue; }

      await db.query(`
        INSERT INTO dishes
          (title_zh, title_en, meal_type, origin_cuisine,
           flavor_tags, health_benefit_tags, main_ingredient,
           seasonal_tag, description_zh, description_en, image_url, is_vegan)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'',true)
      `, [
        d.title_zh, d.title_en, d.meal_type, d.origin_cuisine,
        sanitizeFlavors(d.flavor_tags),
        sanitizeHealth(d.health_benefit_tags),
        d.main_ingredient, d.seasonal_tag, d.description_zh, d.description_en,
      ]);
      inserted++;
    } catch (err: any) {
      console.warn(`  ⚠ Insert failed for ${d.title_zh}: ${err?.message?.slice(0,80)}`);
    }
  }

  console.log(`✅ Inserted ${inserted} / Skipped ${skipped} / Total ${allEnriched.length} vegan dishes`);

  const { rows: summary } = await db.query(`
    SELECT meal_type, COUNT(*)::int AS cnt
    FROM dishes WHERE is_vegan = true
    GROUP BY meal_type ORDER BY cnt DESC
  `);
  console.log('\n📊 净食菜 by meal_type:');
  summary.forEach(r => console.log(`   ${(r.meal_type ?? 'null').padEnd(12)} ${r.cnt}`));

  await db.end();
  console.log('\n🌿 净食菜单导入完成！');
}

main().catch(err => { console.error(err); process.exit(1); });
