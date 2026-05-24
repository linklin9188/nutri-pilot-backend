# Skill — Database 033：Settings 大重构第 1 棒 schema 扩列

**日期**：2026-05-24
**部门**：Database
**Ticket**：TELEPOT-20260524-033 §A（4 棒接力第 1 棒）
**Migration**：`supabase/migrations/084_settings_v2_全家全员重构.sql`

---

## 1. 解决了什么问题

算法需要 19+ 维度（全家 9 + 个人 10）才能把"口味满意 + 营养健康"两条线都跑起来，但 DB 之前只支持其中 ~3 个：`user_profiles` 只有 `hometown_cuisine` / `dietary_goal` / `taste_pref`，`household_members` 干脆只有 6 列骨架（`id / household_id / helper_id / status / joined_at / left_at`），完全没有家人的姓名 / 年龄 / 健康基线 / 体质等字段。结果是 UI 即使让用户填，也无处落地——所有输入要么被丢、要么挤进 `localStorage` 然后跨设备丢失。

本棒把全部 18 个新维度列加齐（全家 8 + 个人 10），后续 3 棒（Algorithm / UI Settings / UI onboarding）就能在统一的 DB schema 上协同，不会再出现"UI 收了用户填表却没列可存"的死局。

## 2. 用了什么关键方法

- **`ADD COLUMN IF NOT EXISTS`**：每条 ALTER 都加 IF NOT EXISTS 保证幂等。万一 migration 被部分执行 / 在新环境重跑 / 与未来 migration 重叠，都不会因"列已存在"报错中断后续 ALTER。
- **全列 nullable + 不写 default**：旧用户行不会被任何默认值"污染"——读到 null 时算法在应用层走 default，DB 不强加 schema 偏见。也符合 CLAUDE.md 的硬约束"不破现有用户数据"。
- **每列都加 `COMMENT ON COLUMN`**：把枚举取值写进 comment（如 `cuisine_preference IS 'chinese / western / japanese_korean / mixed'`），后续 Agent 在 `\d+ user_profiles` 或 information_schema 里能直接看到合法值，不用反向翻 spec。
- **实查先于写**：跑 PostgREST `select=*&limit=1` 拿真 columns 列表，再决定加哪些列。本次实查发现：
  - `user_profiles` 已有 45 列，spec 工单列出的 8 列**全部不存在** → 全加。
  - `household_members` 仅 6 列，工单 §A.2 的 10 列**全部不存在** → 全加。
  - `household_members.name` / `household_members.dietary_goal` 在 spec §1.2 中提到但实查不存在；本 ticket 严格按工单 §A.2 加 10 列，name / dietary_goal 缺失标注另开 ticket，避免越权。
- **BEGIN / COMMIT 包裹**：两个 ALTER TABLE + 全部 COMMENT 在单事务里执行，要么全成要么全回，避免出现"加了一半列就崩"的中间态。
- **不动 RLS**：Smell 3 在 migration 025 已修，household 系列表用 anon-first FOR ALL USING (true)；本棒只扩 schema 不动 policy，避免无关回归。

## 3. 下次同类任务的执行标准

1. **任何 schema 扩列必先实查现有列**：用 PostgREST `select=*&limit=1` 或 `information_schema.columns` 查真 schema，对比 spec 列出的字段，列出"已有 / 缺 / 类型不符"三档，避免重加导致幂等失败或 spec 与现实失步。
2. **新列必 nullable，禁止加 default**：除非 ticket 明确要求 NOT NULL，否则全 nullable。任何 default 都会"追溯填"到旧行，等于把假设固化进存量数据。需要 default 行为时，应用层读 null 兜底。
3. **必加 COMMENT ON COLUMN**：枚举值、单位、与算法的关系都写进 comment。这是后续 Agent / 新人接手时唯一能脱离 spec 自洽的途径。
4. **migration 文件名编号顺位递增**：本仓库当前最大 083，本棒用 084。不跳号、不复用、不"插队"。
5. **CREATE / ADD 是安全操作可直接推 production，DROP / ALTER COLUMN TYPE / RENAME 是危险操作必须单独 ticket + 老板 ack**：本棒 18 个 ADD COLUMN 全在安全档，直接 `supabase db push` 即可；如果未来要把某列改 NOT NULL 或改类型，必须先评估存量行兼容性、单独走 ticket。
6. **推 production 后必跑 2 条验证 curl**：一条 select 新列、一条 select 现有列。新列能 select 到（即使全 null）= schema 已加；现有列照常 = 没破坏现有数据。两条都过才算 ship。
7. **不动 RLS / 不改 FK / 不动 auth.users**：扩列任务的 scope 严格圈在 ADD COLUMN + COMMENT。任何 RLS / FK / 类型变更属于不同风险档，单独 ticket。

---

**END**
