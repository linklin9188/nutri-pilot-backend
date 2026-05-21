# SCHEMA AUDIT — 2026-05-21

工单：TELEPOT-20260521-012 §E
作者：Database Lead
范围：全表 audit，时点是 migration 066（dishes video 3 列）push 后远端 schema 的状态。

---

## §0. 前言 / 方法学声明

本 audit 的**数据来源**：
- `supabase/migrations/*.sql`（001…066，共 58 个文件，3 个 _archive_ 备份表跳过）
- `CLAUDE.md` 中固化的不变量与字段语义记录
- 当前 session 已 push 的最后一棒是 `066_add_dishes_video_columns.sql`（本工单 §B 棒）

**未能实测的部分（务必知会复审）**：
1. **实际填充率（NULL ratio）**：本机 `psql` 未装，无法直连远端跑 `SELECT COUNT(*) WHERE col IS NOT NULL`。
   §5 0% 填充列是**基于 migration 时间线推断**——某列若是新 ADD COLUMN
   且**未见配套 backfill migration**，即标"高概率 NULL"。落地需后续部门补 psql 验证。
2. **EXPLAIN ANALYZE**：同样无法实测。§6 缺失索引候选是基于代码 query path 推断。
3. **当前行数（row count）**：未实测；引用值取自 CLAUDE.md 及前序工单 (TICKET-006
   "924 dishes" / Smell 3 P3 "2 行 households_members" 等) 已记录的数字。

**核心三表的 schema 缺口**：`dishes` / `user_profiles` / `user_weekly_menus`
**没有任何 CREATE TABLE migration 在 `supabase/migrations/` 下**。它们是 Supabase
Studio UI 在 migrations 启用前手建的，或更早的 migration 在某次清库时丢失。
当前 schema 的真相**只能通过 `information_schema.columns` 查远端反推**——本 audit
对这三表的列名/类型用 migration 历史中的 `ADD COLUMN` 与 `ALTER COLUMN` 累积重建。

---

## §1. `dishes` 表 audit

### 1.1 列推断（基于 14 个 ALTER 类 migration 累积）

涉及 dishes 的 migration：007 / 008 / 015 / 017 / 018 / 020 / 029 / 030 / 032 / 039 / 059 / 060 / 062 / 063 / 064 / 066。
合计 ADD 列估算 **≥ 40 列**。分类：

| 分类                  | 代表列                                                                | 来源 migration         |
|----------------------|-----------------------------------------------------------------------|------------------------|
| 标识 / 核心元数据      | `id (uuid PK) / title_zh / title_en / origin_cuisine / meal_type / course_type` | 上古（pre-001）        |
| 蛋白质 + 油盐糖三轴    | `protein_main_class / oil_level / salt_level / sugar_level`           | 059 / 008              |
| 烹饪方法              | `cooking_method` (14 fine values) **+ `cook_method`** (legacy 双列)   | 059 / 上古             |
| 健康标签布尔（12 wellness）| `is_low_sodium / is_low_sugar / is_low_purine / is_blood_tonic / is_sleep_aid / is_yin_nourish / is_qi_tonic / is_mood_boost / is_anti_aging / is_beauty / is_anti_inflammation / is_eye_care` | 032 + 039              |
| 家庭友好标签           | `is_kid_friendly / kid_acceptance_score / is_elderly_friendly / is_prenatal_friendly / is_lactation_friendly` | 017 + 039              |
| 节令 / 文化 / 西餐分类 | `cultural_note / festival_tags (text[]) / western_subtype`            | 015 / 030 / 018        |
| 小美 ABCD 兼容        | `xiaomei_compatible (bool) / xiaomei_incompat_reason`                 | 007                    |
| 营养七连              | `protein_g / fat_g / carb_g / calcium_mg / iron_mg / fiber_g / vitamin_c_mg / nutrition_kcal_per_serving` | 008 + 064              |
| 评分 / 反馈           | `health_score / helper_friendly_score / hk_availability_score / repeat_rate` | 018                    |
| 教学视频（NEW 066）   | `video_url / video_lang / video_platform`                             | **066（本棒）**        |
| 时间戳                | `created_at / last_scored_at / last_backfilled_at`                    | 018 / 020              |
| 向量 + JSON 杂项      | `embedding (vector(768)) / meta (jsonb)`                              | 020 / 029              |

