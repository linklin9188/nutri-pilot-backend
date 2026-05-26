/**
 * _check-pending-093steamed.ts — pre/post-flight for TICKET-093 steamed batch.
 * Prints how many rows still need each pipeline step, scoped to the new source.
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const TARGET_SOURCE = 'ticket-093-steamed-protein';

async function main() {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const total_pending_nutri = await c.query(
    `SELECT COUNT(*) FROM dishes WHERE protein_g IS NULL OR fat_g IS NULL OR carb_g IS NULL
       OR calcium_mg IS NULL OR iron_mg IS NULL OR fiber_g IS NULL OR vitamin_c_mg IS NULL`,
  );
  const total_pending_steps = await c.query(
    `SELECT COUNT(*) FROM dishes WHERE prep_steps_json IS NULL`,
  );
  const total_pending_imgs = await c.query(
    `SELECT COUNT(*) FROM dishes WHERE image_url IS NULL OR image_url = ''`,
  );

  // Source = our seeded 34 + 梅菜扣肉 (curated)
  const our_set = await c.query(
    `SELECT id, title_zh, source,
       (prep_steps_json IS NOT NULL) AS has_steps,
       (protein_g IS NOT NULL AND fat_g IS NOT NULL AND carb_g IS NOT NULL
          AND calcium_mg IS NOT NULL AND iron_mg IS NOT NULL
          AND fiber_g IS NOT NULL AND vitamin_c_mg IS NOT NULL) AS has_nutri,
       (image_url IS NOT NULL AND image_url <> '') AS has_img
     FROM dishes
     WHERE source = $1 OR title_zh = '梅菜扣肉'
     ORDER BY title_zh`,
    [TARGET_SOURCE],
  );

  const missing_steps = our_set.rows.filter((r: any) => !r.has_steps).map((r: any) => r.title_zh);
  const missing_nutri = our_set.rows.filter((r: any) => !r.has_nutri).map((r: any) => r.title_zh);
  const missing_imgs  = our_set.rows.filter((r: any) => !r.has_img ).map((r: any) => r.title_zh);

  console.log(JSON.stringify({
    db_wide_pending: {
      nutrition: total_pending_nutri.rows[0].count,
      steps: total_pending_steps.rows[0].count,
      images: total_pending_imgs.rows[0].count,
    },
    our_35: {
      total: our_set.rows.length,
      steps_ok: our_set.rows.length - missing_steps.length,
      nutri_ok: our_set.rows.length - missing_nutri.length,
      img_ok:   our_set.rows.length - missing_imgs.length,
      missing_steps,
      missing_nutri,
      missing_imgs,
    },
  }, null, 2));
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
