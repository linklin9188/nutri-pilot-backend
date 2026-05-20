# ARCHITECT_HANDOFF.md — Architect 角色永久退场备忘录

> 立项日：2026-05-20 HKT
> 退场背景：CEO（Cowork）已具备复审 + 跨部门接口契约监督能力，Architect/telepot CLI session 角色冗余 → 老板拍板取消，由 Cowork 接手。
> 本文件取代未来所有"找 Architect 复审"的依赖。

---

## §1 历史产出清单（按时间倒序，标记 active / superseded / archived）

### §1.1 已 push 进 origin/main 的文档

| 文档 | commit | 状态 | 谁现在依赖 | 后续维护 |
|---|---|---|---|---|
| docs/SPEC_day2_feedback_pipeline.md | 487989a | active | Database 027 落地依赖此 SPEC §2 schema；Algorithm Day 2 feedback 进 prefScores 依赖 §3 权重表 | Cowork（CEO）维护 |
| docs/SPEC_day2_chat_agent.md | 3db249e | active | UI Day 2 ChatAgent 前端壳 / Backend chat endpoint 依赖 §2-§6 全文 | Cowork 维护 |
| docs/RISK_3day_sprint_register.md | 6ab8984 | active | R-08（user_feedback 027 未上线）转入风险池；其余 R-01..R-12 长期跟踪 | Cowork 维护，每完工一项 push 状态更新 |
| docs/SPEC_algo_version_migration.md | （未单独 commit，与 024 同期） | active | Smell 4 双列校验（algo_version + cache_key）已上线，文档作为 v40+ 行为权威 | Algorithm 维护 |
| docs/SPEC_smell3_b1_migration.md | a1b4ae5（草案） | superseded by 025 已落地 | 仅做 SQL 草案历史，025 落地版即真相 | archived 即可 |
| docs/DIAG_smell1_two_algos.md | （早期 commit） | active 但 Smell 1 阶段 2 已落地 → 大部分内容历史化 | 留存 §1 三件套（dedup / fruit / breakfast）作为后续 Smell 1 阶段 3 起点 | Algorithm 维护 |
| docs/DIAG_smell3_households.md | （早期 commit） | superseded by 025 + 026 落地 | 留存"FK + RLS 双补丁"诊断历史 | archived |

### §1.2 \_bridge 内部产出（gitignored）

- `_bridge/MORNING_REPORT.md` —— Cowork 继续维护（07:00 HKT scheduled task 覆盖写）
- 5 个 telepot / response 对 —— PROCESS.md v1.1 起降到 4 个对（删 Architect）
- `_bridge/PROCESS.md` v1.0 → v1.1 同步

### §1.3 Architect 完成的关键复审记录

| 轮次 | 标的 | 结果 |
|---|---|---|
| 复审 1 | Database B-1 (025) household FK + anon-first RLS | PASS |
| 复审 2 | UI Day 1 三件套（HelperCook + Home + VerifyIngredients）| 25 项清单全过 |
| 复审 3 | Algorithm v40 + sigmoid + 周五放纵日 | PASS |
| 复审 4 | Backend B-2（Home.tsx embed + INSERT error）+ §B 6 个 function 排查 | PASS / 6 个 function 全健康 |

后续复审（Database 027 / UI Day 2 / Backend Day 2 / Algorithm Day 2）由 Cowork 接手。

---

## §2 跨部门接口契约（原 B7 SPEC 落地版，Cowork 复审基础表）