### 1.2 重要异常

#### 异常 A：`cook_method` ⊕ `cooking_method` 双列共存（TICKET-008 / TICKET-010 blocker）

- `cook_method`：早期列，14+ src 文件直接消费（`useWeeklyMenu.ts` 同日烹法去重 +
  `scanMatch.ts:153` PostgREST select 列 + `dailyNutrition.ts:156` methodSet 等共 24 行命中）
- `cooking_method`：059 v3 metadata 棒新加，14 fine values 枚举值，**仅 migration 写入**
- 风险：未来 backfill 若分别填两列、值不同步，会导致算法层取错列。**TICKET-010 已挂 blocker
  待 CEO 在三方向（A 反向 DROP / B 迁移 src / C 留双列加 COMMENT）中拍板**。

#### 异常 B：`festival_tags text[]` 缺 gin index

030 加了 `festival_tags text[]` 但没建 gin index。若做 `WHERE festival_tags @> '{spring_festival}'`
查询 → 全表扫。建议跑（参 §6）：`CREATE INDEX idx_dishes_festival_tags_gin ON dishes USING gin (festival_tags) WHERE festival_tags <> '{}';`

#### 异常 C：12 wellness 布尔列均未建 partial index

032 + 039 加了 12 个 `is_*` 列、用 `WHERE is_low_sodium = true` 当 hard filter 路径。
**只有 002+ 老路径 `salt_level='low'` / `oil_level='low'` 有 partial index**
（`dishes_low_salt_idx` / `dishes_low_oil_idx`）。新 12 个 wellness 字段全部 sequential scan。
样本数 ~924 行小，**当前慢不明显**，但 Phase 2 扩到 ≥ 2k 后会显现。

### 1.3 行数（引用值）

CLAUDE.md / TICKET-006 引用 **924 行**（Phase 2 扩容已加 250 道，但 Backend 070 image_url / cook_steps pipeline 尚未跑完，**102 道为新生未挂图新菜**）。

---

## §2. `user_profiles` 表 audit

### 2.1 列推断（基于 005 / 010 / 058 / 002 等多棒累积）

`user_profiles` 没有 CREATE TABLE 在 migrations，**列推断依赖 ALTER 历史**：

| 列名                       | 类型              | 来源        | 备注                                          |
|----------------------------|-------------------|-------------|-----------------------------------------------|
| `id`                       | `text PRIMARY KEY`| 上古        | **不是 uuid**——存的是 localStorage userId    |
| `display_name`             | `text NULL`       | 010         | 应用层假设非空，**DB 实是 nullable**（Smell 1 备忘）|
| `stripe_customer_id`       | `text`            | 002         | partial index `idx_user_profiles_stripe_customer` |
| `stripe_subscription_id`   | `text`            | 002         | partial index 同上                            |
| `subscription_plan`        | `text`            | 002         | `free / monthly / yearly`                     |
| `subscription_end_at`      | `timestamptz`     | 002         |                                                |
| `is_pro`                   | `boolean`         | 002         |                                                |
| `wechat_openid / unionid`  | `text`            | 005         | 公众号网页授权 — 未上线                       |
| `protein_pref / staple_pref / breakfast_cuisine` | `text` | 058 v3 axes | 配 v3 metadata                                 |
| `onboarding_version`       | `text`            | 010         | 用于 onboarding 改版后强制重做                 |
| `created_at / updated_at`  | `timestamptz`     | 上古        |                                                |
| `hometown_cuisine / dietary_goal / taste_pref` | `text` | 上古 + 058 | Smell 2 涉及（与 localStorage 双源）       |

### 2.2 已知异常

#### 异常 D：`display_name` schema-应用层偏离（**CLAUDE.md 已记录**）

- 应用层多处 `up.display_name.toLowerCase()` 等假设非空写法
- DB `information_schema.columns is_nullable=YES`（Database 2026-05-19 P3 实查）
- **未来某天**两种修法二选一：DB 改 NOT NULL + DEFAULT '' / 应用层 null-safe。
- 本审计**不修**——只标"已知偏离，遇 NULL 时 fallback 到 `userId.slice(0,8)`"。

#### 异常 E：主键名歧义

