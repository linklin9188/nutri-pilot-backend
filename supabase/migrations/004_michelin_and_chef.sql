-- Migration 004 — Michelin / Black Pearl menu + Chef-at-home interest form
-- ============================================================================
-- 1. michelin_dishes — separate from `dishes` because the data shape is
--    different: real-world restaurant attribution, two-tier prep instructions
--    (家常版 vs 米其林大厨版), and pricing for the chef-at-home service.
--    Linked back to `dishes` via dish_link_id when a "home version" exists in
--    the regular menu pool.
--
-- 2. user_chef_interest — placeholder lead form. Captures "I want a Michelin
--    chef at home" intent before we wire any real booking system. Just a
--    drop-zone for emails/phones so the founder can follow up manually.
--
-- 3. user_lunch_log — school-lunch entries from parents (free-text +
--    AI-analyzed). Used by ProSchoolBalance to (a) feed nutrition radar over
--    time and (b) avoid re-analyzing the same lunch.

-- ── 1. michelin_dishes ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS michelin_dishes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Naming
  name_zh                  text NOT NULL,
  name_en                  text,

  -- Restaurant attribution (公开信息，餐厅招牌菜)
  restaurant_name_zh       text NOT NULL,    -- 龍景軒 / 唐閣 / 一樂燒鵝
  restaurant_name_en       text,
  award_type               text NOT NULL CHECK (award_type IN ('michelin','black_pearl')),
  award_level              integer CHECK (award_level BETWEEN 1 AND 3), -- 米其林 1/2/3 星，黑珍珠 1/2/3 钻
  city                     text NOT NULL,    -- 'hk' | 'shanghai' | 'guangzhou' | 'beijing' | 'chengdu' | 'hangzhou'

  -- Cuisine taxonomy
  cuisine_style            text NOT NULL,    -- 'cantonese_fine' | 'shanghainese_fine' | 'sichuanese_modern' | 'huaiyang_fine' | 'fusion' | ...
  course_type              text,             -- soup | main_protein | veggie_dish | staple | dessert
  main_ingredient          text,             -- 沿用 dishes.main_ingredient enum

  -- Signature characteristics
  signature_technique      text NOT NULL,    -- 短句：'低温慢煮 24h + 焦香表皮'
  flavor_profile_zh        text,             -- 'umami / 鲜咸 / 微回甘'
  plating_note_zh          text,             -- '青瓷盘上，淋少许罗勒油'

  -- Two-tier prep:
  --   home_prep_steps_json — 家常简化版，菲佣可以做
  --   chef_prep_steps_json — 米其林大厨上门版，包含 sous vide / 烟熏柜 / 摆盘等
  home_prep_steps_json     jsonb,
  home_cook_steps_json     jsonb,
  home_difficulty          text CHECK (home_difficulty IN ('简单','中等','稍复杂')),
  home_time_min            integer,

  chef_prep_steps_json     jsonb,
  chef_cook_steps_json     jsonb,
  chef_difficulty          text DEFAULT '专业',  -- 总是专业
  chef_time_min            integer,

  -- Visuals + copy
  image_url                text,
  blurb_zh                 text,             -- 30 字以内：tasting notes / why this dish

  -- Service offering
  chef_book_available      boolean NOT NULL DEFAULT true,
  chef_book_price_hkd      integer,          -- 单桌参考价（HKD）

  -- Optional link to regular dishes (for "home version exists" cross-ref)
  dish_link_id             uuid REFERENCES dishes(id) ON DELETE SET NULL,

  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_michelin_city_award       ON michelin_dishes(city, award_type, award_level DESC);
CREATE INDEX IF NOT EXISTS idx_michelin_restaurant       ON michelin_dishes(restaurant_name_zh);
CREATE INDEX IF NOT EXISTS idx_michelin_cuisine          ON michelin_dishes(cuisine_style);

COMMENT ON TABLE michelin_dishes IS
  '米其林 / 黑珍珠餐厅招牌菜 — Pro 用户的米其林菜单数据源，同时是"米其林大厨上门"业务的菜目录';

-- ── 2. user_chef_interest ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_chef_interest (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,                                   -- nullable: anonymous interest allowed
  michelin_dish_id uuid REFERENCES michelin_dishes(id) ON DELETE SET NULL,

  -- Lead capture (whatever the user is willing to share)
  contact_name    text,
  phone           text,
  email           text,
  preferred_date  date,
  party_size      integer,
  notes           text,         -- free-text "我想要 XX 风格"

  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','contacted','quoted','booked','declined','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chef_interest_new ON user_chef_interest(status, created_at DESC);

COMMENT ON TABLE user_chef_interest IS
  '米其林大厨上门 — 用户意向表单。状态机：new → contacted → quoted → booked|declined|cancelled';

-- ── 3. user_lunch_log ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_lunch_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  child_label     text,            -- 'kid_1' / '老大' — optional family identifier

  -- Input
  lunch_date      date NOT NULL,
  lunch_text      text NOT NULL,   -- free-text the parent entered: "番茄炒蛋 + 米饭 + 冬瓜汤"
  age_bracket     text,            -- 'preschool' | 'primary' | 'teen'

  -- Gemini analysis output (cached)
  covered_nutrients  text[],       -- ['protein','veggie','carb']
  missing_nutrients  text[],       -- ['calcium','omega3']
  ai_reasoning_zh    text,         -- one-line summary
  suggested_dish_ids uuid[],       -- 3 dishes that were suggested (refs to dishes table after Phase B insert)

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lunch_log_user_date ON user_lunch_log(user_id, lunch_date DESC);

COMMENT ON TABLE user_lunch_log IS
  '父母手输的学校午餐 + AI 营养差距分析结果。后续可做"孩子本月营养雷达"';
