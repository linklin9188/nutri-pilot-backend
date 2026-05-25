/**
 * TICKET-085 P0 — dishes 表 image_url 错配修复
 *
 * Phase 1: 实查
 *   Q1 — 4 道老板真测发现错配的菜 image_url
 *   Q2 — 全表找共用 image_url 的行（dup_count > 1）
 *   Q3 — 全表 image_url 填充率
 *
 * Phase 2: 修
 *   UPDATE dishes SET image_url = NULL WHERE image_url 在 Q2 dup 集合
 *   报告影响行数 + 受影响 dish title_zh 全列表（给 follow-up backlog 用）
 *
 * 用法: npx tsx scripts/ticket085-image-dedupe.ts
 *
 * 注: 本脚本只做 Phase 1/2 的 SQL 执行 + 报告打印；migration 文件单独写到
 *     supabase/migrations/099_dishes_image_dedupe.sql 保留版本化痕迹。
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log('🔗 Connected to Supabase PostgreSQL');

  // ── Phase 1 Q1 ──────────────────────────────────────────────────────────
  console.log('\n========== Phase 1 Q1: 4 道老板真测发现的菜 ==========');
  const q1 = await client.query(`
    SELECT id, title_zh, image_url
    FROM dishes
    WHERE title_zh IN ('酸辣粉','红枣炖排骨','香辣蟹','雪菜肉丝面')
    ORDER BY title_zh
  `);
  console.log(`rows: ${q1.rows.length}`);
  for (const r of q1.rows) {
    console.log(`  - [${r.id}] ${r.title_zh}  →  ${r.image_url ?? '(NULL)'}`);
  }

  // ── Phase 1 Q2 ──────────────────────────────────────────────────────────
  console.log('\n========== Phase 1 Q2: 全表共用 image_url（dup_count>1） ==========');
  const q2 = await client.query(`
    SELECT image_url, COUNT(*)::int AS dup_count,
           array_agg(title_zh ORDER BY title_zh) AS dishes,
           array_agg(id::text ORDER BY title_zh) AS dish_ids
    FROM dishes
    WHERE image_url IS NOT NULL
    GROUP BY image_url
    HAVING COUNT(*) > 1
    ORDER BY dup_count DESC, image_url
  `);
  console.log(`共 ${q2.rows.length} 组 dup image_url`);
  let totalAffectedRows = 0;
  const affectedTitles: string[] = [];
  const affectedRecords: Array<{ id: string; title_zh: string; image_url: string }> = [];
  for (const r of q2.rows) {
    totalAffectedRows += r.dup_count;
    console.log(`  × ${r.dup_count} 行  url=${r.image_url}`);
    console.log(`     dishes: ${r.dishes.join(' / ')}`);
    for (let i = 0; i < r.dishes.length; i++) {
      affectedTitles.push(r.dishes[i]);
      affectedRecords.push({
        id: r.dish_ids[i],
        title_zh: r.dishes[i],
        image_url: r.image_url,
      });
    }
  }
  console.log(`受影响行数（待清空）: ${totalAffectedRows}`);

  // ── Phase 1 Q3 ──────────────────────────────────────────────────────────
  console.log('\n========== Phase 1 Q3: 全表 image_url 填充率 ==========');
  const q3 = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(image_url)::int AS with_image,
           (COUNT(*) - COUNT(image_url))::int AS no_image
    FROM dishes
  `);
  console.log(q3.rows[0]);

  // ── Phase 2 UPDATE ──────────────────────────────────────────────────────
  console.log('\n========== Phase 2: UPDATE dup image_url → NULL ==========');
  const upd = await client.query(`
    WITH dup_imgs AS (
      SELECT image_url FROM dishes
      WHERE image_url IS NOT NULL
      GROUP BY image_url
      HAVING COUNT(*) > 1
    )
    UPDATE dishes SET image_url = NULL
    WHERE image_url IN (SELECT image_url FROM dup_imgs)
    RETURNING id, title_zh
  `);
  console.log(`UPDATE 影响行数: ${upd.rowCount}`);

  // ── Phase 1 Q1 verify after fix ─────────────────────────────────────────
  console.log('\n========== verify: 4 道真测菜修后 image_url ==========');
  const v = await client.query(`
    SELECT id, title_zh, image_url
    FROM dishes
    WHERE title_zh IN ('酸辣粉','红枣炖排骨','香辣蟹','雪菜肉丝面')
    ORDER BY title_zh
  `);
  for (const r of v.rows) {
    console.log(`  - ${r.title_zh}  →  ${r.image_url ?? '(NULL ✓)'}`);
  }

  // ── verify: 应无剩余 dup ───────────────────────────────────────────────
  const remain = await client.query(`
    SELECT COUNT(*)::int AS dup_groups
    FROM (
      SELECT image_url FROM dishes
      WHERE image_url IS NOT NULL
      GROUP BY image_url
      HAVING COUNT(*) > 1
    ) t
  `);
  console.log(`修后残留 dup 组数: ${remain.rows[0].dup_groups}（应=0）`);

  // ── 输出 follow-up backlog 列表 ─────────────────────────────────────────
  console.log('\n========== 受影响 dish 列表（写入 docs/qa/ backlog） ==========');
  console.log(`总计 ${affectedRecords.length} 条`);
  console.log('---BEGIN_JSON---');
  console.log(JSON.stringify(affectedRecords, null, 2));
  console.log('---END_JSON---');

  await client.end();
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
