-- 076_dishes_add_title_translations.sql
-- 工单：TELEPOT-20260522-022 §A
-- 前置 Backend 022 §C：Gemini 翻译 348 dishes × 2 语言（zh-Hant + en）。
-- 本 migration 仅建列，数据由 Backend 022 跑 Gemini 填入。
--
-- UI 行为：title_zh_hant / title_en 为 NULL 时 fallback 到既有 title（简中）。
--
-- 不变量自检：
--   #1 无 FK 改动              #2 不涉 Gemini（仅建列；Backend 022 才调）
--   #3 Stripe 不动              #4 ALGO_VERSION 不动（UI display 优化，不动评分）
--   ADD COLUMN IF NOT EXISTS 保幂等

BEGIN;

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS title_zh_hant text,
  ADD COLUMN IF NOT EXISTS title_en      text;

COMMENT ON COLUMN dishes.title_zh_hant IS
  '繁體中文菜名 (HK / TW)，Backend 022 §C Gemini 翻译填入；NULL 时 UI fallback 到 title';

COMMENT ON COLUMN dishes.title_en IS
  'English dish name, Backend 022 §C Gemini translation; NULL 时 UI fallback 到 title';

COMMIT;
