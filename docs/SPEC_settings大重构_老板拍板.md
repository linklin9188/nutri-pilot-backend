# SPEC — Settings 大重构（老板拍板 "A" / 2026-05-24 22:30 HKT）

**TICKET 主**: TELEPOT-20260524-033（4 棒接力）
**作者**: Cowork CEO
**核心目标**：用户每填一个字段都对算法有作用，**口味满意 + 营养健康**两个都兼顾
**预计总耗时**：6-8 小时（跨 Database / Algorithm / UI 3 部门 4 棒）

---

## ⚠️ v2 更新（22:40 HKT 老板拍板"嵌入向量"算法范式）

**算法范式从 "Enum 字段填表" 改为 "嵌入向量 + 余弦相似度"**（Spotify / Netflix / TikTok 同款）。

### 0.1 两段式推荐

1. **第一段 - 读懂口味**（用户驱动）：图片选菜 → 算法用嵌入向量反推用户偏好
2. **第二段 - 营养平衡**（算法驱动）：在用户口味范围内（top 100 相似），按营养目标重排 + 过敏硬过滤

### 0.2 新 onboarding 流程（~20 秒，3 组图 + 2 问）

**Step 0：微信 silent fill**（0 秒）— city/province → hometown_cuisine；avatar_url/nickname → 显示

**Step 1：3 组图片选菜**（~9 秒，每组 4 张多选，至少选 1）：

| 组 | 维度 | 4 张代表菜照 |
|---|---|---|
| 1 | 食材大类 | 🥩 红肉 / 🐔 白肉 / 🦐 海鲜 / 🥬 素菜 |
| 2 | 口味菜系 | 🌶 辣中餐 / 🍵 清淡中餐 / 🍝 西餐 / 🍱 日韩 |
| 3 | 烹饪浓淡 | 🐟 清蒸鱼 / 🍖 红烧肉 / 🍤 油炸物 / 🥗 凉拌菜 |

每张图背后链一道 dishes 表里的"代表菜"，用户选 → 取代表菜的 feature_vector 累加。

**Step 2：2 个问**（~6 秒）：

| 问 | 选项 | 写入字段 |
|---|---|---|
| 忌口 | 海鲜 / 坚果 / 麸质 / 奶 / 蛋 / 不吃猪 / 牛 / 羊 / 无（多选）| `allergens` + `excluded_meats` |
| 近期目标 | 减脂 / 增肌 / 家庭 / 学龄增长 / 老人养生（5 选 1）| `dietary_goal` |

**Step 3 完成 → 跳 `/home`**

### 0.3 嵌入向量实施（manual 20 维，不用 Gemini embedding + pgvector）

**为什么 manual 20 维**：现在用户量小，manual 已足够；pgvector + Gemini embedding 是"未来主义"，等数据飞轮跑起来再升级。manual 工程量 1-2 小时 vs pgvector 1-2 天。

**20 维构成**：
- cuisine onehot **5 维**（chinese / western / japanese_korean / mixed / fusion）
- spice_level **1 维**（0-1 归一化）
- main_ingredient family onehot **8 维**（red_meat / white_meat / seafood / vegetable / tofu / egg / carb / mixed）
- cooking_method onehot **6 维**（steam / stir_fry / braise / boil / grill / deep_fry）
- **= 20 维**

**存储**：
- `dishes.feature_vector numeric[]`（20 维，预计算 by Algorithm 棒脚本）
- `user_profiles.preference_vector numeric[]`（20 维，onboarding 后写入，用户 swap 时 fine-tune）

**算法**：
- 用户初始 vector = onboarding 选的代表菜 feature_vector **取加权平均**
- 推荐 = `cosineSimilarity(user_vec, dish_vec)` top N → **营养目标重排** → **过敏硬过滤** → 返回
- 用户 swap → vector 微调（复用现有 `prefScores` 机制）

### 0.4 接力调整（v2）

