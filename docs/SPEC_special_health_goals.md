# SPEC_special_health_goals.md — 妊娠 / 哺乳 / 老人 health-goal 维度扩展

> 状态：草稿（TICKET-20260520-043 §C 起草）
> 作者：Algorithm (Day 10 中段)
> 前置：当前 user_profiles.dietary_goal 枚举不含特殊人群；familyPrefs
>       已对 lifeStage='孕期' / '哺乳期' / '老人' 有部分处理但未走 dietary_goal
> 关联：CLAUDE_DATABASE.md schema 协同 / CLAUDE_UI.md 选项 + 提示

---

## §1 现状盘点

### §1.1 dietary_goal 当前枚举

- `growth` / `muscle_gain` / `lose_weight` / `maintain` / `detox` / `pregnancy`*
- `*` 注：`pregnancy` 当前存在但只是过渡占位，没有完整 axis 加分链 + UI 没列入正式选项 + dishes 也没 boolean 列对应

### §1.2 缺失场景

| 用户场景 | 当前覆盖 | 缺失 |
|---------|----------|------|
| 孕期女性 | familyPrefs.hasPregnant + pregnancy.ts banlist (raw 海鲜 / 高汞鱼 / 咖啡因) | 但 **dietary_goal='prenatal' 没正式 axis**，主菜单不优先推叶酸/铁/钙/DHA 强化菜 |
| 哺乳期女性 | familyPrefs lifeStage='哺乳期' 部分加 wellness tag | **没催乳食材偏好** + **没回奶食材避忌**（韭菜/麦芽/山楂等） |
| 老人 | resolveAgeModifiers 有部分 tasteBonus | **没补钙/低钠/温补/易消化**强化 + **没硬/油腻避忌** |

### §1.3 痛点驱动

Aieats 的金牌"家庭厨"场景里：
- 全国孕妇人口 ~1500 万（每年）— 是高 LTV 用户群（妈妈圈口碑传播）
- 港 30%+ 家庭有 60+ 岁老人同住 — 老人健康营养是金牌客单价驱动
- 哺乳期 6-12 个月覆盖窗口长 — 持续订阅潜力

---

## §2 新增 3 类 dietary_goal

### §2.1 'prenatal'（孕期）

| 维度 | 内容 |
|------|------|
| 营养重点 | 叶酸 / 铁 / 钙 / DHA / 优质蛋白 |
| 推荐食材 | 深绿叶菜（菠菜/西兰花/油菜）/ 三文鱼 / 鸡蛋 / 牛奶 / 豆制品 / 坚果 / 瘦肉 |
| 避忌 | 生食（生鱼片/溏心蛋）/ 高汞鱼（金枪鱼/旗鱼）/ 咖啡因 / 酒 / 软奶酪 |
| 已有 hook | pregnancy.ts hasPregnant 已加 hard ban + 部分 soft boost；本 axis 把 boost 提升到 +0.50 强化 |

### §2.2 'lactation'（哺乳）

| 维度 | 内容 |
|------|------|
| 营养重点 | 蛋白 / 钙 / 催乳食材 / 水分 |
| 推荐食材 | 鲫鱼 / 猪蹄 / 木瓜 / 通草 / 黄花菜 / 红枣 / 黑芝麻 / 燕麦 |
| 避忌 | 寒凉（西瓜/苦瓜/螃蟹）/ 回奶（韭菜/麦芽/山楂/花椒）/ 辛辣过度 |
| 当前覆盖 | 无 |

### §2.3 'elderly'（老人）

| 维度 | 内容 |
|------|------|
| 营养重点 | 钙 / 易消化 / 温补 / 低钠 / 低糖 |
| 推荐食材 | 山药 / 莲藕 / 银耳 / 红枣 / 桂圆 / 软糯主食 / 蒸鱼 / 瘦肉 |
| 避忌 | 硬（坚果整粒/带骨）/ 油腻（红烧肉过量/油炸）/ 高钠（咸鱼/腊肠）/ 寒凉 |
| 当前覆盖 | resolveAgeModifiers age='senior' 有部分 tasteBonus；本 axis 加 boolean 列强化 |

---

## §3 数据库 schema 改动（CLAUDE_DATABASE.md 协同）

### §3.1 user_profiles 列扩展

```sql
-- migration N (Database 待派单)
-- user_profiles.dietary_goal 当前是 text 列无 CHECK，可直接接受新值
-- 但若有 CHECK constraint 需 DROP 重建：
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_dietary_goal_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_dietary_goal_check
  CHECK (dietary_goal IS NULL OR dietary_goal IN (
    'growth', 'muscle_gain', 'lose_weight', 'maintain', 'detox',
    'pregnancy',  -- legacy 兼容
    'prenatal', 'lactation', 'elderly'  -- 新 3 类
  ));
```

### §3.2 dishes 列扩展

