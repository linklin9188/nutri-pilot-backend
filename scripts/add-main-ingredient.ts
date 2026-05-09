/**
 * Migration + Classification script
 * 1. Adds main_ingredient column to dishes table
 * 2. Classifies all dishes by keyword matching on title_zh
 * 3. Bulk-updates the DB
 *
 * Run: npx tsx scripts/add-main-ingredient.ts
 */

import pg from 'pg';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Ingredient classification rules ──────────────────────────────────────────
// Rules are checked in order; first match wins.
// Designed for the 悦小厨 dish corpus (Chinese food, health-oriented).

interface Rule { pattern: RegExp; ingredient: string }

const RULES: Rule[] = [
  // ── Seafood specifics (before generic fish/shrimp) ──────────────────────
  { pattern: /三文鱼|鲑鱼/,                                    ingredient: 'salmon'   },
  { pattern: /鳕鱼/,                                            ingredient: 'cod'      },
  { pattern: /鲈鱼/,                                            ingredient: 'seabass'  },
  { pattern: /带鱼/,                                            ingredient: 'hairtail' },
  { pattern: /东星斑|石斑|比目鱼|海鱼|清蒸鱼/,                 ingredient: 'fish'     },
  { pattern: /鱼(?!香茄|蛋|饼|丸|露|皮)/,                      ingredient: 'fish'     },
  { pattern: /扇贝/,                                            ingredient: 'scallop'  },
  { pattern: /花蛤|蛤蜊|花甲|蚌/,                              ingredient: 'clam'     },
  { pattern: /蟹|花蟹|青蟹|大闸蟹/,                            ingredient: 'crab'     },
  { pattern: /鱿鱼|墨鱼|章鱼|花枝/,                            ingredient: 'squid'    },
  { pattern: /虾仁|大虾|白灼虾|油焖虾|炒虾|蒸虾|爆虾|虾球|虾饺|虾(?!酱)/, ingredient: 'shrimp' },

  // ── Meat ────────────────────────────────────────────────────────────────
  { pattern: /牛腩|牛腱|牛肉|牛排|牛柳|牛河|肥牛|牛筋|牛肚/,  ingredient: 'beef'     },
  { pattern: /羊肉|羊排|孜然羊|葱爆羊/,                        ingredient: 'lamb'     },
  { pattern: /鸭腿|烤鸭|鸭肉|老鸭|香烤鸭/,                     ingredient: 'duck'     },
  { pattern: /凤爪|鸡腿|鸡翅|鸡胸|鸡丝|白斩鸡|黄焖鸡|口水鸡|海南鸡|沙姜鸡|辣子鸡|宫保鸡|沙嗲鸡|烤鸡|鸡肉|去骨鸡|走地鸡|清远鸡|土鸡(?!蛋)/, ingredient: 'chicken' },
  // Pork catch-all (after more specific meats)
  { pattern: /排骨|五花|梅花|肉丝|肉末|猪肚|猪蹄|叉烧|腊肉|回锅肉|粉蒸肉|猪肝|小炒肉|咸鱼.?肉|肉夹馍|肉排|瘦肉饼|煎肉|烤肉|肉碎|肉段|火腿|热狗|烤肠|腊味|猪/, ingredient: 'pork' },

  // ── Egg ─────────────────────────────────────────────────────────────────
  { pattern: /鸡蛋|荷包蛋|煎蛋|炒蛋|水煮蛋|蛋花|蛋饼|鹌鹑蛋|皮蛋|太阳蛋|蛋(?!糕|挞)/, ingredient: 'egg' },

  // ── Plant proteins ───────────────────────────────────────────────────────
  { pattern: /豆腐|豆干|腐皮|腐竹|豆脑/,                       ingredient: 'tofu'     },
  { pattern: /松茸|香菇|菌菇|姬松茸|金针菇|鸡枞|杂菌|菌(?!粉)/, ingredient: 'mushroom' },

  // ── Vegetables (broad catch-all) ─────────────────────────────────────────
  { pattern: /蔬菜|时蔬|白菜|生菜|芥蓝|菠菜|包菜|西兰花|娃娃菜|四季豆|茄子|南瓜|芦笋|花菜|木耳|通菜|韭菜|洋葱|土豆(?!泥)|萝卜(?!牛)|青椒|沙拉(?!肉|鸡)|手撕菜|油菜/, ingredient: 'veggie' },

  // ── Carb / noodle / rice mains ───────────────────────────────────────────
  { pattern: /米粉|河粉|炒粉|粿条|面(?!包)|馄饨|饺|炒饭|炒米|拌面|拌饭|寿司|披萨|三明治|卷饼|法棍|包子|馒头|煎饼|吐司|面包|米线|馒头|粥(?!肉|鸡|猪|牛|虾)/, ingredient: 'carb' },

  // ── Dessert / drink ──────────────────────────────────────────────────────
  { pattern: /曲奇|布朗尼|提拉米苏|酸奶|冰淇淋|燕麦饼干|苹果派|麦芬|豆浆|奶茶|冰咖啡|糕|汤圆|西米糕|红豆冰|珍多冰|杨枝甘露/, ingredient: 'dessert' },
];

function classify(titleZh: string): string {
  for (const rule of RULES) {
    if (rule.pattern.test(titleZh)) return rule.ingredient;
  }
  return 'other';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await client.connect();
  console.log('🔗 Connected');

  // 1. Add column if missing
  await client.query(`
    ALTER TABLE dishes
    ADD COLUMN IF NOT EXISTS main_ingredient TEXT DEFAULT 'other';
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS dishes_main_ingredient_idx ON dishes (main_ingredient);
  `);
  console.log('✅ Column main_ingredient ensured');

  // 2. Fetch all dishes
  const { rows } = await client.query<{ id: string; title_zh: string }>(
    'SELECT id, title_zh FROM dishes'
  );
  console.log(`📋 Classifying ${rows.length} dishes…`);

  // 3. Classify + batch update
  const buckets: Record<string, string[]> = {};
  for (const row of rows) {
    const ing = classify(row.title_zh);
    if (!buckets[ing]) buckets[ing] = [];
    buckets[ing].push(row.id);
  }

  for (const [ingredient, ids] of Object.entries(buckets)) {
    await client.query(
      `UPDATE dishes SET main_ingredient = $1 WHERE id = ANY($2::uuid[])`,
      [ingredient, ids]
    );
  }

  // 4. Summary
  const { rows: summary } = await client.query(`
    SELECT main_ingredient, COUNT(*)::int AS cnt
    FROM dishes
    GROUP BY main_ingredient
    ORDER BY cnt DESC;
  `);

  console.log('\n📊 Classification summary:');
  for (const r of summary) {
    console.log(`  ${r.main_ingredient.padEnd(14)} ${r.cnt} dishes`);
  }

  await client.end();
  console.log('\n✅ Done — DB updated');
}

main().catch(err => { console.error(err); process.exit(1); });
