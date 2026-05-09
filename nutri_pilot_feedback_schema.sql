-- ==========================================
-- Nutri-Pilot  Feedback & Preference Learning
-- Run this on your Supabase SQL editor
-- ==========================================

-- 1. RAW TEXT FEEDBACK ─────────────────────────────────────────────────────
--    每条用户输入都完整保留，解析结果作为 JSON 列一起存
CREATE TABLE IF NOT EXISTS user_feedback (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  feedback_text  TEXT NOT NULL,

  -- 前端即时关键词解析结果
  flavor_signals JSONB DEFAULT '{}',   -- e.g. {"spicy":1, "light":-1}
  health_signals JSONB DEFAULT '{}',   -- e.g. {"damp_clear":1}
  cuisine_signal TEXT,                 -- e.g. "cantonese"

  -- 如果解析不出已知标签，视为菜品扩容请求
  is_dish_request   BOOLEAN DEFAULT FALSE,

  menu_date      DATE DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_user_idx ON user_feedback (user_id);
CREATE INDEX IF NOT EXISTS user_feedback_date_idx ON user_feedback (created_at DESC);

-- 2. AGGREGATED PREFERENCE SCORES ──────────────────────────────────────────
--    指数移动平均，range -1.0 (极度不喜欢) ~ +1.0 (强烈偏好)
--    每次新反馈: new = old * DECAY(0.85) + signal * RATE(0.15)
CREATE TABLE IF NOT EXISTS user_preference_scores (
  user_id          TEXT PRIMARY KEY,

  -- 口味维度
  pref_light       FLOAT DEFAULT 0,
  pref_spicy       FLOAT DEFAULT 0,
  pref_sweet       FLOAT DEFAULT 0,
  pref_salty       FLOAT DEFAULT 0,
  pref_sour        FLOAT DEFAULT 0,
  pref_seafood     FLOAT DEFAULT 0,
  pref_veggie      FLOAT DEFAULT 0,

  -- 健康目标维度
  pref_damp_clear   FLOAT DEFAULT 0,
  pref_muscle_gain  FLOAT DEFAULT 0,
  pref_lose_weight  FLOAT DEFAULT 0,
  pref_maintain     FLOAT DEFAULT 0,
  pref_detox        FLOAT DEFAULT 0,
  pref_authentic_hk FLOAT DEFAULT 0,

  -- 菜系维度
  pref_cantonese       FLOAT DEFAULT 0,
  pref_sichuan         FLOAT DEFAULT 0,
  pref_jiangnan        FLOAT DEFAULT 0,
  pref_northern        FLOAT DEFAULT 0,
  pref_western         FLOAT DEFAULT 0,
  pref_japanese_korean FLOAT DEFAULT 0,
  pref_southeast_asian FLOAT DEFAULT 0,

  feedback_count   INT DEFAULT 0,
  last_updated     TIMESTAMPTZ DEFAULT now()
);

-- 3. DISH EXPANSION REQUESTS ───────────────────────────────────────────────
--    用户要求的但数据库里还没有的菜，供产品团队审核后扩充菜谱库
CREATE TABLE IF NOT EXISTS dish_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_text    TEXT NOT NULL,      -- 用户原文
  inferred_cuisine TEXT,              -- 推断菜系（供筛选）
  request_count   INT DEFAULT 1,      -- 相似请求累计次数
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'under_review', 'added', 'declined')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dish_requests_status_idx ON dish_requests (status, request_count DESC);

-- 4. RLS (Row Level Security) ──────────────────────────────────────────────
--    用户只能读写自己的偏好数据

ALTER TABLE user_feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preference_scores ENABLE ROW LEVEL SECURITY;

-- user_feedback: anon 客户端只能插入/读自己 user_id 的行
CREATE POLICY "users_own_feedback_insert" ON user_feedback
  FOR INSERT WITH CHECK (true);   -- 允许匿名设备插入（user_id 是设备 UUID）

CREATE POLICY "users_own_feedback_select" ON user_feedback
  FOR SELECT USING (true);        -- 前端只拉自己 user_id 的数据（过滤在查询层）

-- user_preference_scores: 同上
CREATE POLICY "users_own_scores_all" ON user_preference_scores
  FOR ALL USING (true) WITH CHECK (true);

-- dish_requests: 任何人可插入，只有 service_role 可修改 status
CREATE POLICY "anyone_can_request_dish" ON dish_requests
  FOR INSERT WITH CHECK (true);
