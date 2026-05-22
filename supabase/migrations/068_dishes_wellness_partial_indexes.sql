-- 068_dishes_wellness_partial_indexes.sql
-- 工单：TELEPOT-20260522-013 §B
-- SCHEMA_AUDIT_20260521 §6 异常 C 落地：12 wellness boolean 列单列查询全 seqscan
-- 策略 A：每列建 partial index `(id) WHERE is_xxx = true`
-- 优势：true 行通常占 5-50%，partial 体积小、命中精准
--
-- 不变量自检：
--   #1 无 FK 改动                    #2 不涉 Gemini
--   #3 不涉 Stripe                    #4 ALGO_VERSION 不动
--   IF NOT EXISTS 保幂等

BEGIN;

CREATE INDEX IF NOT EXISTS idx_dishes_low_sodium_true
  ON dishes(id) WHERE is_low_sodium = true;

CREATE INDEX IF NOT EXISTS idx_dishes_low_sugar_true
  ON dishes(id) WHERE is_low_sugar = true;

CREATE INDEX IF NOT EXISTS idx_dishes_low_purine_true
  ON dishes(id) WHERE is_low_purine = true;

CREATE INDEX IF NOT EXISTS idx_dishes_blood_tonic_true
  ON dishes(id) WHERE is_blood_tonic = true;

CREATE INDEX IF NOT EXISTS idx_dishes_sleep_aid_true
  ON dishes(id) WHERE is_sleep_aid = true;

CREATE INDEX IF NOT EXISTS idx_dishes_yin_nourish_true
  ON dishes(id) WHERE is_yin_nourish = true;

CREATE INDEX IF NOT EXISTS idx_dishes_qi_tonic_true
  ON dishes(id) WHERE is_qi_tonic = true;

CREATE INDEX IF NOT EXISTS idx_dishes_mood_boost_true
  ON dishes(id) WHERE is_mood_boost = true;

CREATE INDEX IF NOT EXISTS idx_dishes_anti_aging_true
  ON dishes(id) WHERE is_anti_aging = true;

CREATE INDEX IF NOT EXISTS idx_dishes_beauty_true
  ON dishes(id) WHERE is_beauty = true;

CREATE INDEX IF NOT EXISTS idx_dishes_anti_inflammation_true
  ON dishes(id) WHERE is_anti_inflammation = true;

CREATE INDEX IF NOT EXISTS idx_dishes_eye_care_true
  ON dishes(id) WHERE is_eye_care = true;

COMMIT;
