/**
 * apply-023.ts — add anon UPDATE policy to menu_evals.
 *
 * Single CREATE POLICY + tracker INSERT, idempotent via the IF NOT EXISTS
 * pattern + ON CONFLICT DO NOTHING. Safe to re-run.
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

  const sql = fs.readFileSync('supabase/migrations/023_menu_evals_anon_update.sql', 'utf-8');
  console.log('Running migration 023 ...');
  try {
    await c.query(sql);
    console.log('  ✓ migration executed');
  } catch (e: any) {
    // 42710 = duplicate_object (policy already exists) — re-run is safe.
    if (e.code === '42710') {
      console.log('  ✓ policy already exists (idempotent re-run)');
    } else {
      console.error('  ✗ FAILED:', e.message);
      process.exit(1);
    }
  }

  const { rows } = await c.query<{ version: string; name: string }>(
    `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version='023'`
  );
  console.log(rows.length > 0
    ? `  ✓ tracker version=023 name="${rows[0].name}"`
    : '  ✗ tracker NOT recorded'
  );

  // Verify policy is in place
  const { rows: pol } = await c.query(
    `SELECT polname FROM pg_policy WHERE polname='menu_evals_update_anon'`
  );
  console.log(pol.length > 0
    ? `  ✓ menu_evals_update_anon policy present`
    : '  ✗ policy NOT created'
  );

  await c.end();
})().catch(e => { console.error('Migration 023 FAILED:', e); process.exit(1); });
