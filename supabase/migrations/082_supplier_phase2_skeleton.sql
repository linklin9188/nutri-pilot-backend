-- TICKET TELEPOT-20260524-027 第 4 步 Phase 2 §1
-- 供货商对接 Phase 2 骨架版：4 表 (suppliers/skus/click_log/inventory_cache) + RLS + seed 5 意大利 SKU
--
-- 背景：老板拍板 Phase 2 骨架版（架构搭好，API 那层用 mock 数据先跑通，等供货商给真文档 1-2 天填进去）。
-- 详细 spec 见 ticket + docs/供货商对接_第一版_老板拍板.md + docs/SUPPLIER_PITCH_20260521.md。
--
-- Hard rules 遵守：
--   * 不加 FK → auth.users（custom auth 项目，auth.users 表为空）
--   * 不加 FK → user_profiles（其主键 id 是 text，FK 类型不匹配）
--   * 不用 auth.uid() 在 RLS policy（永远 false）— anon-first，USING (true)
--   * dish_ids / sku_ids 用 uuid（非 text）
--   * 全 CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + INSERT 安全操作
--   * 自适应旧 schema：若 production 已存在同名表（旧 placeholder），用 ALTER TABLE ADD COLUMN
--     补齐 Phase 2 字段，不 DROP 旧表也不破坏数据

-- ============================================================================
-- 表 1: suppliers — 供货商档案 + API 配置
-- ============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE suppliers ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS brand_logo_url text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_whatsapp text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_url text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS commission_pct numeric(4,2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS api_base_url text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS api_auth_type text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS api_auth_credentials_encrypted text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS api_status text DEFAULT 'pending_docs';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 补 NOT NULL 约束（先 backfill 防止旧行违反）
UPDATE suppliers SET name = COALESCE(name, 'unnamed') WHERE name IS NULL;
UPDATE suppliers SET status = COALESCE(status, 'pending') WHERE status IS NULL;
UPDATE suppliers SET api_status = COALESCE(api_status, 'pending_docs') WHERE api_status IS NULL;
ALTER TABLE suppliers ALTER COLUMN name SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN status SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN api_status SET NOT NULL;

COMMENT ON COLUMN suppliers.api_status IS 'pending_docs = 待供货商给 API 文档; docs_received = 拿到文档; integrated = Aieats 接好了; live = 真实数据流转中';

-- ============================================================================
-- 表 2: supplier_skus — 食材 + 库存查询配置
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 旧 placeholder 表的 id 列可能没有 default; 强制补上
ALTER TABLE supplier_skus ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS sku_name text;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS sku_image_url text;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS price_hkd numeric(8,2);
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS order_url text;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS ingredient_keywords text[];
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS inventory_check_endpoint_path text;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS sku_external_id text;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE supplier_skus ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 补 NOT NULL 约束
UPDATE supplier_skus SET sku_name = COALESCE(sku_name, 'unnamed') WHERE sku_name IS NULL;
UPDATE supplier_skus SET order_url = COALESCE(order_url, 'https://aieats.app/supplier-placeholder') WHERE order_url IS NULL;
UPDATE supplier_skus SET ingredient_keywords = COALESCE(ingredient_keywords, ARRAY[]::text[]) WHERE ingredient_keywords IS NULL;
UPDATE supplier_skus SET active = COALESCE(active, true) WHERE active IS NULL;
ALTER TABLE supplier_skus ALTER COLUMN sku_name SET NOT NULL;
ALTER TABLE supplier_skus ALTER COLUMN order_url SET NOT NULL;
ALTER TABLE supplier_skus ALTER COLUMN ingredient_keywords SET NOT NULL;
ALTER TABLE supplier_skus ALTER COLUMN active SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_skus_active ON supplier_skus(supplier_id) WHERE active = true;

-- ============================================================================
-- 表 3: supplier_click_log — 用户点击记录
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_click_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE supplier_click_log ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE supplier_click_log ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE supplier_click_log ADD COLUMN IF NOT EXISTS sku_id uuid REFERENCES supplier_skus(id) ON DELETE SET NULL;
ALTER TABLE supplier_click_log ADD COLUMN IF NOT EXISTS source_dish_id uuid REFERENCES dishes(id) ON DELETE SET NULL;
ALTER TABLE supplier_click_log ADD COLUMN IF NOT EXISTS source_page text;
ALTER TABLE supplier_click_log ADD COLUMN IF NOT EXISTS clicked_at timestamptz DEFAULT now();
ALTER TABLE supplier_click_log ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS idx_click_log_sku_time ON supplier_click_log(sku_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_log_user_time ON supplier_click_log(user_id, clicked_at DESC) WHERE user_id IS NOT NULL;

-- ============================================================================
-- 表 4: supplier_inventory_cache — 库存缓存（Phase 2 关键）
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_inventory_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE supplier_inventory_cache ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE supplier_inventory_cache ADD COLUMN IF NOT EXISTS sku_id uuid REFERENCES supplier_skus(id) ON DELETE CASCADE;
ALTER TABLE supplier_inventory_cache ADD COLUMN IF NOT EXISTS stock_count integer;
ALTER TABLE supplier_inventory_cache ADD COLUMN IF NOT EXISTS is_mock boolean DEFAULT true;
ALTER TABLE supplier_inventory_cache ADD COLUMN IF NOT EXISTS last_synced_at timestamptz DEFAULT now();
ALTER TABLE supplier_inventory_cache ADD COLUMN IF NOT EXISTS ttl_seconds integer DEFAULT 300;

-- UNIQUE 约束（sku_id）+ NOT NULL
UPDATE supplier_inventory_cache SET stock_count = COALESCE(stock_count, 0) WHERE stock_count IS NULL;
UPDATE supplier_inventory_cache SET is_mock = COALESCE(is_mock, true) WHERE is_mock IS NULL;
ALTER TABLE supplier_inventory_cache ALTER COLUMN stock_count SET NOT NULL;
ALTER TABLE supplier_inventory_cache ALTER COLUMN is_mock SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'supplier_inventory_cache_sku_id_key'
  ) THEN
    ALTER TABLE supplier_inventory_cache ADD CONSTRAINT supplier_inventory_cache_sku_id_key UNIQUE (sku_id);
  END IF;
END $$;

COMMENT ON TABLE supplier_inventory_cache IS '实时库存缓存：UI 查 cache 不直查 supplier API; backend edge fn 后台按 TTL 刷新';
COMMENT ON COLUMN supplier_inventory_cache.is_mock IS 'true = mock 数据 (Phase 2 骨架版); false = 真 supplier API 返回';

-- ============================================================================
-- RLS — anon-first（符合 custom auth 模式）
-- ============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_click_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_inventory_cache ENABLE ROW LEVEL SECURITY;

-- suppliers: anon 只读 active 的
DROP POLICY IF EXISTS suppliers_anon_read ON suppliers;
DROP POLICY IF EXISTS suppliers_anon_read_authenticated ON suppliers;
CREATE POLICY suppliers_anon_read ON suppliers FOR SELECT TO anon USING (status = 'active');
CREATE POLICY suppliers_anon_read_authenticated ON suppliers FOR SELECT TO authenticated USING (status = 'active');

-- supplier_skus: anon 只读 active 的
DROP POLICY IF EXISTS supplier_skus_anon_read ON supplier_skus;
DROP POLICY IF EXISTS supplier_skus_anon_read_authenticated ON supplier_skus;
CREATE POLICY supplier_skus_anon_read ON supplier_skus FOR SELECT TO anon USING (active = true);
CREATE POLICY supplier_skus_anon_read_authenticated ON supplier_skus FOR SELECT TO authenticated USING (active = true);

-- supplier_click_log: anon INSERT 任意, SELECT none（隐私）
DROP POLICY IF EXISTS supplier_click_log_anon_insert ON supplier_click_log;
DROP POLICY IF EXISTS supplier_click_log_anon_insert_authenticated ON supplier_click_log;
CREATE POLICY supplier_click_log_anon_insert ON supplier_click_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY supplier_click_log_anon_insert_authenticated ON supplier_click_log FOR INSERT TO authenticated WITH CHECK (true);

-- supplier_inventory_cache: anon SELECT all（前端 UI 读 cache）
DROP POLICY IF EXISTS supplier_inventory_cache_anon_read ON supplier_inventory_cache;
DROP POLICY IF EXISTS supplier_inventory_cache_anon_read_authenticated ON supplier_inventory_cache;
CREATE POLICY supplier_inventory_cache_anon_read ON supplier_inventory_cache FOR SELECT TO anon USING (true);
CREATE POLICY supplier_inventory_cache_anon_read_authenticated ON supplier_inventory_cache FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- Seed: 占位供货商（status=pending，前端不显示，等老板谈完真供货商再激活）
-- ============================================================================
INSERT INTO suppliers (id, name, category, contact_whatsapp, contact_url, status, api_status)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Aieats Italian Partner (TBD)',
  'italian',
  NULL,
  NULL,
  'pending',
  'pending_docs'
)
ON CONFLICT (id) DO NOTHING;

