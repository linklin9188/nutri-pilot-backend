/**
 * algo-coverage.ts — sanity-check the dish DB has enough breadth to support
 * the algorithm's regional / meal / course-type slot constraints.
 *
 * Prints a matrix per origin_cuisine × meal_type so we can see e.g.
 *   cantonese × breakfast = 12 rows  ← enough for 粤式 morning rotation
 *   sichuan   × breakfast = 1 row    ← gap, fallback to combo skill
 *
 * Run: npx ts-node scripts/algo-coverage.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  console.log('=== Origin x Meal coverage ===');
  const { rows: matrix } = await client.query(`
    SELECT origin_cuisine, meal_type, COUNT(*) as cnt
    FROM dishes
    GROUP BY origin_cuisine, meal_type
    ORDER BY origin_cuisine, meal_type
  `);
  matrix.forEach((r: any) => {
    console.log(` ${r.origin_cuisine || 'null'} × ${r.meal_type || 'null'}: ${r.cnt}`);
  });

  console.log('\n=== Origin x Course type ===');
  const { rows: ct } = await client.query(`
    SELECT origin_cuisine, course_type, COUNT(*) as cnt
    FROM dishes
    GROUP BY origin_cuisine, course_type
    ORDER BY origin_cuisine, course_type
  `);
  ct.forEach((r: any) => {
    console.log(` ${r.origin_cuisine || 'null'} × ${r.course_type || 'null'}: ${r.cnt}`);
  });

  console.log('\n=== Cook method distribution ===');
  const { rows: cm } = await client.query(`
    SELECT cook_method, COUNT(*) as cnt
    FROM dishes
    WHERE cook_method IS NOT NULL
    GROUP BY cook_method
    ORDER BY cnt DESC
  `);
  cm.forEach((r: any) => console.log(` ${r.cook_method}: ${r.cnt}`));

  console.log('\n=== Sample columns on a dish row ===');
  const { rows: cols } = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'dishes' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  cols.forEach((c: any) => console.log(` ${c.column_name}: ${c.data_type}`));

  console.log('\n=== Dish count by hometown bucket × meal_type (for fallback) ===');
  for (const bucket of ['cantonese', 'sichuan', 'jiangnan', 'northern']) {
    const { rows } = await client.query(`
      SELECT meal_type, COUNT(*) as cnt
      FROM dishes
      WHERE origin_cuisine = $1
      GROUP BY meal_type
    `, [bucket]);
    const summary = rows.map((r: any) => `${r.meal_type}=${r.cnt}`).join(' ');
    console.log(` ${bucket}: ${summary}`);
  }

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
