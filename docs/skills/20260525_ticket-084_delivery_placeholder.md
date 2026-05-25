# TICKET-084 P0 — DeliveryTracking 改"即将上线"占位

日期: 2026-05-25
负责: UI Lead

## 1. 问题

`src/pages/DeliveryTracking.tsx` 上线前实查发现 100% mock 假数据:

- 硬编码假供应商 "Waves Pacific" (Elite Partner chip / Delivered 10:15 AM)
- 硬编码假供应商 "Eat FRESH (Organic Garden)" (Arriving 10:30 AM)
- 硬编码假食材 "Wagyu Ribeye / Organic Choy Sum"
- 假图全部来自 `lh3.googleusercontent.com/aida-public/...` Google AIDA 占位图
- 完全不接 supabase / 不读 LS / 不调任何 API

老板真测路径会看到 "10:15 AM Delivered Wagyu Ribeye" 但用户实际并未下单 — 上线翻车风险.
CEO TICKET-077 实查报告点名此页, 老板拍板临时方案: 改占位, 等 080-B 真接 Stripe + Inalca API doc.

## 2. 方法

整页内容替换 (从 125 行 → 44 行), 保留路由不动:

- 居中橙色 `local_shipping` 图标 (80px, #FF5A1F)
- 🚧 "即将上线" 标题 + 副标 "实时物流追踪" + 长说明文案 (对接供应商物流系统)
- 主 CTA "查看我的订单" → `navigate('/orders')` (让用户去看真实 Stripe 订单, 不留 dead end)
- 次 CTA "返回" → `navigate(-1)`
- 三语 t3 全覆盖 (EN / 简中 / Tagalog)
- App.tsx 的 `/delivery` route 保留, 仅 element 换成新占位组件 (backward compat)

为什么跳 `/orders`: TICKET-080-A 已 ship 真实订单列表页, 用户从 delivery 入口期待"看物流",
最近的真实替代品就是订单状态页, 不要把用户卡死在占位页.

## 3. 标准 (今后通用)

**凡未真接的页面, 必须明示"即将上线"占位, 不能 mock 假数据当真功能.**

判断标准 3 条:

1. 假数据来源是否 hardcode (字符串 / aida-public 图 / mock array) — 是 → 必须占位
2. 是否有真实 API / supabase 表支撑 — 否 → 必须占位
3. 用户能否区分这是 demo — 否 (看起来像真的) → 必须占位, 加 🚧 emoji + "Coming Soon" 文案明示

占位页模板要素 (TICKET-084 沉淀):
- 居中大图标 (主色橙 #FF5A1F, 80px)
- 🚧 emoji + "即将上线" h1
- 1 行功能说明 (副标) + 1 段长说明 (我们正在...上线后可...)
- 主 CTA 跳最近的真实替代页 (不是 dead end)
- 次 CTA "返回"
- 三语 t3 必须全覆盖

未来 080-B 接 Inalca API doc 后, 真接物流时把这个占位组件整体替回真页, route 不变, 平滑切换.
