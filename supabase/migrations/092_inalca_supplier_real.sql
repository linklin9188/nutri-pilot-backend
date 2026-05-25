-- TICKET TELEPOT-20260525-077 P0: Inalca F&B 唯一真合作供应商真化
--
-- 背景：老板拍板用 Inalca F&B (意大利 Cremonini 集团旗下) 作为唯一真合作供应商,
-- 香港代理 Bright View Trading Hong Kong Ltd. 还没签约, 所以 status='preview':
--   - UI 显示 (合作供应商 · 1 家 + 公司介绍 modal + 信任认证)
--   - 但"一键下单"按钮变 "即将开放 · 敬请期待" (不露销售)
--
-- ⚠️ 红线 (老板紧急 2026-05-25 拦截修订):
--   - 销售联系方式 (Irish 名/邮/电) = 老板核心机密 = 商业机密
--   - DB 字段 sales_contact_* 保留 (后台备查), 但 UI **绝不渲染**
--   - 不提 "Bright View Trading" 这个代理公司名 (用户不需知中间商)
--   - 不露 website_url (引导用户绕过我们直采就漏商业模式)
--   - description 改用户视角卖点 (60 年品牌 + 欧洲最大 + Cremonini + 直采源头价格优势)
--
-- 字段总览：
--   1. 13 个公司介绍字段 (description 三语 + country/parent/founded/certs/address/contact)
--   2. 2 个 API 对接规划字段 (api_integration_status + api_features)
--   3. 删其他 placeholder supplier (旧 mock 数据)
--   4. 填全 Inalca row 信息 + status='preview' + 用户视角 description
--   5. 扩 RLS — anon 也能读 'preview' 状态
--
-- Hard rules 遵守：
--   * IF NOT EXISTS / IF EXISTS 全程
--   * supplier_skus FK→suppliers 已有 ON DELETE CASCADE (082 §52-59), 删 supplier 自动级联
--   * RLS 082 已设 (suppliers_anon_read: status='active') — 但 'preview' 不通过, 必须扩

-- ============================================================================
-- §1. 加 13 个公司介绍字段 + 2 个 API 对接字段
-- ============================================================================
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS description_zh text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS description_tl text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country_origin text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS parent_brand text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS founded_year int;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS certifications text[];
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_zh text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_en text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sales_contact_name text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sales_contact_email text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sales_contact_mobile text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website_url text;

-- API 对接规划 (老板紧急修订 §4)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS api_integration_status text DEFAULT 'planned';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS api_features text[];

COMMENT ON COLUMN suppliers.country_origin IS 'ISO-3166 alpha-2 国家代码 (e.g. IT/JP/HK); 用于 UI 显示国旗 emoji';
COMMENT ON COLUMN suppliers.parent_brand IS '母品牌/集团 (e.g. "Inalca S.p.A. · Cremonini Group")';
COMMENT ON COLUMN suppliers.certifications IS '信任认证 (e.g. ["IFS Food", "BRC Global"]); UI 显示 chip 列表';
COMMENT ON COLUMN suppliers.sales_contact_name IS '⚠️ 商业机密 — 仅老板后台可见, 前端绝不渲染';
COMMENT ON COLUMN suppliers.sales_contact_email IS '⚠️ 商业机密 — 仅老板后台可见, 前端绝不渲染';
COMMENT ON COLUMN suppliers.sales_contact_mobile IS '⚠️ 商业机密 — 仅老板后台可见, 前端绝不渲染';
COMMENT ON COLUMN suppliers.website_url IS '⚠️ 前端不显 — 避免用户绕过我们直接联系供应商';
COMMENT ON COLUMN suppliers.api_integration_status IS 'planned (规划中) / in_progress (对接中) / integrated (已接通)';
COMMENT ON COLUMN suppliers.api_features IS 'order/inventory/delivery_track 等; 标识此供应商支持哪些 API';

-- ============================================================================
-- §2. 删除非 Inalca 的所有 supplier_skus 与 suppliers
-- (082 §59 supplier_skus.supplier_id FK ON DELETE CASCADE — 显式 DELETE 保险)
-- ============================================================================
DELETE FROM supplier_skus WHERE supplier_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid;
DELETE FROM suppliers     WHERE id          IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid;

