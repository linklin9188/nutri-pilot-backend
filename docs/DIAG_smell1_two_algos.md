# DIAG — Smell 1：Home / WeeklyMenu 两套算法并存

> 作者：Algorithm Lead
> 日期：2026-05-19
> 任务来源：`_bridge/telepot_algorithm.md`（STATUS=pending，2026-05-19）
> 交付物形式：**诊断报告，仅诊断不改代码**。三处 hard guard：
>   1. 不改 `.ts` / `.tsx`；
>   2. 不动 `ALGO_VERSION`；
>   3. 粥处理、breakfast 路径等"顺手该统一"的事一律留到合并方案落地时再做。

读完此文后，CEO / Architect 用来判断走哪一个合并方向，本人作算法实现。

---

## 0. 前置事实勘误（CLAUDE.md 已陈旧）

CLAUDE.md / CLAUDE_ALGORITHM.md 多处写 `ALGO_VERSION = v26`。
实际值：`src/hooks/useWeeklyMenu.ts:60` → **`v37`**。
v27-v37 累计的改动（power 曲线、地域大区、cook-method 多样性、breakfast combo 轮换、Western 高端 bias）全都已落地。后文以 v37 为基线。

另一个事实：`useSupabaseMenu` 端 **不存在** `ALGO_VERSION` 概念，所有 Home 缓存按当日 + (mealTime / cuisine / 人数 / vegan / prefsHash) 复合 key 自然失效（`useSupabaseMenu.ts:1500-1514`），从未参与 ALGO_VERSION bump。

---

## 1. 9 维度对比表

