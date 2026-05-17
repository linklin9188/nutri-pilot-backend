---
name: menu-scoring-philosophy
description: |
  Algorithm design principles for the weekly-menu scorer. Encodes the
  product owner's directional calls about how 家乡 / 使用数据 / 季节 /
  价位定位 should interact. Use this skill BEFORE proposing changes to
  scoreForWeek / scoreDish / applyFeedbackScore / origin base tables —
  the rules below come from real product decisions, not author taste.
triggers:
  - "推荐算法"
  - "scoreDish"
  - "scoreForWeek"
  - "weighting"
  - "hometown bias"
  - "EMA"
  - "feedback score"
  - "prefScores"
  - "user_preference_scores"
  - "幂次方"
  - "使用数据"
  - "ALGO_VERSION"
---

# Menu-Scoring 算法哲学

This skill captures the product owner's explicit rulings on how the menu
algorithm should weight signals. **Do not contradict these without
checking in.** Every rule below has a documented "why" — internalize the
reasoning so you can spot when an edge case still satisfies the spirit
of the rule.

## Rule 0 — 算法必须公平 (the meta-rule)

> 算法一定要平等。 — user, 2026-05-17

Concretely: for any two users A and B with **the same kind of signal
about their own preferences**, the algorithm should produce **the same
strength of bias** in favor of that preference. Two failure modes
flagged before:

1. **Fixed origin table** (`cantonese: 0.15`, `sichuan: 0.10`) — a 川人's
   川菜 ended up scoring 0.05 lower than a 粤人's 粤菜. Killed. Replaced
   with `originBaseFor(dishOrigin, userBucket)` which returns identical
   `+0.20` (or rather +0.60 via hometownMatches, see Rule 1) for **any**
   user looking at their own hometown.
2. **Cold-start defaulting to 北方** — when DB returns rows in arbitrary
   order and the scorer gives every dish 0, the user sees whichever
   origin sorted to the top of the DB. Killed. The base score now
   delivers `+0.08` to all four major 中餐 origins equally when the user
   has no hometown set.

## Rule 1 — 家乡权重必须显著大于其他

> 用户的家乡权重肯定是要更大的。当用户没有登记家乡，那就平等。
> — user, 2026-05-17

Numeric target: a user with a hometown set should see **their own
home cuisine score ≥ 0.56 higher** than every other origin in the
cold-start menu. Implementation:

| Layer | Same-hometown dish | Other Chinese dish | Western dish |
|---|---|---|---|
| `originBaseFor()` | **0** | +0.04 | -0.10 |
| `hometownMatches() bonus` (useWeeklyMenu) | **+0.60** | 0 | 0 |
| `hometownScore axis + extra` (useSupabaseMenu) | **+0.30 + 0.30 = +0.60** | 0 | 0 |
| **Net** | **+0.60** | +0.04 | -0.10 |

The 0 base on the hometown match is **deliberate** — we avoid stacking
two "hometown" signals because the doubled bonus would push the gap to
0.76 and crowd out usage-data signals at the higher end of Rule 2.

When the user has **no** hometown (`null` or `'no_preference'`):

| Dish origin | Base bonus |
|---|---|
| Any of cantonese / northern / jiangnan / sichuan | +0.08 (equal) |
| japanese_korean / southeast_asian | +0.04 |
| western | -0.10 |

## Rule 2 — 使用数据走幂次方，**不是** EMA

> 用户看某个菜的次数，成幂次方上涨。不是指数平均。一开始是家乡，
> 后续主要看用户使用数据。比如用户广东人，看川菜 5 次，那么说明他
> 更喜欢吃辣。 — user, 2026-05-17

**Why EMA is wrong here.** Exponential Moving Average (`next = prev × 0.85 + delta`)
saturates: with delta = 0.10 the limit is `0.10 / 0.15 ≈ 0.667`. After
**5** sustained signals you're already at ~0.367; after **50** sustained
signals you're at ~0.667. The system can't tell apart a user who kept
川菜 5 times from one who kept it 50 times. That contradicts the spec
("一开始是家乡，后续主要看使用数据"): if usage data is supposed to
override the profile eventually, the signal needs **unbounded super-linear
growth**, not asymptotic decay.

**The implementation.** Storage is now cumulative count, no decay:

- Every "kept" / "engagement" event = `+1.0` per tag the dish carries.
- Every "swap-away" event = `-0.5` (rejection is half-strength of an
  explicit positive choice).
