# Evening session: 验证昨天 fix → 发现 2 新 bug → 改错代码路径

> Status: ⚠️ Real bug 未修,但 commits 已在 prod 且无害。明天换路径接。

## TL;DR

验证昨天 (5 个 fix) 时发现 2 个新 bug —— 晚餐 staple slot 为 0 + 中餐 tab 漏越式鸡肉沙拉。花 2 小时写了 fix (cuisineFilter 黑名单→白名单 + applyDinnerTemplate slot-aware fallback) 并部署。部署后菜单未变,排查发现 **Home 周一-周五的午晚餐实际渲染走 useWeeklyMenu,不是 useRecommendDishes** (Home.tsx ~line 530-560)。我们改的两个 fix 都改在了一个**这个 UI 不用的代码路径**上 —— 同形于昨天 7 小时的错。Fix #1/#2 已 commit + push,无害且硬化了 fallback 路径(周末 / weekly 加载失败),**保留不 revert**。明天必须改 useWeeklyMenu 等价位置 + 加 algo_version 失效机制。

## 时间线

1. **早上 ~21:00**:用户在 nothinkeats.com 看到周二菜单 (因为是傍晚 mode,显示明日)。V1-V5 验证 P0/P1/P2 全 PASS。
2. **~21:20**:发现 2 新 bug:
   - **#1** 晚餐 staple slot = 0 道 (jiangnan, 中餐 tab)
   - **#2** 中餐 tab 出现 越式鸡肉沙拉 (origin = southeast_asian)
3. **~22:00**:诊断:
   - cuisineFilter 用黑名单 `NOT IN (western, cantonese)` → 漏 145 道菜 (southeast_asian + japanese_korean + null + 1 typo,占 20% 整库)
   - applyDinnerTemplate line 1412 silent skip:staple pickWithMethodVariety 返回 undefined → take(undefined) → slot 留空。根因:line 919 staple boost 只在午餐,晚餐 staple 排名进不了 top-25
4. **~22:30**:写 Fix #1 + #2,本地 build 通过,commit (95c2eef + 8c55987),push 上 prod
5. **~22:50**:Vercel 部署完,bundle marker check 显示两个 fix 都在 (`fell back to broader pool` + `["sichuan","jiangnan","northern"]` 都命中)
6. **~23:00**:**但 UI 菜单一模一样**,越式鸡肉沙拉还在 NO.01
7. **~23:05**:用户反问"你不会又发生昨天的错误了？" — 这次比昨天好,我**真的停下来检查了**
8. **~23:10**:Warp sed Home.tsx line 510-560 → 真相浮现:
```js
cat > docs/sessions/2026-05-18-evening-wrong-hook-pivot.md << 'SESSION_DOC_EOF'
# Evening session: 验证昨天 fix → 发现 2 新 bug → 改错代码路径

> Status: ⚠<fe0f> Real bug 未修,但 commits 已在 prod 且无害。明天换路径接。

## TL;DR

验证昨天 (5 个 fix) 时发现 2 个新 bug —— 晚餐 staple slot 为 0 + 中餐 tab 漏越式鸡 肉沙拉。花 2 小时写了 fix (cuisineFilter 黑名单→白名单 + applyDinnerTemplate slot-aware fallback) 并部署。部署后菜单未变,排查发现 **Home 周一-周五的午晚餐实际渲染走 useWeeklyMenu,不是 useRecommendDishes** (Home.tsx ~line 530-560)。我们改的两个 fix  都改在了一个**这个 UI 不用的代码路径**上 —— 同形于昨天 7 小时的错。Fix #1/#2 已 commit + push,无害且硬化了 fallback 路径(周末 / weekly 加载失败),**保留不 revert**。明天必须改 useWeeklyMenu 等价位置 + 加 algo_version 失效机制。

## 时间线

1. **早上 ~21:00**:用户在 nothinkeats.com 看到周二菜单 (因为是傍晚 mode,显示明日)。V1-V5 验证 P0/P1/P2 全 PASS。
2. **~21:20**:发现 2 新 bug:
   - **#1** 晚餐 staple slot = 0 道 (jiangnan, 中餐 tab)
   - **#2** 中餐 tab 出现 越式鸡肉沙拉 (origin = southeast_asian)
3. **~22:00**:诊断:
   - cuisineFilter 用黑名单 `NOT IN (western, cantonese)` → 漏 145 道菜 (southeast_asian + japanese_korean + null + 1 typo,占 20% 整库)
   - applyDinnerTemplate line 1412 silent skip:staple pickWithMethodVariety 返回 undefined → take(undefined) → slot 留空。根因:line 919 staple boost 只在午餐,晚餐 staple 排名进不了 top-25
4. **~22:30**:写 Fix #1 + #2,本地 build 通过,commit (95c2eef + 8c55987),push 上 prod
5. **~22:50**:Vercel 部署完,bundle marker check 显示两个 fix 都在 (`fell back to broader pool` + `["sichuan","jiangnan","northern"]` 都命中)
6. **~23:00**:**但 UI 菜单一模一样**,越式鸡肉沙拉还在 NO.01
7. **~23:05**:用户反问"你不会又发生昨天的错误了？" — 这次比昨天好,我**真的停下来检 查了**
8. **~23:10**:Warp sed Home.tsx line 510-560 → 真相浮现:
```js
heredoc> cat > docs/sessions/2026-05-18-evening-wrong-hook-pivot.md << 'SESSION_DOC_EOF'
# Evening session: 验证昨天 fix → 发现 2 新 bug → 改错代码路径

