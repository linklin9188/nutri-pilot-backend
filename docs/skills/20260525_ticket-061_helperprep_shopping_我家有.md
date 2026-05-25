# TICKET-061 — HelperPrep 改成 shopping "我家有" toggle

## 1. 问题

老板真测 #5: 菲佣端的「备菜清单 / Prep」tab 走错位 — UI 原来是雇主侧
"逐 prep_step 打钩 / 自动跳烹饪" 的纯备菜流，但产品定位本应是 helper
帮雇主确认「家里有哪些不必要再买」的 shopping toggle。同一个 nav 入口
(/helper-prep) 在两侧人物心智里要承担截然不同的语义。

雇主侧 VerifyIngredients 已有成熟的 "我家有" toggle 模式 (commit
9a92339 / bb08f93)，helper 这边却仍是旧 prep_steps 备菜界面 — 信息架构
不对称导致老板真测时一眼就觉得"走错页"。

## 2. 方法

完全重写 `src/pages/HelperPrep.tsx`，复用 VerifyIngredients 的三件套：

1. **食材聚合**：`dishToIngredients(dish, adults, kids)` +
   `aggregateIngredients(allRaw)` —— `src/lib/dishIngredients.ts` 现成
   导出，自动处理 prep_steps_json 优先 + 主料 heuristic fallback +
   TICKET-049 食材规范化合并（葱段+葱丝→葱）。
2. **数据源**：沿用 `localStorage.generatedMenu`（Home / WeeklyMenu 写
   入的"今日要做的菜"列表），再用 Supabase 拉 `prep_steps_json /
   main_ingredient / course_type` 7 列补完。不引入 useWeeklyMenu hook
   保持 helper 视图轻量。
3. **持久化共享**：localStorage 键 `home_inventory_<userId>_<date>` —
   和 VerifyIngredients 一模一样。helper 在 prep tab 勾的"我家有"，
   雇主打开 `/verify` 立刻能看到，无需额外 sync 层。

UI 切分：
- 顶部 hero 大字 + 副标题三语 (en/zh/tl) 解释流程
- 进度条 (X/N 已确认)
- Section 1 "Need to buy" — 主色，每行 toggle "我家有？"
- Section 2 "Already have" — 灰化删除线 + 折叠在下方，点击可放回
- 不加 "开始烹饪" CTA — 让 helper 走 HelperTabBar 的 cook tab 入口

保留三件 TICKET-060 / 之前工单的硬约束：
- line 35-45 的 zh→en useEffect (helper 视图永不显中文)
- 顶部 lang chip (cycleLanguageForRole)
- HelperTabBar active="prep"

文案全程 `t3(en, zh, tl)`，零硬编码中文。

## 3. 标准

今后改造任何 helper-side 页面前必做的 4 项 self-check：

1. **i18n 三语完备**：所有可见文案过 `t3(en, zh, tl)` —— helper 默认
   英文，必须保留 zh 给假设切到雇主语境 + tl 给菲律宾原生。
2. **保留 zh→en snap useEffect**：每个 helper 页 mount 都要兜底，
   防止 employer 会话 leak 进来。这是 TICKET-060 老板真测 #3 的
   后遗症，永久保留。
3. **保留 lang chip**：helper 必须能自己切英/塔/印 — 不要为了"简洁"
   把右上角语言切换器删掉。
4. **共享 localStorage 命名约定**：跨 helper/employer 双侧共享的状态
   （inventory / cook progress / family_members 等）必须用相同的 key
   shape，避免 "helper 端勾了雇主端看不见" 的孤岛 bug。

CEO 当下产品哲学："helper 是雇主家庭的延伸不是平行系统" — 数据层
能共享就共享，不要为隔离造重复 schema。
