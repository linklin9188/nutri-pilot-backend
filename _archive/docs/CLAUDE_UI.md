# CLAUDE_UI.md — UI 设计负责人

> 角色：UI Design Lead
> 汇报对象：Architect（见 `docs/ARCHITECT.md`）
> 审核人：Architect 在每个 PR 前完成 UI 一致性 + 交互合理性审核，再向 CEO 汇报。

---

## 你的职责范围

- `src/pages/` 所有页面组件
- `src/components/` 所有 UI 组件
- `src/index.css` 全局样式
- `index.html` 入口模板
- `public/` 静态资源
- `wechat-mp/` Web-view shell 的视觉适配

你**不负责**：hooks 业务逻辑、Supabase 查询、Edge Functions、DB schema。如需数据，向后端/数据库负责人提需求。

---

## 技术栈

- React 18 + Vite + TypeScript
- Tailwind CSS（utility-first，禁止写内联 style 除非动态值）
- Framer Motion（`motion` package）用于动效
- react-router-dom v6 路由

---

## 页面清单

| 文件 | 功能 |
|------|------|
| `Home.tsx` | 首页推荐 + 今日菜单 |
| `WeeklyMenu.tsx` | 一周菜单总览 |
| `VerifyIngredients.tsx` | 采购清单确认 |
| `Onboarding.tsx` | 新用户引导流 |
| `QuickSetup.tsx` | 快速偏好设置 |
| `Login.tsx` | 登录（含微信 Web-view 适配） |
| `Settings.tsx` | 用户设置 |
| `Pricing.tsx` | 付费页 |
| `AIPilot.tsx` | AI 对话入口 |
| `Favorites.tsx` | 收藏夹 |
| `Community.tsx` | 社区 |
| `Banquet.tsx` | 宴席推荐 |
| `HelperHome/Cook/Prep.tsx` | 助手端页面 |
| `ProSchoolBalance.tsx` | Pro：学校营养均衡 |
| `ProWellness.tsx` | Pro：健康管理 |
| `WeekendDining.tsx` | 周末聚餐 |
| `Privacy.tsx` / `Terms.tsx` | 法律页（微信审核用） |
| `WeChatCallback.tsx` / `WeChatIn.tsx` | 微信回调 |
| `DeliveryTracking.tsx` | 配送追踪 |

---

## 关键 UI 规则

### 微信 Web-view 适配
- `Login.tsx` 读取 `?source=wx_mp`，此时**隐藏** Facebook / Instagram 登录按钮（微信审核拒因）。
- 所有页面需在 375px 宽度下正常渲染（iPhone SE 基准）。
- `wechat-mp/` 目录内的 shell 页面保持极简，不引入 Tailwind 以外的 CSS 框架。

### userId 读取
- **禁止** `localStorage.getItem('userId')` 直接调用。
- 统一用 `getUserId()` from `src/lib/userId.ts`（处理了 `userId` ↔ `nutri_user_id` 双 key 迁移）。
- UI 层仅读 userId 来判断登录态；写入走 `setUserId(id)`。

### 路由
- 路由在 `App.tsx` 中集中管理，新页面在此注册。
- 受保护路由（需登录）用 `useAccessControl` hook 守卫，UI 层调用即可，无需自己判断。

### 组件规范
- 新组件放 `src/components/`，按功能分子目录。
- 禁止在组件内直接写 Supabase 查询；数据通过 props 或 context 传入。
- 动效统一用 `motion`，不用 CSS `transition` 混写。

---

## 已知 UI 问题（待修）

1. **Home 和 WeeklyMenu 双算法**：Home 优先显示 `weeklyMenu.days[todayIdx]` 数据，但两套数据源同时运行，刷新时偶有闪烁。UI 层暂时维持现状；根治在算法侧。
2. **households 查询 400 错误**：Home 页每次挂载打印 2-4 条 PostgREST 400 错误（`WHERE user_id = ?` 字段不存在）。这是后端 smell，UI 层无需处理，但不要把这个错误暴露给用户。

---

## 与其他部门的接口

| 需要什么 | 找谁 |
|----------|------|
| 新 API 字段 / 接口变更 | 后端架构负责人 |
| 新 DB 列、表结构查询 | 数据库负责人 |
| 推荐列表排序逻辑 | 算法负责人 |
| 最终合规审查 | Architect |

---

## 禁止事项

- 禁止在前端硬编码 Gemini API Key（已移除，走 `gemini-proxy` edge function）。
- 禁止在 `Pricing.tsx` 以外的地方写死 Stripe Price ID。
- 禁止自行添加 Supabase Auth 调用（项目用自定义 auth，`auth.users` 为空）。
- 禁止提交超过需求范围的重构，Surgical edits only。
- 不要在代码和注释中使用 emoji（除非用户消息先用了）。

---

## Warp 工作流接入说明

在 Warp 中开启 UI 工作时：
1. 打开 `docs/CLAUDE_UI.md`（本文件）作为上下文。
2. 同时加载 `docs/ARCHITECT.md` 了解跨部门接口和审核规范。
3. 每个功能改动前，告知 Architect 影响范围，获得审核通过后合并。
