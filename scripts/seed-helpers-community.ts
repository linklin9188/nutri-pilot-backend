/**
 * seed-helpers-community.ts — TICKET-029 P0 Helper Community sprint 1
 *
 * Gemini 生成 20 helper 画像 + 100 帖子 + 互动 (likes + comments) → INSERT prod
 * supabase (user_profiles + helper_posts + helper_likes + helper_comments)。
 *
 * Database 025 (migration 079) 已 ship 三张表 + 4 个 trigger 自维护 like_count /
 * comment_count denormalized count。
 *
 * Usage:
 *   npx tsx scripts/seed-helpers-community.ts --dry-run          # 不写库, 打印
 *   npx tsx scripts/seed-helpers-community.ts --small            # 3 helper / 15 帖 (小批量验证)
 *   npx tsx scripts/seed-helpers-community.ts                    # 全量 20 helper / 100 帖
 *
 * 环境变量:
 *   DIRECT_DATABASE_URL  Postgres direct connection
 *   GEMINI_API_KEY       (或 VITE_GEMINI_API_KEY) Gemini API key (script 直连模式)
 */

import pg from 'pg';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
config();

const DB_URL     = process.env.DIRECT_DATABASE_URL!;
const GEMINI_KEY = process.env.VITE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
const MODEL      = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

const DRY_RUN = process.argv.includes('--dry-run');
const SMALL   = process.argv.includes('--small');
const N_HELPERS = SMALL ? 3 : 20;
const POSTS_PER_HELPER = SMALL ? 3 : 5;

if (!GEMINI_KEY) { console.error('❌ GEMINI_API_KEY 未设'); process.exit(1); }
if (!DB_URL)     { console.error('❌ DIRECT_DATABASE_URL 未设'); process.exit(1); }

// ── Helper profile mix (ticket §A) — 5+ cuisines / 10 PH + 5 ID + 5 CN / skill 1-5 分布 ──
interface HelperProfile {
  id: string;
  display_name: string;
  hometown_cuisine: string;
  dietary_goal: string;
  taste_pref: string;
  origin_country: 'PH' | 'ID' | 'CN';
  cooking_skill_level: 1 | 2 | 3 | 4 | 5;
  age: number;
  bio: string;
  created_at: Date;
}

// 20 helper 名 (虚构, 不用真人名) — PH 10 / ID 5 / CN 5
const SMALL_HELPER_DRAFT: Array<Pick<HelperProfile, 'display_name' | 'origin_country' | 'hometown_cuisine' | 'cooking_skill_level' | 'age'>> = [
  { display_name: '罗西娜 Rosina',  origin_country: 'PH', hometown_cuisine: 'cantonese',       cooking_skill_level: 4, age: 38 },
  { display_name: '安娜玛丽 Anamaria', origin_country: 'PH', hometown_cuisine: 'cantonese',     cooking_skill_level: 5, age: 45 },
  { display_name: '艾米 Emy',       origin_country: 'PH', hometown_cuisine: 'cantonese',       cooking_skill_level: 3, age: 32 },
  { display_name: '玛丽 Mary',     origin_country: 'PH', hometown_cuisine: 'sichuan',         cooking_skill_level: 2, age: 28 },
  { display_name: '海伦 Helen',     origin_country: 'PH', hometown_cuisine: 'jiangnan',        cooking_skill_level: 4, age: 41 },
  { display_name: '约瑟 Josie',    origin_country: 'PH', hometown_cuisine: 'cantonese',       cooking_skill_level: 3, age: 35 },
  { display_name: '丽莉 Lily',     origin_country: 'PH', hometown_cuisine: 'hk_macau_tw',    cooking_skill_level: 4, age: 39 },
  { display_name: '安妮 Annie',    origin_country: 'PH', hometown_cuisine: 'cantonese',       cooking_skill_level: 5, age: 47 },
  { display_name: '苏菲 Sophie',   origin_country: 'PH', hometown_cuisine: 'northern',        cooking_skill_level: 3, age: 33 },
  { display_name: '若兰 Rolan',    origin_country: 'PH', hometown_cuisine: 'cantonese',       cooking_skill_level: 1, age: 26 },
  { display_name: '茉莉 Melati',   origin_country: 'ID', hometown_cuisine: 'southeast_asian', cooking_skill_level: 4, age: 36 },
  { display_name: '德薇 Dewi',     origin_country: 'ID', hometown_cuisine: 'southeast_asian', cooking_skill_level: 3, age: 30 },
  { display_name: '苏丽 Suli',     origin_country: 'ID', hometown_cuisine: 'jiangnan',        cooking_skill_level: 5, age: 43 },
  { display_name: '凯莎 Kesha',    origin_country: 'ID', hometown_cuisine: 'cantonese',       cooking_skill_level: 2, age: 29 },
  { display_name: '莉娜 Lina',     origin_country: 'ID', hometown_cuisine: 'southeast_asian', cooking_skill_level: 3, age: 31 },
  { display_name: '王小芳',         origin_country: 'CN', hometown_cuisine: 'sichuan',         cooking_skill_level: 4, age: 40 },
  { display_name: '李美华',         origin_country: 'CN', hometown_cuisine: 'jiangnan',        cooking_skill_level: 5, age: 50 },
  { display_name: '张春梅',         origin_country: 'CN', hometown_cuisine: 'northern',        cooking_skill_level: 3, age: 37 },
  { display_name: '陈秀英',         origin_country: 'CN', hometown_cuisine: 'cantonese',       cooking_skill_level: 4, age: 44 },
  { display_name: '吴丽萍',         origin_country: 'CN', hometown_cuisine: 'sichuan',         cooking_skill_level: 2, age: 27 },
];

