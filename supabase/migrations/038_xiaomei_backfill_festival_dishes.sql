-- 038_xiaomei_backfill_festival_dishes.sql
-- P13.1 — Day 10 §C：3 节庆菜（嘉兴肉粽/腊八粥/五子巧果）+ 19 道新节庆扩展菜 xiaomei_compatible 对齐
-- 工单：TELEPOT-20260520-045 §C
--
-- 背景：
--   - 028 + 036 INSERT 的节庆菜 cook_steps_json 留 NULL（Step 2-4 后续工单真跑），
--     backfill-xiaomei-compat.ts 脚本过滤 cook_steps_json IS NOT NULL → 跳过这 22 道菜
--   - CEO 工单 §C 允许直接 SQL UPDATE（替代脚本）
--
-- 判断依据（基于 prep_steps + dish title 语义，不依赖 cook_steps）：
--   - 慢炖/蒸/煮粥/泡蒜 类 → small cooker 兼容 → true
--   - 烤箱酥/油炸/明火/手工捏成的（粽叶包扎部分 OK 因为只用慢炖，但月饼/酥饼烤箱 → false）
--
-- 安全性：
--   - 备份表 _archive_xiaomei_backfill_pre_p13_1（仅相关行）
--   - 仅 UPDATE 22 行（不动其他 730 道菜）
--   - 不变量 #1 自检：无新 FK / 不变量 #4 ALGO_VERSION 未触
--   - 事务包裹，失败回滚干净

BEGIN;

-- §1 备份（仅相关 22 行）
CREATE TABLE IF NOT EXISTS _archive_xiaomei_backfill_pre_p13_1 AS
  SELECT id, title_zh, xiaomei_compatible, xiaomei_incompat_reason
  FROM dishes
  WHERE source IN ('curated_2026_05_19_chinese5', 'curated_2026_05_20_festival_3', 'curated_2026_05_20_festival_expand');

-- §2 3 道 Day 5 节庆菜（嘉兴肉粽/腊八粥 → true；五子巧果 → false 保留 + 注 reason）
UPDATE dishes SET xiaomei_compatible = true, xiaomei_incompat_reason = NULL
WHERE title_zh IN ('嘉兴肉粽', '腊八粥')
  AND source = 'curated_2026_05_20_festival_3';

UPDATE dishes SET xiaomei_compatible = false, xiaomei_incompat_reason = '需要烤箱'
WHERE title_zh = '五子巧果'
  AND source = 'curated_2026_05_20_festival_3';

-- §3 19 道 Day 10 节庆扩展菜分组判定

-- 3a) 兼容（慢炖/蒸/煮/泡 类）→ true
UPDATE dishes SET xiaomei_compatible = true, xiaomei_incompat_reason = NULL
WHERE source = 'curated_2026_05_20_festival_expand'
  AND title_zh IN (
    '年糕汤', '八宝饭',
    '黑芝麻汤圆', '鲜肉汤圆', '桂花酒酿圆子',
    '碱水粽', '蜜枣粽', '黄鳝煲',
    '葱油蟹',
    '重阳糕', '菊花茶',
    '腊八蒜', '腊八面',
    '玫瑰糖糕', '红枣莲子甜汤', '桂花蜜豆甜品'
  );

-- 3b) 不兼容（烤箱酥/月饼类）→ false + reason
UPDATE dishes SET xiaomei_compatible = false, xiaomei_incompat_reason = '需要烤箱'
WHERE source = 'curated_2026_05_20_festival_expand'
  AND title_zh IN ('莲蓉月饼', '五仁月饼', '菊花酥');

COMMIT;
