-- TICKET-106 P1 §A — 每用户 2 households race condition 根治
--
-- 真因: Settings.tsx + Home.tsx 同时挂载并发跑 "SELECT 空 → INSERT" 模式,
-- 两段 useEffect race 导致每 employer 写 2+ 行. DB 实查 55/活跃 employer 有
-- 重复 (1 个测试机异常 84 行), 共 137 行多余.
--
-- 修复 3 步:
--   1. dedup — 每 employer 保留 created_at DESC 第 1 行 (用户当前看到的 invite),
--      删其余. 验证过 0 行 household_members 引用要删的 hh, 不产生孤儿.
--   2. 加 UNIQUE constraint employer_id — DB 层保证未来不再重复, 并发 INSERT
--      第 2 条会触发 23505 让客户端走 SELECT fallback.
--   3. 客户端配合改 idempotent helper (separate commit).
--
-- 5/29 老板拍板修复.

-- 1. dedup
DELETE FROM households WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY employer_id ORDER BY created_at DESC) AS rn
    FROM households
  ) ranked WHERE rn > 1
);

-- 2. 加 UNIQUE constraint
ALTER TABLE households
  ADD CONSTRAINT households_employer_id_uniq UNIQUE (employer_id);

COMMENT ON CONSTRAINT households_employer_id_uniq ON households IS
  'TICKET-106 P1: 1 employer = 1 household. 并发 INSERT 重复时 DB 拒绝, 客户端 catch 23505 后 SELECT 拿现行.';
