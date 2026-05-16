-- Batch-tag existing dishes with low_sodium / low_sugar / low_purine.
-- Before: 2 low_sugar, 6 low_sodium, 7 low_purine across ~500 dishes — too
-- sparse for the algorithm's healthPrefs.preferLowSodium / preferLowSugar /
-- avoidHighPurine logic to actually help 高血压/糖尿病/痛风 users.
--
-- Rule basis (conservative — sanity-checked against title + flavor + ingredient):
--   low_sodium  : NOT salty/savory flavor + light/sweet/sour AND no cured/salt keywords
--   low_sugar   : NOT dessert + NOT sweet flavor + no sugar keywords
--   low_purine  : NOT seafood main_ingredient + NOT soup + no organ/broth keywords
--
-- After this migration:
--   low_sodium ≈ 117  (was 6)
--   low_sugar  ≈ 410  (was 2)
--   low_purine ≈ 403  (was 7)
--
-- Applied to remote DB on 2026-05-16.

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'low_sodium')
WHERE NOT 'low_sodium' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND NOT 'salty' = ANY(coalesce(flavor_tags, '{}'::text[]))
  AND NOT 'savory' = ANY(coalesce(flavor_tags, '{}'::text[]))
  AND ('light' = ANY(flavor_tags) OR 'sweet' = ANY(flavor_tags) OR 'sour' = ANY(flavor_tags))
  AND title_zh !~ '咸|腌|酱|卤|腊|熏|酸菜|梅菜|榨菜|泡菜|火腿|培根|香肠|腊肠|腊肉|皮蛋|虾酱|虾米|鱼露|鱼酱';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'low_sugar')
WHERE NOT 'low_sugar' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND course_type != 'dessert'
  AND NOT 'sweet' = ANY(coalesce(flavor_tags, '{}'::text[]))
  AND title_zh !~ '糖|蜜|甜|红烧|冰糖|布丁|蛋糕|冰淇淋|雪糕|巧克力';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'low_purine')
WHERE NOT 'low_purine' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND (main_ingredient IS NULL
       OR main_ingredient NOT IN ('seafood','fish','shrimp','crab','shellfish','squid','scallop',
                                   'clam','lobster','salmon','tuna','cod','hairtail','seabass','oyster'))
  AND course_type != 'soup'
  AND title_zh !~ '内脏|肝|肾|心|脑|肠|胗|高汤|骨汤|火锅|麻辣烫|啤酒|沙丁鱼|凤尾鱼';
