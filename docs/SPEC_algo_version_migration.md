# SPEC — 用 `algo_version` DB 列替代 localStorage sentinel

> 起草部门：UI 设计
> 状态：needs_review（待 Architect 审核 + 与数据库/算法部门对齐）
> 关联：数据库 migration 024（`user_weekly_menus.algo_version text`）
> 范围：**仅文档，不动代码**。审核通过后另起实现 PR。

---

## 1. 背景

前端目前用两个 localStorage sentinel 校验 `user_weekly_menus` DB 缓存是否过期：

- `weekly_menu_algo_ver` — 上次写 DB 时的 `ALGO_VERSION` 字符串
- `weekly_menu_db_cache_key` — 上次写 DB 时的完整 lsKey（含 cuisine / headcount / eating / intent 维度）

痛点（CLAUDE.md Smell 4）：两个 sentinel 在 localStorage 易失步，用户清掉其一不清另一个 → 校验持续返回 `true` → DB 喂出旧版本菜单，目前只能手动 `DELETE`。

数据库部门正在推 migration 024 给 `user_weekly_menus` 加 `algo_version text` 列。本 spec 描述前端如何切换到 DB 列校验。

---

## 2. 影响文件清单（grep 落点）

### 2.1 必须改的位置

| 文件 | 行号 | 现状 | 动作 |
|------|------|------|------|
| `src/hooks/useWeeklyMenu.ts` | L1354–L1366 | `loadFromDB` SELECT 列表只取 `day_index, dish_ids, swapped_dish_ids` / `day_index, dish_ids` | dinner SELECT 增加 `algo_version`；lunch SELECT 同步增加（用于一致性校验） |
| `src/hooks/useWeeklyMenu.ts` | L1369–L1371 | 仅检查行数 ≥7 + lunch ≥1 | 增加 `algo_version` 校验：任一行 `algo_version !== ALGO_VERSION` 或为 `null` → `return null`（触发重新生成） |
| `src/hooks/useWeeklyMenu.ts` | L1403–L1424 | `saveToDB` upsert 行无 `algo_version` 字段 | 每行 INSERT/UPSERT payload 增加 `algo_version: ALGO_VERSION` |
| `src/hooks/useWeeklyMenu.ts` | L1481–L1490 | 读两个 sentinel 拼装 `dbCacheValid` | **整段删除**（注释 + 两个 `localStorage.getItem` + `dbCacheValid` 变量）。`loadFromDB` 内部完成校验后无需此前置 |
| `src/hooks/useWeeklyMenu.ts` | L1492–L1499 | `if (dbCacheValid) { … loadFromDB … }` | 改为无条件 `await loadFromDB(...)`，由 `loadFromDB` 内部用 DB 列判断 stale |
| `src/hooks/useWeeklyMenu.ts` | L1649–L1653 | 写 lsKey 后写两个 sentinel | 删除 L1652、L1653 两个 `localStorage.setItem`，保留 L1651（lsKey 仍写入 localStorage，作为离线兜底） |
| `src/hooks/useWeeklyMenu.ts` | L1693–L1700 | `swapDish` 的 `user_weekly_menus.upsert` payload 无 `algo_version` | upsert payload 增加 `algo_version: ALGO_VERSION` |

### 2.2 ALGO_VERSION 的其他引用 — **不动**

为避免一次 PR 散开战线，列出但本次不改：

| 文件 | 行号 | 用途 | 为什么不动 |
|------|------|------|------------|
| `src/hooks/useWeeklyMenu.ts` | L60 | `export const ALGO_VERSION = 'v37';` | 算法负责人所有；本 PR 禁止改 |
| `src/hooks/useWeeklyMenu.ts` | L215 | `getCacheKey` 把 ALGO_VERSION 编入 lsKey | localStorage 缓存键，本机有效，未走 DB 列校验路径 |
| `src/pages/VerifyIngredients.tsx` | L8, L194 | 用 `WEEKLY_ALGO_VERSION` 作 localStorage 前缀扫描 | 与 DB 列校验无关；同 lsKey 机制 |
| `src/lib/weeklyDiarySummary.ts` | L13, L23 | 同上，扫 localStorage `weekly_menu_${ALGO_VERSION}_${weekStart}` 前缀 | 同上 |
| `src/lib/banquet.ts` | L20, L496, L687 | 把 `ALGO_VERSION` 写入 `menu_evals` / 出参 metadata | 与 `user_weekly_menus` 校验路径正交 |
| `src/pages/HelperHome.tsx` | L176 | 助手端读雇主的 `user_weekly_menus`（只读） | 助手不重新生成菜单；详见 §6 风险 R2 |

### 2.3 grep 确认全量

```
$ grep -rn "weekly_menu_algo_ver\|weekly_menu_db_cache_key" src/
src/hooks/useWeeklyMenu.ts:1481
src/hooks/useWeeklyMenu.ts:1486
src/hooks/useWeeklyMenu.ts:1487
src/hooks/useWeeklyMenu.ts:1650
src/hooks/useWeeklyMenu.ts:1652
src/hooks/useWeeklyMenu.ts:1653
```

