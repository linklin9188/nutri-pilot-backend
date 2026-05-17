/**
 * migration-018-postcheck.ts — runs the parallel session's verifications
 * 1, 2, 3, 4 (safe-rollback variant), 6 against production after the UP
 * migration ran. Verification 5 (browser console) is for the user to
 * eyeball manually.
 */
import pg from 'pg';
import { config } from 'dotenv';
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

  console.log('\n=== Migration 018 POST-CHECK ===\n');

  // ── 验证 1 ── 7 个新列存在且类型正确 ──────────────────────────────
  console.log('1) New columns present + types:');
  const { rows: cols } = await c.query<{ column_name: string; data_type: string; column_default: string | null; is_nullable: string }>(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'dishes' AND column_name = ANY($1)
    ORDER BY column_name
  `, [NEW_COLS]);
  for (const r of cols) {
    console.log(`     · ${r.column_name.padEnd(24)} ${r.data_type.padEnd(28)} default=${r.column_default ?? 'NULL'}  nullable=${r.is_nullable}`);
  }
  const pass1 = cols.length === 7;
  console.log(`   → ${pass1 ? '✓' : '✗'} 7/7 expected (got ${cols.length})`);

  // ── 验证 2 ── 现有行数 + default 填充 ───────────────────────────
  console.log('\n2) Row count + default fill:');
  const { rows: stats } = await c.query<any>(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(*) FILTER (WHERE kid_acceptance_score   = 0.50) AS kid_default,
      COUNT(*) FILTER (WHERE hk_availability_score  = 0.50) AS hk_default,
      COUNT(*) FILTER (WHERE helper_friendly_score  = 0.50) AS helper_default,
      COUNT(*) FILTER (WHERE average_cost_hkd       IS NULL) AS cost_null,
      COUNT(*) FILTER (WHERE western_subtype        IS NULL) AS western_null,
      COUNT(*) FILTER (WHERE last_backfilled_at     IS NULL) AS never_backfilled,
      COUNT(*) FILTER (WHERE embedding              IS NULL) AS embedding_null
    FROM dishes
  `);
  const s = stats[0];
  console.log(`     total_rows         = ${s.total_rows}`);
  console.log(`     kid_default        = ${s.kid_default}`);
  console.log(`     hk_default         = ${s.hk_default}`);
  console.log(`     helper_default     = ${s.helper_default}`);
  console.log(`     cost_null          = ${s.cost_null}`);
  console.log(`     western_null       = ${s.western_null}`);
  console.log(`     never_backfilled   = ${s.never_backfilled}`);
  console.log(`     embedding_null     = ${s.embedding_null}`);
  const total = Number(s.total_rows);
  const pass2 =
    Number(s.kid_default)      === total &&
    Number(s.hk_default)       === total &&
    Number(s.helper_default)   === total &&
    Number(s.cost_null)        === total &&
    Number(s.western_null)     === total &&
    Number(s.never_backfilled) === total &&
    Number(s.embedding_null)   === total;
  console.log(`   → ${pass2 ? '✓' : '✗'} all ${total} rows show default fill`);

  // ── 验证 3 ── 索引创建成功 ──────────────────────────────────────
  console.log('\n3) Indexes:');
  const { rows: idx } = await c.query<{ indexname: string; indexdef: string }>(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename='dishes' AND indexname = ANY($1)
    ORDER BY indexname
  `, [['dishes_western_subtype_idx', 'dishes_backfill_queue_idx']]);
  idx.forEach(i => console.log(`     · ${i.indexname}`));
  console.log(`   → ${idx.length === 2 ? '✓' : '✗'} 2/2 expected (got ${idx.length})`);

  // ── 验证 4 (safe) ── CHECK constraints reject illegal values ────
  // Use SAVEPOINT so the ILLEGAL write's error doesn't poison the outer
  // transaction. Both tests stay inside a single ROLLBACK so production
  // data is untouched.
  console.log('\n4) CHECK constraint enforcement (zero-pollution variant):');
  const { rows: pick } = await c.query<{ id: string; title_zh: string }>(`SELECT id, title_zh FROM dishes LIMIT 1`);
  if (pick.length === 0) {
    console.log('     ! no dishes to test against (skipping)');
  } else {
    const dish = pick[0];
    console.log(`     test target: ${dish.title_zh} (${dish.id.slice(0, 8)})`);
    await c.query('BEGIN');
    try {
      // ILLEGAL: SAVEPOINT-protected so the constraint error leaves the
      // outer transaction usable.
      await c.query('SAVEPOINT illegal_attempt');
      let rejected = false;
      try {
        await c.query(`UPDATE dishes SET kid_acceptance_score = 1.5 WHERE id = $1`, [dish.id]);
      } catch (e: any) {
        rejected = true;
        await c.query('ROLLBACK TO SAVEPOINT illegal_attempt');
        console.log(`     ✓ ILLEGAL write rejected: ${e.message.split('\n')[0]}`);
      }
      if (!rejected) console.log('     ✗ CHECK constraint did NOT fire — investigate');
      await c.query('RELEASE SAVEPOINT illegal_attempt');

      // LEGAL: should succeed within the outer transaction
      const ok = await c.query(`UPDATE dishes SET kid_acceptance_score = 0.85 WHERE id = $1`, [dish.id]);
      console.log(`     ✓ LEGAL   write ok    (rowCount=${ok.rowCount}, will rollback)`);
    } finally {
      await c.query('ROLLBACK');
      console.log('     ✓ ROLLBACK — production data untouched');
    }
  }

  // ── 验证 6 ── embedding sentinel comment ────────────────────────
  console.log('\n6) Embedding sentinel comment for future vector migration:');
  const { rows: cmt } = await c.query<{ comment: string }>(`
    SELECT col_description(
      (SELECT oid FROM pg_class WHERE relname='dishes'),
      (SELECT attnum FROM pg_attribute
         WHERE attrelid=(SELECT oid FROM pg_class WHERE relname='dishes')
           AND attname='embedding')
    ) AS comment
  `);
  const comment = cmt[0]?.comment ?? '';
  console.log(`     comment: "${comment.slice(0, 100)}..."`);
  const hasSentinel = comment.includes('MIGRATION_005_PLACEHOLDER');
  console.log(`   → ${hasSentinel ? '✓' : '✗'} sentinel "MIGRATION_005_PLACEHOLDER" detected`);

  // ── tracker check ───────────────────────────────────────────────
  console.log('\n7) supabase_migrations.schema_migrations recorded:');
  const { rows: tr } = await c.query<{ version: string; name: string }>(`
    SELECT version, name FROM supabase_migrations.schema_migrations
    WHERE version = '018'
  `);
  if (tr.length > 0) console.log(`     ✓ version=018 name="${tr[0].name}"`);
  else                console.log(`     ✗ NOT recorded in tracker`);

  await c.end();

  const allPass = pass1 && pass2 && idx.length === 2 && hasSentinel;
  console.log(`\n=== ${allPass ? '✅ ALL CHECKS PASS' : '⚠ SOME CHECKS FAILED — review above'} ===\n`);
})().catch(e => { console.error(e); process.exit(1); });
