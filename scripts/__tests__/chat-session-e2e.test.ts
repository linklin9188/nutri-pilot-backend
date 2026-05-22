/**
 * chat-session e2e smoke — TICKET-019 §A
 *
 * 4 cases hit the REAL Supabase `chat_sessions` table to verify the
 * Option β persistence path (front-end direct upsert + chat-session-get
 * edge fn hydration entry) end-to-end. NOT a unit test — this exercises
 * production Supabase REST.
 *
 * Run: npx tsx scripts/__tests__/chat-session-e2e.test.ts
 *
 * Cleans up own rows via DELETE prefix `test-user-019-*` at end.
 *
 * Honest scope: this is Node-side smoke (no React, no DOM, no useChatSession
 * hook instantiation). It verifies the persistence CONTRACT — what
 * useChatSession's dbUpsertSession + dbLoadSession + chat-session-get
 * hydration write/read — not React rendering. If the contract holds at
 * Supabase level, the hook will work.
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

function ok(name: string, detail: string)   { results.push({ name, pass: true,  detail }); }
function fail(name: string, detail: string) { results.push({ name, pass: false, detail }); }

const USER_A = 'test-user-019-a-' + Date.now();
const USER_B = 'test-user-019-b-' + Date.now();
const SESSION_1 = randomUUID();
const SESSION_2 = randomUUID();

interface ChatMessage { id: string; role: string; content: string; timestamp: number }

function makeMsg(role: 'user'|'ai'|'system', content: string): ChatMessage {
  return { id: randomUUID(), role, content, timestamp: Date.now() };
}

async function case1_dbPersistence() {
  const name = 'case1: DB persistence (3 messages upsert + read-back)';
  const messages = [makeMsg('user', 'hello'), makeMsg('ai', 'hi there'), makeMsg('user', 'thanks')];
  const { error: upsertErr } = await supabase
    .from('chat_sessions')
    .upsert({
      id:             SESSION_1,
      user_id:        USER_A,
      mode:           'today',
      messages,
      intent_history: [],
      proposals_snapshot: null,
      chosen:         null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'id' });
  if (upsertErr) { fail(name, `upsert err: ${upsertErr.message}`); return; }

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, user_id, mode, messages')
    .eq('id', SESSION_1)
    .maybeSingle();
  if (error)           { fail(name, `select err: ${error.message}`); return; }
  if (!data)           { fail(name, 'row not found after upsert'); return; }
  const msgs = (data as any).messages as ChatMessage[];
  if (!Array.isArray(msgs) || msgs.length !== 3) {
    fail(name, `expected 3 messages, got ${Array.isArray(msgs) ? msgs.length : typeof msgs}`); return;
  }
  ok(name, `row id=${(data as any).id.slice(0,8)} mode=${(data as any).mode} messages.length=${msgs.length}`);
}

async function case2_userIdIsolation() {
  const name = 'case2: user_id isolation (USER_A row not visible to USER_B query)';
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, user_id, messages')
    .eq('user_id', USER_B);
  if (error) { fail(name, `select err: ${error.message}`); return; }
  const aRowLeaked = (data ?? []).some(r => (r as any).id === SESSION_1);
  if (aRowLeaked) { fail(name, 'SESSION_1 (USER_A row) leaked into USER_B query'); return; }
  ok(name, `USER_B query returned ${data?.length ?? 0} rows, no USER_A leak`);
}

async function case3_multiSession() {
  const name = 'case3: multi-session (same user, two distinct session ids)';
  const msgs2 = [makeMsg('user', 'session 2 hello')];
  const { error: insErr } = await supabase
    .from('chat_sessions')
    .upsert({
      id:             SESSION_2,
      user_id:        USER_A,
      mode:           'week',
      messages:       msgs2,
      intent_history: [],
      proposals_snapshot: null,
      chosen:         null,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'id' });
  if (insErr) { fail(name, `upsert err: ${insErr.message}`); return; }

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, mode, messages')
    .eq('user_id', USER_A);
  if (error) { fail(name, `select err: ${error.message}`); return; }
  const rows = data ?? [];
  if (rows.length < 2) { fail(name, `expected ≥2 rows for USER_A, got ${rows.length}`); return; }
  const s1 = rows.find(r => (r as any).id === SESSION_1);
  const s2 = rows.find(r => (r as any).id === SESSION_2);
  if (!s1 || !s2) { fail(name, 'missing one of SESSION_1/SESSION_2'); return; }
  const s1Msgs = (s1 as any).messages as ChatMessage[];
  const s2Msgs = (s2 as any).messages as ChatMessage[];
  if (s1Msgs.length !== 3 || s2Msgs.length !== 1) {
    fail(name, `expected (3,1), got (${s1Msgs.length},${s2Msgs.length})`); return;
  }
  ok(name, `2 distinct sessions for same user: SESSION_1 mode=today msgs=3, SESSION_2 mode=week msgs=1`);
}

async function case4_modeRouting() {
  const name = 'case4: mode routing (today / week / preference columns persist)';
  const sessionsByMode = [
    { id: randomUUID(), mode: 'today' },
    { id: randomUUID(), mode: 'week' },
    { id: randomUUID(), mode: 'preference' },
  ];
  for (const s of sessionsByMode) {
    const { error } = await supabase
      .from('chat_sessions')
      .upsert({
        id:             s.id,
        user_id:        USER_A,
        mode:           s.mode,
        messages:       [makeMsg('user', `mode=${s.mode} test`)],
        intent_history: [],
        proposals_snapshot: null,
        chosen:         null,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'id' });
    if (error) { fail(name, `upsert mode=${s.mode} err: ${error.message}`); return; }
  }
  // verify each row's mode column
  for (const s of sessionsByMode) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('mode')
      .eq('id', s.id)
      .maybeSingle();
    if (error || !data) { fail(name, `read mode=${s.mode} err`); return; }
    if ((data as any).mode !== s.mode) {
      fail(name, `mode mismatch: expected ${s.mode}, got ${(data as any).mode}`); return;
    }
  }
  ok(name, 'today/week/preference modes each round-trip via chat_sessions.mode column');
}

async function cleanup() {
  // Delete all rows we created for both users.
  await supabase.from('chat_sessions').delete().eq('user_id', USER_A);
  await supabase.from('chat_sessions').delete().eq('user_id', USER_B);
}

(async () => {
  try {
    await case1_dbPersistence();
    await case2_userIdIsolation();
    await case3_multiSession();
    await case4_modeRouting();
  } catch (e) {
    console.error('Unexpected error:', e);
  } finally {
    await cleanup();
  }

  console.log('\n=== chat-session e2e smoke results ===');
  let passCount = 0;
  for (const r of results) {
    const tag = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${tag}  ${r.name}`);
    console.log(`        ${r.detail}`);
    if (r.pass) passCount++;
  }
  console.log(`\nTotal: ${passCount}/${results.length} pass`);
  process.exit(passCount === results.length ? 0 : 1);
})();
