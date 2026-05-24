# UI-041 Helper §2 HelperHome dashboard 化 + 5 TAB bar 全 helper 页统一 footer nav

日期: 2026-05-25
ticket: TELEPOT-20260525-041
预算: 90k token

## 解决了什么问题

老板痛点 (2026-05-25 凌晨): helper 主页 (`/helper` = HelperHome) 此前是 4 个
big task card 列表 (检查食材 / 备菜 / 开始烹饪 / 厨艺社区), 像 iOS Launcher,
缺"今天家里发生什么"的全景信息密度. 雇主 Home (`/`) 已经是 dashboard 风
(hero + 5 餐厅 + WeekendDining + nutrition + today menu), helper 端落后.

5 个 helper 页 (HelperHome / HelperPrep / HelperCook / HelperCommunity /
HelperSettings) 底部导航不统一:
- HelperHome / HelperCook(list 屏) / HelperSettings 用 `HelperBottomTabBar`
  (老 4 tab: 任务/做菜/采购/社区), HelperCook 的 CookingScreen 没 tab
- HelperPrep 完全没 tab bar (有自己的 `fixed bottom-0` "开始烹饪" footer)
- HelperCommunity 完全没 tab bar

结果: helper 用户在 5 页之间切换要靠 back / deep-link, 没有"5 tab 平铺"的
导航直觉, 跟雇主端 `BottomTabBar.tsx` 的体验不对称.

## 用了什么关键方法

### A. 新建 `HelperTabBar.tsx` (5 tab) 与老 `HelperBottomTabBar` (4 tab) 并存

不删老组件 (其他角色入口可能仍引用), 新组件接受 `active` prop:

```tsx
<HelperTabBar active="home" | "prep" | "cook" | "community" | "settings" />
```

5 tab 真实 route 映射 (与 `App.tsx` 实际注册对齐, 工单原文 `/helper-home` /
`/helper-prep` / `/helper-cook` 是错的):

| key | icon | route | App.tsx |
|---|---|---|---|
| home      | home          | /helper           | line 278 |
| prep      | shopping_cart | /prep             | line 271 |
| cook      | soup_kitchen  | /cook             | line 272 |
| community | groups        | /helper-community | line 285 |
| settings  | settings      | /helper-settings  | line 287 |

样式与雇主 `BottomTabBar` 对称: `fixed bottom-0 z-50 bg-white/95 backdrop-
blur-xl`, active tab 主色橙 `#FF5A1F` + Material `FILL'1` icon + 加粗
label, `safe-area-inset-bottom` 兼容刘海屏. 3-语 label 用 `useLanguage().t3`
(EN / 中 / Tagalog), helper 端永不用 Chinese 但 t3 还是保留中文位 (LanguageContext
的 helper 模式会过滤掉 zh).

### B. HelperHome dashboard 化 (5 section)

| § | 区块 | 数据源 | 空兜底 |
|---|---|---|---|
| 1 | 顶部 Hero | `user_profiles.{display_name,nickname,avatar_url,origin_country}` + JS Date 时段问候 | 没头像 → 橙渐变首字母圆; 没 origin → 国籍 onboarding 卡 |
| 2 | 今日任务 | `dishes` (绑定后从雇主菜单拉 cook_time_min) + localStorage `helper_task_done:<id>` track 状态 | `taskDishes.length===0` → "今天还没安排菜单, 去看雇主的菜单 →" 跳 `/cook` |
| 3 | 今日菜单 | `dishesByMeal` (早/午/晚 grid 3 卡, cover = list[0].image_url, 点跳 /cook) | 无 dishes → 整 section 隐 |
| 4 | 社区动态 | `helper_posts ORDER BY created_at DESC LIMIT 3` + `user_profiles.display_name` JOIN | `communityPosts.length===0` → 整 section 隐 |
| 5 | 积分占位 | hard-coded `--` (TODO comment: enable 1000 用户后) | 永远显示, "邀请朋友赚积分" CTA 跳 /helper-settings |

关键保留 (没"refactor adjacent code"丢老逻辑):
- TICKET-009 三步绑定查询 (helper_id → household → employer → user_weekly_menus
  → dishes) + console.warn diagnose 路径
- TICKET-052 §H 国籍 onboarding (PH/ID 一次性 prompt + 已答收口入 hero chip)
- 邀请码加入 household (handleJoinHousehold + 6 位 code)
- "切换账号" 退出登录 link

