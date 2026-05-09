/**
 * Migration: change origin_cuisine column from ENUM to TEXT
 * Run: npx tsx scripts/fix-origin-cuisine-type.ts
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

  // Check current column type
  const { rows: cols } = await client.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name='dishes' AND column_name='origin_cuisine'
  `);
  console.log('Current column info:', cols);

  // Check if it's an enum
  const { rows: enums } = await client.query(`
    SELECT e.enumlabel
    FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = (
      SELECT udt_name FROM information_schema.columns
      WHERE table_name='dishes' AND column_name='origin_cuisine'
    )
    ORDER BY e.enumsortorder
  `);
  if (enums.length > 0) {
    console.log('Current enum values:', enums.map((r: any) => r.enumlabel));
  }

  // Alter column to TEXT
  await client.query(`
    ALTER TABLE dishes ALTER COLUMN origin_cuisine TYPE TEXT
  `);
  console.log('✅ origin_cuisine column changed to TEXT');

  // Also check and fix any other ENUM columns that might cause issues
  const { rows: allCols } = await client.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name='dishes' AND data_type='USER-DEFINED'
  `);
  console.log('Remaining ENUM columns:', allCols);

  await client.end();
  console.log('✅ Migration complete');
}

main().catch(err => { console.error(err); process.exit(1); });