| 接口名 | 输入 | 输出 | 错误兜底 | 拥有方 | 消费方 |
|---|---|---|---|---|---|
| `getUserId()` | （无）| `string` (localStorage 'userId' 或 'nutri_user_id') | 自动生成新 UUID + setUserId | `src/lib/userId.ts` | 全部前端代码 |
| `setUserId(id)` | `string` | void（双 key 写入）| — | `src/lib/userId.ts` | Login / Onboarding |
| `callGemini({endpoint, contents, generationConfig?, model?})` | endpoint ∈ `vision/michelin/school_balance/recipe/intent` | Gemini 响应 JSON | 429 配额超限返回中文提示；5xx 暂无 retry | `src/lib/geminiProxy.ts` | 所有 AI 调用点 |
| `parseIntent(text)` | `string` | `IntentTag` | parse-intent function 失败 → 返回默认 IntentTag | `src/lib/intentBias.ts` | useWeeklyMenu / Home / ChatAgent |
| `generateWeekPlan(pool, profile, prefScores, intentBias?, seed?)` | dish pool + profile + prefScores + optional intentBias + optional seed | `WeekPlan { days[7], breakfastDishes, fruitDish }` | 池为空 → 返回空 plan；ALGO_VERSION mismatch → 强制重生成 | `src/hooks/useWeeklyMenu.ts` | Home / WeeklyMenu / ChatAgent.proposalEngine |
| `scoreForWeek(dish, ...)` | dish + 9-axis 上下文 | `number` (0..N) | — | `useWeeklyMenu.ts` | generateWeekPlan 内部 |
| `loadFromDB` / `saveToDB` | userId + weekly_menu rows | row[] / void | `algo_version` 或 `cache_key` 不匹配 → stale → 重生成 | `useWeeklyMenu.ts` | 该 hook 内部 |
| `applyCuisineFilter(query, mode)` | PostgREST query + `'中餐'/'西餐'/'all'` mode | filtered query | mode 未知 → 原样返回 | `src/lib/cuisineFilter.ts` | useWeeklyMenu / Home / VerifyIngredients |
| `loadHomeByDay()` / `saveHomeForDay(idx, ids)` | day index + member ids | string[] / void | localStorage 失败 → 静默 | `src/lib/familyPrefs.ts` | WeeklyMenu / VerifyIngredients |
| Stripe checkout session | priceId | url | priceId 不在 ALLOWED_PRICE_IDS → 4xx；10/day 配额超限 | `supabase/functions/create-checkout-session` | Pricing.tsx |
| Stripe webhook | event | 4 事件分发：checkout.completed / subscription.{created,updated,deleted} | 非白名单 priceId 直接 200 + log | `supabase/functions/stripe-webhook` | Stripe API |
| user_feedback INSERT | { user_id, dish_id?, step_index?, feedback_type, locale?, meta? } | row | 表未上线 → silent retry × 1 → 丢失 | `supabase` 表 027（待 Database 落地）| HelperCook / Home / ChatAgent |
| user_preference_scores upsert | { user_id, tag_type, tag_value, score } | row | RLS = anon WITH CHECK true | `useFeedbackEngine.ts` | useWeeklyMenu scoreForWeek 学习段 |
| household_members 查询 | employer_id | row[] with helper_profile 嵌入 | helper_id FK = user_profiles(id)（025 后）；缺 hint → PGRST200，025 后用 `!helper_id` hint | `Home.tsx:521` 嵌入查询 | Home 雇主侧 |
| Dish seed pipeline | dish row 新建 | 步骤 + 营养 + tray + image 全链路 | 单步失败立刻停手回写 | `scripts/gen-dish-steps-claude.ts` + 后续 3 步 | Database 部门 |
| ALGO_VERSION 双列校验 | `algo_version + cache_key` | stale 判定 | 任一不匹配 → 强制重生成 | `useWeeklyMenu.ts` + migration 024 | 全部 weekly menu 读路径 |

**复审时 Cowork 拿这张表对照 commit diff，凡是触动表中接口的改动一律严核**。

---

## §3 PR 复审 25 项清单（Cowork 接手版）

每次任一员工 push 后，Cowork 按此清单逐条核：

### §3.1 通用 7 项

| # | 检查项 | 怎么核 |
|---|---|---|
| 1 | commit 独立 + commit message 含 feat/fix prefix | `git log -3 --oneline` |
| 2 | vite build 通过 0 error | 看 response.NOTES 里 "✓ built in" |
| 3 | 不动 hooks / lib / migrations / edge functions（除非工单明示）| `git show <hash> --stat` |
| 4 | ALGO_VERSION 是否需 bump 而未 bump | grep `ALGO_VERSION` 在 useWeeklyMenu.ts 看版本 |
| 5 | grep console.log 在改动文件零残留（console.error 是预期保留）| `git show <hash>` 后人工扫 |
| 6 | Surgical edits — 无邻近代码顺手 refactor | `git show <hash>` 看 +/- 比例，refactor 通常 -多 +多 |
| 7 | 其他部门未交付的改动未被本部门 commit 误带 | `git show <hash> --stat` 看是否含 5 个 CLAUDE_*.md 之类 |

### §3.2 全局不变量 5 项（CLAUDE.md "Hard invariants"）

