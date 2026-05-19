# 诊断报告 — Smell 3：households / household_members schema 错配

> 起草人：Backend Architecture Lead
> 日期：2026-05-19
> 任务来源：`_bridge/telepot_backend.md`（CEO 派单）
> 状态：仅诊断，未改动任何代码 / migration

---

## TL;DR（先看这一段）

1. **CLAUDE.md "Smell 3" 描述本身需要修正**：CLAUDE.md 写的是「前端查询 `WHERE user_id = ?` 导致 PostgREST 400」——经全量 grep，**`src/` 内无任何一处对 `households` / `household_members` 使用 `user_id` 字段查询**。所有查询用的都是 `employer_id` 或 `helper_id`，与 DB 实际字段对齐。
2. **真正每次 Home mount 报错的源头**，最可能是另外两件事：
   - `src/pages/Home.tsx:425` 用 PostgREST 嵌入语法 `household_members(helper_id, user_profiles(display_name))`，但 DB 中 `household_members.helper_id` **没有任何 FK 指向 `user_profiles.id`**（migration 006 已把 FK→`auth.users` 全部丢弃），PostgREST 极可能因「找不到关系」返回 400 `PGRST200`。
   - migration 001 给 `households` / `household_members` 创建的 RLS 策略**全部依赖 `auth.uid()`**（写策略尤其严重），与本项目「自定义 Auth + 匿名用户」的硬性不变量直接冲突——匿名 INSERT 会被静默拒绝。
3. **推荐修复方向：B（前端 + DB 协同最小补丁），不是 A（加 view）**。理由见 §4，但前置必要动作是 DB 部门先核对生产 RLS 现状（生产可能已被 dashboard 改过，与 migrations 不同）。

---

## 1. 错配点精确清单

### 1.1 `households` 查询点（5 处）

| # | 文件:行号 | 查询字段 | DB 实际字段 | 匹配？ | 风险 |
|---|---|---|---|---|---|
| 1 | `src/pages/Home.tsx:424-428` | `.eq("employer_id", userId)` + `.order("created_at")` + `.limit(1)` | `employer_id uuid`、`created_at timestamptz` 均存在 | ✅ 字段对齐 | 嵌入 select 见 §1.3 |
| 2 | `src/pages/Home.tsx:440-443` | `.insert({ employer_id: userId })` → `select("id, invite_code")` | 字段都在 | ✅ 字段对齐 | RLS 风险 §2.2 |
| 3 | `src/pages/Settings.tsx:358-362` | `.eq("employer_id", userId)` + `.order("created_at")` + `.limit(1)` | 同上 | ✅ 字段对齐 | — |
| 4 | `src/pages/Settings.tsx:367-370` | `.insert({ employer_id: userId })` → `select("invite_code")` | 字段都在 | ✅ 字段对齐 | RLS 风险 §2.2 |
| 5a | `src/pages/HelperHome.tsx:159-162` | `.eq("id", householdId)` → `select("employer_id")` | 字段都在 | ✅ 字段对齐 | — |
| 5b | `src/pages/HelperHome.tsx:236-239` | `.eq("invite_code", code)` → `select("id")` | `invite_code text UNIQUE`、`id uuid` | ✅ 字段对齐 | — |

### 1.2 `household_members` 查询点（2 处）

| # | 文件:行号 | 查询字段 | DB 实际字段 | 匹配？ | 风险 |
|---|---|---|---|---|---|
| 1 | `src/pages/HelperHome.tsx:147-152` | `.eq("helper_id", userId).eq("status", "active").order("joined_at")` | `helper_id uuid`、`status text`、`joined_at timestamptz` 均存在 | ✅ 字段对齐 | RLS 风险 §2.2 |
| 2 | `src/pages/HelperHome.tsx:249-250` | `.upsert({ household_id, helper_id, status }, { onConflict: "household_id,helper_id" })` | `UNIQUE (household_id, helper_id)` 已建 | ✅ 字段 + 约束对齐 | RLS 风险 §2.2 |

### 1.3 「碰巧不报错 vs 直接 400」分类

