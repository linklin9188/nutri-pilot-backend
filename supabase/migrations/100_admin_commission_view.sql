-- TICKET TELEPOT-20260525-090 P0 Phase 2 — admin_monthly_commission view
--
-- 给会计 / BI 工具 SQL 直查的口子, 等价于 server.js /api/admin/commission 的聚合.
-- 后端 endpoint 仍走 JS 聚合 (无 view 也能跑), 这个 view 是 nice-to-have 备份.
--
-- 字段:
--   month            — paid_at 的 YYYY-MM
--   supplier_id      — supplier_skus.supplier_id (含 NULL — 标记 SKU 已删 / 解绑情况)
--   supplier_name    — suppliers.name (含 '(未知供应商)' 兜底)
--   order_count      — DISTINCT order_id
--   total_wholesale  — Σ qty × unit_wholesale_price_hkd
--   total_retail     — Σ subtotal_hkd
--   total_commission — Σ commission_hkd
--
-- 只统计 status='paid' 的订单 (跟 server.js 行为一致).
-- 假设依赖 (095 migration 已建): orders / order_items / supplier_skus / suppliers.

CREATE OR REPLACE VIEW admin_monthly_commission AS
SELECT
  to_char(o.paid_at, 'YYYY-MM')                              AS month,
  ss.supplier_id                                             AS supplier_id,
  COALESCE(s.name, '(未知供应商)')                            AS supplier_name,
  COUNT(DISTINCT o.id)                                       AS order_count,
  ROUND(SUM(COALESCE(oi.unit_wholesale_price_hkd, 0) * COALESCE(oi.qty, 0))::numeric, 2)
                                                             AS total_wholesale,
  ROUND(SUM(COALESCE(oi.subtotal_hkd, 0))::numeric, 2)       AS total_retail,
  ROUND(SUM(COALESCE(oi.commission_hkd, 0))::numeric, 2)     AS total_commission
FROM orders o
JOIN order_items oi   ON oi.order_id    = o.id
LEFT JOIN supplier_skus ss ON ss.id    = oi.sku_id
LEFT JOIN suppliers s      ON s.id     = ss.supplier_id
WHERE o.status = 'paid'
  AND o.paid_at IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 6 DESC;

COMMENT ON VIEW admin_monthly_commission IS
  'TICKET-090 Phase 2: 月度按供应商聚合的佣金视图, 仅 status=paid 订单. server.js /api/admin/commission 的等价 SQL 备份.';
