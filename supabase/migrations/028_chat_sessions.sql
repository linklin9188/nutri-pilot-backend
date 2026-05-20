-- 028_chat_sessions.sql
-- ChatAgent DB 持久化层（Day 3 主线 D）—— 跨设备/跨刷新保留对话
-- 依据：SPEC §3.1 v1 边界 + 工单 TELEPOT-20260520-020
--
-- 配套前端：commit 6162852 等 ChatAgent 前端壳（原本只 localStorage，本表升级为 DB 持久化）
--
-- 安全模型：anon-first（与 025/026/027 一致），RLS USING/WITH CHECK (true)，
-- 应用层用 WHERE user_id = getUserId() 做过滤（CLAUDE.md 不变量 #1）。
-- 不变量 #1 自检：user_id 是 text 列无 FK——任何 FK→auth.users 都禁止。

BEGIN;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  mode text CHECK (mode IN ('today', 'week', 'preference')) NOT NULL DEFAULT 'today',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  intent_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposals_snapshot jsonb,  -- 用户最终采纳的 3 候选哪个（A/B/C）
  chosen text CHECK (chosen IN ('A','B','C')) ,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
  ON chat_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode
  ON chat_sessions(mode, updated_at DESC);

-- RLS（anon-first）
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_sessions_anon_insert" ON chat_sessions;
CREATE POLICY "chat_sessions_anon_insert" ON chat_sessions
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "chat_sessions_anon_read" ON chat_sessions;
CREATE POLICY "chat_sessions_anon_read" ON chat_sessions
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "chat_sessions_anon_update" ON chat_sessions;
CREATE POLICY "chat_sessions_anon_update" ON chat_sessions
  FOR UPDATE USING (true) WITH CHECK (true);

-- updated_at 自动更新 trigger
CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_sessions_updated_at_trigger ON chat_sessions;
CREATE TRIGGER chat_sessions_updated_at_trigger
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_sessions_updated_at();

COMMIT;