- Counter cap ±25 — defends against bot/abuse runaway, not against real
  users (25 sustained signals already produces a +6.25 bonus, which
  dominates everything else).

Scoring uses the **`usagePower(n)`** curve:

```ts
usagePower(n) = sign(n) * |n|^1.5 * 0.05
```

Calibration table — what 你 see when you've kept N 川菜 dishes (broadly):

| n (count) | Bonus | Comparison |
|---|---|---|
| 0 | 0 | cold-start |
| 1 | +0.05 | barely a nudge |
| 5 | **+0.56** | **roughly = hometown +0.60** |
| 10 | +1.58 | usage data starts dominating |
| 20 | +4.47 | usage data fully dominates |
| 25 (cap) | +6.25 | ceiling |

Axis-specific scales applied on top:
- `cuisine` axis × 1.0 — the loudest signal (一个完整菜系的偏好)
- `flavor` axis × 0.6 — secondary (a single tag like 'spicy')
- `health` axis × 0.6 — secondary

Cuisine being the loudest means: 5 次 川菜 by a 粤 user pulls the menu
toward 川 dishes much more than 5 次 'spicy' by a 'light' user pulls
toward spicy dishes. This matches the "广东人 看川菜 5 次 → 更喜欢吃辣"
example — but specifically pulls toward 川菜 (the cuisine), with spicy
flavor following as a secondary effect.

## Rule 3 — 首次推荐特别重要

> 首次推荐很重要，我们着重优化首次推荐的算法。 — user, 2026-05-17

A first-session user has zero `prefScores`, so Rule 2's usage-data layer
contributes nothing. The first menu must therefore be driven by the
QuickSetup 5D profile **plus** popularity signals (community-validated
dishes). `isNewUserSession()` gates two boosts in `scoreDish`:

1. **Profile-match amplifier**: each of (hometown / goal / taste) that
   matches the dish adds an extra `+0.15`. Cold-start users who answered
   QuickSetup honestly will see those answers actually shape their first
   menu — onboarding feels like it worked.
2. **Popularity signal** (only on first-session, since returning users
   already have personalized usage data):
   - `health_score / 10 × 0.10` — up to +0.10 for dishes the dietary
     scorer rated highly.
   - `min(times_kept_in_menu, 50) / 50 × 0.08` — up to +0.08 for dishes
     50+ households have actually kept in their weekly menu.

After first session this layer disappears and the per-user usage-data
power curve takes over.

## Rule 4 — High-end Chinese chef framing

> 按照中餐高级厨师和高端用户的定位，先改进中餐。 — user, 2026-05-17

Concrete codifications:

1. **Seasonality**: dish.seasonal_tag matching current calendar season
   gets `+0.08` (Northern hemisphere months 3-5 → Spring, 6-8 → Summer,
   etc.). 80%+ of DB rows are `All-Season/Balanced`, so this lifts the
   actually-seasonal minority without penalising the rest.
2. **快餐感 damp**: titles containing 盖饭 / 盖浇饭 / 便当 / 炒饭 /
   烩饭 / 焗饭 / 泡饭 get `-0.15` at lunch and dinner. Breakfast is
   exempt (港式 / 北方 早餐 with 煎饼 / 炒饭 is legitimate). The intent
   is to push the lunch and dinner table toward proper N-dish layouts
   rather than 盖饭-on-a-tray.
3. **粥/稀饭 globally banned from lunch+dinner**: stripped from the
   pool at `generateWeekPlan()` entry. Breakfast pool is fetched
   separately, so congee stays a breakfast staple.
4. **Dinner cook-method variety**: same-day `dayCookMethods` list
   tracked; same method twice in a meal earns a small score penalty
   (lunch already enforced this via `pickWithMethodVariety` —
   dinner now mirrors it via the score gradient).

## Rule 4.5 — Western high-end framing (HK premium clientele)

> 然后再按照西餐高级厨师和香港高端人群的定位再优化西餐。
> — user, 2026-05-17

Within `origin='western'` dishes only, apply a second-level title
keyword bias to lift 欧陆 fine dining and damp 美/英式 fast-casual:

| Title keyword | Bonus |
|---|---|
| 意式 / 法式 / 法棍 / 牛角包 / 西班牙 / 地中海 / 普罗旺斯 / 摩洛哥 / 土耳其 / 巴萨米可 / 蘑菇炖饭 / 千层面 / 披萨 / 意面 / 炖菜 | **+0.12** |
| 三明治 / 汉堡 / 玉米饼 / 热狗 / 玉米片 / 墨西哥卷 / 牧羊人派 / 潜艇堡 / 吐司 | **-0.08** |
| (其他 western) | 0 |

