# 20260525 TICKET-080-B — Stripe Checkout 接采购订单付款

## 问题

TICKET-080-A (commit `dcf0eb5`) 做完了购物车 / 结账 / 订单 5 张表 + 4 页 UI, 但
订单 status 永远卡在 `pending_payment` — 没接 Stripe, 钱进不来. 老板拍板要立
刻补全付款链路 (用简单佣金记账模式, 钱全进爱吃 Stripe 账户, DB 记 commission
给月底跟 Inalca 对账).

订阅 Stripe (Pricing 页 → `create-checkout-session` + `stripe-webhook`) 早就
跑通, 但订单付款是**一次性 (mode='payment')** 不是订阅 (mode='subscription'),
不能直接复用 — line_items 是动态 custom price, 不在白名单里, 价格也是按订单
HKD 总额生成.

## 方法

**2 条独立通路, 共用 1 个 webhook 用 metadata 区分**:

1. **新 edge fn `create-order-checkout`** (`supabase/functions/create-order-checkout/index.ts`):
   - 输入 `{ orderIds, userId, returnOrigin }`
   - 双校验 `user_id + status='pending_payment'` (防止恶意付别人订单)
   - 每订单一行 `price_data` (`currency='hkd'`, `unit_amount` = HKD × 100)
   - `metadata.order_ids = orderIds.join(',')` ← webhook 用这个识别"订单付款 vs 订阅"
   - 写 `stripe_session_id` 回订单表

2. **扩 `stripe-webhook`** 加 3 个分支:
   - `checkout.session.completed`: `if (metadata.order_ids)` → UPDATE orders status='paid' + paid_at + stripe_payment_intent_id + INSERT order_status_history
   - `checkout.session.expired`: 同样 metadata 判断, UPDATE status='cancelled' (with race protection: `.eq('status', 'pending_payment')`)
   - `payment_intent.payment_failed`: 同上, 通过 PI metadata 反查订单

3. **Checkout.tsx** 改 handleSubmit: createOrders 成功 → fetch create-order-checkout → `window.location.href = url`. 失败兜底: navigate /orders/success (订单已建, 用户从那点"去付款"重试).

4. **OrderSuccess.tsx** 读 URL `?session=cs_xxx` 区分:
   - 有 session = 从 Stripe 跳回 → 绿勾 "✅ 付款成功" (乐观显示, webhook 异步会真改 status)
   - 没 session = 直进 → 橙沙漏 "订单已创建 · 待付款" + 主 CTA "去付款" (重调 edge fn)

## 标准

**订单系统两条独立通路, 共用 webhook 用 metadata 区分**:

| 通路 | edge fn | mode | 区分依据 |
|---|---|---|---|
| 订阅 (Pricing 页) | create-checkout-session | subscription | session.subscription 存在 |
| 一次性 (订单付款 080-B) | create-order-checkout | payment | session.metadata.order_ids 存在 |

webhook 里**先查 metadata.order_ids**, 走订单分支; 否则 fallback 到旧订阅分
支. 这样将来加第 3 条通路 (比如打赏 / 一次性服务费) 只需加新 metadata key,
不动现有代码.

**红线**:
- 价格在 edge fn 算 (read orders.total_hkd), 前端不传金额 — 防止前端篡改.
- order_ids/userId 双校验 + status='pending_payment' 过滤, 防止恶意付别人订单 / 重复付款.
- cancelled UPDATE 加 `.eq('status', 'pending_payment')` 防止 webhook race 把 paid 覆盖成 cancelled.
- success_url 带 `{CHECKOUT_SESSION_ID}` (Stripe 自动替换) — UI 用这个区分入场来源, 不假设 webhook 已经跑完.
- 老板私密红线保持: edge fn / orders.ts 都不 SELECT wholesale / commission 给前端.

**幂等性**: webhook 已有 `stripe_events` 表去重, 订单分支天然幂等 (重复 UPDATE 同状态无副作用).
