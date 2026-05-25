-- TICKET TELEPOT-20260525-080-A P0: 购物车 + 订单基础表
--
-- 背景: 老板拍板双收入模式 (Stripe 订阅 + 采购差价).
-- 094 已加 supplier_skus.wholesale_price_hkd + retail_price_hkd.
-- 本 ticket 080-A: 只做 DB schema + 购物车 UI + 4 页, **不做 Stripe 支付** (留 080-B).
--
-- 5 张表:
--   1. shopping_carts        — 1 用户 1 车 (跨设备 sync, UNIQUE user_id)
--   2. cart_items            — 购物车里的 SKU + 数量
--   3. orders                — 订单主表 (价格快照 + 收货 + 状态机)
--   4. order_items           — 订单明细 (价格快照, 含老板私密 wholesale)
--   5. order_status_history  — 状态变更日志
--
-- Hard rules:
--   * IF NOT EXISTS / IF EXISTS 全程
--   * 跟 CLAUDE.md custom-auth 一致 → FK 目标 user_profiles(id) (text), 不是 auth.users
--   * RLS anon-first FOR ALL USING (true) (跟 Smell 3 B-1 解决模式一致)
--   * order_items.unit_wholesale_price_hkd + commission_hkd 写入但 UI 不渲染 (老板私密)
--
-- ⚠️ remote DB pre-existing placeholders 清理:
-- 实查发现 remote DB 有 5 张同名 placeholder 表 (空表残留, src/ + supabase/functions/
-- 全代码库 grep 0 引用), id 列类型 text 与本 migration uuid 不兼容. 因为 0 应用引用 +
-- 空表, 这里 DROP CASCADE 重建. 不影响任何现有功能.

DROP TABLE IF EXISTS order_status_history CASCADE;
DROP TABLE IF EXISTS order_items          CASCADE;
DROP TABLE IF EXISTS cart_items           CASCADE;
DROP TABLE IF EXISTS shopping_carts       CASCADE;
DROP TABLE IF EXISTS orders               CASCADE;

-- ============================================================================
-- §1. shopping_carts — 1 用户 1 购物车
-- ============================================================================
CREATE TABLE IF NOT EXISTS shopping_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE shopping_carts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE shopping_carts ADD COLUMN IF NOT EXISTS user_id    text;
ALTER TABLE shopping_carts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shopping_carts_user_id_key' AND conrelid = 'shopping_carts'::regclass
  ) THEN
    DELETE FROM shopping_carts WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM user_profiles);
    ALTER TABLE shopping_carts ADD CONSTRAINT shopping_carts_user_id_key UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shopping_carts_user_id_fkey' AND conrelid = 'shopping_carts'::regclass
  ) THEN
    ALTER TABLE shopping_carts ADD CONSTRAINT shopping_carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE shopping_carts IS 'TICKET-080-A: 1 用户 1 购物车; 跨设备 sync (UNIQUE user_id)';