-- Seed: 5 个意大利食材 SKU（按 docs/SUPPLIER_PITCH_20260521.md 列）
-- 用 NOT EXISTS 防重复插入（旧 placeholder 表可能已有同名 SKU）
INSERT INTO supplier_skus (supplier_id, sku_name, unit, order_url, ingredient_keywords, active)
SELECT '00000000-0000-4000-8000-000000000001'::uuid, v.sku_name, v.unit, v.order_url, v.keywords, true
FROM (VALUES
  ('Parmigiano Reggiano DOP 24 个月', '100 克块', 'https://aieats.app/supplier-placeholder', ARRAY['帕马森','帕玛森','奶酪','Parmesan','Parmigiano']),
  ('Frantoio Bonamini 特级初榨橄榄油', '500 毫升', 'https://aieats.app/supplier-placeholder', ARRAY['橄榄油','olive oil','EVOO','Bonamini']),
  ('De Cecco 意面 (spaghetti/penne)', '500 克', 'https://aieats.app/supplier-placeholder', ARRAY['意大利面','意面','spaghetti','penne','De Cecco','pasta']),
  ('Mutti 罐装番茄', '400 克', 'https://aieats.app/supplier-placeholder', ARRAY['罐装番茄','番茄罐头','Mutti','tomato can','番茄酱']),
  ('Prosciutto di Parma 火腿切片', '100 克', 'https://aieats.app/supplier-placeholder', ARRAY['火腿','Prosciutto','Parma','意大利火腿','prosciutto di parma'])
) AS v(sku_name, unit, order_url, keywords)
WHERE NOT EXISTS (
  SELECT 1 FROM supplier_skus s
  WHERE s.supplier_id = '00000000-0000-4000-8000-000000000001'::uuid
    AND s.sku_name = v.sku_name
);

-- Seed: mock 库存（每个 SKU 1 行，is_mock=true，假设 50 件）
INSERT INTO supplier_inventory_cache (sku_id, stock_count, is_mock)
SELECT id, 50, true
FROM supplier_skus
WHERE supplier_id = '00000000-0000-4000-8000-000000000001'
ON CONFLICT (sku_id) DO NOTHING;