This bias is **non-disqualifying** — a casual dish can still surface if
the user clearly prefers it via usage data. Implementation lives in
`westernHighEndBias()` in both scorers. Activates regardless of
cuisineMode because non-western dishes return 0 anyway (the guard is the
first line of the helper).

## Rule 4.6 — Trial expiry on Home

> 任何新用户都可以打开看到 ... 一周后再次打开就需要付费。
> — user, 2026-05-17

Non-members whose `userLifecycle.isWithinTrial()` returns false see
`<TrialExpiredCard/>` on Home in place of the daily menu / weekend
dining surface. Members (`useSubscription().isPro`) and within-trial
users bypass the gate. New-user first session is always within trial
because `markLogin()` writes `first_login_at = Date.now()` on the very
first login. The 7-day window is measured against that timestamp.

## Rule 5 — Hometown onboarding 用「地域大区」不是「八大菜系」

> 方案 A，干。 — user, 2026-05-17

八大菜系 (粤川鲁苏闽浙湘徽) 覆盖率仅 ≈ 60% 大陆人口（北方人选不到自己，
河南/北京/东北/西北 都无对应选项），且「徽菜」「闽菜」对 90 后用户认知
模糊。新方案是 **地域大区**，覆盖率接近 100%、UI 8 个 chip 跟之前视觉
一致、跟 DB origin_cuisine bucket 天然 N:1 对应：

| Onboarding chip | DB bucket | 覆盖省份 |
|---|---|---|
| 华南 (south) | cantonese | 粤 · 闽 · 桂 · 琼 |
| 华东 (east) | jiangnan | 沪 · 苏 · 浙 · 皖 |
| 华北 (north) | northern | 京 · 津 · 冀 · 晋 · 蒙 |
| 东北 (northeast) | northern | 辽 · 吉 · 黑 |
| 西北 (northwest) | northern | 陕 · 甘 · 宁 · 青 · 新 |
| 西南 (southwest) | sichuan | 川 · 渝 · 湘 · 黔 · 滇 |
| 华中 (central) | **northern** | 鄂 · 赣 · 豫（豫占人口主导，口味偏北） |
| 港澳台 (hk_macau_tw) | cantonese | 港 · 澳 · 台 |
| 都行 (no_preference) | (null) | (没有家乡偏好) |

**兼容性**：legacy 八大菜系 id (`guangdong` / `sichuan` / `shandong` /
`jiangsu` / `fujian` / `zhejiang` / `hunan` / `anhui`) 仍然注册在
`HOMETOWN_TO_DB_BUCKETS`，所以已经走过 onboarding 的老用户的
`localStorage.userHometown` 不会失效。UI 显示时找不到对应 chip 不亮，
但后端的家乡 bonus 仍然准确生效。

**为什么不是省份下拉**：34 省 onboarding 摩擦大，后端 DB 4 bucket 接不住
34 省的精细信号（除非把 dishes 重新按省份标注，700 道 × 34 省的 backfill
是个大工程）。地域大区是当前 DB 粒度下的最优解；未来 DB 细化时可以再
拆（华南 → 粤 / 闽 / 客家 / 潮汕，西南 → 川 / 湘 / 黔 等）。

## Rule 5.5 — Breakfast pool 是 DB-shape-dependent

DB-side reality (snapshot 2026-05-17):

| origin × meal | breakfast count |
|---|---|
| cantonese | 35 |
| northern | 30 |
| jiangnan | 16 |
| **sichuan** | **0** ← gap |
| western | 25 |

When 川 / 湘 / 黔 / 滇 users (西南 region → sichuan bucket) ask for
breakfast, the per-origin pool is empty. `pickBreakfastCombo()` now does
**pool-aware combo rotation**: starting from `eligible[dayIndex %
eligible.length]`, it walks forward and stops at the first combo whose
keywords resolve at least one slot. Universal-safe combos (`hometowns:
['*']`) act as the natural fallback because 豆浆/包子/馒头/油条/茶叶蛋
are present in DB regardless of regional skew.

End-state for 川 users **today**: they see universal 包子/豆浆/茶叶蛋
rather than 北方 menu by accident. Long-term fix is to backfill 川菜
breakfast rows (红油抄手 / 担担面 / 蛋烘糕 / 钟水饺 / 凉面 etc.).

