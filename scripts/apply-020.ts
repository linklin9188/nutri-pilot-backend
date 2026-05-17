/**
 * apply-020.ts — run migration 020_menu_evals_and_vector on production.
 *
 * UP SQL itself contains the tracker INSERT (Section 8), so this script
 * just executes the file's contents inside a transaction and reports.
 * On failure the BEGIN/COMMIT inside the SQL rolls everything back —
 * Section 2's sentinel DO block + Section 3's column rebuild are atomic.
 */
import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
config();

(async () => {
  const c = new pg.Client({
    connectionString: process.env.DIRECT_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const sql = fs.readFileSync('supabase/migrations/020_menu_evals_and_vector.sql', 'utf-8');
  console.log('Running migration 020 ...');
  try {
    await c.query(sql);
    console.log('  ✓ UP SQL executed (includes tracker INSERT)');
  } catch (e: any) {
    console.error('  ✗ FAILED:', e.message);
    process.exit(1);
  }

  // Re-confirm tracker entry (UP SQL writes it but worth a paranoia read)
  const { rows } = await c.query<{ version: string; name: string }>(
    `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version='020'`
  );
  if (rows.length > 0) console.log(`  ✓ tracker version=020 name="${rows[0].name}"`);
  else                  console.log('  ✗ tracker NOT recorded (UP SQL section 8 didn\'t fire)');

  await c.end();
  console.log('\nMigration 020 done.\n');
})().catch(e => { console.error('Migration 020 FAILED:', e); process.exit(1); });
