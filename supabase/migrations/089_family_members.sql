-- TICKET TELEPOT-20260525-072 P0: 家人数据存 DB (老板拍板 PENDING_BOSS_DECISION #2)
--
-- 背景: TICKET-039 (commit ba161c3) 发现 household_members.helper_id NOT NULL
-- FK→user_profiles.id (Smell 3 修复时定的). 家人非 helper 没 user_profiles row →
-- INSERT 被 FK 拒, 家人 12 字段暂走 localStorage nutri_family_members.
--
-- 后果: 用户换设备 / 清缓存 → 家人数据丢; 算法拿不到家人数据做 per-member 评分.
--
-- 修复: 独立新表 family_members (方案 B, 见 docs/SPEC_family_members_schema_升级_方案ABC对比.md).
-- 不动 household_members (保持 helper-only 语义, Smell 3 修复后的 FK 不破坏).
--
-- 字段命名约束:
--   - avoid_tags (跟 user_profiles 命名一致, 不用 allergens)
--   - relation 默认 'self' (老板自己是第一个家人)
--   - avoid_tags + chronic_diseases 是 text[] 不是 jsonb (查询简单)
--
-- RLS: anon-first FOR ALL USING (true), 跟 Smell 3 修复后 household_members policy 同模式
-- (CLAUDE.md 硬规: 不用 auth.uid(), 与匿名 Auth 冲突).

CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  relation text NOT NULL DEFAULT 'self',  -- self / spouse / son / daughter / father / mother / etc
  gender text,                              -- male / female / na
  age_years int,
  height_cm int,
  weight_kg numeric(5,2),
  dietary_goal text,                        -- muscle_gain / lose_weight / etc (mirror user_profiles enum)
  avoid_tags text[] DEFAULT '{}'::text[],   -- ['gluten','peanut',...]
  chronic_diseases text[] DEFAULT '{}'::text[], -- ['hypertension','diabetes',...]
  dietary_mode text,                        -- omni / vegetarian / vegan / pescatarian
  tcm_constitution text,                    -- 中医体质 ['yang_xu','yin_xu','qi_xu','blood_xu',...]
  pregnancy_status text,                    -- none / planning / pregnant / postpartum
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_members_household ON family_members(household_id);

-- RLS: anon-first (跟 Smell 3 修复后的 household_members policy 同模式)
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS family_members_anon_full ON family_members;
CREATE POLICY family_members_anon_full ON family_members FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_family_members_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_family_members_updated_at ON family_members;
CREATE TRIGGER trg_family_members_updated_at
  BEFORE UPDATE ON family_members
  FOR EACH ROW EXECUTE FUNCTION fn_family_members_set_updated_at();
