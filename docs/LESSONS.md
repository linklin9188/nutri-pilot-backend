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

### chat-session edge fn 合约错位 — CEO 选 β 保前端模型
- **场景**：UI 017 §A 派单要求把 ChatAgent 从 mock 切到 3 个 chat-session-* edge fn（get / append / end）。审计后发现 3 套数据模型不兼容：(1) edge fn 实际只接 `{user_id, message}` 不接 session_id/mode/intent；(2) ticket 描述的 `{session_id, mode, message, intent?}` 是第 3 套合约；(3) 前端 useChatSession 已直连 `supabase.from('chat_sessions').upsert`（TICKET-027/044），走多 session + mode 路由 + proposals.meta 模型，已正常工作。edge fn 自检还报 "migration 057 pending — HANDOFF §2 contract vs migration 028 schema 错位"。
- **踩坑**：派工单时 ticket 作者按"理想合约"写 payload，没读 edge fn 实际 index.ts。如果 UI 不审计直接强切，会回归 multi-session / mode 路由 / proposals 元数据全部丢失。
- **代价**：UI 017 §A.2 §A.3 留 blocker 等 CEO 决断 1 棒；如果直接强切就是回归事故。
- **教训**：(a) UI 切 edge fn 前**必读 supabase/functions/<name>/index.ts** 对齐合约（payload 字段 / 返回 shape）；(b) 派单时 ticket 作者也应先 grep edge fn 而非按印象写 payload；(c) CEO 最终选 **β 保前端模型** — 因为前端模型工作良好 + edge fn 改造大手术（migration 057 + 4-6 commits + 2 部门联动）收益低；(d) 未来切到 α 的触发条件：跨平台同步（微信小程序 / iOS app 共用同一 chat 历史）真上线时再改 edge fn 合约统一入口。
- **来源**：UI 017 §4.5 blocker → CEO 决断 → UI 018 §A 收口

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

### partial-delivery-status-needs-review-vs-done — 部分交付时 STATUS=needs_review 比硬上 STATUS=done 诚实
- **场景**：TICKET-050 §A 翻译目标 50/50 但 background script 在第 21 道菜 fetch ETIMEDOUT crash，实际只完成 34/50 (68%)。
- **踩坑**：若硬写 STATUS=done 含混 partial，CEO 会以为 §A 完成 + 不知道剩 16 道需要后续派单。若卡在 STATUS=in_progress 永远不闭环，下棒读不到 LAST_PROCESSED_TICKET。
- **代价**：误以为 ship 完毕的下游可能根据 34 道菜做决策，回头要回滚。
- **教训**：partial 交付时 STATUS=needs_review + RESULT 显式列"达到 X/Y，剩 Z 留下一棒"+ 给 CEO 推荐继续策略 (X/Y/Z 选项)。让 CEO 在掌握全貌后决定 ship 还是补完。is_progress 留给真"我在跑"中途中断不闭环的场景。
- **来源**：TELEPOT-20260520-050

### db-source-of-truth-over-stdout-buffering — background batch 长时间 0 行 output 不代表 hang，DB 写入才是真相
- **场景**：TICKET-035 / 050 跑 background tsx 脚本 30+ 分钟，output 文件持续 0 行 — 看似进程 hang。实际 query supabase 看 dishes_with_tl count 在涨，脚本一直在写 DB。
- **踩坑**：Node tsx stdout 默认 block-buffered to file (~64KB)，长跑脚本 buffer 未满前 file 显示空白。若员工因 "0 output 30 分钟" panic kill 进程，会损失已写入的 partial 进度 + 浪费 v2 quota namespace。
- **代价**：曾考虑 kill 进程，但先 query DB 看到 17/20 dish 已完成才没动。
- **教训**：所有 background batch 监控**优先 query DB 实测**（dish count / api_usage_daily incr / table row 数），stdout 是 best-effort。想强制实时 log 用 `process.stdout.write('') / writeSync(1, ...)`。
- **来源**：TELEPOT-20260520-035 / 050

