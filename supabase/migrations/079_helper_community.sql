-- 079_helper_community.sql
-- 工单：TELEPOT-20260524-025 P0 hot — Helper Community sprint 1
-- 3 张表 (helper_posts / helper_likes / helper_comments) + 4 个 denormalized
-- count trigger（like_count / comment_count 自维护）。
--
-- 不变量自检：
--   #1 不 FK→auth.users（helper_id / liker_id / commenter_id text → user_profiles(id)）
--   #2 不涉 Gemini                #3 不涉 Stripe
--   #4 ALGO_VERSION 不动（新表，不动算法）
--   FK→user_profiles(id) ON DELETE CASCADE — 与 025 household_members.helper_id 一致
--   CREATE TABLE / INDEX / POLICY / FUNCTION / TRIGGER 全用 IF NOT EXISTS / OR REPLACE 保幂等

BEGIN;

-- =========================================================================
-- §A1 helper_posts — 帖子主表
-- =========================================================================
CREATE TABLE IF NOT EXISTS helper_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id             text NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title                 text,
  body                  text NOT NULL,                  -- 做菜方法 / tips
  dish_id               uuid REFERENCES dishes(id) ON DELETE SET NULL,
  image_url             text,                            -- Gemini gen 图片 URL
  cooking_skill_level   int CHECK (cooking_skill_level BETWEEN 1 AND 5),
  like_count            int NOT NULL DEFAULT 0,         -- denormalized
  comment_count         int NOT NULL DEFAULT 0,         -- denormalized
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Lead 端时间轴：某 helper 最近帖子
CREATE INDEX IF NOT EXISTS idx_helper_posts_helper_created
  ON helper_posts (helper_id, created_at DESC);

-- 全站时间轴：feed 主路径
CREATE INDEX IF NOT EXISTS idx_helper_posts_created_at
  ON helper_posts (created_at DESC);

-- =========================================================================
-- §A2 helper_likes — 点赞（一人一帖一赞）
-- =========================================================================
CREATE TABLE IF NOT EXISTS helper_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES helper_posts(id) ON DELETE CASCADE,
  liker_id    text NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, liker_id)
);

-- feed 计数 + "我赞了哪些帖"两路径
CREATE INDEX IF NOT EXISTS idx_helper_likes_post_id
  ON helper_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_helper_likes_liker_id
  ON helper_likes (liker_id);

-- =========================================================================
-- §A3 helper_comments — 评论
-- =========================================================================
CREATE TABLE IF NOT EXISTS helper_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         uuid NOT NULL REFERENCES helper_posts(id) ON DELETE CASCADE,
  commenter_id    text NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- feed 计数 + 评论时间排序
CREATE INDEX IF NOT EXISTS idx_helper_comments_post_created
  ON helper_comments (post_id, created_at);

-- =========================================================================
-- §B 4 个 trigger function 维护 denormalized count
-- =========================================================================
CREATE OR REPLACE FUNCTION fn_inc_helper_post_like_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE helper_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_dec_helper_post_like_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE helper_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION fn_inc_helper_post_comment_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE helper_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_dec_helper_post_comment_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE helper_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_helper_likes_inc    ON helper_likes;
DROP TRIGGER IF EXISTS trg_helper_likes_dec    ON helper_likes;
DROP TRIGGER IF EXISTS trg_helper_comments_inc ON helper_comments;
DROP TRIGGER IF EXISTS trg_helper_comments_dec ON helper_comments;

CREATE TRIGGER trg_helper_likes_inc    AFTER INSERT ON helper_likes
  FOR EACH ROW EXECUTE FUNCTION fn_inc_helper_post_like_count();
CREATE TRIGGER trg_helper_likes_dec    AFTER DELETE ON helper_likes
  FOR EACH ROW EXECUTE FUNCTION fn_dec_helper_post_like_count();
CREATE TRIGGER trg_helper_comments_inc AFTER INSERT ON helper_comments
  FOR EACH ROW EXECUTE FUNCTION fn_inc_helper_post_comment_count();
CREATE TRIGGER trg_helper_comments_dec AFTER DELETE ON helper_comments
  FOR EACH ROW EXECUTE FUNCTION fn_dec_helper_post_comment_count();

-- =========================================================================
-- §C RLS — anon-first FOR ALL（与 077 referrals / 025 household 风格一致）
-- =========================================================================
ALTER TABLE helper_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE helper_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE helper_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY helper_posts_anon_all    ON helper_posts    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY helper_likes_anon_all    ON helper_likes    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY helper_comments_anon_all ON helper_comments FOR ALL USING (true) WITH CHECK (true);

-- 002 sprint JWT 接入后改为 helper_id = current_setting('request.jwt.claim.sub')
-- 现阶段应用层用 .eq('helper_id', userId) / .eq('liker_id', userId) 收口

COMMENT ON TABLE helper_posts    IS 'Helper Community sprint 1 (TICKET-025) — 菲佣帖子。Algorithm 029 batch 写入 20 helper × 5 帖 = 100 行 seed。';
COMMENT ON TABLE helper_likes    IS 'Helper Community 点赞，trigger 自维护 helper_posts.like_count。';
COMMENT ON TABLE helper_comments IS 'Helper Community 评论，trigger 自维护 helper_posts.comment_count。';

COMMIT;
