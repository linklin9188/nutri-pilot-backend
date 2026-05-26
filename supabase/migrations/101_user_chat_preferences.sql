-- TICKET-094 — chat-driven preference extraction
--
-- 存储 chat 对话提取的结构化偏好，作为 prefScores 之外的"主动告诉"信号。
-- 老板拍板（2026-05-26）："chat 以及用户日常使用数据，才是核心提升算法
-- 的准确性的来源"。chat 主动告诉的偏好权重 1.5× > swap 隐式学的 1.0×。
--
-- 关键设计：household_id 双维度
-- - user_id: 直接告诉的人（雇主 / 菲佣本人）
-- - household_id: 同 household 下成员共享（雇主在 chat 说"老人爱清淡" →
--   菲佣端读 household 维度看到提醒）
--
-- 不动 RLS strict: anon-first 模型, 用 USING (true) FOR ALL (跟 households
-- 当前 model 一致, 025 migration 已 lockdown 模式).

CREATE TABLE IF NOT EXISTS user_chat_preferences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  household_id uuid,
  -- 偏好类型: breakfast_staple_subtype / cook_method / meat_part /
  --          work_complexity / season_pref / family_member_focus /
  --          dislike_keyword / love_keyword / other
  preference_type text NOT NULL,
  -- JSON value: subtype 数组 / keyword 数组 / boolean / 文本
  preference_value jsonb NOT NULL,
  -- 来源: chat (LLM extract) / swap_inferred / cook_done / didnt_eat / manual
  source text NOT NULL DEFAULT 'chat',
  -- 置信度 (0-1): chat 明确说 = 1.0; LLM 推断 = 0.7; swap 隐式 = 0.5
  confidence numeric NOT NULL DEFAULT 1.0,
  -- 原始 chat session id (审计追溯, nullable for backfill)
  source_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_chat_prefs_user
  ON user_chat_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_prefs_household
  ON user_chat_preferences(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_chat_prefs_type
  ON user_chat_preferences(preference_type);
-- 算法 hot path query: user + type 联查
CREATE INDEX IF NOT EXISTS idx_user_chat_prefs_user_type
  ON user_chat_preferences(user_id, preference_type);

ALTER TABLE user_chat_preferences ENABLE ROW LEVEL SECURITY;
-- anon-first model: FOR ALL USING (true) 跟 households / household_members 一致
DROP POLICY IF EXISTS "user_chat_prefs_anon_full" ON user_chat_preferences;
CREATE POLICY "user_chat_prefs_anon_full"
  ON user_chat_preferences FOR ALL
  USING (true) WITH CHECK (true);

-- updated_at 自动维护
CREATE OR REPLACE FUNCTION update_user_chat_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_chat_prefs_updated_at ON user_chat_preferences;
CREATE TRIGGER trg_user_chat_prefs_updated_at
  BEFORE UPDATE ON user_chat_preferences
  FOR EACH ROW EXECUTE FUNCTION update_user_chat_prefs_updated_at();

COMMENT ON TABLE user_chat_preferences IS
'TICKET-094: chat 提取的结构化偏好。算法读为 prefScores 高权重补丁 (chat 1.5× > swap 1.0×). household_id 双维度让雇主菲佣共享.';
