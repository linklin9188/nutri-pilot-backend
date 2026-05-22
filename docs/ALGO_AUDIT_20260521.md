# ALGO_AUDIT_20260521 — TICKET-016 算法质量端到端验证 + 二次调优

**作者**: Algorithm Lead
**完工**: 2026-05-21 (HKT)
**关联 ticket**: TICKET-015 (诊断) → TICKET-016 (调优)
**ALGO_VERSION**: v50 → v51 (§A 落地) → v52 (§D Option α 落地)

---

## §1. axis 量级 audit (来自 sim 20 profile axis 命中分布累计)

下表为 20 profile × 35 道菜 (5 workday) 全跑后, 每个 axis 累计贡献分。
"量级"列读法: 正数 = 平均每 profile 通过此 axis 累计加分;
负数 = 累计扣分。

| axis                          | 设计权重 | 量级 v50 (调优前) | 量级 v52 (调优后) | 标注 |
|-------------------------------|----------|------------------|------------------|------|
| **a23_newuser_match**         | 0.15×3   | +5.7 ~ +13.8     | +6.5 ~ +13.8     | ⚠️ **过载** (3 hits/dish, 单方向累计 +14, 超 a32 5×) |
| **a3_taste**                  | 0.25     | +5.0 ~ +8.0      | +5.75 ~ +8.0     | ⚠️ **过载** (light/spicy 命中率高 → 28-32 道 hits) |
| **a7_div_ing** (negative)     | -0.55/次 | -2.75 ~ -6.05    | -3.30 ~ -5.50    | 合理负 axis (ingredient diversity) |
| **a30_div_cu** (negative)     | -0.20/次 | **-12.8 ~ -14.4**| **0 (early-return)** | 🟢 **v51 修复后已置 0** (已填 image 用户) |
| a32_pmc                       | 0.15→0.30 | +1.05 ~ +2.85    | +1.50 ~ +6.90    | 🟢 **v52 ×2 后翻倍, 但单类 pmc 仍不能主导** |
| a39_oil                       | 0.07     | +0.77 ~ +1.68    | +0.84 ~ +1.61    | 量级偏小 但 oil 命中率显著 (54%) |
| a1_hometown                   | 0.05     | +0.35 ~ +1.45    | +0.35 ~ +1.45    | ⚠️ **量级 < 0.5** 但 cuisine_match 命中率 54% mean (足够) |
| a2_goal / a2_light            | 0.15/0.08| +0.40 ~ +2.56    | +0.40 ~ +2.56    | 合理 |
| a33_staple                    | 0.08     | +0.08 ~ +0.48    | +0.08 ~ +0.48    | ⚠️ 量级 < 0.5 (gate 仅 ct=staple, 占 1/7 slot) |
| a34_protein                   | 0.12     | +0 ~ +0.48       | +0 ~ +0.48       | ⚠️ 量级 < 0.5 (仅 5 profile 填 protein_pref) |
| a35_beef                      | 0.07     | +0 ~ +0.14       | +0 ~ +0.14       | ⚠️ 量级 < 0.5 (gate: mi=beef, 数据稀疏) |
| a36_chicken                   | 0.07     | +0               | +0               | ⚠️ 量级 = 0 (本 sim 无 chicken_style profile) |
| a37_seafood                   | 0.06     | +0 ~ +0.60       | +0.30 ~ +0.60    | ⚠️ 量级 < 1 (gate 仅 seafood profile) |
| a38_veg                       | 0.08     | +0 ~ +1.44       | +0 ~ +1.44       | OK |
| a40_breakfast_cuisine         | 0.05     | +0.35 ~ +0.45    | +0.35 ~ +0.45    | ⚠️ 量级 < 0.5 (gate 仅早餐, 5 slot/week) |

**主导 axis**: a23_newuser_match (+14 累计) > a3_taste (+8) > a32_pmc (+6.90 / +1.50)
**理论设计**: axis 32-40 各 5-15% 合计 75% 主导
**实际**: a23 + a3 占 ~70% 量级, axis 32-40 仅占 ~25%
**根因**: scoreForWeek 主权重 axis (taste / newuser bonus) 远大于 imageOnboardingScore 各项

## §2. 20-profile 矩阵命中率 (v52 main slot 分母)

