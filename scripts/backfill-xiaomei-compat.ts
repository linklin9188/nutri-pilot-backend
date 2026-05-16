/**
 * backfill-xiaomei-compat.ts — rule-based scan of every dish to flag
 * whether a 小美 / Thermomix-class cooking robot can plausibly make it
 * end-to-end.
 *
 * Strategy: scan cook_steps_json + prep_steps_json + course_type for
 * known-incompatible operations. Default to TRUE for everything else
 * (covers the typical stir-fry / soup / stew / sauce 家常菜 catalog).
 *
 * Run:  npx tsx scripts/backfill-xiaomei-compat.ts
 * Flags: --dry-run  preview without writing
 */
import pg from 'pg';
import { config } from 'dotenv';

config();
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DRY = process.argv.includes('--dry-run');

// Incompatible operation buckets — each maps to a human-readable reason
// surfaced in the UI when a user asks "why doesn't 小美 do this one".
const INCOMPAT: Array<{ pattern: RegExp; reason: string }> = [
  // Oven-only (the robot has no oven)
  { pattern: /(烤箱|预热.*°|180°C|200°C|220°C|烤盘|烘焙|烤至金黄|入烤箱|放入烤箱|oven|preheat|bake|broil|roast in oven)/i,
    reason: '需要烤箱' },
  // Deep frying / open-fire grilling (no fryer / no flame)
  { pattern: /(油炸|炸至|deep fry|炸锅|入油锅|180.*?油温|油温.*180|烧热.*油.*炸|炸熟)/i,
    reason: '需要油炸' },
  { pattern: /(炭烤|明火|炭火|烧烤架|charcoal|grill over|barbecue|烧烤|炙烤|烤架)/i,
    reason: '需要明火/烤架' },
  // Manual dim-sum folding / dough shaping the robot can't do
  { pattern: /(包饺子|包子|包馄饨|包春卷|包.*?馅|揉成饺子皮|手工.*?捏|捏成.*?状|擀成.*?圆形|擀.*?面皮|裹上)/,
    reason: '需手工包/捏' },
  // Raw / cold-plated assembly
  { pattern: /(刺身|生鱼片|sashimi|tartare|生切)/i,
    reason: '生食/手工拼盘' },
  // Air fryer / pressure cooker only (different appliance class)
  { pattern: /(空气炸锅|air fry|高压锅|pressure cooker|instant pot)/i,
    reason: '需空气炸锅/高压锅' },
  // Smoking / curing / advanced
  { pattern: /(烟熏|smoke|风干|腌制.*?\d+\s*天|low-temp|sous vide|低温慢煮)/i,
    reason: '需特殊设备' },
];

interface Dish {
  id: string;
  title_zh: string;
  course_type: string | null;
  prep_steps_json: any[] | null;
  cook_steps_json: any[] | null;
}

function evaluateDish(d: Dish): { compatible: boolean; reason: string | null } {
  // Concat ALL step text we can find
  const corpus = [
    ...(d.prep_steps_json ?? []).flatMap((s: any) => [s.action_zh, s.action_en, s.ingredient_zh]),
    ...(d.cook_steps_json ?? []).flatMap((s: any) => [s.action_zh, s.action_en]),
  ].filter(Boolean).join(' \n ');

  for (const rule of INCOMPAT) {
    if (rule.pattern.test(corpus)) {
      return { compatible: false, reason: rule.reason };
    }
  }
  // Dessert subtype that's almost always oven (cake/tart/pie) — extra guard
  if (d.course_type === 'dessert' && /(蛋糕|tart|pie|cookie|曲奇|布朗尼|cheesecake|芝士蛋糕|班戟|wafer|司康)/i.test(d.title_zh)) {
    return { compatible: false, reason: '需要烤箱(甜点)' };
  }
  return { compatible: true, reason: null };
}

async function main() {
  const { rows } = await db.query<Dish>(`
    SELECT id, title_zh, course_type, prep_steps_json, cook_steps_json
    FROM dishes
    WHERE cook_steps_json IS NOT NULL
    ORDER BY title_zh
  `);
  console.log(`Scanning ${rows.length} dishes...\n`);

  let yes = 0, no = 0;
  const reasonCounts: Record<string, number> = {};
  const updates: Array<[string, boolean, string | null]> = [];

  for (const d of rows) {
    const r = evaluateDish(d);
    if (r.compatible) yes++; else { no++; reasonCounts[r.reason!] = (reasonCounts[r.reason!] ?? 0) + 1; }
    updates.push([d.id, r.compatible, r.reason]);
  }

  console.log(`✅ Compatible: ${yes}/${rows.length}`);
  console.log(`❌ Incompatible: ${no}/${rows.length}`);
  console.log('\nReason breakdown:');
  Object.entries(reasonCounts).sort((a,b) => b[1] - a[1]).forEach(([r,n]) => console.log(`  ${r}: ${n}`));

  // Sample 10 incompatible to sanity-check the rules
  console.log('\n=== 10 random incompatible dishes ===');
  const incompat = rows.filter((_,i) => !updates[i][1]).sort(() => Math.random() - 0.5).slice(0, 10);
  incompat.forEach(d => {
    const u = updates.find(x => x[0] === d.id)!;
    console.log(`  - ${d.title_zh}  →  ${u[2]}`);
  });

  if (DRY) {
    console.log('\n[dry-run] — no DB writes.');
    await db.end();
    return;
  }

  // Batch update
  console.log('\nWriting to DB...');
  for (const [id, compat, reason] of updates) {
    await db.query(
      `UPDATE dishes SET xiaomei_compatible = $1, xiaomei_incompat_reason = $2 WHERE id = $3`,
      [compat, reason, id]
    );
  }
  console.log(`✅ Wrote ${updates.length} rows`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
