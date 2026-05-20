-- 045_user_profiles_avatar.sql
-- UI 060 §B 头像功能 DB 配套列
-- 工单：TELEPOT-20260520-062 §B
--
-- v1 简单方案：base64 直接存 text 列（~50-200 KB / row）
-- 用户量 > 10k 时再迁 Storage URL（P21 立项）
--
-- 不变量 #1 自检：boolean/text 列无 FK
-- 不变量 #4：不动 ALGO_VERSION

BEGIN;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_b64 text;

COMMIT;
