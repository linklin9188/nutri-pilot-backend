-- TICKET-076 P0 §Phase 1: 用餐时间设置 (老板 #19 智能菜单延伸需求)
--
-- 给 user_profiles 加 lunch_time / dinner_time 两列, 让雇主在 Settings 设定
-- 一日两餐的开饭时间, 用来反推菲佣开做时间 (lib/cookSchedule.ts).
--
-- DEFAULT 12:00 / 19:00 是中国家庭常规午晚饭时间 (CEO 拍板, 不做调研).
-- nullable, 老用户不强制设, 读取端 fallback 到 default.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS lunch_time  time DEFAULT '12:00:00',
  ADD COLUMN IF NOT EXISTS dinner_time time DEFAULT '19:00:00';

COMMENT ON COLUMN user_profiles.lunch_time  IS 'TICKET-076: 雇主家午饭开饭时间, 算法用来反推菲佣开做时间';
COMMENT ON COLUMN user_profiles.dinner_time IS 'TICKET-076: 雇主家晚饭开饭时间';
