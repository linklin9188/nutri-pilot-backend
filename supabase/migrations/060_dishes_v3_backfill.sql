-- 060_dishes_v3_backfill.sql
-- 工单：TELEPOT-20260521-003 §D
--
-- 基于 title_zh grep 自动 backfill 3 列。所有 UPDATE 用 WHERE col IS NULL
-- 保幂等（重跑 0 行受影响）+ 已有值（如 oil_level 历史已写过的行）不动。
--
-- 兜底策略：每列最后一句 WHERE col IS NULL 给"其他"值（veg / mid / other），
-- 保证 backfill 后无 NULL 残留。
--
-- ⚠️ **oil_level enum 对齐 DB 真相**：dishes_oil_level_check 既有 CHECK
--    `oil_level = ANY (ARRAY['low','mid','high'])`，工单 §D 写的
--    heavy/normal/light 不在允许集。本 migration mapping：
--      工单 heavy  → DB 'high'
--      工单 normal → DB 'mid'
--      工单 light  → DB 'low'
--    UI 079 / Algorithm 073 也应对齐 DB enum 而非工单写法。
--
-- 顺序敏感：早期分支命中后跳过后续，按"特异性递减"排序：
--   - protein_main_class: red > white > seafood > staple > veg
--   - oil_level: high > low > mid
--   - cooking_method: stirfry > steam > stew > cold > braised > grill > fry > other
--
-- 不变量自检：
--   #1 无 FK 改动
--   #2 dish_ids 未触
--   #4 ALGO_VERSION 未触（dishes 新增 metadata 列不影响 useWeeklyMenu cache key）
--   #6 dish.id uuid 未变
--   单 BEGIN/COMMIT 包裹便于整体回滚

BEGIN;

-- ============ protein_main_class backfill ============

UPDATE dishes SET protein_main_class = 'red'
  WHERE protein_main_class IS NULL
    AND (title_zh LIKE '%牛%' OR title_zh LIKE '%猪%' OR title_zh LIKE '%羊%'
         OR title_zh LIKE '%腊%' OR title_zh LIKE '%肠%' OR title_zh LIKE '%肉饼%');

UPDATE dishes SET protein_main_class = 'white'
  WHERE protein_main_class IS NULL
    AND (title_zh LIKE '%鸡%' OR title_zh LIKE '%鸭%' OR title_zh LIKE '%鹅%');

UPDATE dishes SET protein_main_class = 'seafood'
  WHERE protein_main_class IS NULL
    AND (title_zh LIKE '%鱼%' OR title_zh LIKE '%虾%' OR title_zh LIKE '%蟹%'
         OR title_zh LIKE '%贝%' OR title_zh LIKE '%蚌%' OR title_zh LIKE '%蛤%'
         OR title_zh LIKE '%墨鱼%' OR title_zh LIKE '%鱿鱼%' OR title_zh LIKE '%海%');

UPDATE dishes SET protein_main_class = 'staple'
  WHERE protein_main_class IS NULL
    AND (course_type LIKE '%staple%' OR title_zh LIKE '%饭%' OR title_zh LIKE '%面%'
         OR title_zh LIKE '%粥%' OR title_zh LIKE '%粉%' OR title_zh LIKE '%馒%'
         OR title_zh LIKE '%包%' OR title_zh LIKE '%饺%');

UPDATE dishes SET protein_main_class = 'veg'
  WHERE protein_main_class IS NULL;

-- ============ oil_level backfill ============

UPDATE dishes SET oil_level = 'high'
  WHERE oil_level IS NULL
    AND (title_zh LIKE '%红烧%' OR title_zh LIKE '%糖醋%' OR title_zh LIKE '%酱爆%'
         OR title_zh LIKE '%油焖%' OR title_zh LIKE '%炸%' OR title_zh LIKE '%东坡%');

UPDATE dishes SET oil_level = 'low'
  WHERE oil_level IS NULL
    AND (title_zh LIKE '%白灼%' OR title_zh LIKE '%清蒸%' OR title_zh LIKE '%凉拌%'
         OR title_zh LIKE '%水煮%' OR title_zh LIKE '%清炖%' OR title_zh LIKE '%汤%');

UPDATE dishes SET oil_level = 'mid'
  WHERE oil_level IS NULL;

-- ============ cooking_method backfill ============

UPDATE dishes SET cooking_method = 'stirfry'
  WHERE cooking_method IS NULL AND title_zh LIKE '%炒%';

UPDATE dishes SET cooking_method = 'steam'
  WHERE cooking_method IS NULL AND title_zh LIKE '%蒸%';

UPDATE dishes SET cooking_method = 'stew'
  WHERE cooking_method IS NULL AND (title_zh LIKE '%炖%' OR title_zh LIKE '%煲%' OR title_zh LIKE '%焖%');

UPDATE dishes SET cooking_method = 'cold'
  WHERE cooking_method IS NULL AND title_zh LIKE '%凉拌%';

UPDATE dishes SET cooking_method = 'braised'
  WHERE cooking_method IS NULL AND (title_zh LIKE '%红烧%' OR title_zh LIKE '%卤%');

UPDATE dishes SET cooking_method = 'grill'
  WHERE cooking_method IS NULL AND (title_zh LIKE '%烤%' OR title_zh LIKE '%煎%');

UPDATE dishes SET cooking_method = 'fry'
  WHERE cooking_method IS NULL AND title_zh LIKE '%炸%';

UPDATE dishes SET cooking_method = 'other'
  WHERE cooking_method IS NULL;

COMMIT;