- 主键叫 `id text`（非 `user_id`）
- 多棒 FK 目标曾写错为 `user_profiles(user_id)`（不存在）。
- 本审计强调：**所有 FK 目标只能写 `user_profiles(id)`**。
- CLAUDE.md 已硬编码此规则。

---

## §3. `user_weekly_menus` 表 audit

### 3.1 关键列（基于 024 + 引用 Smell 4 修复）

| 列名              | 类型             | 来源        | 备注                                          |
|-------------------|------------------|-------------|-----------------------------------------------|
| `id`              | `uuid PRIMARY KEY` | 上古       |                                                |
| `user_id`         | `text`           | 上古        | 对应 `user_profiles.id`                       |
| `week_start_date` | `date`           | 上古        | 周一为周首                                     |
| `dish_ids`        | `uuid[]`         | 上古        | **uuid[] 不是 text[]**，手工 SQL 必须 `::uuid[]` |
| `swapped_dish_ids`| `uuid[]`         | 中期        | 用户主动替换的菜，配合 `user_swap_events`     |
| `algo_version`    | `text NULL`      | **024 棒** | Smell 4 修复，匹配 `useWeeklyMenu.ts ALGO_VERSION` |
| `cache_key`       | `text NULL`      | **024 棒** | cuisine/intent/dpd 等非算法维度变动信号       |
| `created_at`      | `timestamptz`    | 上古        |                                                |
| `updated_at`      | `timestamptz`    | 上古        |                                                |

### 3.2 Smell 4 闭环状态

- **migration 024 已 ship**（2026-05-19）：加两列 algo_version + cache_key
- 前端 `useWeeklyMenu.ts` 已切换：SELECT 取两列 → 不匹配判 stale → 重新生成
- 两个 localStorage sentinel（`weekly_menu_algo_ver` + `weekly_menu_db_cache_key`）**已彻底删除**
- 当前 ALGO_VERSION = **v37**（CLAUDE.md 记录）；下次算法变动须同步 bump
- **建议**：跑一次远端 `SELECT COUNT(*) FROM user_weekly_menus WHERE algo_version <> 'v37'`，
  评估 stale 缓存占比。若 > 50%，可考虑直接清掉过期行减小表体积（小心 swapped_dish_ids 数据丢失）。

### 3.3 索引建议（待补）

- 唯一索引 `(user_id, week_start_date)` —— 防同一用户同一周双行。
- 偏序索引 `(user_id, week_start_date DESC) WHERE algo_version = 'v37'` ——
  加速"当前用户最新菜单"查询路径。**未确认是否已有**——待 psql verify。

---

## §4. `households` / `household_members` 表 audit

### 4.1 Smell 3 修复闭环（migration 025）

- ✅ migration 025 已 ship（执行顺序为 DELETE → DROP POLICY → ALTER COLUMN → ADD FK → CREATE POLICY）
- ✅ `household_members.helper_id` 类型 `uuid → text`（对齐 `user_profiles.id`）
- ✅ FK `household_members_helper_id_fkey → user_profiles(id)` 建立
- ✅ 5 条原 auth.uid() RLS policy DROP，5 条 anon-first policy CREATE
- ⚠️ 数据清洗：DELETE 1 行 50% 孤儿率 helper_id（CEO 已在 A0 工单备份至 `_archive_household_members_pre_025`）

### 4.2 households 列结构（来源 001）

| 列名          | 类型              | 备注                                        |
|---------------|-------------------|---------------------------------------------|
| `id`          | `uuid PRIMARY KEY`|                                              |
| `employer_id` | `text` (P6 棒 026 改了类型) | 雇主用户的 application userId               |
| `name`        | `text`            | 家庭名称                                     |
| `invite_code` | `text UNIQUE`     | 保姆加入用的邀请码                           |
| `created_at`  | `timestamptz`     |                                              |

### 4.3 household_members 列结构（来源 001 + 025）

| 列名          | 类型              | 备注                                        |
|---------------|-------------------|---------------------------------------------|
| `id`          | `uuid PRIMARY KEY`|                                              |
| `household_id`| `uuid → households(id)` |                                       |
| `helper_id`   | `text → user_profiles(id)` | 025 棒类型从 uuid → text + 加 FK     |
| `status`      | `text`            | `pending / active / archived` 等             |
| `joined_at`   | `timestamptz`     |                                              |

### 4.4 当前已知风险

