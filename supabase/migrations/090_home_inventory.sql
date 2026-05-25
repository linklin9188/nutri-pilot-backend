-- ════════════════════════════════════════════════════════════════════════════
-- 090_home_inventory.sql — TICKET-075 P0 §2 (老板真测 #18 全链路 6 断点)
--
-- 真因: localStorage.home_inventory_<userId>_<date> 是雇主 + 菲佣双端"我家有"
-- 勾选的唯一存储, 雇主在手机 A 勾完, 菲佣在自己手机看不见, 切设备 / 清缓存
-- 雇主自己也丢. 本表把这份状态搬上 DB, 以 household_id + ingredient_name +
-- for_date 为唯一键, 双端共享一行真相.
--
-- 字段:
--   household_id     — FK households(id), 让雇主菲佣共享一份 inventory
--   ingredient_name  — 食材聚合名 (e.g. "葱"; 不是 "葱段")
--   is_available     — true=我家有不用买, false=要买
--   marked_by        — 'employer' / 'helper', 追溯谁勾的 (调试 + 未来通知)
--   marked_at        — 最近一次 toggle 时间 (trigger 自动维护)
--   for_date         — 哪天的采购清单, 默认今天; 跨日数据自然 partition
--
-- RLS: anon-first FOR ALL USING (true) — 跟 Smell 3 修复后 households /
-- household_members 同口径, 因为 app 是 custom auth + 匿名 Auth, 不能用
-- auth.uid().
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS home_inventory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_name text NOT NULL,
  is_available    boolean NOT NULL DEFAULT false,
  marked_by       text,
  marked_at       timestamptz DEFAULT now(),
  for_date        date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (household_id, ingredient_name, for_date)
);

CREATE INDEX IF NOT EXISTS idx_home_inventory_household_date
  ON home_inventory(household_id, for_date);

ALTER TABLE home_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_inventory_anon_full ON home_inventory;
CREATE POLICY home_inventory_anon_full
  ON home_inventory
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 自动维护 marked_at — 任何 UPDATE 都刷新, 让"谁最近改的"可观察
CREATE OR REPLACE FUNCTION fn_home_inventory_set_marked_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.marked_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_home_inventory_marked_at ON home_inventory;
CREATE TRIGGER trg_home_inventory_marked_at
  BEFORE UPDATE ON home_inventory
  FOR EACH ROW EXECUTE FUNCTION fn_home_inventory_set_marked_at();
