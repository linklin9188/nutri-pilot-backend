# UI 014 DRAFT — CEO paste-ready 工单（等 UI 013 ship 后立即覆盖 telepot_ui.md）

> 这是 CEO 端到端真测后整合的工单草稿。**不发到 _bridge/telepot_ui.md**
> 直到 UI 013（登录 3 件修）ship。届时 CEO 把本文件全文 copy 覆盖 telepot_ui.md。

---

```markdown
# TELEPOT — 待执行任务（UI）— Onboarding 真照片化 + 5 天工作日制 UI 层 + 6 件合一

TICKET: TELEPOT-20260521-014
STATUS: pending
ISSUED_AT: 2026-05-21T20:55:00+08:00
TASK: 老板端到端真测 6 件 — UI 大整改一次性 ship
PRIORITY: 🔴 critical — β 产品定位 + 6 件可见缺陷 / 60-90 分钟
SUPERSEDES: UI 013（已 ship 假设）

⚠️ 开工前 /compact

CONTEXT: |
  老板 2026-05-21 HKT 20:00-20:40 端到端真测 nothinkeats.com 发现 6 大缺陷
  全部要在本单 surgical 修复。CEO 用 Chrome MCP 自跑全路径 + git log
  实查后定位 root cause，证据见 docs/UI_014_ROOTCAUSE.md（CEO 已写）。

  ============ §A. Q0 餐桌 6 选项 → 4 选项 + 真摄影图 ============

  现状（src/pages/QuickSetup.tsx:38-43）：
  ```ts
  // ❌ 错误现状 — 6 emoji 选项
  { value: 'cozy_2',    label: '2 椅小桌',     emoji: '🍽️' },
  { value: '4_chair',   label: '4 椅标准',     emoji: '🍱' },
  { value: 'round_8',   label: '大圆桌',       emoji: '🫖' },
  { value: 'western',   label: '西式长桌',     emoji: '🍴' },
  { value: 'hk_diner',  label: '港式茶餐厅',   emoji: '🥯' },
  { value: 'solo',      label: '1 人小桌',     emoji: '🍙' },
  ```

  改成 **4 选项 + 真摄影图**（Database 009 commit 1db7729 已 ship 4 张图）：
  ```ts
  { value: 'solo',    label: '1 人',  image: '/onboarding/q0_solo.jpg' },
  { value: 'couple',  label: '2 人',  image: '/onboarding/q0_couple.jpg' },
  { value: 'family',  label: '4 人',  image: '/onboarding/q0_family.jpg' },
  { value: 'gather',  label: '10 人', image: '/onboarding/q0_gathering.jpg' },
  ```

  渲染层 emoji → `<img src={opt.image} className="w-full h-32 object-cover rounded-xl" />`

  ============ §B. Q1-Q9 emoji → 35 张真菜照片（commit e7940c7 已 ship）============

  实查：
  ```bash
  ls public/onboarding/ | grep -E "q[1-9]_" | wc -l
  ```
  应有 35 张。

  QuickSetup.tsx 内 Q1-Q9 每个 option 加 `image` 字段读 public/onboarding/q<N>_<value>.jpg。

  ============ §C. 5 天工作日制 UI 层（与 Algorithm 014 配对）============

  Algorithm 014 已 ship `WORKDAYS_PER_WEEK = 5` 常量 + 主循环改用该常量，days.length === 5（commits 1335e87 + 7e966b3）。
  UI 层同步：

  1. src/pages/WeeklyMenu.tsx:30
     ```ts
     // ❌ const DAYS = ["周一","周二","周三","周四","周五","周六","周日"];
     const DAYS = ["周一","周二","周三","周四","周五","周末"];
     ```

  2. WeeklyMenu tab `周末` 点击 → 渲染 `<WeekendDiningReport />`（不是空 dishes）：
     ```tsx
     {selectedDayIdx === 5 ? (
       <WeekendDiningReport />
     ) : (
       <DishGrid dishes={weeklyMenu.days[selectedDayIdx].dishes} />
     )}
     ```

  3. Hero 文案 "7 天 / 35 道菜" → "5 天 + 周末外食"（实查 src/pages/WeeklyMenu.tsx grep "7 天"）

  4. Freemium gate 文案 "升级会员解锁完整 7 天" → "解锁完整 5 天 + 周末餐厅推荐"（grep "7 天 + 一步采购"）

  ============ §D. 进度条 bug — Q0/Q1 "1/7"，Q3 "3/8" ============

  根因：QuickSetup.tsx 总题数动态计算时某条件分支算错。

  实查：
  ```bash
  grep -n "totalQuestions\|questions\\.length\|step / total\|7 - 1" src/pages/QuickSetup.tsx
  ```

  报告找到的总数计算逻辑 + 修：所有题目数应等于 `QUESTIONS.length` 一次性。

  ============ §E. 撤销骗局横幅 ============

  ```bash
  grep -n "升级了\|图片代替文字\|3 分钟看图选你喜欢的" src/pages/QuickSetup.tsx
  ```

  当前文案"升级了！我们用图片代替文字"在 emoji 状态下是骗用户。本单 §A/§B 完成后图片化才生效，**保留**该横幅；如果 §A/§B 因故拆单延后，**临时删除**该横幅（不能继续 dishonest）。

  ============ §K. 菲佣端背景色统一（老板 2026-05-21 21:10 反馈）============

  CEO Chrome MCP 真测发现菲佣端 5 个页面背景色割裂：
  - HelperHome `/helper`  → 🖤 黑色（给压力）
  - HelperCook `/cook`    → 🖤 黑色（给压力）
  - VerifyIngredients     → 🍶 米色 #FEF7E5
  - HelperPrep            → 🍶 米色 #FEF7E5
  - Community             → 🍶 米色 #FEF7E5

  老板原话："菲佣界面，目前进去后都是黑色的背景，我觉得他们看到后会有压力。
  能否改成相对有安全感和信任感的颜色？"

  CEO 决：**全部统一改 #FEF7E5 米色**（与雇主端 WeekendDining/Settings/Pricing
  一致，柔和 + 弱光厨房友好 + 品牌统一）。

  实查并改：
  ```bash
  grep -n "background.*#000\|background.*black\|bg-black\|bg-\\[#0" \
    src/pages/HelperHome.tsx src/pages/HelperCook.tsx
  ```

  HelperHome.tsx + HelperCook.tsx 顶层容器 `style` 改：
  ```tsx
  <div className="min-h-screen max-w-md mx-auto relative pb-32"
       style={{ background: '#FEF7E5' }}>  {/* 同雇主端 WeekendDining */}
  ```

  文字颜色同步从白色调整为 `#1a1a1a` / `rgba(0,0,0,0.6)` 等深色，否则米色背景白字看不清。
  icon 卡片背景色保留（橙/紫/蓝/黄 4 色 icon 是品牌识别，在米色上对比反而更好）。

  雇主端 Home/WeeklyMenu/Login/Setup 保持黑色 — 不动（dish 大图沉浸感是设计意图）。

  ============ §L. 菲佣端底部导航栏（致命可用性 fix）============

  CEO 测发现：菲佣进 /cook /prep /verify 后只能 back 不能横向切换。雇主端有
  BottomTabBar 4 个 tab（首页 / 菜单 / 采购 / 设置），菲佣端 0 个 tab。

  HelperHome 底部只有 "Switch account" 链接，太隐蔽。

  CEO 决：建 `HelperBottomTabBar` 组件（独立于雇主版 BottomTabBar，因菲佣 tab
  结构不同），挂载到 HelperHome / HelperCook / HelperPrep / VerifyIngredients /
  Community 5 个菲佣页面底部。

  菲佣 4 tab 建议（CEO 自决）：
    1. **任务**     `/helper`     (My Tasks 首页)
    2. **做菜**     `/cook`       (Today's Cooking)
    3. **采购清单** `/verify`     (Shopping List)
    4. **社区**     `/community`  (Cooking Community)

  HelperPrep 不进 tab（是 /cook 的前置阶段，从 cook 内部 PREP/COOK/SERVE 3 步条进入）。

  组件位置：`src/components/HelperBottomTabBar.tsx`。雇主版 BottomTabBar 不动。

  ============ §M. learner mode demo 数据兜底（与 UI 013 §B/§C 协调）============

  CEO 测发现菲佣端 4/5 页面全是 "No menu yet" 空状态 — 测试 user 无 employer
  关联时首次体验全空白。

  UI 013 §B 立项的"学习者菲佣入口"（localStorage.nutri_helper_mode='learner'）
  + UI 013 §C LearnerHome 应该在这种状态下展示 demo 中国菜库引导。

  本单 §M 完成 LearnerHome 实质内容（UI 013 §C 只声明 placeholder）：
  - 6 大菜系卡片（粤 / 川 / 江浙 / 北方 / 港式 / 西式）
  - 每个 cuisine 点进去看 dishes 列表 + cook 引导
  - 顶部"加入家庭" link → 让用户后续输入 invite_code 升级到 employer-linked
  - 用米色 #FEF7E5 背景

  ============ §F. 不变量自检 ============

  ☑ #1 不加 FK→auth.users  ☑ #2 不直连 Gemini
  ☑ #3 Stripe 白名单未触    ☑ #4 ALGO_VERSION 不改（这是 UI 层 + 文案，algo 不变）
  - 不动 hooks 签名 / supabase functions / migrations
  - SURGICAL only — QuickSetup.tsx (Q0-Q9 image) + WeeklyMenu.tsx (DAYS + 周末 tab + 文案) + freemium gate 文案
  - 禁止 bash for 循环

  ============ §G. 完工 verify（CEO 会用 Chrome MCP 复测）============

  - npm run build OK
  - 真测路径：
    1. /setup Q0 看到 4 张真餐桌图（不是 emoji）
    2. /setup Q1 看到 4 张真菜图（不是 emoji）
    3. /setup 进度条 N/N 总数一致
    4. /weekly 顶部 6 个 tab：周一-周五 + 周末
    5. 点 "周末" tab → 看到 WeekendDiningReport 餐厅推荐（100 家 / 米其林 / 必比登）
    6. Hero "5 天 + 周末外食" 文案
    7. Freemium "解锁 5 天 + 周末" 文案
  - grep "升级了"  在 §E 决定下保留或撤销

  ============ §H. 完工 commits（7-10 commits）============

  Onboarding 块：
  - feat(onboarding): Q0 6→4 选项 + 4 张真餐桌摄影图接入
  - feat(onboarding): Q1-Q9 emoji → 35 张真菜照片接入
  - fix(onboarding): 进度条总数动态计算 bug（7/8 不一致 → 一致）
  - chore(onboarding): 撤销 / 保留"图片代替文字"横幅（按 §E 决策）

  Weekly 块：
  - feat(weekly): 5 天工作日 + 周末 tab → WeekendDiningReport 入口暴露
  - chore(weekly): hero + freemium gate 文案 "5 天 + 周末外食"

  Helper 块（菲佣端，§K-§M）：
  - refactor(helper): HelperHome + HelperCook 背景 #000 → #FEF7E5 米色统一
  - feat(helper): HelperBottomTabBar 组件 — 任务/做菜/采购/社区 4 tab
  - feat(helper): LearnerHome 中国菜 6 cuisine 卡片实质内容（接 UI 013 §C 占位）

  ============ ⚠️ §I. 完工时强制报告 ============

    CONTEXT_USAGE_AT_COMPLETION: <X>%
    TOKEN_USAGE_THIS_TICKET: ~XXk tokens
    ESTIMATED_COST_THIS_TICKET: $X.X USD

  ============ ⚠️ §J. telepot_response 边界（PROCESS.md §15 铁律）============

  response 只允许 4 段：
  1. 本职完工内容（4-6 commits + verify 截图描述）
  2. verify（build / grep / Chrome 真测）
  3. token+cost
  4. blocker（如有）

  **禁止「顺手并行可做」/「建议 CEO 决」清单** — CEO 自己整合。

  ============ 完工动作 ============

  写 telepot_response_ui.md（4-6 commits + verify 7 条 + token+cost）
  + 清空 + osascript "UI 014 6 件合一完工"
```
