-- 034_user_pantry_items.sql
-- 按 SPEC_pantry_v1.md §2 落地 user_pantry_items 表
-- 工单：TELEPOT-20260520-042 §A
--
-- 业务：用户家庭食材库存（"我家有什么"），用于推菜算法 bias + 采购清单减法
-- 安全模型：anon-first（与 025/026/027/028 一致），应用层 WHERE user_id = getUserId() 过滤
-- 不变量 #1 自检：user_id 是 text 列无 FK，无任何 FK→auth.users

BEGIN;

CREATE TABLE IF NOT EXISTS user_pantry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  ingredient_name text NOT NULL,
  qty numeric,
  unit text,
  in_pantry boolean DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ingredient_name)
);

CREATE INDEX IF NOT EXISTS idx_pantry_user_last_seen
  ON user_pantry_items(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_pantry_user_in_pantry
  ON user_pantry_items(user_id, in_pantry) WHERE in_pantry = true;

ALTER TABLE user_pantry_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pantry_anon_insert" ON user_pantry_items;
CREATE POLICY "pantry_anon_insert" ON user_pantry_items FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "pantry_anon_read" ON user_pantry_items;
CREATE POLICY "pantry_anon_read" ON user_pantry_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "pantry_anon_update" ON user_pantry_items;
CREATE POLICY "pantry_anon_update" ON user_pantry_items FOR UPDATE USING (true) WITH CHECK (true);

COMMIT;
