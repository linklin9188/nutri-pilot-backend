-- 059_dishes_v3_metadata.sql
-- 工单：TELEPOT-20260521-003 §C
--
-- dishes 加 3 个 metadata 列让 Algorithm scoreDish 直接读，避免每次从 title_zh
-- grep 推断。Algorithm 073 §D 依赖。
--
-- 实查发现：dishes.oil_level **已存在**（前面某 migration 加过 / 仍 nullable）
-- → IF NOT EXISTS 自动 skip 该列，无副作用。其余两列新增。
--
-- 复合 index 加速 scoreDish (protein_main_class, oil_level, cooking_method)
-- 联合过滤场景。
--
-- 不变量自检：
--   #1 无 FK→auth.users
--   #2 dish_ids 未触
--   #6 dish.id 未触
--   单 BEGIN/COMMIT

BEGIN;

ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS protein_main_class   text,    -- red/white/seafood/veg/staple
  ADD COLUMN IF NOT EXISTS oil_level            text,    -- heavy/normal/light（已存在则 skip）
  ADD COLUMN IF NOT EXISTS cooking_method       text;    -- stirfry/steam/stew/cold/braised/grill/fry/other

CREATE INDEX IF NOT EXISTS idx_dishes_v3_meta
  ON dishes(protein_main_class, oil_level, cooking_method);

COMMIT;
