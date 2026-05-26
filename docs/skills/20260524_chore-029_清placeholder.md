# 清 legacy placeholder（TICKET-029）

**任务**：清掉 supplier_skus 38 行 unnamed placeholder（第 1 棒 backfill 留下的 tech debt）
**完工时间**：2026-05-24 22:57 HKT

## 1. 解决了什么问题

第 1 棒 Database Agent 建 supplier_skus 时发现 production 已有同名表 38 行旧数据。Agent 按红线没 DROP 旧表，改自适应模式 backfill 把旧行填成 `sku_name='unnamed'`、`supplier_id=NULL`。这是临时妥协，留下 38 行 tech debt。本棒清掉。

## 2. 用了什么关键方法

- **DELETE 前必实查**：CEO 跑 curl 实查 38 行真实结构，确认 `supplier_id IS NULL` 唯一匹配旧行，新 5 行 supplier_id 非 NULL 完全独立
- **走 migration 文件不直接 SQL**：留版本历史，未来回溯能看到啥时清的、为啥清
- **commit message 写清 TICKET 编号 + 老板 ack**：未来代码考古能定位决策
- **destructive 操作必有 explicit ack**：handoff CLAUDE.md 红线 — 老板说"清掉"算 explicit ack；CEO 不能自己拍

## 3. 下次同类任务的执行标准

- [ ] DELETE / DROP / TRUNCATE 必须老板 explicit ack 才执行
- [ ] 执行前必实查条件唯一性（不能误伤其他行），实查结果给老板看一遍
- [ ] 用 migration 文件不要直接跑 SQL（留历史）
- [ ] 执行后必跑验证 query 确认行数符合预期，**不符合立即报告老板**
- [ ] commit message 必含 TICKET 编号 + ack 来源 + 删除条件描述
- [ ] 简单 chore 工单不需要 spawn 重型 Agent，单一职责 micro-agent 1-2 分钟搞定
