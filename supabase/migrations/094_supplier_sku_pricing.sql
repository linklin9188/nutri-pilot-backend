-- TICKET TELEPOT-20260525-079 P0: supplier_skus 加 wholesale + retail + markup 字段
--
-- 背景: 老板拍板双收入模式 (采购差价基础设施)
--   "我们的盈利模式, 是从供应商和用户的价格里赚取佣金。
--    比如我们从供应商拿到了一个价格, 再给用户一个合理的销售价格, 赚取差价。"
--
-- Inalca 模式 (老板已确认):
--   - 给代理价 (我们拿 wholesale)
--   - 直接发货给用户 (我们不持仓)
--   - 包装运输 (合规归责 Inalca)
--   - 有 API (下单 / 库存 / 物流追踪)
--   = Aieats 是销售代理, Inalca 给我们 commission
--
-- 本 ticket 只加 DB 价格字段基础设施, UI 在后续 080 购物车 ticket 做。
--
-- Hard rules:
--   * IF NOT EXISTS / IF EXISTS 全程 (082 已有 supplier_skus.price_hkd + supplier_skus.unit,
--     本 migration 不动它们)
--   * RLS 沿用 082 (supplier_skus_anon_read: active=true) —— 老板私密的 wholesale 字段
--     在 anon SELECT 也会返回; UI **不渲染** wholesale_price_hkd / commission_amount_hkd
--     (UI 部门 080 落地时纪律执行)。短期可接受, 等 admin/RPC 模式落地后再 column-grants 收紧。

-- ============================================================================
-- §1. 加 5 个价格 + 2 个订购字段 (unit 已在 082, 这里 IF NOT EXISTS 无 op)
-- ============================================================================
ALTER TABLE supplier_skus
  ADD COLUMN IF NOT EXISTS wholesale_price_hkd numeric(10,2);
ALTER TABLE supplier_skus
  ADD COLUMN IF NOT EXISTS retail_price_hkd numeric(10,2);
ALTER TABLE supplier_skus
  ADD COLUMN IF NOT EXISTS markup_pct numeric(5,2);
ALTER TABLE supplier_skus
  ADD COLUMN IF NOT EXISTS commission_amount_hkd numeric(10,2);
ALTER TABLE supplier_skus
  ADD COLUMN IF NOT EXISTS unit text DEFAULT '份';
ALTER TABLE supplier_skus
  ADD COLUMN IF NOT EXISTS min_order_qty int DEFAULT 1;
ALTER TABLE supplier_skus
  ADD COLUMN IF NOT EXISTS stock_status text DEFAULT 'unknown';

COMMENT ON COLUMN supplier_skus.wholesale_price_hkd IS
  'TICKET-079: 从供应商拿的批发价 (老板私密). RLS 沿用 anon-first 但 UI 不渲染';
COMMENT ON COLUMN supplier_skus.retail_price_hkd IS
  'TICKET-079: 给用户的零售价 = wholesale * (1 + markup_pct/100)';
COMMENT ON COLUMN supplier_skus.markup_pct IS
  'TICKET-079: 加价 %, 给运营做 sanity check';
COMMENT ON COLUMN supplier_skus.commission_amount_hkd IS
  'TICKET-079: 每单佣金 = retail - wholesale, 财务对账';
COMMENT ON COLUMN supplier_skus.min_order_qty IS
  'TICKET-079: 最低起订数量, 默认 1';
COMMENT ON COLUMN supplier_skus.stock_status IS
  'TICKET-079: in_stock / low_stock / out_of_stock / unknown (等 080 接 Inalca API 实时同步)';

-- ============================================================================
-- §2. 给现有 5 条 Inalca SKU 填占位测试价 (供 080 购物车 UI 用)
-- 真合作签约后 backfill 真价; 现在用 CEO 自决占位值。
--
-- 5 条 SKU 名 (082 §188-193 写入):
--   - Parmigiano Reggiano DOP 24 个月 (100 克块)
--   - Frantoio Bonamini 特级初榨橄榄油 (500 毫升)
--   - De Cecco 意面 (spaghetti/penne) (500 克)
--   - Mutti 罐装番茄 (400 克)
--   - Prosciutto di Parma 火腿切片 (100 克)
--
-- 价格按工单 spec, 按 sku_name 关键词对齐 (082 单位 100 克 vs spec 500g 不影响占位值):
--   帕马森: 批 80 / 零售 120 / 加价 50% / 佣金 40
--   橄榄油: 批 60 / 零售 95 / 加价 58.33% / 佣金 35
--   火腿: 批 90 / 零售 145 / 加价 61.11% / 佣金 55
--   罐装番茄: 批 18 / 零售 32 / 加价 77.78% / 佣金 14
--   意面: 批 22 / 零售 38 / 加价 72.73% / 佣金 16
-- ============================================================================

-- 帕马森奶酪
UPDATE supplier_skus SET
  wholesale_price_hkd  = 80.00,
  retail_price_hkd     = 120.00,
  markup_pct           = 50.00,
  commission_amount_hkd = 40.00,
  min_order_qty        = 1,
  stock_status         = 'in_stock',
  updated_at           = now()
WHERE supplier_id = '00000000-0000-4000-8000-000000000001'::uuid
  AND sku_name LIKE '%Parmigiano%';

-- 橄榄油
UPDATE supplier_skus SET
  wholesale_price_hkd  = 60.00,
  retail_price_hkd     = 95.00,
  markup_pct           = 58.33,
  commission_amount_hkd = 35.00,
  min_order_qty        = 1,
  stock_status         = 'in_stock',
  updated_at           = now()
WHERE supplier_id = '00000000-0000-4000-8000-000000000001'::uuid
  AND sku_name LIKE '%Bonamini%';

-- 意面
UPDATE supplier_skus SET
  wholesale_price_hkd  = 22.00,
  retail_price_hkd     = 38.00,
  markup_pct           = 72.73,
  commission_amount_hkd = 16.00,
  min_order_qty        = 1,
  stock_status         = 'in_stock',
  updated_at           = now()
WHERE supplier_id = '00000000-0000-4000-8000-000000000001'::uuid
  AND sku_name LIKE '%De Cecco%';

-- 罐装番茄
UPDATE supplier_skus SET
  wholesale_price_hkd  = 18.00,
  retail_price_hkd     = 32.00,
  markup_pct           = 77.78,
  commission_amount_hkd = 14.00,
  min_order_qty        = 1,
  stock_status         = 'in_stock',
  updated_at           = now()
WHERE supplier_id = '00000000-0000-4000-8000-000000000001'::uuid
  AND sku_name LIKE '%Mutti%';

-- Prosciutto 火腿
UPDATE supplier_skus SET
  wholesale_price_hkd  = 90.00,
  retail_price_hkd     = 145.00,
  markup_pct           = 61.11,
  commission_amount_hkd = 55.00,
  min_order_qty        = 1,
  stock_status         = 'in_stock',
  updated_at           = now()
WHERE supplier_id = '00000000-0000-4000-8000-000000000001'::uuid
  AND sku_name LIKE '%Prosciutto%';

-- ============================================================================
-- §3. 索引 — 加速 080 购物车按库存状态过滤
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_supplier_skus_stock
  ON supplier_skus(stock_status)
  WHERE stock_status IS NOT NULL;
