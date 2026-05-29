/**
 * seed-helper-checkins-tagalog.ts — TICKET-105 §B v3 (老板 5/29 拍板)
 *
 * 替换之前 109 帖中文 recipe-blog 风的 mock community.
 * 新方向:
 *   - 模拟真菲佣的 "拍照打卡" 行为, 不是 recipe 长文
 *   - 短句 Tagalog (菲佣母语), 1-2 句话, 像微信朋友圈/Instagram caption
 *   - 真菜图片 (从 dishes 表抓真菜 image_url)
 *   - 69 帖, 14 个菲律宾名字 helper × 平均 5 帖
 *   - 0 LLM cost (本地 template + 随机组合)
 *
 * Run:
 *   npx tsx scripts/seed-helper-checkins-tagalog.ts --dry-run
 *   npx tsx scripts/seed-helper-checkins-tagalog.ts          # live
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_POSTS = 69;

// 14 真实 Filipino 女性名字 (常见菲佣名字)
const HELPER_NAMES = [
  'Maria Cruz', 'Rosa Reyes', 'Liza Garcia', 'Joy Santos', 'Anna Dela Cruz',
  'Marites Ramos', 'Lorna Bautista', 'Susan Aquino', 'Cristina Lopez',
  'Bernadette Tan', 'Ella Mendoza', 'Daisy Villanueva', 'Grace Mercado',
  'Princess Domingo',
];

// Tagalog 短打卡 templates — 第一人称, 1-2 句, 像 IG caption
// {dish} 占位会替换成菜名 (英文菜名 fallback, 因为菲佣端不展示中文)
const CAPTION_TEMPLATES = [
  'Tapos na ang {dish} para sa pamilya! Sarap! 🍳',
  'Lutong bahay today: {dish}. Gustong-gusto ng mga bata 😋',
  'Inihanda ko ngayon: {dish}. Masaya ang amo ko! ✨',
  'First time kong gawin {dish} — successful naman! 💪',
  'Lunch is served: {dish} 🥢',
  'Dinner today: {dish}. Pampering my employer family ❤️',
  '{dish} para sa weekend treat. Sobrang sarap! 🌟',
  'Tinapos ko na ang {dish}, ready na for serving 🍽',
  'Today special: {dish}. Hope they like it!',
  'Niluto ko ngayon ang {dish} — bagong recipe na natutunan ko 🌶',
  'Para sa hapunan ngayon: {dish}. Healthy at masarap!',
  'Successfully cooked {dish} today! Proud helper 💖',
  'Breakfast plated: {dish} ☀️',
  '{dish} na may dagdag na lasa ng pag-ibig 💝',
  'Late lunch: {dish}. Sulit ang pagod sa kusina!',
];

(async () => {
  console.log(`[seed-helper-checkins-tagalog] mode=${DRY_RUN ? 'DRY' : 'LIVE'} target=${TARGET_POSTS}`);

  const c = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL!, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // step 1: 拉 dishes 带 image_url, 用英文菜名 (菲佣端展示)
  const dishRes = await c.query(`
    SELECT id, title_zh, title_en, image_url
    FROM dishes
    WHERE image_url IS NOT NULL AND image_url <> ''
      AND title_en IS NOT NULL AND title_en <> ''
    ORDER BY random()
    LIMIT $1
  `, [TARGET_POSTS]);
  console.log(`Picked ${dishRes.rows.length} dishes with image + EN title.`);
  if (dishRes.rows.length < TARGET_POSTS) {
    console.warn(`Only ${dishRes.rows.length} valid dishes, will reuse.`);
  }

  // step 2: 先 delete 旧 mock (我之前 seed 的 109 帖)
  if (!DRY_RUN) {
    const del = await c.query(`DELETE FROM helper_posts WHERE TRUE RETURNING id`);
    console.log(`Deleted ${del.rowCount} old mock posts.`);
    // 不删 user_profiles 那些 helper 画像 (可能其他地方引用); 我们生成新 helper 画像各 unique uuid
  }

  // step 3: 生成 14 helper 画像
  const helpers: { id: string; name: string }[] = [];
  for (const name of HELPER_NAMES) {
    const id = randomUUID();
    helpers.push({ id, name });
    if (!DRY_RUN) {
      await c.query(
        `INSERT INTO user_profiles (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [id, name]
      );
    }
  }
  console.log(`Seeded ${helpers.length} helper profiles.`);

  // step 4: 写 69 帖 — 每 helper 4-6 帖, 随机模板 × 随机菜
  let postIdx = 0;
  for (let i = 0; i < TARGET_POSTS; i++) {
    const helper = helpers[i % helpers.length];
    const dish = dishRes.rows[i % dishRes.rows.length];
    const tpl = CAPTION_TEMPLATES[i % CAPTION_TEMPLATES.length];
    const dishName = dish.title_en;
    const caption = tpl.replace('{dish}', dishName);
    // random light social signals
    const likeCount = Math.floor(Math.random() * 25) + 1;
    const commentCount = Math.floor(Math.random() * 6);
    // backdate 帖子时间均匀分布过去 7 天
    const ageMin = Math.floor(Math.random() * 7 * 24 * 60);
    const createdAt = new Date(Date.now() - ageMin * 60 * 1000).toISOString();

    if (DRY_RUN) {
      if (postIdx < 5) console.log(`  [${i+1}] @${helper.name}: "${caption}" (img: ${dish.image_url?.slice(0, 50)}...)`);
    } else {
      await c.query(
        `INSERT INTO helper_posts (id, helper_id, title, body, image_url, like_count, comment_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), helper.id, null, caption, dish.image_url, likeCount, commentCount, createdAt]
      );
    }
    postIdx++;
  }
  console.log(`\n${DRY_RUN ? 'Would seed' : 'Seeded'} ${postIdx} posts.`);

  // step 5: verify
  if (!DRY_RUN) {
    const verify = await c.query(`SELECT COUNT(*) FROM helper_posts`);
    console.log(`Final helper_posts count: ${verify.rows[0].count}`);
  }
  await c.end();
})();
