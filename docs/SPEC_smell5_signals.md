# SPEC_smell5_signals.md — Smell 5 候选评估：信号过载 / 冷启动 / 跨家庭成员

> 状态：草稿（TICKET-20260520-058 §C 起步）
> 作者：Algorithm (Day 14 中段)
> 前置：Smell 1-4 已完成（阶段 3 v42 + 阶段 4 v43）；axis 已扩到 29；explainScore
>       12 主轴中文 reason 已 ship
> 关联：CLAUDE_ALGORITHM.md §Smell / scoreForWeek 27+ axis 现状

---

## §0 一句话

Smell 5 候选有 3 个并列方向，本 SPEC 评估 + 排优先级 + 起草每个的实施分 commit，
让 CEO 选 1 个作 Day 15+ 派单依据。本轮**不动 src/**。

---

## §1 现状：27+ axis 互相 cancel + 冷启动 + 单 profile 假设

### §1.1 信号过载问题

scoreForWeek 当前 27+ axis（含 axis 26 inventory / 27 festival / 28 seasonal /
29 special_health + 22 基础）。每 axis 加分独立累加，没有归一化。结果：

- 单 axis 改动（如 dietary_goal 改 muscle_gain）只看到 1 axis +0.35 加分；
  其他 axis 微调（如 ±0.05）淹没在 noise 里 — 用户感知"改了没用"
- 多 axis 同向叠加（hometown +0.60 + dietary_goal +0.35 + taste +0.25）
  让"完美对齐"菜单点 ~ 1.20 分 vs "只对一个 axis"菜 0.35 分，差距巨大
  → 算法过度自信高分菜，推荐多样性塌缩

### §1.2 冷启动问题

新用户 prefScores 全空：
- sigmoid weight = 0.35 + 1.15 × (1 - exp(-0/15)) = 0.35
- 学习信号几乎全压制 → 推荐完全依赖 profile 静态偏好（dietary_goal +
  solar_term + festival + seasonal_ingredient）
- profile 偏好命中范围窄 → 用户首周看到的菜重复率高 → 用户没接触不同菜系
  机会 → preference_learn 永远学不到 spicy 之外的偏好（除非用户主动 swap）

### §1.3 跨家庭成员冲突

家庭 2-4 人不同 dietary_goal：
- 老婆 prenatal + 老公 muscle_gain + 老人 elderly → scoreForWeek 当前
  只读 user_profiles.dietary_goal **单一**值，无法同时优化 3 个目标
- familyPrefs 模块部分处理（hasPregnant + lifeStage age 修饰）但**没正式
  fan-out 到 axis 29**
- memberMainSlots 已做"slot 0/1 各对一人 goal"但仅 dinner main protein，
  其他 slot 仍走单 profile

---

## §2 三个 Smell 5 候选方案

### §2.1 Candidate A — 信号归一化（z-score）

**核心**：把每 axis 加分按用户全周菜单的 z-score 归一化到 [-1, 1]，再加权求和。

**变化**：
- scoreForWeek 内部仍按现公式累加（hot path 不变）
- generateWeekPlan 末尾对全周候选池统计 mean/std → 每个 axis 加分减 mean 除
  std → 归一化加权
- 用户改 dietary_goal 后看到的菜对该 axis 的相对位置（top 25% / bottom 25%）
  比绝对分数更敏感

**优势**：
- 单 axis 改动用户感知更敏感
- 多 axis 同向叠加被自动 dampen（不会一道菜分爆表）
- 推荐多样性回升

**劣势**：
- 增加一次"全菜单 mean/std 预计算"的 generateWeekPlan 顶部 pass
- explainScore breakdown 数字含义变（"相对值"而非"绝对加分"）
- 老用户菜单跨周连续性可能跳（归一化窗口不同 → 同一道菜本周 +0.8 下周 +0.6）

**实施 5 commit**：
- C1: scoreForWeek 内 axis tag 元数据收集（每 axis 独立 number 而非累加 score）
- C2: generateWeekPlan 顶 + 一次预计算 axis means/stds
- C3: 归一化函数 normalizeAxes(axisDeltas, means, stds) → final score
- C4: explainScore 同步用归一化值（reason 加"相对全菜单 top X%"标签）
- C5: bump ALGO_VERSION v43 → v44

### §2.2 Candidate B — 冷启动多样性 bonus

**核心**：新用户（prefScores 总信号数 < 15）首周菜单加"菜系多样性 bonus"，
让用户在一周内接触 5+ 不同 origin_cuisine。

**变化**：
- generateWeekPlan 检测 prefScores total nonzero count < 15 → enable
  diversity mode
- diversity mode 内 candidate filter 加新 hard-block：同一 origin_cuisine
  本周已选 ≥ 2 次 → 暂时 hard-block（让 candidate 池强制扩散）
- preference_learn axis 临时降权（× 0.3）让 profile + diversity 主导
- 一旦 prefScores 累计 ≥ 15 信号 → 自动退出 diversity mode

**优势**：
- 用户首周一定接触 cantonese / sichuan / jiangnan / northern + 海鲜 / 素食
  + 节庆菜 5+ 个 origin_cuisine
- preference_learn 学习数据采样空间大 → 后续 sigmoid weight 升得更准
- 不破坏老用户体验（≥ 15 信号自动退出）

**劣势**：
- 强制多样性可能让"对家乡菜系偏好"的用户首周感受不到家乡味（hometown
  仍加 +0.60 但 ≥ 2 次 hard-block 让单菜系第二道菜被踢）
- 退出条件 15 是猜测，需要数据验证

**实施 4 commit**：
- C1: 新增 const DIVERSITY_MODE_THRESHOLD = 15 + isDiversityMode(prefScores) helper
- C2: generateWeekPlan 内 candidate filter 加 diversity hard-block
- C3: preference_learn axis 在 diversity mode 内降权（× 0.3）
- C4: explainScore 加 "新用户尝鲜模式" axis 显示 + bump ALGO_VERSION v43 → v44

### §2.3 Candidate C — 多 profile fan-out（跨家庭成员）

**核心**：把 generateWeekPlan 输入从单 profile 改成 `familyProfiles[]`，
对每道菜跑 N 次评分（每个 profile 一次）再做加权聚合。

**变化**：
- 新 type FamilyProfile = profile + member_weight (默认 1.0)
- scoreForWeek(dish, profile) → 不变（hot path 仍单 profile）
- 新增 scoreForFamily(dish, profiles[], weights[]) →
  Σ scoreForWeek(dish, pi) × wi / Σ wi
- generateWeekPlan 内 candidate scoring 改调 scoreForFamily
- familyPrefs.homeMembers 已存在的 goalWeights 直接复用

**优势**：
- 老婆 prenatal + 老公 muscle_gain + 老人 elderly → scoreForFamily 三 profile
  平均，菜单兼顾三人
- familyPrefs.memberMainSlots（per-member dinner slot）扩展为全菜单 fan-out
- 完整解决"家庭多目标"痛点 — Aieats 金牌差异化场景

**劣势**：
- scoreForWeek N×（N=家庭人数）调用次数 → 性能 ~ 3x overhead
  （但仍在 hot path 内，对 generateWeekPlan 整体影响约 1.5x）
- familyPrefs 模块已部分实现，本方案要把 memberMainSlots 思路扩到全菜单
  → 需要 surgical 改动 5+ 处 scoreForWeek 调用点

**实施 5 commit**：
- C1: 新 type FamilyProfile + scoreForFamily helper
- C2: generateWeekPlan 输入加 familyProfiles 参数（向后兼容：缺时单 profile）
- C3: scoreForWeek 5 处调用点改走 scoreForFamily（每处 if familyProfiles 分支）
- C4: hook 层 fetch user_profiles + familyPrefs.homeMembers → 构造 familyProfiles[]
- C5: explainScore 加"全家投票"标签 + bump ALGO_VERSION v43 → v44

---

## §3 优先级评估

| Candidate | 实施难度 | 用户感知价值 | 风险 | 推荐顺序 |
|-----------|----------|--------------|------|----------|
| **A** signal-normalize | 中 (5 commit, 改 score 流) | 中（变得更准但不爆点） | 高（归一化值跳，跨周一致性受影响） | **第 3** |
| **B** cold-start-diversity | 低 (4 commit, 局部加 mode) | 高（新用户首周即"懂我"开始） | 低（≥15 信号自动退出，可控） | **第 1** |
| **C** multi-profile-fanout | 高 (5 commit, 5 处调用点改) | 高（金牌差异化场景） | 中（3x perf overhead，FamilyProfile 集成深） | **第 2** |

**推荐**：B → C → A
- B 投入产出比最高，且不破坏既有体验
- C 是 Aieats 战略差异点（家庭多目标），优先解决
- A 是"算法更稳但用户体验跳"的内部优化，价值次于 B/C，留 P9+

---

## §4 ALGO_VERSION 决策（每 candidate 完整实施时）

| Candidate | 完整实施 bump |
|-----------|-------------|
| B 冷启动 | v43 → v44（diversity mode 改抽样语义） |
| C 多 profile | v44 → v45（评分函数改家族版） |
| A 归一化 | v45 → v46（score 量级口径变） |

**本 SPEC 不 bump** — 仅 docs/。

---

## §5 影响范围 + 回滚

每 candidate 完整实施时：
- 全部 bump → user_weekly_menus 全部 stale → 自动重生成（与 Smell 4 双列校验一致）
- 单 candidate 内的 commit 链可单点 revert（C1 不改 score，C2/C3 改流程）
- 回滚级别 A 整体 revert + 再 bump 让 cache 再次 stale（与 SPEC_smell1_phase3
  §5.2 同口径）

---

## §6 不变量自检（每 candidate 完整实施时）

| # | 不变量 | A | B | C |
|---|--------|---|---|---|
| #1 | 无 FK→auth.users | ✓ | ✓ | ✓ |
| #2 | 无前端直连 Gemini | ✓ | ✓ | ✓ |
| #3 | Stripe 白名单 | 不涉及 | 不涉及 | 不涉及 |
| #4 | ALGO_VERSION bump | v44 | v44 | v45 |
| #5 | getUserId 走 lib/userId | ✓ | ✓ | ✓ |
| #6 | dish_ids uuid[] | ✓ | ✓ | ✓ |

---

## §7 待办（CEO 决策后）

- ☐ CEO 选 A / B / C / 多个并行
- ☐ 选定后 Algorithm 起草 SPEC_smell5_<candidate>.md 详细子 SPEC（按 C1-C5 commit 拆解）
- ☐ Database / UI / Backend 协同改动评估（B 几乎 self-contained；C 需要 familyPrefs.ts 配合）

---

## §8 非目标（v1 明确不做）

- 不引入 ML 模型重排（off-the-shelf neural ranker）— 本 SPEC 范围内仍线性 axis 加权
- 不做用户级 A/B 测试框架（feature flag）— v44 完工后 100% 用户启用
- 不重写既有 27 axis（只在外层加 mode / 归一化 / fan-out）
