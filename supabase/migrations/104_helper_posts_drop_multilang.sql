-- TICKET-105 §B v3 (老板 5/29): 不再做 EN+TL 双语翻译路径.
-- mock seed 直接写 Tagalog 单语 (菲佣母语), 老板自测也看 Tagalog (demo 用途).
-- migration 103 加的 4 列没用了, DROP 回滚.

ALTER TABLE helper_posts DROP COLUMN IF EXISTS title_en;
ALTER TABLE helper_posts DROP COLUMN IF EXISTS body_en;
ALTER TABLE helper_posts DROP COLUMN IF EXISTS title_tl;
ALTER TABLE helper_posts DROP COLUMN IF EXISTS body_tl;
