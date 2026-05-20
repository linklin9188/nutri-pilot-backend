-- 044_fruit_cuisine_backfill.sql
-- P18 — dishes 15 行 missing origin_cuisine batch 补（按 048 §B audit 发现）
-- 工单：TELEPOT-20260520-054 §B
--
-- 分析：15 行全是 source='curated_fruit' 的水果（哈密瓜/柚子/桃子/梨/樱桃/橙子/
-- 火龙果/猕猴桃/芒果/苹果/草莓/葡萄/蓝莓/西瓜/香蕉）。水果无"菜系"概念，
-- origin_cuisine NULL 业务上无毛病但与 cuisineFilter 不友好——
-- 设 'all-season/balanced'（已在 enum 集，语义"通用"）作为兜底。
-- CEO 工单 §B "默认 other" 字面值不在 dishes.origin_cuisine 现有 enum 集，
-- 用 'all-season/balanced' 替代（语义等价，不污染 enum 一致性）。
--
-- 不变量 #1 自检：仅 UPDATE 现有列，无新 FK
-- 不变量 #4：不动 ALGO_VERSION（v42 保持）

BEGIN;

UPDATE dishes
SET origin_cuisine = 'all-season/balanced'
WHERE source = 'curated_fruit'
  AND (origin_cuisine IS NULL OR origin_cuisine = '');

COMMIT;
