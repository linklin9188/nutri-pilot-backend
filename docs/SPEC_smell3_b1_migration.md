# SPEC_smell3_b1_migration.md — Smell 3 方向 B-1 完整 SQL 草案

> 状态：**草案就绪，待 CEO 拍板**（2026-05-19 晚 Cowork 端代 Architect 出草案；Architect tab 可作兜底复审）
> 前置依据：`docs/DIAG_smell3_households.md` §3 方向 B + Database 2026-05-19 P3 实查 `telepot_response_database.md`
> 范围：**仅 DB 层**（B-1）。前端配合改动（B-2）单列附录

---

## §0 一句话目标

把 Smell 3 真因（FK 缺失 + RLS auth.uid() 冲突）一次性根治：给 `household_members.helper_id` 加 FK→`user_profiles(id)`，DROP 5 条 auth.uid() policy 改成 anon-first，顺便堵 `helper can read household by invite code` 的全表泄露漏洞。

---

## §1 上线前置 checklist

实际派单前 DB Lead 必须确认：

- [ ] `024_add_algo_version.sql` 已 push 上线（避免 migration 版本冲突）→ 已完成 2026-05-19
- [ ] 工作区 clean，无未 commit 改动（避免 commit 边界污染）
- [ ] 新建 `supabase/migrations/025_smell3_household_fk_and_rls.sql` 文件
- [ ] 该 migration 在 DB Lead 本地 `supabase db push --dry-run` 通过
- [ ] CEO 给 telepot_database.md 派单含本 SPEC 链接

---

## §2 完整 SQL 草案（按顺序执行，违反顺序会失败）

```sql
-- 025_smell3_household_fk_and_rls.sql
-- 修复 Smell 3：household_members 嵌入查询失败 + RLS 与匿名 Auth 冲突
-- 依据 docs/DIAG_smell3_households.md §3 + Database 2026-05-19 P3 实查

BEGIN;

-- =========================================================================
-- §1) 数据清洗：清除孤儿 helper_id
-- =========================================================================
-- 实测 50% 孤儿率（2 行中 1 行 helper_id 无对应 user_profiles）
-- helper_id NOT NULL，不能 SET NULL，只能 DELETE
DELETE FROM household_members
WHERE helper_id::text NOT IN (SELECT id FROM user_profiles);

-- =========================================================================
-- §2) 类型对齐：helper_id uuid → text
-- =========================================================================
-- user_profiles.id 是 text、上面挂 18 列业务数据 + Stripe IDs + WeChat openid
-- 改 user_profiles.id 类型涉及全表迁移 + 所有 RLS 重写 + 前端 localStorage 兼容
-- helper_id 只 1-2 行（清洗后），类型迁移成本最低
ALTER TABLE household_members
  ALTER COLUMN helper_id TYPE text USING helper_id::text;

-- =========================================================================
-- §3) 加 FK：household_members.helper_id → user_profiles.id
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
-- §4) DROP 5 条 auth.uid() policy（与匿名 Auth 模型冲突）
-- =========================================================================
DROP POLICY IF EXISTS "employer can manage members"              ON household_members;
DROP POLICY IF EXISTS "helper can insert own membership"         ON household_members;
DROP POLICY IF EXISTS "helper can read own membership"           ON household_members;
DROP POLICY IF EXISTS "employer can manage own household"        ON households;
DROP POLICY IF EXISTS "helper can read household by invite code" ON households;

-- =========================================================================
-- §5) CREATE 5 条 anon-first policy
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

-- ⚠️ 比 migration 001 原状更紧的地方：
-- 原"helper can read household by invite code" USING (true) 实际等价上述 5.1 但缺 WITH CHECK
-- 新 policy 显式 WITH CHECK (true) 让 INSERT 也能跑（前端 createHousehold 之前会失败）

COMMIT;
```

---

## §3 上线步骤（DB Lead 按顺序执行）

1. **预演** `supabase db push --dry-run --linked` 看 CLI 视角是否只看到 025
2. **本地干跑** `supabase db query --linked` 跑 §2 §3 §5 单条 SQL 验证语法（不 COMMIT）
3. **数据备份**（虽然只清 1 行孤儿，但 ALTER COLUMN TYPE 是 destructive）：
   ```sql
   CREATE TABLE _archive_household_members_pre_025 AS SELECT * FROM household_members;
   ```
4. **正式推送** `supabase db push`
5. **验证 5 条**：
   ```sql
   -- A) FK 已建
   SELECT constraint_name FROM information_schema.table_constraints
   WHERE table_name = 'household_members' AND constraint_type = 'FOREIGN KEY';
   -- 应见 household_members_household_id_fkey + household_members_helper_id_fkey

   -- B) 类型已迁
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'household_members' AND column_name = 'helper_id';
   -- 应见 helper_id | text

   -- C) RLS 重写完毕
   SELECT policyname, cmd, qual FROM pg_policies
   WHERE tablename IN ('households', 'household_members');
   -- 应只见 households_anon_full + household_members_anon_full

   -- D) 孤儿清洗痕迹
   SELECT COUNT(*) FROM household_members hm
   LEFT JOIN user_profiles up ON up.id = hm.helper_id
   WHERE up.id IS NULL;
   -- 应见 0

   -- E) migration 已登记
   SELECT version FROM supabase_migrations.schema_migrations WHERE version = '025';
   ```

