-- 063_dishes_phase2_continued.sql
-- 工单：TELEPOT-20260521-005（Phase 2 dish 扩容 续棒）
--
-- §A 缺口探查（2026-05-21 实查 822 道，gap 阈值 < 15）：
--   western×white(3) / japanese_korean×veg(4) / northern×seafood(6) /
--   western×seafood(7) / sichuan×seafood(8) / jiangnan×white(8) /
--   japanese_korean×white(10) / jiangnan×red(10) / southeast_asian×white(11) /
--   japanese_korean×red(11) / northern×white(12) / sichuan×red(13) /
--   sichuan×white(14) / southeast_asian×veg(14) / southeast_asian×staple(14)
--
-- 本棒候选 ~130 道，按缺口分组精选（避开已知经典如麻婆豆腐/水煮鱼/红烧肉/凯撒沙拉/
-- 海南鸡饭/寿喜烧/泰式炒河粉/越南春卷 等大概率已存）。
--
-- ⚠️ DB 真相：dishes 无 UNIQUE on title_zh（只有 PK），无法用 ON CONFLICT (title_zh)。
-- 沿用 061/062 的 WHERE NOT EXISTS 幂等路径。CEO 工单 §B 的 ON CONFLICT 写法在
-- DB 真相下不可用，下棒如需 ON CONFLICT 须先加 UNIQUE 约束。
--
-- 全字段写入策略：title_zh / title_en / origin_cuisine / meal_type / course_type /
-- protein_main_class / oil_level / cooking_method。不写 score_default（字段不存在）/
-- image_url / nutrition / cook_steps（Backend pipeline 处理）。
--
-- oil_level enum: {low, mid, high}（060 已对齐 DB enum）。
-- cooking_method enum: {stirfry, steam, stew, cold, braised, grill, fry, other}。
--
-- 不变量自检：#1 不加 FK→auth.users；#2 dish_ids 未触；
--           #4 ALGO_VERSION 不需要 bump（新增数据，不改算法）；
--           #6 dish.id uuid 不变（PG 默认 UUID 生成器）。

BEGIN;

-- ============ western × white（缺口 3 → +14 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '香煎鸡胸肉', 'Pan-Seared Chicken Breast', 'western', 'dinner', 'main_protein', 'white', 'low', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '香煎鸡胸肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '奶油蘑菇鸡', 'Creamy Mushroom Chicken', 'western', 'dinner', 'main_protein', 'white', 'high', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '奶油蘑菇鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '法式黄油鸡', 'French Butter Chicken', 'western', 'dinner', 'main_protein', 'white', 'high', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '法式黄油鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蒜香烤鸡腿', 'Garlic Roasted Chicken Thigh', 'western', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蒜香烤鸡腿');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '意式柠檬鸡', 'Italian Lemon Chicken', 'western', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '意式柠檬鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '烤火鸡', 'Roast Turkey', 'western', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '烤火鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '鸡肉凯撒卷', 'Chicken Caesar Wrap', 'western', 'lunch', 'main_protein', 'white', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '鸡肉凯撒卷');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '香草烤春鸡', 'Herb Roasted Spring Chicken', 'western', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '香草烤春鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '鸡肉藜麦碗', 'Chicken Quinoa Bowl', 'western', 'lunch', 'main_protein', 'white', 'low', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '鸡肉藜麦碗');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '法式白酒炖鸡', 'Coq au Vin Blanc', 'western', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '法式白酒炖鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '鸡肉土豆泥派', 'Chicken Shepherds Pie', 'western', 'dinner', 'main_protein', 'white', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '鸡肉土豆泥派');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '香煎火鸡胸', 'Pan-Seared Turkey Breast', 'western', 'dinner', 'main_protein', 'white', 'low', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '香煎火鸡胸');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '西班牙煎鸡', 'Pollo a la Plancha', 'western', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '西班牙煎鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '迷迭香烤鸡', 'Rosemary Roasted Chicken', 'western', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '迷迭香烤鸡');