| 维度 | useRecommendDishes (Home, `useSupabaseMenu.ts`) | useWeeklyMenu / generateWeekPlan (`useWeeklyMenu.ts`) |
|------|--------------------------------------------------|--------------------------------------------------------|
| **入口 hook** | `useRecommendDishes(mealTime, veganOnly, adults, kids, cuisineMode)` — `useSupabaseMenu.ts:1478-1754` | `useWeeklyMenu(weekOffset)` → `generateWeekPlan(pool, profile, prefScores, recentIds, dishesPerDay, kidSlots, spiceBoost, ageGroup, healthPrefs, familyPrefs, helperMode, adults, kids)` — `useWeeklyMenu.ts:791-1347, 1450-1714` |
| **评分函数** | `scoreDish(dish, profile, humidity, solarTerm, prefScores, spiceBoost, hasXiaomei, mealTime)` — `useSupabaseMenu.ts:775-1004`；**归一化 5 轴**：hometown×0.30 + goal×0.40 + taste×0.30，再叠加 originBase / season / 节气 / kid bias / wholegrain / dinner-heavy 罚分 / LEARNED_WEIGHT 动态 0.35→1.50（confidence-scaled 30 信号） | `scoreForWeek({ dish, profile, prefScores, recentIds, pickedIngredients, pickedTitleKeywords, dayIndex, spiceBoost, ageGroup, healthPrefs, helperMode, hasPregnant })` — `useWeeklyMenu.ts:525-686`；**纯加法**：originBase + hometownMatches +0.60 + goal +0.35 + taste +0.25 + power curve(各 tag 0.6×) + 同食材跨日罚 -0.55 × N + 同类跨日 -0.30 × N + recency 衰减 -0.60/-0.35/-0.15 + 标题关键词 -0.65 × N + 周末/工作日 cat bonus + age mods + 健康偏好 + helper level penalty + pregnancy + **intent bias** + season + 快餐罚 -0.15 + 西餐高端 bias |
| **allergen 过滤** | **硬过滤**：`hardFilter(pool, avoidTags, avoidIngredients, vegetarianOnly)` — `useSupabaseMenu.ts:618-652`；同时检查 `ALLERGEN_TO_INGREDIENTS` map（`useSupabaseMenu.ts:607-616`），命中 main_ingredient 直接剔除 | **软过滤**：DB 端只剔 `avoidTags`/`avoidIngredients` 简单 union（`useWeeklyMenu.ts:1571-1587`，无 ingredient-fallback set）；评分阶段对 `familyPrefs.allergyMembers` 用 `dishTriggersAllergy` 检测，超过 `maxAllergenDishesPerDay`（默认 1）就 -1.5，未超则 -0.20（`useWeeklyMenu.ts:896-898, 1011-1025`） |
| **cuisine 过滤** | `applyCuisineFilter(dishQuery, cuisineMode)` 推到 PostgREST — `useSupabaseMenu.ts:1614`；参数来源是 `useRecommendDishes` 的 hook 参数（Home 当前 cuisineMode state） | `applyCuisineFilter(poolQuery, loadCuisineMode())` 同一函数 — `useWeeklyMenu.ts:1560`；参数来源是 localStorage（`loadCuisineMode()`） |
| **采样 / 排序** | 三段式：① 全量按 score 倒序，② `topPool = scored.slice(0, max(25, dishCount*4))`，③ `weightedRandom(topPool, drawCount)` — `useSupabaseMenu.ts:1672-1678`；之后丢进 template；`weightedRandom` 定义在 `useSupabaseMenu.ts:585-605` | 逐 slot 评分 → `.sort` → `.slice(0,25)` → `weightedRandom(allCandidates, 1)` 拿单道（`useWeeklyMenu.ts:1089-1094, 1270, 1312`）；每选一道把 `usedIds / dayIngredients / dayCookMethods / dayTitleKeywords / pickedTitleKeywords / weeklyCatCounts` 全更新，下一道在更新后的状态下重新评；`weightedRandom` 定义在 `useWeeklyMenu.ts:245-266`（**与 useSupabaseMenu 字节完全相同的复制粘贴**） |
| **模板** | 早午晚三模板分流：`applyBreakfastTemplate`（先 `pickBreakfastCombo` 文化组合，失败 fallback 到 dry+wet+side bucket，地区优先）— `useSupabaseMenu.ts:1216-1298`；`applyLunchTemplate`（西餐 staple+soup 2 道收口；中餐 staple+main_protein+veggie+pad，pad 受 `isPadAllowed` 约束）— `useSupabaseMenu.ts:1348-1401`；`applyDinnerTemplate`（staple+main_protein+leafy+soup+pad）— `useSupabaseMenu.ts:1414-1476`；template 用 `pickWithMethodVariety` 做 cook_method 多样性 | 周计划只生成 dinner + lunch；**不生成 breakfast**（早餐由 page 端独立走 `pickBreakfastCombo`，见 `src/pages/WeeklyMenu.tsx:70-88, 477-481` 和 `src/pages/Home.tsx:489-519`，构成 **第三条** breakfast 路径）。Dinner slot 用 `SLOT_PREFERRED_CATS` 20-slot 模板（`useWeeklyMenu.ts:750-771`）+ STAPLE_SLOT=4 + `CARB_BLOCKED_SLOTS`；Lunch 用 `lunchPlan = { staple, veggie, meat, soup }`（`useWeeklyMenu.ts:1176-1199`），分四个 pool sub-score 再 sequential pick |
| **缓存层** | **纯 localStorage / 1 天 TTL**：key = `home_menu_<userId>_<today>_<mealTime>_<cuisine>_<adults>_<kids>_<vegan>_<prefsHash>` — `useSupabaseMenu.ts:1500-1514`；写入 `home_menu_picks_<userId>_<today>` 做 lunch↔dinner cross-meal dedup（`useSupabaseMenu.ts:1622-1632, 1720-1728`）；**没有** DB 持久化，**没有** ALGO_VERSION 概念，全靠 `prefsHash` 自然失效 | **两层 + 哨兵**：① DB `user_weekly_menus`（`useWeeklyMenu.ts:1351-1399, 1693-1700`），② localStorage 键 `weekly_menu_<ALGO_VERSION>_<weekStart>_p<dpd>_c<cuisineKey>_e<eatingKey>_i<intentKey>...`（`useWeeklyMenu.ts:185-216`），③ **两个 sentinel**：`weekly_menu_algo_ver` + `weekly_menu_db_cache_key`（`useWeeklyMenu.ts:1486-1490, 1652-1653`）；DB cache 在 sentinel 失步时即吐陈旧菜单（Smell 4） |
| **粥 / 稀饭** | 早餐保留，午晚硬过滤："P1 — strip 粥/稀饭 from lunch + dinner pools (mirrors useWeeklyMenu.ts:812)" — `useSupabaseMenu.ts:1642-1650` | 在 `generateWeekPlan` 入口对整个 pool 一次性过滤掉粥/稀饭（`useWeeklyMenu.ts:806-815`），且在 dinner 候选评分再做一次 title 包含 check（`useWeeklyMenu.ts:918-922`）。WeeklyMenu 的早餐由 `src/pages/WeeklyMenu.tsx` 独立 pool 拉 `meal_type='breakfast'`，对粥的处理完全在 `pickBreakfastCombo` / breakfast 数据里决定 |
| **Intent 接入** | **无**。`useSupabaseMenu` 全文件没有 import `intentBias` / `parseIntent` / `applyIntentBias`；Home 上敲"想吃辣的"不影响 `useRecommendDishes` 的输出 | **有**：`import { loadIntentBias, applyIntentBias, getIntentHash }` — `useWeeklyMenu.ts:26`；evaluation 在 `scoreForWeek` 第 661 行（`score = applyIntentBias(score, dish, loadIntentBias())`）；cacheKey 把 `getIntentHash()` 包进来（`useWeeklyMenu.ts:192, 215`） |
| **per-member 分配** | **无**。Home 不读 `familyPrefs.homeMembers`，全家共用一份评分 | **有**：`memberMainSlots`（`useWeeklyMenu.ts:881-894`）把晚餐 main slot 0/1 各分到一名家庭成员，评分时 `score += familyGoalScore(d, memberWeights, ...) * 1.5`（`useWeeklyMenu.ts:998-1009`）；午餐 meatPool 同样按成员二次评分取 top（`useWeeklyMenu.ts:1285-1321`） |

