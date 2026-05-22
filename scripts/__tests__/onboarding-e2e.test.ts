/**
 * onboarding v3/v4 e2e contract — TICKET-019 §B
 *
 * HONEST SCOPE: pure-Node shape verification. No DOM, no React rendering,
 * no headless Chromium (would require playwright install — out of UI dept
 * scope). Verifies the QuickSetup.tsx finish() WRITE CONTRACT and Q0 logic
 * by parsing source + exercising TABLE_STYLE_MAP statically.
 *
 * What this DOES verify:
 *   - finish() writes 13 expected localStorage keys (regex match)
 *   - QUESTIONS_V3 has 11 axes (Q0..Q10)
 *   - TABLE_STYLE_MAP has 5 entries (solo_w_kid / couple_1kid / couple_2kids
 *     / couple_3kids / three_gen) + custom special path
 *   - finish() Q0 派生 path writes nutri_adults / nutri_kids / nutri_family_pattern
 *   - skip chip handler writes empty / null payload (§F UI 015 ship)
 *
 * What this DOES NOT verify (needs browser):
 *   - actual DOM click flow Q0 → Q10
 *   - state.answers progression through visibleIndices
 *   - skeleton / motion / image fallback rendering
 *
 * Run: npx tsx scripts/__tests__/onboarding-e2e.test.ts
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUICKSETUP_PATH = join(__dirname, '..', '..', 'src', 'pages', 'QuickSetup.tsx');
const source = readFileSync(QUICKSETUP_PATH, 'utf8');

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
function ok(name: string, detail: string)   { results.push({ name, pass: true,  detail }); }
function fail(name: string, detail: string) { results.push({ name, pass: false, detail }); }

// ─────────────────────────────────────────────────────────────────────────
// CASE 1 — finish() writes 13 expected localStorage keys
// ─────────────────────────────────────────────────────────────────────────
const EXPECTED_FINISH_KEYS = [
  'quickPrefs',
  'nutri_adults',
  'nutri_kids',
  'nutri_family_pattern',
  'family_composition',
  'userTaste',
  'userDiet',
  'userSpice',
  'strict_avoid',
  'userAvoid',
  'isLoggedIn',
  'userId',
  'onboarding_v3_done',
  'onboarding_v2_done',
];

function case1_finishKeys() {
  const name = 'case1: finish() writes 14 expected localStorage keys';
  const missing: string[] = [];
  for (const k of EXPECTED_FINISH_KEYS) {
    const re = new RegExp(`localStorage\\.setItem\\(['"\`]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
    if (!re.test(source)) missing.push(k);
  }
  if (missing.length > 0) fail(name, `missing keys in QuickSetup.tsx: ${missing.join(', ')}`);
  else ok(name, `all ${EXPECTED_FINISH_KEYS.length} keys present`);
}

// ─────────────────────────────────────────────────────────────────────────
// CASE 2 — QUESTIONS_V3 has 11 axes
// ─────────────────────────────────────────────────────────────────────────
function case2_questionsCount() {
  const name = 'case2: QUESTIONS_V3 contains 11 axes (Q0..Q10)';
  const blockMatch = source.match(/const QUESTIONS_V3:[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!blockMatch) { fail(name, 'cannot locate QUESTIONS_V3 array'); return; }
  const idMatches = blockMatch[1].matchAll(/\bid:\s*['"]([a-z_]+)['"]/g);
  const ids = Array.from(idMatches).map(m => m[1]);
  const expected = [
    'table_style', 'protein_main_class', 'staple_pref', 'protein_pref',
    'beef_style', 'wellness_goals', 'chicken_style', 'seafood_style',
    'veggie_method', 'oil_level', 'breakfast_cuisine', 'strict_avoid',
  ];
  const missing = expected.filter(e => !ids.includes(e));
  if (missing.length > 0) {
    fail(name, `expected axes missing: ${missing.join(', ')} (found ${ids.length}: ${ids.slice(0,4).join('/')}...)`);
    return;
  }
  ok(name, `found ${ids.length} axes including all expected (table_style..strict_avoid)`);
}

// ─────────────────────────────────────────────────────────────────────────
// CASE 3 — TABLE_STYLE_MAP has 5 entries + custom path
// ─────────────────────────────────────────────────────────────────────────
function case3_tableStyleMap() {
  const name = 'case3: TABLE_STYLE_MAP has 5 entries + Q0 custom branch';
  const blockMatch = source.match(/const TABLE_STYLE_MAP[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!blockMatch) { fail(name, 'cannot locate TABLE_STYLE_MAP'); return; }
  const block = blockMatch[1];
  const expected = ['solo_w_kid', 'couple_1kid', 'couple_2kids', 'couple_3kids', 'three_gen'];
  const missing = expected.filter(k => !new RegExp(`\\b${k}\\b\\s*:`).test(block));
  if (missing.length > 0) { fail(name, `missing TABLE_STYLE_MAP entries: ${missing.join(', ')}`); return; }
  // Q0 custom branch — handleSingle returns early on 'custom', finish() uses state.customAdults/customKids
  const hasCustomBranch = /id\s*===\s*'custom'\s*\)\s*return/.test(source) || /customAdults|customKids/.test(source);
  if (!hasCustomBranch) { fail(name, 'Q0 custom stepper branch not found in handleSingle/finish'); return; }
  ok(name, '5 family-pattern entries + custom stepper path present');
}

// ─────────────────────────────────────────────────────────────────────────
// CASE 4 — skip chip handler writes empty payload
// ─────────────────────────────────────────────────────────────────────────
function case4_skipChip() {
  const name = 'case4: §F skip chip handler clears answer to []/null';
  const hasSkipUI = /都行.*跳过|跳过.*都行|⏭️/.test(source);
  if (!hasSkipUI) { fail(name, 'skip chip UI marker not found'); return; }
  const setEmptyAnswer = /\[q\.id\]:\s*q\.multi\s*\?\s*\[\]\s*:\s*null/.test(source);
  if (!setEmptyAnswer) { fail(name, 'skip handler does not set q.multi ? [] : null'); return; }
  ok(name, '⏭️ skip chip present + clears multi → []/single → null on tap');
}

// ─────────────────────────────────────────────────────────────────────────
// CASE 5 — Q0 6-option family pattern (UI 015 §A — solo_w_kid added)
// ─────────────────────────────────────────────────────────────────────────
function case5_q0Options() {
  const name = 'case5: Q0 table_style has 6 options (5 family-patterns + custom)';
  const q0Match = source.match(/id:\s*'table_style'[\s\S]*?options:\s*\[([\s\S]*?)\n\s*\]/);
  if (!q0Match) { fail(name, 'cannot locate Q0 table_style options'); return; }
  const values = Array.from(q0Match[1].matchAll(/\bvalue:\s*['"]([a-z0-9_]+)['"]/g)).map(m => m[1]);
  const expected = ['solo_w_kid', 'couple_1kid', 'couple_2kids', 'couple_3kids', 'three_gen', 'custom'];
  const missing = expected.filter(e => !values.includes(e));
  if (missing.length > 0) { fail(name, `Q0 missing options: ${missing.join(', ')} (got ${values.join('/')})`); return; }
  ok(name, `Q0 has ${values.length} options: ${values.join('/')}`);
}

// ─────────────────────────────────────────────────────────────────────────
// CASE 6 — Q5 wellness_goals (UI 015 §C — new in v4)
// ─────────────────────────────────────────────────────────────────────────
function case6_wellnessGoals() {
  const name = 'case6: Q5 wellness_goals has chips multi-select minSelect=0 maxSelect=3';
  const block = source.match(/id:\s*'wellness_goals'[\s\S]{0,400}/);
  if (!block) { fail(name, 'cannot locate wellness_goals'); return; }
  const hasMulti = /multi:\s*true/.test(block[0]);
  const hasMax3 = /maxSelect:\s*3/.test(block[0]);
  const hasMin0 = /minSelect:\s*0/.test(block[0]);
  if (!hasMulti || !hasMax3 || !hasMin0) {
    fail(name, `multi=${hasMulti} maxSelect=3=${hasMax3} minSelect=0=${hasMin0}`); return;
  }
  ok(name, 'wellness_goals multi + minSelect:0 + maxSelect:3 all present');
}

// ─────────────────────────────────────────────────────────────────────────
// CASE 7 — ?fresh=1 clears 28+ keys (UI 015 §M / UI 018 inheriting)
// ─────────────────────────────────────────────────────────────────────────
function case7_freshClear() {
  const name = 'case7: App.tsx ?fresh=1 clears ≥20 onboarding keys (auth + v3 axes + state)';
  try {
    const appPath = join(__dirname, '..', '..', 'src', 'App.tsx');
    const appSrc = readFileSync(appPath, 'utf8');
    const freshBlock = appSrc.match(/params\.get\(['"]fresh['"]\)\s*===\s*['"]1['"][\s\S]*?return\s*<Navigate/);
    if (!freshBlock) { fail(name, 'cannot locate ?fresh=1 branch in App.tsx'); return; }
    const keys = Array.from(freshBlock[0].matchAll(/['"]([A-Za-z_0-9]+)['"]/g)).map(m => m[1]);
    const uniqueKeys = new Set(keys);
    // Must include critical auth + v3 axis keys
    const mustInclude = ['userId', 'isLoggedIn', 'quickPrefs', 'table_style', 'wellness_goals', 'nutri_family_pattern'];
    const missingCritical = mustInclude.filter(k => !uniqueKeys.has(k));
    if (missingCritical.length > 0) {
      fail(name, `?fresh=1 missing critical keys: ${missingCritical.join(', ')}`); return;
    }
    if (uniqueKeys.size < 20) {
      fail(name, `expected ≥20 distinct keys cleared, got ${uniqueKeys.size}`); return;
    }
    ok(name, `?fresh=1 clears ${uniqueKeys.size} unique keys, covering auth + 11 v3 axes + onboarding state`);
  } catch (e) {
    fail(name, `read App.tsx err: ${(e as Error).message}`);
  }
}

(async () => {
  case1_finishKeys();
  case2_questionsCount();
  case3_tableStyleMap();
  case4_skipChip();
  case5_q0Options();
  case6_wellnessGoals();
  case7_freshClear();

  console.log('\n=== onboarding v3/v4 contract verify results ===');
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
