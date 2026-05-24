-- TICKET TELEPOT-20260524-033 §A — Settings v2 schema 大重构
-- Author: Database Lead
-- Date: 2026-05-24
-- Spec: docs/SPEC_settings大重构_老板拍板.md §1
--
-- 目的：给 user_profiles + household_members 加足够字段，支撑 Settings 重构后
--      "全家 9 + 个人 10" 完整算法维度。所有新列全 nullable，不破现有用户数据。
--
-- 实查结果（2026-05-24）：
--   user_profiles 已有：hometown_cuisine / dietary_goal / taste_pref / display_name /
--                       nickname / avatar_url / city / province / pref_scores 等 45 列
--                       → §1 中 hometown_cuisine 已有，跳过；其余 8 列全部不存在，本 migration 添加。
--   household_members 仅有：id / household_id / helper_id / status / joined_at / left_at
--                       → §2 个人 10 列全部不存在，本 migration 全部添加。
--                       → 注：spec §1.2 列出 11 列含 name / dietary_goal，但实查均不存在；
--                         本 ticket 严格按工单 §A.2 加 10 列，name / dietary_goal 缺失另开 ticket。
--
-- RLS：本 migration 不动 RLS；households / household_members 沿用 migration 025
--      建立的 anon-first FOR ALL USING (true) 模式（Smell 3 已修复）。

BEGIN;

-- =========================================================================
-- §1. user_profiles：全家层面 8 列（hometown_cuisine 已有，跳过）
-- =========================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS cuisine_preference text,
  ADD COLUMN IF NOT EXISTS spice_tolerance text,
  ADD COLUMN IF NOT EXISTS taste_intensity text,
  ADD COLUMN IF NOT EXISTS cooking_methods_pref text[],
  ADD COLUMN IF NOT EXISTS excluded_meats text[],
  ADD COLUMN IF NOT EXISTS excluded_ingredients text[],
  ADD COLUMN IF NOT EXISTS cooking_frequency_per_week int,
  ADD COLUMN IF NOT EXISTS budget_level text;

COMMENT ON COLUMN user_profiles.cuisine_preference     IS '家庭主菜系偏好: chinese / western / japanese_korean / mixed';
COMMENT ON COLUMN user_profiles.spice_tolerance        IS '全家最低能吃辣度: none / mild / medium / heavy';
COMMENT ON COLUMN user_profiles.taste_intensity        IS '口味浓淡: light / medium / rich';
COMMENT ON COLUMN user_profiles.cooking_methods_pref   IS '烹饪方式偏好多选数组: steam / stir_fry / braise / boil / grill / deep_fry';
COMMENT ON COLUMN user_profiles.excluded_meats         IS '主肉忌口数组: pork / beef / lamb / chicken / duck';
COMMENT ON COLUMN user_profiles.excluded_ingredients   IS '食材忌口数组: bitter_melon / eggplant / cilantro / tofu / etc';
COMMENT ON COLUMN user_profiles.cooking_frequency_per_week IS '每周做菜天数 1-7';
COMMENT ON COLUMN user_profiles.budget_level           IS '预算: economy / medium / premium';

-- =========================================================================
-- §2. household_members：个人层面 10 列
-- =========================================================================

ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS relation text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_years int,
  ADD COLUMN IF NOT EXISTS height_cm int,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,2),
  ADD COLUMN IF NOT EXISTS allergens text[],
  ADD COLUMN IF NOT EXISTS chronic_diseases text[],
  ADD COLUMN IF NOT EXISTS dietary_mode text,
  ADD COLUMN IF NOT EXISTS tcm_constitution text,
  ADD COLUMN IF NOT EXISTS pregnancy_status text;

COMMENT ON COLUMN household_members.relation          IS '家人关系: self / spouse / son / daughter / father / mother / etc';
COMMENT ON COLUMN household_members.gender            IS '性别: male / female';
COMMENT ON COLUMN household_members.age_years         IS '真实年龄';
COMMENT ON COLUMN household_members.height_cm         IS '身高 cm';
COMMENT ON COLUMN household_members.weight_kg         IS '体重 kg, 算法用来算 BMI';
COMMENT ON COLUMN household_members.allergens         IS '过敏原数组 (硬过滤): seafood / gluten / nuts / milk / eggs';
COMMENT ON COLUMN household_members.chronic_diseases  IS '慢病数组: hypertension / diabetes / gout / high_cholesterol → 触发 12 健康标签';
COMMENT ON COLUMN household_members.dietary_mode      IS '饮食模式: omnivore / vegetarian / vegan / halal / kosher';
COMMENT ON COLUMN household_members.tcm_constitution  IS '中医 8 体质: balanced / qi_deficient / yang_deficient / yin_deficient / phlegm_damp / damp_heat / blood_stasis / special_diathesis';
COMMENT ON COLUMN household_members.pregnancy_status  IS '怀孕状态 (女性才填): none / trying / early / mid / late / breastfeeding';

COMMIT;