附补充事实（重要但不在主表里）：

- **同日 title-keyword 硬去重**：仅在 `useWeeklyMenu`（`dayTitleKeywords` + `extractTitleKeyword`，`useWeeklyMenu.ts:870-916`）。`useSupabaseMenu` 没有，靠 cross-meal localStorage dedup（按 ID）实现，是不同维度的去重。
- **per-day headcount**：`useWeeklyMenu` 读 `getDayHeadcount(dayIndex)` / `getEatingMembersForDay`（`useWeeklyMenu.ts:127-159, 857-866`），可以做"周三两口子"的微调；`useSupabaseMenu` 只接受 hook 参数级的 adults/kids，不知道哪一天。
- **fruit 兜底 slot**：仅 `useSupabaseMenu` 在 lunch/dinner 末尾追加（`useSupabaseMenu.ts:1690-1716`），按节气挑当日水果。WeeklyMenu 自身的 day.dishes 里不带水果——Home 之所以在用 weeklyMenu 时还能显示水果，是因为 `Home.tsx:524, 551, 560` 从 `recommendedDishes` 摘 `course_type='fruit'` 那一道补到 weekly 输出后面。
- **weightedRandom 完全副本**：两份代码字节级一致，目前没有共享。

---

## 2. 哪些 Smell 来源于"两套都跑"

按"差异维度 → 已知用户可见问题"逐条对应。

