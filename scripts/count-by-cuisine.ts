import pg from 'pg';
import { config } from 'dotenv';
config();
const client = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function main() {
  await client.connect();
  const { rows } = await client.query(`
    SELECT origin_cuisine, COUNT(*) as cnt
    FROM dishes
    GROUP BY origin_cuisine
    ORDER BY cnt DESC
  `);
  console.log('菜系分布:');
  rows.forEach((r: any) => console.log(` ${r.origin_cuisine || 'null'}: ${r.cnt} 道`));
  const { rows: total } = await client.query('SELECT COUNT(*) as cnt FROM dishes');
  console.log('\n合计:', total[0].cnt, '道菜');
  await client.end();
}
main();
