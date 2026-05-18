# 2026-05-18 — Home Menu Bug 修复 session

## TL;DR

用户报告"清完所有 cache，刷新菜单 100% 字面一致 + 红枣黑米粥占午餐 staple +
午晚 NO.01 同道菜"。绕路 6 小时追 cache 失效 / DB 残留 / require() 错误，
真根因其实是 `useRecommendDishes`（Home 用的菜单 hook）**纯 `sort by score`，
零概率抽样 + 零粥过滤 + 零跨餐去重**——输入 frozen 必然输出一致，cache
根本不存在。修复用 weightedRandom 抽样 + mealTime≠早餐 时 strip 粥 +
localStorage 跨餐 dedup（commit `1369ac2`），随后又补 cache 层让 tab 切换
稳定 + Home 跟 WeeklyMenu page 对齐数据源。

---

## 时间线（按事件，不是 commit 顺序）

1. **用户最初报告**（约 19:30）
   - 打开 nothinkeats.com 菜单页空白
   - 控制台 23 个红色错误（其中 `Uncaught ReferenceError: require is not defined`）
   - 一周菜单里早餐/午餐/晚餐有重复菜，早餐不像从早餐库选的

2. **第一次诊断方向 — ESM require bug（命中 ✓）**
   - grep `require(` in src/ → 3 处：useSupabaseMenu.ts:1198 / 1223、breakfastCombos.ts:235
   - Vite ESM bundle 把 `require` 直接保留 → 运行时 `require is not defined`
   - 1223 那条**不在 try/catch 里** → hook crash → 菜单空白
   - 1198 那条**在 try/catch 里被吞** → 早餐 combo 一直走 legacy fallback → 跟午晚没区分
   - 修：3 处全改成 ESM static import
   - **commit `3d9350c`** push 后空白屏 + 早餐错乱消失 ✓

3. **第二次诊断方向 — Cache 残留猜想（6 小时绕路 ✗）**
   - 用户报告"清完所有 cache 菜单 100% 字面一致"
   - 我们追了 5 个错误假设，每个都 push 一轮 fix：
     - 假设 a: `user_weekly_menus` DB cache stale → SQL DELETE 10 行 → 菜单**仍然不变**
     - 假设 b: localStorage cache 残留 → `localStorage.clear()` → 仍然不变
     - 假设 c: weekly_menu_algo_ver / db_cache_key sentinel 失效 → 清掉 → 仍然不变
     - 假设 d: IndexedDB / ServiceWorker / 硬编码 mock 数据 → grep `'清炒虾仁'` / `mockMenu` / `defaultMenu` 全 src/ → 0 命中
     - 假设 e: deterministic seed → 仍然不变
   - 关键转折：grep `useRecommendDishes` 在 useSupabaseMenu.ts，line 1502-1508 是裸 `.sort((a, b) => b.score - a.score)`，**没有 weightedRandom，没有任何 random**

4. **真根因发现**
   - `useRecommendDishes` (Home 用的) ≠ `useWeeklyMenu/generateWeekPlan` (WeeklyMenu page 用的)
   - 前者输入全 frozen（profile / humidity / solarTerm / scores / spiceBoost / hasXiaomei / mealTime 一次刷新内全常量）→ score 100% reproducible → top-N 永远相同 → "永远同一份" **不是 cache，是算法 deterministic**
   - 此外它**没有粥 strip**（红枣黑米粥稳定霸占 jiangnan 用户的 staple slot）
   - 此外它**没有跨午晚去重**（午餐 hook 和晚餐 hook 各自独立运行，互不知情，同一道高分菜两边都 NO.1）
   - useSupabaseMenu.ts 里 0 处 `localStorage.setItem` → 之前所有"清 cache"操作都是清的别的 key，跟 Home 菜单完全无关

5. **修复 commits**（按时间）
   - `1369ac2` — 加 `weightedRandom` helper + top-25 抽样 + mealTime≠早餐 strip 粥 + `home_menu_picks_<uid>_<date>` 跨餐 dedup
   - `454307b` — 切午晚 tab 又变了 → 加 cache 层 `home_menu_<...settings...>` 让 tab 切换稳定
   - `f697163` — 切中西餐又变 → cache key 加 `prefsHash`，listener 不再清 cache 让 cuisine 切换靠 key 分流
   - `41a4e65` — Home 午晚 baseMenu 反转优先级，**weeklyMenu 当日 row 为主**，recommendedDishes fallback
   - `62a724d` — Home 早餐独立 fetch breakfast pool + 直接调 `pickBreakfastCombo`，跟 WeeklyMenu page line 481 同 path