| 现象 | 出自哪个维度差异 | 触发条件 |
|------|------------------|----------|
| **同一道菜在 Home / WeeklyMenu 评分不同** | 评分函数完全不同（5 轴归一化 vs 加法、power curve 系数不一样、recency / 同食材跨日跨菜单状态只有 WeeklyMenu 有） | 任何用户每天打开 Home（午/晚 tab）都同时拉到两份排序，UI 端再二选一显示 |
| **算法负责人调 scoreDish 的某条规则，WeeklyMenu 不跟进** | 评分函数维度 + 学习权重维度独立；`hometownMatches` 在 useSupabaseMenu 加 +0.30，在 useWeeklyMenu 加 +0.60；季节 bonus 两边都各写一遍，下次任何一边动都得手抄 | 任何评分调整 |
| **algo 变更后 Home 立刻刷新但 WeeklyMenu 还吃 7 天旧菜单** | 缓存层维度：Home 走 prefsHash 自然失效，WeeklyMenu 走 ALGO_VERSION + 两 sentinel 三态匹配，且 DB 里再有一份长期持久化 | bump ALGO_VERSION 时 sentinel 失步 |
| **同一天 Home 显示菜 A，WeeklyMenu 显示菜 B** | 采样/排序维度：Home 取 top-25 一次 weightedRandom 出 dishCount\*4 候选给 template；WeeklyMenu 逐 slot 单次 weightedRandom 取 1 道，且累积状态参与下一道评分 | Home 没 fall back 到 weeklyMenu.days[todayIdx] 时（早餐永远；午晚在 weeklyLoading 或周末或 weekly 该天没有 row 时）会发生 |
| **粥泄漏进 dinner（CLAUDE.md 记载过）** | 粥维度本身两边都各加了过滤，但 useSupabaseMenu 注释明写"mirrors useWeeklyMenu.ts:812" —— "规则只加到一侧" 已经修复，但**修复方式是手动对齐**，下次添加新过滤词（比如要禁 米线 / 凉茶）会再次出问题 | 任何新增 banned title keyword |
| **Home 上敲"想吃辣的"没反应** | Intent 接入维度：useSupabaseMenu 完全没接 intentBias，Home 用 useRecommendDishes 走早餐 / 午晚 fallback 时 intent 被无声忽略 | 用户在 `IntentRegenModal` 提交意图后立刻看 Home 早餐 / 周末 Home / weeklyMenu 还在 loading 时的 Home |
| **per-member（备孕 + 增肌）家庭打开 Home 看到的菜没有 1.5× 放大** | per-member 维度：useSupabaseMenu 不知道 homeMembers | weeklyMenu loaded 之前的首屏渲染、早餐 tab、周末 |
| **同日两道娃娃菜在 Home 早餐 / 早午餐切换时出现** | 同日 title-keyword 维度只在 useWeeklyMenu 有；useSupabaseMenu 只做 ID dedup | 早餐 + 餐后水果 tab 切换之间 |
| **算法负责人审 PR 时不知道改 scoreDish 还是改 scoreForWeek** | 整个维度耦合矩阵 ↑ | 每次评分微调 |

---

## 3. 合并可行性判断

三个方向，分别评估改动量、风险、对 ALGO_VERSION 的影响。

### 方向 A — Home 永远 fallback 到 `weeklyMenu.days[todayIdx]`，删除 `useRecommendDishes`

**改法骨架**：
1. 在 Home 启动时无条件 await `useWeeklyMenu()`，等 weeklyMenu 渲染完成才显示菜单卡片。
2. 早餐：删除 Home 端独立 breakfast pool（`Home.tsx:489-519`），改用 `weeklyMenu.days[todayIdx].breakfastDishes`（需要在 `generateWeekPlan` 新增 breakfastDishes 输出）。
3. 删除 `useRecommendDishes` + `scoreDish` + `applyBreakfastTemplate/Lunch/Dinner` + `hardFilter`（`useSupabaseMenu.ts:585-1476` 大约 880 行，连带依赖）。
4. 水果 slot 迁移到 `generateWeekPlan` 输出。

**风险**：
- 首屏体验：当前 Home 在 weeklyMenu 还没生成时（首次进 app / 缓存失效 / 周一切到新周）会显示 `useRecommendDishes` 的当日菜，作为"先看到菜"的占位。删了之后用户首次进 app 会看到 spinner 而不是菜——这是产品体验的硬退步。
- 周末：`generateWeekPlan` 主动 `if (dayIndex >= 5) continue`，周末菜单空。Home 周末本来靠 `useRecommendDishes` 实时生成一份"外食前的对照"，删了就要明确给个"周末请外食"的空状态。
- 早餐第三路径（page 端独立 `pickBreakfastCombo`）也得一起合并进 `generateWeekPlan`，否则 Home / WeeklyMenu 切到周二早餐时仍可能不同步（一处读最新 breakfastPool，一处读缓存）。

**预估改动量**：`-880` 行（删 useRecommendDishes 链）；`+200` 行（generateWeekPlan 增 breakfast + 周末分支）；`+80` 行（Home loading / 空态 UI）；接触 `useSupabaseMenu.ts` / `useWeeklyMenu.ts` / `Home.tsx` / `WeeklyMenu.tsx` / `IntentRegenModal.tsx` / `lib/breakfastCombos.ts`，约 **6 个文件、净 -600 行**。

---

