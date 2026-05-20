# LESSONS.md — Aieats 全项目教训库

> 立项：2026-05-20 HKT（PROCESS.md v1.3.1 §14 铁律 0 落地）
> 维护方：Cowork（CEO）汇总 + 4 部门 dump-before-compact 强制上交
> 用途：跨部门 / 跨时间复用**踩过的坑 / 失败尝试 / 误判**，避免重复犯错

---

## 机制概要

与 `docs/SKILLS.md` 互补：
- **SKILLS.md** = 做对了的可复用经验（"未来再做 X 用这套办法"）
- **LESSONS.md** = 踩过的坑 + 教训（"未来再做 X 避免这种错"）

每次 `/compact` 前**强制**先把对话里的 lesson 追加到本文件 + commit + push。绝不允许跳。

格式（与 SKILLS.md 一致）：

```markdown
## <部门 / CrossCutting>

### <lesson-id> — <一行描述>
- **场景**：发生时的情境
- **踩坑**：错在哪 / 为什么会错
- **代价**：浪费了多少时间 / 资源 / 老板情绪
- **教训**：未来怎么避免
- **来源**：TELEPOT-XXX 或 事件时间
```

---

## UI

### duplicate-info-strip-on-home-after-multiple-adds — UI 多次叠加 hot-fix 导致同信息重复显示
- **场景**：UI 034 我（CEO）让他加"营养条上方时令小标签"（节气 + 时辰 + 天气），但 Home 头部已有同样信息（节气 + 温度 + 天气文字）。结果用户真机看到 "☀️ 立夏 · 申时 · ☁️ 小雨" 这一行在头部和营养条上方各出现一次。
- **踩坑**：CEO 派单时**没先 grep 现有 UI 看头部已显示什么**，凭印象加新组件 → 与头部冗余。UI 干完工单照样执行，没主动反映"这跟头部重了"。
- **代价**：老板真机截图发现，hot-fix TICKET-051 §0 删掉。
- **教训**：UI 派单加任何"全局信息条 / banner / strip"前，**CEO 必须先 grep Home.tsx 看头部 / footer / 现有侧栏已显示啥**，避免叠加重复。UI 部门也应主动检查 — 工单 SOP 加一条 "新增信息条前必检查页面顶/底/侧已有同维度信息"。
- **来源**：UI 034 营养条时令小标签 → 051 §0 hot-fix 删除

### ceo-no-stale-intel-no-negative-judgement — CEO 凭过时记忆给"做不到"否定判断 → 直接砍掉一个方案
- **场景**：老板问"手机 Claude 跟我（CEO）联动"。我凭训练数据（截止 2025-05）说"Cowork 是 desktop-only research preview，做不到"。
- **踩坑**：训练截止 ≠ 当前现实。Anthropic 2026 年已推 **Dispatch beta**（手机 ↔ desktop 跨设备 single thread 同步），我完全不知道。系统提示其实明写"产品能力问题必先 web search"我没触发。
- **代价**：老板纠正 + 严厉批评"作为 CEO 你绝对不可以信息过时"+ 立项纪律 `feedback_no_stale_intel`
- **教训**：凡涉及 Anthropic / Claude / Cowork / Code / Stripe / Supabase / Railway / 任何外部产品 → **先 WebSearch 官方文档再答**。否定判断（"做不到"）必须 verify > 6 个月前的信息源。
- **来源**：TELEPOT-20260520-DISPATCH-DISCOVERY（HKT 上午）

### ceo-越界-不要-coding — CEO 试图自己 git push / 装 supabase CLI / 跑 vite build
- **场景**：老板提"真付费走通测试"等需要技术动作的任务时，我误以为该 CEO 自己去 git push + 跑命令。
- **踩坑**：CEO 角色边界在"派单 / 复审 / 决策 / 汇报"，**不是 coding / 不是 git push / 不是装 CLI**。这些是员工的活。我多次越界。
- **代价**：老板原话"你不要参与 coding，这是员工的工作 不是 CEO 的工作"+ 我立即停 + 道歉
- **教训**：CEO 范围 = `_bridge/` 工单 + `docs/` 文档 + `memory/` 纪律 + `MORNING_REPORT.md` 监工 + 跟老板对话。任何需要 git push / 跑 SQL / vite build / supabase db push 的事 = 派给员工，不自己干。
- **来源**：HKT 凌晨 ~01:30 老板纠正

