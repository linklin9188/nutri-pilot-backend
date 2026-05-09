import pg from 'pg';
import { config } from 'dotenv';
config();
const client = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function main() {
  await client.connect();
  const { rows } = await client.query('SELECT title_zh FROM dishes ORDER BY title_zh');
  console.log(rows.map((r: any) => r.title_zh).join('\n'));
  await client.end();
}
main();
