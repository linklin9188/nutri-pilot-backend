-- TICKET-105 §B: helper_posts 加 EN + Tagalog 双语列
-- 老板 5/29 拍板: 菲佣端展示给菲佣看的内容禁中文, 必须 EN + Tagalog.
-- 4 列均 nullable, 现有 30 帖暂时只有 title/body (中文), Agent 后台跑 Gemini
-- 翻译填充 title_en/body_en/title_tl/body_tl. HelperHome 按 language 取相应字段.

ALTER TABLE helper_posts ADD COLUMN IF NOT EXISTS title_en text;
ALTER TABLE helper_posts ADD COLUMN IF NOT EXISTS body_en  text;
ALTER TABLE helper_posts ADD COLUMN IF NOT EXISTS title_tl text;
ALTER TABLE helper_posts ADD COLUMN IF NOT EXISTS body_tl  text;

COMMENT ON COLUMN helper_posts.title_en IS 'TICKET-105: English translation of title — required for helper-facing UI (zh column is employer-only).';
COMMENT ON COLUMN helper_posts.body_en  IS 'TICKET-105: English translation of body.';
COMMENT ON COLUMN helper_posts.title_tl IS 'TICKET-105: Tagalog/Filipino translation of title — primary language for helpers.';
COMMENT ON COLUMN helper_posts.body_tl  IS 'TICKET-105: Tagalog/Filipino translation of body.';