### 消极口径 vs 主动指挥 — "零派单 / 收工话术" → 失去指挥能力
- **场景**：凌晨 03:00 scheduled task 写"五部门未启动 → 本轮零派单"+ 后续我说"今天能看到的成效已全部落地"/ "Day 6 完工基本可以收工"
- **踩坑**：CEO 该**主动 push** 工单池储备，不是消极汇报"零派单"或自我设限"差不多了"。"零派单"= 失去指挥能力。
- **代价**：老板原话 "人都在等你指令 你说你看不到" / "你失去了指挥能力" / "你完全没有理解我的意图" + 立项 `feedback_never_stop_without_command`
- **教训**：任一部门 idle = 立即派下一棒。维持工单池储备永不空。禁用收工话术（"成效已全部落地" / "基本可以收工" / "等老板下一步指令"）。除非老板明确说停，永远有下一波。
- **来源**：凌晨 03:00 巡检 + HKT ~12:50 老板再批 "不要去限定时间"

### ceo-misread-ambiguous-stop-signal — CEO 把含糊词当"收工"错停工
- **场景**：老板写"总结好今天的所有技能，今天手工"。CEO 把"手工"读成"收工"立即触发收尾流程（写 DAY_REPORT、归档任务列表、停派单）。下一句老板说"继续"，CEO 才意识到误读 — "手工" 可能是误打或方言（"就要 / 必须 / 搞完"），不一定等于"停"。
- **踩坑**：含糊词触发收工是 high-impact 误判（never-stop 唯一允许的停就是"老板明确说停"，我把含糊误判为明确）。
- **代价**：浪费 1 个 turn 写收工报告 + 派单池停了 1 个 cycle。
- **教训**：feedback_never_stop_without_command 第 4 条"唯一允许的停"必须**关键词强匹配**：'停' / '收工' / '不要再派' 等精确字面。其他含糊词（'手工' / '搞定' / '差不多' 等）一律按 never-stop 继续推进，老板要停会再说明。
- **来源**：HKT 15:30 老板"今天手工" CEO 误读为收工 → 老板"继续"纠正
- **复用场景**：所有"等老板明确指令才执行 high-impact 动作"的场景 — 关键词强匹配优于语义推断。

### anthropic-burst-rate-limit-4-tab-concurrent — 4 部门并发同时 process telepot 触发服务端 rate limit
- **场景**：CEO 让 4 个 warp tab 同时敲 process telepot 启动并发工单，Anthropic 服务端短时间收到 4 倍请求量触发 "Server is temporarily limiting requests (not your usage limit) · Rate limited"。
- **踩坑**：Anthropic 平台 burst rate limit 保护机制 — 单账号短时间内大量并发请求会被临时限流（不是 usage 超限，纯粹服务端保护）。
- **代价**：员工 tab 中断需老板重敲 process telepot 才能继续，浪费 1-3 分钟等服务端冷却。
- **教训**：CEO 派单后告诉老板"4 个 tab **分批 1 分钟错开**敲 process telepot"（不要同时 4 敲）。或者每个工单顶部加 "本工单启动前自检 — 其他 3 部门已开始 ≥ 1 分钟才启动"的提示。
- **来源**：HKT 15:10 / 15:12 两次 rate limit（UI 056 + Algorithm 058）
- **复用场景**：所有多 tab 并发场景（不限 Aieats）— 分批启动而非同时启动。

