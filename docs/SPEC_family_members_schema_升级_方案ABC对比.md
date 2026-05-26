# SPEC — family_members schema 升级方案 ABC 对比（等老板拍板）

**起草**：Cowork CEO，2026-05-25
**触发**：TICKET-039 Settings 第 3 棒发现 `household_members.helper_id text NOT NULL FK→user_profiles.id`，**家人非 helper 无法 INSERT**（被 FK 拒），Agent 自决暂走 localStorage（功能可用但数据不持久化）
**目标**：让"家庭成员"数据**真存 DB**，给算法 per-member 评分 + 用户换设备保留资料

---

## 现状大白话

雇主在 Settings → 家庭成员页加家人（老婆 / 孩子 / 父母）填 12 字段（年龄 / 性别 / 健康目标 / 过敏 / 慢病 / 等）。**当前数据只存浏览器 localStorage**：
- ✅ 功能可用：增/删/改/抽屉编辑全 work
- ❌ **换设备 / 清缓存 → 数据丢**
- ❌ 推荐算法**拿不到家人数据**做 per-member 评分（vector 推荐目前只用 user 自己，没用家人）

根因：现有 `household_members` 表设计是给"菲佣关联到雇主家庭"用的（migration 025 Smell 3 修复时），主键 `helper_id` 是 NOT NULL 引用 `user_profiles`，家人没有 user_profiles row 所以 INSERT 被 FK 拒。

---

## 三个方案对比

### 方案 A：改 `household_members` 兼容家人

**改动**：
1. 把 `household_members.helper_id` 改成 NULLABLE
2. 加 `member_type text NOT NULL` 区分 'helper' / 'family_member'
3. RLS 增加 family_member 路径（雇主能 INSERT 自己家家人）
4. UI 改 Settings.tsx 把 localStorage 数据迁移到 DB

**优点**：
- 单表管理所有"家庭成员"概念（helper + family）
- 不引入新表，schema 简洁

**缺点**：
- ⚠️ **改动 Smell 3 历史架构**（migration 025 改过的 helper_id 设计被翻一次）— 可能引入新的 helper 权限问题
- RLS 复杂度上升（helper 路径 + family 路径并存）
- helper_id NULLABLE 后，原有读 helper 的查询都要加 WHERE 防止家人被误当 helper

**工程量**：4-6 小时（DB migration + RLS 重审 + UI 迁移 + 兼容测试）
**风险等级**：🟡 中（动历史架构）

---

### 方案 B：新建独立 `family_members` 表 ⭐ CEO 推荐

**改动**：
1. 新建 `family_members` 表（跟 household_members 解耦）：
   - id uuid PK
   - household_id uuid FK → households(id)
   - name text NOT NULL
   - relation text (self / spouse / son / daughter / father / mother / etc)
   - gender / age_years / height_cm / weight_kg / dietary_goal / avoid_tags / chronic_diseases / dietary_mode / tcm_constitution / pregnancy_status
   - created_at / updated_at
2. RLS：雇主能读写自己 household 的 family_members（anon-first）
3. UI 改 Settings.tsx 把 localStorage 迁移到 family_members 表

**优点**：
- ✅ **不动 Smell 3 历史**（helper_id 设计完全不变，零回归风险）
- ✅ Schema 干净（helper 归 household_members，家人归 family_members，关注点分离）
- ✅ RLS 简单（family_members 独立 policy 不跟 helper 路径冲突）
- ✅ 字段命名可以**统一用 avoid_tags**（跟 user_profiles 一致，避免 allergens / avoid_tags 混乱）

**缺点**：
- 多 1 张表（DB schema 略复杂）
- localStorage 数据需迁移脚本（一次性）

**工程量**：3-4 小时（DB migration + UI 迁移 + 数据迁移脚本）
**风险等级**：🟢 低（独立新表，不动历史）

---

### 方案 C：保持现状（localStorage）

**改动**：无

**优点**：
- 零工程量
- 零风险

**缺点**：
- ❌ 换设备 / 清缓存 → 家人数据丢
- ❌ 算法 per-member 评分**永远拿不到家人数据**
- ❌ 内测 / 公测时**用户体验巨大缺陷**（用户期望"我填了家人就该记住"）
- ❌ 内测后再升级 = 历史 localStorage 数据迁移更复杂

**适用场景**：纯 demo / 早期验证算法，**不适合内测期**

---

## 三方案矩阵

| 维度 | A 改 household_members | **B 新建 family_members** | C 保持现状 |
|---|---|---|---|
| 工程量 | 4-6 小时 | **3-4 小时** | 0 |
| 风险 | 🟡 中 | 🟢 **低** | 🟢 低 |
| 数据持久化 | ✅ | ✅ | ❌ |
| 算法可用家人数据 | ✅ | ✅ | ❌ |
| 跨设备保留 | ✅ | ✅ | ❌ |
| 动 Smell 3 历史 | ⚠️ 是 | **不** | 不 |
| Schema 简洁度 | 中（多 type 区分）| **高（关注点分离）** | 高（无变化）|
| 命名统一（avoid_tags）| ⚠️ 要专门做 | **顺便做** | 不适用 |

---

## CEO 推荐 B + 落地接力

1. **第 1 棒 Database**：写 migration `088_family_members.sql`（新表 + RLS + 索引）+ 数据迁移脚本（从 localStorage `nutri_family_members` 读 → push 到 DB）
2. **第 2 棒 UI**：改 `Settings.tsx` 家庭成员卡的 CRUD 接 DB（替换 localStorage 调用）
3. **第 3 棒 Algorithm**：`recommendVector.ts` 加 per-member 评分逻辑（每个家人独立算 vector，加权平均给 household 推荐）

**总工程量**：3-4 小时（CEO 派 3 个 Agent 接力，跟你昨晚 sprint 同模式）

---

## 老板拍板

回 **A / B / C**（或别的想法），CEO 立即派工单。

**CEO 强烈推荐 B**（低风险 + Schema 干净 + 顺便统一 avoid_tags 命名）。