| # | 检查项 | 怎么核 |
|---|---|---|
| 8 | 不变量 #1：无 FK→auth.users | grep `auth.users` 在 migrations/ + RLS policy `auth.uid` 零结果 |
| 9 | 不变量 #2：无前端直连 Gemini | grep `googleapis.com\|generativelanguage` 在 src/ 零结果，所有 Gemini 走 callGemini |
| 10 | 不变量 #3：Stripe 3 处白名单同步 | 对照 Pricing.tsx STRIPE_PRICE_IDS + stripe-webhook PRICE_TO_PLAN + create-checkout-session ALLOWED_PRICE_IDS |
| 11 | 不变量 #4：算法改动必须 bump ALGO_VERSION | 对照 §2 表"ALGO_VERSION 双列校验"行，判定是否触发 |
| 12 | 不变量 #5：getUserId() 用法不变 | grep `localStorage.getItem('userId')` 在新增代码零结果 |

### §3.3 数据约定 8 项

| # | 检查项 | 怎么核 |
|---|---|---|
| 13 | dish_ids 列是 `uuid[]`，非 `text[]` | 看 migration SQL 是否带 `::uuid[]` cast |
| 14 | user_profiles.id 是 `text`，非 `uuid` | 看 migration 是否假设 uuid |
| 15 | user_profiles.display_name 可能 NULL → 前端 fallback | grep 新代码是否做 null-safe |
| 16 | household_members.helper_id 是 `text`（025 后）| FK 目标必须 user_profiles(id) text |
| 17 | households.employer_id 是 `text`（026 后）| 同 16 |
| 18 | Health-tag 布尔列命名一致 | 对照 CLAUDE.md "Health-tag boolean columns" 段 |
| 19 | migration 顺序无跳号、无 destructive | 看 supabase/migrations/ 文件名递增 |
| 20 | 不操作 supabase_migrations.schema_migrations 表 | 看 SQL 是否 UPDATE/INSERT/DELETE 该表 |

### §3.4 流程 5 项

| # | 检查项 | 怎么核 |
|---|---|---|
| 21 | git push origin main 成功 → Railway 自动拉 | 看 git log origin/main 含此 commit |
| 22 | 写完 telepot_response_<dept>.md（含 LAST_PROCESSED_TICKET）| Read 该文件 |
| 23 | osascript 桌面通知已跑（白名单内）| 看 response.NOTES |
| 24 | 不动 src/scripts/ / supabase/functions/（除非工单明示）| `git show <hash> --stat` |
| 25 | 不替 CEO 派下一棒（员工不擅自启动新工单）| 看 response 是否含"已派下一棒"字样，有则警告 |

---

## §4 未完工 B4-B8 SPEC 重新分配

原计划 5 份 SPEC（昨夜未写完），重新分配如下：

| 原编号 | 标题 | 新归属 | 必要性 | CEO 何时派 |
|---|---|---|---|---|
| B4 | 库存模型 SPEC | Algorithm + Database 联合 | 中 — 数据飞轮 + 库存减法落地后才需 | Day 3 或之后 |
| B5 | 节庆菜单 SPEC | Database | 中 — 春节 / 中秋 季节性需求 | 临近节庆前 1 周 |
| B6 | 生产监控指标 SPEC | Backend | 高 — 付费基数增长后必需 | 月活 ≥ 50 时 |
| B7 | 跨部门接口契约 | 本备忘录 §2 已覆盖 | 已完成 | — |
| B8 | commit log | Cowork 维护（写在 \_bridge/MORNING_REPORT.md）| 已自动化 | — |

---

## §5 Cowork 接手后的复审运作流程

```
员工写 telepot_response_<dept>.md (STATUS=done)
            ↓
Cowork (Bobby 敲 process telepot 时)
            ↓
Cowork Read response → 按 §3 清单 25 项核
            ↓
若全 PASS → 整理成 1 张表给 Bobby
若有 blocker → 写新工单覆盖 telepot_<dept>.md 让员工修
若有疑问 → 抛给 Bobby 决策（仅在 3 红线内才抛：>70 万 token / 全面改造 / 损害用户权益）
```

**Cowork 不写代码、不 commit、不 push**。所有代码改动仍由 4 部门完成。

---

## §6 致谢

Architect/telepot session 自项目早期至 2026-05-19 期间，独立完成 Smell 1 / Smell 3 / Smell 4 全套诊断 + 4 大复审 + 3 份 Day 2 SPEC + 风险登记册 + 跨部门接口契约草稿。

技术债务被它系统化的最大功绩是：**让 Aieats 项目从"五个人各写各的"过渡到"统一规范 + 双向 inbox + TICKET 去重"的工程文化**。

历史功绩在 git log 永久保留。

---

## §7 版本

| 版本 | 日期 | 改动 |
|---|---|---|
| v1.0 | 2026-05-20 | 立项，Architect 永久退场 |
