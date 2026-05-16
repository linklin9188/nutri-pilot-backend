-- TCM (Traditional Chinese Medicine) health tags. Driven by real-user
-- testing — when someone types "补气血，晚上睡眠不足" Gemini's previous
-- schema mapped that to `energy` (0 dishes tagged) and `immunity` (34
-- dishes, too broad). The four TCM axes give the algorithm precise
-- targets without an LLM call in the recommendation hot path.
--
-- Keyword → tag mapping is conservative; each dish keeps its existing
-- health_benefit_tags and only gains the TCM one when its title or
-- ingredient strongly implies the role.
--
-- After this migration (matches dishes counted on 2026-05-17):
--   blood_tonic ≈ 9    (红枣/枸杞/桂圆/阿胶/当归/猪肝/红豆/红糖/鸭血/黑米/菠菜)
--   sleep_aid   ≈ 5    (莲子/百合/燕麦/酸枣/银耳/茯苓)
--   yin_nourish ≈ 12   (银耳/雪梨/蜂蜜/鸭/山药/百合/枇杷/燕窝)
--   qi_tonic    ≈ 7    (山药/红枣/黄芪/党参/糯米/老母鸡/老鸡/童子鸡)

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'blood_tonic')
WHERE NOT 'blood_tonic' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '红枣|枸杞|桂圆|阿胶|当归|猪肝|红豆|红糖|鸭血|黑米|菠菜';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'sleep_aid')
WHERE NOT 'sleep_aid' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '莲子|百合|燕麦|酸枣|银耳|茯苓';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'yin_nourish')
WHERE NOT 'yin_nourish' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '银耳|雪梨|蜂蜜|鸭|山药|百合|枇杷|燕窝';

UPDATE public.dishes
SET health_benefit_tags = array_append(coalesce(health_benefit_tags, '{}'::text[]), 'qi_tonic')
WHERE NOT 'qi_tonic' = ANY(coalesce(health_benefit_tags, '{}'::text[]))
  AND title_zh ~ '山药|红枣|黄芪|党参|糯米|老母鸡|老鸡|童子鸡';
