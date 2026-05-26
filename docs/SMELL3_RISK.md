# Smell 3 B-1 风险评估 — 老板回来后拍 A/B/C

> 老板 2026-05-23 ~08:15 HKT 问 "风险是什么"。CEO 详细评估。

---

## §1 业务上下文（零术语）

**Aieats 雇主-菲佣模型**：
- `households` 表 = 家庭，主键 `id`，`employer_id` 字段指向"雇主"
- `household_members` 表 = 家庭成员（含菲佣），有 `helper_id` 字段指向"菲佣"
- 业务流：雇主 A 创建家庭 → 邀请菲佣 B 加入 → A 看到 B / B 看到 A 的家庭信息

**当前 3 个 schema 偏差**（CLAUDE.md "Known Architectural Smells" §3）：

1. **数据连接断裂（FK 缺失）** — `household_members.helper_id` 没指向 `user_profiles(id)` 的外键
2. **安全策略写错（RLS 用 auth.uid()）** — Aieats 自定义 userId 在 localStorage，不用 supabase auth，但 5 条 RLS 规则都靠 `auth.uid()` 判断 → 所有写入静默失败
3. **类型不匹配（uuid vs text）** — `helper_id` 是 uuid 但 `user_profiles.id` 是 text，加 FK 前必须先 ALTER COLUMN TYPE

**孤儿数据**：Database 部门 2026-05-19 P3 实查：household_members 共 2 行，其中 1 行 `helper_id::text NOT IN user_profiles.id` → 50% 孤儿率。

---

## §2 5 大风险（按概率/严重度排）

| # | 风险 | 几率 | 后果（用户视角）| 回滚成本 |
|---|---|---|---|---|
| 1 | **RLS 写错某条规则** | 中（5 条规则各 1 次失误概率）| 某些雇主突然看不到自己邀请的菲佣 / 菲佣看不到雇主家庭。需 Lead 现场调试 + 老板手动通知用户 | 中：drop + recreate 30-60 分钟 |
| 2 | **类型迁移失误** | 低（只 2 行数据 + IF EXISTS 保幂等）| migration 整个回滚，不损坏现有数据 | 低：rerun migration |
| 3 | **孤儿数据误删** | 极低（β 期 2 行都是测试数据）| 测试账户登录看不到家庭。但 β 期无真用户影响 | 极低：手动重建 1 行 |
| 4 | **FK 加锁过表** | 极低（< 100 行）| 加 FK 时 Postgres 短暂锁 households + household_members 表，β 期不到 100 ms | 极低：自动释放 |
| 5 | **隐藏 bug 现形** | 中（数据连接修通后，依赖此 schema 的旧代码可能崩）| 旧 Home.tsx PostgREST 嵌入查询 `!helper_id` alias 可能突然行为变化 | 中：Lead 现场修 + 加测试 |

**最大单点风险** = §1 RLS 写错某条让用户看不到自己数据。

---

## §3 修复步骤（30-45 分钟）

按 CLAUDE.md Smell 3 §3 + Database 部门 2026-05-19 P3 实查记录：

```sql
-- 步骤 1: 清洗孤儿数据（β 期 1 行）
DELETE FROM household_members WHERE helper_id::text NOT IN (SELECT id FROM user_profiles);

-- 步骤 2: 类型迁移
ALTER TABLE household_members ALTER COLUMN helper_id TYPE text USING helper_id::text;

-- 步骤 3: 加 FK
ALTER TABLE household_members ADD CONSTRAINT household_members_helper_id_fkey
  FOREIGN KEY (helper_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- 步骤 4: DROP 5 条旧 RLS
DROP POLICY IF EXISTS "employer can read own households" ON households;
DROP POLICY IF EXISTS "employer can write own households" ON households;
DROP POLICY IF EXISTS "helper can read household by invite code" ON households;
DROP POLICY IF EXISTS "employer can read own household_members" ON household_members;
DROP POLICY IF EXISTS "helper can read self in household_members" ON household_members;

-- 步骤 5: CREATE 5 条 anon-first RLS（用应用层 userId 过滤，不依赖 auth.uid()）
CREATE POLICY "anon read households" ON households FOR SELECT USING (true);
CREATE POLICY "anon write households" ON households FOR INSERT WITH CHECK (true);
CREATE POLICY "anon update households" ON households FOR UPDATE USING (true);
CREATE POLICY "anon read household_members" ON household_members FOR SELECT USING (true);
CREATE POLICY "anon write household_members" ON household_members FOR INSERT WITH CHECK (true);

-- 注意：原"helper can read household by invite code" 是 USING (true) 等于全表对匿名读者开放
--      新策略保持等价（前端 .eq('employer_id', userId) 或 .eq('helper_id', userId) 收口）

-- 步骤 6: Backend Lead 改 Home.tsx PostgREST 嵌入查询加 !helper_id alias hint
--        + 3 处 INSERT 加 error 兜底（不要 try/catch 吞错）
```

---

## §4 风险缓解措施（Lead 必跑）

修前：
- Lead 备份 households + household_members 表到 `_bridge/smell3_b1_backup_<timestamp>.json`
- 数 households 行数 + household_members 行数 + helper_id 不为 NULL 行数（基线）

修后立刻 smoke 测：
- mock employer userId = 'test-emp-001' + 创建一个家庭 → SELECT 看到 1 行 ✅
- mock helper userId = 'test-helper-001' + 加入家庭 → households + household_members SELECT 看到 ✅
- 切到 employer 视角 SELECT helper 信息 → 看到 helper ✅
- 切到 helper 视角 SELECT 雇主家庭 → 看到 ✅
- DELETE employer 用户 → household_members 应级联删（ON DELETE CASCADE）

任一 case 失败 → 立刻回滚：

```sql
BEGIN;
-- 重建旧 5 RLS（从 migration 001 拷贝）
DROP CONSTRAINT IF EXISTS household_members_helper_id_fkey;
ALTER TABLE household_members ALTER COLUMN helper_id TYPE uuid USING helper_id::uuid;
-- restore 孤儿数据（从备份 JSON）
COMMIT;
```

---

## §5 收益（修通后）

- Home 页面 console 400 错误消失（雇主每次加载首页都报的 PostgREST 嵌入查询失败）
- 雇主邀请菲佣功能稳定（之前可能静默失败，user 看不到 error）
- 数据库 schema 干净，未来加新功能（菲佣评级 / 菲佣发工资 / 家庭多雇主）不会撞这个老坑
- Backend Lead 后续 ticket（5-channel 真个性化做 helper 视角 / 工资记录等）减少绕路

---

## §6 老板拍 A/B/C

- **A 本周做**（CEO 推荐）— 趁 β 内测期改 schema 最佳窗口（< 10 真用户，失误也好回滚）。CEO 派 Database 023 今天下午 / 周日做
- **B 月底做** — 等 Stripe 激活 + onboarding 4 件改动完全收口再动。但 β 期窗口错过
- **C 不做** — 接受 console 400 + 邀请菲佣偶尔失败，等 10k 用户后用户力推再说

CEO 倾向 **A**（β 期 + 用户少 + Database Lead 状态在线 + 风险全有缓解措施）。

老板回来 1 句话拍 A / B / C，我立即派或暂搁置。
