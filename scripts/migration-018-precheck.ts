/**
 * migration-005-precheck.ts — 跑 005 migration 之前的安全确认。
 *
 * 跑完会输出：
 *   1. dishes 当前列清单（snapshot）
 *   2. dishes 行数（snapshot，对比 post 用）
 *   3. 7 个新列是否已经存在（如果是 → migration 已跑过部分，需注意）
 *   4. 代码库里有没有提前引用 dishes.embedding（应该为 0）
 *   5. 当前 dishes_*_check / dishes_*_idx 约束/索引清单
 */
import pg from 'pg';
import { config } from 'dotenv';
import { execSync } from 'child_process';
config();

const NEW_COLS = [
  'kid_acceptance_score',
  'hk_availability_score',
  'average_cost_hkd',
  'helper_friendly_score',
  'western_subtype',
  'embedding',
  'last_backfilled_at',
];

(async () => {
  const c = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('\n=== Migration 005 PRE-CHECK ===\n');

  // 1. dishes column count + list
  const { rows: cols } = await c.query<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dishes'
    ORDER BY ordinal_position
  `);
  console.log(`1) dishes columns BEFORE: ${cols.length}`);
  cols.forEach(c => console.log(`     · ${c.column_name} : ${c.data_type}`));

  // 2. row count
  const { rows: cnt } = await c.query<{ count: string }>(`SELECT COUNT(*) FROM dishes`);
  console.log(`\n2) dishes row count: ${cnt[0].count}`);

  // 3. which of the 7 new columns already exist (should be empty)
  console.log('\n3) New columns already present (should be empty):');
  const colNames = cols.map(c => c.column_name);
  const alreadyExist = NEW_COLS.filter(n => colNames.includes(n));
  if (alreadyExist.length === 0) {
    console.log('     (none — clean state, safe to run UP)');
  } else {
    console.log('     ⚠ ', alreadyExist);
    console.log('     → migration partially applied; UP is idempotent (IF NOT EXISTS) so still safe.');
  }

  // 4. grep code for forward references
  console.log('\n4) Code references to dishes.embedding (should be 0):');
  try {
    const out = execSync(`grep -rn "dishes.embedding\\|\\.embedding\\b" src/ supabase/ 2>/dev/null | grep -v node_modules | head -10 || true`,
      { encoding: 'utf-8', cwd: process.cwd() });
    console.log(out.trim() || '     (none — embedding placeholder is safe)');
  } catch { console.log('     (no matches)'); }

  // 5. existing check constraints + indexes on dishes
  const { rows: chks } = await c.query<{ conname: string; def: string }>(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'public.dishes'::regclass AND contype='c'
    ORDER BY conname
  `);
  console.log(`\n5) Existing CHECK constraints on dishes (${chks.length}):`);
  chks.forEach(c => console.log(`     · ${c.conname}: ${c.def}`));

  const { rows: idxs } = await c.query<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='dishes'
    ORDER BY indexname
  `);
  console.log(`\n   Existing indexes (${idxs.length}):`);
  idxs.forEach(i => console.log(`     · ${i.indexname}`));

  await c.end();
  console.log('\n=== PRE-CHECK DONE — review above, then run UP SQL in Supabase SQL Editor ===\n');
})();