两个 sentinel 在 `src/` 下只出现在 `useWeeklyMenu.ts`，本 spec 已全部覆盖。`CLAUDE.md` / `CLAUDE_ALGORITHM.md` 中的描述性提及由 Architect 在合并前一并更新。

---

## 3. 新校验逻辑

### 3.1 SELECT 时

`loadFromDB` 在 `user_weekly_menus` SELECT 列表里追加 `algo_version`：

```
.select('day_index, dish_ids, swapped_dish_ids, algo_version')   // dinner
.select('day_index, dish_ids, algo_version')                     // lunch
```

校验顺序（早返回早好）：

1. `dinnerRes.data.length < 7` → `return null`（旧逻辑保留）
2. `lunchRes.data.length === 0` → `return null`（旧逻辑保留）
3. **新**：任何 dinner 行 `algo_version !== ALGO_VERSION` 或为 `null` → `return null`
4. **新**：任何 lunch 行 `algo_version !== ALGO_VERSION` 或为 `null` → `return null`
5. 其余流程不变（按 dishMap 拼 `WeeklyDayMenu`）

> 多行一致性：理论上同一次写入的 7×2 行 `algo_version` 应当一致；若发现不一致（中途版本切换、半写入），按"任一不匹配即整体 stale"处理 → 全部重新生成。这与旧 sentinel 行为等价。

### 3.2 UPSERT 时

`saveToDB` 的 `rows` flatMap 每个对象都加 `algo_version: ALGO_VERSION`：

```
{ user_id, week_start, day_index, meal_type: 'dinner', dish_ids: [...], algo_version: ALGO_VERSION }
{ user_id, week_start, day_index, meal_type: 'lunch',  dish_ids: [...], algo_version: ALGO_VERSION }
```

`swapDish` 的单行 upsert 同样追加 `algo_version: ALGO_VERSION`（用户手动换菜也算"按当前算法版本生效"）。

### 3.3 删除点

- `weekly_menu_algo_ver`：删除所有读写（L1486, L1652）。**不保留迁移 shim** — 该 key 单纯是 sentinel，不承载用户数据，遗留键过期自然失效。
- `weekly_menu_db_cache_key`：删除所有读写（L1487, L1653）。同上不保留 shim。

`src/lib/` 下未发现 `userId.ts` 式的双 key 迁移代码，无需保留兼容版本。

---

## 4. 迁移策略

### 4.1 部署顺序（强依赖）

1. 数据库 migration 024 上线 → `user_weekly_menus.algo_version text` 列存在
2. 前端 PR 上线 → 开始读写该列

**反向不可**：若前端先上线，SELECT `algo_version` 会拿 PostgREST 400（字段不存在），整周菜单加载失败。本 spec §6 风险 R1 给出降级方案。

### 4.2 历史数据

- migration 024 不做 backfill → 现存所有行 `algo_version IS NULL`
- 前端按规则 §3.1 第 3、4 步把 NULL 判为 stale → 用户首次打开首页/WeeklyMenu/Helper 时触发一次重新生成
- 重新生成耗时：dishes pool 一次 query（~400 行）+ `generateWeekPlan` 同步计算 ≈ 1–3 秒
- 用户感知："首屏 loading 旋转 1–3 秒后呈现新菜单"，等价于一次正常的强制刷新

无需任何手工 backfill SQL。**这是预期行为，列入 release notes**。

### 4.3 单次清理（可选，不在本 PR 范围）

若 Architect 要求顺手清理用户设备上两个遗留 localStorage key，在 `App.tsx` 顶层加一次性 `localStorage.removeItem` 即可。建议**单独 PR**，不和本次混在一起。

---

## 5. 两个 localStorage sentinel 的最终命运

| Key | 命运 | 说明 |
|-----|------|------|
| `weekly_menu_algo_ver` | 删除 | 由 DB 列 `algo_version` 替代 |
| `weekly_menu_db_cache_key` | 删除 | **见 §6 R3 — 删除会丢失"非 algo_version 维度变更"的失效信号，方案待与算法/数据库部门确认** |

---

## 6. 风险与回滚

### R1 — 列未推上时前端报错（部署顺序倒挂）

**触发条件**：前端 PR 先于 migration 024 合入主干，或 migration 在生产 Supabase 回滚但前端未回滚。

**症状**：`loadFromDB` SELECT `algo_version` 返回 PostgREST 400 `column does not exist` → `dinnerRes.error` 不为空 → `return null` → 进入"重新生成 + 写回 DB"分支 → 写回时 `saveToDB` 也带 `algo_version` 字段 → 写入同样 400 → 数据写入失败 → 下次刷新仍走重新生成 → 死循环但每次都能正确出菜单（仅 DB 缓存失效）

**降级评估**：实际上 SELECT/UPSERT 失败都被 `.catch(() => {})` 吞掉（L1654），所以最坏后果是"DB 缓存功能整体停摆，每次刷新都重新生成"，不会白屏。可接受。

**主动降级方案（推荐）**：上线前 Architect 确认 migration 024 已 `supabase db push` 成功，再合并前端 PR。无需在前端写 try/catch 兜底。

