/**
 * migration-020-postcheck.ts — runs verifications 1-10 from the parallel
 * session against production after 020 UP applies. Verification 11
 * (browser smoke test) is manual.
 *
 * SAVEPOINT pattern used wherever an illegal write is tested, so the
 * outer transaction always rolls back cleanly and production data stays
 * untouched.
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

(async () => {
  const c = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('\n=== Migration 020 POST-CHECK ===\n');
  let failures = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`   → ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures++;
  };

  // ── 1. pgvector installed ────────────────────────────────────────
  console.log('1) pgvector extension:');
  const { rows: ext } = await c.query<{ extname: string; extversion: string; schema: string }>(`
    SELECT e.extname, e.extversion, n.nspname AS schema
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname='vector'
  `);
  ext.forEach(r => console.log(`     · ${r.extname} ${r.extversion} schema=${r.schema}`));
  check(
    'vector extension installed in extensions schema',
    ext.length === 1 && ext[0].schema === 'extensions',
  );

  // ── 2. dishes.embedding is vector(768) ───────────────────────────
  console.log('\n2) dishes.embedding column type:');
  const { rows: col } = await c.query<{ column_name: string; data_type: string }>(`
    SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type
    FROM pg_attribute a
    WHERE a.attrelid='public.dishes'::regclass AND a.attname='embedding'
  `);
  col.forEach(r => console.log(`     · ${r.column_name}: ${r.data_type}`));
  check(
    'data_type = vector(768)',
    col.length === 1 && col[0].data_type === 'vector(768)',
  );

  // ── 3. all 720 rows have NULL embedding ──────────────────────────
  console.log('\n3) Row counts:');
  const { rows: cnt } = await c.query<any>(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE embedding IS NULL)::int AS null_count,
           COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS populated
    FROM dishes
  `);
  const r = cnt[0];
  console.log(`     total=${r.total}  null=${r.null_count}  populated=${r.populated}`);
  check('embedding fully NULL after migration', r.null_count === r.total && r.populated === 0);

  // ── 4. vector write + cosine distance op end-to-end ──────────────
  console.log('\n4) Vector write + cosine distance op (SAVEPOINT-protected):');
  await c.query('BEGIN');
  try {
    await c.query('SAVEPOINT sp_vec');
    const { rows: target } = await c.query<{ id: string; title_zh: string }>(`SELECT id, title_zh FROM dishes LIMIT 1`);
    if (target.length > 0) {
      const dish = target[0];
      console.log(`     test target: ${dish.title_zh} (${dish.id.slice(0,8)})`);
      // Write 768-d unit vector
      await c.query(`
        UPDATE dishes
        SET embedding = (SELECT array_agg(0.001::real)::vector FROM generate_series(1, 768))
        WHERE id = $1
      `, [dish.id]);
      // Read back + cosine distance vs same vector → ~0
      const { rows: dist } = await c.query<{ d: number }>(`
        SELECT (embedding <=> (
          SELECT array_agg(0.001::real)::vector FROM generate_series(1, 768)
        ))::float AS d
        FROM dishes WHERE id = $1
      `, [dish.id]);
      console.log(`     cosine_distance to self ≈ ${dist[0].d}`);
      check('vector write succeeded + cosine op returns ~0', Math.abs(dist[0].d) < 1e-5);
    }
    await c.query('ROLLBACK TO SAVEPOINT sp_vec');
  } finally {
    await c.query('ROLLBACK');
    console.log('     ✓ ROLLBACK — production data untouched');
  }

  // ── 5. dimension enforcement (wrong-dim rejected) ────────────────
  console.log('\n5) Vector dimension enforcement:');
  await c.query('BEGIN');
  try {
    await c.query('SAVEPOINT sp_dim');
    let rejected = false;
    try {
      await c.query(`
        UPDATE dishes SET embedding = '[0.1, 0.2, 0.3]'::vector WHERE id = (SELECT id FROM dishes LIMIT 1)
      `);
    } catch (e: any) {
      rejected = true;
      await c.query('ROLLBACK TO SAVEPOINT sp_dim');
      console.log(`     ✓ wrong-dim write rejected: ${e.message.split('\n')[0]}`);
    }
    check('vector(768) rejects 3-dim input', rejected);
  } finally {
    await c.query('ROLLBACK');
  }

  // ── 6. menu_evals columns ────────────────────────────────────────
  console.log('\n6) menu_evals columns:');
  const { rows: mcols } = await c.query<{ column_name: string; data_type: string; is_nullable: string }>(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name='menu_evals' AND table_schema='public'
    ORDER BY ordinal_position
  `);
  mcols.forEach(c => console.log(`     · ${c.column_name.padEnd(22)} ${c.data_type.padEnd(28)} nullable=${c.is_nullable}`));
  check('17 columns total', mcols.length === 17);

  // ── 7. menu_evals indexes ────────────────────────────────────────
  console.log('\n7) menu_evals indexes:');
  const { rows: idx } = await c.query<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='menu_evals'
    ORDER BY indexname
  `);
  idx.forEach(i => console.log(`     · ${i.indexname}`));
  // 6 expected: pkey + 5 CREATE INDEX
  check('6 indexes (pkey + 5 named)', idx.length === 6);

  // ── 8. menu_evals RLS policies ───────────────────────────────────
  console.log('\n8) menu_evals RLS policies:');
  const { rows: pol } = await c.query<{ polname: string; polcmd: string }>(`
    SELECT polname, polcmd::text AS polcmd
    FROM pg_policy WHERE polrelid='public.menu_evals'::regclass
    ORDER BY polname
  `);
  pol.forEach(p => console.log(`     · ${p.polname} (cmd=${p.polcmd})`));
  check('2 policies (insert_anon + select_anon)', pol.length === 2);
  const { rows: rls } = await c.query<{ relrowsecurity: boolean }>(`
    SELECT relrowsecurity FROM pg_class WHERE oid='public.menu_evals'::regclass
  `);
  check('row-level security enabled', rls[0]?.relrowsecurity === true);

  // ── 9. CHECK constraints on menu_evals ───────────────────────────
  console.log('\n9) CHECK constraints (agent + segment + outcome):');
  await c.query('BEGIN');
  try {
    let agentRejected = false;
    let segmentRejected = false;
    let legalInserted = false;

    // bogus agent
    await c.query('SAVEPOINT sp_agent');
    try {
      await c.query(`INSERT INTO menu_evals (agent, user_id, algo_version_consumed) VALUES ('bogus_agent', 'test_user', 'v37')`);
    } catch (e: any) {
      agentRejected = true;
      await c.query('ROLLBACK TO SAVEPOINT sp_agent');
      console.log(`     ✓ bogus agent rejected`);
    }

    // bogus segment
    await c.query('SAVEPOINT sp_seg');
    try {
      await c.query(`INSERT INTO menu_evals (agent, user_id, algo_version_consumed, segment) VALUES ('composer', 'test_user', 'v37', 'Z')`);
    } catch (e: any) {
      segmentRejected = true;
      await c.query('ROLLBACK TO SAVEPOINT sp_seg');
      console.log(`     ✓ bogus segment rejected`);
    }

    // legal row (will rollback)
    await c.query('SAVEPOINT sp_legal');
    try {
      const { rows: ins } = await c.query<{ id: string }>(`
        INSERT INTO menu_evals (agent, user_id, algo_version_consumed, segment, scenario)
        VALUES ('composer', 'test_user', 'v37', 'B', 'banquet')
        RETURNING id
      `);
      legalInserted = ins.length === 1;
      console.log(`     ✓ legal insert succeeded id=${ins[0].id.slice(0,8)} (will rollback)`);
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT sp_legal');
    }

    check('agent CHECK fires', agentRejected);
    check('segment CHECK fires', segmentRejected);
    check('legal row accepted', legalInserted);
  } finally {
    await c.query('ROLLBACK');
  }

  // ── 10. tracker recorded ─────────────────────────────────────────
  console.log('\n10) supabase_migrations tracker:');
  const { rows: tr } = await c.query<{ version: string; name: string }>(`
    SELECT version, name FROM supabase_migrations.schema_migrations WHERE version='020'
  `);
  if (tr.length > 0) console.log(`     ✓ version=020 name="${tr[0].name}"`);
  else console.log('     ✗ NOT recorded');
  check('tracker has version=020', tr.length === 1);

  // ── extra: confirm sentinel comment is GONE on the new embedding column
  // (so future DOWN-then-rerun won't mistakenly trigger 020's sentinel guard
  //  thinking it's still the bytea placeholder).
  console.log('\n+) sentinel comment removed from new embedding column:');
  const { rows: cmt } = await c.query<{ comment: string }>(`
    SELECT col_description(
      (SELECT oid FROM pg_class WHERE relname='dishes'),
      (SELECT attnum FROM pg_attribute
         WHERE attrelid=(SELECT oid FROM pg_class WHERE relname='dishes')
           AND attname='embedding')
    ) AS comment
  `);
  const hasSentinel = (cmt[0]?.comment ?? '').includes('MIGRATION_005_PLACEHOLDER');
  console.log(`     comment: "${(cmt[0]?.comment ?? '').slice(0, 80)}..."`);
  check('sentinel MIGRATION_005_PLACEHOLDER no longer present', !hasSentinel);

  await c.end();

  console.log(`\n=== ${failures === 0 ? '✅ ALL CHECKS PASS' : `⚠ ${failures} CHECK(S) FAILED — review above`} ===\n`);
  if (failures > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
