# 技能沉淀 · UI 036 §1 · HelperSettings 页面新建（2026-05-24）

## 1. 解决了什么

老板真测发现菲佣端**没有自己的"设置主界面"**。菲佣端到目前只有 4 个功能页（HelperHome 任务主页 / HelperCommunity 社区 / HelperCook 做菜 / HelperPrep 备菜），完全缺：

- 看自己头像 + 昵称（雇主端 Settings 第一区视觉，菲佣那边一片空白）
- 改自己国籍（HelperHome 的国籍 prompt 只在 origin_country=null 时出现一次，填了就再也找不到入口改）
- 看自己被算法学到的口味偏好（Phase 1 placeholder，未来从 community 互动反推）
- 推荐其他菲佣朋友（WhatsApp 分享）
- 切换到雇主端（之前藏在 HelperHome 底部一行小灰字"Switch account"，不显眼）
- 登出（之前同上）+ 帮助/联系（之前完全没有）

本棒在 `/helper-settings` 路由开个独立页面把这 6 块（再加积分隐藏占位）整合，HelperHome 头部右上角加一个 settings icon 直跳。

## 2. 用了什么关键方法

- **复用雇主 Settings 主色调（橙 `#FF5A1F` + 米色背景 `#FEF7E5`）+ 卡片风格（圆角 `rounded-3xl` + 白底 + 黑阴影 `0 4px 20px rgba(0,0,0,0.04)`）** — helper 端跟雇主端品牌视觉绑定，颜色调色板必须一致，不能因为是"菲佣页"就用另一套色
- **Helper 不直接填算法字段** — taste profile 区块**只显示**算法反推结果（Phase 1 还没数据所以是"暂无偏好，多用社区会自动学"的 placeholder），不给"选辣度/选口味"chip 让菲佣手填。这是设计原则：菲佣不参与雇主家庭的菜单算法（只有雇主端偏好影响菜单），菲佣自己的偏好是给未来 community 推荐内容用的，必须被动学。
- **积分功能 hide 等真后端 ship** — §5 积分余额块物理删掉（不是 `display:none` 占位），只留代码注释 `// TODO: enable when 积分系统 1000 用户后 ship`。原因：老板拍板 1C 积分推迟，UI 假装有积分但点了不真给会破坏信任。文案上保留"Earn 50 pts per referral"是因为这是 marketing copy 不是真账户余额，无歧义。
- **登出必清所有 localStorage helper 相关 key**：除了 `clearUserId()`（清 `userId` + `nutri_user_id` 两个 legacy key），还清 `nutri_role` / `nutri_helper_mode` / `isLoggedIn` / `generatedMenu`。如果只清 userId，下次访问 `/` 会因为 `nutri_role === 'helper'` 残留把用户错引到 `/helper`，然后 RequireAuth 拦住跳 `/login?role=helper`，体验是"我都登出了为什么还是 helper 登录页"。
- **router guard 复用 RequireAuth helperRole**：跟 `/helper-community` / `/prep` / `/cook` 同款防护，未登录访客访问 `/helper-settings` 会被 RequireAuth 弹回 `/login?role=helper`，跟 TICKET-030 P0 ship 的 router guard 同源。
- **HelperBottomTabBar 复用**：底部 4 tab（Tasks/Cook/Shopping/Community）原样不动，Settings 不进 tab bar（5 tab 是下棒）。本棒只加 HelperHome header 右上角单个 icon 入口，避免 over-engineer。
- **getUserId() / clearUserId()** 走 `src/lib/userId.ts`，不直接 `localStorage.getItem('userId')` — custom auth invariant。

## 3. 下次同类任务标准

新建 helper UI 页时：

- **必须复用雇主主色调** — 橙 `#FF5A1F` + 米色 `#FEF7E5` 是品牌色，不能因为是 helper 页就改成绿色/蓝色
- **永远不出现 "试用 / trial / Free trial" 字眼** — helper 永久免费，这是 memory feedback 红线（`project_helper_no_trial_wording.md`）
- **helper 不直接填算法字段**（味/辣/goal 任何题）— 全部被动从 community 互动反推，UI 上只展示 read-only。HelperHome 国籍 prompt 是唯一例外（PH/ID 是身份属性不是算法字段）
- **任何带"积分"的功能必先确认真后端有没有** — 没有就 hide 整段或只留 marketing copy，绝不留"我的积分余额: 0"这种假数据 UI
- **登出必清所有 localStorage key**：`clearUserId()` + `nutri_role` + `nutri_helper_mode` + `isLoggedIn` + 任何应用缓存 key（如 `generatedMenu`）。只清 userId 会让残留 role 把用户引向死路
- **新页面必加 RequireAuth + 对应 role guard**（helper 页用 `helperRole`，雇主页不加 prop）
- **HelperHome 永远是 helper 的 home base**：所有 helper 子页面的 header back button 必须 `navigate("/helper")`，不要 `navigate(-1)`（用户从 deep link / WhatsApp 进来时 history stack 是空的）
- **多语言 t3(en, zh, tl)**：helper 页面用 3 语言（EN/中文/Tagalog），不是 4 语（雇主端 zh-Hant 不适用 helper），useEffect 内必须把 `language === 'zh-Hant'` snap 回 'en'（防止从雇主端跳过来时 sticky 在繁中）
