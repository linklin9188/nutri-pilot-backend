# mini-migration 补 household_members.name + dietary_goal（TICKET-035）

**任务**：补第 1 棒 TICKET-033 漏发现的 2 个基础列（name + dietary_goal）
**完工时间**：2026-05-24 23:36 HKT

## 1. 解决了什么问题

第 1 棒 Database Agent 实查发现 `household_members` 现有表只 6 列（id/household_id/helper_id/status/joined_at/left_at），CLAUDE.md 描述"name 已存在"与实际不符。第 1 棒按工单只加了 spec §1.2 列出的 10 列，没自作主张加 name/dietary_goal。本棒补上避免后续 Algo/UI 棒阻塞。

## 2. 用了什么关键方法

- 单一职责 micro-agent：1 个 migration + 2 列，1 分钟搞定
- ADD COLUMN IF NOT EXISTS（幂等）+ nullable（不破现有数据）
- COMMENT 标注用途（给后续 Agent 看清）
- commit message 写清"Algo/UI 第 2/3 棒依赖"（说明上下文）

## 3. 下次同类任务的执行标准

- [ ] 主 ticket 实查发现 schema gap 时，**不要在主 ticket 内偷偷加**（破工单范围）
- [ ] 单独开 mini-ticket，让 CEO 确认后再补
- [ ] mini-migration 必跟主 migration 编号顺位（避免 N+1 编号冲突）
- [ ] CLAUDE.md 跟 production 实际 schema 偏离需要标注（这次是 name "已存在"假设错的）