---

## 本次发现的真 bug 清单（按严重度排序）

| # | 严重度 | 状态 | 内容 |
|---|---|---|---|
| **P0** | 阻塞 | ✅ 已修 (`1369ac2`) | `useRecommendDishes` 纯 `sort by score` + 输入 frozen = 菜单永远相同。weightedRandom 抽 top-25 解决 |
| **P1** | 高 | ✅ 已修 (`1369ac2`) | useRecommendDishes 不 strip 粥/稀饭，红枣黑米粥永远占 jiangnan 用户 staple slot。mealTime≠早餐 时 filter 解决 |
| **P2** | 高 | ✅ 已修 (`1369ac2`) | 午餐 hook + 晚餐 hook 独立运行无跨餐 dedup → 同一道菜 NO.1 双显。localStorage `home_menu_picks_<uid>_<date>` 解决 |
| **P3** | 阻塞 | ✅ 已修 (`3d9350c`) | 3 处 `require()` 在 Vite ESM bundle 里运行时 throw，1 处导致菜单空白。改 ESM static import |
| **P4** | 中 | ❌ 未修 (long-term) | `useRecommendDishes`（Home）vs `useWeeklyMenu/generateWeekPlan`（WeeklyMenu page）两条独立菜单生成路径，逻辑大量重叠但每个细节不一致。今天靠"Home baseMenu 反转优先级用 weeklyMenu 当日 row"对齐显示，但底层算法仍分叉 |
| **P5** | 中 | ❌ 未修 | 控制台满屏 `POST /households 400/401` + `GET /user_preference_scores 406`。households 表 schema 是 `id/employer_id/name/invite_code`，**没有 user_id 列**，前端代码用 `WHERE user_id=...` 必然 400。user_preference_scores `.single()` 但 0 行匹配返 406。两者都是历史 schema 假设错误，跟今天的菜单 bug 无关但常驻噪声 |
| **P6** | 中 | ❌ 未修 | 用户档案存两处不同步：localStorage（`userHometown=east` / dietaryGoal=`growth` / etc.）和 DB `user_profiles`（`hometown_cuisine=jiangnan` / `dietary_goal=muscle_gain` / `taste_pref=light`）。前端用 `HOMETOWN_TO_DB_BUCKETS` map 在读时翻译（east→jiangnan），但写路径没双向同步，未来加新字段必然分叉 |
| **P7** | 中 | ❌ 未修 (扩 DB) | jiangnan 用户 lunch+dinner+all 池只 68 道（53 jiangnan + 15 null），其中 **staple 仅 6 道 / soup 仅 5 道**。即便算法正确，pool starvation 会让 hometownBonus +0.60 拉的菜挤不过其他菜系 196 道 cantonese 的 top-N。根治要 backfill DB |

---

## 6 小时绕路的根本原因 + 教训

### 根本原因（process 层）

**没有先问 URL**。用户截图标"周一菜单"，我假设是 WeeklyMenu page，追了 6 小时 `user_weekly_menus` DB cache。实际截图来自 **Home page**（路径 `/`），底层 hook 是 `useRecommendDishes` 不是 `useWeeklyMenu`。两个 hook 完全独立——cache、算法、写入路径全不同。前提错了所有诊断都是无效功。

### 二级原因

1. **看到红色错误就追 bug，没先看截图 UI 字符串**。"清炒虾仁/红枣黑米粥/扒油菜"这些菜名一句 `grep -rn` 就能定位渲染来源是 Home.tsx（而不是 WeeklyMenu.tsx）。
2. **没意识到两个 hook 是不同算法路径**。代码里 useWeeklyMenu 有 `weightedRandom`、useRecommendDishes 没有——这事一开始没 grep 出来。
3. **被"清完 cache 还是这一份"误导**。这听起来像 cache 没清干净，实际是**根本没 cache**——deterministic 算法不需要 cache 也永远输出同一份。

### 教训