> Status: ⚠️ Real bug 未修,但 commits 已在 prod 且无害。明天换路径接。

## TL;DR

验证昨天 (5 个 fix) 时发现 2 个新 bug —— 晚餐 staple slot 为 0 + 中餐 tab 漏越式鸡肉沙拉。花 2 小时写了 fix (cuisineFilter 黑名单→白名单 + applyDinnerTemplate slot-aware fallback) 并部署。部署后菜单未变,排查发现 **Home 周一-周五的午晚餐实际渲染走 useWeeklyMenu,不是 useRecommendDishes** (Home.tsx ~line 530-560)。我们改的两个 fix 都改在了一个**这个 UI 不用的代码路径**上 —— 同形于昨天 7 小时的错。Fix #1/#2 已 commit + push,无害且硬化了 fallback 路径(周末 / weekly 加载失败),**保留不 revert**。明天必须改 useWeeklyMenu 等价位置 + 加 algo_version 失效机制。

## 时间线

1. **早上 ~21:00**:用户在 nothinkeats.com 看到周二菜单 (因为是傍晚 mode,显示明日)。V1-V5 验证 P0/P1/P2 全 PASS。
2. **~21:20**:发现 2 新 bug:
   - **#1** 晚餐 staple slot = 0 道 (jiangnan, 中餐 tab)
   - **#2** 中餐 tab 出现 越式鸡肉沙拉 (origin = southeast_asian)
3. **~22:00**:诊断:
   - cuisineFilter 用黑名单 `NOT IN (western, cantonese)` → 漏 145 道菜 (southeast_asian + japanese_korean + null + 1 typo,占 20% 整库)
   - applyDinnerTemplate line 1412 silent skip:staple pickWithMethodVariety 返回 undefined → take(undefined) → slot 留空。根因:line 919 staple boost 只在午餐,晚餐 staple 排名进不了 top-25
4. **~22:30**:写 Fix #1 + #2,本地 build 通过,commit (95c2eef + 8c55987),push 上 prod
5. **~22:50**:Vercel 部署完,bundle marker check 显示两个 fix 都在 (`fell back to broader pool` + `["sichuan","jiangnan","northern"]` 都命中)
6. **~23:00**:**但 UI 菜单一模一样**,越式鸡肉沙拉还在 NO.01
7. **~23:05**:用户反问"你不会又发生昨天的错误了？" — 这次比昨天好,我**真的停下来检查了**
8. **~23:10**:Warp sed Home.tsx line 510-560 → 真相浮现:
```js
   const useWeekly = !weeklyLoading && !isWeekend();
   if (mealTime === '晚餐') {
     if (useWeekly) {
       const dinner = weeklyMenu?.days[todayIdx]?.dishes ?? [];
       if (dinner.length > 0) return ...;  // ← 周一-五,99% 走这里
     }
     return recommendedDishes;  // ← 只有周末 / weekly 加载失败才走这里
   }
```
   `useRecommendDishes` 在工作日完全是 fallback 路径,本次 UI bug 与它无关。
