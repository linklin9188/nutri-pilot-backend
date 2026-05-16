-- Untag 7 dishes that were is_vegan=true but contain animal products.
-- Caught during end-to-end testing of the vegetarian family persona:
-- the algorithm would have shown a fully-vegan family 肉末茄子,
-- 皮蛋拌豆腐, etc.
--
-- Manual triage of the 12 suspicious matches:
--   咸蛋黄煸苦瓜    contains salted egg yolk          → untag
--   蘑菇奶油意面    contains dairy cream              → untag
--   猪脚圈        is pork                          → untag
--   蚝油生菜       contains oyster sauce            → untag
--   奶油蘑菇汤      contains dairy cream             → untag
--   肉末茄子       contains minced meat              → untag
--   皮蛋拌豆腐      contains preserved duck egg      → untag
--   椰奶烤茄子      coconut milk = vegan             → keep
--   椰奶奇亚籽布丁    coconut milk = vegan            → keep
--   蓝莓豆奶昔      soy milk = vegan                → keep
--   鱼香茄子       'fish-fragrant' is a sauce style, no actual fish → keep
--   素蚝油生菜      vegan oyster sauce version       → keep
--
-- Applied to remote DB on 2026-05-16.

UPDATE public.dishes
SET is_vegan = false
WHERE title_zh IN (
  '咸蛋黄煸苦瓜',
  '蘑菇奶油意面',
  '猪脚圈',
  '蚝油生菜',
  '奶油蘑菇汤',
  '肉末茄子',
  '皮蛋拌豆腐'
);
