# CLAUDE_DATABASE.md — 数据库负责人

> 角色：Database Lead
> 汇报对象：Cowork (CEO)（Architect 已于 2026-05-20 退场，由 CEO 自接管复审）
> 审核人：Cowork (CEO) 在每次 migration 上线前完成影响面评估，直接对老板负责。

---

## 开机 SOP（每次会话最高优先级，先做这一步再读后面任何章节）

**你的指令池**：`_bridge/telepot_database.md`（CEO 写入，你读）
**你的回写池**：`_bridge/telepot_response_database.md`(你写入，CEO 读)

**强制动作**：

1. 收到任何用户消息（不管内容是什么、是不是"go"、是不是新会话首条），**第一件事都是 `cat _bridge/telepot_database.md`**，先确认 STATUS 字段。
2. 如果 `STATUS: pending`，说明 CEO 下了新任务 → 在回复开头输出一行自检：`已读 telepot_database.md，STATUS=pending，TASK=<一句话摘要>，开始执行。` 然后按 CONTEXT 步骤动手。
3. 如果 `STATUS: idle` 或与上次相同，说明没新任务 → 在回复开头输出 `已读 telepot_database.md，STATUS=idle，无新任务。` 然后再处理用户当前消息。
4. 任务完成后**立刻**覆盖写 `_bridge/telepot_response_database.md`（格式见下方 Telepot 桥接协议章节），不等 CEO 二次催。
5. 禁止读其他部门的桥接文件（`telepot_ui.md` / `telepot_backend.md` / `telepot_algorithm.md`）。
6. 数据库部门额外硬约束：`_bridge/fix_migrations_tracking.sql` 已作废，**永远禁止执行**；不允许任何直接 UPDATE/INSERT/DELETE `supabase_migrations.schema_migrations` 表的操作。
7. **完工通知 Cowork (CEO)（流水线接力的关键）**：在第 4 步写完 `telepot_response_database.md` 后，**立即跑 osascript 通知 Cowork (CEO)**：

   ```bash
   osascript -e 'display notification "Database <一句话摘要> done" with title "Aieats CEO"'
   ```

   2026-05-20 Architect 已退场——不再写 `_bridge/telepot_architect.md`（该文件 + 级联工单机制已废弃）。
   Cowork (CEO) 自接管复审，response mtime 跳 + osascript 通知即触发 CEO 复审。
   缺这一步 = CEO 必须人肉中转 = 违背"让部门自行工作"的整体设计。

这一步是和 CEO 之间唯一的工单通道，跳过即视为脱离值班岗位。

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
- ★ **2026-05-20 P15 完成全面 audit + 清残留**：public.* schema FK→auth.users **0 残留**（038 完成对齐）。
- 历史教训：migration 004 的 `stripe_events.user_id FK → auth.users` 已被迫 drop；
  035 / 037 又清掉 init seed (nutri_pilot_feedback_schema.sql) 时埋的 3 处违规（helper_reviews.helper_id + helper_reviews.reviewer_id + community_posts.helper_id）。
- 所有 `user_id` 列类型为 `text`，不做外键约束；FK 列只 REFERENCES `user_profiles(id)`。
- audit 命令（Database 负责人定期跑）：见 LESSONS.md `invariant-audit-by-confrelid-systematic-sweep`。

### 2. dish_ids 列必须是 uuid[]，不是 text[]

涉及菜品 ID 数组的列一律 `uuid[]`。手写 SQL 时显式 cast：
```sql
ARRAY['...']::uuid[]
```

### 3. user_profiles.display_name 应用假设非空，但生产实际 nullable

⚠️ **生产 schema 与应用假设偏离**（Database 2026-05-19 P3 实查 `information_schema.columns` 证实 `is_nullable=YES`）。

业务代码（多处 `user_profiles.display_name` 直接读，未 null-check）假设非空，但 DB 实际允许 NULL。后果：行 INSERT 不带 display_name 时不会 reject，前端读到 NULL 可能崩。

