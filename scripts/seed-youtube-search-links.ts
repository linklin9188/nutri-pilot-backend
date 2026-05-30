/**
 * seed-youtube-search-links.ts — TICKET-108 v2 (老板 5/30 拍板 A)
 *
 * 取代 seed-youtube-cooking-videos.ts (Gemini 推荐版).
 *
 * 真相: gemini-2.5-flash 能说出真实烹饪频道名, 但具体 11 位 YouTube video id
 * 必然幻觉 (LLM 记不住随机串, oEmbed 验证 100% 拦截 404). specific 链接走不通.
 *
 * 老板铁律"不捏造数据" → 全用 YouTube 搜索 URL:
 *   video_url = youtube.com/results?search_query=<中文菜名> 做法
 *   点进去 = 该菜真实搜索结果, 菲佣自己挑第一个. 100% 真实, 0 幻觉, 0 Gemini.
 *
 * 中文搜索词 (不是 EN) — YouTube 中文菜谱视频质量 + 数量远超英文, 且菲佣端
 * 看视频是"看手法"不靠语言, 中文菜谱画面最清楚.
 *
 * Modes:
 *   --dry-run   不写库, 打印样本
 *   --live      写 video_url + video_platform='youtube_search'
 *   --all       含已有 video_url 的也覆盖 (默认只补 NULL 的)
 */
import pg from 'pg';
import 'dotenv/config';

const DRY = !process.argv.includes('--live');
const ALL = process.argv.includes('--all');

function searchUrl(titleZh: string): string {
  // 中文菜名 + "做法" → YouTube 搜索. encodeURIComponent 处理中文。
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(titleZh + ' 做法 教程')}`;
}

(async () => {
  console.log(`[seed-youtube-search-links] mode=${DRY ? 'DRY' : 'LIVE'} scope=${ALL ? 'ALL' : 'NULL-only'}`);
  const c = new pg.Pool({ connectionString: process.env.DIRECT_DATABASE_URL!, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 30000 });
  c.on('error', (e:any) => console.error('[pool]', e?.message ?? e));

  // 保留 video_platform='self' 的真实视频 (Backend 灌的 348 道 zh-HK 真链接).
  // 其余全覆盖: NULL 的 + 被杀 video phase 写的英文 youtube_search (英文搜中餐差).
  const where = ALL ? `title_zh IS NOT NULL AND title_zh <> ''`
                    : `(video_platform IS DISTINCT FROM 'self') AND title_zh IS NOT NULL AND title_zh <> ''`;
  const rows = await c.query(`SELECT id, title_zh FROM dishes WHERE ${where} ORDER BY id`);
  console.log(`Found ${rows.rows.length} dishes to set search link.\n`);

  if (DRY) {
    for (const r of rows.rows.slice(0, 8)) console.log(`  ${r.title_zh} → ${searchUrl(r.title_zh)}`);
    console.log(`\n(dry-run, would update ${rows.rows.length})`);
    await c.end();
    return;
  }

  let done = 0;
  for (const r of rows.rows) {
    try {
      await c.query(
        `UPDATE dishes SET video_url = $1, video_platform = 'youtube_search', video_lang = 'zh-search' WHERE id = $2`,
        [searchUrl(r.title_zh), r.id],
      );
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${rows.rows.length}`);
    } catch (e:any) {
      console.error(`  ❌ ${r.title_zh}: ${e?.message ?? e}`);
    }
  }
  console.log(`\n=== done ${done}/${rows.rows.length} ===`);

  // verify coverage
  const cov = await c.query(`SELECT COUNT(*) FILTER (WHERE video_url IS NOT NULL AND video_url <> '') n, COUNT(*) tot FROM dishes`);
  console.log(`video_url coverage: ${cov.rows[0].n}/${cov.rows[0].tot}`);
  const plat = await c.query(`SELECT video_platform, COUNT(*) n FROM dishes WHERE video_url IS NOT NULL AND video_url<>'' GROUP BY video_platform ORDER BY n DESC`);
  for (const p of plat.rows) console.log(`  ${p.video_platform ?? '(null)'}: ${p.n}`);
  await c.end();
})();
