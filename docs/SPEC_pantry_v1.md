# SPEC_pantry_v1.md — 库存模型 v1 真 DB 上线

> 状态：草稿（TICKET-20260520-039 §B 起草）
> 作者：Algorithm (Day 8 中段)
> 前置：TICKET-025 §B 起步 src/hooks/usePantry.ts (schema-check forward-compat)；
>       TICKET-015 §B scoreForWeek axis 26（当前仍读 localStorage）
> 关联：TICKET-031 §A 飞轮 e2e + Database 后续 migration 031

---

## §1 痛点

当前家庭库存（"我家有"清单）数据流：

```
VerifyIngredients UI（haveIt toggle）
  └── localStorage `home_inventory_<userId>_<YYYY-MM-DD>` (Record<string, boolean>)
        └── useWeeklyMenu hook prepare：读今日 key + 7 日 missing_ingredient
              feedback 剔除 → 传 generateWeekPlan
                └── scoreForWeek axis 26 命中 ≥2/≥4 食材 +0.15/+0.30
```

**问题**：
1. **跨设备不同步** — 用户在手机标"番茄已有"，下次开桌面端 localStorage 是空的，axis 26 命不中
2. **重装即丢** — 浏览器清缓存 / 重装 app / 切设备就丢
3. **日期碎片** — key 含 `<YYYY-MM-DD>`，每天独立桶；前天买的番茄今天不在 key 里
4. **菲佣反馈不闭环** — missing_ingredient 反馈现在只能"今天剔除" inventory，不能告诉系统"这家以后这个原料常缺"

---

## §2 schema 设计（待 Database migration 031）

```sql
-- 031_user_pantry_items.sql
CREATE TABLE user_pantry_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,                       -- anon-first，不 FK auth.users (不变量 #1)
  ingredient_name text NOT NULL,                       -- 与 dishes.prep_steps_json[].ingredient_zh 同集合
  qty             numeric,                             -- 可空：纯"有/没有" toggle 时为 null
  unit            text,                                -- '克' / '个' / '把' 等；qty 缺时也为 null
  in_pantry       boolean DEFAULT true,                -- 主开关：true=在家有，false=耗尽
  last_seen_at    timestamptz DEFAULT now(),           -- 最后一次 UI 标记 / 菲佣反馈触碰时间
  meta            jsonb,                               -- 扩展位（buy_at / consumed_at / source 等）
  UNIQUE (user_id, ingredient_name)
);

CREATE INDEX idx_user_pantry_user_seen
  ON user_pantry_items (user_id, last_seen_at DESC);
CREATE INDEX idx_user_pantry_user_in_pantry
  ON user_pantry_items (user_id, in_pantry);

ALTER TABLE user_pantry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_pantry_anon_insert" ON user_pantry_items FOR INSERT WITH CHECK (true);
CREATE POLICY "user_pantry_anon_update" ON user_pantry_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "user_pantry_anon_read"   ON user_pantry_items FOR SELECT USING (true);
-- 应用层 WHERE user_id=getUserId() 过滤，与 anon-first 模式一致
```

**字段决策**：
- `ingredient_name` 用 `prep_steps_json[].ingredient_zh` 同集合 → axis 26 直接命中无需翻译表
- `qty` + `unit` 可空 → v1 阶段 "有/没有" 二态足够；v2 量化扣减再启用
- `in_pantry` boolean 而非"删除行" → 保留历史（"这家曾经有过番茄"是数据飞轮信号）
- `last_seen_at` → conflict 新者赢（§3 同步策略）

---

## §3 同步策略：write-through + async upsert + last_seen_at 冲突解决

