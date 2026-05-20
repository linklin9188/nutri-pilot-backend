# SPEC_smell1_phase3.md — Smell 1 阶段 3：跨日 dedup + fruit axis + breakfast 主路径合并

> 状态：草稿（TICKET-20260520-031 §B 起草）
> 作者：Algorithm（Day 5 中段）
> 前置：Smell 1 阶段 2 (v40) 已合并 Home / WeeklyMenu 双引擎到 generateWeekPlan；阶段 3 完工 bump v41 → v42
> 关联：TICKET-015 (v40 阶段 2 + 9-axis) / TICKET-025 (axis 27 节庆) / TICKET-031 §A 飞轮 e2e

---

## §0 一句话目标

把 generateWeekPlan 当前还残留的 **3 处旁路** 全部并入主评分流（scoreForWeek 27 axis），让 breakfast / lunch / dinner / fruit 共用同一组学习信号（prefScores + sigmoid + 9-axis），并把 title-keyword 跨日 dedup 从软扣升级为 hard-block。

---

## §1 现状盘点（三处 inconsistency 实测）

### §1.1 跨日 title-keyword dedup —— 软扣不够硬

**位置**：`src/hooks/useWeeklyMenu.ts` scoreForWeek axis 9 (line ~616-623)

```ts
const titleKw = extractTitleKeyword(dish.title_zh ?? dish.title ?? '');
if (titleKw) {
  const kwCount = pickedTitleKeywords.filter(k => k === titleKw).length;
  score -= kwCount * 0.65;
}
```

**症状**：
- 同日内：`dayTitleKeywords` 在 candidate filter 阶段 hard-block（line ~914-916），不会同日两个"排骨"
- 跨日：仅 `-0.65 × count` 软扣。2 次重现累计扣 1.30（仍可能进 top 25 候选 + weightedRandom 选中），用户在周一 + 周三都看到"排骨菜"
- 用户实测案例（CEO 反馈 2026-05-19）：单周菜单出 2× 鸡腿 + 2× 排骨 的情况偶发

**结论**：跨日 dedup 强度不足。

### §1.2 fruit 独立 slot —— 不参与 9-axis

**位置**：`src/hooks/useWeeklyMenu.ts` generateWeekPlan fruit 选择（line ~1467-1483）

```ts
const fruitDish: SupabaseDish | undefined = (() => {
  if (fruitPool.length === 0) return undefined;
  const seasonalCol = solarTerm?.season;
  const seasonal = seasonalCol
    ? fruitPool.filter(f => f.seasonal_tag === seasonalCol || f.seasonal_tag === 'all-season')
    : fruitPool;
  const pickFrom = seasonal.length > 0 ? seasonal : fruitPool;
  const idx = dayIndex % pickFrom.length;
  const raw = pickFrom[idx];
  return raw ? enrichRaw(raw) : undefined;
})();
```

**症状**：
- fruit 只按 `dayIndex % pickFrom.length` 旋转 + 节气过滤
- **不读** prefScores → 用户给 mango 点 rating_good 10 次，下周 fruit 仍然 round-robin 给苹果
- **不读** profile.hometown / 9-axis 任何一个 → 学习数据完全不传递到 fruit
- **不命中** axis 26 inventory / axis 27 festival（即使 fruit 配 festival_tags）

**结论**：fruit 与主菜走完全不同评分链，学习/库存/节庆通通不生效。

### §1.3 breakfast 第三独立路径 —— pickBreakfastCombo 不调 scoreForWeek

**位置**：`src/lib/breakfastCombos.ts` + generateWeekPlan breakfast 选择（line ~1448-1465）

```ts
const breakfastDishes: SupabaseDish[] = (() => {
  if (breakfastPool.length === 0) return [];
  try {
    const result = pickBreakfastCombo({
      pool: breakfastPool as any,
      dayIndex,
      hometown: profile.hometown_cuisine,
      avoidIngredients: [],
      avoidTags: [],
    });
    return (result.dishes ?? []).map((d: any) => enrichRaw(d));
  } catch { return []; }
})();
```

**症状**：
- pickBreakfastCombo 是 hometown-旋转 **模板** picker：从 BREAKFAST_COMBOS 中按 hometown 选预定义 combo（粤式 / 江南 / 北方 / 川式 ...），再从 pool 找 slot 候选
- **不读** prefScores / 9-axis 任何一个；学习数据 / sigmoid / xiaomei / humidity / solarTerm / festival / inventory 全部不传递到早餐
- pickBreakfastCombo 内部仅 hometown filter，输出对用户使用反馈完全免疫
- "使用数据 > 画像数据" 原则（CLAUDE_ALGORITHM.md §核心原则）在早餐链路上断裂