-- ============ japanese_korean × veg（缺口 4 → +13 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式凉拌菠菜', 'Korean Sesame Spinach', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式凉拌菠菜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式凉拌豆芽', 'Korean Bean Sprout Salad', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式凉拌豆芽');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式凉拌海带', 'Korean Seaweed Salad', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式凉拌海带');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式茄子田乐', 'Nasu Dengaku', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式茄子田乐');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式秋葵', 'Japanese Okra with Bonito', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式秋葵');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式凉拌萝卜丝', 'Korean Radish Salad', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式凉拌萝卜丝');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式凉拌豆腐', 'Hiyayakko Cold Tofu', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式凉拌豆腐');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式煮南瓜', 'Kabocha Nimono', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式煮南瓜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式凉拌牛蒡丝', 'Kinpira Gobo', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式凉拌牛蒡丝');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式煮羊栖菜', 'Hijiki Stew', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式煮羊栖菜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式凉拌小松菜', 'Komatsuna Ohitashi', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式凉拌小松菜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式凉拌茄子', 'Korean Eggplant Banchan', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式凉拌茄子');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式紫菜煎饼', 'Korean Seaweed Pancake', 'japanese_korean', 'dinner', 'veggie_dish', 'veg', 'mid', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式紫菜煎饼');

-- ============ northern × seafood（缺口 6 → +10 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '葱烧海参', 'Shandong Braised Sea Cucumber', 'northern', 'dinner', 'main_protein', 'seafood', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '葱烧海参');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '油爆海螺', 'Stir-Fried Sea Snails', 'northern', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '油爆海螺');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韭菜炒虾仁', 'Stir-Fried Shrimp with Chives', 'northern', 'dinner', 'main_protein', 'seafood', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韭菜炒虾仁');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '醋熘黄鱼', 'Sweet-and-Sour Yellow Croaker', 'northern', 'dinner', 'main_protein', 'seafood', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '醋熘黄鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '大葱炒虾仁', 'Scallion Shrimp Stir-Fry', 'northern', 'dinner', 'main_protein', 'seafood', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '大葱炒虾仁');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蛤蜊冬瓜汤', 'Clam and Winter Melon Soup', 'northern', 'dinner', 'soup', 'seafood', 'low', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蛤蜊冬瓜汤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韭黄炒墨鱼', 'Squid with Yellow Chives', 'northern', 'dinner', 'main_protein', 'seafood', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韭黄炒墨鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '焦熘鱼片', 'Crispy Sweet-Sour Fish Slices', 'northern', 'dinner', 'main_protein', 'seafood', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '焦熘鱼片');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '干烧明虾', 'Dry-Braised Prawns', 'northern', 'dinner', 'main_protein', 'seafood', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '干烧明虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '醋椒鱼汤', 'Vinegar-Pepper Fish Soup', 'northern', 'dinner', 'soup', 'seafood', 'low', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '醋椒鱼汤');

-- ============ western × seafood（缺口 7 → +9 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '黄油蒜蓉虾', 'Garlic Butter Shrimp', 'western', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '黄油蒜蓉虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蒜香三文鱼', 'Garlic Salmon', 'western', 'dinner', 'main_protein', 'seafood', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蒜香三文鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '柠檬烤鳕鱼', 'Lemon Baked Cod', 'western', 'dinner', 'main_protein', 'seafood', 'low', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '柠檬烤鳕鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '法式煎鳕鱼', 'Cod Meuniere', 'western', 'dinner', 'main_protein', 'seafood', 'mid', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '法式煎鳕鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '意式青口贝', 'Italian Mussels Marinara', 'western', 'dinner', 'main_protein', 'seafood', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '意式青口贝');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '香煎扇贝', 'Pan-Seared Scallops', 'western', 'dinner', 'main_protein', 'seafood', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '香煎扇贝');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '西班牙蒜虾', 'Gambas al Ajillo', 'western', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '西班牙蒜虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '烤金枪鱼排', 'Grilled Tuna Steak', 'western', 'dinner', 'main_protein', 'seafood', 'low', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '烤金枪鱼排');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '法式海鲜浓汤', 'Bouillabaisse', 'western', 'dinner', 'soup', 'seafood', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '法式海鲜浓汤');

-- ============ sichuan × seafood（缺口 8 → +9 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川式水煮虾', 'Sichuan Water-Boiled Shrimp', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式水煮虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '干烧虾仁', 'Sichuan Dry-Braised Shrimp', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '干烧虾仁');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣花蛤', 'Spicy Clams', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣花蛤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川式烤鱼', 'Sichuan Grilled Fish', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式烤鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '豆瓣鱼', 'Doubanjiang Fish', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '豆瓣鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '干锅虾', 'Dry-Pot Shrimp', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '干锅虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣小龙虾', 'Sichuan Spicy Crayfish', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣小龙虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '香辣蟹', 'Sichuan Spicy Crab', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '香辣蟹');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣鱿鱼', 'Spicy Squid', 'sichuan', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣鱿鱼');