main slot 分母 = 午餐 main + 晚餐 main1 + 晚餐 main2 = 15 道/week
(全 35 道分母含 10 staple slot 天然不命中 pmc, 虚高 → 用 main 分母才反映用户感知)

| # | profile                     | want_pmc      | pmc/main | want_oil | oil/main | cuisine | verdict |
|---|-----------------------------|---------------|----------|----------|----------|---------|---------|
| 1 | 1-meatlover-川菜增肌            | red           | 27%      | high     | 80%      | 46%     | FAIL    |
| 2 | 2-pescetarian-江浙清淡          | seafood       | 60%      | low      | 53%      | 37%     | FAIL    |
| 3 | 3-vegan-江浙减脂                | veg           | 60%      | low      | 47%      | 20%     | FAIL    |
| 4 | 4-cantonese-港式清淡            | white+seafood | **80%**  | mid      | 53%      | 74%     | ~ pmc-only |
| 5 | 5-northerner-北方面食           | red           | 40%      | mid      | 60%      | 40%     | FAIL    |
| 6 | 6-三口-北方红肉                   | red           | 33%      | mid      | 33%      | 29%     | FAIL    |
| 7 | 7-三口-港式白肉清淡                 | white         | 20%      | low      | 53%      | 83%     | FAIL    |
| 8 | 8-三口-粤菜海鲜增肌                 | seafood       | 60%      | mid      | 47%      | 69%     | FAIL    |
| 9 | 9-四口-川菜鸡中等                  | white         | 20%      | mid      | 33%      | 49%     | FAIL    |
|10 | 10-四口-粤菜海鲜哺乳                | seafood       | 53%      | low      | 53%      | 77%     | FAIL    |
|11 | 11-四口-川菜红肉重油                | red           | 13%      | high     | 80%      | 57%     | FAIL    |
|12 | 12-多孩-北方面食                  | red+white     | 40%      | mid      | 33%      | 31%     | FAIL    |
|13 | 13-三代-粤菜白肉老人                | white         | 20%      | low      | 53%      | 83%     | FAIL    |
|14 | 14-三代-港式白切鸡                 | white         | 20%      | mid      | 47%      | 80%     | FAIL    |
|15 | 15-大家庭-红肉重油北方               | red           | 47%      | high     | 67%      | 29%     | FAIL    |
|16 | 16-大家庭-杂粮鸡鸭控糖               | white         | 20%      | mid      | 53%      | 43%     | FAIL    |
|17 | 17-单亲-江浙海鲜减脂                | seafood       | 60%      | low      | 53%      | 26%     | FAIL    |
|18 | 18-单亲-川菜素重油                 | veg           | 40%      | high     | 80%      | 43%     | FAIL    |
|19 | 19-独居老人-港式海鲜                | seafood       | 53%      | low      | 53%      | 77%     | FAIL    |
|20 | 20-独居老人-粤菜白肉                | white         | 20%      | low      | 53%      | 83%     | FAIL    |

**v52 整体**:
- pass_pmc_main: **1/20** (≥ 70%) — 仅 cantonese 双 pmc 偏好通过
- pass_oil_main: **5/20** (≥ 60%)
- pass_cuisine: **9/20** (≥ 50%)
- pass_all (三项全通过): **0/20**
- mean: pmc_main=**39%** oil_main=**54%** cui=**54%**

**v50 baseline (axis 30 -14 主导, 调优前)**:
- pass_pmc (50% target, all 分母): 0/5
- mean pmc_all: ~20-30%
- cuisine_match: 14-23% (全部失效)

**Delta v50 → v52**:
- mean pmc_main: 20-30% → **39%** (+10-15pt)
- mean cuisine: 14-23% → **54%** (+30-40pt) ← **axis 30 修复主要贡献**
- mean oil_main: ~30% → **54%** (+24pt)

## §3. 5-channel 标签覆盖率

本单 §A 计划"5 channel 标签数据流通到 generateWeekPlan 返回结构"被推迟。
理由: 该改动需修 generateWeekPlan 返回签名 (days[].slots[].candidates[]),
影响 useWeeklyMenu 内部消费 + 所有 UI 调用方 (Home/WeeklyMenu/VerifyIngredients),
属 SURGICAL 边界外的大接口变更, 留给下一棒专项 ticket。

