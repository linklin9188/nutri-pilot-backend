# TICKET-072 P0 — 家人数据存 DB + per-member household vector

日期: 2026-05-25
范围: DB (migration 089) + UI (Settings.tsx) + Algorithm (recommendVector + useWeeklyMenu)

## 1. 问题

TICKET-039 留的债: `household_members.helper_id` 是 `text NOT NULL FK→user_profiles.id`
(Smell 3 修复时为了支持 helper 加入家庭定的). 家人不是 helper, 没有 `user_profiles`
row, INSERT 会被 FK 拒. 因此家人 12 字段(name / relation / age / gender / dietary_goal /
avoid_tags / chronic_diseases / dietary_mode / tcm_constitution / pregnancy_status)
暂走 localStorage `nutri_family_members`.

后果两个: (1) 用户换设备 / 清缓存 → 家人数据全丢; (2) 算法 (useWeeklyMenu) 拿不到
家人的 `avoid_tags` / `dietary_mode` 等强信号做 per-member 评分, 推荐质量受限.

## 2. 方法 (3 棒接力, 1 Agent 串行)

### 第 1 棒 DB
新建独立表 `family_members` (方案 B), 不动 `household_members`:
- migration `089_family_members.sql`: 13 列 + FK→households(id) ON DELETE CASCADE
- 字段命名 `avoid_tags` (与 user_profiles 一致, 不用 allergens)
- RLS anon-first `FOR ALL USING (true)` (匹配 Smell 3 修复后 households 同模式)
- updated_at trigger + idx_family_members_household 索引

### 第 2 棒 UI
- 新 wrapper `src/lib/familyMembers.ts`: loadFamilyMembers / upsertFamilyMember /
  deleteFamilyMember (PostgREST CRUD + normalizeRow + UUID 检测)
- Settings.tsx:
  - 把原 inviteCode useEffect 扩成"同时拉 householdId + invite_code" (单 round-trip,
    省一次请求), 暴露 householdId state
  - 新增 useEffect: householdId 就位 → 拉 DB 成员 → 空则一次性迁移 LS (写
    nutri_family_migrated_v1=1 防重) → 拉完 setMembers + localStorage 双写
  - addMember 改 async, 先 DB INSERT 拿真 uuid 再插 state; saveMember 改 async,
    DB upsert + localStorage 双写; removeMember UUID 检测 + DB DELETE + localStorage 双写
  - 新 helper `uiToDB` / `dbToUI`: UI 扁平结构 (lifeStage 中文 + needs[]) 与 DB
    结构化 12 字段双向 lossless 映射 (lifeStage 用 pregnancy_status + age_years 反推)

### 第 3 棒 Algorithm
- recommendVector.ts 新增 `computeHouseholdVector(baseVec, members)`: 在
  user onboarding vec 基础上, 按家人 avoid_tags / dietary_mode 对 ingredient_family
  20 维做衰减 (avoid 命中 ×0.5; vegetarian 全肉类 ×0.3; vegan 全肉/蛋 ×0.1)
- useWeeklyMenu.ts vector cascade 处插入 computeHouseholdVector, 读
  localStorage `nutri_family_members` (Settings 双写保证有), 传给
  `recommendDishesByVector`
- ALGO_VERSION **不 bump** (v68 保留): localStorage 双写保证 read 路径行为一致,
  cuisine / spice / cooking_method 维度也不动, 只是 ingredient family 在有家人禁忌时
  会被衰减 — 这是数据源补全, 不是算法变更

## 3. 标准

凡是 "换设备会丢" 的用户数据, 必须 **DB 主存 + localStorage 副 cache**, 不能反过来.
副 cache 由"持久化函数双写"维护, 算法 reader 不动 (兼容/forward-compat).
迁移走"UI mount 时一次性 push, sentinel 防重" (LS key `nutri_X_migrated_vN`),
不写独立 SQL 脚本 — 老板用户量小这是最稳的.

字段命名跟 user_profiles 强对齐 (`avoid_tags` 不要 `allergens`, `dietary_goal` 不要
`goal`), UI 内部仍可保留中文枚举但读写边界做 mapping helper. 不破坏 algo reader
已有 convention.

Family-aware vector 走"在 user vec 上加 bias"路线 (家人没 onboarding 数据,
独立算 vector 再加权平均没物理意义), 衰减系数取多家人 min (最严的胜出).
