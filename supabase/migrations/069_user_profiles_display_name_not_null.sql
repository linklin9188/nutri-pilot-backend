-- 069_user_profiles_display_name_not_null.sql
-- 工单：TELEPOT-20260522-013 §C
-- CLAUDE.md / SCHEMA_AUDIT 异常 D 收口：display_name DB nullable vs 应用层假设非空
-- 落地策略：
--   1) DO block 自查 NULL 行数 — > 500 行直接 RAISE EXCEPTION abort（CEO 二次拍板）
--   2) UPDATE 兜底填 NULL → substr(id, 1, 8)
--   3) ALTER ... SET DEFAULT '匿名用户' + SET NOT NULL
--
-- 不变量自检：
--   #1 无 FK 改动                    #2 不涉 Gemini
--   #3 不涉 Stripe                    #4 ALGO_VERSION 不动
--   user_profiles.id 仍为 text PK，不动主键类型

BEGIN;

-- §1 自查 NULL 行数，>500 abort（工单 §C 要求 CEO 二次拍板阈值）
DO $$
DECLARE
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count
    FROM user_profiles
   WHERE display_name IS NULL;

  RAISE NOTICE 'user_profiles.display_name NULL rows = %', null_count;

  IF null_count > 500 THEN
    RAISE EXCEPTION 'NULL rows = % > 500 — abort, CEO approval required for bulk fill', null_count;
  END IF;
END $$;

-- §2 兜底填 NULL
UPDATE user_profiles
   SET display_name = COALESCE(display_name, substr(id, 1, 8))
 WHERE display_name IS NULL;

-- §3 NOT NULL + default
ALTER TABLE user_profiles
  ALTER COLUMN display_name SET DEFAULT '匿名用户',
  ALTER COLUMN display_name SET NOT NULL;

COMMIT;
