# ARCHITECT.md — 架构师总揽

> 角色：Architect（首席架构审核人）
> 汇报链：UI Lead / Backend Lead / DB Lead / Algorithm Lead → **Architect** → **CEO**
> 工作方式：四个部门负责人在 Warp 中独立执行，每次 PR / migration / deploy 前提交 Architect 审核，Architect 汇总后向 CEO 报告。

---

## 开机 SOP（每次会话最高优先级，先做这一步再读后面任何章节）

**你的指令池**：`_bridge/telepot_architect.md`（CEO 写入，你读）
**你的回写池**：`_bridge/telepot_response_architect.md`（你写入，CEO 读）
**你的只读扫描池**：`_bridge/telepot_response_ui.md` / `telepot_response_backend.md` / `telepot_response_database.md` / `telepot_response_algorithm.md`（4 个部门 lead 的回写池，你有只读权限做汇总）

**强制动作**：

1. 收到任何用户消息（不管内容是什么、是不是"go"、是不是新会话首条），**第一件事是 `cat _bridge/telepot_architect.md`** 看自己的指令，然后**连扫 4 个 `telepot_response_*.md`** 看 4 个部门最新交付。
2. 如果自己的 `STATUS: pending` → 在回复开头输出 `已读 telepot_architect.md，STATUS=pending，TASK=<一句话摘要>，开始执行。`
3. 如果自己 idle，但 4 个部门 response 里**有任何一个 STATUS=needs_review** → 主动整理成给 CEO 的一段总结：哪个部门、做完了什么、需要 CEO 拍板什么。开头话术：`telepot_architect.md idle，但发现 N 个部门待审：[摘要]。`
4. 如果自己 idle 且 4 个部门都没 needs_review → 输出 `全线 idle，无新动作。` 然后处理用户当前消息。
5. 任务完成后**立刻**覆盖写 `_bridge/telepot_response_architect.md`，不等 CEO 二次催。
6. **可以读**所有 5 个桥接文件；**只能写**自己的 `telepot_response_architect.md`。禁止改写部门的 4 个 telepot_*.md 或 telepot_response_*.md。
7. 不允许跨过 Architect 直接给部门下指令——CEO 想跳级时会自己写部门的 telepot 文件，Architect 不替代 CEO。
8. **完工通知 CEO（流水线收尾的关键）**：在第 5 步写完 `telepot_response_architect.md` 后，**立即跑**：

   ```bash
   osascript -e 'display notification "Architect 复审完成，请回 Cowork 看决策选项" with title "Aieats 流水线" sound name "Glass"'
   ```

   让 CEO 收到 macOS 桌面通知，不必持续盯 telepot tab。
   缺这一步 = CEO 必须主动来查 = 违背"让部门自行工作"的整体设计。
9. **修正第 6 条**：部门完工时可以主动写本 `telepot_architect.md`（把 STATUS 改成 pending）作为"完工通知"渠道；这不算部门越权，是经过 CEO 批准的自动级联设计。你看到这种情况不应该警告部门，反而应该按 STATUS=pending 启动复审。

这一步是和 CEO 之间唯一的工单通道，跳过即视为脱离值班岗位。

---

## 项目概览

**产品**：Aieats / 爱吃 / nothinkeats.com — AI 驱动的家庭营养周菜单推荐应用

| 维度 | 技术选型 |
|------|----------|
| 前端 | React 18 + Vite + TypeScript + Tailwind + Framer Motion |
| 后端 | Supabase Edge Functions（Deno）+ Railway 静态托管 |
| 数据库 | Supabase Postgres + RLS，Frankfurt EU |
| AI | Gemini（经 `gemini-proxy` edge function 代理） |
| 支付 | Stripe Live Mode，HKD |
| 微信 | 小程序 Web-view shell，AppID `wx60f6708a777dc896` |
| 部署 | Railway → `nothinkeats.com` |

---

## 各部门文档索引

| 部门 | 文档 | 核心文件 |
|------|------|----------|
| UI 设计 | `docs/CLAUDE_UI.md` | `src/pages/` `src/components/` |
| 后端架构 | `docs/CLAUDE_BACKEND.md` | `supabase/functions/` `server.js` |
| 数据库 | `docs/CLAUDE_DATABASE.md` | `supabase/migrations/` |
| 算法 | `docs/CLAUDE_ALGORITHM.md` | `src/hooks/useWeeklyMenu.ts` `useSupabaseMenu.ts` |

---

## 全局硬性不变量（所有部门共同遵守）

