-- 062_dishes_phase2_expansion.sql
-- 工单：TELEPOT-20260521-004（Phase 2 dish 扩容 250 道主体）
--
-- 061 pilot 实证：经典菜重名率约 50%，盲目 INSERT 250 道实际生效 ~125 道。
-- 本棒策略：精选 80 道，避开易重名经典菜（如 麻婆豆腐 / 红烧肉 / 鱼香肉丝 /
-- 宫保鸡丁 等），优先填弱菜系（sichuan 56 / jiangnan 84 / southeast_asian 73 /
-- japanese_korean 55）。
--
-- 字段规范（按 002/003/061 实查）：
--   - meal_type 单值 {breakfast/lunch/dinner/all}，多用 'dinner' 因夜餐 / 'all' 通用
--   - oil_level DB enum {low/mid/high}
--   - protein_main_class {red/white/seafood/veg/staple}
--   - cooking_method {stirfry/steam/stew/cold/braised/grill/fry/other}
--   - course_type {main_protein/staple/veggie_dish/dessert/soup}
--   - WHERE NOT EXISTS 保幂等
--   - 不写 image_url / nutrition / score_default（字段不存在）
--
-- 不变量自检：#1 #2 #4 #6 全 PASS（INSERT 行不动 FK / ALGO_VERSION / id type）

BEGIN;

-- ============ sichuan +25 道（避开 麻婆豆腐 / 水煮鱼 / 宫保 / 鱼香 / 回锅 / 担担 已存）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '毛血旺', 'Mao Xue Wang (Spicy Blood Curd Stew)', 'sichuan', 'dinner', 'main_protein', 'red', 'high', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '毛血旺');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '夫妻肺片', 'Sliced Beef in Chili Oil', 'sichuan', 'dinner', 'veggie_dish', 'red', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '夫妻肺片');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '口水鸡', 'Mouth-Watering Chicken', 'sichuan', 'dinner', 'main_protein', 'white', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '口水鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '椒麻鸡', 'Sichuan Pepper Chicken', 'sichuan', 'dinner', 'main_protein', 'white', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '椒麻鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '辣子鸡丁', 'Diced Chicken with Dried Chili', 'sichuan', 'dinner', 'main_protein', 'white', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '辣子鸡丁');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣兔丁', 'Spicy Diced Rabbit', 'sichuan', 'dinner', 'main_protein', 'white', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣兔丁');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '酸菜鱼', 'Pickled Cabbage Fish Stew', 'sichuan', 'dinner', 'main_protein', 'seafood', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '酸菜鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '藤椒鱼', 'Green Peppercorn Fish', 'sichuan', 'dinner', 'main_protein', 'seafood', 'mid', 'steam'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '藤椒鱼');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻婆茄子', 'Mapo Eggplant', 'sichuan', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻婆茄子');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '家常豆腐', 'Home-Style Tofu', 'sichuan', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '家常豆腐');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '四川泡菜', 'Sichuan Pickled Vegetables', 'sichuan', 'all', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '四川泡菜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川北凉粉', 'Sichuan Cold Mung Bean Jelly', 'sichuan', 'lunch', 'staple', 'staple', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川北凉粉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '川式凉糕', 'Sichuan Cold Rice Cake', 'sichuan', 'all', 'dessert', 'staple', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式凉糕');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣藕片', 'Spicy Lotus Root Slices', 'sichuan', 'dinner', 'veggie_dish', 'veg', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣藕片');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣鸭脖', 'Spicy Duck Neck', 'sichuan', 'all', 'main_protein', 'white', 'mid', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣鸭脖');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣鸡爪', 'Spicy Chicken Feet', 'sichuan', 'all', 'main_protein', 'white', 'mid', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣鸡爪');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '麻辣鸡翅', 'Spicy Chicken Wings', 'sichuan', 'dinner', 'main_protein', 'white', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '麻辣鸡翅');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '火爆腰花', 'Stir-Fried Kidney Slices', 'sichuan', 'dinner', 'main_protein', 'red', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '火爆腰花');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '火爆肥肠', 'Stir-Fried Pork Intestines', 'sichuan', 'dinner', 'main_protein', 'red', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '火爆肥肠');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蒜泥白肉', 'Sliced Pork in Garlic Sauce', 'sichuan', 'dinner', 'main_protein', 'red', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蒜泥白肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '咸烧白', 'Steamed Pork with Preserved Vegetable', 'sichuan', 'dinner', 'main_protein', 'red', 'mid', 'steam'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '咸烧白');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '甜烧白', 'Sweet Steamed Pork with Glutinous Rice', 'sichuan', 'dinner', 'main_protein', 'red', 'mid', 'steam'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '甜烧白');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '夹沙肉', 'Stuffed Pork with Red Bean Paste', 'sichuan', 'dinner', 'main_protein', 'red', 'mid', 'steam'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '夹沙肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '青椒土豆丝', 'Shredded Potato with Green Pepper', 'sichuan', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '青椒土豆丝');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '钵钵鸡', 'Bo Bo Ji (Cold Chicken in Chili Oil)', 'sichuan', 'all', 'main_protein', 'white', 'mid', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '钵钵鸡');