**未来要做**（P5 候选，本轮 Smell 4 + Smell 1 阶段 1 不动它）：要么把 DB 改成 `NOT NULL DEFAULT ''`（先 backfill NULL 行）、要么前端全面 null-safe（推荐后者，符合"DB schema = source of truth"原则）。

### 4. 禁止破坏性操作

- 禁止 `db reset`、`DROP COLUMN`、`TRUNCATE` 生产表，除非获得明确授权。
- Schema 变更遵循小批量原则：先加列（可为 NULL），验证后再加约束。

---

## 核心表清单

### dishes（菜品主表）
当前生产 schema（2026-05-20 Day 11 同步）：
- 标识：`id uuid PK gen_random_uuid()`、`title_zh varchar`、`title_en text`、`description_zh/en text`
- 分类：`origin_cuisine text`（实际枚举：cantonese/jiangnan/northern/sichuan/japanese_korean/southeast_asian/western/all-season/balanced）、`main_ingredient text default 'other'`、`course_type text`、`meal_type text default 'dinner'`（CHECK 仅 4 值：breakfast/lunch/dinner/all）
- 步骤 + 图：`prep_steps_json jsonb`、`cook_steps_json jsonb`、`image_url varchar`
- 营养：`nutrition_kcal_per_serving int`、`oil_level/salt_level/sugar_level text`（CHECK low/mid/high）、`protein_source text[]`、`cook_method text`（CHECK 13 值）、`protein_g/carb_g/fat_g double precision`、`cook_time_min int`
- 标签 ARRAY：`flavor_tags text[]`、`health_benefit_tags text[]`、`festival_tags text[]`（030 加，GIN 索引，DEFAULT '{}')、`embedding vector`
- jsonb：`meta jsonb`（029 加，partial 索引 needs_regen）
- 兼容性：`is_vegan boolean NOT NULL default false`、`is_kid_friendly boolean NOT NULL default false`、`xiaomei_compatible boolean NOT NULL default false`、`xiaomei_incompat_reason text`
- 健康标签 12 列（032 P11 加，nullable default false，backfill 待 AI batch）：见下方
- 特殊健康 3 列（039 加，nullable default false）：`is_prenatal_friendly` / `is_lactation_friendly` / `is_elderly_friendly`
- Smell 4 类：`employer_crown_likes / times_kept_in_menu / times_employer_swapped / times_cooked / times_posted / repeat_rate / health_score / last_scored_at / execution_level / cultural_note / kid_acceptance_score / hk_availability_score / average_cost_hkd / helper_friendly_score / western_subtype / last_backfilled_at / source / ingredients_ready`

### 健康标签布尔列（032 P11 已落地，backfill 待 AI batch）
```
is_low_sodium / is_low_sugar / is_low_purine / is_blood_tonic /
is_sleep_aid / is_yin_nourish / is_qi_tonic / is_mood_boost /
is_anti_aging / is_beauty / is_anti_inflammation / is_eye_care
```
+ 039 加的 3 个 special-health：`is_prenatal_friendly / is_lactation_friendly / is_elderly_friendly`

### user_profiles
⚠️ **2026-05-19 P3 订正**：表主键是 `id text`（不是 `user_id`，不存在 `user_id` 列）；`display_name` 实际 nullable。

关键列：`id text` PK（**等于 `getUserId()` 返回值，无独立 user_id 列**）、`display_name text` **nullable**、`hometown_cuisine text`（取值：`jiangnan` / `cantonese` / …DB bucket 值）、`dietary_goal text`、`taste_pref text`

### user_weekly_menus（Smell 4 已修复 2026-05-19）
当前列：`id / user_id / week_start / day_index / meal_type / dish_ids uuid[] / swapped_dish_ids uuid[] / created_at / algo_version text / cache_key text`