- UI bug 第一步必须是**「这是哪个 URL / 哪个组件」**。一旦确定，往上找 hook 5 分钟搞定。
- 跳过 grep UI 字符串直接追 cache 是最贵的 anti-pattern。
- "100% 字面一致"在没有 cache 的代码里 = deterministic 算法，不是 cache bug。
- 两个相似命名的 hook（`useRecommendDishes` 在 `useSupabaseMenu.ts`、`useWeeklyMenu` 在 `useWeeklyMenu.ts`）一定要警惕，今天踩了。

---

## 明天/下周的优先级建议（按 ROI 排序）

| 排序 | 项 | ROI | 工作量 |
|---|---|---|---|
| 1 | **P5 修 households 400/401** — schema mismatch 是历史 1 行代码错误，修了控制台立刻干净，未来调试少一层噪声 | 高 | 30 分钟 |
| 2 | **P6 加 user_profiles 与 localStorage 双向同步层** — `src/lib/profileSync.ts` 单点。否则任何 onboarding/settings 改字段都要手动对照两边 | 高 | 2-3 小时 |
| 3 | **P7 backfill 江南菜系 staple+soup** — 至少 staple 6→15 / soup 5→15。Claude Haiku 一个 prompt 批量生成 + 跑 `gen-dish-steps-claude` pipeline | 高 | 1 小时 |
| 4 | 接 **Critic Agent**（022 后续）—— menu_evals 已经能写了，Composer 跑了 4 次有真实样本，可以开始针对性观察 | 中 | 半天 |
| 5 | **P4 长期 useRecommendDishes / useWeeklyMenu 收敛** — 抽 `src/lib/menuCommon.ts` 共享 weightedRandom / 粥 strip / hardFilter，让两条 path 共享 helper。但保留各自的 schedulling 语义（Home 单餐，Weekly 一周） | 中 | 1 天 |
| 6 | 剩 84 道历史 image NULL backfill（gen-dish-images 跑全量；中途 fetch failed 那次留下的） | 低 | 30 分钟 wallclock |
| 7 | `deriveType` UI 标签改用 `course_type` 来生成（炒河粉/staple 现在被错贴 MEAT） | 低 | 15 分钟 |
| 8 | menu_evals RLS 收紧（INSERT/UPDATE 走 service-role edge function），v1 现在是 anon-insert + anon-update 接受 abuse 风险 | 低 | 1 小时 |

**强烈不建议明天做**：theme 输入引入 / outcome cron / embedding 召回向量化——都要等 Composer 跑出真实数据才有方向。

---

## Session commit 列表（本日 main 推送）

```
62a724d fix(home): align 早餐 with WeeklyMenu — same pool + same picker
41a4e65 fix(home): align today's menu with WeeklyMenu (weekday lunch/dinner)
f697163 fix(home): cuisine/meal-tab switching no longer reshuffles the menu
454307b fix(home): cache menu per (mealTime, settings, day) so tab switch is stable
1369ac2 fix(home): break Home menu determinism + congee strip + cross-meal dedup
3d9350c fix(esm): replace 3 runtime require() with ESM imports
261b05a fix(perf): drop embedding from weekly-menu + banquet SELECTs
65d36af chore(scripts): backfill average_cost_hkd for 729 dishes
2506f3c chore(scripts): backfill western_subtype + wire into Composer (8-way)
2d7aa90 chore(scripts): backfill 3 quality scores (kid/hk/helper)
30c4be0 chore(scripts): gen-dish-images --source filter
1bbb632 fix(banquet): cold-bucket cross-cuisine coverage (13→35)
5785366 feat(db): menu_evals anon UPDATE policy (migration 023)
05714b9 fix(banquet): slim dishes payload before localStorage.setItem
ba4fd6c feat(composer): Composer Agent v1 接入 /banquet (022)
4618664 chore(scripts): embedding backfill tooling (021)
```

直接 SQL apply 到生产 DB（未走 git）：
- 13 道菜 `flavor_tags += 'cold'`
- 9 道新凉菜 seed
- 9 道米粉/捞面 `course_type: main_protein → staple`
- 116 道 western_subtype 回填
- 729 道 average_cost_hkd / 729 道 kid/hk/helper 评分 / 720 道 embedding 768d 向量
- e54d66c5 + 624fe441 两个账号 is_pro=true 至 2027-05-18