```sql
ALTER TABLE dishes ADD COLUMN is_prenatal_friendly   boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN is_lactation_friendly  boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN is_elderly_friendly    boolean DEFAULT false;

CREATE INDEX idx_dishes_prenatal  ON dishes (is_prenatal_friendly)  WHERE is_prenatal_friendly  = true;
CREATE INDEX idx_dishes_lactation ON dishes (is_lactation_friendly) WHERE is_lactation_friendly = true;
CREATE INDEX idx_dishes_elderly   ON dishes (is_elderly_friendly)   WHERE is_elderly_friendly   = true;

-- DISH_FIELDS 也需同步加这 3 列（src/lib/dishFields.ts）
```

### §3.3 schema 不破坏现状

- `dietary_goal='pregnancy'` 老用户保留，行为不变（pregnancy.ts 链路独立）
- 新 3 列 DEFAULT false → 老 dish 不影响推荐（axis 29 命中 false → +0）
- 部分 INDEX 用部分索引（WHERE = true）减空间，3 标志各 ~5-15% dish 命中

---

## §4 算法 axis 29（scoreForWeek）

```ts
// axis 29 — 特殊人群 dietary_goal 命中
if (profile.dietary_goal === 'prenatal' && (dish as any).is_prenatal_friendly) score += 0.50;
if (profile.dietary_goal === 'lactation' && (dish as any).is_lactation_friendly) score += 0.50;
if (profile.dietary_goal === 'elderly' && (dish as any).is_elderly_friendly) score += 0.50;
```

**为什么 +0.50**：与 axis 2 dietary_goal +0.35 一致量级（特殊人群是 +0.15 的 boost），低于家乡 +0.60 单点高位（避免特殊人群完全压制其他评分维度，保持 多样性）。

**避忌列表**（pregnancy.ts 同模式）：
- prenatal: 生鱼片 / 旗鱼 / 金枪鱼 / 软奶酪 → -3.0 hard penalty (现有 pregnancy.ts 可复用 +扩展)
- lactation: 韭菜 / 麦芽 / 山楂 / 花椒 → -1.5 soft penalty (catalog 在 lib/lactation.ts 新增)
- elderly: 坚果整粒 / 油炸 / 咸鱼 / 腊肠 → -1.5 soft penalty (catalog 在 lib/elderly.ts 新增)

---

## §5 UI 加 3 个 dietary_goal 选项 + 配套提示

### §5.1 QuickSetup.tsx + Settings.tsx 选项扩展

Goal picker 新增 3 卡：

| 卡 | emoji | 标题 | 副标题 |
|----|-------|------|--------|
| prenatal | 🤰 | 孕期营养 | 叶酸 · 铁 · 钙 · DHA |
| lactation | 🤱 | 哺乳期催乳 | 优质蛋白 · 通乳 |
| elderly | 👴 | 老人养生 | 低钠 · 易消化 · 温补 |

### §5.2 配套提示

QuickSetup 选中后底部安全提示：
- prenatal: "已开启孕期模式 — 自动避开生食 / 高汞鱼"
- lactation: "已开启哺乳模式 — 自动避开寒凉 / 回奶食材"
- elderly: "已开启老人模式 — 自动偏好软糯 / 低钠菜"

---

## §6 实施分 5 commit

| commit | 部门 | 内容 |
|--------|------|------|
| C1 | Database | migration 037: ALTER user_profiles CHECK + dishes 3 列 + 3 部分 INDEX |
| C2 | Algorithm | DISH_FIELDS 加 is_prenatal/lactation/elderly_friendly + axis 29 |
| C3 | Algorithm | lib/lactation.ts + lib/elderly.ts 避忌 catalog + scoreForWeek hard/soft penalty 接入 |
| C4 | UI | QuickSetup + Settings 3 个 dietary_goal 卡 + 配套提示 |
| C5 | Backend | scripts/backfill-special-health-flags.ts 用 Claude/Gemini 批量回填 dishes.is_*_friendly |

**实施顺序**：C1 → C2 → C3 → C5（backfill）→ C4（最后启用 UI 避免用户选了功能无菜单数据匹配）

### §6.1 migration 037 SQL ready-to-execute（TICKET-20260520-046 §A）

把 §3.1 + §3.2 schema 改动具化为 Database 部门可直接落地的 migration。
**不属于 Algorithm 范围**（不变量 #4 + 工单硬约束 "不动 supabase/migrations"），
本节起草供 Database 下一棒派单实施。

