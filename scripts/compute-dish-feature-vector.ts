/**
 * compute-dish-feature-vector.ts — 预计算所有 dishes.feature_vector
 *
 * TICKET-034 (SPEC §0.3 嵌入向量基础)
 *
 * 读 dishes 表所有行, 对每行算 dishToVector(dish) (20 维 manual),
 * 批量 UPDATE 写回 dishes.feature_vector.
 *
 * 用法:
 *   npx tsx scripts/compute-dish-feature-vector.ts [--force] [--limit N] [--dry-run]
 *
 * 标志:
 *   --force    重算已有 feature_vector 的行 (默认只算 NULL 的)
 *   --limit N  最多处理 N 行
 *   --dry-run  只打印不写 DB
 */
import pg from 'pg';
import { config } from 'dotenv';
import { dishToVector, type DishLike } from '../src/lib/recommendVector';

config();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) return 'true';
  return v;
}

const FORCE   = arg('force') === 'true';
const DRY_RUN = arg('dry-run') === 'true';
const LIMIT   = arg('limit') ? parseInt(arg('limit')!, 10) : undefined;

interface DishRow extends DishLike {
  id: string;
  flavor_tags?: string[] | null;
}

// dishes 表没有 spice_level 列, 从 flavor_tags 推断:
//   含 'spicy' → 1.0 (重辣) ; 含 'mild' → 0.3 ; 默认 0
function spiceFromFlavorTags(tags: string[] | null | undefined): number {
  if (!tags || tags.length === 0) return 0;
  const set = new Set(tags.map(t => String(t).toLowerCase()));
  if (set.has('very_spicy') || set.has('hot')) return 1.0;
  if (set.has('spicy')) return 0.8;
  if (set.has('medium_spicy')) return 0.6;
  if (set.has('mild') || set.has('mild_spicy')) return 0.3;
  return 0;
}

(async () => {
  const conn = process.env.DIRECT_DATABASE_URL;
  if (!conn) {
    console.error('Missing DIRECT_DATABASE_URL in .env');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const where = FORCE ? `TRUE` : `feature_vector IS NULL`;
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : '';

  const { rows } = await client.query<DishRow>(`
    SELECT id, title_zh, title_en, origin_cuisine,
           main_ingredient, cook_method, cooking_method, flavor_tags
    FROM dishes
    WHERE ${where}
    ORDER BY id
    ${limitSql}
  `);

  console.log(`[plan] ${rows.length} dish(es) to compute · force=${FORCE} · dry-run=${DRY_RUN}`);
  if (rows.length === 0) {
    await client.end();
    return;
  }

  if (DRY_RUN) {
    for (const r of rows.slice(0, 5)) {
      const dishWithSpice = { ...r, spice_level: spiceFromFlavorTags(r.flavor_tags) };
      const v = dishToVector(dishWithSpice);
      console.log(`\n${r.title_zh} (cuisine=${r.origin_cuisine} ing=${r.main_ingredient} method=${r.cook_method} flavor_tags=${JSON.stringify(r.flavor_tags)})`);
      console.log('  vector:', v.map(x => x.toFixed(2)).join(','));
    }
    if (rows.length > 5) console.log(`\n(... ${rows.length - 5} more)`);
    await client.end();
    return;
  }

  // 批量 update — 100 行/批
  const CHUNK = 100;
  let done = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await client.query('BEGIN');
    try {
      for (const row of slice) {
        const dishWithSpice = { ...row, spice_level: spiceFromFlavorTags(row.flavor_tags) };
        const vec = dishToVector(dishWithSpice);
        // numeric[] literal: '{0.1,0.2,...}'
        const lit = '{' + vec.map(x => x.toFixed(6)).join(',') + '}';
        await client.query(
          `UPDATE dishes SET feature_vector = $1::numeric[] WHERE id = $2`,
          [lit, row.id],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[chunk ${i / CHUNK + 1}] failed:`, e);
      throw e;
    }

    done += slice.length;
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Processing ${done}/${rows.length}... (${dt}s)`);
  }

  // verify 填充率
  const { rows: stats } = await client.query<{ total: number; filled: number }>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(feature_vector)::int AS filled
    FROM dishes
  `);
  const { total, filled } = stats[0];
  console.log(`\n[done] dishes.feature_vector fill rate: ${filled}/${total} = ${((filled / total) * 100).toFixed(1)}%`);

  await client.end();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