-- ============ jiangnan +15 道 ============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '腌笃鲜', 'Yandu Xian (Bamboo Pork Soup)', 'jiangnan', 'dinner', 'soup', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '腌笃鲜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蟹粉狮子头', 'Crab Roe Lion Head Meatballs', 'jiangnan', 'dinner', 'main_protein', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蟹粉狮子头');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '清炒虾仁', 'Stir-Fried Shrimp', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'low', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '清炒虾仁');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '醉虾', 'Drunken Shrimp', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '醉虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '醉蟹', 'Drunken Crab', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '醉蟹');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '清蒸大闸蟹', 'Steamed Hairy Crab', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'low', 'steam'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '清蒸大闸蟹');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '盐水鸭', 'Nanjing Salted Duck', 'jiangnan', 'dinner', 'main_protein', 'white', 'low', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '盐水鸭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '南京板鸭', 'Nanjing Pressed Duck', 'jiangnan', 'dinner', 'main_protein', 'white', 'low', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '南京板鸭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '糖醋小排', 'Sweet and Sour Pork Ribs', 'jiangnan', 'dinner', 'main_protein', 'red', 'high', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '糖醋小排');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '响油鳝糊', 'Sizzling Eel in Oil', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '响油鳝糊');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '雪菜毛豆', 'Pickled Greens with Edamame', 'jiangnan', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '雪菜毛豆');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '油爆河虾', 'Oil-Splashed River Shrimp', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '油爆河虾');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蜜汁火方', 'Honey-Glazed Ham', 'jiangnan', 'dinner', 'main_protein', 'red', 'mid', 'braised'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蜜汁火方');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '八宝辣酱', 'Eight Treasures Spicy Sauce', 'jiangnan', 'dinner', 'main_protein', 'red', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '八宝辣酱');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '清炒河虾', 'Plain Stir-Fried River Shrimp', 'jiangnan', 'dinner', 'main_protein', 'seafood', 'low', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '清炒河虾');

-- ============ northern +15 道 ============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '京酱肉丝', 'Beijing Shredded Pork in Hoisin Sauce', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '京酱肉丝');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '葱爆羊肉', 'Stir-Fried Lamb with Scallions', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '葱爆羊肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '手抓羊肉', 'Hand-Pulled Mutton', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '手抓羊肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '烤羊腿', 'Roasted Lamb Leg', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '烤羊腿');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '烤羊排', 'Roasted Lamb Chops', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '烤羊排');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '锅包肉', 'Sweet and Sour Pork (Northeast Style)', 'northern', 'dinner', 'main_protein', 'red', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '锅包肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '地三鲜', 'Three Earth Treasures', 'northern', 'dinner', 'veggie_dish', 'veg', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '地三鲜');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '猪肉炖粉条', 'Pork Stewed with Cellophane Noodles', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '猪肉炖粉条');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '小鸡炖蘑菇', 'Chicken Stew with Mushrooms', 'northern', 'dinner', 'main_protein', 'white', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '小鸡炖蘑菇');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '尖椒肥肠', 'Pork Intestines with Chili Peppers', 'northern', 'dinner', 'main_protein', 'red', 'high', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '尖椒肥肠');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '溜肝尖', 'Stir-Fried Pork Liver', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '溜肝尖');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '京葱羊肉', 'Beijing Scallion Lamb', 'northern', 'dinner', 'main_protein', 'red', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '京葱羊肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '糖醋里脊', 'Sweet and Sour Pork Tenderloin', 'northern', 'dinner', 'main_protein', 'red', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '糖醋里脊');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '老醋花生', 'Aged Vinegar Peanuts', 'northern', 'lunch', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '老醋花生');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '醋溜土豆丝', 'Vinegar Stir-Fried Shredded Potato', 'northern', 'dinner', 'veggie_dish', 'veg', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '醋溜土豆丝');