-- ============ jiangnan × white（缺口 8 → +8 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '葱油鸡', 'Scallion Oil Chicken', 'jiangnan', 'dinner', 'main_protein', 'white', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '葱油鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '醉鸡', 'Drunken Chicken', 'jiangnan', 'dinner', 'main_protein', 'white', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '醉鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '南京盐水鸭', 'Nanjing Salted Duck', 'jiangnan', 'dinner', 'main_protein', 'white', 'low', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '南京盐水鸭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '八宝鸭', 'Eight Treasures Stuffed Duck', 'jiangnan', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '八宝鸭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '笋干老鸭煲', 'Bamboo Shoot Duck Stew', 'jiangnan', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '笋干老鸭煲');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '杭州酱鸭', 'Hangzhou Soy Duck', 'jiangnan', 'dinner', 'main_protein', 'white', 'mid', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '杭州酱鸭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '太湖三鸡', 'Taihu Three-Chicken Stew', 'jiangnan', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '太湖三鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '腌笃鲜炖鸡', 'Shanghai Pork-Bamboo-Chicken Stew', 'jiangnan', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '腌笃鲜炖鸡');

-- ============ japanese_korean × white（缺口 10 → +7 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式炸鸡', 'Korean Fried Chicken', 'japanese_korean', 'dinner', 'main_protein', 'white', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式炸鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式照烧鸡', 'Chicken Teriyaki', 'japanese_korean', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式照烧鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式辣炒鸡', 'Dak-galbi Spicy Chicken', 'japanese_korean', 'dinner', 'main_protein', 'white', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式辣炒鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式唐扬鸡块', 'Japanese Karaage', 'japanese_korean', 'dinner', 'main_protein', 'white', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式唐扬鸡块');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式人参鸡汤', 'Samgyetang Ginseng Chicken Soup', 'japanese_korean', 'dinner', 'soup', 'white', 'low', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式人参鸡汤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式鸡肉串烧', 'Chicken Yakitori', 'japanese_korean', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式鸡肉串烧');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式蜂蜜黄油炸鸡', 'Honey Butter Korean Fried Chicken', 'japanese_korean', 'dinner', 'main_protein', 'white', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式蜂蜜黄油炸鸡');

-- ============ jiangnan × red（缺口 10 → +7 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '无锡排骨', 'Wuxi-Style Sweet Ribs', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '无锡排骨');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '苏式酱方', 'Suzhou Soy-Braised Pork Square', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '苏式酱方');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蜜汁火方', 'Honey-Glazed Ham', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蜜汁火方');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '锅烧蹄膀', 'Crispy Pork Knuckle', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '锅烧蹄膀');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '杭式醋焖肉', 'Hangzhou Vinegar Pork', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '杭式醋焖肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '红枣炖排骨', 'Red Date Pork Ribs Stew', 'jiangnan', 'dinner', 'soup', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '红枣炖排骨');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '砂锅猪手', 'Clay Pot Pork Trotters', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '砂锅猪手');

-- ============ southeast_asian × white（缺口 11 → +6 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '椰浆鸡咖喱', 'Coconut Chicken Curry', 'southeast_asian', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '椰浆鸡咖喱');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '沙嗲鸡串', 'Chicken Satay', 'southeast_asian', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '沙嗲鸡串');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '泰式打抛鸡', 'Thai Basil Chicken', 'southeast_asian', 'dinner', 'main_protein', 'white', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '泰式打抛鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '越南柠檬草鸡', 'Vietnamese Lemongrass Chicken', 'southeast_asian', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '越南柠檬草鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '泰式青咖喱鸡', 'Thai Green Curry Chicken', 'southeast_asian', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '泰式青咖喱鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '印尼烤鸡', 'Indonesian Ayam Bakar', 'southeast_asian', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '印尼烤鸡');