**结论**：breakfast 是 9-axis + sigmoid 学习架构外的孤岛。

---

## §2 目标（阶段 3 完工后状态）

```
generateWeekPlan 主路径输出全周 days[]，每天:
  breakfast (combo template + scoreForWeek 二次排序)
  lunch     (scoreForWeek 主路径)
  dinner    (scoreForWeek 主路径)
  fruit     (scoreForWeek 主路径，专用 mealTime='fruit')

scoreForWeek 升级:
  ☑ axis 9 title-keyword dedup：跨日命中 hard-block（filter 阶段剔除，
    不再仅 -0.65 软扣）
  ☑ 新 axis 'mealTime=fruit' 分支：fruit 不再单独旋转，按 9-axis 评分
  ☑ pickBreakfastCombo 调用层加 scoreForWeek 二次排序（combo 选完后，
    每个 slot 候选按 scoreForWeek 排序取 top）
```

**一致性目标**：所有 4 类菜（早 / 午 / 晚 / 水果）共享同一 prefScores 学习信号、同一 sigmoid weight、同一 inventory / festival / xiaomei / humidity / solarTerm 信号。

---

## §3 实施分 3 commit（建议顺序）

### §3.1 commit 1 — 跨日 dedup hard-block

**改动**：
1. `scoreForWeek` 加入参 `weeklyTitleKeywords: Set<string>` 用作 hard-block 信号
2. `generateWeekPlan` 在 dinner / lunch / kid 主循环之前，把 `pickedTitleKeywords` 转 `new Set()` 维护跨日累积；候选 filter 阶段加 `if (weeklyTitleKeywords.has(kw)) return false`
3. 保留原 -0.65 软扣（兜底，避免 hard-block 过严时无候选）：先 hard-block；若 candidates 数 < N（如 < 3），降级为软扣

**风险**：
- pool 不够大时 hard-block 可能让某天 slot 空（如周四的"鸡腿"被周一吃过 → 周四 main_protein 候选变少）
- 已有 fallback：candidates 不足时 candidates 数 < 阈值，整周生成失败的应急路径

**估改动**：+30 / -5 行

**commit message**：`feat(algo): cross-day title-keyword hard-block in scoreForWeek candidates`

### §3.2 commit 2 — fruit 进 9-axis

**改动**：
1. `scoreForWeek` 加 `mealTime: '早餐' | '午餐' | '晚餐' | 'fruit'` 类型扩展
2. mealTime='fruit' 时跳过/简化部分 axis（如 axis 12 helperMode / axis 16 FAST_FOOD damp 等不适用于水果）
3. `generateWeekPlan` 内替换 fruit 旋转逻辑为：`weightedRandom(fruitPool.map(scoreFruit), 1, rng)`
4. 保留节气优先（仍 filter 当季 fruit pool）
5. 新增 prefScores 列 `pref_fruit_<seasonal_tag>` 让水果学习可观测（**需 Database migration**：列名扩展；本 commit 暂不依赖，仅用 flavor_tags / health_benefit_tags 同列）

**风险**：
- mealTime='fruit' 路径在 scoreForWeek 内有 ~5 个 axis 需要禁用 / 短路（如 axis 25 周五 deep_fry 对水果无意义），增加 axis 间分支逻辑
- pre-existing 测试若 hardcoded mealTime 为 3 类，会破

**估改动**：+50 / -15 行

**commit message**：`feat(algo): fruit pool through scoreForWeek (mealTime='fruit') instead of round-robin`

### §3.3 commit 3 — breakfast 二次排序合并 + bump v42

**改动**：
1. pickBreakfastCombo 返回 combo + slot.candidates list（不动 lib/breakfastCombos.ts 主体），保留 hometown 模板筛选
2. generateWeekPlan 在 pickBreakfastCombo 返回的 dishes 上**再跑** scoreForWeek（mealTime='早餐'）排序，每 slot 取 top-1（而不是 first match）
3. bump `ALGO_VERSION` 'v41' → **'v42'**

**风险**：
- pickBreakfastCombo 模板逻辑保留（不破 hometown 早餐文化），仅 candidate ordering 升级
- BREAKFAST_COMBOS 中某些 slot 候选只有 1 个 → scoreForWeek 无重排空间，无效但安全
- v42 触发全用户 user_weekly_menus stale → 强制重生成（按 Smell 4 双列校验，预期行为）

**估改动**：+25 / -5 行

**commit message**：`feat(algo): breakfast 9-axis scoring on combo candidates + ALGO_VERSION v42`

