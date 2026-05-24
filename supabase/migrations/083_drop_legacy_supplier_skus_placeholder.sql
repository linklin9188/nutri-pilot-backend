-- TICKET-029: 清掉第 1 棒 TICKET-027 backfill 留下的 38 行 unnamed placeholder
-- 实查确认（CEO 2026-05-24 21:55 HKT）：
--   旧 placeholder 全部 supplier_id IS NULL + sku_name = 'unnamed' + ingredient_keywords = []
--   新 5 行意大利 SKU supplier_id = '00000000-0000-4000-8000-000000000001'，不受影响
-- 老板 explicit ack "清掉"
DELETE FROM supplier_skus WHERE supplier_id IS NULL;
