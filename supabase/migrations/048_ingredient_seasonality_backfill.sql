-- 048_ingredient_seasonality_backfill.sql
-- backfill 63 食材 —— 反向映射自 src/hooks/useWeeklyMenu.ts:135 INGREDIENT_SEASONALITY (v43)
-- 工单：TELEPOT-20260520-065 §B
--
-- 反向规则：原 map 是 {节气: [食材...]}，本 backfill 转 {食材: [节气...]}。
-- ON CONFLICT (ingredient_name) DO NOTHING 保证幂等 —— 重跑不会覆盖人工调过的行。
-- category 按工单 §B 指引归类：fruit / vegetable / meat / seafood / staple / other。
--
-- 不变量自检：
--   #1 无 FK→auth.users
--   #4 不动 ALGO_VERSION
--   幂等 ON CONFLICT DO NOTHING
--   单 BEGIN/COMMIT 包裹，失败整体回滚

BEGIN;

INSERT INTO ingredient_seasonality (ingredient_name, category, solar_terms) VALUES
  -- 春季 (立春→谷雨)
  ('韭菜',       'vegetable', ARRAY['立春','雨水']),
  ('春笋',       'vegetable', ARRAY['立春','雨水','惊蛰']),
  ('香椿',       'vegetable', ARRAY['立春','清明','谷雨']),
  ('荠菜',       'vegetable', ARRAY['立春','雨水','春分','清明']),
  ('豌豆苗',     'vegetable', ARRAY['立春']),
  ('蒲公英',     'vegetable', ARRAY['雨水','谷雨']),
  ('菠菜',       'vegetable', ARRAY['雨水']),
  ('油菜',       'vegetable', ARRAY['雨水']),
  ('苋菜',       'vegetable', ARRAY['雨水']),
  ('枇杷',       'fruit',     ARRAY['惊蛰','春分','立夏','小满']),
  ('樱桃',       'fruit',     ARRAY['惊蛰','春分','立夏']),
  ('草莓',       'fruit',     ARRAY['惊蛰','春分']),
  ('莴笋',       'vegetable', ARRAY['惊蛰']),
  ('樱桃萝卜',   'vegetable', ARRAY['惊蛰']),
  ('芦笋',       'vegetable', ARRAY['春分','谷雨']),
  ('蕨菜',       'vegetable', ARRAY['春分']),
  ('青团',       'staple',    ARRAY['清明']),
  ('马兰头',     'vegetable', ARRAY['清明']),
  ('螺蛳',       'seafood',   ARRAY['清明']),
  ('蚕豆',       'vegetable', ARRAY['谷雨','立夏','小满']),
  ('春茶',       'other',     ARRAY['谷雨']),
  -- 夏季 (立夏→大暑)
  ('黄瓜',       'vegetable', ARRAY['立夏','小满']),
  ('番茄',       'vegetable', ARRAY['立夏']),
  ('苦瓜',       'vegetable', ARRAY['小满','芒种','夏至']),
  ('杨梅',       'fruit',     ARRAY['芒种']),
  ('桃',         'fruit',     ARRAY['芒种','夏至']),
  ('丝瓜',       'vegetable', ARRAY['芒种','小暑','大暑']),
  ('桑葚',       'fruit',     ARRAY['芒种']),
  ('西瓜',       'fruit',     ARRAY['夏至','小暑','大暑']),
  ('冬瓜',       'vegetable', ARRAY['夏至','小暑','大暑']),
  ('荔枝',       'fruit',     ARRAY['夏至']),
  ('莲藕',       'vegetable', ARRAY['小暑','大暑','寒露','霜降']),
  ('蜜桃',       'fruit',     ARRAY['小暑']),
  ('绿豆',       'other',     ARRAY['大暑']),
  -- 秋季 (立秋→霜降)
  ('葡萄',       'fruit',     ARRAY['立秋','处暑']),
  ('莲子',       'other',     ARRAY['立秋','处暑','白露','小雪']),
  ('板栗',       'other',     ARRAY['立秋','处暑']),
  ('南瓜',       'vegetable', ARRAY['立秋']),
  ('龙眼',       'fruit',     ARRAY['立秋']),
  ('梨',         'fruit',     ARRAY['处暑','秋分','寒露']),
  ('石榴',       'fruit',     ARRAY['处暑','白露','秋分']),
  ('茄子',       'vegetable', ARRAY['处暑']),
  ('柿子',       'fruit',     ARRAY['白露','秋分','寒露','霜降']),
  ('大闸蟹',     'seafood',   ARRAY['白露','秋分']),
  ('山药',       'vegetable', ARRAY['白露','秋分','立冬']),
  ('桂圆',       'fruit',     ARRAY['白露','冬至','小寒','大寒']),
  ('螃蟹',       'seafood',   ARRAY['秋分','寒露','霜降']),
  ('萝卜',       'vegetable', ARRAY['寒露','霜降','立冬']),
  ('白菜',       'vegetable', ARRAY['霜降','立冬','小雪','大雪','冬至']),
  ('栗子',       'other',     ARRAY['霜降']),
  -- 冬季 (立冬→大寒)
  ('羊肉',       'meat',      ARRAY['立冬','小雪','大雪','冬至','小寒','大寒']),
  ('鸭肉',       'meat',      ARRAY['立冬']),
  ('银耳',       'other',     ARRAY['小雪','大雪','冬至']),
  ('大葱',       'vegetable', ARRAY['小雪']),
  ('红枣',       'other',     ARRAY['大雪','小寒','大寒']),
  ('火锅',       'other',     ARRAY['大雪']),
  ('糯米',       'staple',    ARRAY['冬至','小寒']),
  ('饺子',       'staple',    ARRAY['冬至']),
  ('汤圆',       'staple',    ARRAY['冬至']),
  ('腊肉',       'meat',      ARRAY['小寒']),
  ('砂锅',       'other',     ARRAY['小寒']),
  ('生姜',       'other',     ARRAY['大寒']),
  ('糖瓜',       'staple',    ARRAY['大寒'])
ON CONFLICT (ingredient_name) DO NOTHING;

COMMIT;
