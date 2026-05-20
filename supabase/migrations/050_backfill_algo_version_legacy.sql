-- 050_backfill_algo_version_legacy.sql
-- P22 — backfill 337 历史 user_weekly_menus 行的 algo_version + cache_key
-- 工单：TELEPOT-20260520-066
--
-- Smell 4 已在 migration 024 给 user_weekly_menus 加了 algo_version + cache_key 两列。
-- 但 337/377 行历史数据这两列仍是 NULL（024 之前生成的菜单）。
-- useWeeklyMenu.ts 命中时把 NULL ≠ 当前 ALGO_VERSION 判 stale → silent regenerate。
-- 本 migration 把这 337 行显式标记为 'legacy_pre_v44'，让 Algorithm 端识别为
-- legacy → 触发主动迁移 (not silent regenerate)。
--
-- 实测验证（开工前）：
--   SELECT COUNT(*) FILTER (WHERE algo_version IS NULL OR cache_key IS NULL) → 337
--   SELECT COUNT(*) → 377
--   数字与 CEO 工单 100% 一致
--
-- 幂等保证：WHERE 子句过滤 IS NULL，重跑 0 行受影响。
--
-- 不变量自检：
--   #1 无 FK 改动
--   #4 不动 ALGO_VERSION（v43 保持，legacy_pre_v44 是 sentinel 字符串非真版本）
--   单 BEGIN/COMMIT 包裹

BEGIN;

UPDATE user_weekly_menus
SET algo_version = 'legacy_pre_v44',
    cache_key = 'legacy_no_cache_key'
WHERE algo_version IS NULL OR cache_key IS NULL;

COMMIT;
