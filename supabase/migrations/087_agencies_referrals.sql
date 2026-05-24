-- TICKET-043: 中介裂变 A 推荐码 - PDPO 合规版
-- 不分享用户 PII 给中介, 只内部 attribution

CREATE TABLE IF NOT EXISTS agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  referral_code text NOT NULL UNIQUE,
  contact_whatsapp text,
  contact_email text,
  category text,
  status text NOT NULL DEFAULT 'pending',
  reward_voucher_per_user numeric(8,2) DEFAULT 5,
  total_referred_users int DEFAULT 0,
  total_voucher_earned_hkd numeric(8,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN agencies.referral_code IS '中介推荐码 e.g. JJL2026, 用户注册时输入';
COMMENT ON COLUMN agencies.status IS 'pending = 待审核; active = 可被引用; paused = 暂停';
COMMENT ON COLUMN agencies.reward_voucher_per_user IS '每带来 1 用户奖励 HKD 超市券 (默认 5)';

CREATE INDEX IF NOT EXISTS idx_agencies_code_active ON agencies(referral_code) WHERE status = 'active';

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referred_by_agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_by_code text;

COMMENT ON COLUMN user_profiles.referred_by_agency_id IS '该用户被哪家中介推荐 (合规 attribution, 不分享 PII)';
COMMENT ON COLUMN user_profiles.referred_by_code IS '用户注册时输入的推荐码原文 (留 record)';

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY agencies_anon_read ON agencies FOR SELECT TO anon USING (status = 'active');
CREATE POLICY agencies_anon_read_auth ON agencies FOR SELECT TO authenticated USING (status = 'active');

INSERT INTO agencies (id, name, referral_code, status, reward_voucher_per_user)
VALUES (
  '00000000-0000-4000-8000-000000000099',
  'Aieats Test Agency (TBD)',
  'AIEATS_DEMO',
  'pending',
  5
)
ON CONFLICT (referral_code) DO NOTHING;