- **直接最可能 400 的**：`src/pages/Home.tsx:425` 的嵌入语法 `select("id, invite_code, household_members(helper_id, user_profiles(display_name))")`
  - PostgREST 触发嵌入资源时需要在 schema cache 里找到一条从 `households → household_members` 的 FK（这条还在，migration 001 的 `household_id uuid REFERENCES households(id)` 未被删除）。
  - **但**第二跳 `household_members.helper_id → user_profiles(display_name)`：
    - migration 001 写的是 `helper_id uuid REFERENCES auth.users(id)`，migration 006 把这条 FK **DROP** 掉了。
    - `user_profiles.id`（推测 PK）与 `household_members.helper_id` 之间**从未存在 FK**——migrations 005/010 只 ALTER 列、没建关系。
    - 结果：PostgREST 找不到 `household_members → user_profiles` 的关系 → 大概率返回 `PGRST200 "Could not find a relationship..."`，HTTP 400。
  - **这一条最匹配 CLAUDE.md "每次 Home 页 mount 报 2-4 条 PostgREST 400"** 的现象（首次 mount + 任何重新挂载都会触发）。
- **看似不报错、实则可能空数据**：所有匿名上下文中的 `INSERT`（#2 / #4 / 1.2#2）。若生产 RLS 仍是 migration 001 的写策略，匿名 INSERT 会被策略拒绝；Supabase JS SDK 默认不抛错，只返回 `data: null, error: PostgrestError`。前端代码里几处都没有 `if (error)` 兜底（Home.tsx:439 / Settings.tsx:366 / HelperHome.tsx:248 只在最后一处看了 error）。
- **完全无误**：上表里所有标记 ✅ 的字段访问。CLAUDE.md 那句「前端用 `user_id` 查」是个 stale 描述，可能是早期某版被改过又忘记更新 CLAUDE.md。

### 1.4 CLAUDE.md「Smell 3」描述需要更正的部分

| 原句 | 实际情况 |
|---|---|
| "Frontend queries `WHERE user_id = ?` → PostgREST 400" | 前端从未对 `households` / `household_members` 用 `user_id` 查。错配的不是字段名，是 (a) 嵌入资源关系不存在，(b) RLS 策略仍依赖 `auth.uid()` |
| "household_members 也是 ... 没有 user_id" | 这点描述本身没错（确实没有 `user_id`），但前端也没去查它，不是当前的痛点 |
| "每次 Home 页面 mount 报 2-4 条 PostgREST 400" | 真正源头很可能是 `Home.tsx:425` 单个嵌入查询的关系报错，加上若干次 INSERT 静默失败（如果生产 RLS 还在按 migration 001） |

---

## 2. DB 端真实结构梳理

> ⚠️ 以下信息全部来自 `supabase/migrations/`。生产 Supabase 可能在 dashboard 里被改过 schema 或 policy，**DB 部门必须用 `information_schema` / `pg_policies` 核对再下结论**。

### 2.1 字段清单（按 migration 重建）

#### `public.households` —— migration 001 + 006

| 列 | 类型 | 约束 / 默认 | 备注 |
|---|---|---|---|
| `id` | `uuid` | PK，`DEFAULT gen_random_uuid()` | — |
| `employer_id` | `uuid` | `NOT NULL` | migration 006 **已移除** FK→`auth.users(id)` |
| `name` | `text` | — | e.g. "Chan Family" |
| `invite_code` | `text` | `UNIQUE` | BEFORE INSERT trigger 自动生成 6 位 |
| `created_at` | `timestamptz` | `DEFAULT now()` | — |

- **索引**：`idx_households_employer` ON `employer_id`（无 unique，所以同一 employer 可以有多条；Home.tsx:418-421 注释也提到这一点）
- **Trigger**：`trg_household_invite_code` BEFORE INSERT 自动填 `invite_code`

#### `public.household_members` —— migration 001 + 006

| 列 | 类型 | 约束 / 默认 | 备注 |
|---|---|---|---|
| `id` | `uuid` | PK，`DEFAULT gen_random_uuid()` | — |
| `household_id` | `uuid` | `NOT NULL REFERENCES households(id) ON DELETE CASCADE` | 这条 FK **仍在** |
| `helper_id` | `uuid` | `NOT NULL` | migration 006 **已移除** FK→`auth.users(id)` |
| `status` | `text` | `NOT NULL DEFAULT 'active'`，CHECK in ('active','departed') | — |
| `joined_at` | `timestamptz` | `DEFAULT now()` | — |
| `left_at` | `timestamptz` | — | 软删除时间戳 |
| — | — | `UNIQUE (household_id, helper_id)` | 与 HelperHome.tsx:250 的 `onConflict` 对齐 |

- **索引**：`idx_members_household` / `idx_members_helper`

#### `public.user_profiles` —— **CREATE TABLE 语句不在 `supabase/migrations/`**

