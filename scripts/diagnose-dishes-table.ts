import pg from 'pg';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // Full column info
  const { rows: cols } = await client.query(`
    SELECT column_name, data_type, udt_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dishes'
    ORDER BY ordinal_position
  `);
  console.log('\n=== dishes table columns ===');
  cols.forEach((r: any) => console.log(
    `  ${r.column_name.padEnd(25)} ${r.data_type.padEnd(20)} udt=${r.udt_name.padEnd(25)} default=${r.column_default ?? 'NONE'}`
  ));

  // All enums in the DB
  const { rows: enums } = await client.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    ORDER BY t.typname, e.enumsortorder
  `);
  console.log('\n=== All enum types ===');
  const grouped: Record<string, string[]> = {};
  enums.forEach((r: any) => {
    grouped[r.typname] = grouped[r.typname] ?? [];
    grouped[r.typname].push(r.enumlabel);
  });
  Object.entries(grouped).forEach(([name, vals]) => console.log(`  ${name}: [${vals.join(', ')}]`));

  // Try a simple insert to see the exact error
  try {
    await client.query(`
      INSERT INTO dishes (title_zh) VALUES ('test_diagnose')
    `);
    console.log('\n✅ Minimal insert succeeded');
    await client.query(`DELETE FROM dishes WHERE title_zh = 'test_diagnose'`);
  } catch (err: any) {
    console.log('\n❌ Minimal insert error:', err.message);
  }

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
