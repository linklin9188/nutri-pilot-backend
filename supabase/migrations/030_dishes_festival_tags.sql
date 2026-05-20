-- 030_dishes_festival_tags.sql
-- Day 4 节庆 backfill —— dishes.festival_tags text[] + 7 节庆菜批量标记
-- 工单：TELEPOT-20260520-024
--
-- 7 节庆固定 ID：chunjie / yuanxiao / duanwu / zhongqiu / chongyang / laba / qixi
--
-- 安全模型：
--   - festival_tags DEFAULT '{}' 保证现有 731 行非 NULL，UPDATE 用 array_append + != ALL 防重复
--   - GIN 索引支持 WHERE 'chunjie' = ANY(festival_tags) 高效查询
--   - 不变量 #1 自检：dishes 表无 FK→auth.users（festival_tags 是 text[] 无 FK）
--
-- ⚠️ 匹配宽度提示（NOTES 会汇报实际命中数）：
--   chunjie pattern (饺子|年糕|鱼|长寿面|八宝饭) 含单字"鱼"会命中所有 fish 类菜（预览 61 道）
--   zhongqiu pattern (月饼|螃蟹|蟹|莲藕) 含单字"蟹"也较宽
--   按 CEO 工单字面值执行，是否收紧规则由 CEO 决定（"年年有余"语义合理）

BEGIN;

-- §1 加 festival_tags text[] 列
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS festival_tags text[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_dishes_festival_tags
  ON dishes USING GIN (festival_tags);

-- §2 7 节庆菜 backfill（按 dish title 匹配 → UPDATE festival_tags）

-- 春节：饺子 / 年糕 / 鱼 / 长寿面 / 八宝饭
UPDATE dishes SET festival_tags = array_append(festival_tags, 'chunjie')
  WHERE title_zh ~ '(饺子|年糕|鱼|长寿面|八宝饭)' AND 'chunjie' != ALL(COALESCE(festival_tags, '{}'));

-- 元宵：汤圆 / 元宵
UPDATE dishes SET festival_tags = array_append(festival_tags, 'yuanxiao')
  WHERE title_zh ~ '(汤圆|元宵)' AND 'yuanxiao' != ALL(COALESCE(festival_tags, '{}'));

-- 端午：粽子 / 黄鳝
UPDATE dishes SET festival_tags = array_append(festival_tags, 'duanwu')
  WHERE title_zh ~ '(粽子|黄鳝)' AND 'duanwu' != ALL(COALESCE(festival_tags, '{}'));

-- 中秋：月饼 / 螃蟹 / 莲藕
UPDATE dishes SET festival_tags = array_append(festival_tags, 'zhongqiu')
  WHERE title_zh ~ '(月饼|螃蟹|蟹|莲藕)' AND 'zhongqiu' != ALL(COALESCE(festival_tags, '{}'));

-- 重阳：菊花 / 重阳糕
UPDATE dishes SET festival_tags = array_append(festival_tags, 'chongyang')
  WHERE title_zh ~ '(菊花|重阳糕)' AND 'chongyang' != ALL(COALESCE(festival_tags, '{}'));

-- 腊八：腊八粥 / 腊八蒜
UPDATE dishes SET festival_tags = array_append(festival_tags, 'laba')
  WHERE title_zh ~ '(腊八)' AND 'laba' != ALL(COALESCE(festival_tags, '{}'));

-- 七夕：巧果
UPDATE dishes SET festival_tags = array_append(festival_tags, 'qixi')
  WHERE title_zh ~ '(巧果)' AND 'qixi' != ALL(COALESCE(festival_tags, '{}'));

COMMIT;