### C. 其他 4 helper 页 surgical 加 footer

| 页 | 改动 |
|---|---|
| HelperCook | `import HelperBottomTabBar → HelperTabBar`, DishListScreen 内的 `<HelperBottomTabBar />` → `<HelperTabBar active="cook" />`; CookingScreen 内不加 (沉浸式做菜屏, 步骤已占满, 加 tab bar 反而干扰) |
| HelperSettings | `import HelperBottomTabBar → HelperTabBar`, `<HelperBottomTabBar />` → `<HelperTabBar active="settings" />` |
| HelperPrep | 加 `import HelperTabBar`; **z-index 冲突修**: 原 footer `fixed bottom-0 z-50` 与 TabBar 冲, footer 改 `bottom-[72px] z-40` 让 TabBar 占 0 位; 末尾加 `<HelperTabBar active="prep" />` |
| HelperCommunity | 加 `import HelperTabBar`; **z-index 冲突修**: 详情 modal 原 `z-40` 被 TabBar `z-50` 盖住, modal 升到 `z-[60]`; toast 原 `bottom: 80` 上移到 `bottom: 96` 避开 TabBar 高度; 末尾加 `<HelperTabBar active="community" />` |

## 下次同类任务执行标准

### 改 helper UI 公共组件前**必须**:

1. **grep 现有兄弟组件**: `ls src/components/Helper*` 看老 `HelperBottomTabBar`
   是否已存在. 这次发现已有 4-tab 老版, 决策**并存不删** (其他页可能引用) +
   命名新组件 `HelperTabBar` (短名突出新版).
2. **grep 实际 route**: `grep -n "helper" src/App.tsx` 看 `<Route path=...>`
   真实注册. 这次工单原文路径 `/helper-home` `/helper-prep` `/helper-cook`
   是错的 (App.tsx 实际是 `/helper` `/prep` `/cook` `/helper-community`
   `/helper-settings`), 工单不可信, 代码才可信.
3. **scan 现有 z-index + fixed bottom**: 给页加 `fixed bottom-0 z-50` 之前
   必须 `grep -n "fixed\|z-50\|z-40" src/pages/HelperX.tsx` 找现存
   floating/modal/footer, 否则 modal 被新 TabBar 遮 (HelperCommunity 此案).
   z-index 改原则: TabBar `z-50` < modal/dialog `z-[60]` < toast 仍可 `z-50`
   但 `bottom` 值要 > TabBar 高度 (~72px + safe area ≈ 96px).

### 改后**必须**:

1. `npx vite build` 跑通 (项目惯例: 不跑 `tsc`).
2. **localStorage track 状态用前缀 key**: 这版 `helper_task_done:<dishId>` 把
   task done 状态写 localStorage, 初始 hydrate 时 `for...localStorage.length`
   扫前缀, refresh 不丢. 后续 ticket 接 `user_cook_logs` 真持久化时此层可
   保留作 client-side fallback.
3. **保留 surgical 边界**: 工单 §C 明示 "只在页面底部加 TabBar, 不改其他内容".
   但 z-index 冲突 + footer/modal 重叠是**必须修的副作用**, 不算越界 refactor.
   原则: 修了直接破 UX 才动, 不顺手"清理".

## 实施细节备忘

- `HelperTabBar.tsx` 用 `tab.key === active` 判定 active, 比老 `BottomTabBar`
  的 `pathname.startsWith(route)` 判定更稳 (避免 `/prep` 嵌套 route 误激活).
- HelperHome 头像 fallback 链: `avatar_url` (微信/上传) → 橙渐变首字母圆.
  `onError` handler 不仅 hide img 还 `setHelperAvatarUrl(null)` 触发重渲染走
  首字母分支 (单纯 hide img 会留空白方块).
- §2 任务卡 ETA 用 `dish.cook_time_min ?? 15` 兜底 (cook_time_min 是 Database
  012/Backend 023 才稳定填的列, 老 dish 可能 null).
- §4 社区动态拉数据 `.catch(() => {})` 静默, 让 community RLS 异常时不阻塞
  其他 section 渲染 (符合 dashboard "局部失败不阻全局" 原则).
- §5 积分卡 `pts` 数字 hard-coded `--`, 代码 inline TODO `// TODO: enable
  1000 用户后`, 后续接积分系统时直接 grep TODO 替换.
