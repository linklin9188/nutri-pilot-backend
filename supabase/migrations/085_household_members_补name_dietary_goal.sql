-- TICKET-035: mini-migration 补 household_members.name + dietary_goal
-- 第 1 棒 TICKET-033 发现这 2 列在现有表里缺失（household_members 现只 6 列：id/household_id/helper_id/status/joined_at/left_at）
-- 后续 Algorithm/UI 棒需要：name 用于 UI 显示家人列表；dietary_goal 用于 per-member 营养评分
-- 老板 explicit ack "派 mini-migration 085 补这 2 列"

ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS dietary_goal text;

COMMENT ON COLUMN household_members.name IS '家人姓名/称呼（UI 显示用）';
COMMENT ON COLUMN household_members.dietary_goal IS '健康目标: muscle_gain / fat_loss / pregnancy_prep / child_growth / elder_wellness / general';
