import pg from 'pg';
import { config } from 'dotenv';
config();

async function main() {
  const client = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dishes' ORDER BY ordinal_position`);
  console.log(rows.map(r => `${r.column_name} (${r.data_type})`).join('\n'));
  // Sample one dish to see all fields
  const { rows: sample } = await client.query(`SELECT * FROM dishes LIMIT 1`);
  console.log('\nSample dish:', JSON.stringify(sample[0], null, 2));
  await client.end();
}
main().catch(console.error);
