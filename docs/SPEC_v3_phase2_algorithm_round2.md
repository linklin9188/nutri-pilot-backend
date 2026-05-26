# SPEC — v3 Phase 2: 算法二次优化（v45 → v46）

> Phase 1 v45 ship + β 1 周真用户数据后实施。
> 详 Algorithm 074 SPEC 内容（telepot_algorithm.md 派单时直接 reference 本文档）。

## 二次优化目标

Phase 1 v45 是 "用图片 onboarding 输入 + 9 axes 评分" 的初版。Phase 2 需要：

1. **数据驱动调权** — β 1 周看哪些 axis 真预测，哪些是噪音
2. **多目标 / 多 hometown 广度求和** — 之前 head [0] 单值，扩到数组求和
3. **collaborative filtering 加权** — 其他相似用户喜欢的 + 0.15
4. **fatigue 衰减优化** — 同一道菜 7 天内重复 -0.30 改 -0.50 + smoothing
5. **family_member level 评分** — 不只是雇主 prefs，孩子年龄段 / 老人慢病 单独打分

## 详细算法改造

### §A. 多目标 / 多 hometown 广度求和

```ts
// 当前 (v45): 单值取 [0]
const goalScore = axisGoal(dish, prefs.dietary_goal[0]) * 0.15;

// v46: 数组广度求和
const goals = prefs.dietary_goal_arr || [prefs.dietary_goal];
const goalScore = Math.max(...goals.map(g => axisGoal(dish, g))) * 0.15;
// max 而非 sum，避免多目标累积爆分
```

同样 hometown / protein_pref / beef_style 等数组字段全部加 max 处理。

### §B. Collaborative Filtering 信号

```ts
// 找 "相似用户" — protein_main_class + oil_level 一致的其他用户
// SELECT 他们最爱的 top 20 菜 (出现在 user_weekly_menus 且未被换菜)
// 这 20 菜 → +0.15 加权

function getSimilarUserBoost(dish, prefs) {
  const similarUserFavs = await fetchSimilarUserFavs(prefs); // 缓存 7 天
  return similarUserFavs.has(dish.id) ? 0.15 : 0;
}
```

需要：
- 新 edge function `similar-user-favs?protein_class=X&oil=Y`
- 缓存 7 天 (Supabase Storage 或 in-memory)

### §C. Fatigue 衰减优化

当前：dish 7 天内出现过 → -0.30 hard penalty

v46：smoothing penalty 按天数衰减
```
day_since_last  penalty
0               -0.50
1               -0.40
2               -0.25
3               -0.10
4+              0
```

### §D. Family member level 评分

当前 Q0 餐桌画面拿到家庭结构（人数 / 中西 / 复杂度），v46 把这些 cascade 到每个 dish 评分：

- 餐桌 family_4 + 有孩子 (Q0 推断或后续 family_composition) → 加权"长高菜"+0.10
- 餐桌 western + 西餐偏好 (Q9) → 西餐 dishes +0.15
- 餐桌 big_round + 6+ 人 → 大菜 (含 "煲" / "炖") +0.10

### §E. bump ALGO_VERSION v45 → v46

cache 全 invalidate，β 用户重新生成菜单（应该新菜单显著优于旧）。

### §F. 验证

跑 β 真用户数据：
- 100% 用户的 7 天菜单 distinct hash = 100/100（个性化保持）
- 周菜单换菜率从 X% → Y%（应降，因为推荐更准）
- 用户 feedback rollup 中 thumbs_up rate 从 X% → Y%（应升）

## 派单时机

1. Phase 1 v45 ship 完
2. 等 β 1 周（5-10 用户真用过 7 天）
3. CEO 跑数据分析（哪些 axis 真预测）
4. 派 Algorithm 074 实施 §A-§E
5. 60-90 分钟 ship + bump v46

## 风险

- 改算法 → user_weekly_menus 全 invalidate → β 用户菜单换一波（应该好但有体验中断）
- collaborative filtering 早期数据稀疏（β 50 用户 × 7 天 = 350 周菜单不算多）→ 信号弱
- multi-axis 评分调权需要 A/B 测试方法论，β 阶段没 A/B 框架

## 不做事项（v46 不动）

- 不动 v3 onboarding UI（除非数据显示某 axis 完全无效）
- 不动 wechat-jssdk / Cloudflare 基础设施
- 不动 dishes 表 schema（dish 数据扩容 Database 070 做）
- 不动 Stripe / Pricing