```
UI 写（VerifyIngredients haveIt toggle）:
  1) localStorage 写入 `home_inventory_<userId>_<date>` (write-through 不阻塞)
  2) fire-and-forget supabase.from('user_pantry_items').upsert({
       user_id, ingredient_name, in_pantry: true, last_seen_at: now()
     }, { onConflict: 'user_id,ingredient_name' })

UI 读（usePantry.loadPantryItems）:
  1) try DB SELECT WHERE in_pantry=true AND last_seen_at > now() - 30d
  2) DB unavailable / 42P01 → fallback localStorage 当日 key（current TICKET-025 §B 行为）
  3) DB + LS 同时存在 → DB 为准（last_seen_at 比 LS 时间戳新）

冲突：UNIQUE (user_id, ingredient_name) + upsert onConflict 更新 in_pantry + last_seen_at
  → 同一 ingredient 跨设备多次 toggle → 最后一次写入胜出（last_seen_at 新者）
```

**为什么 30 天窗口**：避免 6 个月前标过 "我家有番茄" 现在还命中。VerifyIngredients UI 也应在下次写入时刷新 last_seen_at（自动续期）。

---

## §4 useFeedbackEngine 反馈闭环

```
菲佣点 missing_ingredient（meta.ingredient_zh="芝士"）:
  1) user_feedback_helper INSERT 既有逻辑不变
  2) 新增 rollup：
     UPDATE user_pantry_items
       SET in_pantry = false, last_seen_at = now(),
           meta = meta || '{"last_missing_at": "<now>"}'::jsonb
       WHERE user_id = <菲佣 employer> AND ingredient_name = <meta.ingredient_zh>
  3) 通过 employer_id 关联 — household_members.helper_id → employer
  4) 推断逻辑：菲佣"以为家里有"被纠正 = 该原料耗尽，标 in_pantry=false 让
     下次 axis 26 不再命中。直到雇主重新标 haveIt=true。
```

**触发频率**：实时（每次菲佣反馈即 update）/ 凌晨 04:00 cron rollup（与 feedback-to-prompt 同 cron）二选一。本 SPEC 推荐**实时**（库存比步骤生成更时效敏感）。

---

## §5 算法接口：scoreForWeek axis 26 切到 usePantry 统一读

**现状**（useWeeklyMenu hook prepare）：
```ts
const inventoryKey = `home_inventory_${userId}_${todayIso}`;
const inventorySet = new Set<string>();
try {
  const raw = localStorage.getItem(inventoryKey);
  if (raw) {
    const map = JSON.parse(raw) as Record<string, boolean>;
    for (const [k, v] of Object.entries(map)) if (v) inventorySet.add(k);
  }
} catch { /* corrupt — ignore */ }
// 7 日 missing_ingredient 反向剔除...
```

**改造后**（v1 完工）：
```ts
const inventorySet = await loadPantryItems(userId);
// loadPantryItems 已内置 DB → LS 优先级 + missing_ingredient 反向剔除（v1.1）
```

usePantry hook 把"读 DB" / "读 LS" / "missing_ingredient 剔除" 三处复杂度都吸收进单一 export。useWeeklyMenu 调用方零 if-else。

---

## §6 实施分 3 commit

### §6.1 commit 1 — Database migration 031

由 Database 部门负责（Algorithm 不动 supabase/migrations）。

新建 `supabase/migrations/031_user_pantry_items.sql`：
  - CREATE TABLE user_pantry_items（§2 完整 schema）
  - CREATE INDEX × 2
  - ALTER TABLE ENABLE RLS + 3 anon-first policies
  - 不动现有表

**commit message** (Database): `feat(db): 031 user_pantry_items table + anon-first RLS`

### §6.2 commit 2 — usePantry hook DB 优先 + write 函数

Algorithm 部门职责。改 `src/hooks/usePantry.ts`：
  - 现有 `loadPantryItems(userId): Promise<Set<string>>` 内部 Step 1 / Step 2 顺序已经是 DB → LS（schema-check forward-compat），031 落地后自动切真表
  - 新增 export `markPantryItem(userId, ingredient_name, in_pantry: boolean)`：write-through，先写 LS 再 async upsert DB
  - 新增 export `missingIngredient(userId, ingredient_name)`：菲佣反馈触发 in_pantry=false

VerifyIngredients.tsx 改造（轻接入）：
  - haveIt toggle 写入处加 `markPantryItem(userId, k, true/false)` 调用
  - 保留 localStorage 写入（write-through，向后兼容老逻辑）

