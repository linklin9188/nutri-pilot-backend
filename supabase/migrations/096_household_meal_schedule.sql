-- TICKET-082 P0: 用餐时间日级化, 雇主菲佣共享 (CEO 修 TICKET-076 全局错)
--
-- 背景: TICKET-076 把 lunch_time / dinner_time 放 user_profiles 全局列, 周一
-- 晚 19:00 和周六晚 21:00 没法区分. 老板原话: "用餐时间不是在设置里, 是在今日
-- 菜单里, 每天用餐时间是不同的, 可以用户设置, 也可以 chat 里告知, 也可以菲佣
-- 设置, 这都可以."
--
-- 设计: 独立表按 (household_id, for_date) 存日级开饭时间. set_by 标记修改来源
-- (employer / helper / chat) 便于审计未来需要冲突仲裁. user_profiles.lunch_time
-- / dinner_time 保留作 "默认时间" fallback, 用户不设当天就用默认.

CREATE TABLE IF NOT EXISTS household_meal_schedule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  for_date     date NOT NULL,
  lunch_time   time,
  dinner_time  time,
  set_by       text,  -- 'employer' / 'helper' / 'chat'
  set_at       timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (household_id, for_date)
);

CREATE INDEX IF NOT EXISTS idx_meal_schedule_household_date
  ON household_meal_schedule(household_id, for_date);

-- 匿名 Auth (Smell 3 已修, 全表 anon-first FOR ALL) — 与 households /
-- household_members 一致, 避免 RLS 默默拒写.
ALTER TABLE household_meal_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meal_schedule_anon_full ON household_meal_schedule;
CREATE POLICY meal_schedule_anon_full ON household_meal_schedule
  FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION fn_meal_schedule_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_meal_schedule_updated_at ON household_meal_schedule;
CREATE TRIGGER trg_meal_schedule_updated_at
  BEFORE UPDATE ON household_meal_schedule
  FOR EACH ROW EXECUTE FUNCTION fn_meal_schedule_updated_at();

COMMENT ON TABLE household_meal_schedule IS 'TICKET-082: 每家每天开饭时间. user_profiles.lunch_time/dinner_time 仍作默认 fallback';
COMMENT ON COLUMN household_meal_schedule.set_by IS 'TICKET-082: employer/helper/chat — 标记修改来源, 未来冲突仲裁 + 审计';
