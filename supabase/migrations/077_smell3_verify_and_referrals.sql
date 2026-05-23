-- 077_smell3_verify_and_referrals.sql
-- 工单：TELEPOT-20260523-024
-- §A close 023 Smell 3 dispute — verify-only DO block 跑 3 个 information_schema
--    SELECT，RAISE NOTICE 输出实际 schema 状态（不 RAISE EXCEPTION，verify 是
--    informational 不阻塞 §B）
-- §B 建 referrals 表（推广闭环前置） — UI 031 ShareCard ?ref=<userId> 接住
--
-- 不变量自检：
--   #1 不 FK→auth.users（referrer/referred_user_id 是 text）
--   #2 不涉 Gemini                    #3 不涉 Stripe
--   #4 ALGO_VERSION 不动（新表，不动算法）
--   CREATE TABLE / INDEX / POLICY 全用 IF NOT EXISTS 保幂等

BEGIN;

-- =========================================================================
-- §A verify-only：跑 3 个 SELECT 报告 Smell 3 现状（025/026 落地 4 天前）
-- =========================================================================
DO $$
DECLARE
  v_helper_id_type text;
  v_fk_count       int;
  v_policy_count   int;
  v_policy_rec     record;
  v_orphan_count   int;
BEGIN
  -- A1: helper_id 类型应为 text（025 §3 ALTER COLUMN TYPE）
  SELECT data_type INTO v_helper_id_type
    FROM information_schema.columns
   WHERE table_name = 'household_members' AND column_name = 'helper_id';
  RAISE NOTICE '[smell3-verify A1] household_members.helper_id type = %', v_helper_id_type;
  IF v_helper_id_type <> 'text' THEN
    RAISE WARNING '[smell3-verify A1] FAIL — expected text, got %', v_helper_id_type;
  END IF;

  -- A2: FK household_members_helper_id_fkey 应存在（025 §4 ADD CONSTRAINT）
  SELECT count(*) INTO v_fk_count
    FROM information_schema.table_constraints
   WHERE table_name = 'household_members'
     AND constraint_type = 'FOREIGN KEY'
     AND constraint_name = 'household_members_helper_id_fkey';
  RAISE NOTICE '[smell3-verify A2] FK household_members_helper_id_fkey count = % (expect 1)', v_fk_count;
  IF v_fk_count <> 1 THEN
    RAISE WARNING '[smell3-verify A2] FAIL — FK missing (025 §4 may not have applied)';
  END IF;

  -- A3: households + household_members policies should be anon-first（USING true）
  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE tablename IN ('households', 'household_members');
  RAISE NOTICE '[smell3-verify A3] households + household_members policy count = %', v_policy_count;
  FOR v_policy_rec IN
    SELECT tablename, policyname, cmd, qual
      FROM pg_policies
     WHERE tablename IN ('households', 'household_members')
     ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '[smell3-verify A3] policy: %.% cmd=% qual=%',
      v_policy_rec.tablename, v_policy_rec.policyname, v_policy_rec.cmd, v_policy_rec.qual;
  END LOOP;

  -- A4 (bonus): 残留孤儿数据应为 0（025 §1 DELETE + §4 FK 保证）
  SELECT count(*) INTO v_orphan_count
    FROM household_members hm
   WHERE NOT EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = hm.helper_id);
  RAISE NOTICE '[smell3-verify A4] orphan helper_id rows = % (expect 0)', v_orphan_count;
  IF v_orphan_count > 0 THEN
    RAISE WARNING '[smell3-verify A4] FAIL — % orphan rows still exist', v_orphan_count;
  END IF;
END $$;

-- =========================================================================
-- §B 建 referrals 表（推广闭环前置）
-- =========================================================================
CREATE TABLE IF NOT EXISTS referrals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id   text NOT NULL,          -- 邀请者 userId (对齐 user_profiles.id text PK)
  referred_user_id   text NOT NULL,          -- 被邀请者 userId
  source             text NOT NULL
                     CHECK (source IN ('whatsapp','copy','native_share','wechat','unknown')),
  joined_at          timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_user_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_referred
  ON referrals (referred_user_id);

-- RLS：anon-first，与项目其他表（meal_logs 074 / household_members 025）一致
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read referrals" ON referrals
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "anon write referrals" ON referrals
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- UPDATE / DELETE 默认拒绝 = append-only ref 历史记录

COMMENT ON TABLE referrals IS
  'Referral tracking (append-only). Writer: Backend 024 ref-track edge fn from UI 031 ShareCard ?ref=<userId>. Reader: Lead 日报 + 未来奖励发放路径.';

COMMENT ON COLUMN referrals.referrer_user_id IS
  'Inviter userId (matches user_profiles.id text PK). NOT FK to auth.users per hard invariant #1.';

COMMENT ON COLUMN referrals.referred_user_id IS
  'Invitee userId (matches user_profiles.id text PK). NOT FK to user_profiles to tolerate guest sign-in race.';

COMMIT;