9. **~23:30**:决定收工,写本文档

## 本次发现的 bug 清单

- ⚠️ **P0 (真 bug, 未修)** — Home 周一-五午晚餐 = `useWeeklyMenu.days[todayIdx]`,不是 useRecommendDishes。useWeeklyMenu 有自己的 cuisine filter + dinner slot 模板,需要 copy 同款 fix 过去。
- ⚠️ **P0 (cache 失效机制)** — `user_weekly_menus` 表无 algo_version 列。即使 useWeeklyMenu 的 cuisine filter 改了,旧 cache 仍然返回旧菜单。必须加 algo_version + bump 一次强制全 user 重生成。
- 🔧 **改错路径但无害** — commit 95c2eef (Fix #1 applyDinnerTemplate slot-aware fallback) + 8c55987 (Fix #2 cuisineFilter whitelist)。已在 prod,只硬化了 fallback 路径 (周末 / weekly loading)。**不 revert**。Fix #2 的白名单概念明天也可以照搬到 useWeeklyMenu。

## Smells (yesterday list 的延伸)

- **P3 强化优先级** — yesterday 标 "weekly_menu cache 没 algo_version" 为可选 smell;**今天证明它是 P0 阻塞**,所有 useWeeklyMenu 算法改动都被它无声短路。明天必修。
- **P5 仍存在** — console 满屏 households 400/401 + user_profile_scores 406。今天没动,明天顺手看看。

## 教训 — yesterday 教训的同形复发

|  | Yesterday | Today (evening) |
|---|---|---|
| 错的假设 | "肯定是 cache 问题" | "Home 用 useRecommendDishes" |
| 跳过的步骤 | grep UI 字串到 src/ | 把 grep 输出读到底 |
| 关键漏看的线索 | (没 grep,所以没线索) | "useRecommendDishes only if the dedicated pool hasn't loaded yet" 这条注释**摆在面前** |
| 代价 | 7 小时 | 2 小时 |
| 谁叫停 | 用户开 Network panel | 用户反问"你不会又..." |

**根因:用直觉假设代替事实验证。** Yesterday 的教训抽象成了原则 (.claude/skills/debugging-ui-bug.md),但**原则的实际执行需要在每一个具体决策点重新激活**,不是写下来就自动生效。

**行动项:** 把 debugging-ui-bug.md 的 Step 2 加一句:"grep 之后,**所有 'only if / fallback / dedicated / preferred' 类注释必须追完它指向的代码再继续**。"

## 明天的优先级 (按 ROI)

1. **P0** `sed -n '1400,1650p' src/hooks/useWeeklyMenu.ts` — 看 cuisine filter + dinner slot template
2. **P0** 决策:useWeeklyMenu 调用 applyCuisineFilter 吗?
   - 若是 → 我们的 Fix #2 已经覆盖,只剩 cache 失效问题
   - 若否 → copy CHINESE_ORIGINS 白名单逻辑过去
3. **P0** 写 useWeeklyMenu 版本的 dinner-staple fallback (跟 Fix #1 同形)
4. **P0** `user_weekly_menus` 表加 `algo_version` 列 + 客户端读 cache 时校验 + bump 一次 → 强制全 user 下次访问重生成
5. **P1** Build + push + 验证 prod 真的修了 (这次先看 Network panel 而不是只看 UI)
6. **P2** 顺手查 P5 households 400/401 是不是简单 schema bug

## 时间预算 (明天)

- P0 (1-4): ~2-3 小时
- P1 验证: ~30 min
- P2 (可选): ~30 min

## 提示词 (明天打开 claude.ai 第一句)

> 继续 nutri-pilot。昨晚 (2026-05-18 evening) 收工时发现:Home 周一-五午晚餐实际走 useWeeklyMenu,不是 useRecommendDishes。我之前写的 Fix #1 + #2 (commits 95c2eef + 8c55987) 已在 prod 但用错了路径。详见 docs/sessions/2026-05-18-evening-wrong-hook-pivot.md。今天 P0:照搬 fix 到 useWeeklyMenu + 加 algo_version 失效机制。先看 useWeeklyMenu.ts line 1400-1650。
