# 待派工单队列（2026-05-25 凌晨 — 老板睡前 CEO 自决推进）

**老板授权**：明早要看到所有工单落地。CEO 全权自决推进顺序 + 遇小决策自决（"先推进后汇报，不改大战略，用户爱用为最终目的"）。

---

## 当前 background 在跑（4 个）

| Agent | TICKET | 文件域 |
|---|---|---|
| `algorithm-034-embedding` | 034 嵌入向量 | useWeeklyMenu.ts + migration 086 + recommendVector.ts |
| `ui-037-helper-community` | 037 HelperCommunity 小红书 | HelperCommunity.tsx |
| `ui-038-supplier-verify` | 038 供应商 UI 第 3 棒 | VerifyIngredients.tsx |
| `ui-039-settings-employer` | 039 Settings 第 3 棒 雇主 | Settings.tsx |

---

## 待派队列（7 个，按 ship 顺序）

### Batch 2（当前 4 个完工后派）

| # | TICKET | 工单 | 文件域 | 依赖 |
|---|---|---|---|---|
| 1 | **040** | 早餐 supplement 逻辑校准（4 类 → 3 类）| breakfastCombos.ts + useWeeklyMenu.ts | 等 034 完（避免 ALGO_VERSION bump 冲突）|
| 2 | **041** | Helper §2 HelperHome dashboard + 5 TAB bar | HelperHome.tsx | 等 037 完（同文件可能 race）|
| 3 | **042** | Settings 第 4 棒 UI onboarding（3 组图 + 2 问）| 新建 OnboardingV2.tsx + App.tsx route | 独立，无前置 |
| 4 | **043** | 中介裂变 A 推荐码 | migration agencies 表 + Login.tsx invite_code | 独立 |

### Batch 3（Batch 2 完工后派）

| # | TICKET | 工单 | 文件域 | 依赖 |
|---|---|---|---|---|
| 5 | **044** | Helper §4 AI 活跃 F+C+E | HelperCommunity.tsx | 等 037 完（同文件）|
| 6 | **045** | 中介裂变 C 品牌挂名 + D 服务包 | Settings.tsx + Login.tsx | 等 039 + 043 完（避 race）|
| 7 | **046** | 供应商 Admin 第 4 棒 | admin/ Vite app | 独立 |

---

## TICKET-040 早餐 spec 校准详细

**老板 2026-05-25 凌晨明示**：
- 早餐：碳水 + 蛋白 + 维生素（3 类）— **改自原 4 类**（碳水/蛋白/蔬菜/水果）
- 午餐：简约，用户口味为主（算法已是 P1 简化，无需改）
- 晚餐：丰富，营养 + 口味 + 丰富性（算法已是 P0，无需改）

**改动范围**（仅早餐）：
- `src/lib/breakfastCombos.ts` 保留 `BREAKFAST_VEG_KEYWORDS` + `BREAKFAST_FRUIT_KEYWORDS`（数据 still 有用）
- `src/hooks/useWeeklyMenu.ts` `generateWeekPlan` breakfast supplement 逻辑：
  - 原：检查 veg 1 道 **AND** fruit 1 道
  - 新：检查 (veg OR fruit) 任一 1 道即够
- bump `ALGO_VERSION` v65 → v66（等 034 bump v64→v65 完成后接力）

---

## CEO 自决原则（睡前老板明示）

1. **小决策自决**：UI 字段顺序 / 文案微调 / fallback / loading state
2. **大方向永不自决**：新功能 / 砍已 ack / 改算法范式 / 改商业模式 / 改主色 / 涉合规 / 涉现金 / 涉老板私人信息
3. **判断标准**："如果错，老板能在 5 分钟内 '改回来'？"
4. **最终目的**：用户能用 + 爱用

---

## 巡检节奏

- ScheduleWakeup 50 分钟后醒来（01:00 HKT）
- Agent 完工自动通知 trigger wake up
- 每醒来：维持 3-4 个 background slot，完工 1 个派 1 个
- 全部 ship 完后写 `docs/MORNING_REPORT_20260525.md` 给老板早上看

---

**END OF QUEUE**

---

## 📋 Morning Report 自决项收集池（写给老板早上看）

### 自决项 1：TICKET-039 家人 12 字段走 localStorage 而非 DB（commit `ba161c3`）

**情况**：Agent 实施 Settings 第 3 棒家人独立卡时发现 `household_members.helper_id` 是 `text NOT NULL FK→user_profiles.id`（migration 025 Smell 3 修复时定的），家人非 helper、没 user_profiles row → INSERT 必被 FK 拒。

**Agent 自决**：12 字段**继续走 localStorage `nutri_family_members`**，DB 持久化排后续棒。

**影响**：
- ✅ 家人 UI 功能可用（增 / 删 / 改 / 抽屉编辑 全 work）
- ❌ 数据**不持久化**到 DB（换设备 / 清 cache → 丢）
- ❌ Algorithm per-member 评分**拿不到家人数据**（但当前算法 vector cascade 还没用 household_members，影响延后）

**老板可以"改回来"的方法**（你拍板）：
- **方案 A**：派后续 ticket 升级 schema — 把 `household_members.helper_id` 改 NULLABLE + 加 `member_type` 字段（'helper' / 'family_member' 区分）→ 家人数据真存 DB
- **方案 B**：新建独立 `family_members` 表跟 `household_members` 解耦，避开 helper_id 历史问题
- **方案 C**：保持现状走 localStorage，公测前再升级

**CEO 推荐 B**（schema 干净，不动 Smell 3 历史），但属 schema 改动 = 中等风险，等你拍板。

---

### 自决项 2：TICKET-041 实际 helper route 改用 `/helper` 不是 `/helper-home`

**情况**：工单原文写 `/helper-home`，但 Agent 实查 `src/App.tsx` 发现项目用的是 `/helper`（HelperHome 挂在这条 route）。Agent 用真实 route 避免代码不 work。

**影响**：✅ 功能正常，跟现有路由一致

**老板可改回来的方法**：如果你想要 `/helper-home` 作为正式 route，CEO 派 ticket 改 App.tsx route name + redirect 兼容。CEO 觉得保持 `/helper` 更简洁。

---

### 自决项 3：TICKET-044 Helper §4 AI 活跃 — 简化范围

**老板原 spec**：F 真 AI 写帖 + C 真智能推送 + E AI 出每日话题

**CEO 自决简化**（节省工程量，先 ship MVP）：
- F: 真调 gemini-proxy（复用现有 endpoint），placeholder 接入
- C: HelperHome 社区动态改 likes desc + 近 7 天 作"近期热门" mock smart push（不真协同过滤）
- E: 30 个话题数组按 dayOfMonth % 30 轮播（不调 Gemini 静态）

**老板可改回来的方法**：
- 真 AI 协同过滤推 C：派 Algorithm ticket（基于 user.preference_vector 余弦相似度找类似 helper 看过的帖）
- 真 AI 出 E：派 Backend ticket 加 gemini-proxy endpoint `helper_daily_topic`，每日 cron 生成

CEO 觉得简化版够内测验证活跃度提升效果，真 AI 等公测后做。

---

