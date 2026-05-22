/**
 * meal_logs write e2e — TICKET-024 §E
 *
 * Real Supabase round-trip against migration 074_meal_logs table. Cleans up
 * own rows by user_id prefix `test-user-024-*` at end.
 *
 * 4 cases:
 *   case1 insert single meal_log row + read-back
 *   case2 multi-meal insert (breakfast / lunch / dinner / fruit) — all 4 meal_types valid
 *   case3 today-scoped query (since 00:00 local) returns expected count
 *   case4 append-only enforcement (no UPDATE / DELETE policy) — UPDATE should be blocked
 *
 * Run: npx tsx scripts/__tests__/meal-log-write.test.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
function ok(n: string, d: string)   { results.push({ name: n, pass: true,  detail: d }); }
function fail(n: string, d: string) { results.push({ name: n, pass: false, detail: d }); }

const USER_ID = 'test-user-024-' + Date.now();

// Pick a real dish_id from the live dishes table (FK requires it to exist).
let DISH_ID: string | null = null;
async function fetchTestDishId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('dishes')
    .select('id')
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return (data[0] as any).id;
}

async function case1_insertAndReadBack() {
  const name = 'case1: insert single meal_log + read-back';
  if (!DISH_ID) { fail(name, 'no dish_id available — dishes table empty?'); return; }
  const { error: insErr } = await supabase
    .from('meal_logs')
    .insert({ user_id: USER_ID, dish_id: DISH_ID, meal_type: 'dinner', portion: 1.0 });
  if (insErr) { fail(name, `insert err: ${insErr.message}`); return; }
  const { data, error: selErr } = await supabase
    .from('meal_logs')
    .select('id, user_id, dish_id, meal_type, portion, consumed_at')
    .eq('user_id', USER_ID)
    .eq('dish_id', DISH_ID);
  if (selErr) { fail(name, `select err: ${selErr.message}`); return; }
  if (!data || data.length !== 1) { fail(name, `expected 1 row, got ${data?.length ?? 0}`); return; }
  const row = data[0] as any;
  if (row.meal_type !== 'dinner' || Number(row.portion) !== 1.0) {
    fail(name, `meal_type=${row.meal_type} portion=${row.portion} unexpected`); return;
  }
  ok(name, `row id=${row.id.slice(0,8)} consumed_at=${(row.consumed_at as string).slice(0,19)}`);
}

async function case2_multiMealTypes() {
  const name = 'case2: 4 meal_types persist (breakfast/lunch/snack/fruit)';
  if (!DISH_ID) { fail(name, 'no dish_id available'); return; }
  const mealTypes = ['breakfast', 'lunch', 'snack', 'fruit'] as const;
  for (const mt of mealTypes) {
    const { error } = await supabase
      .from('meal_logs')
      .insert({ user_id: USER_ID, dish_id: DISH_ID, meal_type: mt, portion: 0.5 });
    if (error) { fail(name, `meal_type=${mt} insert err: ${error.message}`); return; }
  }
  const { data } = await supabase
    .from('meal_logs')
    .select('meal_type')
    .eq('user_id', USER_ID);
  const types = new Set((data ?? []).map(r => (r as any).meal_type));
  for (const mt of mealTypes) {
    if (!types.has(mt)) { fail(name, `meal_type=${mt} not persisted`); return; }
  }
  ok(name, `all 4 meal_types round-trip: ${[...types].join('/')}`);
}

async function case3_todayScopedQuery() {
  const name = 'case3: today-scoped query (consumed_at >= today 00:00) returns inserted rows';
  if (!DISH_ID) { fail(name, 'no dish_id available'); return; }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const { data, error } = await supabase
    .from('meal_logs')
    .select('id, meal_type, consumed_at')
    .eq('user_id', USER_ID)
    .gte('consumed_at', todayIso);
  if (error) { fail(name, `select err: ${error.message}`); return; }
  // case1 + case2 inserted 1 + 4 = 5 rows
  if (!data || data.length < 5) { fail(name, `expected ≥5 today rows, got ${data?.length ?? 0}`); return; }
  ok(name, `${data.length} rows since ${todayIso.slice(0,10)} (case1 + case2 = expected 5)`);
}

async function case4_appendOnlyEnforcement() {
  const name = 'case4: append-only — UPDATE blocked by RLS (migration 074 omits UPDATE policy)';
  if (!DISH_ID) { fail(name, 'no dish_id available'); return; }
  // Try to flip portion on existing rows. With no UPDATE policy, anon client
  // should be silently denied (PostgREST returns no rows affected / no error).
  const { data, error } = await supabase
    .from('meal_logs')
    .update({ portion: 99.0 })
    .eq('user_id', USER_ID)
    .select();
  // Two valid outcomes:
  //   a) PostgREST returns explicit error (RLS violation)
  //   b) PostgREST returns empty data (silently blocked — RLS-without-policy default)
  if (error) {
    // RLS violation surfaced as error — append-only enforced
    ok(name, `UPDATE rejected with error (RLS enforced): ${error.message.slice(0,60)}`);
    return;
  }
  if (data && data.length === 0) {
    // Silently blocked — also valid append-only
    ok(name, 'UPDATE returned 0 rows affected (RLS silently blocks — append-only enforced)');
    return;
  }
  // If rows came back changed, append-only is broken
  fail(name, `UPDATE returned ${data?.length ?? 0} rows changed (append-only NOT enforced)`);
}

async function cleanup() {
  // DELETE is also blocked by RLS (no policy). Best-effort: try anyway, then
  // log how many rows remain as test artifacts.
  await supabase.from('meal_logs').delete().eq('user_id', USER_ID);
  const { count } = await supabase
    .from('meal_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID);
  if ((count ?? 0) > 0) {
    console.log(`\nℹ️  cleanup: ${count} test rows remain (RLS blocks anon DELETE — expected). user_id=${USER_ID}`);
  } else {
    console.log('\nℹ️  cleanup: 0 test rows remain');
  }
}

(async () => {
  DISH_ID = await fetchTestDishId();
  if (!DISH_ID) {
    console.error('Cannot fetch a test dish_id — dishes table empty?');
    process.exit(1);
  }
  try {
    await case1_insertAndReadBack();
    await case2_multiMealTypes();
    await case3_todayScopedQuery();
    await case4_appendOnlyEnforcement();
  } catch (e) {
    console.error('Unexpected error:', e);
  } finally {
    await cleanup();
  }

  console.log('\n=== meal_logs write e2e results ===');
  let pass = 0;
  for (const r of results) {
    const tag = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${tag}  ${r.name}`);
    console.log(`        ${r.detail}`);
    if (r.pass) pass++;
  }
  console.log(`\nTotal: ${pass}/${results.length} pass`);
  process.exit(pass === results.length ? 0 : 1);
})();