**回滚预案**：revert 前端 PR；DB 列保留无害（NULL 列对旧前端透明）。

### R2 — 助手端读雇主菜单不会触发 stale

**触发条件**：雇主在 `ALGO_VERSION` 升级后未访问 WeeklyMenu/Home，DB 行仍是旧版本；助手 App 当天打开 HelperHome。

**症状**：HelperHome（L176）按 `(user_id=employer, week_start, day_index)` 读 DB 行并展示给助手，**不做 algo_version 校验**、也不重新生成（助手无权重算雇主的菜）。

**结论**：助手会展示旧算法生成的菜单直到雇主下次访问主站。此为产品可接受的最终一致性边界。**不在本 PR 修复范围**；如未来需要修，方案是：HelperHome 检测到雇主行 algo_version stale 时显示 "雇主家正在更新菜单，请稍后" 而非旧菜单。建议另起需求单。

### R3 — 删除 `weekly_menu_db_cache_key` 会丢失"非算法维度"失效信号 ⚠️

**这是本 spec 最大风险点。** 旧逻辑 L1490：

```
const dbCacheValid = savedAlgoVer === ALGO_VERSION && savedDbCacheKey === lsKey;
```

`lsKey` 形如 `weekly_menu_${ALGO_VERSION}_${weekStart}_p${dishesPerDay}_c${cuisineKey}_e${eatingKey}_i${intentKey}${byDayKey}` — 编入 **菜量 / 菜系筛 / 今日吃饭成员 / 意图偏好 / 分日人数** 五个维度。

`user_weekly_menus` 主键只到 `(user_id, week_start, day_index, meal_type)`，**不区分**这五个维度。用户切换 cuisineMode（中餐 ↔ 全部）或临时改变"今日吃饭成员"后：

- 旧机制：`savedDbCacheKey !== lsKey` → `dbCacheValid = false` → 重新生成
- 仅靠 `algo_version`：DB 行 `algo_version === ALGO_VERSION` → 仍判 valid → **服务旧 cuisine / 旧成员的菜单** ❌

且 `nutri-prefs-changed` 事件处理器（L1457–L1469）只 `removeItem(getCacheKey(weekStart))` 清 localStorage，**不删 DB 行**。

**候选方案**（需与数据库 + 算法部门定）：

- **A（推荐）**：数据库 migration 024 同时增加 `cache_key text` 列，前端 SELECT/UPSERT 时一并校验 / 写入。等价替代旧 sentinel，无功能回退。
- **B**：把 `cuisine_key / eating_key / intent_key / dishes_per_day` 拆成独立列，加入主键。schema 改动大，反对。
- **C**：保留 `weekly_menu_db_cache_key` 一个 sentinel，仅删 `weekly_menu_algo_ver`。失步问题降权但未根治。
- **D**：在 `nutri-prefs-changed` 事件处理器里 `DELETE FROM user_weekly_menus WHERE user_id=? AND week_start=?` 后再重新生成。强一致但每次 prefs 变动都打一次 DB delete。

**推荐 A**：在与数据库部门对齐 migration 024 时，把 `cache_key text` 一并加上。改造成本最低、行为完全等价。

**如果数据库部门不接受 A**：本 spec 应暂停，由 Architect 仲裁。

### R4 — 微信 Web-view 兼容性

**评估**：本次改动只在数据层（PostgREST SELECT / UPSERT 字段），不涉及任何浏览器 API、UA、cookie。微信 X5 内核与桌面 Chrome 行为一致。无需单独验证。

但建议在上线后第一周内观察 `wechat-mp/` 入口的用户首次菜单加载时长（§4.2 的 1–3 秒重新生成体感）。如有反馈再单独优化。

---

## 7. 测试清单（实现 PR 落地后跑）

- [ ] 全新用户首次访问 → DB 无行 → 生成 → DB 行 `algo_version = ALGO_VERSION`
- [ ] 老用户（行存在但 `algo_version IS NULL`）首次访问 → 判 stale → 重新生成 → 写回正确 `algo_version`
- [ ] 手动把 DB 某行 `algo_version` 改成 `'v99'` → 刷新 → 判 stale → 重新生成
- [ ] swapDish 后 `algo_version` 仍正确写入
- [ ] R3 选定方案对应的"切换 cuisine / 切换吃饭成员后 DB 失效"用例（依方案 A/C/D 而定）
- [ ] localStorage 清空 → 不再写入 `weekly_menu_algo_ver` / `weekly_menu_db_cache_key`
- [ ] 微信 Web-view 入口正常加载（抽测）

---

## 8. 待对齐项（Architect 决策）

1. **R3 方案选 A / C / D**？倾向 A（数据库加 `cache_key text` 列）。
2. R1 是否需要前端兜底 try/catch？倾向否，靠部署顺序保证。
3. §4.3 一次性 `localStorage.removeItem` 清理是否需要？倾向否（脏键无害）。
4. `CLAUDE.md` Smell 4 + `CLAUDE_ALGORITHM.md` L132 在 PR 合并时由谁更新？建议 UI 一并改 CLAUDE.md，算法部门改 CLAUDE_ALGORITHM.md。