- migrations 002 / 005 / 010 都是 `ALTER TABLE user_profiles ADD COLUMN`，没有 CREATE。
- 推测此表是早期通过 dashboard SQL editor 直接建的；已知有列：`id`（PK，推测 uuid，由 localStorage `userId` 写入）、`display_name`、`stripe_customer_id`、`stripe_subscription_id`、`wechat_openid`、`wechat_unionid`、+各 health flag。
- **`user_profiles.id` 与 `household_members.helper_id` 之间没有 FK**，所以 PostgREST 不会自动发现这个嵌入关系（这正是 §1.3 第一条 400 的根因）。

### 2.2 RLS 状态（依 migration 001，**生产可能已偏离**）

#### `households` 策略

| 名称 | 命令 | 表达式 | 匿名用户能否通过 |
|---|---|---|---|
| `employer can manage own household` | FOR ALL | `USING (employer_id = auth.uid())` | ❌ `auth.uid()` 为 NULL，全部拒绝 |
| `helper can read household by invite code` | FOR SELECT | `USING (true)` | ✅ 全开 |

→ 匿名 INSERT/UPDATE/DELETE 全部被 RLS 拒绝（首条策略覆盖 ALL，第二条只覆盖 SELECT）。

#### `household_members` 策略

| 名称 | 命令 | 表达式 | 匿名用户能否通过 |
|---|---|---|---|
| `employer can manage members` | FOR ALL | `USING (household_id IN (SELECT id FROM households WHERE employer_id = auth.uid()))` | ❌ |
| `helper can read own membership` | FOR SELECT | `USING (helper_id = auth.uid())` | ❌ SELECT 也拒（`auth.uid()` 为 NULL） |
| `helper can insert own membership` | FOR INSERT | `WITH CHECK (helper_id = auth.uid())` | ❌ |

→ 严重：匿名用户既读不到也写不进。这与项目硬性不变量「`auth.users` 表为空、`auth.uid()` 永远 NULL」直接冲突。

### 2.3 「生产是否真的报 400」需要 DB 部门做的核对

```sql
-- 列出真实 RLS 策略
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('households', 'household_members');

-- 列出真实 FK（验证嵌入关系）
SELECT tc.constraint_name, tc.table_name, kcu.column_name,
       ccu.table_name  AS foreign_table_name,
       ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('households', 'household_members');
```

如果生产的 `pg_policies` 已经把 `auth.uid()` 策略全部换成 `USING (true)`（或干脆 `ALTER TABLE … DISABLE ROW LEVEL SECURITY`），那只剩 §1.3 第一条 400（嵌入关系）需要修，且修法变得很简单。

### 2.4 能不能加个 view 让前端按 `user_id` 语义查？

可以，但**没必要**——前端代码本来就没用 `user_id` 查这两张表。CLAUDE.md 的描述把方向带歪了。真正要解决的是「PostgREST 嵌入关系报错」和「RLS 与匿名 auth 冲突」，view 解决不了这两件事。

---

## 3. 修复方向 A / B 评估

### 方向 A：DB 层加 view / 兼容字段，前端不动

- **做法**：例如在 DB 加 `CREATE VIEW households_by_user AS SELECT *, employer_id AS user_id FROM households;`，再前端切到这个 view。
- **优势**：理论上前端零改动。
- **风险 / 反对意见**：
  1. 前端**当前根本没用 `user_id` 查**，view 是在解决一个不存在的问题。
  2. View 引入第二个语义层（user_id 同时指 employer_id？helper_id？）→ 将来真要区分雇主 / 保姆时，view 抽象会先于业务模型崩。
  3. View 解决不了 §1.3 第一条的「嵌入关系不存在」（PostgREST 嵌入依赖物理 FK，view 上的派生列没有 FK）。
  4. View 也解决不了 §2.2 的 RLS 与匿名 auth 冲突。
- **结论**：方向 A 不推荐——它只对「字段名错配」这一个（实际上并不存在的）问题有效，对真痛点无帮助。

### 方向 B：前端微调 + DB 修两个真痛点