useWeeklyMenu hook 改造：
  - inline localStorage 读取段替换为 `await loadPantryItems(userId)`
  - 现有"7 日 missing_ingredient 反向剔除"逻辑保留（usePantry 内部已经处理后可移除）

**commit message** (Algorithm): `feat(c-inventory): usePantry DB-priority + markPantryItem + missingIngredient writes + useWeeklyMenu integration`

### §6.3 commit 3 — UI 跨设备 pantry sync

UI 部门职责。让 VerifyIngredients 跨设备同步:
  - mount 时 `await loadPantryItems(userId)` 拉 DB 最新 → 用作 haveIt 初值
  - 删除当前"按日 key 分桶"localStorage 读路径（保留 write-through 不破）
  - UI 显示"我家有 X 件食材（云端同步）"指示

**commit message** (UI): `feat(c-inventory): VerifyIngredients cross-device pantry sync from DB`

---

## §7 不变量自检

| # | 不变量 | 本 SPEC 遵守 |
|---|--------|--------------|
| #1 | 无 FK→auth.users | user_pantry_items.user_id 是 text 不 FK auth.users ✓ |
| #2 | 无前端直连 Gemini | 本 SPEC 不涉及 Gemini ✓ |
| #3 | Stripe 白名单 | 不涉及 ✓ |
| #4 | ALGO_VERSION bump | **不 bump**（v42 保持）— axis 26 评分语义不变，只换数据源 ✓ |
| #5 | getUserId() 走 lib/userId | usePantry 内部已用 getUserId ✓ |
| #6 | dish_ids uuid[] | 不涉及 ✓ |

**ALGO_VERSION 决策**：本 SPEC 完工后 axis 26 命中规则、加分数值都不变（仍 hits≥4 +0.30 / hits≥2 +0.15），只是数据来源从 localStorage 切到 DB → 评分函数对相同输入产生相同输出，**不 bump**。但 §6.2 完工后用户首次访问会拉到比 LS 更全的 pantry（跨设备数据），可能某些菜分数升高 → 这是数据驱动的"更准"，不算算法升级。

---

## §8 影响范围 + 兼容性

- **localStorage 不删** — write-through 保留，老前端不破；新前端读时优先 DB
- **现有 home_inventory_<userId>_<date> key 静默废弃** — 30 天 last_seen_at 窗口后自然淘汰
- **菲佣反馈 missing_ingredient** — 现在在 useWeeklyMenu hook 内做 7 日剔除，本 SPEC 完工后改成持续标 in_pantry=false 直到雇主重 toggle
- **跨设备**：DB 优先后用户 A 设备标的 inventory 在 B 设备读到（核心价值）
- **冷启动新用户**：DB 空 → loadPantryItems 返回空 Set → axis 26 不命中（与现状一致，不破）

---

## §9 待办（实施时核对）

- ☐ Database 部门发 031 migration ticket（schema + RLS + index）
- ☐ Algorithm 实施 §6.2 时同步更新 src/hooks/usePantry.ts 单元测试（如有）
- ☐ UI §6.3 实施前先与 Database / Algorithm 对 ingredient_name 集合（用 prep_steps_json[].ingredient_zh 当 source of truth）
- ☐ 实施完毕跑 scripts/test-feedback-loop.ts 验证 missing_ingredient → in_pantry=false 链路（脚本可扩展加 §9 测试段）
- ☐ docs/SKILLS.md 加 "write-through cache + DB priority on read" 模式

---

## §10 非目标（v1 明确不做）

- **不做 qty / unit 量化扣减** — v1 仅 "有/没有" 二态；菜单生成后扣 200g 番茄留给 v2
- **不做 expiry tracking** — 过期日期管理是 v3 物料追踪范畴
- **不做 shopping list 联动** — VerifyIngredients 内购物清单与 pantry 暂分离，未来合并
- **不引入 feedback 触发 prompt 重写** — 已在 SPEC_day2_feedback_pipeline.md §3 SPEC，不重复