---

## §4 风险评估 + 回滚预案

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 类型迁移失败（helper_id 含非 uuid 字符串） | 极低 | ALTER COLUMN 报错 | helper_id 当前是 uuid 类型，cast text 必成功 |
| FK 失败（孤儿没清干净） | 低 | ADD CONSTRAINT 报错 | §1 DELETE 先于 §3 ADD，事务内回滚 |
| 新 RLS 太松（USING true）暴露数据 | 中 | households 全表对匿名读 | 应用层必须用 .eq('employer_id', userId) / .eq('helper_id', userId) 过滤；本项目其他表已是这个模式 |
| invite_code 全表泄露（任何人能枚举所有家庭邀请码） | 中 | 恶意用户可加入任意家庭 | **未根治**——见 §6 后续工单 |
| Home.tsx:425 嵌入查询仍失败（FK 已建但前端嵌入语法不对） | 高 | 仍报 PostgREST 400 | B-2 需要 Backend 改前端嵌入语法加 `!helper_id` hint |

**回滚预案**（如果生产出问题）：
```sql
BEGIN;
DROP POLICY IF EXISTS "households_anon_full" ON households;
DROP POLICY IF EXISTS "household_members_anon_full" ON household_members;
ALTER TABLE household_members DROP CONSTRAINT household_members_helper_id_fkey;
ALTER TABLE household_members ALTER COLUMN helper_id TYPE uuid USING helper_id::uuid;
INSERT INTO household_members SELECT * FROM _archive_household_members_pre_025
  ON CONFLICT (id) DO NOTHING;
COMMIT;
-- 然后用 schema_migrations 表删除 025 登记（仅紧急情况）
```

---

## §5 B-2（Backend 部门联动）—— B-1 推完后再派

### 改动 1：`src/pages/Home.tsx:425` 嵌入语法

当前（推断，需 Backend 实际 grep）：
```ts
supabase.from('household_members').select('*, user_profiles(*)')
```

改成：
```ts
supabase.from('household_members').select('*, user_profiles!helper_id(*)')
```

`!helper_id` hint 告诉 PostgREST"用 helper_id FK 嵌入"。FK 在 B-1 才建好，所以必须 B-1 先上线。

### 改动 2：3 处 households / household_members INSERT 加 error 兜底

当前：`.then(...).catch(() => {})`（吞错）
改成：`if (error) { console.error('insert failed', error); /* 用户可见提示 */ }`

### 改动 3：localStorage 写 `nutri_user_id` 时同步写 `user_profiles.id` row

确保新用户的 helper_id（FK 现在生效）能找到对应 user_profile。

### B-2 改动量预估：3 文件，±50 行。

---

## §6 不在 B-1 范围但要立项的后续工单

| 编号 | 内容 | 优先级 |
|---|---|---|
| P5（已部分完成） | CLAUDE.md / CLAUDE_DATABASE.md `user_profiles.display_name` 非空硬不变量与生产 nullable 矛盾 → 已订正文档 2026-05-19 晚 | 完成 |
| P6 | `households.employer_id` 是 uuid，前端 localStorage userId 是 text，根本写不进——需要决定是改 schema 还是改前端假设 | 中 |
| P7 | `households.invite_code` 全表读暴露（任何匿名能枚举所有邀请码）—— 需 PostgREST RPC 或 application-layer 加密 | 中 |
| P8 | `_archive_household_members_pre_025` 备份表保留多久？建议 3 天后 DROP | 低 |

---

## §7 文档订正建议（B-1 推完一并 commit）

Cowork 端 2026-05-19 晚已订正：
- ✅ `CLAUDE.md` DB conventions: user_profiles 主键 `id text`、display_name nullable、helper_id 类型迁移说明
- ✅ `CLAUDE.md` Smell 3 段: B-1 SQL 草案吸收 §A/§C/§D 修正
- ✅ `CLAUDE_DATABASE.md`: display_name 段 / user_profiles 关键列 / user_weekly_menus 已修复说明

B-1 推完后还要补：
- [ ] `CLAUDE.md` Smell 3 段加"RESOLVED 2026-05-XX"标记
- [ ] `CLAUDE_DATABASE.md` 加入新 anon-first RLS 模板小节
- [ ] 本 SPEC 文档移到 `_archive/docs/`（migration 已上线）

---

## §8 派单口径（CEO 抄走可直接派 Database）

```
TASK: 实施 Smell 3 B-1 migration —— 见 docs/SPEC_smell3_b1_migration.md
PRIORITY: normal（不阻塞观察期）
CONTEXT: |
  按 SPEC §2 完整 SQL 起 supabase/migrations/025_smell3_household_fk_and_rls.sql
  按 SPEC §3 五步上线流程执行
  完工写回 telepot_response_database.md 含 SPEC §3 5 条验证 SQL 实测输出
  完工后按新 SOP 第 7 条自动写 telepot_architect.md 触发复审
```