-- ============ japanese_korean × red（缺口 11 → +6 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式烤排骨', 'Korean Galbi BBQ Ribs', 'japanese_korean', 'dinner', 'main_protein', 'red', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式烤排骨');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式炖牛肉', 'Japanese Beef Stew', 'japanese_korean', 'dinner', 'main_protein', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式炖牛肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式辣猪肉炒', 'Korean Spicy Pork Bulgogi', 'japanese_korean', 'dinner', 'main_protein', 'red', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式辣猪肉炒');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式照烧猪', 'Japanese Pork Teriyaki', 'japanese_korean', 'dinner', 'main_protein', 'red', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式照烧猪');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式辣牛肉汤', 'Yukgaejang Spicy Beef Soup', 'japanese_korean', 'dinner', 'soup', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式辣牛肉汤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式部队锅', 'Budae Jjigae Army Stew', 'japanese_korean', 'dinner', 'main_protein', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式部队锅');

-- ============ northern × white（缺口 12 → +5 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '葱爆鸡丁', 'Scallion Chicken Stir-Fry', 'northern', 'dinner', 'main_protein', 'white', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '葱爆鸡丁');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '山东扒鸡', 'Shandong Braised Chicken', 'northern', 'dinner', 'main_protein', 'white', 'mid', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '山东扒鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '京葱鸭丝', 'Beijing Onion Duck Strips', 'northern', 'dinner', 'main_protein', 'white', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '京葱鸭丝');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '锅包鸡', 'Northeast Sweet-Sour Crispy Chicken', 'northern', 'dinner', 'main_protein', 'white', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '锅包鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '黄焖鸡', 'Yellow Braised Chicken', 'northern', 'dinner', 'main_protein', 'white', 'mid', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '黄焖鸡');

-- ============ sichuan × red（缺口 13 → +4 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蒜泥白肉', 'Garlic Pork Belly Slices', 'sichuan', 'dinner', 'main_protein', 'red', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蒜泥白肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川式干锅羊肉', 'Sichuan Dry-Pot Lamb', 'sichuan', 'dinner', 'main_protein', 'red', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式干锅羊肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣牛肉干', 'Sichuan Spicy Beef Jerky', 'sichuan', 'dinner', 'main_protein', 'red', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣牛肉干');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川式咸烧白', 'Sichuan Salty Steamed Pork', 'sichuan', 'dinner', 'main_protein', 'red', 'high', 'steam'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式咸烧白');

-- ============ southeast_asian × veg（缺口 14 → +5 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '泰式炒空心菜', 'Pad Pak Boong Stir-Fried Water Spinach', 'southeast_asian', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '泰式炒空心菜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '泰式青木瓜沙拉', 'Som Tam Green Papaya Salad', 'southeast_asian', 'lunch', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '泰式青木瓜沙拉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '印尼酸辣黄瓜', 'Indonesian Acar Pickled Cucumber', 'southeast_asian', 'lunch', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '印尼酸辣黄瓜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '马来椰浆蔬菜咖喱', 'Malaysian Coconut Vegetable Curry', 'southeast_asian', 'dinner', 'veggie_dish', 'veg', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '马来椰浆蔬菜咖喱');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '泰式凉拌豆芽', 'Thai Bean Sprout Salad', 'southeast_asian', 'lunch', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '泰式凉拌豆芽');

-- ============ southeast_asian × staple（缺口 14 → +4 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '马来椰浆饭', 'Malaysian Nasi Lemak', 'southeast_asian', 'lunch', 'staple', 'staple', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '马来椰浆饭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '泰式炒河粉', 'Pad See Ew', 'southeast_asian', 'lunch', 'staple', 'staple', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '泰式炒河粉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '印尼炒饭', 'Indonesian Nasi Goreng', 'southeast_asian', 'lunch', 'staple', 'staple', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '印尼炒饭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '越南鸡肉河粉', 'Vietnamese Chicken Pho', 'southeast_asian', 'lunch', 'staple', 'staple', 'low', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '越南鸡肉河粉');

-- ============ sichuan × white（缺口 14 → +2 候选）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川式怪味鸡', 'Sichuan Strange-Flavor Chicken', 'sichuan', 'dinner', 'main_protein', 'white', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式怪味鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川式椒麻鸡', 'Sichuan Pepper-Numb Chicken', 'sichuan', 'dinner', 'main_protein', 'white', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式椒麻鸡');

COMMIT;
