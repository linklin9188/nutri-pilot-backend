/**
 * seed-ticket-093-steamed.ts — TICKET-093 清蒸 protein 补全
 *
 * 给 Aieats DB 补 35 道清蒸菜，填清淡养胃 / 减脂 / 孕妇 / 老人路径空白。
 *
 * 现状：DB 含"蒸" 21 道，牛肉清蒸 0 / 豆腐清蒸 0 / 鸡禽 1 — 严重失衡。
 *
 * 35 道分组：
 *   🐟 海鲜清蒸 12
 *   🐔 鸡禽清蒸 6
 *   🥩 牛肉清蒸 4
 *   🍳 蛋类清蒸 4 (course_type=staple)
 *   🥡 豆腐清蒸 5 (is_vegan=true)
 *   🐖 猪肉清蒸 4
 *
 * 后续 pipeline 跑：
 *   1. npx tsx scripts/gen-dish-steps-claude.ts
 *   2. npx tsx scripts/backfill-dish-atomic-nutrition.ts
 *   3. npx tsx scripts/gen-dish-images.ts --source=ticket-093-steamed-protein --limit=35
 *
 * Run:
 *   npx tsx scripts/seed-ticket-093-steamed.ts          # 实际写入
 *   npx tsx scripts/seed-ticket-093-steamed.ts --dry    # 只打印
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const DRY = process.argv.includes('--dry');
const SOURCE = 'ticket-093-steamed-protein';

interface Dish {
  title_zh: string;
  main_ingredient: string;
  origin_cuisine: string;
  course_type: 'main_protein' | 'staple';
  is_vegan: boolean;
}

const DISHES: Dish[] = [
  // 🐟 海鲜清蒸 12
  { title_zh: '清蒸黄鱼',   main_ingredient: 'fish',   origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸石斑',   main_ingredient: 'fish',   origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸鳕鱼',   main_ingredient: 'fish',   origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸多宝鱼', main_ingredient: 'fish',   origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸三文鱼', main_ingredient: 'salmon', origin_cuisine: 'japanese_korean', course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸基围虾', main_ingredient: 'shrimp', origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸大虾',   main_ingredient: 'shrimp', origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸鲍鱼',   main_ingredient: 'other',  origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸海参',   main_ingredient: 'other',  origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸鳗鱼',   main_ingredient: 'fish',   origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸花蛤',   main_ingredient: 'clam',   origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },
  { title_zh: '清蒸文蛤',   main_ingredient: 'clam',   origin_cuisine: 'cantonese',       course_type: 'main_protein', is_vegan: false },

  // 🐔 鸡禽清蒸 6
  { title_zh: '葱姜蒸鸡',   main_ingredient: 'chicken', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },
  { title_zh: '红枣蒸鸡',   main_ingredient: 'chicken', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },
  { title_zh: '板栗蒸鸡',   main_ingredient: 'chicken', origin_cuisine: 'jiangnan',  course_type: 'main_protein', is_vegan: false },
  { title_zh: '三杯蒸鸡',   main_ingredient: 'chicken', origin_cuisine: 'jiangnan',  course_type: 'main_protein', is_vegan: false },
  { title_zh: '香菇滑鸡',   main_ingredient: 'chicken', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },
  { title_zh: '葱姜蒸鸭',   main_ingredient: 'duck',    origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },

  // 🥩 牛肉清蒸 4
  { title_zh: '蒸滑牛肉',   main_ingredient: 'beef', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },
  { title_zh: '米粉蒸牛肉', main_ingredient: 'beef', origin_cuisine: 'sichuan',   course_type: 'main_protein', is_vegan: false },
  { title_zh: '香菇蒸牛肉', main_ingredient: 'beef', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },
  { title_zh: '红枣蒸牛肉', main_ingredient: 'beef', origin_cuisine: 'jiangnan',  course_type: 'main_protein', is_vegan: false },

  // 🍳 蛋类清蒸 4 (staple)
  { title_zh: '三色蒸蛋',   main_ingredient: 'egg', origin_cuisine: 'jiangnan',  course_type: 'staple', is_vegan: false },
  { title_zh: '蟹黄蒸蛋',   main_ingredient: 'egg', origin_cuisine: 'jiangnan',  course_type: 'staple', is_vegan: false },
  { title_zh: '虾仁蒸蛋',   main_ingredient: 'egg', origin_cuisine: 'cantonese', course_type: 'staple', is_vegan: false },
  { title_zh: '肉末蒸蛋',   main_ingredient: 'egg', origin_cuisine: 'sichuan',   course_type: 'staple', is_vegan: false },

  // 🥡 豆腐清蒸 5 (vegan)
  { title_zh: '鱼香蒸豆腐', main_ingredient: 'tofu', origin_cuisine: 'sichuan',   course_type: 'main_protein', is_vegan: true },
  { title_zh: '三鲜蒸豆腐', main_ingredient: 'tofu', origin_cuisine: 'jiangnan',  course_type: 'main_protein', is_vegan: true },
  { title_zh: '麻婆蒸豆腐', main_ingredient: 'tofu', origin_cuisine: 'sichuan',   course_type: 'main_protein', is_vegan: true },
  { title_zh: '肉末蒸豆腐', main_ingredient: 'tofu', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: true },
  { title_zh: '皮蛋蒸豆腐', main_ingredient: 'tofu', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: true },

  // 🐖 猪肉清蒸 4
  { title_zh: '梅菜扣肉',   main_ingredient: 'pork', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },
  { title_zh: '珍珠丸子',   main_ingredient: 'pork', origin_cuisine: 'jiangnan',  course_type: 'main_protein', is_vegan: false },
  { title_zh: '莲藕蒸排骨', main_ingredient: 'pork', origin_cuisine: 'cantonese', course_type: 'main_protein', is_vegan: false },
  { title_zh: '蒸狮子头',   main_ingredient: 'pork', origin_cuisine: 'jiangnan',  course_type: 'main_protein', is_vegan: false },
];

async function main() {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Seeding ${DISHES.length} TICKET-093 steamed-protein dishes...\n`);

  let inserted = 0;
  let skipped = 0;
  for (const d of DISHES) {
    // Idempotent: skip if title_zh already exists
    const { rows: existing } = await c.query<{ id: string; source: string | null }>(
      `SELECT id, source FROM dishes WHERE title_zh = $1 LIMIT 1`,
      [d.title_zh],
    );
    if (existing.length > 0) {
      console.log(`  ⏭  ${d.title_zh} (already exists id=${existing[0].id.slice(0, 8)}… source=${existing[0].source ?? 'NULL'})`);
      skipped++;
      continue;
    }
    if (DRY) {
      console.log(`  📝 [dry] ${d.title_zh} | ${d.main_ingredient} | ${d.origin_cuisine} | ${d.course_type} | vegan=${d.is_vegan}`);
      continue;
    }

    const { rows: ins } = await c.query<{ id: string }>(
      `INSERT INTO dishes (
         title_zh, main_ingredient,
         course_type, meal_type, origin_cuisine,
         is_vegan, source
       ) VALUES (
         $1, $2,
         $3, 'all', $4,
         $5, $6
       ) RETURNING id`,
      [d.title_zh, d.main_ingredient, d.course_type, d.origin_cuisine, d.is_vegan, SOURCE],
    );
    console.log(`  ✅ ${d.title_zh} (id=${ins[0].id.slice(0, 8)}…)`);
    inserted++;
  }

  const { rows: cnt } = await c.query<{ count: string }>(
    `SELECT COUNT(*) FROM dishes WHERE source = $1`,
    [SOURCE],
  );
  console.log(`\nFinal ${SOURCE} row count: ${cnt[0].count}`);
  console.log(`Inserted: ${inserted} | Skipped (already exist): ${skipped}`);
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
