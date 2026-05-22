/**
 * tagBadgeLabels i18n test — TICKET-019 §C
 *
 * Verifies 15 templates (5 channels × 3 langs) + precedence rules:
 *   - explicit badge.label wins over template
 *   - resolveLang fallback chain (explicit > localStorage > navigator > default)
 *   - {festival} / {tag} placeholder substitution
 *   - unresolved placeholders are dropped (no literal "{tag}" leaks)
 *
 * Run: npx tsx scripts/__tests__/tagBadgeLabels-e2e.test.ts
 */
import { labelFor, resolveLang } from '../../src/lib/tagBadgeLabels';
import type { TagBadge } from '../../src/components/TagBadge';

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
function ok(n: string, d: string)   { results.push({ name: n, pass: true,  detail: d }); }
function fail(n: string, d: string) { results.push({ name: n, pass: false, detail: d }); }

function b(kind: TagBadge['kind'], label: string, reason?: string): TagBadge {
  return { kind, icon: 'x', label, reason };
}

function expectEq(name: string, actual: string, expected: string) {
  if (actual === expected) ok(name, `"${actual}"`);
  else fail(name, `got "${actual}", expected "${expected}"`);
}

// ─────────────────────────────────────────────────────────────────────────
// 1) explicit label wins
// ─────────────────────────────────────────────────────────────────────────
expectEq(
  'explicit label wins over template',
  labelFor(b('preference', '红肉控', undefined), 'zh-CN'),
  '红肉控',
);

// ─────────────────────────────────────────────────────────────────────────
// 2) 5 channels × 3 langs = 15 templates
// ─────────────────────────────────────────────────────────────────────────
const matrix = [
  { kind: 'preference',     'zh-CN': '你爱吃',    'zh-HK': '你鍾意食',   'en': 'You love' },
  { kind: 'seasonal',       'zh-CN': '本季当令',  'zh-HK': '當造食材',   'en': 'In season' },
  { kind: 'festival',       'zh-CN': '应景',       'zh-HK': '應節',       'en': 'pick' }, // no reason → placeholder dropped, leading space trimmed
  { kind: 'school_balance', 'zh-CN': '孩子补',     'zh-HK': '小朋友補',   'en': 'Kid:' },
  { kind: 'weekly_balance', 'zh-CN': '本周补',     'zh-HK': '本週補',     'en': 'Week:' },
] as const;

for (const row of matrix) {
  for (const lang of ['zh-CN', 'zh-HK', 'en'] as const) {
    const out = labelFor({ kind: row.kind as TagBadge['kind'], icon: 'x', label: '' }, lang);
    expectEq(`template ${row.kind} / ${lang}`, out, row[lang]);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) festival placeholder substitution
// ─────────────────────────────────────────────────────────────────────────
expectEq(
  'festival placeholder fills from reason',
  labelFor(b('festival', '', '端午'), 'zh-CN'),
  '端午 应景',
);
expectEq(
  'festival placeholder fills from reason (en)',
  labelFor(b('festival', '', '中秋'), 'en'),
  '中秋 pick',
);

// ─────────────────────────────────────────────────────────────────────────
// 4) school_balance / weekly_balance tag placeholder
// ─────────────────────────────────────────────────────────────────────────
expectEq(
  'school_balance tag from reason "补 纤维"',
  labelFor(b('school_balance', '', '补 纤维'), 'zh-CN'),
  '孩子补 纤维',
);
expectEq(
  'weekly_balance tag from reason "本周海鲜未达标"',
  labelFor(b('weekly_balance', '', '本周海鲜未达标 缺 蛋白'), 'zh-HK'),
  '本週補 蛋白',
);

// ─────────────────────────────────────────────────────────────────────────
// 5) unresolved placeholder is dropped
// ─────────────────────────────────────────────────────────────────────────
expectEq(
  'festival no reason → placeholder dropped',
  labelFor(b('festival', '', undefined), 'zh-CN'),
  '应景',
);
expectEq(
  'school_balance no reason → placeholder dropped',
  labelFor(b('school_balance', '', undefined), 'en'),
  'Kid:',
);

// ─────────────────────────────────────────────────────────────────────────
// 6) resolveLang fallback chain (Node env: no window → 'zh-CN' default)
// ─────────────────────────────────────────────────────────────────────────
{
  const actual = resolveLang();
  if (actual === 'zh-CN') ok('resolveLang default in Node = zh-CN', actual);
  else fail('resolveLang default in Node', `expected zh-CN, got ${actual}`);
}
{
  const actual = resolveLang('en');
  if (actual === 'en') ok('resolveLang explicit arg wins', actual);
  else fail('resolveLang explicit arg', `expected en, got ${actual}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────
console.log('\n=== tagBadgeLabels i18n results ===');
let pass = 0;
for (const r of results) {
  const tag = r.pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${tag}  ${r.name}`);
  console.log(`        ${r.detail}`);
  if (r.pass) pass++;
}
console.log(`\nTotal: ${pass}/${results.length} pass`);
process.exit(pass === results.length ? 0 : 1);