当前可代理的 5 channel:
- **protein_main_class**: imagePrefs.protein_main_class 已直接驱动 axis 32 (v52 0.30)
- **cuisine_origin**: imagePrefs (无) + profile.hometown_cuisine 驱动 axis 1 (+0.05) + axis 23 hometown hit
- **oil_level**: imagePrefs.oil_level 驱动 axis 39 (+0.07)
- **staple_pref**: imagePrefs.staple_pref 驱动 axis 33 (+0.08, ct=staple gate)
- **wellness**: profile.dietary_goal 驱动 axis 2 (+0.15) + axis 29 (special_health)

5 channel 已在数据层流通, 只是未独立标签化输出。

## §3.5 TICKET-017 v54 (Option δ + festival API + DB pref_scores) — 命中率突破

实施 (1 commit 待 push):
- §A Option δ: generateWeekPlan main loop candidate pool prefilter.
  imagePrefs.protein_main_class.length===1 && main protein slot →
  `strict = allCandidates.filter(pmcDb === wantDb); if (strict.length >= 15) use strict`
- §B festival API axis 27 改造: scoreForWeek 新增 ctx.festivalTags 入参,
  caller 优先注入 sessionStorage 30min 缓存的 backend /functions/v1/festival-now
  返回的 tags; 缺失退本地公历 getCurrentFestival 兜底。axis 27 量级保持 +0.4。
- §C user_profiles.pref_scores (rollup jsonb) 优先读, 缺失退现有
  user_preference_scores feedback 行。
- ALGO_VERSION v52 → v54 (合并 bump)

v54 20 profile sim 结果:

| metric                | v52 (TICKET-016 完工) | v54 (TICKET-017 完工) | delta |
|-----------------------|----------------------|----------------------|-------|
| pass_pmc_main (≥70%)  | **1/20**             | **19/20**            | +18 ✅ |
| pass_oil_main (≥60%)  | 5/20                 | 7/20                 | +2 |
| pass_cuisine (≥50%)   | 9/20                 | 8/20                 | -1 (Option δ 后 cuisine 略让位 pmc, acceptable) |
| pass_all (三项全通)    | 0/20                 | **3/20**             | +3 |
| mean pmc_main         | 39%                  | **96%**              | +57pt 🚀 |
| mean pmc_all (35 分母) | 35%                  | 56%                  | +21pt |
| mean oil_main         | 54%                  | 53%                  | -1 |
| mean cuisine          | 54%                  | 48%                  | -6 |

**关键结论**: Option δ 候选池硬过滤把 single-pmc 偏好 main 命中率从 ~30% 推到
100% (19/20 profile main slot 全是偏好 pmc 类), pmc_main 19/20 通过 70% 目标。
未通过的 1 个 (12-多孩-北方面食 want red+white 双 pmc) 不触发 Option δ
(length===1 才触发), main 命中 40%。**老板要的"meatlover 出红肉"已落地**。

副作用 (符合 CEO 拍板"接受极端化菜单"):
- meatlover main slot 100% red — 一周午晚主菜全是牛肉/猪肉/羊肉, 没素菜主菜
- vegan main slot 100% veg — 一周主菜全是豆腐/蔬菜/菌菇
- 这是预期行为, 用户填了 single-pmc 偏好就承诺了极端化菜单

降级保护:
- 过滤后 candidates < 15 → 自动放宽到全集, 避免空 slot
- 双 pmc 偏好 (length===2) 跳过过滤, 维持 axis 32-driven mix (cantonese 仍 80%)
- staple / side / soup / breakfast 等非 main slot 不受影响, 维持营养均衡

## §4. 二次调优决策 + 理由

### §D Option α (实施) — axis 32 protein_main_class 0.15 → 0.30
- **理由**: v51 sim 显示 axis 30 修复后 pmc 命中率仍 mean ~30%, axis 32 量级
  落后 a3_taste (0.25) + a23_newuser (0.45/dish), want_pmc=red 用户算法选了
  spicy+white 而非 spicy+red。
- **效果**: meatlover 20%→27%, cantonese 67%→80% (达 70% 阈值), vegan 47%→60%,
  pescetarian 47%→60%。mean pmc_main: 30%→39%。