const HOMETOWN_TO_GOAL: Record<string, string> = {
  cantonese: 'maintain',  sichuan: 'maintain',  jiangnan: 'maintain',
  northern: 'maintain',   hk_macau_tw: 'maintain',  southeast_asian: 'maintain',
};
const HOMETOWN_TO_TASTE: Record<string, string> = {
  cantonese: 'light',     sichuan: 'spicy',     jiangnan: 'light',
  northern: 'savory',     hk_macau_tw: 'light', southeast_asian: 'savory',
};

async function callGeminiJson<T>(prompt: string): Promise<T> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini error: ${JSON.stringify(data?.error ?? data)}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return JSON.parse(text) as T;
}

async function genBios(drafts: typeof SMALL_HELPER_DRAFT): Promise<string[]> {
  const list = drafts.map((d, i) =>
    `${i+1}. ${d.display_name} (${d.origin_country} 籍, ${d.age}岁, 擅长${d.hometown_cuisine}菜, 烹饪水平${d.cooking_skill_level}/5)`
  ).join('\n');
  const prompt = `你是 ${drafts.length} 位香港家政服务员菲佣/印佣/华人姨妈的代笔, 各自写 ${drafts.length === 3 ? '一段' : '一段'} 200 字以内的中文自我介绍 (bio)。

人物清单:
${list}

要求:
- 每段 bio 体现 (a) 来港 / 来雇主家的年限和经历 (b) 自己最擅长 / 最喜欢做的 1-2 道菜 (c) 烹饪水平自评 — 水平 1-2 写 "还在学习, 偶尔糊锅", 水平 3 写 "家常拿手, 雇主喜欢吃", 水平 4-5 写 "技术细节 / 火候掌握 / 雇主请客都让我做主"
- 风格朴实接地气, 不要文学化, 像真人微博自我介绍
- 严格输出 JSON array of strings: ["bio1","bio2","bio3",...] 不含其他说明

按上面人物 1-${drafts.length} 顺序输出。`;
  return await callGeminiJson<string[]>(prompt);
}

interface GeneratedPost {
  title: string;
  body: string;
}

async function genPostsForHelper(h: HelperProfile, n: number): Promise<GeneratedPost[]> {
  const styleHint = h.cooking_skill_level >= 4
    ? '技术细节, 火候控制, 时间精确到分钟, 雇主反馈"超惊艳", 写菜的来历或秘诀'
    : h.cooking_skill_level === 3
    ? '家常拿手菜, 简单做法 + 调味 tips, 雇主全家爱吃, 偶尔分享菜市场买菜的话题'
    : '学习中, 写小困惑 / 小失败 / 小成就, 偶尔求教其他姨妈, 风格谦虚';
  const prompt = `你代笔 ${h.display_name} (${h.origin_country} 籍, ${h.age}岁, 擅长${h.hometown_cuisine}菜, 烹饪水平${h.cooking_skill_level}/5) 写 ${n} 篇微博风格的做菜帖。

风格:
${styleHint}

每帖结构:
- title: 10-20 字, 像真人发帖, e.g. "今天教大家做姨妈最爱的清蒸鲈鱼" / "番茄炒蛋怎么炒才不出水" / "雇主家小朋友爱吃的咖喱鸡饭做法"
- body: 200-400 字, 真人口吻, 含具体食材分量 / 火候 / 时间 / tips / 雇主反馈
- 不要文学化, 不要 emoji 堆砌, 偶尔 1-2 个 emoji ok (☺️ 👍 等)

输出 JSON array: [{"title":"...","body":"..."}, ...] ${n} 条, 不含其他说明。`;
  return await callGeminiJson<GeneratedPost[]>(prompt);
}

