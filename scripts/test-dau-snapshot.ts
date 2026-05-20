/**
 * test-dau-snapshot.ts — ops verify util for the dau-snapshot edge function
 *
 * TICKET-20260520-064 §C: CEO wants periodic verification that the DAU
 * monitoring endpoint returns the expected 6-field JSON shape.
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from .env, GETs the live endpoint with the
 * Bearer token, and prints the response. Anonymous / wrong-key paths are
 * exercised by the edge function's 401 path — see supabase/functions/dau-snapshot.
 *
 * Run:
 *   npx tsx scripts/test-dau-snapshot.ts
 */
import { config } from 'dotenv';
config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL) {
  console.error('VITE_SUPABASE_URL / SUPABASE_URL missing in .env');
  process.exit(1);
}

const endpoint = `${SUPABASE_URL}/functions/v1/dau-snapshot`;

async function callAndPrint(label: string, token: string | null): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  console.log(`\n=== ${label} ===`);
  console.log(`GET ${endpoint}`);
  console.log(`Authorization: ${token ? `Bearer ${token.slice(0, 12)}...` : '(none)'}`);
  const res = await fetch(endpoint, { method: 'GET', headers });
  const body = await res.text();
  console.log(`status: ${res.status}`);
  console.log(`body  : ${body}`);
  return { status: res.status, body };
}

async function test(): Promise<void> {
  // Negative tests — verify endpoint is live + service-role gate works.
  const t1 = await callAndPrint('TEST 1 — no Authorization header (expect 401)', null);
  if (t1.status !== 401) {
    console.warn(`⚠️ expected 401 for no-auth, got ${t1.status}`);
  } else {
    console.log('✓ endpoint live, 401 path works for missing auth');
  }

  if (ANON_KEY) {
    const t2 = await callAndPrint('TEST 2 — anon-key Bearer (expect 401)', ANON_KEY);
    if (t2.status !== 401) {
      console.warn(`⚠️ expected 401 for anon-key, got ${t2.status}`);
    } else {
      console.log('✓ service-role gate correctly rejects anon-key');
    }
  } else {
    console.log('\n(VITE_SUPABASE_ANON_KEY missing — skipping anon-key negative test)');
  }

  // Positive test — only runs if service-role key is in env (CEO machine).
  if (SERVICE_ROLE_KEY) {
    const t3 = await callAndPrint('TEST 3 — service-role Bearer (expect 200 + 6 fields)', SERVICE_ROLE_KEY);
    if (t3.status !== 200) {
      console.warn(`⚠️ expected 200 for service-role, got ${t3.status}`);
      return;
    }
    try {
      const j = JSON.parse(t3.body);
      const required = ['date', 'dau', 'wau', 'feedback_count_24h', 'chat_sessions_24h', 'weekly_menus_24h'];
      const missing = required.filter(k => !(k in j));
      if (missing.length > 0) {
        console.warn(`⚠️ missing fields: ${missing.join(', ')}`);
      } else {
        console.log('✓ all 6 expected fields present');
      }
    } catch {
      console.warn('⚠️ response body is not valid JSON');
    }
  } else {
    console.log('\n(SUPABASE_SERVICE_ROLE_KEY not in .env — skipping positive test.');
    console.log(' To run it: export SUPABASE_SERVICE_ROLE_KEY=<from supabase dashboard> and re-run.)');
  }
}

test().catch(e => {
  console.error('test failed:', e);
  process.exit(1);
});
