/**
 * TICKET-085 真因追查 — Phase 1 证伪了"DB dup image_url"假设。
 * 真因候选: src/lib/dishImageFallback.ts 把 dish.id 哈希到固定 Unsplash 池，
 * 池只有 3-6 张图 → 多道 NULL image_url 的菜 hash 撞同图 → UI 显错配。
 *
 * 本脚本: 拉这 4 道菜 + 全表 NULL image_url 的菜元数据，本地复现 fallback 路径，
 * 看哪几道菜会被 hash 到同一张 Unsplash 图。
 */

import pg from 'pg';
import { config } from 'dotenv';
import { getFallbackImage } from '../src/lib/dishImageFallback';

config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();

  // 4 道老板真测发现错配的菜
  console.log('\n========== 4 道真测菜的 fallback 解析 ==========');
  const q1 = await client.query(`
    SELECT id, title_zh, image_url, flavor_tags, origin_cuisine, seasonal_tag
    FROM dishes
    WHERE title_zh IN ('酸辣粉','红枣炖排骨','香辣蟹','雪菜肉丝面')
    ORDER BY title_zh
  `);
  for (const r of q1.rows) {
    const fb = getFallbackImage({
      id: r.id,
      flavor_tags: r.flavor_tags,
      origin_cuisine: r.origin_cuisine,
      seasonal_tag: r.seasonal_tag,
    });
    console.log(`  - ${r.title_zh}`);
    console.log(`     id=${r.id}`);
    console.log(`     flavor_tags=${JSON.stringify(r.flavor_tags)}  origin_cuisine=${r.origin_cuisine}  seasonal_tag=${r.seasonal_tag}`);
    console.log(`     stored image_url=${r.image_url ?? '(NULL)'}`);
    console.log(`     fallback would pick → ${fb}`);
  }

  // 全表 NULL image_url 的菜, 跑一遍 fallback, 看哪几张图被多次选中
  console.log('\n========== 全表 NULL image_url 的菜 fallback 撞图分析 ==========');
  const q2 = await client.query(`
    SELECT id, title_zh, flavor_tags, origin_cuisine, seasonal_tag
    FROM dishes
    WHERE image_url IS NULL
  `);
  console.log(`NULL image_url 菜数: ${q2.rows.length}`);
  const hitMap = new Map<string, string[]>();
  for (const r of q2.rows) {
    const fb = getFallbackImage({
      id: r.id,
      flavor_tags: r.flavor_tags,
      origin_cuisine: r.origin_cuisine,
      seasonal_tag: r.seasonal_tag,
    });
    if (!hitMap.has(fb)) hitMap.set(fb, []);
    hitMap.get(fb)!.push(r.title_zh);
  }
  // 按"同图被多少道菜共用"倒排
  const ranked = [...hitMap.entries()].sort((a, b) => b[1].length - a[1].length);
  let dupGroups = 0;
  for (const [url, titles] of ranked) {
    if (titles.length > 1) {
      dupGroups++;
      console.log(`  ✗ ${titles.length} 道菜共用 fallback url=${url}`);
      console.log(`     dishes: ${titles.slice(0, 12).join(' / ')}${titles.length > 12 ? ` ...+${titles.length - 12} 道` : ''}`);
    }
  }
  console.log(`\n共 ${dupGroups} 组 fallback 撞图（同图≥2 道）`);
  console.log(`单图 fallback 数（独占）: ${ranked.filter(([, t]) => t.length === 1).length}`);
  console.log(`fallback 池总图数: ${ranked.length}`);

  await client.end();
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