async function main() {
  console.log(`\n=== seed-helpers-community.ts — TICKET-029 ===`);
  console.log(`  N_HELPERS=${N_HELPERS} (${SMALL ? 'SMALL batch' : 'FULL'}) | POSTS_PER_HELPER=${POSTS_PER_HELPER} | DRY_RUN=${DRY_RUN}\n`);

  // ── §A 生成 20 (或 small=3) 个 helper profile ────────────────────────────
  const drafts = SMALL_HELPER_DRAFT.slice(0, N_HELPERS);
  console.log(`▼ 调 Gemini 生成 ${drafts.length} 个 helper bio ...`);
  const bios = await genBios(drafts);
  if (bios.length !== drafts.length) {
    throw new Error(`bio count mismatch: got ${bios.length} want ${drafts.length}`);
  }
  const helpers: HelperProfile[] = drafts.map((d, i) => {
    const createdDaysAgo = 1 + Math.floor(Math.random() * 90);
    return {
      id: randomUUID(),
      display_name: d.display_name,
      hometown_cuisine: d.hometown_cuisine,
      dietary_goal: HOMETOWN_TO_GOAL[d.hometown_cuisine] ?? 'maintain',
      taste_pref: HOMETOWN_TO_TASTE[d.hometown_cuisine] ?? 'savory',
      origin_country: d.origin_country,
      cooking_skill_level: d.cooking_skill_level,
      age: d.age,
      bio: bios[i],
      created_at: new Date(Date.now() - createdDaysAgo * 86400000),
    };
  });
  console.log(`  ✅ ${helpers.length} bios 生成完毕\n`);
  console.log(`  示例 helper #1: ${helpers[0].display_name} (${helpers[0].origin_country}, 水平 ${helpers[0].cooking_skill_level})`);
  console.log(`  bio 前 100 字: ${helpers[0].bio.slice(0, 100)}...\n`);

  // ── §B 生成每 helper N posts ────────────────────────────────────────────
  console.log(`▼ 调 Gemini 生成 ${helpers.length} × ${POSTS_PER_HELPER} = ${helpers.length * POSTS_PER_HELPER} 帖 ...`);
  type PostRecord = { helper_id: string; title: string; body: string; cooking_skill_level: number; created_at: Date };
  const posts: PostRecord[] = [];
  for (const h of helpers) {
    const gen = await genPostsForHelper(h, POSTS_PER_HELPER);
    for (const g of gen) {
      const createdDaysAgo = Math.floor(Math.random() * 60);
      posts.push({
        helper_id: h.id,
        title: g.title,
        body: g.body,
        cooking_skill_level: h.cooking_skill_level,
        created_at: new Date(Date.now() - createdDaysAgo * 86400000),
      });
    }
    console.log(`  ✅ ${h.display_name}: ${gen.length} 帖`);
  }
  console.log(`\n  全部 ${posts.length} 帖生成完毕`);
  console.log(`  示例帖 #1 title: ${posts[0].title}`);
  console.log(`  body 前 100 字: ${posts[0].body.slice(0, 100)}...\n`);

  // ── §C 生成互动 (likes + comments) ────────────────────────────────────────
  console.log(`▼ 生成 likes + comments 互动数据 ...`);
  type LikeRecord = { post_id: string; liker_id: string };
  type CommentRecord = { post_id: string; commenter_id: string; body: string };
  const COMMENT_TEMPLATES = [
    '学到了!', '这个我也试试', '雇主家小朋友爱吃这个吗?',
    '火候掌握得真好', '我做的总是糊锅 求秘诀', '这个调味比例记下了',
    '上次做这个差点失败 谢谢分享', '👍 看着就香',
    '我家姨妈也常做这个', '请问这个能用电饭锅做吗?',
    '配什么主食好呢?', '☺️ 看着就有食欲', '收藏起来',
    '我也是 ' + ['cantonese', 'sichuan', 'northern'][Math.floor(Math.random()*3)] + ' 的姨妈',
    '请问需要冷藏多久?', '小朋友会不会觉得辣?', '可以替换其他蔬菜吗?',
    '雇主反馈如何?', '这个我家小朋友肯定爱吃', '感谢分享!',
  ];
  const likes: LikeRecord[] = [];
  const comments: CommentRecord[] = [];
  for (const p of posts) {
    const postId = randomUUID();   // placeholder, real ID assigned at INSERT
    (p as any)._postId = postId;
    const nLikes = 3 + Math.floor(Math.random() * 6);    // 3-8
    const nComments = 2 + Math.floor(Math.random() * 4); // 2-5
    const likers = [...helpers].sort(() => Math.random() - 0.5).slice(0, nLikes);
    for (const liker of likers) {
      if (liker.id === p.helper_id) continue;   // 自己不点自己 (实际 sql UNIQUE 也防止)
      likes.push({ post_id: postId, liker_id: liker.id });
    }
    const commenters = [...helpers].sort(() => Math.random() - 0.5).slice(0, nComments);
    for (const c of commenters) {
      if (c.id === p.helper_id) continue;
      const body = COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)];
      comments.push({ post_id: postId, commenter_id: c.id, body });
    }
  }
  console.log(`  ✅ likes: ${likes.length} | comments: ${comments.length}\n`);

  if (DRY_RUN) {
    console.log(`▼ DRY_RUN — 跳过 INSERT, 仅打印 summary:`);
    console.log(`  helpers=${helpers.length}, posts=${posts.length}, likes=${likes.length}, comments=${comments.length}`);
    return;
  }

  // ── §D INSERT to supabase prod (transaction-wrapped) ─────────────────────
  const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('BEGIN');
    console.log(`▼ INSERT user_profiles ${helpers.length} 行 ...`);
    for (const h of helpers) {
      await c.query(
        `INSERT INTO user_profiles (id, display_name, hometown_cuisine, dietary_goal, taste_pref, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [h.id, h.display_name, h.hometown_cuisine, h.dietary_goal, h.taste_pref, h.created_at]
      );
    }
    console.log(`  ✅ user_profiles INSERT done`);

    console.log(`▼ INSERT helper_posts ${posts.length} 行 ...`);
    // post id 我们用 _postId placeholder, 真 INSERT 时 DEFAULT gen_random_uuid()
    // 但 likes/comments 需要 post id — 我们用 RETURNING id 把真 id 收回。
    const postIdMap = new Map<string, string>(); // _postId → real id
    for (const p of posts) {
      const placeholder = (p as any)._postId as string;
      const result = await c.query<{ id: string }>(
        `INSERT INTO helper_posts (helper_id, title, body, cooking_skill_level, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [p.helper_id, p.title, p.body, p.cooking_skill_level, p.created_at]
      );
      postIdMap.set(placeholder, result.rows[0].id);
    }
    console.log(`  ✅ helper_posts INSERT done`);

    console.log(`▼ INSERT helper_likes ${likes.length} 行 ...`);
    for (const l of likes) {
      const realPostId = postIdMap.get(l.post_id);
      if (!realPostId) continue;
      await c.query(
        `INSERT INTO helper_likes (post_id, liker_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [realPostId, l.liker_id]
      );
    }
    console.log(`  ✅ helper_likes INSERT done`);

    console.log(`▼ INSERT helper_comments ${comments.length} 行 ...`);
    for (const cm of comments) {
      const realPostId = postIdMap.get(cm.post_id);
      if (!realPostId) continue;
      await c.query(
        `INSERT INTO helper_comments (post_id, commenter_id, body) VALUES ($1, $2, $3)`,
        [realPostId, cm.commenter_id, cm.body]
      );
    }
    console.log(`  ✅ helper_comments INSERT done`);

    await c.query('COMMIT');
    console.log(`\n✅ ALL COMMITTED.`);

    // 真测 verify
    const { rows: counts } = await c.query<any>(`
      SELECT
        (SELECT COUNT(*) FROM user_profiles WHERE id = ANY($1::text[])) AS helpers,
        (SELECT COUNT(*) FROM helper_posts WHERE helper_id = ANY($1::text[])) AS posts,
        (SELECT COUNT(*) FROM helper_likes WHERE liker_id = ANY($1::text[])) AS likes,
        (SELECT COUNT(*) FROM helper_comments WHERE commenter_id = ANY($1::text[])) AS comments
    `, [helpers.map(h => h.id)]);
    console.log(`\n▼ Verify SQL counts:`);
    console.log(`  user_profiles 命中: ${counts[0].helpers}`);
    console.log(`  helper_posts:       ${counts[0].posts}`);
    console.log(`  helper_likes:       ${counts[0].likes}`);
    console.log(`  helper_comments:    ${counts[0].comments}`);

    // Sample helper_posts 含 like_count / comment_count 验证 trigger 工作
    const { rows: sample } = await c.query<any>(`
      SELECT title, like_count, comment_count FROM helper_posts
      WHERE helper_id = ANY($1::text[])
      ORDER BY like_count DESC LIMIT 3
    `, [helpers.map(h => h.id)]);
    console.log(`\n▼ Sample 帖 top-3 (按 like_count, 验证 trigger):`);
    for (const r of sample) {
      console.log(`  [like=${r.like_count} cmt=${r.comment_count}] ${r.title}`);
    }
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
