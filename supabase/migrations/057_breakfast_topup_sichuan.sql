-- 057_breakfast_topup_sichuan.sql
-- 工单：TELEPOT-20260521-002（056 数据缺口补丁）
--
-- 背景：056 计划补 9 道（4 sichuan + 5 cantonese）凑整中式早餐 100。
-- 实际 cantonese 5/5 成功 ✓，sichuan 4/4 因 WHERE NOT EXISTS title 已存在
-- 但 meal_type 是 'all' / 'lunch' 被过严过滤（担担面/酸辣粉/红油抄手 = 'all'，
-- 重庆小面 = 'lunch'）。
--
-- 不修既有数据 meal_type（破坏 lunch/dinner 语义），改为**补 4 个 sichuan 独有
-- 早餐 title** 凑齐 100 中式早餐。选 sichuan 经典早点不与既有重复的：
--   - 赖汤圆（Lai Tangyuan）— sichuan 早点经典甜品
--   - 龙抄手（Long Wontons）— sichuan 早点 staple（与"红油抄手 all"不同）
--   - 三大炮（San Da Pao）— sichuan 早点甜品
--   - 川式肥肠粉（Sichuan Pig Intestine Noodles）— sichuan 早点 staple
--
-- 字段 + 幂等策略同 056。

BEGIN;

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '赖汤圆', 'Lai Tangyuan (Glutinous Rice Balls)', 'sichuan', 'breakfast', 'dessert'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '赖汤圆');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '龙抄手', 'Long Wonton Soup', 'sichuan', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '龙抄手');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '三大炮', 'San Da Pao (Glutinous Rice Cakes)', 'sichuan', 'breakfast', 'dessert'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '三大炮');

INSERT INTO dishes (title_zh, title_en, origin_cuisine, meal_type, course_type)
SELECT '川式肥肠粉', 'Sichuan Pig Intestine Noodles', 'sichuan', 'breakfast', 'staple'
WHERE NOT EXISTS (SELECT 1 FROM dishes WHERE title_zh = '川式肥肠粉');

COMMIT;
