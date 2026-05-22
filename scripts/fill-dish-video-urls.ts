/**
 * fill-dish-video-urls.ts — TICKET-20260522-012 §A
 *
 * Bulk-fills dishes.video_url / video_lang / video_platform for the in-scope
 * subset (lunch + dinner × meat/seafood/poultry/soup). Other dishes (breakfast,
 * pure veg, simple soup, dessert) are skipped — they don't get video tutorials
 * per business memory project_video_tutorial_scope.
 *
 * Placeholder URL pattern: https://video.aieats.com/{dish_id}.mp4 (slug column
 * doesn't exist, so id is the safe key). zh-HK lang, self platform. Real
 * videos can be backfilled later by operations.
 *
 * Idempotent: skips rows that already have video_url set, so safe to re-run.
 *
 * Run:
 *   npx tsx scripts/fill-dish-video-urls.ts            # dry-run (default for safety)
 *   npx tsx scripts/fill-dish-video-urls.ts --commit   # actually UPDATE
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qoyuafqqkfyrqlthsvws.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pierNkIn2sr7JLbAe-zvuA_Go79HOyd';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const COMMIT = process.argv.includes('--commit');
const LANG = 'zh-HK';
const PLATFORM = 'self';
const URL_BASE = 'https://video.aieats.com';

type Row = {
  id: string;
  title_zh: string | null;
  meal_type: string | null;
  course_type: string | null;
  protein_main_class: string | null;
  origin_cuisine: string | null;
  video_url: string | null;
};

(async () => {
  console.log(`[fill-dish-video-urls] mode = ${COMMIT ? 'COMMIT (live UPDATE)' : 'DRY-RUN (no writes)'}`);
  console.log(`[fill-dish-video-urls] URL_BASE = ${URL_BASE}/{id}.mp4`);
  console.log(`[fill-dish-video-urls] LANG=${LANG} PLATFORM=${PLATFORM}`);
  console.log();

  // Fetch full lunch+dinner pool — small enough (~600 rows) to bring client-side.
  // Filtering client-side avoids brittle PostgREST OR-chain syntax for soup detection.
  const { data, error } = await sb
    .from('dishes')
    .select('id, title_zh, meal_type, course_type, protein_main_class, origin_cuisine, video_url')
    .in('meal_type', ['lunch', 'dinner'])
    .limit(5000);
  if (error) {
    console.error('SELECT failed:', error.message);
    process.exit(1);
  }
  console.log(`[fill-dish-video-urls] fetched ${data?.length ?? 0} rows in lunch+dinner pool`);

  const inScopePmc = new Set(['red', 'seafood', 'white']);
  const inScope = (r: Row) =>
    inScopePmc.has(r.protein_main_class ?? '') || r.course_type === 'soup';

  const scopedAll = (data ?? []).filter(inScope) as Row[];
  const alreadyFilled = scopedAll.filter(r => r.video_url != null);
  const toFill = scopedAll.filter(r => r.video_url == null);

  // sub-counts for audit
  const subCount = (pred: (r: Row) => boolean) => scopedAll.filter(pred).length;
  console.log('\n=== scope breakdown (in lunch+dinner) ===');
  console.log(`   pmc=red                  : ${subCount(r => r.protein_main_class === 'red')}`);
  console.log(`   pmc=seafood              : ${subCount(r => r.protein_main_class === 'seafood')}`);
  console.log(`   pmc=white                : ${subCount(r => r.protein_main_class === 'white')}`);
  console.log(`   course_type=soup         : ${subCount(r => r.course_type === 'soup')}`);
  console.log(`   ─────────────────────────────`);
  console.log(`   total in scope           : ${scopedAll.length}`);
  console.log(`   already filled           : ${alreadyFilled.length}`);
  console.log(`   to fill                  : ${toFill.length}`);

  if (!COMMIT) {
    console.log('\n[DRY-RUN] no UPDATE issued. re-run with --commit to apply.');
    console.log('first 5 to-fill rows:');
    for (const r of toFill.slice(0, 5)) {
      console.log(`   ${r.id}  ${r.title_zh}  pmc=${r.protein_main_class}  course=${r.course_type}  origin=${r.origin_cuisine}`);
    }
    return;
  }

  // COMMIT path — UPDATE one-by-one (no PostgREST bulk upsert via publishable key).
  // ~350 rows × ~80ms each ≈ 30s total. Acceptable.
  let ok = 0;
  let err = 0;
  for (const r of toFill) {
    const videoUrl = `${URL_BASE}/${r.id}.mp4`;
    const { error: upErr } = await sb
      .from('dishes')
      .update({ video_url: videoUrl, video_lang: LANG, video_platform: PLATFORM })
      .eq('id', r.id);
    if (upErr) {
      err++;
      if (err <= 5) console.error(`   UPDATE failed for ${r.id}: ${upErr.message}`);
    } else {
      ok++;
    }
  }
  console.log(`\n[COMMIT] done — Updated ${ok} / Errors ${err}`);

  // Verify final count
  const { count: finalCount } = await sb
    .from('dishes')
    .select('id', { count: 'exact', head: true })
    .not('video_url', 'is', null);
  console.log(`[VERIFY] dishes.video_url IS NOT NULL = ${finalCount}`);
})();
