# UI-038 — VerifyIngredients 接 supplier 直供 chip + 一键下单

Ticket: TELEPOT-20260525-038 第 4 步 §3 (UI 第 3 棒)
日期: 2026-05-25

## 1. 我学到了什么

「占位 supplier (status='pending') 没法测真 UI」这个事实必须先在脑子里立住，再写代码。
否则会忍不住在前端硬塞一个测试 supplier 让自己能看到 chip，结果把"等真供货商激活才显示"
这条产品规则破坏掉。这次的姿势是：**逻辑写完整、空数据状态就 100% no-op**，
让 `fetchActiveSupplierSkus()` 自动过滤 `suppliers.status === 'active'`，
当前返 `[]` → 整个 chip / 库存 / 一键下单 UI 自动不渲染，老板 UPDATE 一行 SQL 后
不用前端发版就立刻生效。

## 2. 我做了什么

`src/pages/VerifyIngredients.tsx` 加 4 块（约 +180 行）：

- 文件顶端: `ActiveSupplierSku` interface + 3 个 helper —
  `fetchActiveSupplierSkus()` (join `supplier_skus + suppliers` 双过滤 active),
  `matchSkuForIngredient()` (case-insensitive 双向 includes),
  `fetchStockCount()` / `trackOrderAndGetRedirect()` (打 2 个 edge fn,
  失败一律返 null/silent)
- 组件加 3 个 state: `activeSkus` / `stockBySkuId` / `orderingSkuId`
- 2 个 useEffect: mount 时拉 active SKU 一次; ingredients/SKU 变化时
  按需拉库存（Set 去重 + 已 fetch 过的不重复打）
- category 视图食材 row 改成 `<div>` 外包 + 原 `<button>` 内层；命中 SKU
  且非「已有」时在 row 下方渲染一条独立 supplier 直供 bar (chip + 剩 N 件 +
  一键下单按钮)。**关键**: 不能嵌套 `<button>`，所以一键下单必须在
  toggle-have button 外面才能独立 click 不冒泡

trip 视图本轮不动（一次只动一个清单视图，等 chip 视觉跑通了再回头加）。

## 3. 真测路径 & 别踩的坑

- 等 Railway redeploy 1-3 分钟后访问 `/verify-ingredients`，**当前能看到清单
  但看不到 chip**——这是对的，占位 supplier 还是 pending。
- 真测姿势:
  1. 等老板谈完真意大利供货商
  2. SQL: `UPDATE suppliers SET status='active' WHERE name LIKE 'Aieats Italian%'`
  3. 刷新页面，含「橄榄油 / 帕马森 / 意面 / 番茄罐头 / 火腿」关键词的食材行
     下方出现橙色虚线 supplier bar
- **坑 1**: edge fn 请求**必须**带 `apikey` + `Authorization: Bearer <anon>`
  两个 header，否则 Supabase 网关返 401（即便 fn 是 `--no-verify-jwt` 部署）。
  其他 fetch-based edge fn 调用没这俩 header 是因为它们错——抄它们会踩坑。
- **坑 2**: PostgREST embed `suppliers!supplier_skus_supplier_id_fkey` 这个
  FK alias 名字必须**和 migration 里的一致**才不会报 PGRST200。`082` migration
  没显式命名 FK，PostgREST 自动生成 `supplier_skus_supplier_id_fkey` —— 这次
  对上了，但下次手写 ADD CONSTRAINT 给名字时要警醒。
