import pg from 'pg';
import { config } from 'dotenv';
config();
const c = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function main() {
  await c.connect();
  console.log('=== seasonal_tag distribution ===');
  const { rows: s } = await c.query(`SELECT seasonal_tag, COUNT(*) FROM dishes GROUP BY seasonal_tag ORDER BY count DESC`);
  s.forEach((r: any) => console.log(` ${r.seasonal_tag ?? 'null'}: ${r.count}`));

  console.log('\n=== Title keywords sample with seasonal_tag ===');
  const { rows: smp } = await c.query(`SELECT title_zh, seasonal_tag, origin_cuisine FROM dishes WHERE seasonal_tag IS NOT NULL LIMIT 30`);
  smp.forEach((r: any) => console.log(` [${r.seasonal_tag}] ${r.title_zh} (${r.origin_cuisine})`));

  console.log('\n=== Cantonese breakfast titles ===');
  const { rows: cb } = await c.query(`SELECT title_zh FROM dishes WHERE origin_cuisine='cantonese' AND meal_type='breakfast' LIMIT 15`);
  cb.forEach((r: any) => console.log(` · ${r.title_zh}`));

  console.log('\n=== Northern breakfast titles ===');
  const { rows: nb } = await c.query(`SELECT title_zh FROM dishes WHERE origin_cuisine='northern' AND meal_type='breakfast' LIMIT 15`);
  nb.forEach((r: any) => console.log(` · ${r.title_zh}`));

  console.log('\n=== Sichuan dish titles (no breakfast) — for understanding ===');
  const { rows: scb } = await c.query(`SELECT title_zh, meal_type FROM dishes WHERE origin_cuisine='sichuan' LIMIT 15`);
  scb.forEach((r: any) => console.log(` [${r.meal_type}] ${r.title_zh}`));

  console.log('\n=== Jiangnan breakfast titles ===');
  const { rows: jb } = await c.query(`SELECT title_zh FROM dishes WHERE origin_cuisine='jiangnan' AND meal_type='breakfast' LIMIT 15`);
  jb.forEach((r: any) => console.log(` · ${r.title_zh}`));

  await c.end();
}
main();