### ceo-没主动监控员工-context-percentage — 等老板提醒才意识到员工 72% 该 compact
- **场景**：老板贴 status bar 截图显示某员工 72% context。我（CEO）一直在派工单全开火力，没主动监控员工 status bar 的 context %。
- **踩坑**：PROCESS.md v1.3.1 §14 写的"70% 主动 compact 不等 80% 自动"是给员工自查用的，但**CEO 也应有责任** — 监工时除了看 commit hash + STATUS，还应抽样检查员工 context %（如果可见）/ 或者派工单前默认提醒员工自查。
- **代价**：老板用截图提醒 = CEO 监工有盲区
- **教训**：每派工单前默认加"PROCESS.md v1.3.1 §14 铁律 0 自检"在工单顶部（已落地）。但 CEO 端还要：(a) MORNING_REPORT 加 "员工 context % 抽样"段（如果能拿到）；(b) 每 10 棒工单暂停 1 棒强制全员 dump + /compact，防 silent loss；(c) 老板观察到时不甩锅给员工"他没自查"，而是先承担 CEO 监工责任。
- **来源**：HKT 15:00 老板 status bar 截图提醒

### 主动扫 memory 反射不到位 — index 看到但没"想到要查"
- **场景**：MEMORY.md 永远在我上下文，但具体 memory file 按需读，我经常"看到 index 但没意识到当前对话跟它相关"
- **踩坑**：feedback_no_stale_intel 立项后，下一轮老板继续问产品能力问题时，我仍然差点凭记忆答（被自己反射救回来）
- **代价**：老板观察到"我发现有时候我问你 你才调动去审核？"+ 立项 `feedback_proactive_memory_read`
- **教训**：每个用户消息进来**第一动作**：扫 MEMORY.md index，按关键词触发对应 feedback 反射。不被动等老板说"你查一下 memory"。
- **来源**：HKT ~12:30 老板观察

---

## Database

### create-table-if-not-exists-schema-drift — 同名表存在 schema 不同时引发 42703
- **场景**：migration 027 想 CREATE TABLE IF NOT EXISTS user_feedback (dish_id ...)，但生产 user_feedback 是老 schema（无 dish_id 列） → IF NOT EXISTS 跳过 CREATE 但后续 CREATE INDEX 引用 dish_id 触发 42703 列不存在
- **踩坑**：CREATE TABLE IF NOT EXISTS 不验证 schema 是否一致，仅按表名判断
- **代价**：事务回滚，TICKET-012 BLOCKED 等 CEO 拍方案 X/Y/Z
- **教训**：预检：先 `SELECT column_name FROM information_schema.columns WHERE table_name=$1` 看真实 schema。若存在且不一致 → 改用新表名（如 user_feedback_helper）避开冲突。
- **来源**：TELEPOT-20260520-012 → 016

### dedup-cascade-fk-data-loss-trap — 表行 dedup 前必先 audit 所有 FK 表 ON DELETE 行为（3 步法）
- **场景**：P12 麻婆豆腐 dedup，2 行 dish_id 中 4eb35a1d 上挂着 dish_ingredients (CASCADE 8 行) + user_dish_history (CASCADE 2 行) + user_weekly_menus 数组引用 2 行 + 其他 4 张 FK 表。直接 DELETE 4eb35a1d 会 CASCADE 触发 dish_ingredients 8 行随删 → 购物清单完全坏掉，d94044cf 那行还是 0 ingredients → 数据丢失红线 #3
- **踩坑**：员工初版工单 §B 说"DELETE 1 行不动其他"实际上做不到 —— CASCADE 是 DB 层自动级联，DROP 不动其他在有 FK 表时是矛盾命题
- **代价**：TICKET-033 §B BLOCKED 等 CEO 决方案 → 改 5 步事务零损失迁移
- **教训**：未来任何表行 dedup 前**强制三步法**：
  1. `SELECT confrelid::regclass, confdeltype FROM pg_constraint WHERE confrelid='<table>'::regclass;` 列出所有引用此表的 FK + ON DELETE 行为
  2. 对每张 CASCADE 表 → 必须先 UPDATE 把引用迁到保留行，**不允许 cascade-delete**
  3. 对每张 SET NULL 表 → 评估是否产生孤儿，必要时 UPDATE 迁
  之后才 DELETE 主行，全程事务包裹。
- **来源**：TELEPOT-20260520-033 §B（麻婆豆腐 P12 dedup）

