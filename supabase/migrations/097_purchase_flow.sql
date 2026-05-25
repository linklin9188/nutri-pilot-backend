-- ════════════════════════════════════════════════════════════════════════════
-- 097_purchase_flow.sql — TICKET TELEPOT-20260525-083 P0 采购流程修正
--
-- 背景: 075 把"我家有"勾选流程做反了 (雇主先勾 → 通知菲佣). 真实业务流是:
--   雇主 ① 生成菜单 → ② "发给菲佣" (只发清单不勾) →
--   菲佣 ③ HelperPrep 勾"我家有的" → ④ "✅ 确认完了" →
--   雇主 ⑤ Home 收红点 "菲佣确认完了 · 还要买 12 件" →
--           ⑥ 点 → 自动加进购物车 (按 supplier_id 拆) →
--           ⑦ /cart → /checkout 下单 (多供应商拆多订单).
--
-- 数据源头是菲佣 (天天做饭知道冰箱有啥), 雇主只接收 + 下单.
--
-- §1. home_inventory 加 "菲佣确认完了" 状态字段
-- §2. purchase_notifications 新表 — 雇主 ⇄ 菲佣 双向通知 (employer_sent /
--     helper_confirmed) + 还要买的数量, /home 红点 + /verify 状态切换都读这里.
-- ════════════════════════════════════════════════════════════════════════════

-- §1. home_inventory 加菲佣确认状态字段
ALTER TABLE home_inventory
  ADD COLUMN IF NOT EXISTS confirmed_at             timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by_helper_id   text;

COMMENT ON COLUMN home_inventory.confirmed_at IS
  'TICKET-083: 菲佣 "✅ 确认完了" 点击时间. NULL = 还没确认. UPDATE 时雇主收红点.';
COMMENT ON COLUMN home_inventory.confirmed_by_helper_id IS
  'TICKET-083: 哪个 helper 点的确认 (user_profiles.id text). NULL = 还没确认.';

-- §2. purchase_notifications — 雇主 ⇄ 菲佣 双向通知
CREATE TABLE IF NOT EXISTS purchase_notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  for_date           date NOT NULL,
  notify_type        text NOT NULL,                 -- 'employer_sent' / 'helper_confirmed'
  message_zh         text,
  message_en         text,
  message_tl         text,
  to_be_bought_count int  DEFAULT 0,                -- 菲佣确认后还要买的食材数量
  read_at            timestamptz,
  created_at         timestamptz DEFAULT now(),
  UNIQUE (household_id, for_date, notify_type)
);

CREATE INDEX IF NOT EXISTS idx_purchase_notif_household_date
  ON purchase_notifications(household_id, for_date);

CREATE INDEX IF NOT EXISTS idx_purchase_notif_unread
  ON purchase_notifications(household_id, read_at)
  WHERE read_at IS NULL;

COMMENT ON TABLE purchase_notifications IS
  'TICKET-083: 雇主 ⇄ 菲佣 双向采购通知. employer_sent=雇主发清单; helper_confirmed=菲佣确认完了 (UI 显红点).';
COMMENT ON COLUMN purchase_notifications.notify_type IS
  'employer_sent (雇主→菲佣) / helper_confirmed (菲佣→雇主, 触发红点)';
COMMENT ON COLUMN purchase_notifications.to_be_bought_count IS
  '菲佣确认后还要买的食材数量 (helper_confirmed 时填). employer_sent 时 = 0.';

-- §3. RLS — anon-first FOR ALL USING (true) (跟 Smell 3 B-1 + orders 同口径)
ALTER TABLE purchase_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_notif_anon_full ON purchase_notifications;
CREATE POLICY purchase_notif_anon_full
  ON purchase_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);
