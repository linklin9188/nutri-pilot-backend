/**
 * Migration: add title_en, description_zh, description_en, meal_type to dishes
 * Run: npx tsx scripts/add-dish-columns.ts
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
  console.log('🔗 Connected');

  await client.query(`
    ALTER TABLE dishes
      ADD COLUMN IF NOT EXISTS title_en        TEXT,
      ADD COLUMN IF NOT EXISTS description_zh  TEXT,
      ADD COLUMN IF NOT EXISTS description_en  TEXT,
      ADD COLUMN IF NOT EXISTS meal_type       TEXT DEFAULT 'dinner'
        CHECK (meal_type IN ('breakfast','lunch','dinner','all'));
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS dishes_meal_type_idx ON dishes (meal_type);
  `);

  console.log('✅ Columns added: title_en, description_zh, description_en, meal_type');

  const { rows } = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'dishes'
    ORDER BY ordinal_position
  `);
  console.log('\n📋 Current dishes schema:');
  rows.forEach(r => console.log(`  ${r.column_name.padEnd(20)} ${r.data_type}`));

  await client.end();
  console.log('\n✅ Done');
}

main().catch(err => { console.error(err); process.exit(1); });