-- ============================================================================
-- §3. 填全 Inalca row 信息 + status='preview' + 用户视角 description
-- ============================================================================
UPDATE suppliers SET
  name                    = 'Inalca · 意大利顶级肉品',
  status                  = 'preview',
  category                = 'premium_meat_dairy',
  contact_whatsapp        = '+85260917363',
  contact_url             = 'mailto:Irish@brightview.com.hk',
  country_origin          = 'IT',
  parent_brand            = 'Cremonini Group',
  founded_year            = 1963,
  certifications          = ARRAY['IFS Food', 'BRC Global', 'EU Organic']::text[],
  address_zh              = '香港新界葵涌青山公路 585-609 号嘉民葵涌物流中心 3 楼全层',
  address_en              = '3/F, Goodman Kwai Chung Logistics Centre, 585-609 Castle Peak Road, Kwai Chung, HK',
  sales_contact_name      = 'Irish Zambrano Acmé',
  sales_contact_email     = 'Irish@brightview.com.hk',
  sales_contact_mobile    = '+852 6091 7363',
  website_url             = 'https://www.inalcafb.hk',
  description_zh          = '欧洲最大肉类加工商之一, 1963 年于意大利成立, 隶属 Cremonini 集团。专注顶级牛肉、火腿、奶酪、橄榄油, 60 年来供应欧洲米其林餐厅与高端零售。意大利原产, 空运直采到港。',
  description_en          = 'One of Europe''s largest meat processors, founded in Italy in 1963 as part of Cremonini Group. 60 years of premium beef, ham, cheese, olive oil — trusted by Michelin restaurants and luxury retail across Europe. Air-shipped from Italy direct to HK.',
  description_tl          = 'Isa sa pinakamalaking meat processor sa Europe, itinatag noong 1963 sa Italya bilang bahagi ng Cremonini Group. 60 taon ng premium beef, ham, cheese, at olive oil — pinagkakatiwalaan ng mga Michelin restaurant at luxury retail sa buong Europe.',
  api_integration_status  = 'planned',
  api_features            = ARRAY['order', 'inventory', 'delivery_track']::text[],
  updated_at              = now()
WHERE id = '00000000-0000-4000-8000-000000000001'::uuid;

-- 兜底：万一 082 §172 INSERT 在某个环境未跑 (新 DB / db reset), 补 INSERT。
INSERT INTO suppliers (
  id, name, status, category, contact_whatsapp, contact_url,
  country_origin, parent_brand, founded_year, certifications,
  address_zh, address_en,
  sales_contact_name, sales_contact_email, sales_contact_mobile, website_url,
  description_zh, description_en, description_tl,
  api_integration_status, api_features
) VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Inalca · 意大利顶级肉品',
  'preview',
  'premium_meat_dairy',
  '+85260917363',
  'mailto:Irish@brightview.com.hk',
  'IT',
  'Cremonini Group',
  1963,
  ARRAY['IFS Food', 'BRC Global', 'EU Organic']::text[],
  '香港新界葵涌青山公路 585-609 号嘉民葵涌物流中心 3 楼全层',
  '3/F, Goodman Kwai Chung Logistics Centre, 585-609 Castle Peak Road, Kwai Chung, HK',
  'Irish Zambrano Acmé',
  'Irish@brightview.com.hk',
  '+852 6091 7363',
  'https://www.inalcafb.hk',
  '欧洲最大肉类加工商之一, 1963 年于意大利成立, 隶属 Cremonini 集团。专注顶级牛肉、火腿、奶酪、橄榄油, 60 年来供应欧洲米其林餐厅与高端零售。意大利原产, 空运直采到港。',
  'One of Europe''s largest meat processors, founded in Italy in 1963 as part of Cremonini Group. 60 years of premium beef, ham, cheese, olive oil — trusted by Michelin restaurants and luxury retail across Europe. Air-shipped from Italy direct to HK.',
  'Isa sa pinakamalaking meat processor sa Europe, itinatag noong 1963 sa Italya bilang bahagi ng Cremonini Group. 60 taon ng premium beef, ham, cheese, at olive oil — pinagkakatiwalaan ng mga Michelin restaurant at luxury retail sa buong Europe.',
  'planned',
  ARRAY['order', 'inventory', 'delivery_track']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- §4. 扩 RLS — 让 anon 也能读 'preview' 状态 (旧 082 policy 只放 'active')
-- ============================================================================
DROP POLICY IF EXISTS suppliers_anon_read ON suppliers;
DROP POLICY IF EXISTS suppliers_anon_read_authenticated ON suppliers;
CREATE POLICY suppliers_anon_read              ON suppliers FOR SELECT TO anon          USING (status IN ('active', 'preview'));
CREATE POLICY suppliers_anon_read_authenticated ON suppliers FOR SELECT TO authenticated USING (status IN ('active', 'preview'));