### telepot-file-source-of-truth-when-user-loop-spam — /loop 重复 prompt 时按 telepot 文件而非 user 消息决定执行内容
- **场景**：TICKET-050 期间用户 prompt 在重复发上一棒 (TICKET-035) 的 4 件指令 (cron yml push / rollup / 翻译扩 / CLAUDE_BACKEND 同步)。但 telepot_backend.md 已经被 Cowork 覆盖为 TICKET-050 (Day 11 5% 优化) 完全不同任务 (翻译扩 50 / dish 1 retry / ingredients audit / 节庆 cook_steps)。
- **踩坑**：用户重复 prompt 是 /loop 触发的旧 prompt 残留 (CEO 不知道用户在 loop)。若按 user 消息做事，会重复跑已完成的 035；按 telepot 文件做事才是 source of truth。
- **代价**：员工误判 = 重做已完工的任务 + CEO/Backend 误信"还在做 X"。
- **教训**：遇用户 prompt 与 telepot 文件不一致时，按 PROCESS.md §4 算法 + telepot 文件 source of truth，response 里清楚标"与 user prompt 不符，按 telepot 执行"，让 Cowork/CEO 透明知道分叉。CEO 新指令"遇分支转 CEO 不要再问"也涵盖此场景 (员工自决 + 事后通报)。
- **来源**：TELEPOT-20260520-050（user /loop spam 持续时按 telepot 050 执行）

### context-budget-progressive-dump-before-70-percent — context 接近 70% 前主动 dump SKILLS/LESSONS + commit，避免触限被 /compact 截断
- **场景**：Backend 跑 11+ 棒长 session，每棒 sustain ~5% context 涨幅。本会话 (TICKET-014 → 065) 累计 ~62-68%，CEO 在 065 工单 §G 明确要求"context 完工时报告 + 接近 70% 触发 dump"。
- **踩坑**：若不主动 dump，等 /compact 触发时 LEARNED_SKILLS / NOTES 详细信息可能被截断丢失 — 下棒读不到本棒沉淀。
- **代价**：本会话 20+ LEARNED_SKILLS 全靠 LESSONS.md / SKILLS.md 落地保存，dump 失败 = 经验丢失。
- **教训**：员工每棒 response 末尾报告 CONTEXT_USAGE_AT_COMPLETION。接近 70% 时主动 (1) 看 docs/SKILLS.md + LESSONS.md 现状；(2) grep 自己未沉淀的 skill_id；(3) 追加缺的；(4) commit + push；(5) 再 /compact。**不要等系统自动截断**。
- **来源**：TELEPOT-20260520-065（CEO 工单 §G + 本次 dump 操作）

---

## Architect (退役 session)

### old-loop-blocks-new-ticket — 通宵循环没关，新工单读不到
- **场景**：Architect tab 早期挂了"通宵 sweep + 06:00 / 07:30 cron"逻辑。CEO 派 TICKET-007 综合收尾后，老板敲 process telepot，Architect 跑的是**老 cron 任务**（07:30 sweep），不是 TICKET-007。Wrangling 2m 2s 出"4 部门状态 + 守候态"老脚本输出，**永久退场 5 项任务一条没做**。
- **踩坑**：老脚本主动循环 + 新工单被动等触发，**老的优先于新的**。员工 watch 循环里没有"先 cat 最新 telepot.md 看 TICKET-ID 是否变化"的硬步骤。
- **代价**：Architect 没法退场，CEO 不得不自己接手写 docs/ARCHITECT_HANDOFF.md + 派给业务部门完成 4 项收尾
- **教训**：员工 SOP 强制"每次 process telepot 先 cat telepot.md 检查 TICKET 是不是新的，新则立即弃旧任务读新单"。已落到 PROCESS.md §4 去重算法。Architect 退役后此问题自然消失。
- **来源**：TELEPOT-20260520-007 退场失败事件

