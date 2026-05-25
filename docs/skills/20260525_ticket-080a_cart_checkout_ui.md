# TICKET-080-A 购物车 + 结账 + 订单 UI 第 1 阶段

## 问题

老板拍板**双收入模式**:
- 收入 1: Stripe 订阅 (现有)
- 收入 2: 采购差价 (Inalca 直供, 094 已加 wholesale + retail price)

但 094 只动了 SKU 的价格列, 没有"用户能下单"的链条. 用户在 /verify 看到食材匹配
Inalca SKU 后:
- 没有"加入购物车"按钮 (只有"一键下单"跳供应商外链)
- 没有购物车页 (无累计 / 改数量 / 跨设备 sync)
- 没有结账页 (无填地址 + 时段 + 备注)
- 没有订单历史 (无追踪 / 复购)

差一整套电商基础设施.

## 方法

### 5 张 DB 表 (migration 095)

1. `shopping_carts` — 1 用户 1 车 (UNIQUE user_id, FK→user_profiles(id) text)
2. `cart_items` — UNIQUE (cart_id, sku_id) 让同 SKU 加车 upsert 累加 qty
3. `orders` — 订单主表 (价格快照 + 收货 + 状态机 + Stripe/Inalca 接口预留字段)
4. `order_items` — 订单明细 (`sku_name_snapshot` 防 SKU 改名, `unit_wholesale_price_hkd` + `commission_hkd` 老板私密)
5. `order_status_history` — 状态变更日志

RLS 全部 `FOR ALL USING (true) WITH CHECK (true)` (跟 Smell 3 B-1 解决模式一致, 匿名 custom-auth 不能 auth.uid()).

**坑点**: remote DB 有 5 张同名 placeholder 残留 (Prisma `_OrderDishes` 的 join table 关系
+ `orders.id` 类型 text 不是 uuid). 实查 `src/` + `supabase/functions/` 全代码库 grep 0 引用,
DROP CASCADE 重建.

### 2 个 lib

- `src/lib/cart.ts` — `loadCart` / `addToCart` (ensureCart upsert 模式) / `updateCartItemQty` /
  `removeFromCart` / `clearCart` / `getCartCount`. 全部失败返 空状态, 不抛.
  事件 `nutri-cart-changed` 跨组件同步红点数量.
- `src/lib/orders.ts` — `createOrder` (3 步 INSERT: orders → order_items → order_status_history
  → clearCart) / `loadOrders` / `loadOrderDetail` / status label + color helpers.
  **`ORDER_ITEM_USER_SELECT` 常量显式排除 wholesale + commission 字段** (老板私密红线).

### 4 页 UI + 1 详情页

- `Cart.tsx` (/cart) — items + 数量步进器 + 删除 + 底部"去结账"
- `Checkout.tsx` (/checkout) — 订单摘要 + 收货表单 + 时段 select + 备注 + 底部"确认下单"
- `OrderSuccess.tsx` (/order/success) — 绿勾 + 订单号 + 测试版 disclaimer
- `Orders.tsx` (/orders) — 历史列表 + 状态 chip
- `OrderDetail.tsx` (/orders/:id) — items + 收货 + 状态时间线

### VerifyIngredients 改造

- 头部加 cart icon + 红点 (`getCartCount` 拉 + `nutri-cart-changed` 事件)
- 每个匹配 Inalca SKU 的食材下面加 "HKD 120 / 500g [+ 加入购物车]" 行
- `ActiveSupplierSku` interface 扩 `retail_price_hkd` + `unit` 字段
- 加车成功 toast (1.8s 自动消失)

### Settings 加"📦 我的订单"入口

放在"❤️ 我的收藏"下面, 跳 /orders.

## 标准

今后凡商业交易类 feature 必须遵循:

1. **价格快照**: 订单时 INSERT order_items 时把 `unit_retail_price_hkd` + `sku_name_snapshot`
   冻结进 DB. SKU 后续改价 / 改名 / 下架, 订单历史不变.

2. **老板私密字段 DB 写但 UI 不出**: `unit_wholesale_price_hkd` + `commission_hkd` +
   `commission_total_hkd` 必须写入 DB (后台报表用), 但前端任何 SELECT 都显式列举字段
   排除它们. 全文 grep 不出 wholesale 才算干净. 不能用 `SELECT *`.

3. **诚实 disclaimer**: 080-A 只做 UI 不接 Stripe, OrderSuccess + Checkout + OrderDetail
   都加"测试版, 实际付款 + 配送即将上线"提示. 不能让用户误以为已经付款了等不到货.

4. **placeholder schema 兼容**: 新建表前先 grep `src/` + `supabase/functions/` 看是否已被代码引用. 没有 → 安全 DROP CASCADE; 有 → ALTER ADD + DO 块 IF NOT EXISTS 加约束.

5. **lib 失败 返空不抛**: cart / orders 任何 DB 错误返 false / null / EMPTY 默认值, 让 UI
   能 gracefully degrade (showed Toast / empty state), 不能让一次 network blip 把整页崩了.

6. **跨组件状态同步用 window event**: `nutri-cart-changed` 在 cart.ts 内所有 mutation
   后 dispatch, header / Cart 页 listener 自动 refresh. 避免 prop drilling 或 context.
