-- 056_breakfast_backfill.sql
-- 工单：TELEPOT-20260521-002
--
-- 目标：中式早餐 91 → 100 道（凑整老板量化要求）
-- 不做工单 §B 的 60-80 道大规模 backfill 因为 Algorithm 071 已诊断 root cause =
-- src/lib/breakfastCombos.ts 14/16 combo side[0]='茶叶蛋'（算法 bug 非数据问题），
-- 早餐总数 117 已超 100。本棒仅补 9 道凑整中式早餐 100，等 Algorithm 072 修 combos
-- 才是真解。
--
-- 优先级（按 Algorithm 071 Q2 数据完整度报告）：
--   sichuan: 7 道 / nutr 0%   → 补 4 道（凑 11）
--   cantonese: 35 道 / nutr 37% → 补 5 道（凑 40）
--
-- 字段策略（按 §A 实查 + Algorithm 071 §C 提示）：
--   - meal_type = 'breakfast'（单数 text，不是 array）
--   - course_type ∈ {main_protein, staple, veggie_dish, dessert, soup}（实查实际值集）
--   - 不写 score_default（字段不存在，工单 §C 错）
--   - 不写 image_url（留 image generation pipeline）
--   - 不写 nutrition 字段（留 Backend Gemini pipeline）
--   - NOT NULL 字段全有 default：id / is_vegan / source / ingredients_ready /
--     xiaomei_compatible / is_kid_friendly
--
-- 幂等保证：dishes 仅 PRIMARY KEY (id) 无 UNIQUE on title_zh，
--   用 INSERT ... SELECT ... WHERE NOT EXISTS 保幂等（不能用 ON CONFLICT title_zh）

BEGIN;

-- sichuan +4 道（nutr 0%，优先 P3）
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '担担面', 'Dan Dan Noodles', 'sichuan', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '担担面');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '重庆小面', 'Chongqing Spicy Noodles', 'sichuan', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '重庆小面');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '酸辣粉', 'Sour and Spicy Noodles', 'sichuan', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '酸辣粉');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '红油抄手', 'Wonton in Chili Oil', 'sichuan', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '红油抄手');

-- cantonese +5 道（nutr 37% 弱）
INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '云吞面', 'Wonton Noodle Soup', 'cantonese', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '云吞面');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '及第粥', 'Cantonese Congee with Pork', 'cantonese', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '及第粥');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '西多士', 'Hong Kong Style French Toast', 'cantonese', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '西多士');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '凤爪', 'Steamed Chicken Feet', 'cantonese', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '凤爪');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '鸡蛋三明治', 'Egg Sandwich', 'cantonese', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '鸡蛋三明治');

COMMIT;