### sandbox-curl-blocked-by-proxy-allowlist-false-alarm — Cowork sandbox curl 出站被 allowlist 拦截，看到 403 容易误判 Railway 部署问题
- **trigger**：CEO 或部门跑 `curl https://nothinkeats.com/og-image.png` 看 headers → 返回 `HTTP/1.1 403 Forbidden` + `Content-Type: text/plain` + `X-Proxy-Error: blocked-by-allowlist`
- **mistake**：误以为 Railway 服务器没正确 serve og-image.png（content-type 错路由到 text/html）→ 派 Backend 工单 escalate
- **truth**：Cowork sandbox 出站代理拦截，返回的是代理自己的 403 错误页（HTML 内容），跟 Railway 实际响应无关
- **fix**：诊断 og-image.png / 任何 nothinkeats.com 资源时，**不能在 sandbox 内 curl**。让老板自己在 Mac 浏览器/终端访问 + 反馈结果；或者用 Chrome MCP（浏览器测试）；或者实查 git ls-files + 本地 dist/ 文件存在性 → 推断 Railway 上应该是 OK。
- **复用避免**：所有 `https://nothinkeats.com/*` 资源验证 → 让老板访问 / 用 Chrome MCP，不是 sandbox curl
- **来源**：TELEPOT-20260520-069 §B 误判 / 067 §A real verify

### telepot-empty-archive-race — telepot_*.md 被空 archive 即派单内容丢失（UI 071/074/075 反复出现）
- **trigger**：派 UI 工单 pending 后老板敲 `process telepot`，CLI return 但 telepot_ui.md 被改成 `STATUS: idle / ARCHIVED_AT: <time>` 但 **无 LAST_TASK_SUMMARY 内容**，git log 也无新 commit
- **mistake**：CEO 以为 UI 部门完工归档了；实际派单内容被丢弃从未执行
- **truth**：还没排查清楚根因。可能是：(a) `process telepot` CLI 命令在 pending 工单遇到某种解析失败时直接空 archive (b) 老板敲 process telepot 时 UI 部门 Claude Code CLI 已经 /compact 上下文，对当前 pending 工单 misread (c) telepot_ui.md 的 hash check / timestamp check 把 pending 误判为已处理
- **fix**：派单后 5 分钟看 git log 是否真有 commit；如无 commit 且 status idle → 立刻判定空 archive，重写工单（用新 ticket 号避免 dup ID）。明早排查 process telepot CLI 源码 + 加 `LAST_TASK_SUMMARY required when archive` 校验
- **复用避免**：每次派单后跟踪 git log 确认真正 ship；不被 ARCHIVED_AT 单独时间戳误导
- **来源**：TELEPOT-20260520-071/074/075 反复观察

### wechat-appid-history-untrusted-must-verify-current — 微信公众号 AppID 历史 docs 不可信，必须 mp.weixin.qq.com 实查
- **trigger**：CLAUDE.md 写 `wx60f6708a777dc896` / _archive/SESSION-2026-05-17 写 `wx3c66070bbe747b92` / 老板今晚实查 `wx63839880f1595f07` —— 三个值全不一样
- **mistake**：CEO 引用历史 docs 中的 AppID 派 Backend 工单（如把 `wx3c66070bbe747b92` 写进 wechat-mp-callback / 工单 SPEC），但实际生效的是公众号后台显示的 `wx63839880f1595f07`
- **truth**：(a) 公众号 AppID 可能因为重命名 / 重新认证 / 公众号迁移变化 (b) 历史 docs 没有 sync 更新机制 (c) AppSecret 重置会生效但 AppID 通常不变 — 三个值不一致最可能是 docs 在不同时期 snapshot 了不同公众号或者 archive 期间换过
- **fix**：所有微信公众号配置（AppID/AppSecret/IP whitelist/domain/EventToken 等）**永远以 mp.weixin.qq.com → 设置与开发 → 开发接口管理 → 公众号开发信息** 实查为准。CLAUDE.md / _archive / docs 任何引用 AppID 的位置加注释 "verify against mp.weixin.qq.com before use"
- **复用避免**：未来工单引用任何 AppID 之前 → 必须让老板/CEO 实查公众号后台确认
- **来源**：2026-05-20 21:00-04:00 多次工单引用错 AppID → errcode 40164 排查 → 实查发现真 AppID 是 wx63839880f1595f07

