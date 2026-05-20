# SKILLS.md — Aieats 全项目技能库

> 立项：2026-05-20 HKT（PROCESS.md v1.2 §13 机制落地）
> 维护方：Cowork（CEO）汇总；4 部门 CLI 在每次 response 末尾上交 LEARNED_SKILLS 段
> 用途：跨部门 / 跨时间复用工程经验，避免重复踩坑

---

## 机制概要

每个员工每完成一棒工单 → response 末尾写 `LEARNED_SKILLS`（参见 `_bridge/PROCESS.md` §13 格式）→ Cowork 读到后追加到本文件对应部门小节 → Cowork 派单给任一部门捎带 commit 本文件进 git。

去重规则：`skill_id` 重复时 → 不重写 detail，但累加 `source_ticket` 引用行。

---

## UI

> 前端 / React / Tailwind / Vite / Tailwind / lucide-react / motion / react-router-dom 范围

_（首次填充等 4 部门 TICKET-008..011 完工后由 Cowork 汇总；目前已知一条种子经验：）_

### lucide-tree-shaking — lucide-react 图标按需 import，bundle 增长几乎为零
- **detail**：从 lucide-react import 单个具名图标（如 `import { Sun, CloudRain } from 'lucide-react'`），vite 会 tree-shake 未用图标，7 个图标只增 ~1KB minified / ~1KB gzip。无需 npm install 任何附加包。
- **复用场景**：未来加任何 lucide icon（菜品/营养/家庭成员图标等）都按此 import 法，不要 import 整个 `lucide-react`。
- **来源**：TELEPOT-20260520-WEATHER-ICON (commit 961f54d)

---

## Backend

> Supabase Edge Functions / Deno / Gemini proxy / Stripe webhook 范围

### bridge-md-gitignored — `_bridge/` 内容是 gitignored，不要 git add
- **detail**：Cowork ↔ CLI 同步用的 `_bridge/*.md`（telepot/response/PROCESS/MORNING_REPORT 等）全部被 .gitignore 排除，不能 git add 进仓库。其他 `docs/*.md` 才进 git。每次 commit 前 `git status` 看到 _bridge/ 改动是正常的（同步用），不要 stage。
- **复用场景**：所有 commit 操作前确认 git add 路径不含 `_bridge/`。
- **来源**：TELEPOT-20260520-008（Backend 三合一收尾）

---

## Database

> Supabase Postgres / RLS / migrations / dish seed pipeline 范围

_（首次填充等 TICKET-010 完工后由 Cowork 汇总；目前已知一条种子经验：）_

### text-vs-uuid-fk-target — user_profiles.id 是 text，不是 uuid；FK 目标必须 text 列
- **detail**：项目用 custom auth（无 auth.users），`user_profiles.id` 是 `text`。任何指向 user_profiles 的 FK，源列必须是 `text` 而非 `uuid`。若源列原本是 uuid（如 household_members.helper_id），落地前必须先 `ALTER COLUMN TYPE text USING ::text`，否则 FK 添加失败。
- **复用场景**：任何新表加 user FK 列（user_id / employer_id / helper_id / 等）一律写 `text`，不要写 `uuid`。
- **来源**：migration 025（household_members.helper_id uuid → text + FK）+ 026（households.employer_id uuid → text）

### pg-alter-column-policy-cross-table-dep — ALTER COLUMN TYPE 必须先 DROP 所有跨表 RLS policy
- **detail**：场景：`ALTER TABLE households ALTER COLUMN employer_id TYPE text` 被 helper_reviews 表的 INSERT policy with_check 子查询 `WHERE households.employer_id = auth.uid()` 阻塞（PG 0A000 错误）。坑：同表 policy 引用易发现，**跨表 policy 子查询不容易预检**——必须查 pg_policies 全表。解决：执行顺序铁律 = DELETE 孤儿 → DROP POLICY（所有引用列的）→ ALTER COLUMN → ADD FK → CREATE POLICY (anon-first)。BEGIN...COMMIT 包裹失败时事务回滚干净可放心修正重推。
- **复用场景**：未来任何 RLS 表的列类型迁移都先跑 `SELECT policyname, tablename, qual, with_check FROM pg_policies WHERE qual LIKE '%<col>%' OR with_check LIKE '%<col>%'` 预检。
- **来源**：TELEPOT-20260519-SMELL3-B1-AND-P6（migration 025 + 026 落地）

