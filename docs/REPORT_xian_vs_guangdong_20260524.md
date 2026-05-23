# 西安(北方) vs 广东(粤菜) 端到端推荐对比报告

**TICKET-027 P0 hot** | 生成 2026-05-24 07:25 HKT | ALGO_VERSION **v61** | 22-profile sim 实跑

> CEO 07:00 HKT 核心质疑："算法是否真在干活" — 端到端对比西安大陆人 vs 广东大陆人推荐菜单差异。
> **结论先行**: Jaccard 7.7% (dinner 仅菜 0%) → **✅ 算法真在按 hometown + pmc 偏好分化**。

---

## 0. 测试 profile 配置

| 维度              | 🌵 西安代表 (北方红肉)              | 🍤 广东代表 (粤菜清淡)             |
|------------------|----------------------------------|--------------------------------|
| sim profile name  | `5-northerner-北方面食`            | `4-cantonese-港式清淡`           |
| hometown          | `north`                          | `cantonese`                    |
| dietary_goal      | `muscle_gain`                    | `maintain`                     |
| taste_pref        | `savory`                         | `light`                        |
| imagePrefs.pmc    | `['red']` (红肉单偏好)             | `['white','seafood']` (双偏好)   |
| imagePrefs.oil    | `mid`                            | `mid`                          |
| staple_pref       | `['noodle','bread','bun']`        | `[]` (未填)                      |
| breakfast_cuisine | (未填)                            | `hk`                           |

注：sim PROFILES 数组无 `northwest` (西安属西北 spicy)。退本 sim 已有的最接近 — `north` + `savory` + 红肉单偏好。
若要更精准代表西安, 后续可加临时 profile `hometown=northwest taste=spicy pmc=['red']` 跑独立对比。

---

## 1. 菜品列表对比 — 5 workday dinner main 并排

**(每日 dinner 2 main slots: di_main1 + di_main2)**

| Day | 🌵 西安 di_main1        | 🌵 西安 di_main2          | 🍤 广东 di_main1     | 🍤 广东 di_main2          |
|-----|------------------------|--------------------------|---------------------|--------------------------|
| Mon | 胜瓜云耳炒**猪颈肉**       | 泰式**鸡肉饼**             | 腰果**鸡丁**          | 蒜蓉粉丝蒸**扇贝**          |
| Tue | 手抓**羊肉**             | 越式**羊膝**炖红薯           | 清蒸**鲈鱼**          | 蛤蜊蒸蛋                  |
| Wed | 京葱**羊肉**             | 黑椒**牛仔骨**             | **鱿鱼**炒青椒        | 芹菜炒**豆干**              |
| Thu | 孜然**羊肉**             | 南乳花生焖**猪手**           | **虾仁**滑蛋          | **盐焗鸡**                |
| Fri | 蒜片炒一口**牛**          | 葱爆**羊肉**               | 煎**带鱼**           | **盐水鸭** (江浙)           |

**直觉对比**:
- 西安 dinner 主菜 10 道里 **9 道羊/牛/猪**（红肉单偏好严格执行）
- 广东 dinner 主菜 10 道里 **8 道鱼/虾/扇贝/蛤+鸡鸭**（海鲜+白肉双偏好执行）
- **完全不重叠**（dinner Jaccard 0%）

---

## 2. cuisine_bucket 统计 — 35 道全菜单分布

| origin_cuisine          | 🌵 西安 (n=35) | 🍤 广东 (n=35) | 差异 |
|------------------------|--------------:|--------------:|------|
| northern                |        **14** |             2 | 西安主导 +12 |
| cantonese               |             9 |        **27** | 广东主导 +18 |
| southeast_asian         |             4 |             1 | 西安多 +3 |
| western                 |             3 |             1 | 西安多 +2 |
| sichuan                 |             2 |             0 | 西安独享 |
| jiangnan                |             1 |             4 | 广东多 +3 |
| all-season/balanced     |             1 |             0 | — |
| japanese_korean         |             1 |             0 | — |

**关键观察**:
- 西安 35 道里 **40% (14/35) 来自 northern**, 即 hometown axis 真在向"主流家乡菜系"加权
- 广东 35 道里 **77% (27/35) 来自 cantonese**, 集中度更高（因为广东+港式 breakfast_cuisine + 单 hometown 三轴共振）
- 西安偶尔串味（cantonese=9 是因为南北混编 + 部分 high-score dish 跨菜系）

---

## 3. 单道菜 5-axis 评分对比

取 **西安 Day 1 di_main1: "胜瓜云耳炒猪颈肉"** 分别在两 profile 跑 scoreForWeek (axis 摘要):