### §D Option β (本单未需要) — image_onboarding 已填用户禁用试探 axis
- §A axis 30 early-return 已覆盖此逻辑 (hasImagePrefs=true → skip cold-start
  diversity)。**v51 已落地**。

### §D Option γ (未实施) — preference axis × 1.5 量级压过
- 与 α 等价, 已通过 α 实施部分 (axis 32)。
- 进一步提升 axis 38/39/40 量级会牺牲菜单多样性, 留给后续 ticket 拍板。

### §D Option δ (未实施 — 推荐下一棒) — protein_main_class 候选池硬过滤
- **理由**: v52 sim 显示单 pmc 偏好用户 main 命中率天花板 = DB 分布上限
  - red dish 占 DB 19% → meatlover 极限 ~50% main 命中
  - white dish 占 DB 15% → white-only profile (7/13/14/16/20) 极限 ~40%
  - 双 pmc 偏好 (cantonese white+seafood) 总和 31% → 已达 80% (设计上限)
- **修复**: imagePrefs.protein_main_class.length === 1 且 pmcDb 已 100% backfill 时,
  generateWeekPlan main slot candidate pool 加 prefilter
  `protein_main_class IN (user_wants)`, 让算法直接从偏好类候选里挑 top-15。
- **影响**: 需改 generateWeekPlan main loop candidate filter (~20 行), 改动有侵入性,
  pmc 单类用户菜单全主蛋白命中 — 留给下一棒 ticket CEO 拍板。

## §5. ALGO_VERSION 历史

| version | 主要变化 |
|---------|---------|
| v40 | Smell 1 阶段 2 — 双管道合并 + 9-axis + sigmoid 学习曲线 |
| v45 | TICKET-005 — v3 image-onboarding 9 axes (32-40, 75% 权重) + hometown 30→5% + dietary 25→15% |
| v48 | TICKET-009 §B — 9 axes 值域 UI↔DB 6 个映射桥接 |
| v49 | TICKET-012 — axis 32 + axis 37 DB pmc 双轨升级 |
| v50 | TICKET-014 — 5 天工作日制 (WORKDAYS_PER_WEEK=5) |
| v51 | **TICKET-016 §A** — axis 30 cold-start diversity early-return for image-known users (root cause of TICKET-015 诊断) |
| v52 | **TICKET-016 §D Option α** — axis 32 protein_main_class 0.15 → 0.30 |
| v54 | **TICKET-017 §A Option δ + §B festival API + §C DB pref_scores** — main slot candidate pool 硬过滤 / axis 27 接 backend festival-now / user_profiles.pref_scores 优先 |

## §6. 未来 audit 自动化建议

1. **CI 跑 scripts/algo-quality-sim.ts**: 任一 profile mean pmc_main < 30%
   或 mean cuisine < 30% 时 build fail. 防止后续 axis 改动回退命中率。
2. **量级监控**: 任一 axis 量级 abs(累计) > 10 时 warn — 当前 a23_newuser
   (+14) 已经过载, 下一棒可能要收口。
3. **新 axis 必带 sim**: 任何新增 axis 上线前先跑 sim 看与现有 axis 量级比,
   避免 axis 30 这种"无意压倒 75% 主导"的情形重演。
4. **20 profile 不够覆盖**: 缺南方湿热体质 / 老年低钠 / 哺乳期 / 备孕等
   ticket §C 列的 wellness profile, 下一轮扩到 30+。

---

## 附录 A — sim 输出参考

完整 sim 输出请运行 `npx tsx scripts/algo-quality-sim.ts` (需 DIRECT_DATABASE_URL)。
本审计基于 v52 ALGO_VERSION 主分支跑通 (commit hash 见 §H commits)。

## 附录 B — 已知盲区

1. **a36_chicken 量级 = 0**: 本 sim 20 profile 无 chicken_style 偏好 (CEO
   可下一轮加入)。
2. **wellness 维度未充分跑**: prenatal / lactation / low_sodium 等 axis 29
   special health 因 sim score() 未镜像该轴, 本 audit 未覆盖。
3. **采购量 + 营养雷达** (ticket §C 列出): sim 数据池缺 nutrition_kcal /
   protein_g / calcium 等列, 本 audit 未跑这两个指标。下次扩展。
