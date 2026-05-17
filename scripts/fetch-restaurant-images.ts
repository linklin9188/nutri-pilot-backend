/**
 * fetch-restaurant-images.ts — 给 hkRestaurants.ts 里的每家餐厅抓官网
 * hero 图（og:image / twitter:image），打印出来。后续 backfill 到 DB
 * 的 hk_restaurants.image_url 字段。
 *
 * 用法：
 *   npx tsx scripts/fetch-restaurant-images.ts [--limit=N]
 */
import { readFileSync } from 'fs';

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;

// Parse hkRestaurants.ts source for id / name / link triples.
// 简单 regex extraction — 数据是 const 数组，每 entry block 含
// id: '...', name: '...', link: '...'
function loadRestaurants(): { id: string; name: string; link: string }[] {
  const src = readFileSync('src/lib/hkRestaurants.ts', 'utf8');
  const out: { id: string; name: string; link: string }[] = [];
  // 按 entry { ... }, 拆 — 取每块里的 id / name / link
  const entries = src.match(/\{\s*id:\s*['"][^'"]+['"][\s\S]*?\},/g) ?? [];
  for (const block of entries) {
    const idM   = block.match(/id:\s*['"]([^'"]+)['"]/);
    const nameM = block.match(/name:\s*['"]([^'"]+)['"]/);
    const linkM = block.match(/link:\s*['"]([^'"]+)['"]/);
    if (idM && nameM && linkM) {
      out.push({ id: idM[1], name: nameM[1], link: linkM[1] });
    }
  }
  return out;
}

async function fetchHeroImage(link: string): Promise<{ url: string; source: string } | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(link, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    // Look for og:image / twitter:image (case-insensitive, both attr orders)
    const patterns = [
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
      /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const source = re.source.includes('twitter') ? 'twitter_image' : 'og_image';
        // Resolve relative URLs against the page link
        const u = new URL(m[1], link).toString();
        return { url: u, source };
      }
    }
    return null;
  } catch (e: any) {
    return null;
  }
}

async function verifyImageAccessible(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(url, { method: 'HEAD', signal: ctl.signal });
    clearTimeout(timer);
    const type = res.headers.get('content-type') ?? '';
    return res.ok && type.startsWith('image/');
  } catch { return false; }
}

async function main() {
  const restaurants = loadRestaurants();
  const slice = isFinite(LIMIT) ? restaurants.slice(0, LIMIT) : restaurants;
  console.log(`🏨 Fetching hero images for ${slice.length} restaurants...\n`);

  const results: { id: string; name: string; url?: string; source?: string }[] = [];
  let hit = 0, miss = 0;
  for (const r of slice) {
    process.stdout.write(`  ${r.name.padEnd(20, '　')} `);
    const img = await fetchHeroImage(r.link);
    if (img) {
      const ok = await verifyImageAccessible(img.url);
      if (ok) {
        console.log(`✓ [${img.source}] ${img.url.slice(0, 80)}`);
        results.push({ id: r.id, name: r.name, url: img.url, source: img.source });
        hit++;
      } else {
        console.log(`⚠️  found ${img.source} but URL not accessible: ${img.url.slice(0, 60)}`);
        results.push({ id: r.id, name: r.name });
        miss++;
      }
    } else {
      console.log(`✗ no og:image / twitter:image`);
      results.push({ id: r.id, name: r.name });
      miss++;
    }
    // Be polite to remote servers
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n📊 ${hit} got images / ${miss} missed.`);
  console.log('\n--- Results JSON ---');
  console.log(JSON.stringify(results.filter(r => r.url), null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
