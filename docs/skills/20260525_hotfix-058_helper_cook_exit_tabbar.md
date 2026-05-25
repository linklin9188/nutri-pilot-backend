# TICKET-058 — Helper /cook 退出 + 底部 TAB 重复 settings 修

P0 hot-fix, 老板真测 #6 两件, 2026-05-25.

## 1. cooking 退出回错位置

老板真测: 菲佣账号在 `/cook` 页, 点左上角 ←, 应该回 helper `/helper`,
但回到了雇主 `/` Home. 看 `src/pages/HelperCook.tsx:85` 原代码:

```ts
onClick={() => navigate(localStorage.getItem('nutri_role') === 'helper' ? '/helper' : '/')}
```

根因: `nutri_role` localStorage 在测试设备上没被设/被洗了, 三元 fallback 走 `/`.
这页是 helper-only (`HelperTabBar` 已挂在底部), 不需要再 guard. 大白话:
"在 helper 自己的页面里, 退出按钮无脑回 helper 首页就行, 不要再去问 role 是啥".
直接 `navigate('/helper')` 收工. 注意只改 DishListScreen 的退出 (line 85),
CookingScreen 的两个 `onBack` 是 dish-list ← dish-detail 的层间返回, 不动.

## 2. 底部 TAB 删 settings (5 → 4)

老板拍板: "菲佣主页右上角有了设置, 就不需要在下面再增加设置导航." TICKET-041 加
HelperHome 右上 ⚙️ 入口的时候忘了删底部 TAB 的 ⚙️, 两边重复. 大白话:
"一个功能只留一个入口, 用户才不会困惑".

改 `src/components/HelperTabBar.tsx`:
- TABS 数组从 5 项删到 4 项 (home/prep/cook/community)
- `HelperTabKey` 联合类型移除 `"settings"` (TS 编译时暴露遗留点)
- `active` prop 改 optional — HelperSettings 页通过 ⚙️ 进入, 不再属于 4 tab 中
  任何一个, 不传 active 即可, 底部 tab bar 仍渲染 (方便从 settings 回其他页),
  只是 4 个 tab 都不高亮.

同步改 `src/pages/HelperSettings.tsx:464` 把 `<HelperTabBar active="settings" />`
改成 `<HelperTabBar />` (不传 active).

## 3. 教训

- localStorage 三元条件不能当 navigate target 的判断锚, role-aware 路由要么走
  React Context, 要么页面已知 role 时直接 hardcode 目标. 这次 fallback `/` 直接
  把 helper 用户扔进了雇主 Home, 真实体验上等于"按了退出反而被 kick 到老板桌前".
- 加新入口前先 grep 现有同功能入口. ⚙️ TICKET-041 P1 §2 加 home 右上角 settings
  时, 应该同时审视底部 TAB settings 是否还有存在意义 — 没做这一步, 多走了一个 round
  到老板真测才发现重复.
