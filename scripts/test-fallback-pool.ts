/**
 * TICKET-088 verification: simulate getFallbackImage() across all
 * NULL-image dishes and report the collision rate.
 *
 * Usage: npx tsx scripts/test-fallback-pool.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
import { getFallbackImage, _getPoolStats } from '../src/lib/dishImageFallback';

config();
const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const { rows } = await client.query(`
    SELECT id, title_zh, main_ingredient, origin_cuisine, cook_method, flavor_tags, seasonal_tag
    FROM dishes
    WHERE image_url IS NULL
  `);

  const stats = _getPoolStats();
  console.log('=== Pool stats ===');
  console.log(`池数: ${stats.poolCount}`);
  console.log(`总图数: ${stats.totalImages}`);
  Object.entries(stats.perPool).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log(`\n=== Coverage test: ${rows.length} NULL-image dishes ===`);

  const urlToTitles = new Map<string, string[]>();
  const poolHits = new Map<string, number>();

  for (const r of rows) {
    const url = getFallbackImage(r as any);
    if (!urlToTitles.has(url)) urlToTitles.set(url, []);
    urlToTitles.get(url)!.push(r.title_zh);

    // Extract sig prefix to classify pool
    const sigMatch = url.match(/sig=(\d+)/);
    const sig = sigMatch ? parseInt(sigMatch[1], 10) : 0;
    let poolName = 'unknown';
    if (sig >= 100 && sig < 200) poolName = 'beef';
    else if (sig >= 200 && sig < 300) poolName = 'pork';
    else if (sig >= 300 && sig < 400) poolName = 'chicken';
    else if (sig >= 400 && sig < 500) poolName = 'duck';
    else if (sig >= 500 && sig < 600) poolName = 'lamb';
    else if (sig >= 600 && sig < 700) poolName = 'fish';
    else if (sig >= 700 && sig < 800) poolName = 'shrimp';
    else if (sig >= 800 && sig < 900) poolName = 'crab_shellfish';
    else if (sig >= 900 && sig < 1000) poolName = 'tofu_egg';
    else if (sig >= 1000 && sig < 1100) poolName = 'veggie_green';
    else if (sig >= 1100 && sig < 1200) poolName = 'veggie_root';
    else if (sig >= 1200 && sig < 1300) poolName = 'veggie_misc';
    else if (sig >= 1300 && sig < 1400) poolName = 'noodle';
    else if (sig >= 1400 && sig < 1500) poolName = 'rice_carb';
    else if (sig >= 1500 && sig < 1600) poolName = 'soup';
    else if (sig >= 1600 && sig < 1700) poolName = 'dessert_fruit';
    else if (sig >= 1700 && sig < 1800) poolName = 'cold_dish';
    else if (sig >= 1800 && sig < 1900) poolName = 'default';
    poolHits.set(poolName, (poolHits.get(poolName) ?? 0) + 1);
  }

  const uniqueUrls = urlToTitles.size;
  const collisionRate = ((rows.length - uniqueUrls) / rows.length * 100).toFixed(1);
  console.log(`不同图: ${uniqueUrls} / ${rows.length}`);
  console.log(`撞图率: ${collisionRate}%`);
  console.log(`理论下限: ${((rows.length - Math.min(rows.length, stats.totalImages)) / rows.length * 100).toFixed(1)}%`);

  console.log('\n=== Pool hit distribution ===');
  Array.from(poolHits.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v} 道`);
  });

  console.log('\n=== Top-5 collisions (most-shared URLs) ===');
  const collisions = Array.from(urlToTitles.entries())
    .filter(([, ts]) => ts.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);
  collisions.forEach(([url, titles]) => {
    console.log(`  ${url.substring(0, 80)}...`);
    console.log(`    撞 ${titles.length} 道: ${titles.slice(0, 6).join(', ')}${titles.length > 6 ? ' ...' : ''}`);
  });

  console.log('\n=== Sample 5 dishes (covering 牛/猪/鱼/菜/面) ===');
  const samples = [
    rows.find((r: any) => /牛/.test(r.title_zh)),
    rows.find((r: any) => /猪|排骨|肉(?!.*面)/.test(r.title_zh)),
    rows.find((r: any) => /鱼/.test(r.title_zh) && !/汤/.test(r.title_zh)),
    rows.find((r: any) => /菜|蔬/.test(r.title_zh)),
    rows.find((r: any) => /面|粉/.test(r.title_zh)),
  ].filter(Boolean);
  for (const s of samples) {
    console.log(`  ${(s as any).title_zh} → ${getFallbackImage(s as any)}`);
  }

  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
