# UI 027 HOT-FIX DRAFT — Q8 chip + 单选 auto-advance 卡死

> 老板 2026-05-22 ~16:55 报 bug：onboarding 走到 Q8 口味清淡浓，点选无反应，不跳转下一题。
> CEO 实查定位：UI 025 §B 改 Q8 oil_level 成 `chips: true + multi: false` 组合，但 ImageGrid 没接此组合的 auto-advance handler（历史上 chips 只用于多选 Q5/Q10）。

---

## 派单时机

UI 026 ship 后**立即**覆盖 telepot_ui.md 派出。P0 hot-fix，5-10 分钟修。

---

## TICKET-027 工单（draft）

TICKET: TELEPOT-20260522-027
STATUS: pending
PRIORITY: hot-fix P0
TASK: 修 Q8 oil_level chip + 单选 auto-advance 卡死 bug

CONTEXT:

### §A bug 描述

老板原话："发现一个问题，到了口味清淡还是浓，跳转不过去了。点选之后，没有任何反应。"

CEO 实查：
- src/pages/QuickSetup.tsx Q8 oil_level 当前结构：`multi: false, chips: true, cols: 2, options: [{emoji,label,desc}]`
- 这是历史上**第一次** chips: true + multi: false 组合
- 历史 chips: true 用法（Q5 wellness_goals / Q10 strict_avoid）都是 multi: true
- ImageGrid 组件的 chip click handler 没处理 multi: false → auto-advance 不 trigger

### §B 修复路径 — 你按 Lead 判断选

**方案 1（推荐 — 最小风险）**：让 ImageGrid chip 模式支持 multi: false auto-advance
- src/components/ImageGrid.tsx chip 点击 handler：
  - if (multi === false) → 选中后立即调 onSelect + trigger auto-advance（同 image 模式行为）
- 不改 Q8 结构，保留 chip 视觉

**方案 2**：Q8 改回 image 模式（emoji 字段 → svg / 文字渲染）
- 删 chips: true，恢复 cols: 2
- options 仍用 emoji 字段，但 ImageGrid 走 image 路径处理
- 风险：可能影响 ImageGrid 已有 image 模式（emoji-only 路径未必工作良好）

**方案 3**：Q8 用专用 CompactChipSingleSelect 组件
- 不动 ImageGrid，写一个新组件专门处理 chip + 单选
- 风险：组件膨胀

**CEO 倾向方案 1** — 最小改动 + 修通用能力（未来其他单选 chip 题也能用）。

### §C verify

1. `npm run build` pass
2. 浏览器开 dev → onboarding 走到 Q8 → 点"浓郁"应立刻跳 Q9
3. 4 个选项各点一次：rich/medium/light/other 都能 trigger auto-advance（'other' 例外 — 等用户输入文本再"下一步"，参考 UI 015 §B 设计）

### §D 不变量自检

- ☑ #1 不加 FK→auth.users
- ☑ #2 不直连 Gemini
- ☑ #3 Stripe 白名单不动
- ☑ #4 ALGO_VERSION 不动
- ☑ 不改 hooks 签名 / 不动 supabase functions / 不动 migrations
- ☑ 不动 Home / WeeklyMenu / 其他 page

### §E 回执必填

COMPLETED_AT / STATUS / RESULT / FILES_CHANGED / COMMITS / §A 选哪个方案 + why / §C verify pass count + token+cost

### §F 完工动作

1. git add src/components/ImageGrid.tsx (方案 1) 或 src/pages/QuickSetup.tsx (方案 2)
2. git commit -m "fix(ui): TICKET-027 P0 修 Q8 chip + 单选 auto-advance 卡死"
3. git push origin main
4. 覆盖写 telepot_response_ui.md
5. osascript notification "UI 027 P0 hot-fix done"

### §G 本单 NOT 做的事

❌ 不动 Home/WeeklyMenu i18n（UI 027 留 normal 单独立项）
❌ 不重写 Q8 文案（仅修 click handler）
❌ 不动其他题（仅 Q8 + 通用 chip 单选支持）

### §H token+cost

预算 ~30-50k token / ~$0.5-0.8 USD（小修 + e2e 走通）

---

UI 026 ship 后 CEO 立刻把本 draft 内容覆盖到 telepot_ui.md 派出。
