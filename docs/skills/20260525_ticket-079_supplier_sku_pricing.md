# TICKET-079 supplier_skus 价格字段基础设施

日期: 2026-05-25
负责: Database Lead
范围: migration 094 — supplier_skus 加 wholesale + retail + markup + commission + stock_status

---

## 1. 问题

老板拍板双收入差价模式（"我们从供应商拿到批发价, 给用户合理零售价, 赚差价"）,
Inalca 已确认走代理价 + 直发 + 包装 + API 模式, 但 DB `supplier_skus` 只有
一个 `price_hkd numeric(8,2)` (082 §62) —— 既没区分批发/零售, 也没记录
markup/佣金/起订量/库存状态。后续 080 购物车 UI 没字段可读, 财务也无法对账。

## 2. 方法

migration 094 一次性补齐 5 个价格字段 + 2 个订购字段:

| 字段                        | 类型           | 语义                                   |
| --------------------------- | -------------- | -------------------------------------- |
| `wholesale_price_hkd`       | numeric(10,2)  | 从供应商拿的批发价 (老板私密, UI 不显) |
| `retail_price_hkd`          | numeric(10,2)  | 给用户的零售价 (UI 显)                 |
| `markup_pct`                | numeric(5,2)   | 加价 %, 运营 sanity check              |
| `commission_amount_hkd`     | numeric(10,2)  | 每单佣金 = retail - wholesale, 财务   |
| `min_order_qty`             | int DEFAULT 1  | 最低起订                                |
| `stock_status`              | text DEFAULT 'unknown' | in_stock/low_stock/out_of_stock/unknown |
| `unit`                      | (已存在)       | 082 §63 已加, IF NOT EXISTS noop      |

5 条 Inalca SKU 按 `sku_name LIKE` 关键词 (Parmigiano / Bonamini / De Cecco /
Mutti / Prosciutto) 单独 UPDATE 占位测试价, 真签合作后 backfill 真价。
所有 INSERT/UPDATE 都用 `WHERE supplier_id = '00000000-0000-4000-8000-000000000001'::uuid`
锚定, 不影响后来加的其他 supplier。

## 3. 标准

- **DB schema 必须先于 UI**: 凡涉商业核心字段 (定价/分成/佣金/库存)
  先在 DB 落字段 + 占位数据, 再开 UI ticket。本 ticket 079 是 080 购物车 UI 的前置。
- **老板私密字段的 RLS 阶段性方案**: anon-first 模式下无法仅靠 RLS 隔离单字段;
  `wholesale_price_hkd` / `commission_amount_hkd` 短期纪律靠 UI 不渲染 +
  COMMENT 备注; 长期要么走 admin RPC, 要么 column-level GRANT REVOKE。
  本 ticket 备注已写入 migration, 后续 admin 模式上线时一次性收紧。
- **既存列冲突保护**: `unit` 在 082 已存在, 094 用 `ADD COLUMN IF NOT EXISTS`
  在 push 时拿到 `NOTICE skipping` — 这是正确行为, 不是 error。任何"扩展老表"
  migration 都必须 grep 历史 migration 确认列是否已存在, 用 IF NOT EXISTS 保护。
- **占位数据的可追溯**: migration 注释里明写"占位 / 测试值 / 真签后 backfill",
  避免后人误以为是真价格。商业敏感占位值应在 spec/工单备案而不是裸数。
