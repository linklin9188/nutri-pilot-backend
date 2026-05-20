-- 046_data_health_view.sql
-- 实施 data_health_summary view —— CEO 跑 `SELECT * FROM data_health_summary` 立即看 5 张表健康度
-- 工单：TELEPOT-20260520-062 §C
--
-- 注：CEO 工单引用 057 §C "已写 SQL 草稿"，实际 057 §C 是 CLAUDE_DATABASE.md 同步（非 view SQL）。
-- 本 migration Database Lead 自起 view SQL，按 CEO §C 意图（"5 张表健康度一眼可见"）。
--
-- 选 5 张关键业务表：
--   1) dishes —— 菜品主表（最重要，含数据质量 7 维度）
--   2) user_profiles —— 用户画像（display_name nullable 已知 smell）
--   3) household_members —— 雇主-助手关系（025 后 anon-first FK 健康）
--   4) user_weekly_menus —— 周菜单缓存（algo_version 命中率重要）
--   5) user_feedback_helper —— 飞轮反馈（rating 类型分布）
--
-- 每张表用 jsonb 列存细节，UNION ALL 拼成统一 schema (table_name / total_rows / missing_details)
-- 不变量 #1/#4 自检：纯 view 无 FK / 不触 ALGO_VERSION

BEGIN;

CREATE OR REPLACE VIEW data_health_summary AS
SELECT
  'dishes' AS table_name,
  COUNT(*) AS total_rows,
  jsonb_build_object(
    'missing_title', COUNT(*) FILTER (WHERE title_zh IS NULL OR title_zh = ''),
    'missing_cuisine', COUNT(*) FILTER (WHERE origin_cuisine IS NULL OR origin_cuisine = ''),
    'missing_prep_steps', COUNT(*) FILTER (WHERE prep_steps_json IS NULL OR prep_steps_json::text = '[]'),
    'missing_cook_steps', COUNT(*) FILTER (WHERE cook_steps_json IS NULL OR cook_steps_json::text = '[]'),
    'missing_nutrition', COUNT(*) FILTER (WHERE nutrition_kcal_per_serving IS NULL),
    'missing_image', COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = ''),
    'xiaomei_null', COUNT(*) FILTER (WHERE xiaomei_compatible IS NULL),
    'duplicates', (SELECT COUNT(*) - COUNT(DISTINCT title_zh) FROM dishes)
  ) AS missing_details
FROM dishes

UNION ALL

SELECT
  'user_profiles',
  COUNT(*),
  jsonb_build_object(
    'missing_display_name', COUNT(*) FILTER (WHERE display_name IS NULL OR display_name = ''),
    'missing_hometown', COUNT(*) FILTER (WHERE hometown_cuisine IS NULL OR hometown_cuisine = ''),
    'missing_dietary_goal', COUNT(*) FILTER (WHERE dietary_goal IS NULL OR dietary_goal = ''),
    'with_avatar', COUNT(*) FILTER (WHERE avatar_b64 IS NOT NULL AND avatar_b64 <> '')
  )
FROM user_profiles

UNION ALL

SELECT
  'household_members',
  COUNT(*),
  jsonb_build_object(
    'orphan_helper_id', (
      SELECT COUNT(*) FROM household_members hm
      LEFT JOIN user_profiles up ON up.id = hm.helper_id
      WHERE up.id IS NULL
    ),
    'orphan_household_id', (
      SELECT COUNT(*) FROM household_members hm
      LEFT JOIN households h ON h.id = hm.household_id
      WHERE h.id IS NULL
    ),
    'status_distribution', (
      SELECT jsonb_object_agg(status, cnt)
      FROM (SELECT status, COUNT(*) AS cnt FROM household_members GROUP BY status) s
    )
  )
FROM household_members

UNION ALL

SELECT
  'user_weekly_menus',
  COUNT(*),
  jsonb_build_object(
    'missing_algo_version', COUNT(*) FILTER (WHERE algo_version IS NULL OR algo_version = ''),
    'missing_cache_key', COUNT(*) FILTER (WHERE cache_key IS NULL OR cache_key = ''),
    'recent_7d_rows', COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')
  )
FROM user_weekly_menus

UNION ALL

SELECT
  'user_feedback_helper',
  COUNT(*),
  jsonb_build_object(
    'feedback_type_distribution', (
      SELECT jsonb_object_agg(feedback_type, cnt)
      FROM (SELECT feedback_type, COUNT(*) AS cnt FROM user_feedback_helper GROUP BY feedback_type) s
    ),
    'recent_7d_rows', COUNT(*) FILTER (WHERE created_at > now() - interval '7 days'),
    'orphan_dish_id', (
      SELECT COUNT(*) FROM user_feedback_helper f
      LEFT JOIN dishes d ON d.id = f.dish_id
      WHERE f.dish_id IS NOT NULL AND d.id IS NULL
    )
  )
FROM user_feedback_helper;

COMMIT;