- **做法**（分两个工单，分别给 Backend 和 Database）：
  - **B-1（Database 部门）**：
    a. 加一条 FK：`ALTER TABLE household_members ADD CONSTRAINT household_members_helper_id_user_profiles_fkey FOREIGN KEY (helper_id) REFERENCES user_profiles(id) ON DELETE CASCADE;`——这条 FK 不指向 `auth.users`，不违反硬性不变量；PostgREST 检测到后，`Home.tsx:425` 的嵌入 select 就能成功。
       - 前置条件：核对历史数据中 `household_members.helper_id` 是否全部在 `user_profiles.id` 中存在；若有孤儿行需先清洗。
    b. 把所有 `auth.uid()` 策略改成 `USING (true)` 或干脆 `DISABLE ROW LEVEL SECURITY`（与本项目「匿名 + 应用层授权」一致），消除 §2.2 静默写入失败。
       - 这一步符合 CLAUDE_BACKEND.md 硬性不变量 #1。
  - **B-2（Backend / 前端 surgical 微调）**：
    a. `Home.tsx:425` 嵌入 select 加一个 `!helper_id` hint（让 PostgREST 锁定 FK 列，避免歧义）：`household_members(helper_id, user_profiles!helper_id(display_name))`。
    b. `Home.tsx:439-447`、`Settings.tsx:366-373`、`HelperHome.tsx:248-258` 的几处 INSERT/upsert 全部加 `if (error)` 兜底（无论 RLS 是否修复，缺 error handling 都是隐患）。
- **优势**：
  1. 直接消除两类报错（嵌入关系 400 + RLS 静默失败）。
  2. FK→`user_profiles`（而非 `auth.users`）不违反任何硬性不变量。
  3. 前端改动量极小（一行 hint + 几处 error 兜底），surgical-only。
- **风险**：
  1. 加 FK 前需要数据清洗（孤儿 `helper_id`）——属于 Database 部门职责。
  2. 关掉 RLS 后，未来如果要做雇主 / 保姆数据隔离，需要走应用层鉴权（前端 + edge function），需要 Architect 通过设计审。

### 推荐：**方向 B**

理由：方向 A 是在解决一个被 CLAUDE.md 错误描述的字段问题；方向 B 解决的是真正每次 Home mount 报错的两个根因，且改动严格满足「surgical」「不违反硬性不变量」「跨部门各自负责」三条边界。

---

## 4. 牵涉的边界

### 4.1 微信小程序端 `wechat-mp/`

- `grep -rni "households\|household_members" wechat-mp/` → **无任何结果**。
- 小程序壳只做 web-view + WeChat 授权，不直接读 household 表。
- **结论**：无影响。

### 4.2 Edge Functions `supabase/functions/`

- `grep -rn "households\|household_members" supabase/functions/` → **无任何结果**。
- 所有 edge function（gemini-proxy / parse-intent / stripe-* / wechat-mp-callback）都不碰 household 表。
- **结论**：无影响。

### 4.3 `src/lib/familyPrefs.ts`（`loadHomeByDay` / `saveHomeForDay`）

- 这两个函数只读写 localStorage（key 推测为 `homeByDay` 或类似），**不查 DB**。
- 它表达的是「今天家里有谁吃饭」（per-day 头数 / 在家成员选择），与 DB 的「household」（雇主 + 保姆雇佣关系）是**两个完全不同的概念**，但在词汇上极易混淆。
- **影响**：本次诊断 / 修复不需要碰 familyPrefs.ts；但建议未来在 CLAUDE.md 中明确这两层语义的命名边界（避免下次再有人以为 "household" 在前端就是「家里有谁」）。

### 4.4 算法部门（菜单生成 / `useWeeklyMenu` / `useSupabaseMenu`）

- 算法侧只读 `homeByDay` localStorage + `dishes` 表，不依赖 `households` / `household_members`。
- **结论**：本次修复不影响算法 endpoint 入参 / 出参。

### 4.5 其他可能误踩的点

- `src/pages/Home.tsx:435-436` 假设 `m.user_profiles?.display_name` 存在——如果 PostgREST 嵌入修好（B-1.a）但用户没设 display_name，会显示空字符串而不是「保姆」字样；前端已经用 `?` 兜底，不会崩。
- `src/pages/Settings.tsx:367` 的 INSERT 在「用户没有任何 household 行」时触发；若 RLS 仍按 migration 001 在拦，invite_code 就一直为空（用户反馈 2026-05-17 的现象就是这个，Settings.tsx:347 注释里提到了）。修 B-1.b 后这条路径会自愈。

---

## 5. 给下一棒的小抄

- **CEO / Architect**：CLAUDE.md "Known Architectural Smells" 的 Smell 3 描述需要按本报告 §1.4 更新一版，否则下一次诊断会再被带偏。
- **Database 部门**：本报告 §3 方向 B-1 是给你们的工单（加 FK + 清 RLS），但请先按 §2.3 的 SQL 核对生产真实状态再行动。
- **Backend / 前端**：本报告 §3 方向 B-2 是 surgical 改动清单，等 DB 工单做完后再上。
- **未来 wechat 公众号认证完成后**：如果引入真正的 Supabase Auth 会话，需要重新评估 RLS 策略（可能从「全开 + 应用层鉴权」回退到「auth.uid() + RLS」）。
