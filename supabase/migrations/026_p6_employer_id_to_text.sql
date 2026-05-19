-- 026_p6_employer_id_to_text.sql
-- P6 方案 A（最小创口 · CEO 决策 2026-05-19 通宵）：
--   households.employer_id 类型从 uuid → text，与 user_profiles.id 对齐
--
-- 历史：第一次 push 触发 PG 0A000——helper_reviews 表的 INSERT policy
-- "employer can write review for own helper" with_check 子查询里
-- `households.employer_id = auth.uid()` 引用了 households 列，阻塞 ALTER。
-- 决策：DROP 引用列的那条 policy → ALTER 类型 → CREATE anon-first 替代 policy。
-- helper_reviews 其他 anon-first 化（4 个 uuid 列 + SELECT policy）留 P9。
-- helper_reviews.helper_id (uuid) 与 025 后 household_members.helper_id (text)
-- 跨表类型不一致留 P10 标记，本轮不动。
--
-- 前置：A0 已建 _archive_households_pre_p6 备份表（85 行）

BEGIN;

-- 1) DROP helper_reviews 的 INSERT policy（with_check 子查询引用 households.employer_id）
DROP POLICY IF EXISTS "employer can write review for own helper" ON helper_reviews;

-- 2) ALTER households.employer_id uuid → text
ALTER TABLE households
  ALTER COLUMN employer_id TYPE text USING employer_id::text;

-- 3) CREATE anon-first INSERT policy（与 §A 025 一致：USING/WITH CHECK true）
CREATE POLICY "helper_reviews_anon_insert" ON helper_reviews
  FOR INSERT
  WITH CHECK (true);

-- 4) SELECT policy "anyone can read public reviews" 保留
--    （它的 qual 是 is_public=true OR helper_id=auth.uid() OR reviewer_id=auth.uid()
--     —— is_public OR 兜底，anon-Auth 下 auth.uid() 为 NULL 两个分支无效但不报错。
--     不引用 employer_id，不阻塞 ALTER；anon-first 化留 P9）

COMMIT;
