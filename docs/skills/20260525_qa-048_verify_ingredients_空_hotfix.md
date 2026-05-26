# QA-048 P0 — 采购清单空（VerifyIngredients DB/LS 读源不一致）

## 1. 现象

老板真测 `/verify-ingredients` 采购清单完全空白，左上角 "0/0 已有"，
empty state "还没有菜单" CTA "去生成菜单"。

## 2. 真因（一句话）

`VerifyIngredients.tsx` 只读 localStorage 缓存 (`loadWeekMenu()` 扫
`weekly_menu_${ALGO_VERSION}_${weekStart}*` key)，但 `useWeeklyMenu`
hook 在 DB-cache 命中分支 (`loadFromDB → setState → return`)
**没有把 cached menu 同步写回 LS**。

跨页面后果：
- 用户某次（旧浏览器 / 旧 ALGO_VERSION cleanup 后 / 换浏览器 / LS 配额清）的
  菜单只在 DB (`user_weekly_menus` 表) 有，LS 没。
- Home tab 走 `useWeeklyMenu` → DB hit → 渲染 OK。
- VerifyIngredients tab 走 `loadWeekMenu()` 只看 LS → null → ingredients=[]。

实查证据：用户 `650bec64` `user_weekly_menus` 在 DB 完整 (algo v66, dinner
3 / lunch 2 / breakfast 4 / fruit 1, 5 天全)，但页面照样空白 → 锁定 LS 缺失。

## 3. 修复（2 处 surgical）

**§A useWeeklyMenu.ts line 3538**：DB hit 路径加 1 行
`safeSetWeeklyMenuCache(lsKey, JSON.stringify(cached))`，让所有 LS-only
consumer (VerifyIngredients 等) 在 Home tab 跑过一次后即可同步拿到。

**§B VerifyIngredients.tsx**：引入 `useWeeklyMenu(0)` hook，three call site
(`schedule useMemo` + `mode='week' useEffect` + `mode='today' useEffect`) 改
`hookWeeklyMenu ?? loadWeekMenu()` 复合读源；deps 加 `hookWeeklyMenu`
让 DB 完成时 ingredients 自动重算。加 `菜单加载中…` 占位避免闪「还没有菜单」。

未来若有第三个 LS-only consumer（meal log / banquet shopping 类），同样的
模式 (hook 优先 + LS fallback) 复用即可。

## 4. 教训

DB-first cache 设计要么所有 consumer 都用 hook（hook 内 DB 优先），要么
hook 在每个 hit 路径 mirror 写 LS。任何"我先在 useEffect 里 setState 然后
return 不写 LS"都会让独立读 LS 的页面失去数据源。这次 commit `9a92339`
两端都补：hook 端 mirror（兜底）+ consumer 端切 hook（首选）。