### railway-platform-incident-recognize-not-user-fault — Railway 平台事故是真的，build 慢不是用户代码问题
- **trigger**：晚间 push commit 触发 Railway redeploy 但 12+ 分钟还在 BUILDING + 多个 deployment 排队 QUEUED + 页面顶部黄色横幅显示 "Builds are slow to progress. We have pushed a fix and are now monitoring the incident."
- **mistake**：CEO 误以为代码 bug 导致 build 失败 / Railway 配置问题 / 触发额外排查工单
- **truth**：Railway 偶尔有 platform-wide 事故（特别是非高峰时段如 UTC 02:00-04:00 / HKT 10:00-12:00），build queue 慢全平台影响，跟用户代码无关
- **fix**：(a) 看页面 incident 横幅 — Railway 会在 dashboard 顶部主动声明 (b) 看 https://status.railway.com 确认 (c) 多个 deployment 同时排队（BUILDING + QUEUED + ...）是平台事故的强信号
- **复用避免**：诊断 Railway 部署慢之前先看顶部 incident 横幅；不要立刻怀疑代码
- **来源**：2026-05-21 03:55 HKT Railway 公开事故影响 wx-jssdk 部署 verify

### env-var-name-typo-causes-missing-error — 环境变量名拼写错（空格/大小写/下划线数）最常导致 41002 / "missing" 错误
- **trigger**：服务调外部 API 报 `errcode 41002 appid missing` 或类似 missing 错误，但本地环境变量明明已经灌
- **mistake**：怀疑是 service 没读到环境变量 / 缓存问题 / redeploy 没生效 → 反复 redeploy
- **truth**：80% 概率是环境变量名拼写错。常见错：(a) 末尾空格 `WECHAT_APPID ` (b) 大小写 `wechat_appid` (c) 双下划线 `WECHAT__APPID` (d) 拼写错 `WECHAT_APP_ID`（多了个 _）
- **fix**：(1) 截图 dashboard Variables 整页对照 code 期望的 key 字符级精确对比 (2) 在 server 加临时 endpoint `app.get('/api/_env-check', (_, res) => res.json({hasAppId: !!process.env.WECHAT_APPID, hasSecret: !!process.env.WECHAT_APPSECRET}))` 立即看 boolean 状态而非 redeploy 重试
- **复用避免**：env vars 排查永远先 `_env-check` 验证 boolean，再深入怀疑其他

---

## CrossCutting (2026-05-21 夜班补)

### ceo-communication-bug-4x — 一夜 4 次沟通失误，CEO 必须靠 bash 不靠记忆
- **场景**：2026-05-21 HKT 20:00-23:35 老板真测 β + CEO 整合期间发生 4 次跨 turn 沟通失误
- **踩坑序列**：
  1. **21:30** UI 013 早 20:25 已 ship 4 commits，CEO 仍报 "pending 待你启动" → 老板：「你这个错误太严重了。怎么防范类似的错误？」
  2. **21:50** CEO 给老板 paste-ready 含 `[Backend tab] /compact → process telepot`，但 Backend tab 当时正在跑 TICKET-010 "Full run 924 dishes" → 老板：「这个还在工作中，你就让我 compact?」
  3. **23:05** CEO 汇报里口误 "Database in_progress（CEO 醒来后核查）" → 老板：「你不知道你是 CEO ？我是老板！」
  4. **23:15** UI 014 早 22:35 已 ship 8 commits，CEO 仍报 "pending 待你启动"
- **代价**：老板情绪 / 老板对 CEO 信任度 / 老板必须自己干 CEO 的活（看 telepot head / git log）
- **根因（共因）**：CEO 跨 turn 把"上一次见到的状态"当成"当前状态"。**telepot head 是异步更新的真相源**，Lead 完工归档时改 head，CEO 必须主动读才知道。**对话上下文 ≠ 当前真相**。
- **教训 — PROCESS.md §17 立**：
  - CEO 每个 turn 涉及 4 tab 状态的回复**第一动作**是 `git fetch && head -8 _bridge/telepot_*.md`
  - bash 输出当面贴老板看（透明化），不允许编造或近似
  - 跨 turn 不沿用旧状态 — 老板每个新消息都重置 CEO 对状态的认知
  - "派工单 / 建议 compact / 建议 process telepot / 汇报" 4 个动作 hard requirement 跑 bash
