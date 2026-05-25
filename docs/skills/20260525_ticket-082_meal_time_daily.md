# TICKET-082 — 用餐时间日级化 + 4 入口

## 1. 问题

TICKET-076 把"用餐时间"放 `user_profiles.lunch_time / dinner_time` 全局字段, 老板真测 #22 暴露:

- 周一晚 19:00 / 周六晚 21:00 没法区分, 全局列只能存一个值
- 设置入口埋在 Settings 里, 用户在今日菜单看到时间不能就地改
- 菲佣 / chat 无法告知今天临时改时间, 雇主必须切到 Settings

老板原话: **"用餐时间不是在设置里, 是在今日菜单里, 每天用餐时间是不同的, 可以用户设置, 也可以 chat 里告知, 也可以菲佣设置, 这都可以。"**

## 2. 方法

### DB 层

新表 `household_meal_schedule` (migration 096):

- PK uuid, FK `household_id → households(id) ON DELETE CASCADE`
- `for_date date NOT NULL`, `lunch_time time`, `dinner_time time`
- `set_by text` — 'employer' / 'helper' / 'chat' 标记修改来源 (审计 + 未来冲突仲裁)
- UNIQUE `(household_id, for_date)`, index 同两列
- RLS anon-first FOR ALL `USING (true)` (与 households / household_members Smell 3 一致)

`user_profiles.lunch_time / dinner_time` 保留, **语义变成"默认时间 fallback"** — 当天没设就用默认。零迁移负担, 老用户透明升级。

### 应用层

`src/lib/dailyMealSchedule.ts` 三层 fallback:

1. `household_meal_schedule (household_id, for_date)` — 当天有设
2. `user_profiles.lunch_time / dinner_time` — 默认
3. 硬编码 `12:00 / 19:00`

`loadDailySchedule(householdId, forDate, employerUserId)` + `setDailyMealTime(..., setBy)` upsert ON CONFLICT 复用同一行, 另一餐字段保留 (先 SELECT 现值再 upsert)。

### 4 入口

| 入口 | 位置 | set_by |
|---|---|---|
| Home 今日菜单 顶部 chip | `Home.tsx` meal selector 下方 | `employer` |
| WeeklyMenu 每天 day section 顶部 chip | `WeeklyMenu.tsx` per-day render | `employer` |
| HelperHome 时间卡 ✏️ | `HelperHome.tsx` schedule card 开饭 行 | `helper` |
| ChatSwapModal 自然语言识别 | `ChatSwapModal.tsx` user quote 后 banner | `chat` |

`extractMealTime(text)` 正则覆盖中英混合:

- 关键词: 晚/晚饭/dinner/tonight → dinner; 中午/午饭/lunch/noon → lunch
- 时间: `HH:MM` / `X 点 Y 分` / `X 点半` / `Xpm` / `Xam` / `noon`
- dinner 1-11 点自动 +12 PM; lunch 1-5 点视为识别失败

`cookSchedule.ts` (TICKET-076) `loadTodayCookSchedule` 切换数据源: 由原读 `user_profiles` 改读 `loadDailySchedule(menu.householdId, today, menu.employerId)`, 算法不变。

## 3. 标准

**任何"按天/按场景变化"的字段必须独立日级表, 不能塞 `user_profiles` 全局列。**

- `user_profiles` 只放"用户画像 + 默认配置" (语言/家乡/饮食目标/默认时间)
- "今天具体怎么吃 / 今天几点吃 / 今天谁在家" 类信息按 `(scope_id, for_date)` 复合键独立表
- 已有先例: `user_weekly_menus (user_id, week_start, day_index)`, `meal_logs (user_id, eaten_at)`, `home_inventory (household_id, ...)`
- 新增同类决策时 schema reviewer 必须问: "这字段会不会因日子不同?" 答 Yes → 独立表
- 旧全局列保留作 fallback, 避免迁移负担 (TICKET-082 教训: 不要急着 DROP COLUMN, 双轨期让两种路径并存)

set_by 字段类应付未来冲突仲裁 (例如雇主和菲佣同天改成不同时间) — 当前简单"last write wins", 未来可加优先级 (employer > chat > helper) 或弹冲突提示。
