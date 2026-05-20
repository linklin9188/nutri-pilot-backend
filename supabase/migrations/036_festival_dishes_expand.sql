-- 036_festival_dishes_expand.sql
-- Day 10 §B：7 节庆每个扩展到 ≥3 道菜，共 19 道 INSERT + 1 道 UPDATE（已存在加 tag）+ 1 道 skip（已 tagged）
-- 工单：TELEPOT-20260520-045 §B
--
-- 现状（030+031 后）：
--   chunjie=61 / yuanxiao=2 / duanwu=1 / zhongqiu=6 / chongyang=1 / laba=1 / qixi=1
-- 目标：每节庆 ≥ 3
--
-- 21 道 CEO 清单 vs DB 实际：
--   - 19 道新 INSERT（pure new）
--   - 1 道 UPDATE festival_tags 加 'laba'：杂粮粥（已存在，main_ingredient=grain）
--   - 1 道 skip：鱼香肉丝（已存在且已含 chunjie 来自 030 宽匹配）
--
-- 字段：title_zh / origin_cuisine / main_ingredient / course_type / meal_type / festival_tags / is_vegan / source
-- cook_steps_json / nutrition / prep_steps / image 等留 NULL（后续 dish seed pipeline Step 2-4 真跑补）
-- source = 'curated_2026_05_20_festival_expand' 统一标识本批
--
-- 不变量 #1 自检：无 FK→auth.users
-- 不变量 #6 自检：dish_id 用 gen_random_uuid() 自动生成 uuid

BEGIN;

-- §1 春节 chunjie +3（鱼香肉丝已 chunjie skip）
INSERT INTO dishes (title_zh, origin_cuisine, main_ingredient, course_type, meal_type, festival_tags, is_vegan, source) VALUES
  ('年糕汤',  'jiangnan', 'rice',  'soup',         'lunch',  ARRAY['chunjie']::text[], true,  'curated_2026_05_20_festival_expand'),
  ('八宝饭',  'jiangnan', 'rice',  'staple',       'all',    ARRAY['chunjie']::text[], true,  'curated_2026_05_20_festival_expand');

-- §2 元宵 yuanxiao +3
INSERT INTO dishes (title_zh, origin_cuisine, main_ingredient, course_type, meal_type, festival_tags, is_vegan, source) VALUES
  ('黑芝麻汤圆',       'jiangnan', 'other', 'dessert', 'breakfast', ARRAY['yuanxiao']::text[], true,  'curated_2026_05_20_festival_expand'),
  ('鲜肉汤圆',         'jiangnan', 'pork',  'dessert', 'breakfast', ARRAY['yuanxiao']::text[], false, 'curated_2026_05_20_festival_expand'),
  ('桂花酒酿圆子',     'jiangnan', 'other', 'dessert', 'breakfast', ARRAY['yuanxiao']::text[], true,  'curated_2026_05_20_festival_expand');

-- §3 端午 duanwu +3
INSERT INTO dishes (title_zh, origin_cuisine, main_ingredient, course_type, meal_type, festival_tags, is_vegan, source) VALUES
  ('碱水粽',  'jiangnan', 'rice', 'staple',       'lunch',  ARRAY['duanwu']::text[], true,  'curated_2026_05_20_festival_expand'),
  ('蜜枣粽',  'jiangnan', 'rice', 'staple',       'lunch',  ARRAY['duanwu']::text[], true,  'curated_2026_05_20_festival_expand'),
  ('黄鳝煲',  'cantonese', 'fish', 'main_protein', 'dinner', ARRAY['duanwu']::text[], false, 'curated_2026_05_20_festival_expand');

-- §4 中秋 zhongqiu +3
INSERT INTO dishes (title_zh, origin_cuisine, main_ingredient, course_type, meal_type, festival_tags, is_vegan, source) VALUES
  ('莲蓉月饼',  'cantonese', 'other',   'dessert',      'all',    ARRAY['zhongqiu']::text[], true,  'curated_2026_05_20_festival_expand'),
  ('五仁月饼',  'cantonese', 'other',   'dessert',      'all',    ARRAY['zhongqiu']::text[], true,  'curated_2026_05_20_festival_expand'),
  ('葱油蟹',    'jiangnan',  'seafood', 'main_protein', 'dinner', ARRAY['zhongqiu']::text[], false, 'curated_2026_05_20_festival_expand');

-- §5 重阳 chongyang +3
INSERT INTO dishes (title_zh, origin_cuisine, main_ingredient, course_type, meal_type, festival_tags, is_vegan, source) VALUES
  ('重阳糕',  'jiangnan',            'other', 'dessert', 'all', ARRAY['chongyang']::text[], true, 'curated_2026_05_20_festival_expand'),
  ('菊花茶',  'all-season/balanced', 'other', 'dessert', 'all', ARRAY['chongyang']::text[], true, 'curated_2026_05_20_festival_expand'),
  ('菊花酥',  'cantonese',           'other', 'dessert', 'all', ARRAY['chongyang']::text[], true, 'curated_2026_05_20_festival_expand');

-- §6 腊八 laba +3（杂粮粥已存在，下方 UPDATE 加 tag）
INSERT INTO dishes (title_zh, origin_cuisine, main_ingredient, course_type, meal_type, festival_tags, is_vegan, source) VALUES
  ('腊八蒜', 'northern', 'other', 'veggie_dish', 'all',       ARRAY['laba']::text[], true, 'curated_2026_05_20_festival_expand'),
  ('腊八面', 'northern', 'other', 'staple',      'lunch',     ARRAY['laba']::text[], true, 'curated_2026_05_20_festival_expand');

-- §7 七夕 qixi +3
INSERT INTO dishes (title_zh, origin_cuisine, main_ingredient, course_type, meal_type, festival_tags, is_vegan, source) VALUES
  ('玫瑰糖糕',         'jiangnan', 'other', 'dessert', 'all', ARRAY['qixi']::text[], true, 'curated_2026_05_20_festival_expand'),
  ('红枣莲子甜汤',     'jiangnan', 'other', 'soup',    'all', ARRAY['qixi']::text[], true, 'curated_2026_05_20_festival_expand'),
  ('桂花蜜豆甜品',     'jiangnan', 'other', 'dessert', 'all', ARRAY['qixi']::text[], true, 'curated_2026_05_20_festival_expand');

-- §8 杂粮粥（已存在，festival_tags=[]）→ 追加 'laba'
UPDATE dishes SET festival_tags = array_append(festival_tags, 'laba')
WHERE title_zh = '杂粮粥' AND 'laba' != ALL(COALESCE(festival_tags, '{}'));

-- 鱼香肉丝（已存在且已含 'chunjie' 来自 030 宽匹配）→ skip，无 UPDATE 必要

COMMIT;