- 行数极少：2 行 household_members（P3 实测）。**生产实际是否还停在 2 行？**
  需 psql verify。若 > 100 行后**没有 index `(helper_id)`** 可能拖慢"我属于哪些家庭"查询。
- RLS 现状：5 条 anon-first policy（`USING (true)`、`USING (employer_id = current_setting('app.user_id', true))` 等混合模式）。
  原 §1 "helper can read household by invite code" 的 `USING (true)` 全开漏洞，025 已收紧为按 invite_code / helper_id 过滤。

---

## §5. 0% 填充候选（dead schema 候选）

**判定方法**：列在 migration 后**未见配套 backfill** 或**距 ADD 时间 ≤ 7 天且无 admin 工具入口**。
**实际填充率待 Database 013（含 psql）回灌一次后报告**。

| 列名                                 | 来源 migration  | 推断 NULL%   | 原因                                         |
|--------------------------------------|-----------------|--------------|----------------------------------------------|
| `dishes.video_url / video_lang / video_platform` | **066（本棒）** | ~100%        | 刚加，未灌                                    |
| `dishes.calcium_mg / iron_mg / fiber_g / vitamin_c_mg` | 064 | 高（70-100%）| TICKET-006 解锁后 Backend 005 二轮未跑完 |
| `dishes.kid_acceptance_score`        | 017             | 中（30-50%）| AI 评分仅 7 月一次性跑过                      |
| `dishes.cultural_note`               | 015             | 高           | Phase 2 新增菜未填                            |
| `dishes.repeat_rate`                 | 018             | 100%         | 算法层 readonly 字段；从未写入                |
| `dishes.is_anti_aging / is_beauty / is_anti_inflammation / is_eye_care` | 039 | 中-高 | 健康标签仅 Phase 1 经典菜填，新菜未跑 |
| `dishes.festival_tags`               | 030             | 高（90%）   | 仅春节/中秋/端午等节日菜命中                  |
| `dishes.embedding`                   | 020             | 100%        | OpenAI embedding 收费贵，pipeline 暂未跑      |
| `dishes.helper_friendly_score`       | 018             | 100%        | 评分字段无 backfill 路径                      |
| `user_profiles.wechat_openid / unionid` | 005          | 100%        | 公众号 web view 未上线                        |
| `user_profiles.onboarding_version`   | 010             | 旧用户 100% NULL | 改版后强制重做依赖此列；NULL 即"未升级"  |

**建议**：Database 013 配 psql 后跑一次 `SELECT col, count(*) FILTER (WHERE col IS NOT NULL)::float / count(*) FROM dishes;` 系列脚本，验证此推断表。

---

## §6. 缺失的索引候选（高优）

| 表                  | 列                              | 建议 index                                                                            | 触发的 query path                                                |
|---------------------|---------------------------------|---------------------------------------------------------------------------------------|------------------------------------------------------------------|
| `dishes`            | `festival_tags`                 | `gin (festival_tags) WHERE festival_tags <> '{}'`                                     | 节日菜过滤                                                       |
| `dishes`            | 12 wellness `is_*` 列           | 12 个 partial: `(id) WHERE is_X = true`                                               | useWeeklyMenu hard filter                                        |
| `dishes`            | `cooking_method`                | `(cooking_method) WHERE cooking_method IS NOT NULL`                                   | useWeeklyMenu 同日烹法去重                                       |
| `dishes`            | `(meal_type, course_type)`      | composite index                                                                       | useSupabaseMenu 早午晚分类                                       |
| `dishes`            | `embedding`                     | `ivfflat / hnsw` (vector)                                                             | 未来语义搜索                                                     |
| `user_weekly_menus` | `(user_id, week_start_date)`    | UNIQUE                                                                                | 防双周菜单冲突                                                   |
| `user_weekly_menus` | `algo_version`                  | `(algo_version) WHERE algo_version <> 'v37'`                                          | stale 缓存清理脚本                                               |
| `household_members` | `(helper_id)`                   | 001 已建 — verify exists                                                              | "我属于哪些家庭"                                                 |
| `restaurant_places` | `(city, area)`                  | 加 `WHERE hidden = false`                                                             | 地理筛选                                                         |

