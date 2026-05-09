import pg from 'pg';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('🔗 Connected');

  await client.query(`
    ALTER TABLE dishes ALTER COLUMN id SET DEFAULT gen_random_uuid()
  `);
  console.log('✅ id column now has DEFAULT gen_random_uuid()');

  // Verify
  const { rows } = await client.query(`
    SELECT column_default FROM information_schema.columns
    WHERE table_name='dishes' AND column_name='id'
  `);
  console.log('   Default:', rows[0]?.column_default);

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