The standalone `scripts/algo-e2e-by-hometown.ts` does NOT use
`pickBreakfastCombo` — it computes raw scoreDish output, so its
"家乡占比 0/10" for 川 users reflects DB reality not algorithm bug.
Real app behavior diverges via the combo template path.

## Rule 6 — Cache invalidation discipline

Any change to the scoring functions, slot allocator, breakfast template,
or cuisine filter **must** bump `ALGO_VERSION` in
`src/hooks/useWeeklyMenu.ts:59`. The constant is also re-imported by
`VerifyIngredients.tsx` for procurement scaling — never hardcode the
string in a downstream caller, always `import { ALGO_VERSION }`. Bump
history:

- v25 → v26: confidence-scaled learned-pref weight
- v26 → v27 → v28: hometown 30% dead-axis fixes
- v28 → v29 → v30: cuisine 4-way + kid-friendly bias
- v30 → v31: 20:00 day rollover + 粥 banned from lunch/dinner
- v31 → v32: equal per-hometown base + first-impression boost +
  seasonal + 快餐感 damp + breakfast hometown fallback
- v32 → v33: cumulative count + power curve replacing EMA
- v33 → v34: dinner cook-method variety (-0.30 per repeat)
- v34 → v35: hometown onboarding 改地域大区 (legacy 八大菜系 兼容)
- v35 → v36: pool-aware breakfast combo rotation (避免川人撞上空 sichuan combo)
- v36 → v37: western high-end bias (欧陆 +0.12 / 美式 fast-casual -0.08)

## Rule 6.5 — No `scoring_rules` config table (YAGNI verdict 2026-05-18)

A parallel session proposed creating a `scoring_rules` DB table to lift
the 17-axis weights + 5-axis scoreDish constants out of code into
configurable data, with a `USE_DB_SCORING_RULES` feature flag and
`UNIQUE (scope, axis_key, version)` for future A/B testing.

**Decided: do NOT build this table.** Reasoning (user-accepted 2026-05-18):

1. **No actual A/B demand**. Every algorithm change in v25→v37 was a
   single-direction forward bump with cache invalidation. No A/B
   infrastructure was ever needed and none is planned.
2. **Double source of truth risk**. Once the table has
   `hometown_match=0.60` AND the code has `score += 0.60`, future
   single-side edits cause drift. Rule 5 says "any scoring change must
   bump ALGO_VERSION" — that workflow is git-based and conflicts with
   "any config change runs a DB UPDATE".
3. **LLM agent self-knowledge has cheaper sources**. Composer / Critic
   prompts that want to reference algorithm axes should read this skill
   file (`.claude/skills/menu-scoring-philosophy/SKILL.md`) — written
   by humans, includes the *why*, naturally version-controlled — not
   a DB table of bare numbers.
4. **Config changes through SQL migration are slow**. Updating a number
   in a table requires `019_xxx.sql` + apply script + tracker INSERT +
   verification; the code-path is `git commit && git push`. Putting
   high-frequency tunables on the low-speed channel is reverse
   optimization.
5. **The proposal's own `USE_DB_SCORING_RULES = false` escape hatch
   confirmed the table would be dead infrastructure on day one.**

**Reopen this decision** if and only if one of:
- An actual production A/B test is scheduled (then design might be
  `experiment_assignments` table, not `scoring_rules` — closer to real
  need).
- LLM Composer/Critic ships and proves it needs structured access to
  axis weights that the SKILL.md narrative can't supply.

## Rule 7 — Disagree on the record

> 我提出的每次的优化思路，你可以提出反对意见，如果认为我的思路更好，
> 那么就学习我的思路，帮我优化成 skill。 — user, 2026-05-17

When the product owner proposes a change, the workflow is:

1. **State your reservation explicitly** if any (e.g. "EMA has decay so
   stale preferences cool off, your cumulative count won't").
2. **Implement the user's proposal** unless they ask for the alternative.
3. **Codify the resolved rule into this skill** so future sessions
   inherit it.

Disagreements that get resolved should leave a paper trail here.

## When to consult this skill

Trigger phrases (the description's `triggers:` list these too):

- Any task mentioning the scorer (scoreDish, scoreForWeek, applyFeedbackScore).
- Any change to hometown / origin / cuisine weighting.
- Any change to `user_preference_scores` semantics or storage.
- "提高 / 降低 某菜系的权重" — refer to Rules 0 + 1 before edits.
- "Cold start" / "首次推荐" — refer to Rule 3.
- "EMA" / "移动平均" / "幂次方" — refer to Rule 2.
- ALGO_VERSION bumps.
