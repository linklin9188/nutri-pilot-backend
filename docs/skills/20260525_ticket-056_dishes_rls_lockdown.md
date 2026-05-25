# TICKET-056 dishes RLS lockdown (Database Security)

日期：2026-05-25
范围：supabase/migrations/098_dishes_rls_lockdown.sql

---

## 1. 问题

CEO ticket TICKET-055 audit 提示 dishes 表"anon-first FOR ALL USING (true)"。
我实查发现实际比 audit 更糟：

- `pg_class.relrowsecurity = false` —— RLS **根本没启用**
- `pg_policies WHERE tablename='dishes'` —— **零条 policy**

PostgREST 默认行为：RLS 未启用 + 表对 anon role 有 grant，意味着 anon REST API
可以直接 `DELETE FROM dishes`、`UPDATE dishes SET ...`、`INSERT INTO dishes ...`，
任何匿名用户可在一秒内清空 929 道菜的菜库。

同时实查发现 `ingredients / dish_ingredients / michelin_dishes` 也是 RLS=false，
是同一漏洞家族（系统数据表未启 RLS）。本 ticket scope 只锁 dishes，其他三张
留 follow-up ticket。

---

## 2. 方法

### Step 1: 实查 + 影响面分析
- `supabase db query --linked` 查 `pg_class.relrowsecurity` 和 `pg_policies`
  确认 dishes 真实状态。
- `grep "from('dishes')" src/` 找前端 19 处调用，过滤
  `.delete\|.update\|.insert\|.upsert` 找出写入路径。

### Step 2: 找到 2 处前端写入（必须告知 CEO）
- `src/lib/geminiSchoolBalance.ts:170-194` — school balance Gemini 生成新菜
  anon INSERT 入库
- `src/pages/Home.tsx:1021-1025` — 用户 swap 菜时 anon UPDATE 计数器
  `times_employer_swapped`

这两处都是 design smell（anon 直写共享菜库 = 任何人可改任何菜的计数器，
可灌任何垃圾菜进库），但 ticket 优先封堵 DELETE 漏洞，搬到 edge function
留作 follow-up。

### Step 3: migration 098
- `ALTER TABLE dishes ENABLE ROW LEVEL SECURITY`
- 防御性 `DROP POLICY IF EXISTS` 6 个可能命名（实际全部 skip，证实零 policy）
- `CREATE POLICY dishes_anon_read FOR SELECT TO anon,authenticated USING (true)`
- 不创建任何 INSERT/UPDATE/DELETE policy，PG 默认 deny；service_role 走默认
  bypass，seed scripts / edge functions 用 service key 写入。

### Step 4: `supabase db push --linked` apply 远端

### Step 5: 真测验证（关键）
用 `SET LOCAL role anon` 模拟 PostgREST anon 行为：

| 操作 | 验证结果 | 说明 |
|---|---|---|
| `SELECT relrowsecurity` | true | RLS 已启用 |
| `SELECT policyname` | dishes_anon_read (SELECT) | policy 已创建 |
| anon `DELETE` | 0 行返回 | RLS 拒（无 DELETE policy） |
| anon `UPDATE` | 0 行返回 | RLS 拒（无 UPDATE policy） |
| anon `INSERT` | `42501 new row violates RLS` 报错 | RLS 拒（PostgREST 返 403） |
| anon `SELECT` | 929 道菜 | 仍能正常读 |
| 表行数 (DELETE 前后) | 929 → 929 | 数据无损 |

---

## 3. 标准（今后 RLS 设计规范）

### RLS 表分类
- **系统数据**（dishes / ingredients / dish_ingredients / michelin_dishes /
  suppliers / supplier_skus / restaurant_places）：anon **只 SELECT**，写入
  必须走 edge function + service_role。
- **用户数据**（households / household_members / family_members / orders /
  cart_items / home_inventory / household_meal_schedule / user_preference_scores
  等）：anon-first `FOR ALL USING (true)`（custom auth + localStorage userId
  模型下没法走 auth.uid()，只能信任前端传 userId）。

### 强制 audit 规则
1. 每张新表 migration **必须显式** `ENABLE ROW LEVEL SECURITY` + 至少 1 条
   policy。**不能默认 RLS=disabled 上线**（这次 dishes 就是裸表上线 80+
   migration 都没人补 RLS）。
2. 凡 anon `FOR ALL` policy 必须在 PR 描述说明"为什么是用户数据"，否则
   reviewer 推回去改成 SELECT-only。
3. policy 做不到字段级。任何"anon 只改一列计数器"的需求 = 走 edge function
   或独立 events 表，不要在共享业务表上开 anon UPDATE 口子。

### 验证 RLS 是否真生效的姿势
不能用 `supabase db query`（默认 service_role bypass），必须 `SET LOCAL role anon;`
后再跑 DELETE/INSERT/UPDATE/SELECT，看 PG 真实返回（0 行 = 静默拒；42501 =
INSERT WITH CHECK 拒）。

### Follow-up ticket（留给 CEO 排期）
1. `src/lib/geminiSchoolBalance.ts` school balance 新菜入库搬到
   `gemini-proxy` 或新建 `school-balance-persist` edge function，用 service key。
2. `src/pages/Home.tsx` swap counter 改走 `user_swap_events` 表的 insert
   （已是 anon-first 用户数据表），或独立 edge function 累加。
3. 同样锁 `ingredients / dish_ingredients / michelin_dishes` 三张系统数据表
   RLS（实查前端 0 写入，预计 0 破）。
4. 全 schema audit：`SELECT tablename FROM pg_tables WHERE schemaname='public'
   AND rowsecurity=false;` 当前还有 archive 表 + `users / api_usage_daily /
   user_lunch_log / user_chef_interest / user_swap_events / feedback_rollup_runs`
   未启 RLS，逐一判定 read-only 还是 anon-first。