| 棒 | v1 plan | v2 调整 |
|---|---|---|
| 第 1 棒 Database | 加 19+ 字段 schema | ✅ 已 ship commit `3d0b460` |
| 第 1.5 棒 mini-migration 085 | （未规划）| ⏳ 在跑（补 `household_members.name` + `dietary_goal`）|
| 第 2 棒 Algorithm | 读 19+ 字段打分 | 🔄 **嵌入向量 + 余弦 + 营养重排**；加 `dishes.feature_vector` 列 + 脚本预计算所有 dish vector |
| 第 3 棒 UI Settings | 让用户填 19+ 字段 | 🔄 **只显示反推结果 chip** + 头像区修（合并 UI-031c）+ 家人独立卡 |
| 第 4 棒 UI onboarding | 问 5 字段 | 🔄 **3 组图 + 2 问** 流程（代表菜照绑定 dishes.id）|

---

## 1. 范围（按"全家 vs 个人"分两类）

### 1.1 全家层面（共 9 字段，全家共享，存 `user_profiles`）

| # | 字段名 | 类型 | 选项 / 说明 |
|---|---|---|---|
| 1 | `hometown_cuisine` | text | 粤 / 川 / 北方 / 江南 / 客家 / 西北 / 东北 / 等（**已有**，复用） |
| 2 | `cuisine_preference` | text | `chinese` / `western` / `japanese_korean` / `mixed`（主菜系比例） |
| 3 | `spice_tolerance` | text | `none` / `mild` / `medium` / `heavy`（全家最低能吃的辣度）|
| 4 | `taste_intensity` | text | `light` / `medium` / `rich`（口味浓淡）|
| 5 | `cooking_methods_pref` | text[] | `['steam','stir_fry','braise','boil','grill','deep_fry']` 多选偏好 |
| 6 | `excluded_meats` | text[] | `['pork','beef','lamb','chicken','duck']` 家里没人吃的肉 |
| 7 | `excluded_ingredients` | text[] | `['bitter_melon','eggplant','cilantro','tofu']` 食材忌口 |
| 8 | `cooking_frequency_per_week` | int | 1-7（每周做菜天数，剩下外卖）|
| 9 | `budget_level` | text | `economy` / `medium` / `premium`（影响食材推荐价位）|

### 1.2 个人层面（每个家人独立，共 10 字段，存 `household_members`）

| # | 字段名 | 类型 | 选项 / 说明 |
|---|---|---|---|
| 1 | `name` | text | 称呼显示（**已有**） |
| 2 | `relation` | text | `self` / `spouse` / `son` / `daughter` / `father` / `mother` / `etc` |
| 3 | `gender` | text | `male` / `female` |
| 4 | `age_years` | int | 真实年龄 |
| 5 | `height_cm` | int | 身高 |
| 6 | `weight_kg` | numeric | 体重（→ 算法算 BMI）|
| 7 | `dietary_goal` | text | `muscle_gain` / `fat_loss` / `pregnancy_prep` / `child_growth` / `elder_wellness` / `general` |
| 8 | `allergens` | text[] | `['seafood','gluten','nuts','milk','eggs']` **硬过滤** |
| 9 | `chronic_diseases` | text[] | `['hypertension','diabetes','gout','high_cholesterol']` → 触发 12 健康标签 |
| 10 | `dietary_mode` | text | `omnivore` / `vegetarian` / `vegan` / `halal` / `kosher` |
| 11 | `tcm_constitution` | text | 8 体质：`balanced` / `qi_deficient` / `yang_deficient` / `yin_deficient` / `phlegm_damp` / `damp_heat` / `blood_stasis` / `special_diathesis` |
| 12 | `pregnancy_status` | text? | （女性才问）`none` / `trying` / `early` / `mid` / `late` / `breastfeeding` |

### 1.3 自动学习（不让用户填，已有）
- `prefScores` — 用户换菜 / 评分自动学
- 微信 OAuth 自动填：`avatar_url` / `nickname` / `wechat_sex` / `city` / `province`（已 ship migration 081）

---

## 2. 渐进收集策略（避免填表过重）