-- ============================================================================
-- §2. cart_items — 购物车里的 SKU
-- ============================================================================
CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE cart_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS cart_id  uuid;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS sku_id   uuid;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS qty      int DEFAULT 1;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_qty_check' AND conrelid = 'cart_items'::regclass
  ) THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_qty_check CHECK (qty > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_cart_sku_key' AND conrelid = 'cart_items'::regclass
  ) THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_cart_sku_key UNIQUE (cart_id, sku_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_cart_id_fkey' AND conrelid = 'cart_items'::regclass
  ) THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES shopping_carts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_sku_id_fkey' AND conrelid = 'cart_items'::regclass
  ) THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES supplier_skus(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

COMMENT ON TABLE cart_items IS 'TICKET-080-A: UNIQUE (cart_id, sku_id) → 同 SKU 加车自动累加 qty';

-- ============================================================================
-- §3. orders — 订单主表
--
-- ⚠️ 注意: remote DB 可能已有 placeholder orders 表 (旧 supplier 实验残留),
-- 用 IF NOT EXISTS + ADD COLUMN IF NOT EXISTS 兼容. PRIMARY KEY (id uuid) 是
-- 唯一假设; 其他列全部 ALTER ADD.
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
-- 旧 placeholder 表的 id 列可能没有 default; 强制补上
ALTER TABLE orders ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 订单号 + 关联
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS household_id uuid;

-- 收货
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_contact_name  text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_contact_phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time_slot     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note          text;

-- 价格快照 (下单时刻冻结)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_hkd          numeric(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_hkd      numeric(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_hkd             numeric(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_total_hkd  numeric(10, 2);  -- 老板私密

-- 状态机
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending_payment';

-- 支付 (080-B 接 Stripe 时填)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id        text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at                  timestamptz;

-- 物流 (080-C 接 Inalca API 时填)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_order_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at        timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at      timestamptz;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- order_number 自动生成 default + UNIQUE
ALTER TABLE orders ALTER COLUMN order_number SET DEFAULT 'AE' || to_char(now(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_number_key' AND conrelid = 'orders'::regclass
  ) THEN
    -- 旧行补 order_number 防 UNIQUE 失败
    UPDATE orders SET order_number = 'AE' || to_char(COALESCE(created_at, now()), 'YYYYMMDD') || LPAD(FLOOR(RANDOM() * 100000)::text, 5, '0')
      WHERE order_number IS NULL;
    ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

-- FK to user_profiles(id) (text) — 显式 DO 块, IF NOT EXISTS 模拟
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_user_id_fkey' AND conrelid = 'orders'::regclass
  ) THEN
    -- 旧行 user_id 为 NULL 或不匹配的话先清掉避免 FK 加失败 (placeholder 表场景)
    DELETE FROM orders WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM user_profiles);
    ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_household_id_fkey' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

COMMENT ON COLUMN orders.commission_total_hkd IS 'TICKET-080-A: 爱吃总佣金快照, 老板私密 UI 不渲染';
COMMENT ON COLUMN orders.status IS 'pending_payment / paid / preparing / shipped / delivered / cancelled / refunded';

-- ============================================================================
-- §4. order_items — 订单明细 (价格快照)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE order_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS order_id                  uuid;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku_id                    uuid;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku_name_snapshot         text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS qty                       int;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_retail_price_hkd     numeric(10, 2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_wholesale_price_hkd  numeric(10, 2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal_hkd              numeric(10, 2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS commission_hkd            numeric(10, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey' AND conrelid = 'order_items'::regclass
  ) THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_sku_id_fkey' AND conrelid = 'order_items'::regclass
  ) THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES supplier_skus(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

COMMENT ON COLUMN order_items.unit_wholesale_price_hkd IS 'TICKET-080-A: SKU 批发价快照, 老板私密 UI 不渲染';
COMMENT ON COLUMN order_items.commission_hkd IS 'TICKET-080-A: 单 SKU 佣金快照 = qty × (retail - wholesale), 老板私密 UI 不渲染';

-- ============================================================================
-- §5. order_status_history — 状态变更日志
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE order_status_history ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS order_id   uuid;
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS status     text;
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS note       text;
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS changed_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_order_id_fkey' AND conrelid = 'order_status_history'::regclass
  ) THEN
    ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, changed_at DESC);

-- ============================================================================
-- §6. RLS — anon-first FOR ALL USING (true) (跟 Smell 3 B-1 解决模式一致)
-- ============================================================================
ALTER TABLE shopping_carts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shopping_carts_anon_full       ON shopping_carts;
DROP POLICY IF EXISTS cart_items_anon_full           ON cart_items;
DROP POLICY IF EXISTS orders_anon_full               ON orders;
DROP POLICY IF EXISTS order_items_anon_full          ON order_items;
DROP POLICY IF EXISTS order_status_history_anon_full ON order_status_history;

CREATE POLICY shopping_carts_anon_full       ON shopping_carts        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY cart_items_anon_full           ON cart_items            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY orders_anon_full               ON orders                FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY order_items_anon_full          ON order_items           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY order_status_history_anon_full ON order_status_history  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- §7. updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_orders_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_orders_updated_at();

DROP TRIGGER IF EXISTS trg_shopping_carts_updated_at ON shopping_carts;
CREATE TRIGGER trg_shopping_carts_updated_at BEFORE UPDATE ON shopping_carts
  FOR EACH ROW EXECUTE FUNCTION fn_orders_updated_at();