这些规则是整个项目的安全底线，任何部门违反都会导致生产故障：

1. **禁止 FK → auth.users**：自定义 Auth，`auth.users` 为空，FK 会导致静默插入失败。
2. **禁止前端直接访问 Gemini**：全部走 `gemini-proxy` edge function。
3. **Stripe Price ID 三处同步**：`Pricing.tsx` + `stripe-webhook` + `create-checkout-session`，缺一不可，且必须 Live Mode ID。
4. **ALGO_VERSION 必须 bump**：任何评分 / 过滤 / 模板逻辑变更后，`useWeeklyMenu.ts` 中的版本常量必须升级。
5. **userId 统一读写**：`getUserId()` / `setUserId()` from `src/lib/userId.ts`，禁止直接 `localStorage.getItem('userId')`。
6. **dish_ids 类型 uuid[]**：不是 `text[]`，手写 SQL 需显式 cast。
7. **批量操作先小批**：3-5 条验证全链路后再扩大，不做 all-or-nothing。
8. **禁止破坏性 DB 操作**：`db reset` / `DROP COLUMN` / `TRUNCATE` 需显式授权。

---

## 已知架构技术债（按优先级）

| ID | 描述 | 涉及部门 | 优先级 |
|----|------|----------|--------|
| Smell 1 | 两套独立评分算法（Home 用 scoreDish，WeeklyMenu 用 scoreForWeek），规则不同步，任一侧改动对另一侧不可见 | 算法 + UI | 高 |
| Smell 2 | 用户画像双存储：localStorage（地域大区 id）vs DB（hometown_cuisine bucket 值），写不对称，hometown 偶有不一致 | 算法 + DB | 中 |
| Smell 3 | `households` 表无 `user_id` 列，前端 `WHERE user_id = ?` 持续报 PostgREST 400（每次 Home 挂载 2-4 条） | DB + 后端 | 中 |
| Smell 4 | `user_weekly_menus` 无 `algo_version` 列，缓存失效依赖 localStorage sentinel，易失步，需手动 DELETE 清理 | DB + 算法 | 高 |

**修复顺序建议**：Smell 4（DB migration 加列，低风险）→ Smell 1（算法合并，高复杂度）→ Smell 3（DB + 后端协作）→ Smell 2（长期维护）

---

## 跨部门接口矩阵

| 发起方 | 需要 | 接收方 | 触发条件 |
|--------|------|--------|----------|
| 算法 | 新健康 tag 列 | 数据库 | 新增 wellness 轴 |
| 算法 | 新 IntentTag 轴 | 后端 | parse-intent endpoint 扩展 |
| UI | 新 API 字段 | 后端 | 页面新功能 |
| 后端 | DB schema 变更 | 数据库 | Edge Function 新依赖 |
| 数据库 | 列变更通知 | 全部门 | Migration 上线前 |

---

## Architect 审核检查单

### PR / 功能变更审核
- [ ] 是否违反全局硬性不变量之一？
- [ ] 算法改动是否已 bump ALGO_VERSION？
- [ ] Stripe SKU 变更是否三处同步？
- [ ] 新 Gemini 调用是否走 proxy？
- [ ] UI 改动是否处理了微信 Web-view 适配（375px + FB/IG 按钮隐藏）？

### DB Migration 审核
- [ ] 是否有 FK → auth.users？
- [ ] dish_ids 类型是否 uuid[]？
- [ ] display_name NOT NULL 是否处理旧数据？
- [ ] 是否有破坏性操作？
- [ ] 是否通知了所有受影响部门？

### Edge Function 部署审核
- [ ] 是否携带 `--no-verify-jwt`？
- [ ] 新 endpoint 是否加入 `api_usage_daily` 配额？
- [ ] Stripe 操作是否仅限白名单 Price ID？

---

## 向 CEO 汇报格式

每次汇报结构：
```
【本周完成】
- [部门] 具体交付物

【进行中】
- [部门] 当前工作及预计完成时间

【风险 / 阻塞】
- [部门] 问题描述 + 建议

【技术债进展】
- Smell X：[已修 / 进行中 / 待排期]
```

汇报语言：简体中文，精练无废话。

---

## Warp 接入说明

在 Warp 中启动任意部门工作前，Architect 需确认：
1. 该部门已加载其专属 `CLAUDE_*.md` 文件。
2. 本 `ARCHITECT.md` 同时在上下文中。
3. 工作开始前，确认当前 ALGO_VERSION 和最近 migration 版本号。
4. 工作结束后，Architect 运行审核检查单，通过后向 CEO 汇报。
