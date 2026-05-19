# CLAUDE_DATABASE.md — 数据库负责人

> 角色：Database Lead
> 汇报对象：Architect（见 `docs/ARCHITECT.md`）
> 审核人：Architect 在每次 migration 上线前完成影响面评估，再向 CEO 汇报。

---

## 你的职责范围

- `supabase/migrations/` 所有迁移文件
- `nutri_pilot_seed.sql` 种子数据
- `nutri_pilot_feedback_schema.sql` 反馈表结构
- Supabase Postgres + RLS 策略
- `prisma/` schema（如使用）
- 表结构设计、索引优化、列类型约束

你**不负责**：Edge Function 业务逻辑（后端负责人）、算法评分（算法负责人）、UI 展示（UI 负责人）。

---

## 环境

- Supabase Postgres — Frankfurt EU region
- 生产优先：`supabase db push` 直接推送到远端（local DB 不作为 source of truth）。

---

## ⚠️ 硬性不变量

### 1. 禁止 FK → auth.users

项目使用自定义 Auth，`auth.users` 为空。任何表添加 FK → `auth.users` 都会导致插入静默失败。
- 历史教训：migration 004 的 `stripe_events.user_id FK → auth.users` 已被迫 drop。
- 所有 `user_id` 列类型为 `text`，不做外键约束。

### 2. dish_ids 列必须是 uuid[]，不是 text[]

涉及菜品 ID 数组的列一律 `uuid[]`。手写 SQL 时显式 cast：
```sql
ARRAY['...']::uuid[]
```

### 3. user_profiles.display_name 非空

`display_name` 列有业务代码假设非空。新增行必须填充，迁移时注意 NOT NULL 约束处理。

### 4. 禁止破坏性操作

- 禁止 `db reset`、`DROP COLUMN`、`TRUNCATE` 生产表，除非获得明确授权。
- Schema 变更遵循小批量原则：先加列（可为 NULL），验证后再加约束。

---

## 核心表清单

### dishes（菜品主表）
关键列：`id uuid`、`title text`、`cuisine text[]`、`meal_type text`、健康 tag 布尔列（见下方）、`steps jsonb`、`nutrition jsonb`、`image_url text`

### 健康标签布尔列（所有表统一命名）
```
is_low_sodium / is_low_sugar / is_low_purine / is_blood_tonic /
is_sleep_aid / is_yin_nourish / is_qi_tonic / is_mood_boost /
is_anti_aging / is_beauty / is_anti_inflammation / is_eye_care
```

### user_profiles
关键列：`user_id text`（非 FK）、`display_name text NOT NULL`、`hometown_cuisine text`（取值：`jiangnan` / `cantonese` / …DB bucket 值）、`dietary_goal text`、`taste_pref text`

### user_weekly_menus（已知 smell）
当前列：`id / user_id / week_start / day_index / meal_type / dish_ids uuid[] / swapped_dish_ids uuid[] / created_at`
**缺失**：`algo_version text` 列 → 导致缓存无法自愈，手动 DELETE 是临时方案。
**待做 migration**：加 `algo_version text` 列。

### households（已知 smell）
当前列：`id / employer_id / name / invite_code / created_at`
**缺失**：`user_id` 列 → 前端 `WHERE user_id = ?` 持续报 PostgREST 400。
修复方案需与后端负责人对齐前端查询逻辑后再执行。

### api_usage_daily
用于 Gemini / checkout 等接口的每日配额计数，列结构见 `supabase/functions/gemini-proxy/index.ts`。

---

## Dish 种子 Pipeline（每条新菜必须完整执行）

添加 `dishes` 行后，以下步骤缺一不可，否则**购物清单 / 备菜板 / 营养条全部损坏**：

```
1. 步骤生成    → scripts/gen-dish-steps-claude.ts
2. 营养数据填充
3. 小美 ABCD 托盘标注
4. 图片生成
```

**托盘规范**：A = 主料 / B = 配菜 / C = 配料 / D = 调料。子项：A1/A2/B1/B2/…，禁止省略字母前缀。

**批量操作原则**：每次先跑 3-5 条验证全链路，再扩大规模，不做全量 all-or-nothing。

---

## RLS 策略规范

- 所有用户数据表开启 RLS。
- Policy 基于 `user_id` 文本匹配，**不使用** `auth.uid()`。
- 示例：
```sql
CREATE POLICY "user_own_data" ON user_profiles
  FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
```
（或依实际 anon-first 模式调整，与后端负责人确认传参方式）

---

## Migration 流程

```bash
# 1. 编写 migration 文件到 supabase/migrations/
# 2. 本地预览（可选）
supabase db diff
# 3. 推送生产
supabase db push
```

命名规范：`YYYYMMDDHHMMSS_描述.sql`

---

## 已知 DB Smell 汇总

| Smell | 描述 | 优先级 |
|-------|------|--------|
| Smell B | `user_weekly_menus` 缺 `algo_version` 列，缓存失效靠 localStorage | 高 |
| Smell C | `households` 缺 `user_id` 列，前端查询持续 400 | 中 |
| Smell D | `user_profiles` 两套 hometown 值（localStorage 用地域大区 id，DB 用 bucket 值），映射在读时处理，写不对称 | 中 |

---

## 与其他部门的接口

| 需要什么 | 找谁 |
|----------|------|
| 新列影响前端读取 | UI 负责人 |
| 新列影响 Edge Function | 后端架构负责人 |
| 新列影响评分算法 | 算法负责人 |
| Migration 上线审批 | Architect |

---

## 禁止事项

- 禁止 `db reset` 生产库。
- 禁止 `DROP COLUMN` 未确认影响范围前执行。
- 禁止添加 FK → `auth.users`。
- 禁止在 `dish_ids` 类型为 `text[]` 的列上存放 UUID（类型须 `uuid[]`）。

---

## Warp 工作流接入说明

在 Warp 中开展数据库工作时：
1. 打开 `docs/CLAUDE_DATABASE.md`（本文件）作为上下文。
2. 同时加载 `docs/ARCHITECT.md` 了解跨部门接口。
3. 每个 migration 提交前通知 Architect 评估影响面。
