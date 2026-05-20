-- 035_helper_reviews_helper_id_to_text.sql
-- P10：helper_reviews.helper_id uuid → text + FK to user_profiles(id)
-- 与 025 后 household_members.helper_id (text) 跨表类型对齐
-- 工单：TELEPOT-20260520-042 §B
--
-- 依据 LESSONS.md 已沉淀的"pg-alter-column-policy-cross-table-dep"经验，预先 audit pg_policies：
--   实测 policy 引用 helper_id 共 3 条：
--     - community_posts."helper can delete own post" / "helper can insert own post"
--       → 引用 community_posts.helper_id 列（不阻塞 ALTER helper_reviews）
--     - helper_reviews."anyone can read public reviews"
--       → 引用 helper_reviews.helper_id 列 ★ 阻塞 ALTER ★
--
-- 顺序铁律（事务包裹，修正版——首次 push 触发 42804 后增补 §2 DROP CONSTRAINT）：
--   §1 DROP POLICY（解除 helper_reviews 自身 helper_id 引用）
--   §2 DROP 旧 FK helper_reviews_helper_id_fkey（指向 auth.users，违反不变量 #1）
--   §3 ALTER COLUMN helper_id uuid → text
--   §4 ADD FK helper_reviews_helper_id_fkey → user_profiles(id) ON DELETE CASCADE
--   §5 CREATE 新 anon-first policy（替代被 DROP 的）
--
-- 首次 push 历史教训（不变量 #1 违反 + 类型冲突）：
--   实测 helper_reviews 在 init seed (nutri_pilot_feedback_schema.sql) 时建过
--   helper_reviews_helper_id_fkey 指向 auth.users(id)（uuid）——违反 CLAUDE.md 硬不变量 #1。
--   025/026 修了 household_members + households 但**没动** helper_reviews 这条非法 FK。
--   首次 035 没预见 → ALTER COLUMN 后 helper_id (text) 与 auth.users.id (uuid) 类型冲突 → 42804。
--   修正：DROP 旧非法 FK → ALTER → ADD 新合规 FK to user_profiles(id)。
--
-- 安全性：
--   - helper_reviews 当前 0 行（实测）—— 零孤儿风险，不需 DELETE 清洗
--   - 备份表 _archive_helper_reviews_pre_p10 已建（0 行，结构性备份）
--   - 不变量 #1 自检：DROP 旧 FK→auth.users + ADD 新 FK→user_profiles(id)，本 migration 顺手修非法 FK
--   - 不变量 #6 不影响（dish_ids 类型未触）
--
-- helper_reviews 其他列（id / household_id / reviewer_id）仍 uuid，本轮不处理
-- （留 P10.1 或后续工单一并迁，与 026 employer_id 同模式）。

BEGIN;

-- §1) DROP 引用 helper_reviews.helper_id 的 policy
DROP POLICY IF EXISTS "anyone can read public reviews" ON helper_reviews;

-- §2) DROP 旧 FK helper_reviews_helper_id_fkey（指向 auth.users，违反不变量 #1）
ALTER TABLE helper_reviews
  DROP CONSTRAINT IF EXISTS helper_reviews_helper_id_fkey;

-- §3) ALTER helper_id uuid → text
ALTER TABLE helper_reviews
  ALTER COLUMN helper_id TYPE text USING helper_id::text;

-- §4) ADD 新合规 FK 到 user_profiles(id)（与 025 household_members.helper_id 同模式）
ALTER TABLE helper_reviews
  ADD CONSTRAINT helper_reviews_helper_id_fkey
  FOREIGN KEY (helper_id)
  REFERENCES user_profiles(id)
  ON DELETE CASCADE;

-- §5) CREATE 新 anon-first policy（与 025/026 模式一致：USING true）
-- 应用层 WHERE 子句 + getUserId() 过滤
CREATE POLICY "helper_reviews_anon_read" ON helper_reviews
  FOR SELECT
  USING (true);

COMMIT;