---

## §4 ALGO_VERSION 决策

| commit | 改动性质 | bump? |
|--------|---------|-------|
| C1 跨日 dedup hard-block | 改候选 filter 语义（之前能进的 dish 现在 hard-block） | 不单独 bump（与 C3 一起） |
| C2 fruit 进 9-axis | 改 fruit 选择算法（旋转 → 评分采样） | 不单独 bump |
| C3 breakfast 二次排序 + **bump v42** | 改 breakfast slot candidate 排序 | **bump v41 → v42** |

**理由**：三处改动语义都改了采样结果，但分别 bump 会让用户菜单 3 次 stale 重生成。按 TICKET-015 §C 决策同口径——**收尾 commit 统一 bump**，避免 cache churn。

---

## §5 影响范围 + 回滚方案

### §5.1 影响范围

- **用户体验**：全 user 当周菜单一次 stale 重生成；breakfast 不再纯 hometown 模板，可能首次出现"川菜口味用户但 prefScores 偏粤" → 早餐变粤式（属于功能正确，非 bug）
- **缓存**：user_weekly_menus 4 类 meal_type 全部 stale；localStorage `weekly_menu_<ALGO_VERSION>_*` key 自动失效
- **下游**：VerifyIngredients.tsx 自动跟随 ALGO_VERSION import（不变量 #4 守住）
- **Backend**：edge functions 不需改动
- **Database**：本阶段 v42 不需要新 migration；可选 P10 加 `pref_fruit_*` 列让水果学习独立可观测

### §5.2 回滚方案

**回滚级别 A — 全阶段 3 回滚**：
```bash
git revert <C3-hash> <C2-hash> <C1-hash>
# bump ALGO_VERSION 'v42' → 'v43'（让 cache 再次 stale 重生成回到 v41 等价语义）
```

**回滚级别 B — 单 commit 回滚**：
- C1 / C2 / C3 都是独立 commit，可单点 revert
- 仅回 C3 即 ALGO_VERSION 降到 v41 但 C1/C2 改动仍在 → 不一致状态；不推荐

**回滚级别 C — feature flag**：
- 本 SPEC **不推荐**飞行中 feature flag。原因：
  1. 飞行中 flag = 两套评分链并存 = 重新引入 Smell 1
  2. 阶段 3 完工后，pipeline 是单一 generateWeekPlan，已达成 Smell 1 修复目标
- 若 production 真出 blocker：走 A 级整体回滚 + 起新 ticket 修问题

### §5.3 兼容性矩阵

| 客户端版本 | DB ALGO_VERSION | 行为 |
|-----------|-----------------|------|
| 老前端 (v41 bundle) + 老 DB (v41 rows) | v41 | 正常（阶段 2 行为） |
| 老前端 (v41) + 新 DB (v42 rows) | v41 ≠ v42 → stale | 老前端走 generateWeekPlan 重生成，写回 v41 rows（DB 短时间内 v41/v42 混存，无问题） |
| 新前端 (v42) + 老 DB (v41 rows) | v42 ≠ v41 → stale | 新前端重生成，写回 v42 rows |
| 新前端 (v42) + 新 DB (v42 rows) | v42 | 正常（阶段 3 行为） |

---

## §6 待办（实施阶段 3 时核对）

- ☐ 实施 C1 前，跑 TICKET-031 §A `scripts/test-feedback-loop.ts` 确认 v41 baseline 数据飞轮工作正常
- ☐ C1 实施时，加 candidate 数 < 阈值兜底降级到软扣
- ☐ C2 实施时，先 grep `mealTime ===` 看所有 hard-coded '早餐'/'午餐'/'晚餐' 三分支 → 扩 'fruit' 不漏
- ☐ C3 实施时，VerifyIngredients.tsx 不动（自动跟 ALGO_VERSION）
- ☐ 三 commit 后联合跑 vite build × 3，每条 0 error
- ☐ 完工 NOTES 附 `algo-coverage.ts` / `algo-e2e-by-hometown.ts` 模拟输出对比表（阶段 2 vs 阶段 3 同 user 同周 menu）

---

## §7 非目标（明确不做）

- 不做 breakfast 跨日 dedup（早餐重复模式是中国家庭文化，连续两天 油条+豆浆 是正常的）
- 不做 fruit pool 跨日 dedup（水果池小，且当季水果有限，强制 dedup 会让选择面塌缩）
- 不重写 pickBreakfastCombo 内部 hometown 模板（保留文化锚定）
- 不引入新 wellness 轴 / 不动 intentBias / 不动 familyPrefs（这些是其他 Smell 范围）
