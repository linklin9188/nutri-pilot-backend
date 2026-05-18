---
name: debugging-ui-bug
description: |
  UI bug 调试的 3 步原则。先确认"是哪个 URL / 哪个组件渲染的"
  再做任何代码追踪。今天（2026-05-18 home-menu-bug）用 6 小时
  追错 page 的 cache 系统，根因在另一个 hook 里——这条 skill 是
  那次教训的固化。
triggers:
  - "菜单显示不对"
  - "页面空白"
  - "刷新不变"
  - "UI bug"
  - "console 报错"
  - "Home menu"
  - "WeeklyMenu page"
---

# UI Bug 调试 3 步原则

## Step 1 — 先问 URL（30 秒）

**永远先问**：「你看到这个画面的 URL 是什么？/ 你点了哪个 tab？」

不要看截图猜。截图标题"周一菜单"可能来自：
- `/` (Home 页 today=周一时的展示)
- `/weekly` (WeeklyMenu page 的周一行)
- `/banquet` 的某个 step
- `/favorites` 的某个详情

**为什么**：底层 hook / 数据源 / cache / 算法**完全不同**。Home 用
`useRecommendDishes`（在 `src/hooks/useSupabaseMenu.ts`），WeeklyMenu 用
`useWeeklyMenu`（在 `src/hooks/useWeeklyMenu.ts`）—— 两套独立算法、
独立 cache、独立 sampling 策略。追错就是 6 小时全废。

**今天的反例**：用户截图标"周一菜单"我假设是 WeeklyMenu page，追 6
小时 `user_weekly_menus` DB cache + localStorage `weekly_menu_*` key。
实际是 Home 页 `useRecommendDishes`，根本不写这两个 cache。如果第
一步问 URL，6 小时变 30 分钟。

---

## Step 2 — grep UI 上的字符串到整个 src/（30 秒）

截图里能看到的字符串（菜名 / 标签 / 标题文案）一律 grep 整个 src/。

```bash
grep -rn "清炒虾仁\|红枣黑米粥\|餐后水果\|下午好\|开饭啦" src/ --include="*.ts" --include="*.tsx" 2>/dev/null
```

匹配结果直接告诉你哪个组件在渲染这条字符串。1 次 grep 1 秒。

**为什么**：UI 字符串是渲染路径的最终出口，逆推到组件比从 hook 顶
端往下追快 10 倍。

**今天的反例**：grep "下午好/开饭啦/餐后水果·时令" 立刻命中
`src/pages/Home.tsx`，确认渲染是 Home 不是 WeeklyMenu page。这条要是
第二步做了，第三步追 hook 5 分钟搞定。

**额外用途**：如果 grep 后 0 命中，意味着字符串**不在源码里**——
要么来自 DB（数据问题，不是代码问题），要么来自动态拼接。今天
"清炒虾仁/扒油菜"grep 0 命中 → 锁定来源是 DB 真菜，不是硬编码 mock。

---

## Step 3 — 让用户开 Network panel reload（1 分钟）

让用户硬刷 + Network tab 看：
- 哪些 request 4xx/5xx
- 哪些 request 慢得离谱（> 1MB / > 3s）
- 关键 endpoint（`/rest/v1/dishes`、`/functions/v1/composer`）的 status 和 body size

**为什么**：用户的浏览器是 ground truth，console 红色 + Network 慢
请求 = 99% bug 在这两个地方。

**今天的反例**：embedding regression 让 `select * from dishes` 单
次响应 3.2MB，手机网络卡 30 秒像菜单空白。Network panel 一眼定位，
代码端追算法是错的方向。

---

## 什么时候可以跳过这 3 步？

**永远不可以**。

哪怕你"99% 确定"是某个具体函数的 bug，先跑这 3 步只花 2 分钟。
跳过的代价是平均 3-6 小时的错向追查 + 5 个错误的 fix push 进
生产（今天就是这样）。

---

## 反模式快表

| 反模式 | 后果 |
|---|---|
| 看截图猜 URL | 追错 hook |
| 看 console 红色就追 require/网络/RLS | 真 bug 在算法里时永远找不到 |
| "用户说清完 cache 还是这一份" → 追 cache | deterministic 算法没 cache 也会"永远这一份" |
| grep 之前先改代码 | 改完发现 grep 才告诉你 0 命中或来源是另一个文件 |
| `localStorage.clear()` 当万灵药 | 清不到 IndexedDB / ServiceWorker / DB cache / 算法 determinism |

---

## 触发此 skill 的关键词

任何 UI 相关 bug 报告，特别是：
- "页面空白" / "刷新不变" / "数据不对" / "看不到 X"
- 用户截图但没给 URL
- 控制台一堆红色错误但不知道哪个跟当前 bug 相关
- 多个 page / hook 名字相似的项目（Home vs WeeklyMenu vs Banquet）
