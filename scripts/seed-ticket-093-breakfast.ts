/**
 * seed-ticket-093-breakfast.ts — TICKET-093 早餐 staple subtype 补全
 *
 * 给 Aieats DB 补 20 道早餐 staple 菜，填薯芋/杂豆/杂粮独立/加工 4 类空白。
 *
 * 现有 80 道早餐 staple 里 ~68% 是大米粥+小麦面食。其他 4 类（薯芋/
 * 杂豆/杂粮独立/加工）各只 3-5 道。算法 v70 已加 subtype dedup 但需真
 * 候选可 swap。
 *
 * 后续 pipeline 跑：
 *   1. npx tsx scripts/gen-dish-steps-claude.ts          (prep_steps + cook_steps)
 *   2. npx tsx scripts/backfill-dish-atomic-nutrition.ts (nutrition)
 *   3. npx tsx scripts/gen-dish-images.ts --source=ticket-093-breakfast-subtype --limit=20
 *
 * Run:
 *   npx tsx scripts/seed-ticket-093-breakfast.ts          # 实际写入
 *   npx tsx scripts/seed-ticket-093-breakfast.ts --dry    # 只打印
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const DRY = process.argv.includes('--dry');

interface Dish {
  title_zh: string;
  main_ingredient: string;
  origin_cuisine: string;
}

const DISHES: Dish[] = [
  // 🍠 薯芋类
  { title_zh: '蒸红薯',       main_ingredient: 'sweet_potato', origin_cuisine: 'northern' },
  { title_zh: '紫薯泥',       main_ingredient: 'sweet_potato', origin_cuisine: 'jiangnan' },
  { title_zh: '山药百合粥',   main_ingredient: 'yam',          origin_cuisine: 'jiangnan' },
  { title_zh: '烤红薯片',     main_ingredient: 'sweet_potato', origin_cuisine: 'northern' },
  { title_zh: '芋头西米露',   main_ingredient: 'taro',         origin_cuisine: 'cantonese' },

  // 🫘 杂豆类
  { title_zh: '红豆沙汤',     main_ingredient: 'red_bean',     origin_cuisine: 'cantonese' },
  { title_zh: '鹰嘴豆糊',     main_ingredient: 'chickpea',     origin_cuisine: 'western' },
  { title_zh: '五色豆粥',     main_ingredient: 'mixed_bean',   origin_cuisine: 'northern' },
  { title_zh: '扁豆糊',       main_ingredient: 'lentil',       origin_cuisine: 'sichuan' },
  { title_zh: '绿豆汤',       main_ingredient: 'mung_bean',    origin_cuisine: 'cantonese' },

  // 🌾 杂粮独立（非粥形态）
  { title_zh: '藜麦水果碗',   main_ingredient: 'quinoa',       origin_cuisine: 'western' },
  { title_zh: '荞麦面早餐版', main_ingredient: 'buckwheat',    origin_cuisine: 'japanese_korean' },
  { title_zh: '高粱粥',       main_ingredient: 'sorghum',      origin_cuisine: 'northern' },
  { title_zh: '玉米渣粥',     main_ingredient: 'corn',         origin_cuisine: 'northern' },
  { title_zh: '黑米饭团',     main_ingredient: 'black_rice',   origin_cuisine: 'japanese_korean' },

  // 🥖 加工主食
  { title_zh: '韩式炒年糕',   main_ingredient: 'rice_cake',    origin_cuisine: 'japanese_korean' },
  { title_zh: '红糖糍粑',     main_ingredient: 'mochi',        origin_cuisine: 'sichuan' },
  { title_zh: '凉皮',         main_ingredient: 'cold_noodle',  origin_cuisine: 'northwest' },
  { title_zh: '桂花年糕',     main_ingredient: 'rice_cake',    origin_cuisine: 'jiangnan' },
  { title_zh: '五行豆糕',     main_ingredient: 'mixed_grain',  origin_cuisine: 'jiangnan' },
];

async function main() {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Seeding ${DISHES.length} TICKET-093 breakfast staples...\n`);

  let inserted = 0;
  let skipped = 0;
  for (const d of DISHES) {
    // Skip if title_zh already exists (idempotent)
    const { rows: existing } = await c.query<{ id: string }>(
      `SELECT id FROM dishes WHERE title_zh = $1 LIMIT 1`,
      [d.title_zh],
    );
    if (existing.length > 0) {
      console.log(`  ⏭  ${d.title_zh} (already exists id=${existing[0].id.slice(0, 8)}...)`);
      skipped++;
      continue;
    }
    if (DRY) {
      console.log(`  📝 [dry] would insert: ${d.title_zh} | ${d.main_ingredient} | ${d.origin_cuisine}`);
      continue;
    }

    const { rows: ins } = await c.query<{ id: string }>(
      `INSERT INTO dishes (
         title_zh, main_ingredient,
         course_type, meal_type, origin_cuisine,
         is_vegan, source
       ) VALUES (
         $1, $2,
         'staple', 'breakfast', $3,
         true, 'ticket-093-breakfast-subtype'
       ) RETURNING id`,
      [d.title_zh, d.main_ingredient, d.origin_cuisine],
    );
    console.log(`  ✅ ${d.title_zh} (id=${ins[0].id.slice(0, 8)}...)`);
    inserted++;
  }

  // Confirm count
  const { rows: cnt } = await c.query<{ count: string }>(
    `SELECT COUNT(*) FROM dishes WHERE source='ticket-093-breakfast-subtype'`,
  );
  console.log(`\nFinal TICKET-093 row count: ${cnt[0].count}`);
  console.log(`Inserted: ${inserted} | Skipped (already exist): ${skipped}`);
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