### 方向 B — 保留 `useRecommendDishes` 做"单日推荐"，WeeklyMenu 改成 7 次调用 `useRecommendDishes`

**改法骨架**：
1. `generateWeekPlan` 退化为 `for (i = 0..4) callRecommend('午餐', dayContext) + callRecommend('晚餐', dayContext)`。
2. `scoreDish` 增加 `recentIds / pickedIngredients / pickedTitleKeywords / weeklyCatCounts` 形参（跨日去重必须靠累积状态）。
3. 把 `applyIntentBias / loadIntentBias` 接入 `scoreDish`。
4. 把 `memberMainSlots` + 1.5× 放大移植到 `scoreDish`。
5. 删除 `scoreForWeek`、`SLOT_PREFERRED_CATS`、generateWeekPlan 的 slot 循环。

**风险**：
- weightedRandom + sort-then-template 在"同一天 5 道菜不冲突"上没问题（template 内部做去重），但放到"7 天 35 道菜不重复"维度，template 不知道前 6 天选了什么。要把 SLOT_PREFERRED_CATS 的"slot 1 海鲜 / slot 4 主食"硬约束让位给 template 的 staple/main_protein/veggie/soup 抽象——两者的细分粒度不一样，会丢失"周一周三必有海鲜"这条已经在 `getMaxPerCategory` 表里固化的产品规则。
- DB 持久化 + 哨兵这一层得保留，但要让它跨 7 次 `useRecommendDishes` 调用保证一致——意味着 `useRecommendDishes` 本身要被外部状态污染，破坏当前的"hook 自治"假设。
- 这条路径**实际上是 A 的镜像**，只不过把"删除"换成"逆向移植"，工作量更大。

**预估改动量**：`scoreDish` 从 230 行扩到 ~400 行；删 `scoreForWeek` + slot loops（~600 行）；加 7-day driver + 全局状态结构 ~150 行；约 **3 个核心文件、净 -200 行**。

---

### 方向 C — 拆出共同核心 `scoreDishCore` + `sampleCore`，两个 hook 各自的"模板逻辑"留着

**改法骨架**：
1. 新建 `src/lib/scoring/core.ts`，输出 `scoreCore({ dish, profile, prefScores, contextFlags })` 抽出两边都跑的：originBase / hometownMatches / dietary_goal / taste / age mods / season / westernHighEndBias / power curve / quick-FAST_FOOD_TITLE_HINTS。
2. `scoreDish` 和 `scoreForWeek` 都改成 `return scoreCore(...) + axisSpecificExtras(...)`。`scoreForWeek` 的 axisSpecificExtras 保留 recency / 同食材跨日 / 标题关键词 / 周末 weekday cat / intentBias / pregnancy / helper；`scoreDish` 保留 5 轴归一化的 0.30/0.40/0.30 系数（或迁到 core）+ humidity / solarTerm / 小美 / kid bias / wholegrain / dinner heavy。
3. 模板层不动；缓存层不动；slot/template 业务规则各自保留。

**风险**：
- 抽象代价：`scoreCore` 一旦稳定，绝大多数"行为漂移"问题被消灭（hometown / power curve / season / westernBias 一次改两边都改）；但**仍然有两条评分链跑**，逻辑差异（5 轴归一化 vs 加法、recency 只有一边、intentBias 只有一边）依旧存在。Smell 1 没被根治，只是被压扁。
- 测试覆盖：抽核心意味着必须给 `scoreCore` 写单测，否则两边都把 bug 共享。当前仓库无单测脚手架，引入测试需要后端 / Architect 一起拍板。

**预估改动量**：新增 `scoring/core.ts` ~250 行；`scoreDish` / `scoreForWeek` 各 -100 ~ -150 行；约 **3 个文件、净 -50 行**。

---

### 我的推荐：方向 A，分两阶段落地

**为什么 A 而不是 B / C**：
- B 把 `useRecommendDishes` 升级成"周维度"会撕掉它"按 hook 参数即时返回"的简单契约，且要把 SLOT_PREFERRED_CATS 这种"slot 1 海鲜"的产品强约束改造成 template 抽象——产品规则会丢精度。
- C 短期收益不错，但不解 Smell 1 的根本（两条链仍跑），下一次需求来了还是要再选 A 或 B；与其分两次重构，不如一步到位。
- A 的最大风险是"Home 首屏在 weeklyMenu 未生成时没菜可看"，但这恰好是当前架构的核心痛点：两个算法跑出来的菜不同时，用户先看到 Home 算法的菜，3 秒后切到 WeeklyMenu 的菜——**这种瞬时漂移本身就是 Smell 1 的可见症状**。统一后用户在所有入口看一致内容，是产品体验的实质改善。

