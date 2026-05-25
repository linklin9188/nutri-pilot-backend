# TICKET-083 P0 — 采购流程修正 (老板真测真实业务流)

## 1. 问题

TICKET-075 (commit 11376a6) 把"我家有"勾选流程做反了:
- 雇主在 /verify 勾"我家有" → 点"通知菲佣" → helper 端拉
- 雇主在自家手机上勾"冰箱里有葱"

**但雇主根本不知道冰箱里有啥**。天天做饭、知道食材状况的是菲佣。

老板真测 #23 揭出真实业务流:
```
雇主 ① 生成菜单 → ② "发给菲佣" (只发清单不勾)
菲佣 ③ HelperPrep 勾"我家有" → ④ "✅ 确认完了"
雇主 ⑤ Home 收红点 "菲佣确认完了 · 还要买 12 件"
   → ⑥ 点 → 购物车自动按 supplier 分组加好
   → ⑦ /cart → /checkout 下单 (多供应商拆多订单)
```

数据源头 = 菲佣. 雇主只接清单 + 下单. 075 把决策角色和操作角色搞反了.

## 2. 方法

### DB (097_purchase_flow.sql)
- `home_inventory` 加 `confirmed_at` + `confirmed_by_helper_id` — 菲佣"确认完了"快照
- `purchase_notifications` 新表 — 双向通知 (employer_sent / helper_confirmed) +
  to_be_bought_count + read_at + UNIQUE (household_id, for_date, notify_type)
- RLS anon-first FOR ALL USING (true) (跟 Smell 3 B-1 + orders 同口径)

### Lib (purchaseFlow.ts)
- `sendListToHelper` — 雇主 ② 写 employer_sent notification
- `confirmInventoryAndNotifyEmployer` — 菲佣 ④ UPDATE inventory.confirmed_at +
  写 helper_confirmed notification (to_be_bought_count = 不勾的食材数量)
- `loadUnreadNotifications` / `loadNotification` / `markNotificationRead`
- `autoFillCartFromConfirmedList` — 雇主 ⑥ 拉 inventory is_available=false 行 →
  匹配 supplier_skus.ingredient_keywords → addToCart 按 supplier 分组返回

### UI
- **VerifyIngredients.tsx (雇主)**: 删 toggleHave + handleNotifyHelper. 清单只读
  (button → div). footer 按钮 4 态机: idle → "📤 发送清单" / sent → "等菲佣" /
  helper_confirmed → "✅ 已确认·还要买 N 件 → 去购物车" → autoFillCart + /cart
- **HelperPrep.tsx (菲佣)**: 保留勾"我家有" toggle. 底部 sticky 加 "✅ 确认完了 ·
  要买 N 件" 按钮 → confirmInventoryAndNotifyEmployer
- **PurchaseNotificationBanner.tsx (新组件)**: Home 顶部插 (TrialBanner 之后).
  拉 unread helper_confirmed → 显红卡 → 点 → autoFillCart + markRead + /cart
- **Cart.tsx**: 按 supplier_id 分组渲染 (groupItemsBySupplier from cart.ts).
  Sticky 按钮: 单供应商 "去结账" / 多供应商 "去结账 · N 个订单"
- **Checkout.tsx**: createOrder → createOrders (按 supplier 拆). 订单摘要按
  supplier 分块显示. 成功跳 /orders/success?ids=A,B
- **orders.ts**: 抽 `_createSingleOrder` 私有, 加 `createOrders` 公开. clearCart
  在最后统一调.
- **OrderSuccess.tsx + App.tsx**: 兼容 ?order_id=X (单) 和 ?ids=A,B (多). 加新
  路由 `/orders/success` 放在 `/orders/:id` 之前避 :id 抢.

### CartItem schema
- 加 `supplier_id: string` 字段, supplier_skus.supplier_id 列由 PostgREST embed
  拉出来 — 之前只取 suppliers.name, 拆订单没法按 id 分组

## 3. 标准 (今后跨角色协作功能必读)

1. **先明确数据源头是谁**. 在 "雇主 + 菲佣" 这种双角色场景, 数据源头未必是付钱
   的那一方. 谁有真实信息谁是源头. 操作权 (谁能点按钮) 跟决策权 (谁拍板) 可以
   不同, 但数据真值必须从源头流向消费方, 反向就一定踩坑.

2. **双向通知用 UNIQUE (household_id, for_date, notify_type) 表**. 这种 "状态
   机式通知" (一天最多 1 条某 type) 用 UPSERT 比 INSERT-then-prune 干净, 重发
   只是刷新 created_at.

3. **多角色 UI 状态机要画出来再写**. VerifyIngredients 4 态 / HelperPrep 3 态
   / Banner 出现/隐藏条件, 写代码前列清单避免遗漏 (e.g. helper toggle 后必须把
   confirmState 回 idle 让 user 可以补勾再确认).

4. **多订单拆分后端要原子, 前端要友好**. createOrders 失败不回滚 (RLS 没事务)
   但部分成功的 N 张订单都已 INSERT, clearCart 只在 ≥1 张成功后调, 防错杀购物
   车. UI 显 "将拆为 N 个订单" 让用户预期管理.

5. **嵌入路由顺序敏感**. `/orders/success` 必须在 `/orders/:id` 之前注册, 不然
   被 :id 抢. React Router v6 不做长度优先匹配, 写得早赢.