- **追加根因（in-progress 状态缺失）— PROCESS.md §16 立**：
  - telepot 协议原只有 pending/idle 两态，tab 干活中的中间态无文件信号
  - 立铁律：Lead 开工**第一动作**改 head 为 `STATUS: in_progress + CURRENT_TICKET + STARTED_AT`
  - CEO 看到 in_progress 绝对不能让老板 compact
- **复用避免**：Cowork 端 Claude 对所有 file-based 异步协作系统，都要"每 turn bash 实查 + 不靠记忆"
- **来源**：2026-05-21 HKT 20:00-23:35 真实事件 + PROCESS.md §16+§17 立项

### ui-completed-claim-vs-real-ship-mismatch — Lead 标 completed 不等于代码真 ship 到生产
- **场景**：2026-05-21 HKT 20:00 CEO Chrome 真测 nothinkeats.com Q0 发现仍是 emoji + 6 选项，UI 012 task list 明明标 [completed]
- **踩坑**：CEO 信 task list 的 [completed] 标记，没 git log 验证实际 commit，没 Chrome 真测看生产页面
- **代价**：老板真测才发现"Q0 没用真摄影图 + 6 选项不是 4"。CEO 完工标记和实际生产不一致 → CEO 对工程状态判断失真
- **教训**：
  - Lead 写 telepot_response 标 completed ≠ 代码真 ship 到生产
  - CEO 必须做 **ship-verification 三步**：(1) git log 看 commit hash (2) git status 看 push 状态 (3) Chrome 真测生产页面
  - task list `[completed]` 也不是真相 — 是 CEO 标的，可能错标
- **复用避免**：所有"完工"声明必须有 **git commit hash + Chrome 真测截图（mcp__Claude_in_Chrome__）双印证**
- **来源**：2026-05-21 HKT 20:00 UI 012 假 ship + CEO Chrome MCP 真测发现

### product-pitch-clarify-multi-rounds — 老板的产品定位要求需要等他多轮才说完
- **场景**：2026-05-21 HKT 21:25-21:35 老板对"视频教学范围"指令 3 次澄清：
  - 21:25 "视频教学可以在午餐和晚餐的做肉和做海鲜的部分放入"
  - 21:30 "复杂的汤最好也放视频"
  - 21:32 "香港的汤 广东的汤 可以放"
- **踩坑**：CEO 第一轮听完就立 memory project_video_tutorial_scope.md 锁规则。老板二轮三轮补充时 CEO 经历 2 次 Edit memory 才完整
- **代价**：memory 字段反复修改，未来 session 可能看到中间不完整版本
- **教训**：
  - 老板模糊的产品定位指令**第一轮不要立刻 lock memory**
  - CEO 复述确认（"我的理解是 X，你的意思还有 Y / Z 吗？"）让老板有第二轮机会主动澄清
  - 等老板自己说完整 / 主动澄清 / 30 秒不补充 → 才落 memory
  - memory 立项后老板再次澄清要**立即 Edit 不 append**（避免新旧规则共存矛盾）
- **复用避免**：产品定位类指令处理 SOP：CEO 先复述 + 等 30 秒看老板补不补 + 主动问"还有别的吗" + 老板确认完整 → 落 memory
- **来源**：2026-05-21 HKT 21:25-21:35 视频范围 3 轮澄清 + project_video_tutorial_scope.md memory 经历 2 次 Edit