-- ============ western +15 道 ============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '西冷牛排', 'Sirloin Steak', 'western', 'dinner', 'main_protein', 'red', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '西冷牛排');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT 'T骨牛排', 'T-Bone Steak', 'western', 'dinner', 'main_protein', 'red', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = 'T骨牛排');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '战斧牛排', 'Tomahawk Steak', 'western', 'dinner', 'main_protein', 'red', 'high', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '战斧牛排');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '番茄肉酱意面', 'Spaghetti Bolognese', 'western', 'dinner', 'staple', 'staple', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '番茄肉酱意面');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '奶油培根意面', 'Spaghetti Carbonara', 'western', 'dinner', 'staple', 'staple', 'high', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '奶油培根意面');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '香蒜辣椒意面', 'Aglio e Olio Spaghetti', 'western', 'dinner', 'staple', 'staple', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '香蒜辣椒意面');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '蘑菇奶油浓汤', 'Cream of Mushroom Soup', 'western', 'lunch', 'soup', 'veg', 'high', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '蘑菇奶油浓汤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '罗宋汤', 'Borscht', 'western', 'lunch', 'soup', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '罗宋汤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '南瓜浓汤', 'Pumpkin Soup', 'western', 'lunch', 'soup', 'veg', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '南瓜浓汤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '海鲜烩饭', 'Seafood Paella', 'western', 'dinner', 'staple', 'seafood', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '海鲜烩饭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '玛格丽特披萨', 'Margherita Pizza', 'western', 'dinner', 'staple', 'veg', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '玛格丽特披萨');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '夏威夷披萨', 'Hawaiian Pizza', 'western', 'dinner', 'staple', 'red', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '夏威夷披萨');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '海鲜披萨', 'Seafood Pizza', 'western', 'dinner', 'staple', 'seafood', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '海鲜披萨');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '希腊沙拉', 'Greek Salad', 'western', 'lunch', 'veggie_dish', 'veg', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '希腊沙拉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '尼斯沙拉', 'Salade Niçoise', 'western', 'lunch', 'veggie_dish', 'seafood', 'low', 'cold'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '尼斯沙拉');

-- ============ southeast_asian +5 道（已 73 偏少）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '冬阴功汤', 'Tom Yum Goong Soup', 'southeast_asian', 'dinner', 'soup', 'seafood', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '冬阴功汤');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '泰式咖喱牛肉', 'Thai Beef Curry', 'southeast_asian', 'dinner', 'main_protein', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '泰式咖喱牛肉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '越南河粉', 'Vietnamese Pho', 'southeast_asian', 'lunch', 'staple', 'staple', 'low', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '越南河粉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '海南鸡饭', 'Hainanese Chicken Rice', 'southeast_asian', 'lunch', 'staple', 'staple', 'low', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '海南鸡饭');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '马来沙爹', 'Malaysian Satay', 'southeast_asian', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '马来沙爹');

-- ============ japanese_korean +5 道（已 55 偏少）============

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式部队锅', 'Korean Army Stew', 'japanese_korean', 'dinner', 'main_protein', 'red', 'mid', 'stew'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式部队锅');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '韩式炒年糕', 'Korean Tteokbokki', 'japanese_korean', 'lunch', 'staple', 'staple', 'mid', 'stirfry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '韩式炒年糕');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式照烧鸡', 'Japanese Teriyaki Chicken', 'japanese_korean', 'dinner', 'main_protein', 'white', 'mid', 'grill'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式照烧鸡');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式炸猪排', 'Japanese Tonkatsu', 'japanese_korean', 'dinner', 'main_protein', 'red', 'high', 'fry'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式炸猪排');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type, protein_main_class, oil_level, cooking_method)
SELECT '日式咖喱饭', 'Japanese Curry Rice', 'japanese_korean', 'lunch', 'staple', 'staple', 'mid', 'other'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '日式咖喱饭');

COMMIT;