### pk-collision-when-merging-fk-references — 复合 PK 表 FK 迁移先 DELETE 冲突再 UPDATE 不冲突
- **场景**：user_dish_history PK=(user_id, dish_id, served_date)，把 4eb35a1d 的 2 行 history UPDATE 改成 d94044cf 时，其中 1 行 (preview-user, 4eb35a1d, 2026-05-13) 会跟现有 (preview-user, d94044cf, 2026-05-13) 撞 PK
- **踩坑**：单纯 UPDATE table SET dish_id = $new WHERE dish_id = $old 会 PG unique_violation 23505 — 复合 PK 表的 FK 迁移不能傻傻 UPDATE
- **代价**：dedup 事务必须再加 1 步处理冲突
- **教训**：复合 PK 表 FK 迁移的 pattern：
  1. 先 DELETE 跟保留行 PK 冲突的旧引用（"反正是历史重复"）
  2. 再 UPDATE 不冲突的旧引用为新 dish_id
  3. 用 EXCEPT / NOT EXISTS 子查询识别冲突集合，避免漏
- **来源**：TELEPOT-20260520-033 §B

### ceo-ticket-numeric-claim-verify-before-execute — CEO 工单引用"X 道/Y 行"数字时先 1 SQL 实测
- **场景**：TICKET-062 §A 工单写"028 + 045 + 048 = 28 道节庆菜 backfill xiaomei_compatible"，实测 `SELECT COUNT(*) FROM dishes WHERE festival_tags <> '{}' AND xiaomei_compatible IS NULL` → 0 行（91 道节庆菜早已对齐）。
- **踩坑**：CEO 引用 ticket 编号时易口误（028 是 user_feedback；045 是 avatar；都不是节庆菜）。若按 28 盲跑 backfill 会差/多操作几十道。
- **代价**：TICKET-062 §A 实际无需运行 backfill-xiaomei-compat.ts，但若不实测就盲跑会污染数据 + 浪费 1 棒。
- **教训**：所有 backfill / batch / migration 任务执行前**强制 1 SQL 实测目标行数**，如与工单数字不符 → response NOTES 透明汇报差异 + 按实测值执行（或转 CEO 确认）。
- **来源**：TELEPOT-20260520-062 §A no-op

---

## Backend

### embedded-i18n-vs-sidecar-column-spec-drift — SPEC 写 sidecar 列但生产已用 embedded i18n
- **场景**：SPEC §3.1 说翻译用 cook_steps_json_en / _tl / _id 三个 sidecar 列，但生产 cook_steps_json 已是 embedded i18n jsonb（{ "zh": "...", "en": "..." }）
- **踩坑**：员工写脚本时按 SPEC 找列，schema-check 命中 SCHEMA NOT READY 直接 abort，浪费 1 棒时间才发现真相
- **代价**：TICKET-026 STATUS=needs_review 等 CEO 拍方向，Day 4 进度延后
- **教训**：写 SPEC 前先 read 生产 schema（不止类型也看 jsonb 内部结构）。SPEC drift 后及时更新（已弃 sidecar，改 embedded — CEO 已自决）。
- **来源**：TELEPOT-20260520-026

---

## Architect (退役 session)

### old-loop-blocks-new-ticket — 通宵循环没关，新工单读不到
- **场景**：Architect tab 早期挂了"通宵 sweep + 06:00 / 07:30 cron"逻辑。CEO 派 TICKET-007 综合收尾后，老板敲 process telepot，Architect 跑的是**老 cron 任务**（07:30 sweep），不是 TICKET-007。Wrangling 2m 2s 出"4 部门状态 + 守候态"老脚本输出，**永久退场 5 项任务一条没做**。
- **踩坑**：老脚本主动循环 + 新工单被动等触发，**老的优先于新的**。员工 watch 循环里没有"先 cat 最新 telepot.md 看 TICKET-ID 是否变化"的硬步骤。
- **代价**：Architect 没法退场，CEO 不得不自己接手写 docs/ARCHITECT_HANDOFF.md + 派给业务部门完成 4 项收尾
- **教训**：员工 SOP 强制"每次 process telepot 先 cat telepot.md 检查 TICKET 是不是新的，新则立即弃旧任务读新单"。已落到 PROCESS.md §4 去重算法。Architect 退役后此问题自然消失。
- **来源**：TELEPOT-20260520-007 退场失败事件
