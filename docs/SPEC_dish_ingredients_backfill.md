# SPEC_dish_ingredients_backfill.md — dish_ingredients 表覆盖率补齐

> 起草：Database Lead 2026-05-20 Day 13（TICKET-057 §B）
> 目标读者：Backend Lead 下一棒接手实施
> 状态：待派工（CEO 起 Backend 工单后启动）

---

## §1 现状（Day 13 audit）

```sql
SELECT
  (SELECT COUNT(DISTINCT dish_id) FROM dish_ingredients) AS dishes_with_ingr,
  (SELECT COUNT(*) FROM dishes
   WHERE id NOT IN (SELECT DISTINCT dish_id FROM dish_ingredients WHERE dish_id IS NOT NULL))
   AS dishes_missing_ingr,
  (SELECT COUNT(*) FROM dishes) AS total_dishes;
```

实测：
- dishes_with_ingr = **274**
- dishes_missing_ingr = **474** ← 远超 CEO 工单 §B "缺口 ≤ 20 立即修" 阈值
- total = 748

覆盖率：274 / 748 = **36.6%**

**结论**：缺口太大，不适合 Database Lead 手工 INSERT。需 Backend Lead 跑 Gemini batch
推断（参考 backfill-dish-nutrition.ts pattern：Anthropic API + BATCH=8 + 幂等）。

---

## §2 dish_ingredients 表 schema

```sql
-- 实测 schema（pg_constraint + information_schema 反查）
dish_id      uuid     NOT NULL    -- FK→dishes(id) ON DELETE CASCADE
-- 其他列（CHECK constraint dish_ingredients_category_check 限制 category 值）
-- 详见 supabase/migrations/<init> 或 nutri_pilot_seed.sql
```

实测列结构（建议 Backend 跑：
`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='dish_ingredients'`
取确切列结构）。

---

## §3 推荐 backfill 策略（Backend 实施）

### §3.1 脚本设计（参考 backfill-dish-nutrition.ts）

```typescript
// scripts/backfill-dish-ingredients.ts
import { config } from 'dotenv';
config();

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5';
const BATCH = 8;
const DRY = process.argv.includes('--dry-run');
const LIMIT = parseLimit(process.argv);  // --limit=N

// 查缺数据的 dishes
const rows = await db.query(`
  SELECT id, title_zh, title_en, origin_cuisine, main_ingredient, prep_steps_json, cook_steps_json
  FROM dishes
  WHERE id NOT IN (SELECT DISTINCT dish_id FROM dish_ingredients WHERE dish_id IS NOT NULL)
    AND prep_steps_json IS NOT NULL  -- 必须有 prep_steps 才能可靠推断 ingredients
  LIMIT ${LIMIT};
`);

// Per batch: 让 Claude 看 prep_steps_json + cook_steps_json 推断 ingredients
// 输出格式：[{ ingredient_zh, ingredient_en, qty_g, category, tray }]
// 注意 category CHECK constraint 值要查

// 写回 INSERT INTO dish_ingredients (dish_id, ingredient_zh, ingredient_en, qty_g, category, tray)
// VALUES (...)
```

### §3.2 输入信号

每道菜可推断 ingredients 的信号源（优先级从高到低）：
1. **prep_steps_json**（最可靠）—— 每 step 已含 `ingredient_zh / ingredient_en / amount_g / tray`
2. cook_steps_json（次）—— action_zh 文本里可能提到食材
3. main_ingredient 列（弱）—— 单字符串 fallback

实际上 prep_steps_json 已经把 ingredients 显式列出来——可以**直接从 prep_steps_json 提取**
而不需要 LLM 推断！这是 §3.3 更便宜的方案。

### §3.3 ⭐ 推荐先跑零成本方案：从 prep_steps_json 直接提取（无 LLM）

```typescript
// pseudocode
for (const dish of rows) {
  const ingredients = (dish.prep_steps_json ?? []).map((step) => ({
    ingredient_zh: step.ingredient_zh,
    ingredient_en: step.ingredient_en,
    qty_g: step.amount_g,
    tray: step.tray,  // A/B/C/D/E
    // category 留 NULL 让 CHECK 兜底（如 NOT NULL 则按 tray 推 main/side/sauce/seasoning）
  }));
  await db.query('INSERT INTO dish_ingredients ... VALUES ...');
}
```

预估 coverage：
- 748 道菜中**约 717 道有非空 prep_steps_json**（748 - 19 missing prep + 节庆菜部分有 prep）
- 这步可覆盖大部分 474 缺口，**零 LLM 成本**

剩余真正"prep_steps 为空且需要 LLM 推断"的菜（19 + 部分 day 5 节庆 ≈ 22 道）才走 §3.1 LLM 方案。

### §3.4 category CHECK 值（实测需查）

dish_ingredients_category_check 限制 category enum 集合。Backend 写 SPEC 前先查：
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'dish_ingredients_category_check';
```

---

## §4 验证 SQL

```sql
-- 跑后 audit
SELECT
  (SELECT COUNT(DISTINCT dish_id) FROM dish_ingredients) AS dishes_with_ingr_after,
  (SELECT COUNT(*) FROM dishes
   WHERE id NOT IN (SELECT DISTINCT dish_id FROM dish_ingredients WHERE dish_id IS NOT NULL))
   AS dishes_missing_ingr_after
;
-- 目标：dishes_missing_ingr_after ≤ 25（容忍 prep_steps 为空且无法 LLM 推断的边角）
```

---

## §5 工单口径（CEO 抄走可派 Backend）

```
TASK: dish_ingredients 覆盖率 backfill（参考 docs/SPEC_dish_ingredients_backfill.md）
PRIORITY: medium
CONTEXT:
  Day 13 Database audit 发现 dish_ingredients 缺口 474/748。
  推荐 §3.3 零成本方案（从 prep_steps_json 提取）+ §3.1 LLM 兜底剩余。
  独立 commit:
    chore(quality): backfill dish_ingredients from prep_steps_json (zero-LLM phase 1)
  + 后续 LLM 兜底独立 commit。
```

---

## §6 不变量自检

- 不变量 #1：dish_ingredients.dish_id 已有 FK→dishes(id) CASCADE，不动 FK 即可
- 不变量 #4：本 backfill 不动 ALGO_VERSION
- 备份策略：跑前 CREATE TABLE _archive_dish_ingredients_pre_backfill AS SELECT * FROM dish_ingredients

---

## §7 与已有 ingredients 行的潜在冲突

部分 dishes 可能已有部分 ingredients（不完整）。pattern：先用 `WHERE dish_id NOT IN (...)`
仅 INSERT 完全缺数据的菜，**不动**已有部分数据的菜（避免 dup + 假装"补齐"实际混入）。
真正混入的菜按 P12 麻婆豆腐 dedup pattern 单独处理（属 P20+ 立项）。