migration `024_add_algo_version.sql` 加了 `algo_version` + `cache_key` 两列（均 nullable），前端用它们做缓存失效判断，替代了原 localStorage sentinel 方案。详 `docs/SPEC_algo_version_migration.md`。

### households（Smell 3 P6 已修复 2026-05-19，026）
当前列：`id uuid PK / employer_id text / name text / invite_code text UNIQUE / created_at`
employer_id 已 uuid→text（026 P6），前端 `WHERE employer_id = ?` 用 anon-first text userId 可直接命中。
RLS：1 条 anon-first policy `households_anon_full` (FOR ALL USING(true) WITH CHECK(true))。

### household_members（Smell 3 B-1 已修复 2026-05-19，025）
当前列：`id uuid PK / household_id uuid FK→households(id) / helper_id text FK→user_profiles(id) ON DELETE CASCADE / status text / joined_at / left_at`
helper_id 已 uuid→text + 加 FK→user_profiles(id)，5 条 auth.uid() policy → 1 条 anon-first `household_members_anon_full`。

### helper_reviews（P10 已修复 2026-05-20，035；P15 顺手清残留 FK 037）
当前列：`id uuid PK / household_id uuid / helper_id text FK→user_profiles(id) ON DELETE CASCADE / reviewer_id uuid (FK→auth.users 已 DROP) / overall_score / cooking_skill / reliability / cleanliness / comment / is_public / created_at`
RLS 2 条 anon-first：`helper_reviews_anon_insert` + `helper_reviews_anon_read`。
**P10.1 待做**：其他 uuid 列（id/household_id/reviewer_id）类型迁移 + 加 FK→user_profiles。

### user_feedback_helper（027 飞轮起点，区别于 init seed 的旧 user_feedback NL 表）
列：`id uuid PK / user_id text / dish_id uuid FK→dishes(id) ON DELETE SET NULL / step_index int / feedback_type text CHECK(6 enum) / locale text / meta jsonb / created_at`
6 enum：`cant_understand / too_hard / missing_ingredient / rating_good / rating_okay / rating_bad`
RLS：anon_insert + anon_read。UI HelperCook 1-tap 评分写入此表。

### prefscores_training_log（027 飞轮训练日志）
列：`id uuid PK / user_id text / trained_at / feedback_count int / prev_top_dishes jsonb / next_top_dishes jsonb / delta_summary text`
RLS：anon_insert + anon_read。Backend 每次重训写入快照。

### chat_sessions（028 ChatAgent DB 持久化）
列：`id uuid PK / user_id text / mode text CHECK('today'|'week'|'preference') default 'today' / messages jsonb default '[]' / intent_history jsonb default '[]' / proposals_snapshot jsonb / chosen text CHECK('A'|'B'|'C') / created_at / updated_at`
updated_at trigger 自动更新（plpgsql BEFORE UPDATE）。RLS：anon_insert/read/update 3 policy。

### user_pantry_items（034 食材库存，per SPEC_pantry_v1.md）
列：`id uuid PK / user_id text / ingredient_name text / qty numeric / unit text / in_pantry boolean default true / last_seen_at / created_at`
UNIQUE (user_id, ingredient_name)，2 索引（user_last_seen DESC + partial user_in_pantry WHERE true）。
RLS：anon_insert + anon_read + anon_update。

### user_weekly_menus.dish_ids 备份表
`_archive_household_members_pre_025` (2 行 / 025 备份)、`_archive_households_pre_p6` (85 行 / 026 备份)、
`_archive_mapo_dedup_20260520_1437` (2 行 / 033 dedup 备份)、`_archive_helper_reviews_pre_p10` (0 行结构性 / 035 备份)、
`_archive_xiaomei_backfill_pre_p13_1` (24 行 / 038 备份)。

Day 12 P17 4 道 dedup 备份（040-043）：
`_archive_dongyin_pre_dedup_20260520_1610` / `_archive_margherita_pre_dedup_20260520_1610` /
`_archive_tomatoegg_pre_dedup_20260520_1610` / `_archive_yuxiang_qiezi_pre_dedup_20260520_1610` （各 2 行）。

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