```sql
-- supabase/migrations/037_dishes_special_health_columns.sql
-- 配套 SPEC_special_health_goals.md §3 — 妊娠/哺乳/老人 health-goal 维度扩展
-- Database 部门负责执行；Algorithm axis 29 (TICKET-20260520-046 §B) 用
-- schema-check forward-compat，037 落地前 dish.is_*_friendly === undefined
-- 自动跳过该子 axis（不报错）。

BEGIN;

-- (1) user_profiles.dietary_goal CHECK 扩 3 新枚举值
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_dietary_goal_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_dietary_goal_check
  CHECK (
    dietary_goal IS NULL
    OR dietary_goal IN (
      'growth', 'muscle_gain', 'lose_weight', 'maintain', 'detox',
      'pregnancy',                            -- legacy 兼容
      'prenatal', 'lactation', 'elderly'      -- 新 3 类 (SPEC §2)
    )
  );

-- (2) dishes 加 3 boolean 列 (DEFAULT false 不影响老菜推荐)
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_prenatal_friendly  boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_lactation_friendly boolean DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_elderly_friendly   boolean DEFAULT false;

-- (3) 3 个部分 INDEX (WHERE = true) — 减空间 + 加速 axis 29 命中查询
--     backfill 后预期 5-15% dish 各自命中，部分索引适合稀疏标记列
CREATE INDEX IF NOT EXISTS idx_dishes_prenatal
  ON dishes (is_prenatal_friendly)  WHERE is_prenatal_friendly  = true;
CREATE INDEX IF NOT EXISTS idx_dishes_lactation
  ON dishes (is_lactation_friendly) WHERE is_lactation_friendly = true;
CREATE INDEX IF NOT EXISTS idx_dishes_elderly
  ON dishes (is_elderly_friendly)   WHERE is_elderly_friendly   = true;

COMMIT;
```

**Database 部门落地后**：
1. Algorithm 同 commit 加 `'is_prenatal_friendly', 'is_lactation_friendly', 'is_elderly_friendly'` 到 `src/lib/dishFields.ts DISH_FIELDS`（否则 SELECT 拉不到，axis 29 永远命不中 — 同 TICKET-025 §A skill "dish-fields-shadow-axis-prep"）
2. Backend C5 跑 backfill 把 5-15% dish 标 true
3. UI C4 最后启用 3 张 goal 卡

**回滚方案**：DROP CONSTRAINT + DROP 3 列 + DROP 3 INDEX；ALTER COLUMN 加 column 是非破坏性，本 migration 可逆。

---

## §7 ALGO_VERSION 决策

| commit | 改动性质 | bump? |
|--------|---------|-------|
| C1 (schema) | 列加，无评分语义 | 否 |
| C2 (axis 29) | **新 axis 加分 + dietary_goal 新枚举** → 改变评分 | **bump v42 → v43**（完整实施时 C2 内 bump） |
| C3 (避忌 catalog) | 与 C2 同 commit 或紧随，仍 v43 | 否（C2 已 bump） |
| C4 (UI) | 无评分语义 | 否 |
| C5 (backfill) | 无评分语义 | 否 |

**本轮（TICKET-043 §C）只 SPEC，不动 src/ → v42 保持**。完整实施触发于后续工单：C2 落地时 bump v43。

---

## §8 影响范围

- **现有用户**：dietary_goal in {growth, muscle_gain, lose_weight, maintain, detox, pregnancy} 行为不变（axis 29 对这些 goal 不触发）
- **新用户 prenatal/lactation/elderly**：菜单偏向相应推荐食材 + 避开避忌列表
- **dishes 数据**：backfill 完工前新列 default false → axis 29 一刀 +0；backfill 后 5-15% dish 命中 → 推荐池显著筛选 → 用户感知"懂我"
- **算法回滚**：bump v43 后若产品决策回滚 axis 29，单 commit revert + 再 bump v44 让 cache stale

---

## §9 不变量自检

| # | 不变量 | SPEC 遵守 |
|---|--------|----------|
| #1 | 无 FK→auth.users | user_profiles / dishes 都没新 FK ✓ |
| #2 | 无前端直连 Gemini | C5 backfill 走 supabase/functions/gemini-proxy ✓ |
| #3 | Stripe 白名单 | 不涉及 ✓ |
| #4 | ALGO_VERSION bump | C2 完整实施时 bump v43，本 SPEC 不 bump ✓ |
| #5 | getUserId() 走 lib/userId | 不直接读 userId LS ✓ |
| #6 | dish_ids uuid[] | 不涉及 ✓ |

---

## §10 待办（实施时核对）

- ☐ Database 部门发 migration ticket（含 ALTER + INDEX）
- ☐ Algorithm C2 前先 grep `pregnancy` 看 hasPregnant 链路与新 prenatal 关系（保留 legacy 兼容）
- ☐ lib/pregnancy.ts 避忌列表可被 prenatal 复用 — C3 决定是合并还是各自独立 catalog
- ☐ UI 卡片复用 QuickSetup 现有 goal 卡片样式（不重新设计）
- ☐ backfill 脚本采用"先 3-5 条验证 + 再扩规模"小批策略（CLAUDE.md 硬约束）
- ☐ 完工后跑 scripts/algo-e2e-by-hometown.ts 模拟 3 类新 goal × 6 hometown 看推荐变化

---

## §11 非目标（v1 明确不做）

- 不细分孕早期 / 中期 / 晚期（v1 prenatal 是统一 catalog；v2 按 trimester 分）
- 不区分新生儿 / 幼儿喂养 lactation 阶段
- 不引入慢病管理（糖尿病 / 高血压 / 痛风等已有 healthPrefs 处理）
- 不动 banquet / school-balance 模块（家宴 / 学校营养是另一套 goal-free 选菜逻辑）