### algorithm-cold-start-axis-dominance — 试探机制权重失衡会压死用户偏好
- **场景**：2026-05-21 HKT 21:40 CEO Chrome 注入"红肉重油川菜"用户测算法，出菜全是白粥/虾饺/西湖牛肉羹 — 完全不是红肉川菜
- **踩坑**：算法看似"按偏好评分"，实际是个**多 axis 加权和**。axis 30 cold-start diversity 量级 -13 ~ -14，axis 32-40 用户偏好量级 +1 ~ +3。试探机制压死偏好。
- **代价**：5/5 profile simulation FAIL，红肉用户命中率 20% = DB baseline 19%（算法等于零干预）
- **根因**：
  - cold-start diversity 设计意图正确（新用户首周覆盖 ≥4 cuisine 给 preference_learn 采样）
  - 副作用：当用户已经填了 image onboarding（偏好已知），axis 30 仍按"未知偏好"逻辑硬推多样性
  - 数学问题：负向 axis 量级远大于正向 axis 时，负向 axis 单方面主导排序
- **教训**：
  - 任何 multi-axis scoring，**正负向 axis 量级必须 prove 在同一数量级**（用 simulation harness 跑 5+ profile 看 axis 累计贡献分布）
  - cold-start / exploration vs exploitation 机制要有**已知偏好用户的 early-return 路径**
  - 算法的"看似在打分"和"实际占主导的 axis"可能不一致 — 必须做 axis 量级 audit
- **复用避免**：未来加 axis 必须有 `simulateWeek + axis breakdown log` 验证量级在 ±5 范围内（不超过其他 axis 5 倍）
- **来源**：2026-05-21 HKT 22:18 TICKET-015 simulation 报告 commit 11dda0f / docs/SPEC_smell1_phase3.md

### onboarding-completion-not-equal-data-collection — onboarding 完成不等于真采集到所有需要的数据
- **场景**：2026-05-21 HKT 算法 audit 发现 dishes 12 健康标签 boolean 列 **0% 填充**（dead schema），同时 onboarding 也 0 处采集 wellness goal
- **踩坑**：早期 v3 onboarding 11 题设计时只考虑"偏好维度"，没采集 wellness goal / 孩子年龄 / 学校午餐等 channel 驱动数据
- **代价**：5-channel 推荐架构里 💪 weekly_补 + 🎒 school_balance 两个 channel 数据源缺失 → channel 形同虚设
- **教训**：
  - onboarding 设计要从**算法消费的数据维度反推**，不是从"用户填什么舒服"出发
  - 每加一个算法 channel / scoring axis，反向 check onboarding 是否采集到驱动数据
  - dead schema（DB 有列但应用层 0 写入）是产品 / 工程脱节的信号 — 要么用要么删
- **复用避免**：新加 channel / axis SPEC 必须含 "数据来源" 段，列明 onboarding 哪题 / DB 哪列驱动；否则不允许 ship
- **来源**：2026-05-21 HKT 22:00 Algorithm 013 audit (telepot_response_algorithm.md §A-§C)

### onboarding-q0-counter-stepper-is-anti-product — Q0 [- 0 +] 计数器是工程师思维不是产品思维
- **场景**：2026-05-21 HKT 23:20 CEO 提议 Q0 加 `[- 0 +]` 让用户加孩子数。老板：「为什么要这么傻的设计呢？」
- **踩坑**：CEO 用工程师思维想数据采集（数字 input），不用产品思维想用户认知（视觉一图懂）
- **教训**：
  - Onboarding 题选项设计原则：**视觉化大图 + 一眼懂 + 短文字描述**，不让用户算数 / 点击多次 / 选数字
  - Q0 改 6 大图（1大1小 / 2大1小 / 2大2小 / 2大3小 / 4大2小 + 自定义）覆盖 80% 家庭组合
  - 自定义入口兜底长尾，让 80% 用户秒选 + 20% 用户能自填
  - 老板的元规则："所有的都有个自定义 看用户填不填即可"
- **复用避免**：任何 onboarding 题不要用 `<input type="number">` 或 `[- N +]` stepper 作为主要交互。视觉化选项 + 自定义兜底是 default。
- **来源**：2026-05-21 HKT 23:20 Q0 设计被老板批"傻"

- **来源**：TELEPOT-20260520-068 41002 排查 + Railway 事故叠加