### supabase-cli-temp-role-token-expiry — supabase db push 和 db query 走不同认证通道
- **detail**：场景：`db push` 连续 8 次 SASL auth fail (`cli_login_postgres` 临时角色 TTL 短)，但同一时刻 `db query --linked` 仍能正常跑（CREATE TABLE 备份成功）。坑：两条命令看似同源实则走不同认证路径——push 用临时角色，query 走 Management API。解决：(a) `supabase login` 交互式 OAuth 刷新 (b) `supabase login --token sbp_<personal_access_token>` 非交互可在 CLI 跑 (c) 紧急 fallback：`supabase db query --linked --file <migration.sql>` 直接执行 SQL。**禁止** UPDATE/INSERT/DELETE supabase_migrations.schema_migrations 手动登记 migration（破坏 CLI 自动登记路径）。
- **复用场景**：未来 db push 卡 SASL fail，先 try db query 验证通道是否独立可用，避免误判全失败。
- **来源**：TELEPOT-20260519-SMELL3-B1-AND-P6

---

## Algorithm

> generateWeekPlan / scoreForWeek / prefScores / 9-axis 范围

_（首次填充等 TICKET-011 完工后由 Cowork 汇总；目前已知一条种子经验：）_

### algo-version-double-column — 算法变更必须双列 stale（algo_version + cache_key）
- **detail**：单列 `algo_version` 只能捕获算法本体变动；但 cuisine / eating / intent / dpd 这些非算法维度变动后，旧 cache 仍会被命中。Migration 024 加双列，前端 SELECT 取回两列任一不匹配 → 强制 stale → 重生成。
- **复用场景**：未来任何"缓存语义变化"都按此双列模式，单列不够用。
- **来源**：migration 024 + Smell 4 改造（SPEC_algo_version_migration.md）

---

## CrossCutting

> 跨部门通用 / 工程文化 / 工具链 范围

### telepot-bidirectional-inbox — `process telepot` 双向触发词 + TICKET 显式去重
- **detail**：Cowork ↔ CLI 经 `_bridge/telepot_<dept>.md` (CLI inbox) + `_bridge/telepot_response_<dept>.md` (Cowork inbox) 一对一通信。`process telepot` 双向通用触发词。去重靠 TICKET ID 比对，不靠 mtime（mtime 会被编辑器误改）。完工后 telepot_<dept>.md 必须清空为 idle 态。
- **复用场景**：任何"远程 watch / 文件桥" 通信模式都参考此 SOP，避免重跑 / 弹窗 / 状态混乱。
- **来源**：`_bridge/PROCESS.md` v1.0 + v1.1 + v1.2

### no-bash-for-loop-in-claude-code-cli — Claude Code CLI 禁 bash 循环避免审批弹窗
- **detail**：Claude Code CLI 默认安全机制会把 `for f in ...; do ... done` 这种 shell variable expansion 判为 "simple_expansion" 触发审批弹窗。即使 `--dangerously-skip-permissions` 装了也可能因 tab 重启失效。员工要扫多个文件用 Read / Glob，禁用 bash for 循环。
- **复用场景**：所有跨多文件批量扫描都用 Read/Glob 工具，不用 bash for 循环。
- **来源**：凌晨 Architect 误弹窗事故 + PROCESS.md v1.1 §8 反弹窗铁律

### telepot-ticket-process-checklist-complete-read — cat telepot 工单必须读完整个"完工动作"清单到底
- **detail**：场景：员工 cat 工单后只看 §A/§B/§C 主体跳过末尾增补段，结果漏了 PROCESS.md v1.2 新加的 §12 清空工单 + §13 LEARNED_SKILLS 强制段。坑：CEO 在工单尾部追加的新规则没读到 → 完工不合规 → 第二轮 cat 时才识别要补完工。复用：员工 cat 工单时**逐行读到 EOF**，特别留意"完工动作"段是否引用了新的 PROCESS.md 版本号（v1.2 / v1.3 等），所有 §N 章节项必须打勾。
- **复用场景**：所有员工每次 `process telepot` 时读 telepot_<dept>.md 必须读到文件末尾，不能跳过尾部 SOP 增量。
- **来源**：TELEPOT-20260520-011（Algorithm 补完工事故）