| 阶段 | 在哪 | 问啥 | 字段数 | 用户负担 |
|---|---|---|---|---|
| **新用户必填** | onboarding 单步 | 5 字段：**健康目标 / 辣度 / 家乡 / 过敏原 / 年龄段**（微信能拿家乡 silent 自动填，实际手动 4 个）| 4-5 | 30-45 秒 |
| **加家人** | ❌ onboarding **不问** | 默认 1 人 = "你自己"，用户在 Settings 主动 "+ 加家人"（老板拍板 "考虑用户耐心"）| 0 | 0 |
| **全家进阶** | Settings 全局**抽屉收起** | 全家剩 5：浓淡 / 烹饪方式 / 主肉忌 / 食材忌 / 预算 | 5 | 想调才点开 |
| **个人进阶** | Settings 家人详情页**抽屉收起** | 每人剩 7：BMI / 过敏 / 慢病 / 饮食模式 / 体质 / 孕期 | 7/人 | 想调才点开 |
| **自动** | 后台 | 不显示 | 0 | 0 |

---

## 3. 4 棒接力（单线串行避 race）

### 第 1 棒：Database（60-90 分钟）

**migration `084_user_profile_household_member_v2.sql`**：

- `user_profiles` `ADD COLUMN IF NOT EXISTS` 8 列（全家除 hometown_cuisine 外，全 nullable）
- `household_members` `ADD COLUMN IF NOT EXISTS` 11 列（个人除 name 外，全 nullable）
- 每列加 `COMMENT ON COLUMN` 标注用途
- 不破现有数据：旧用户读到 null → 算法走 default

**完工**：commit + push + 写技能沉淀。

### 第 2 棒：Algorithm（60-90 分钟）

- `scoreDish` / `scoreForWeek` 读全部 19+ 维度
- per-member 评分：用 `household_members` 各人字段
- 微信 `province` 自动 fallback `hometown_cuisine` 如果用户没手填（解决 Smell 2 同步缺失）
- **bump `ALGO_VERSION`** v64 → v65（如果 swap fix 已 bump，则 v66）
- 合并 **Algo-032**（微信地域自动填）— 一次性 bump 不浪费

**完工**：写 audit 报告"哪些字段缺数据 default 偏向" + 写技能沉淀。

### 第 3 棒：UI Settings 全局 + 家庭成员（1.5-2 小时）

- 改 `src/pages/Settings.tsx`：
  - "我的口味偏好" → 重做为**全家 9 字段双层**（基础 4 + 抽屉 5）
  - "家庭成员"入口 → 点开新设计（每人基础 3 + 抽屉 7）
  - **顶部头像区**：读 `user_profiles.avatar_url` + `nickname` 替换 "你" 占位 + userId 短码（合并 **UI-031c**）
- 不动 `Login.tsx` / `userId.ts`

**完工**：commit + push + 技能沉淀。

### 第 4 棒：UI onboarding 重做（1-1.5 小时）

- 改 `src/pages/QuickSetup.tsx` 或对应文件：
  - 第 1 步必填：我自己 5 字段（微信能拿的 silent 填，不问）
  - 第 2 步必填：加家人，每人 3 字段
- onboarding 完成后跳 `/home`（而不是中间停留）

**完工**：commit + push + 技能沉淀。

---

## 4. 真测路径（每棒 ship 后老板验证）

| 棒 | 真测步骤 |
|---|---|
| 1 Database | 跑 curl 查 user_profiles + household_members schema 看新列已加 |
| 2 Algorithm | 用无痕窗口看 `/weekly` 菜单变化（如果你填了新维度，菜单应反映） |
| 3 UI Settings | 用无痕窗口 `/settings` 看 → 全家 9 + 家人 10 字段都在；头像显示真微信头像；昵称显示真昵称 |
| 4 UI onboarding | 用无痕窗口注册新用户 → 应被引导走 2 步必填流程 |

---

## 5. 红线

- `ALGO_VERSION` 必 bump
- 不动 `auth.users`
- 不破现有用户（migration 新列全 nullable，旧用户读到 null 走 default）
- 老板私人信息（邮箱 / 微信号 / 真名 / 手机）不进任何字段
- 不破匿名用户路径（如果有 `getUserId()` 但没 `nickname`，UI fallback 到 userId 短码）

---

## 6. 合并的已有 P1 工单

- **UI-031c**（微信头像显示 bug）→ 合并进第 3 棒 UI Settings
- **Algo-032**（微信地域自动填）→ 合并进第 2 棒 Algorithm

→ 不单独派，避免多次 ALGO_VERSION bump 折腾。

---

**END OF SPEC**
