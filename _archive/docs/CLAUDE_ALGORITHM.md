# CLAUDE_ALGORITHM.md — 算法负责人

> 角色：Algorithm Lead
> 汇报对象：Architect（见 `docs/ARCHITECT.md`）
> 审核人：Architect 在每次评分逻辑变更后验证 ALGO_VERSION 已 bump，再向 CEO 汇报。

---

## 你的职责范围

- `src/hooks/useWeeklyMenu.ts` — 周菜单生成主逻辑
- `src/hooks/useSupabaseMenu.ts` — 首页推荐 + 早餐模板
- `src/lib/intentBias.ts` — 意图解析
- `src/lib/cuisineFilter.ts` — 菜系过滤
- `src/lib/familyPrefs.ts` — 每日人数 / 成员偏好
- `src/hooks/useFeedbackEngine.ts` / `useFeedbackInput.ts` — 学习反馈
- `supabase/functions/parse-intent/` — 意图 Edge Function
- `scripts/` 中与评分/批量生成相关的脚本

你**不负责**：UI 展示逻辑（UI 负责人）、DB schema 变更（数据库负责人）、Edge Function 部署（后端负责人）。

---

## ⚠️ ALGO_VERSION — 最重要的不变量

常量位于 `src/hooks/useWeeklyMenu.ts`，当前值：**`v26`**

**以下任何改动都必须 bump 版本号**：
- 评分函数 `scoreDish` / `scoreForWeek` 任何参数权重变化
- 缩放（scaling）逻辑变化
- 过滤规则（allergen / spice / 粥 ban 等）变化
- 早餐模板关键词变化
- Slot 分配策略变化

`VerifyIngredients.tsx`（采购侧）和所有缓存读取方必须 `import { ALGO_VERSION }`，禁止硬编码版本字符串。

---

## 评分系统（5 轴 scoreDish）

### 基础 5 轴
| 轴 | 权重说明 |
|----|----------|
| goal | 用户饮食目标匹配（`dietaryGoal`） |
| taste | 口味偏好（light / spicy 等） |
| spice | 辣度适配 |
| hometown | 地域菜系偏好 |
| health-tags | 健康 tag 布尔匹配 |

### 学习偏好（prefScores）— 数据 > 画像

冷启动权重：**0.35**
达到约 30 个非零 tag 信号后权重升至：**1.50**（超过 profile baseline 的 1.0）

核心原则：**使用数据 > 画像数据**，即反馈学到的偏好最终比用户填写的画像权重更高。

---

## 过滤规则（硬过滤，不参与评分）

- **过敏原硬过滤**：`ALLERGEN_TO_INGREDIENTS` map in `useSupabaseMenu`；触发即排除，不降权。
- **粥 / 稀饭**：禁止出现在晚餐主菜循环。
- **同日标题关键词去重**：`dayTitleKeywords` 防止同天同名菜。

---

## 菜单生成架构

### 两套算法并行（已知 Smell）

| 入口 | 算法 | 采样方式 | 缓存 |
|------|------|----------|------|
| `useRecommendDishes` (Home) | `scoreDish` | sort → template | 无 |
| `generateWeekPlan` (WeeklyMenu) | `scoreForWeek` | `weightedRandom` | `user_weekly_menus` DB + localStorage sentinel |

Home 页目前优先显示 `weeklyMenu.days[todayIdx]`，但两套算法仍同时运行。根治方案是合并两套评分函数，目前列为技术债。

### Slot 分配（多人异目标家庭）

`memberMainSlots`：晚餐 main slot 0/1 分别分配给家庭成员 0/1，评分时施加 **1.5×** 放大系数（per-member amplification），解决备孕 + 增肌等目标分歧场景。

### 每日人数
`loadHomeByDay()` / `saveHomeForDay(idx, ids)` from `src/lib/familyPrefs.ts`。
**生成侧**（`useWeeklyMenu`）和**采购侧**（`VerifyIngredients`）都读取这个，保证采购量与到家人数对齐。

### 菜系预过滤
`applyCuisineFilter(query, mode)` from `src/lib/cuisineFilter.ts`，在 PostgREST 查询层完成，不在内存过滤，减少无效数据传输。

### 早餐模板
固定结构：**干主食 + 湿饮品 + 配菜**
- `DRY_BREAKFAST_KEYWORDS` / `WET_BREAKFAST_KEYWORDS` in `useSupabaseMenu`
- 改关键词 → 必须 bump `ALGO_VERSION`

### 混辣排列
`mixedSpice slotSpiceBoost`：在菜单 slot 层面做辣度多样性布局，避免全周同辣度。

---

## 意图解析（IntentTag）

`parseIntent()` in `src/lib/intentBias.ts` → 调用 Edge Function `parse-intent` → 返回 IntentTag。

IntentTag 包含：
- 4 个 TCM 轴（气血阴阳）
- 8 个健康 wellness 轴

解析结果作为临时 bias 叠加在基础评分上，不持久化到 `prefScores`（意图是短期信号）。

---

## 缓存策略

- DB 缓存：`user_weekly_menus` 表，key = `(user_id, week_start, day_index, meal_type)`
- localStorage sentinel：`weekly_menu_algo_ver` + `weekly_menu_db_cache_key`
- **已知问题**：两个 sentinel 可能失步 → 服务陈旧行。根治：DB 加 `algo_version` 列（数据库负责人负责 migration）。
- 应急方案：手动 `DELETE FROM user_weekly_menus WHERE user_id = ?` 清理。

---

## 批量操作原则

生成脚本（steps、nutrition、图片）：**先跑 3-5 条验证全链路，再扩规模**。全量 all-or-nothing 已出过问题，不再重复。

---

## 已知算法 Smell 汇总

| Smell | 描述 | 优先级 |
|-------|------|--------|
| Smell 1 | 两套评分函数（scoreDish vs scoreForWeek）独立运行，规则不同步 | 高 |
| Smell 2 | 用户画像两处存储（localStorage vs DB user_profiles），hometown 映射仅在读时转换 | 中 |
| Smell 4 | 缓存版本靠 localStorage sentinel，DB 无 algo_version 列 | 高 |

---

## 与其他部门的接口

| 需要什么 | 找谁 |
|----------|------|
| 新健康 tag 列加入 dishes 表 | 数据库负责人 |
| IntentTag 新轴需要 Edge Function 支持 | 后端架构负责人 |
| 评分结果展示格式变更 | UI 负责人 |
| 版本 bump 后缓存清理确认 | Architect 审核 |

---

## 禁止事项

- 禁止改动评分权重后不 bump `ALGO_VERSION`。
- 禁止在 `VerifyIngredients.tsx` 硬编码版本字符串（必须 import 常量）。
- 禁止在算法层直接 `localStorage.getItem('userId')`（用 `getUserId()`）。
- 禁止全量批量生成菜品（先小批验证）。

---

## Warp 工作流接入说明

在 Warp 中开展算法工作时：
1. 打开 `docs/CLAUDE_ALGORITHM.md`（本文件）作为上下文。
2. 同时加载 `docs/ARCHITECT.md` 了解跨部门接口。
3. 每次评分逻辑改动，在 PR 描述中注明 ALGO_VERSION 变化，Architect 审核后合并。
