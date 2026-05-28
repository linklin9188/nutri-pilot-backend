-- TICKET-098 (5/27 老板拍板 SPEC v2 Phase 1 P0)
--
-- helper_cook_logs — 菲佣每天做了什么菜的真持久化日志.
-- 老板真测痛点 #1: "我下班路上想知道菲佣今天做没做".
--
-- 设计:
-- - PK = (helper_id, dish_id, served_date) UNIQUE — 同人同菜同天 toggle 幂等
-- - household_id 双维度 — 雇主端按 household 查所有菲佣
-- - status enum: pending / cooking / done / skipped
-- - completed_at: done 时写, 用于雇主"早餐 13:05 完成"显示
-- - photo_url, notes 为后续 Phase 留口子, 当前不强制
--
-- RLS: anon-first FOR ALL USING (true) — 跟 households / household_members
-- 一致 (anon-first 模型 CLAUDE.md hard invariant).

CREATE TABLE IF NOT EXISTS helper_cook_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id    text NOT NULL,
  household_id uuid,           -- 雇主端按 household 查所有菲佣记录
  dish_id      uuid NOT NULL,
  served_date  date NOT NULL,
  -- meal_type: breakfast / lunch / dinner (跟 dishes.meal_type 对齐)
  meal_type    text NOT NULL DEFAULT 'lunch',
  -- status: pending / cooking / done / skipped
  status       text NOT NULL DEFAULT 'pending',
  started_at   timestamptz,
  completed_at timestamptz,
  -- 后续 Phase 留口子 (Phase 2 拍菜照, Phase 5 菲佣不会做反馈)
  photo_url    text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 同人同菜同天 toggle 必须幂等 (避免 cook 完成重复写)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_helper_cook_logs_per_day
  ON helper_cook_logs(helper_id, dish_id, served_date);
CREATE INDEX IF NOT EXISTS idx_helper_cook_logs_helper_date
  ON helper_cook_logs(helper_id, served_date);
-- 雇主端 hot path: household_id + served_date 查今日所有菲佣进度
CREATE INDEX IF NOT EXISTS idx_helper_cook_logs_household_date
  ON helper_cook_logs(household_id, served_date) WHERE household_id IS NOT NULL;

ALTER TABLE helper_cook_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "helper_cook_logs_anon_full" ON helper_cook_logs;
CREATE POLICY "helper_cook_logs_anon_full"
  ON helper_cook_logs FOR ALL
  USING (true) WITH CHECK (true);

-- updated_at 自动维护
CREATE OR REPLACE FUNCTION update_helper_cook_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_helper_cook_logs_updated_at ON helper_cook_logs;
CREATE TRIGGER trg_helper_cook_logs_updated_at
  BEFORE UPDATE ON helper_cook_logs
  FOR EACH ROW EXECUTE FUNCTION update_helper_cook_logs_updated_at();

COMMENT ON TABLE helper_cook_logs IS
'TICKET-098 SPEC v2 Phase 1: 菲佣每天做菜真持久化日志 (取代原 LS 临时 task_done). 雇主端按 household_id+served_date 查"今日进度", 菲佣 toggle 时双写 LS+DB.';