**两阶段落地建议**：
1. **阶段 1**（v37 → v38，~1 个 sprint）：保留 `useRecommendDishes` 但**完全停止从它读午晚菜单**——Home 午/晚 tab 永远渲染 `weeklyMenu.days[todayIdx]`，weeklyMenu 仍在生成时显示 skeleton，不再切到 `recommendedDishes`。`useRecommendDishes` 仍保留以提供水果 slot + 早餐 fallback。这一阶段不动 ALGO_VERSION（评分逻辑没变），只验证 UX。
2. **阶段 2**（v38 → v40，~2 个 sprint）：把 breakfast 生成 + 水果 slot + 周末空态全部并入 `generateWeekPlan`，删除 `useRecommendDishes`、`scoreDish`、模板族。此时评分 / 模板 / 缓存全统一，bump ALGO_VERSION。

---

## 4. ALGO_VERSION 影响

合并方案任意一个落地，dinner / lunch 用户感知的菜单都会变（评分系数即使保持，去掉 `useRecommendDishes` 这条链后 Home 当日菜会从两路 OR 切到单路）。

**建议跳号到 `v40`**，不是 v38。理由：

- **v37 → v38** 通常意义是"一条小规则微调"。本次合并是评分函数的整体替换 + 模板归一 + 缓存层重组，跳号能给人"这次更新有破坏性"的视觉信号，避免 ops / 数据团队按"小版本"的 SLA 处理灰度。
- **跨过 v38 / v39 的空档**留给方向 A 的两阶段：阶段 1 不改评分时维持 v37（甚至升 v37a/v37b），阶段 2 落地时一次性跳到 v40。这样 sentinel `weekly_menu_algo_ver` 看到 v37 → v40 直接判旧版重生，不会被 v38、v39 中间态污染。
- 与数据库负责人协商的 `algo_version` 列（Smell 4 根治）落地，v40 是干净的起点：表里所有 row 都带 v40 字段，老 row 一律重生成。

**合并落地瞬间副作用**：
- 所有 `user_weekly_menus` 行被判 stale，下一次 `useWeeklyMenu` mount 重新生成（已有 sentinel 机制兜底）。
- 所有用户的 `home_menu_*` localStorage cache 失效自然失效（key 含 date，第二天自动清理），方向 A 删除 hook 后会一起被遗忘。
- 用户当下打开 app 会看到一份"新菜单"——产品 / Architect 必须事先决定是否需要前置公告。

---

## 5. 跨部门接口

| 需要 | 找谁 | 时点 |
|------|------|------|
| `user_weekly_menus` 表加 `algo_version text` 列（Smell 4 根治） | 数据库负责人 | 方向 A 阶段 2 之前 |
| `generateWeekPlan` 输出 breakfastDishes 字段后，DB 持久化要不要写一份 breakfast 行 | 数据库 + 后端负责人 | 方向 A 阶段 2 |
| `IntentRegenModal` 的 trigger 事件能不能仅 dispatch 一次（避免两个 hook 各 regen 一次） | UI 负责人 | 阶段 1 |
| ALGO_VERSION bump 前的灰度策略（按 user_id 散列 10% 先吃新版） | Architect | 阶段 2 上线前 |

---

## 6. 一句话总结

Smell 1 不是"两个评分函数差几行"那么轻——是"评分函数 / 采样 / 缓存 / 粥处理 / intent / 同日去重 / 跨日去重 / per-member / breakfast 路径"九个维度全发散，且 breakfast 还藏着第三条 page 级路径。方向 A 净删 600 行 + 重构 Home 首屏体验是唯一根治路径，方向 B 是 A 的镜像更费力，方向 C 只是把痛压平、不解根。建议按方向 A 两阶段，最终在 v40 落地，配合数据库负责人加 `algo_version` 列彻底解决缓存哨兵失步。