**EXPLAIN ANALYZE 待跑**：仅以上 9 项是基于 src grep 推断的高优 query path。Database 013 应配 psql 跑 EXPLAIN 验证哪些已 sequential scan，再决定执行。

---

## §7. RLS Policy audit

### 7.1 RLS-on 表（依据 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` grep）

实际 ENABLE 的表 **15 张**：

| 表                       | RLS    | Policy 数 | 备注                                              |
|--------------------------|--------|-----------|---------------------------------------------------|
| `households`             | ON     | ~3        | 025 棒 anon-first 重建                            |
| `household_members`      | ON     | ~3        | 025 棒 anon-first 重建                            |
| `helper_reviews`         | ON     | 2         | 雇主写 + 公开读                                   |
| `community_posts`        | ON     | 3         | 保姆增 + 公开读 + 保姆删自己                      |
| `stripe_events`          | ON     | 1         | 037 棒 DROP auth.users FK 后留 anon-first         |
| `restaurant_places`      | ON     | 2         | anon read + anon write（Google Places 缓存）      |
| `chat_sessions`          | ON     | ?         | 详策略未实查                                       |
| `ingredient_seasonality` | ON     | ?         | 公开读                                             |
| `menu_evals`             | ON     | ≥1        | `menu_evals_update_anon`                          |
| `prefscores_training_log`| ON     | ?         |                                                    |
| `user_feedback_helper`   | ON     | ?         |                                                    |
| `user_pantry_items`      | ON     | ?         |                                                    |
| `data_health_history`    | ON     | ?         |                                                    |
| `wechat_token_cache`     | ON     | ?         | 公众号 token 缓存                                  |
| `restaurant_photos` (来自 restaurant_places 同 migration) | ON | 2 | anon read + anon write |

### 7.2 RLS-off / 未确认表（需要 psql 复查）

- `dishes` — RLS 状态未确认。若 OFF → anon read 直接生效（项目期望行为）。若 ON 但无 policy → anon 读 0 行（**重大风险**）。
- `user_profiles` — 同上待查。
- `user_weekly_menus` — 同上待查。
- `user_swap_events` — 同上待查。
- `api_usage_daily` / `michelin_dishes` / `user_chef_interest` / `user_lunch_log` — 待查。

**Database 013 强烈建议**：跑 `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;` 一次，作为 RLS audit 真相基线。

### 7.3 已知 RLS 不变量（CLAUDE.md）

- **不变量 #1**：所有 RLS policy 不能用 `auth.uid()`（项目是匿名 Auth）
- 025 棒后 households / household_members 已彻底无 auth.uid()
- 037 棒已扫尾老的 auth.users FK 残留
- restaurant_places 早期就是 anon-first（020 棒）

---

## §8. 总结 / Database 013 建议跑的实测清单

按优先级排序（高 → 低）：

1. **install psql**（apt/brew/Postgres.app），配 `DATABASE_URL` 直连远端，作为 audit 工具链基础。
2. 跑 `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'` —— §7 真相基线。
3. 跑 `\d dishes` 拿到 dishes 完整列清单 —— §1 重建准确版。
4. 跑列填充率脚本：
   ```sql
   SELECT
     col,
     count(*) FILTER (WHERE col IS NOT NULL)::float / count(*) AS fill_rate
   FROM dishes;
   ```
   对 §5 推断表做实测验收。
5. 跑 `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='dishes'`
   验证 §6 缺失索引候选哪些已存在。
6. 跑 `EXPLAIN ANALYZE` 抽 useWeeklyMenu / useSupabaseMenu 的 5 个核心查询，验收 sequential scan 风险。
7. 用 9229379 commit 已落地的 SPEC restaurants_migration.md 启动 Database 013 / 014（建表 + seed）。
8. **不要**修 §2 异常 D `display_name` 偏离与 §1 异常 A `cook_method` 双列 —— 都挂 blocker 等 CEO 拍板。

---

## §9. 不变量自检（本 audit）

- ✅ #1 不加 FK→auth.users（本 audit 0 DDL）
- ✅ #2 不直连 Gemini（本 audit 纯文档）
- ✅ #3 Stripe 白名单未触
- ✅ #4 ALGO_VERSION 不动
- ✅ 本 audit 仅是 markdown 文档，不修任何 schema / DB / src 文件

---

END OF AUDIT — Database 013 接棒后请直接基于此报告排实测优先级。
