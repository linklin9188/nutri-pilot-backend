-- TICKET-056 P0: dishes RLS lockdown
-- =====================================================================
-- 问题：dishes 表 RLS=disabled (relrowsecurity=false 实查证实)。
-- 这比 audit 描述的 "anon FOR ALL USING (true)" 更糟 —— 连 policy 都没有，
-- anon REST API 可以直接 DELETE / UPDATE / INSERT 全表，一秒清空菜库。
--
-- 修复：启用 RLS + 只给 anon SELECT。写入只允许 service_role (默认 RLS bypass)，
-- 由 seed scripts / edge functions 携带 service key 写入。
--
-- 实查依据 (2026-05-25 通过 supabase db query --linked):
--   SELECT relrowsecurity FROM pg_class WHERE relname='dishes';
--   -> false  (RLS 未启用)
--   SELECT policyname FROM pg_policies WHERE tablename='dishes';
--   -> 0 行  (无任何 policy)
--
-- 兼容性影响 (前端实查):
--   grep "from('dishes')" src/ -> 19 处, 其中 17 处 SELECT (不受影响)
--   2 处写入会被本 migration 阻断, 待 follow-up ticket 搬到 edge function:
--     - src/lib/geminiSchoolBalance.ts:170-194  (anon INSERT 新菜)
--     - src/pages/Home.tsx:1021-1025          (anon UPDATE times_employer_swapped 计数器)
--   这两处都是 design smell (anon 直写共享菜库本身就不该)，本 ticket 优先封堵
--   DELETE 漏洞，CEO 已知后续修复路径 = 边缘函数 + service key。
-- =====================================================================

-- 1. 启用 RLS
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;

-- 2. 删除残留 policy (实查 0 条, 防御性 DROP, 名字穷举 audit 文档可能提到的)
DROP POLICY IF EXISTS dishes_anon_full ON public.dishes;
DROP POLICY IF EXISTS dishes_read_all ON public.dishes;
DROP POLICY IF EXISTS dishes_anon_read ON public.dishes;
DROP POLICY IF EXISTS "Anonymous users can read all dishes" ON public.dishes;
DROP POLICY IF EXISTS "anon can read dishes" ON public.dishes;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.dishes;

-- 3. 重建：anon 只读
CREATE POLICY dishes_anon_read ON public.dishes
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 注：不创建 INSERT / UPDATE / DELETE policy，
-- service_role 默认 bypass RLS，seed scripts / edge functions 用 service key 写入。

COMMENT ON POLICY dishes_anon_read ON public.dishes IS
  'TICKET-056: anon/authenticated 只读, 写入需 service_role (seed scripts / edge functions)';

-- 4. 验证 (apply 后人工 / CI 跑):
-- 4.1 RLS 已启用:
--   SELECT relrowsecurity FROM pg_class WHERE relname='dishes';
--   预期: true
-- 4.2 anon DELETE 被拒:
--   用 anon JWT 跑 DELETE FROM dishes WHERE id='<某 uuid>';
--   预期: 0 行删除 (RLS 无 DELETE policy = 默认 deny)
-- 4.3 anon SELECT 仍通:
--   SELECT count(*) FROM dishes;
--   预期: 正常返回菜数
