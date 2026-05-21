-- 058_user_profiles_v3_axes.sql
-- 工单：TELEPOT-20260521-003 §B
--
-- v3 图片驱动 onboarding 新增 axes（UI 079 + Algorithm 073 配套）。
-- 全 ADD COLUMN IF NOT EXISTS 保幂等。全 text / text[] schema flexibility 优先，
-- CHECK constraint 后续按需另派 migration。
--
-- 工单文字写"9 个新列"，SQL 实际 11 列（含 oil_level 单数 + onboarding_version
-- DEFAULT 'v2'），按 SQL 落地以 11 列为准。
--
-- 注意：本表主键 id 是 text（user_profiles.id = application userId，非 uuid，
-- 不是 auth.users）。本 migration 仅 ADD COLUMN 不动 PK / FK。
--
-- 不变量自检：
--   #1 无 FK→auth.users
--   #6 dish.id 未触
--   单 BEGIN/COMMIT

BEGIN;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS table_style          text,         -- Q0 single enum
  ADD COLUMN IF NOT EXISTS protein_main_class   text[],       -- Q1 multi (red/white/seafood/veg)
  ADD COLUMN IF NOT EXISTS staple_pref          text[],       -- Q2 multi (rice/noodle/porridge/grain)
  ADD COLUMN IF NOT EXISTS protein_pref         text[],       -- Q3 multi (pork/chicken/duck/lamb/beef)
  ADD COLUMN IF NOT EXISTS beef_style           text[],       -- Q4 multi
  ADD COLUMN IF NOT EXISTS chicken_style        text[],       -- Q5 multi
  ADD COLUMN IF NOT EXISTS seafood_style        text[],       -- Q6 multi
  ADD COLUMN IF NOT EXISTS veggie_method        text[],       -- Q7 multi (stirfry/dry/cold/soup)
  ADD COLUMN IF NOT EXISTS oil_level            text,         -- Q8 single (heavy/normal/light)
  ADD COLUMN IF NOT EXISTS breakfast_cuisine    text,         -- Q9 single (chinese/western/hk/simple)
  ADD COLUMN IF NOT EXISTS onboarding_version   text DEFAULT 'v2';  -- 'v2' / 'v3' / future

COMMIT;
