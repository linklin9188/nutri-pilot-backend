-- Wellness axes expansion. Real users phrase health needs across a wider
-- spectrum than the 4 TCM tonic axes — mood / anti-aging / beauty /
-- damp-clearing / anti-inflammation / eye-care / weight-loss / muscle
-- are all common asks. Each existing as a sparse health_benefit_tag
-- (or missing entirely for eye_care). This migration broadens them by
-- title keyword so the algorithm has enough candidates per axis to
-- actually rank meaningfully.
--
-- Counts after migration (verified 2026-05-17):
--   mood_boost        12 → 24   (+12)
--   anti_aging         2 → 32   (+30)
--   beauty            10 → 17   (+7)
--   anti_inflammation  7 → 14   (+7)
--   eye_care           0 → 15   (new axis)

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'mood_boost')
WHERE NOT 'mood_boost' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '巧克力|香蕉|三文鱼|燕麦|坚果|黑芝麻';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'anti_aging')
WHERE NOT 'anti_aging' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '蓝莓|坚果|紫薯|西兰花|番茄|牛油果|鳄梨';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'beauty')
WHERE NOT 'beauty' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '银耳|燕窝|桃胶|木瓜|牛油果|樱桃|雪梨|蜂蜜';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'anti_inflammation')
WHERE NOT 'anti_inflammation' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '三文鱼|姜黄|生姜|橄榄油|蓝莓|绿茶';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'eye_care')
WHERE NOT 'eye_care' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '枸杞|胡萝卜|菠菜|蓝莓|决明子|玉米|墨鱼';