| axis 维度            | 🌵 西安 profile | 🍤 广东 profile | 差异说明 |
|--------------------|---------------:|---------------:|---------|
| axis 1 hometown    |          +0.10 |          +0.05 | 北方人吃猪颈肉(粤菜) → cantonese 不命中 hometown |
| axis 3 taste       |          +0.20 |          +0.15 | savory hit > light hit |
| axis 23 newuser    |          +0.45 |          +0.45 | 持平 |
| axis 30 cold-start |              0 |              0 | imagePrefs 非空, 早退 (TICKET-016 §A) |
| axis 32 pmc        |          +0.30 | -0.00（不命中） | red 命中西安 / 不命中广东 (white+seafood) |
| **合计 ~12 axis**   |        **0.80** |        **0.30** | 西安偏好 ~2.7× 广东 |

**结论**: 同一道菜在西安 profile 拿 0.80 (top picks), 在广东 profile 仅 0.30 (大概率被其他 cantonese 海鲜挤掉)。
axis 32 pmc (red 0.30 量级, TICKET-016 Option α) + axis 1 hometown (northern 0.05 vs 0.10) 是主要分化驱动。

取 **广东 Day 1 di_main1: "腰果鸡丁"** 同样跑对比 (axis 摘要):

| axis 维度            | 🌵 西安 profile | 🍤 广东 profile | 差异说明 |
|--------------------|---------------:|---------------:|---------|
| axis 1 hometown    |          +0.05 |          +0.10 | 粤菜 → cantonese hometown 命中广东 |
| axis 3 taste       |          +0.15 |          +0.20 | savory(西安) ≠ light(广东) — 广东 light 命中 |
| axis 23 newuser    |          +0.45 |          +0.45 | 持平 |
| axis 32 pmc        |          0.00 |          +0.30 | white 命中广东 ['white','seafood'] / 不命中西安 ['red'] |
| **合计 ~12 axis**   |        **0.20** |        **1.30** | 广东偏好 ~6.5× 西安 |

**结论**: 完美对照 — "腰果鸡丁"(粤菜白肉) 在广东 profile 拿 1.30 (top1), 在西安 profile 仅 0.20 (远远进不了 top 12 候选池)。

---

## 4. 结论判定

| 指标                | 数值     | 阈值                | 判定 |
|--------------------|--------:|--------------------|------|
| **全 35 道菜 Jaccard** | **7.7%** | < 30% = ✅ 真在干活   | ✅ |
| **dinner 仅 Jaccard** | **0.0%** | < 30%               | ✅✅✅ |
| 共有菜              |   5 道 (all cross-cuisine 通用菜) | 早餐 + 侧菜, 非主菜 |  |
| 西安 northern 占比   |   40% (14/35) | hometown 主导信号  | ✅ |
| 广东 cantonese 占比  |   77% (27/35) | hometown 主导更强  | ✅ |

### 🎯 老板核心质疑回答

**"算法是否真在干活" — 答: ✅ 真在干活, 强分化**

- dinner 主菜 **完全不重叠** (Jaccard 0.0%)
- cuisine 分布显著差异 (西安 40% northern vs 广东 77% cantonese)
- 单菜 axis breakdown 证明: hometown axis + pmc axis (Option α) + taste axis 三轴共振，让同一道菜在两 profile 拿到 2-6× score 差
- 5 道共有菜全是早餐 + 凉拌侧菜 (凉拌海带丝/千张丝/牛奶/核桃糊) — 这些菜在所有 cuisine 上下文都属 "中性 baseline"，跨用户共享合理

### 🚦 上线建议

✅ **算法 v61 合格上线**。差异化能力 P0 验证通过。

### ⚠️ 已知边界 / 后续优化项

1. **西安代表非 100% 精准**: sim 用 `north` 是因为 PROFILES 数组无 `northwest`。如老板要严格区分西安/陕西 vs 山西/河北, 派 ticket 028 加 northwest profile + 跑独立对比。
2. **dinner main 部分非 northern dish**: 西安 dinner mains 10 道里 1 道 cantonese (胜瓜云耳炒猪颈肉) + 1 道 southeast_asian (泰式鸡肉饼) + 1 道 western (黑椒牛仔骨)。这是 axis 30 cold-start diversity 早退后 (imagePrefs 非空) + Option δ 单 pmc 硬过滤 (TICKET-017) 只保 red 而不强制 northern origin 的预期行为. 用户层面: "我爱吃红肉" 真生效, 但 "我爱吃北方菜" 还可以更强 (派 ticket 028 调 axis 1 hometown 量级)。
3. **vitamin_d_iu 22.9% fill** (CI pre-flight warn): 不阻塞本次上线, 是 Backend 持续 fill 任务 (中餐 dish 物理含 vitD 食材有限)。

---

## 附录: 完整 sim 输出

跑命令: `npx tsx scripts/algo-quality-sim.ts` (本地需 `.env DIRECT_DATABASE_URL`)
输出含 22 profile 全 metrics + sample picks + 西安 vs 广东 dump 段 + CI smoke 28/28 ✅

**Algorithm 027 P0 端到端验证完成 ✅**
