-- 031_three_festival_dishes.sql
-- Day 5 补 3 节庆零命中菜（端午粽子 / 腊八粥 / 七夕巧果），axis 27 节庆全覆盖
-- 工单：TELEPOT-20260520-028
--
-- 设计原则：
--   1) dish_id 用 gen_random_uuid()（不写死 uuid）
--   2) festival_tags 用 ARRAY['xxx']::text[]
--   3) prep_steps_json embedded i18n 模式：zh 必填真实描述，en 留空字符串（待 Backend 翻译真跑后补）
--   4) cook_steps_json / nutrition_* / cook_method 留 NULL，留给 Step 2-4 后续工单真跑（CEO 工单允许 dry-run）
--   5) source = 'curated_2026_05_20_festival_3' 标识批次，便于后续 --source= 锁定
--   6) 不变量 #1 自检：无 FK→auth.users
--   7) 不变量 #6 自检：dish_id 是 uuid（gen_random_uuid()）不是 text
--
-- 说明：dishes 表实际只有 is_vegan / is_kid_friendly 两个布尔列（CLAUDE.md 描述的 12 个 health-tag
-- 布尔列 P11 立项尚未补齐），"补气 / 暖胃" 等健康语义放进 health_benefit_tags text[]。

BEGIN;

-- §1 嘉兴肉粽（端午 duanwu）
INSERT INTO dishes (
  title_zh, title_en, origin_cuisine, main_ingredient, course_type, meal_type,
  description_zh, description_en,
  flavor_tags, health_benefit_tags, festival_tags,
  is_vegan, source,
  prep_steps_json
) VALUES (
  '嘉兴肉粽', 'Jiaxing Pork Zongzi', 'jiangnan', 'pork', 'staple', 'lunch',
  '江浙端午经典：糯米裹五花肉用粽叶包扎，慢火炖煮 2-3 小时，咸鲜油润，端午节庆代表菜。',
  '',
  ARRAY['咸鲜', '油润']::text[],
  ARRAY['补充能量']::text[],
  ARRAY['duanwu']::text[],
  false,
  'curated_2026_05_20_festival_3',
  '[
    {"step":1,"tray":"A","ingredient_zh":"糯米","ingredient_en":"","amount_g":500,"action_zh":"糯米提前浸泡 4 小时，沥干水分","action_en":""},
    {"step":2,"tray":"A","ingredient_zh":"五花肉","ingredient_en":"","amount_g":400,"action_zh":"五花肉切大块，加酱油 / 黄酒 / 糖腌制 30 分钟","action_en":""},
    {"step":3,"tray":"A","ingredient_zh":"粽叶","ingredient_en":"","amount_g":50,"action_zh":"粽叶洗净，沸水烫软备用","action_en":""},
    {"step":4,"tray":"D","ingredient_zh":"棉绳","ingredient_en":"","amount_g":10,"action_zh":"棉绳剪段，备包扎用","action_en":""}
  ]'::jsonb
);

-- §2 腊八粥（腊八 laba）
INSERT INTO dishes (
  title_zh, title_en, origin_cuisine, main_ingredient, course_type, meal_type,
  description_zh, description_en,
  flavor_tags, health_benefit_tags, festival_tags,
  is_vegan, source,
  prep_steps_json
) VALUES (
  '腊八粥', 'Laba Porridge', 'all-season/balanced', 'rice', 'soup', 'breakfast',
  '腊月初八节令粥，八宝食材慢炖出粘稠米汤，清甜滋补，民间传统补气暖胃。',
  '',
  ARRAY['清甜', '滋补']::text[],
  ARRAY['补气', '暖胃']::text[],
  ARRAY['laba']::text[],
  true,
  'curated_2026_05_20_festival_3',
  '[
    {"step":1,"tray":"A","ingredient_zh":"大米","ingredient_en":"","amount_g":100,"action_zh":"大米淘洗干净","action_en":""},
    {"step":2,"tray":"A","ingredient_zh":"红豆","ingredient_en":"","amount_g":50,"action_zh":"红豆 / 莲子提前浸泡 2 小时","action_en":""},
    {"step":3,"tray":"A","ingredient_zh":"莲子","ingredient_en":"","amount_g":30,"action_zh":"莲子去芯（保留可减苦味）","action_en":""},
    {"step":4,"tray":"A","ingredient_zh":"桂圆 / 红枣 / 花生 / 核桃 / 葡萄干","ingredient_en":"","amount_g":120,"action_zh":"干果备齐：桂圆肉 + 红枣去核 + 花生 + 核桃 + 葡萄干","action_en":""},
    {"step":5,"tray":"D","ingredient_zh":"冰糖","ingredient_en":"","amount_g":40,"action_zh":"冰糖备用，出锅前 10 分钟下","action_en":""}
  ]'::jsonb
);

-- §3 五子巧果（七夕 qixi）
INSERT INTO dishes (
  title_zh, title_en, origin_cuisine, main_ingredient, course_type, meal_type,
  description_zh, description_en,
  flavor_tags, health_benefit_tags, festival_tags,
  is_vegan, source,
  prep_steps_json
) VALUES (
  '五子巧果', 'Wuzi Qiaoguo (Seven Stars Pastry)', 'jiangnan', 'other', 'dessert', 'all',
  '江浙七夕民俗酥点：面粉揉团裹五子（红枣 / 桂圆 / 榛子 / 花生 / 瓜子），微甜酥脆，乞巧节传统供品。',
  '',
  ARRAY['微甜', '酥脆']::text[],
  ARRAY['节庆点心']::text[],
  ARRAY['qixi']::text[],
  true,
  'curated_2026_05_20_festival_3',
  '[
    {"step":1,"tray":"A","ingredient_zh":"面粉","ingredient_en":"","amount_g":300,"action_zh":"中筋面粉过筛备用","action_en":""},
    {"step":2,"tray":"A","ingredient_zh":"五子（红枣 / 桂圆 / 榛子 / 花生 / 瓜子）","ingredient_en":"","amount_g":150,"action_zh":"红枣去核切碎、桂圆肉切丁、榛子 / 花生去壳、瓜子仁备齐","action_en":""},
    {"step":3,"tray":"C","ingredient_zh":"白糖","ingredient_en":"","amount_g":50,"action_zh":"白糖与面粉初步拌合","action_en":""},
    {"step":4,"tray":"C","ingredient_zh":"植物油","ingredient_en":"","amount_g":80,"action_zh":"植物油备用于和面","action_en":""},
    {"step":5,"tray":"D","ingredient_zh":"鸡蛋","ingredient_en":"","amount_g":50,"action_zh":"鸡蛋打散备和面","action_en":""}
  ]'::jsonb
);

COMMIT;