## 已知 DB Smell 汇总（2026-05-20 Day 11 同步状态）

| Smell / Issue | 描述 | 状态 |
|---|---|---|
| Smell 1 阶段 1 | Home 与 WeeklyMenu 两套算法并跑 | ✅ 已修（前端切换 weeklyMenu.days[todayIdx]）|
| Smell 3 B-1 | household_members 嵌入失败 + auth.uid() RLS | ✅ 已修 025 |
| Smell 3 P6 | households.employer_id uuid 与前端 text userId 不兼容 | ✅ 已修 026 |
| Smell 4 | user_weekly_menus 缺 algo_version 列缓存靠 localStorage | ✅ 已修 024（algo_version + cache_key 双列）|
| P10 | helper_reviews.helper_id uuid 与 household_members text 跨表不一致 | ✅ 已修 035 |
| P11 | dishes 缺 12 个 health-tag 布尔列 | ✅ 已修 032（schema 落地；backfill 待 AI batch）|
| P12 | dishes 麻婆豆腐 2 行重复 | ✅ 已修 033（5 步零数据丢失 FK 迁移）|
| P13 / P13.1 | xiaomei_compatible script 与 DB 偏移 / 节庆菜未 backfill | ✅ 已修（脚本全表对齐 + 22 节庆菜手动 UPDATE 038）|
| P15 | init seed 历史 FK→auth.users 违规 | ✅ 已修 037（public.* 0 残留）|
| P17 | dishes 4 道重复菜 dedup（冬阴功汤/玛格丽特披萨/番茄炒蛋/鱼香茄子）| ✅ 已修 040-043（5 步零损 FK 迁移）|
| P18-cuisine | dishes 15 行水果 missing origin_cuisine | ✅ 已修 044（'all-season/balanced' 兜底）|
| P18-nutrition | 22 节庆菜 missing nutrition_kcal_per_serving | ✅ 已修 Day 13（backfill-dish-nutrition.ts 22/22 全成）|
| Smell D | user_profiles 两套 hometown 值映射读取处理写不对称 | ⏳ 中 |
| P10.1 | helper_reviews 其他 uuid 列（id/household_id/reviewer_id）类型迁移 | ⏳ 中 |
| P15.1 | community_posts 完整 anon-first 化（helper_id 类型 + FK→user_profiles）| ⏳ 中 |
| P16 | 22 节庆菜 cook_steps + image 真跑（nutrition 已 Day 13 补完）| ⏳ 中 |
| P19 | 6 老脏菜 image 缺补齐（gen-dish-images.ts）| ⏳ 中 |
| P20 | dish_ingredients 表 474/748 缺口 backfill（详 docs/SPEC_dish_ingredients_backfill.md）| ⏳ 中（Day 13 audit 发现，>20 走 SPEC）|

---

## 与其他部门的接口

| 需要什么 | 找谁 |
|----------|------|
| 新列影响前端读取 | UI 负责人 |
| 新列影响 Edge Function | 后端架构负责人 |
| 新列影响评分算法 | 算法负责人 |
| Migration 上线审批 | Cowork (CEO) |

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
2. 同时加载 `_bridge/PROCESS.md` 了解 CEO 接管后的流水线协议。
3. 每个 migration 提交前通知 Cowork (CEO) 评估影响面。

---

## Telepot 桥接协议

**你的文件对**：`_bridge/telepot_database.md`（读任务）→ `_bridge/telepot_response_database.md`（写结果）

### 接收任务
每次收到用户消息时主动 `cat _bridge/telepot_database.md`（CLI 无法真正 poll 文件，必须靠新消息触发），当 `STATUS: pending` 时开始执行。

