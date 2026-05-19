-- 024_add_algo_version.sql
-- 修复 Smell 4 + UI R3：为 user_weekly_menus 添加两个缓存失效信号列，
-- 一并解决 (a) 算法版本失步 (b) 非算法维度（cuisine/eating/intent/dpd）变动后
-- 旧菜单被错误命中的问题。替代当前依赖两个 localStorage sentinel
-- (`weekly_menu_algo_ver` + `weekly_menu_db_cache_key`) 的手动失效方案。
--
-- 影响：
--   - 表：user_weekly_menus
--   - 新增列：
--       * algo_version text （nullable，向后兼容老行）—— 等价 useWeeklyMenu.ts 的 ALGO_VERSION
--       * cache_key    text （nullable，向后兼容老行）—— 编码 cuisine/eating/intent/dpd 等非算法维度
--   - 后续后端/前端在 upsert 时同时写入这两个字段
--   - 读取时按 (user_id, week_start, algo_version, cache_key) 命中缓存，
--     任一列与当前 bundle 状态不匹配 → 视为 miss，重新生成
--
-- 决策依据：
--   两列都是 user_weekly_menus 同一张表的 nullable text、都是"缓存失效信号"语义，
--   物理上一起加；分两次 migration 会让前端 PR 也得拆两次，徒增 ops 复杂度。
--   （Architect 推荐方案 X，CEO 2026-05-19 确认。）
--
-- 注意：本迁移仅加列，不加约束、不回填、不建索引，保持小批量原则。
--      上线后所有现存行两列均为 NULL，前端将判 stale 重新生成，是预期行为。

ALTER TABLE user_weekly_menus
  ADD COLUMN IF NOT EXISTS algo_version text,
  ADD COLUMN IF NOT EXISTS cache_key    text;
