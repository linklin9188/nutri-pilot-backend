-- 025_smell3_household_fk_and_rls.sql
-- 修复 Smell 3：household_members 嵌入查询失败 + RLS 与匿名 Auth 冲突
-- 依据 docs/DIAG_smell3_households.md §3 + Database 2026-05-19 P3 实查
-- 详细 SPEC：docs/SPEC_smell3_b1_migration.md
--
-- destructive 前置：CEO 工单 A0 已建 _archive_household_members_pre_025 备份表
--
-- 执行顺序修正说明（vs SPEC §2 草案）：
--   首次推送时 SPEC §2 草案顺序（DELETE → ALTER COLUMN → ADD FK → DROP POLICY → CREATE POLICY）
--   触发 PG 错误 0A000「cannot alter type of a column used in a policy definition」——
--   因为 "helper can read own membership" 等旧 policy 引用了 helper_id 列。
--   事务回滚生效（schema 完全没动），重写顺序为：
--     §1 DELETE → §2 DROP POLICY → §3 ALTER COLUMN → §4 ADD FK → §5 CREATE POLICY
--   先解除 policy 对 helper_id 的引用，再改类型，最后重建 anon-first policy。

BEGIN;

-- =========================================================================
-- §1) 数据清洗：清除孤儿 helper_id
-- =========================================================================
-- 实测 50% 孤儿率（2 行中 1 行 helper_id 无对应 user_profiles）
-- helper_id NOT NULL，不能 SET NULL，只能 DELETE
DELETE FROM household_members
WHERE helper_id::text NOT IN (SELECT id FROM user_profiles);

-- =========================================================================
-- §2) DROP 5 条 auth.uid() policy（与匿名 Auth 模型冲突 + 解除 helper_id 引用）
-- =========================================================================
-- 必须先于 §3 ALTER COLUMN，否则 PG 报 0A000 cannot alter type
DROP POLICY IF EXISTS "employer can manage members"              ON household_members;
DROP POLICY IF EXISTS "helper can insert own membership"         ON household_members;
DROP POLICY IF EXISTS "helper can read own membership"           ON household_members;
DROP POLICY IF EXISTS "employer can manage own household"        ON households;
DROP POLICY IF EXISTS "helper can read household by invite code" ON households;

-- =========================================================================
-- §3) 类型对齐：helper_id uuid → text
-- =========================================================================
-- user_profiles.id 是 text、上面挂 18 列业务数据 + Stripe IDs + WeChat openid
-- 改 user_profiles.id 类型涉及全表迁移 + 所有 RLS 重写 + 前端 localStorage 兼容
-- helper_id 只 1-2 行（清洗后），类型迁移成本最低
ALTER TABLE household_members
  ALTER COLUMN helper_id TYPE text USING helper_id::text;

-- =========================================================================
-- §4) 加 FK：household_members.helper_id → user_profiles.id
-- =========================================================================
-- 注意：FK 目标是 user_profiles(id) 不是 user_profiles(user_id)
-- (Database P3 §A 实证 user_profiles 主键叫 id，没有 user_id 列)
-- 不能 REFERENCES auth.users（CLAUDE.md 硬性不变量 #1）
ALTER TABLE household_members
  ADD CONSTRAINT household_members_helper_id_fkey
  FOREIGN KEY (helper_id)
  REFERENCES user_profiles(id)
  ON DELETE CASCADE;

-- =========================================================================
-- §5) CREATE anon-first policy（2 条 FOR ALL 覆盖原 5 条 cmd 维度）
-- =========================================================================
-- 安全模型：本项目 anon-first（CLAUDE.md 硬不变量 #1），auth.uid() 永远 NULL
-- RLS 不做用户隔离，应用层用 WHERE 子句 + getUserId() 负责过滤
-- 这与 user_weekly_menus / dishes 等表当前 anon-first 模式一致

-- 5.1 households：employer 全权（应用层 WHERE employer_id = getUserId()）
CREATE POLICY "households_anon_full" ON households
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5.2 household_members：基本同上（应用层 WHERE helper_id/employer 过滤）
CREATE POLICY "household_members_anon_full" ON household_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 风险提示（不在本 migration 范围，见 SPEC §6）：
--   P7: households.invite_code 全表读暴露 —— 需 PostgREST RPC 或 application-layer 加密
--   B-2: Home.tsx:425 嵌入语法需加 !helper_id hint 才能用上新 FK

COMMIT;
