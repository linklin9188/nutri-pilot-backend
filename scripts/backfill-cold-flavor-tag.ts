/**
 * backfill-cold-flavor-tag.ts — append 'cold' to flavor_tags for dishes
 * that are semantically cold appetizers/salads but were missed by
 * banquet.ts isCold() (because course_type='staple'/'soup' bypasses the
 * title-keyword fallback, or because the title is English-only).
 *
 * isCold() short-circuits on `flavor_tags.includes('cold')` BEFORE the
 * staple/soup guard, so adding 'cold' to the array is the cleanest way
 * to bring these dishes into the banquet cold bucket without breaking
 * any other site that consumes course_type.
 *
 * Idempotent: a dish that already has 'cold' is skipped (no double-add).
 *
 * Usage:
 *   npx tsx scripts/backfill-cold-flavor-tag.ts --dry-run
 *   npx tsx scripts/backfill-cold-flavor-tag.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

// Authoritative list. Each entry is a (title_zh, expected_origin) tuple — the
// origin is just a sanity check so a future schema-renamed dish doesn't get
// the wrong tag.
const TARGETS: { title_zh: string; origin: string }[] = [
  { title_zh: '拌芹菜花生',          origin: 'northern' },
  { title_zh: '麻酱黄瓜',            origin: 'northern' },
  { title_zh: '棒棒虾沙拉',          origin: 'southeast_asian' },
  { title_zh: '泰式米粉沙拉',        origin: 'southeast_asian' },
  { title_zh: '越式三文鱼捞面',      origin: 'southeast_asian' },
  { title_zh: '越式牛肉米粉沙拉',    origin: 'southeast_asian' },
  { title_zh: '越式猪肉沙拉',        origin: 'southeast_asian' },
  { title_zh: '越式酸甜胡萝卜沙拉',  origin: 'southeast_asian' },
  { title_zh: '越式鲜虾捞面',        origin: 'southeast_asian' },
  { title_zh: '越式鸡肉沙拉',        origin: 'southeast_asian' },
  { title_zh: '美式土豆沙拉',        origin: 'western' },
  { title_zh: '通心粉冷沙拉',        origin: 'western' },
  { title_zh: '鹰嘴豆泥',            origin: 'western' },
];

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  let updated = 0, skipped = 0, missing = 0, originMismatch = 0;
  for (const t of TARGETS) {
    const { rows } = await c.query<{ id: string; title_zh: string; origin_cuisine: string | null; flavor_tags: string[] | null }>(
      `SELECT id, title_zh, origin_cuisine, flavor_tags
       FROM dishes WHERE title_zh = $1`,
      [t.title_zh]
    );
    if (rows.length === 0) {
      console.log(`  ✗ not found: ${t.title_zh}`);
      missing++;
      continue;
    }
    for (const r of rows) {
      if (r.origin_cuisine !== t.origin) {
        console.log(`  ⚠ origin mismatch on "${r.title_zh}": expected ${t.origin}, got ${r.origin_cuisine} — skip`);
        originMismatch++;
        continue;
      }
      const tags = r.flavor_tags ?? [];
      if (tags.includes('cold')) {
        console.log(`  · already cold: ${r.title_zh}`);
        skipped++;
        continue;
      }
      const newTags = [...tags, 'cold'];
      if (DRY_RUN) {
        console.log(`  [dry] would set ${r.title_zh}: ${JSON.stringify(tags)} → ${JSON.stringify(newTags)}`);
      } else {
        await c.query(`UPDATE dishes SET flavor_tags = $1 WHERE id = $2`, [newTags, r.id]);
        console.log(`  ✓ ${r.title_zh}: +cold (now ${JSON.stringify(newTags)})`);
      }
      updated++;
    }
  }
  console.log(`\n${DRY_RUN ? '[DRY] ' : ''}done. updated=${updated}, skipped=${skipped}, missing=${missing}, origin_mismatch=${originMismatch}`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