### slot-plan-not-flat-dishes — 推荐接口要 slot 化才能让"为什么推这道"可见
- **场景**：2026-05-22 HKT TICKET-018 5-channel 接口大改。v54 之前 `WeeklyDayMenu.dishes` 是平铺 `SupabaseDish[]`，每菜没有"槽位类型"和"标签"信息，UI 想做"换豆浆 / 换油条"或"为什么推这道"完全无信源。
- **踩坑**：早期 SPEC 把"推荐结果"等同于"一组菜的 id 数组"，没显式建模 (a) 这道菜属于哪个 slot (b) 同 slot 还有哪些候选 (c) 为什么算法选了它（哪些 channel 命中）。
- **代价**：每加一个 UI 功能（slot 内换、解释、对比）都要前端反向猜测算法意图——本应由数据结构传递。
- **教训**：
  - 推荐输出的**最小粒度是 SlotPlan**（slotType + primary + candidates + tagBadges），不是 dish[]
  - 候选池要在算法里"采下"几个候选透传给 UI，**别让 UI 重新跑算法找候选**（v55 之前 ChatAgent 重跑 generateWeekPlan 拿 3 候选就是这种反模式）
  - tagBadges 是"算法可解释性"的产品入口——5 channel 显式标签（🌶️ preference / 🌿 seasonal / 🎋 festival / 🎒 school_balance / 💪 weekly_balance）让用户能直接看到"为什么"
- **复用避免**：新的推荐 / 排序输出接口设计时，先回答"UI 能不能从这个数据结构看出选择理由？"——不能就是设计不足
- **来源**：2026-05-22 HKT 09:30 TICKET-018 §A 5-channel 接口契约 commit (Algorithm 018)

### pref-scores-jsonb-shape-drift — Backend 写入形态与 Algorithm reader 期望偏差
- **场景**：2026-05-22 HKT TICKET-019。Backend 018 §B feedback-rollup 真跑通后写入 `user_profiles.pref_scores` 的实际 jsonb 形态是 `{"pmc:red": {"score": 1, "n": 35}, ...}`, 但 Algorithm v55 reader (TICKET-017 §C) 假设是 flat number `Record<string, number>` 直接消费, 导致 `prefScores[key]` 返回的是 `{score, n}` 对象而非 number, 下游 `usagePower(prefScores[col]) * 0.6 * sigmoidWeight` NaN。
- **踩坑**：Backend 与 Algorithm 跨部门接口仅靠"列名 + jsonb 类型"对齐, 没有 SPEC 显式规定 jsonb value 形态。Backend 出于精度需求自然存了 `{score, n}` (好 rollup); Algorithm 出于简洁假设 number (好 scoring)。两边都没错, 但接口不匹配。
- **代价**：v54/v55 真用户 pref_scores 命中后 axis 4 学习信号全 NaN, 等效"未学到任何偏好" — 但因为 `usagePower(NaN)` 在 v45-v55 的 `learnedSignals` 计数 (`Object.values(prefScores).filter(v => typeof v === 'number')`) 路径下 NaN.toString() 不是 number → 自动跳过, 没崩。隐式 fallback 救了一命, 但 axis 4 等于失效。
- **教训**：
  - 任何跨部门 jsonb / json 接口必须有 **shape SPEC**（字段名 + 嵌套 + value 类型 + 单位 / 量级）, 不只 "列名 + 类型 jsonb"
  - reader 端做 **unwrap helper** 而非分散 inline 解构 — `unwrapPrefScoresJsonb()` 一处适配两种形态 (`{score,n}` 嵌套 + flat number 兼容), 下游 consumer 签名 `Record<string, number>` 不动
  - confidence weight (per-key `n` 阈值 30) 比全局 sigmoid 更精准 — n>=30 → 1.50, n<30 → 0.35
  - 加 jsonb unwrap unit test smoke 含 null / 缺字段 / 边界 n=30 / legacy number 4 个 edge cases
- **复用避免**：所有跨部门 jsonb 接口必须有：
  1. SPEC 文档显式 shape (字段 + 嵌套 + 单位)
  2. reader 端 unwrap helper + smoke test (含 edge cases: null / malformed / boundary / legacy)
  3. 双方 PR 互 review 至少 shape 部分
- **来源**：2026-05-22 HKT 11:50 TICKET-019 §A unwrap fix commit (Algorithm 019)
