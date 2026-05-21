-- 061_dishes_phase2_pilot.sql
-- 工单：TELEPOT-20260521-004（Phase 2 dish 扩容 250 道 pilot 段）
--
-- CLAUDE.md "Bulk-operation strategy"：小批量（3-5 行）先验，再 scale。
-- 本棒 250 道大批量，先 10 道 pilot 验证：
--   (1) WHERE NOT EXISTS 幂等路径打通
--   (2) v3 metadata 字段（protein_main_class / oil_level / cooking_method）值集合规
--   (3) 测算重名率：经典菜大概率已存（如麻婆豆腐 / 红烧肉），看跳过比例决定 scale 250 道是否值得
--
-- 字段策略（按 002/003 棒实查）：
--   - meal_type 单值 'lunch' / 'dinner' / 'all' / 'breakfast'（DB 不支持多值）
--   - 不写 score_default（字段不存在）
--   - 不写 image_url / nutrition（留 Backend pipeline）
--   - WHERE NOT EXISTS 保幂等（dishes 无 UNIQUE on title_zh）
--   - oil_level DB enum: {low,mid,high}（不是 heavy/normal/light）
--
-- Pilot 10 道（每 cuisine 1-2 道，覆盖 protein_main_class 5 种 + oil_level 3 种 + cooking_method 7 种）：

BEGIN;

-- sichuan red mid stirfry
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '小炒黄牛肉', 'Spicy Stir-Fried Yellow Beef', 'sichuan', 'dinner', 'main_protein', 'red', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '小炒黄牛肉');

-- sichuan veg mid stirfry
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '干煸豆角', 'Dry-Fried Green Beans', 'sichuan', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '干煸豆角');

-- cantonese white low steam
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '白切鸡', 'Cantonese Poached Chicken', 'cantonese', 'dinner', 'main_protein', 'white', 'low', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '白切鸡');

-- cantonese seafood low steam
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '清蒸鲈鱼', 'Steamed Sea Bass', 'cantonese', 'dinner', 'main_protein', 'seafood', 'low', 'steam'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '清蒸鲈鱼');

-- jiangnan red high braised
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '东坡肉', 'Dongpo Pork Belly', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '东坡肉');

-- jiangnan seafood mid braised
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '油焖大虾', 'Braised Prawns in Soy Sauce', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '油焖大虾');

-- northern red mid stew
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '萝卜炖牛腩', 'Beef Brisket and Radish Stew', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '萝卜炖牛腩');

-- northern veg low cold
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '拍黄瓜', 'Smashed Cucumber Salad', 'northern', 'lunch', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '拍黄瓜');

-- western red mid grill
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '菲力牛排', 'Filet Mignon Steak', 'western', 'dinner', 'main_protein', 'red', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '菲力牛排');

-- western veg low cold
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '凯撒沙拉', 'Caesar Salad', 'western', 'lunch', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '凯撒沙拉');

COMMIT;
