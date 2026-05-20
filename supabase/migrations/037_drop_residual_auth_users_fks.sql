-- 037_drop_residual_auth_users_fks.sql
-- P15 — Day 10 §A：清除 public.* schema 残留的 FK → auth.users（不变量 #1 最终对齐）
-- 工单：TELEPOT-20260520-045 §A
--
-- 全面 audit 发现 public.* 残留 2 条违规 FK（auth.* schema 内部 FK 是 Supabase Auth 自身合规，不动）：
--   1) helper_reviews.reviewer_id_fkey → auth.users(id)
--   2) community_posts.helper_id_fkey  → auth.users(id)
--
-- 历史背景：来自 nutri_pilot_feedback_schema.sql 等 init seed 时 Supabase default 模式建的，
-- 项目切 anon-first 自定义 Auth 后 auth.users 永远为空，这些 FK 实际让 INSERT 静默失败。
-- 025/026/035 修了 household_members + households + helper_reviews.helper_id，遗漏这 2 处。
--
-- 安全性：
--   - 仅 DROP CONSTRAINT，不动列、不动 policy、不动数据（不变量 #1 类纯清理）
--   - 不加新 FK→user_profiles：本 migration 仅做"清残留违规"的最小创口
--     （helper_reviews 其他 uuid 列 + community_posts 完整改 anon-first 留 P10.1 / P15.1 后续工单）
--   - DROP CONSTRAINT 不会触发 CASCADE（FK 自身就是约束，DROP 它只释放约束不动数据）

BEGIN;

-- §1 helper_reviews.reviewer_id_fkey → auth.users（违反不变量 #1）
ALTER TABLE helper_reviews
  DROP CONSTRAINT IF EXISTS helper_reviews_reviewer_id_fkey;

-- §2 community_posts.helper_id_fkey → auth.users（违反不变量 #1）
ALTER TABLE community_posts
  DROP CONSTRAINT IF EXISTS community_posts_helper_id_fkey;

COMMIT;
