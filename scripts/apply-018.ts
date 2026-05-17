/**
 * apply-018.ts — run migration 018_dishes_quality_columns on production
 * Supabase using node + pg.Client (CLAUDE.md preferred mode — bypasses
 * the supabase CLI's tracker drift since file slots 005/006/007 were
 * already taken).
 *
 * The SQL itself is wrapped in BEGIN/COMMIT inside the file, so a
 * failure aborts cleanly with no partial state. After the migration
 * commits we INSERT into supabase_migrations.schema_migrations to
 * register version='018'.
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

  const sql = fs.readFileSync('supabase/migrations/018_dishes_quality_columns.sql', 'utf-8');
  console.log('Running migration 018 ...');
  await c.query(sql);
  console.log('  ✓ UP SQL executed');

  await c.query(
    `INSERT INTO supabase_migrations.schema_migrations(version, name)
     VALUES ($1, $2)
     ON CONFLICT (version) DO NOTHING`,
    ['018', 'dishes_quality_columns'],
  );
  console.log('  ✓ schema_migrations tracker updated (version=018)');

  await c.end();
  console.log('\nMigration 018 done.\n');
})().catch(e => { console.error('Migration 018 FAILED:', e); process.exit(1); });