### 写回结果
任务完成后覆盖写入 `_bridge/telepot_response_database.md`：
```
STATUS: done | blocked | needs_review
RESULT: 完成了什么 / migration 编号
FILES_CHANGED: migration 文件名
NOTES: 影响其他部门的 schema 变更说明
```

### 规则
- 只读自己的 `telepot_database.md`。
- Migration 任务完成后必须在 NOTES 注明受影响的列/表，供其他部门同步。

---

## 分支决策协议（CEO 全权代行边界 — 2026-05-19 追加）

**绝不在 warp tab 内弹 prompt 让老板选 A/B/C 或答 Yes/No**——这是部门跳过 CEO 的失职。

遇任何分支决策时（技术方案选型 / 字段保留删除 / 维度合并 / bash 执行确认 / etc.）：

1. 立刻 STOP，不在 warp 弹 prompt 给老板
2. 写 `_bridge/telepot_response_<本部门>.md`：
   ```
   STATUS: blocked
   RESULT: 卡在 <X 决策点> 需 CEO 决策
   NOTES:
     - 选项 A: ...
     - 选项 B: ...
     - 部门推荐: <X> 理由 <Y>
   ```
3. 按 SOP §7 直接 osascript 通知 Cowork (CEO)（不再写 `_bridge/telepot_architect.md`）
4. 等 CEO 在 `_bridge/telepot_<本部门>.md` 写回决策 → 继续

**bash 命令 "Do you want to proceed? Yes/No"**：CEO 已授权部门**自答 Yes**。
**仅以下情况走 blocked 流程**：bash 命令含 `db reset` / `UPDATE/INSERT/DELETE supabase_migrations` / `DROP TABLE` / `TRUNCATE` / `rm -rf` 等硬约束红线动作。

**唯一让老板介入的 3 类红线**（CEO 也无权代行）：
1. 单一事项预估 >70 万 token
2. 对过去计划做全面方向重塑
3. 涉及损害用户权益（数据丢失 / 体验回退 / 隐私泄露 / 财务损失 / 安全漏洞）

除此 3 类，CEO（Cowork 端 Claude）全权代行。部门遇任何分支 → 直接转 CEO，不要让老板看见选项菜单。

---

## ⛔ 铁律 — 永远不能让老板看到 bash 审批弹窗（2026-05-19 老板最终警告）

老板看到任何 "Do you want to proceed? 1.Yes / 2.No" bash 审批弹窗 = CEO 失职。
**违反这条铁律一次 = 整个 CEO 系统被老板踢出。**

**禁止以下 bash 写法**（会触发 Claude Code "simple_expansion" 审批）：
- shell 变量 `$f` / `$var` / `${name}` / `$(cmd)`
- for / while 循环（`for f in ...; do ... done`）
- 管道含变量（`cmd | $foo`）
- heredoc 含变量
- 任何形式的命令组合 + 变量替换

**改成允许的写法**：
- 把每个文件路径写死（不用循环）→ 多写几行 `cat file1.md; cat file2.md; ...`
- 不能避免循环时 → 用 Edit/Write 工具替代 bash
- 不能避免变量时 → 拆成多条 bash 调用，每条用静态字面值
- osascript / git push / supabase 这种工具命令本身不含 shell variable → 安全

**bash 命令模板（永远安全）**：
```bash
# OK：静态命令
git log --oneline -5
stat -f "%Sm %N" /Users/jianjiao/Desktop/nutri-pilot_测试版/_bridge/telepot_response_ui.md
cat /Users/jianjiao/Desktop/nutri-pilot_测试版/_bridge/telepot_response_database.md
```

```bash
# 禁止：变量 + 循环
for f in ui backend database; do cat $f.md; done   # ❌ 弹审批
echo "时间 $(date)"                                  # ❌ 弹审批
stat -f "%Sm" $FILES                                 # ❌ 弹审批
```

**遇到必须查多文件的场景**：拆成 N 条独立 bash 调用，或用 Read/Glob/Grep 工具（不通过 bash）。
