/**
 * verify-dish-images.ts — TICKET-095 C 抽样真测
 *
 * 全 DB dish image_url HEAD 请求, 找出 4xx/5xx dead URL.
 * 不下载 image body, 只看 HTTP status (避免带宽).
 */

import pg from 'pg';
import { config } from 'dotenv';
config();

const db = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function checkOne(url: string): Promise<{ ok: boolean; status: number | string }> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, status: e?.message?.slice(0, 40) || 'error' };
  }
}

async function main() {
  const { rows } = await db.query<{ id: string; title_zh: string; image_url: string }>(`
    SELECT id, title_zh, image_url
    FROM dishes
    WHERE image_url IS NOT NULL AND image_url <> ''
    ORDER BY title_zh
  `);

  console.log(`🔍 Verifying ${rows.length} image_url (HEAD requests, ~30s)\n`);

  const failed: { id: string; title: string; url: string; status: any }[] = [];
  let ok = 0;
  const CONCURRENCY = 10;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(r => checkOne(r.image_url)));
    results.forEach((res, j) => {
      const r = batch[j];
      if (res.ok) {
        ok++;
      } else {
        failed.push({ id: r.id, title: r.title_zh, url: r.image_url, status: res.status });
      }
    });
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, rows.length)}/${rows.length} (ok=${ok} fail=${failed.length})`);
  }
  console.log('\n');

  console.log(`✅ OK: ${ok}/${rows.length}`);
  console.log(`❌ Failed: ${failed.length}/${rows.length}`);
  if (failed.length > 0) {
    console.log('\nFirst 20 failures:');
    failed.slice(0, 20).forEach(f => {
      console.log(`  [${f.status}] ${f.title} → ${f.url.slice(0, 80)}`);
    });
  }
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
