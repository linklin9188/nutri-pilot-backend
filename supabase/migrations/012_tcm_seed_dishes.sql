-- 12 classic TCM-tonic dishes for the blood_tonic / sleep_aid /
-- yin_nourish / qi_tonic axes. Tagged so when a user types "补气血" or
-- "睡眠不足" the algorithm has real targets in the DB rather than
-- falling back to whatever happened to have 'immunity' / 'maintain'.
--
-- Each row carries description_zh (1 line of TCM rationale) so the
-- helper-side UI can explain why the dish was picked.
-- prep_steps_json / cook_steps_json / image_url / nutrition / xiaomei
-- flags are left NULL — backfilled by the existing seed scripts
-- (scripts/gen-dish-steps-claude.ts, backfill-dish-nutrition.ts,
-- backfill-xiaomei-compat.ts).
--
-- Applied to remote DB on 2026-05-17.

INSERT INTO public.dishes (
  id, title_zh, title_en, meal_type, course_type, main_ingredient,
  origin_cuisine, flavor_tags, health_benefit_tags, source, is_vegan,
  cook_time_min, description_zh
) VALUES
  (gen_random_uuid(), '当归生姜羊肉汤', 'Angelica Ginger Lamb Soup',
    'dinner', 'soup', 'lamb', 'northern',
    ARRAY['light','aromatic'],
    ARRAY['blood_tonic','qi_tonic','maintain','immunity'],
    'tcm_seed', false, 90, '《金匮要略》经典方，温中补血，宫寒体虚必备'),
  (gen_random_uuid(), '红枣桂圆莲子汤', 'Red Date Longan Lotus Seed Soup',
    'dinner', 'soup', 'other', 'cantonese',
    ARRAY['sweet','light'],
    ARRAY['blood_tonic','sleep_aid','qi_tonic','nourish','low_sodium'],
    'tcm_seed', true, 45, '补气血助眠经典甜汤，红枣桂圆补气，莲子安神'),
  (gen_random_uuid(), '猪肝菠菜汤', 'Pork Liver Spinach Soup',
    'dinner', 'soup', 'pork', 'cantonese',
    ARRAY['savory','light'],
    ARRAY['blood_tonic','high_protein','low_sodium'],
    'tcm_seed', false, 25, '铁元素双补，气血不足、贫血人群首选'),
  (gen_random_uuid(), '桂圆红枣茶', 'Longan Red Date Tea',
    'breakfast', 'soup', 'other', 'cantonese',
    ARRAY['sweet','light'],
    ARRAY['blood_tonic','qi_tonic','low_sodium'],
    'tcm_seed', true, 15, '日常补气血代茶饮，姨妈期 / 产后调理'),
  (gen_random_uuid(), '银耳百合雪梨汤', 'White Fungus Lily Pear Soup',
    'dinner', 'soup', 'other', 'cantonese',
    ARRAY['sweet','light'],
    ARRAY['yin_nourish','sleep_aid','immunity','low_sodium'],
    'tcm_seed', true, 50, '秋燥润肺安神，咳嗽干燥失眠对症'),
  (gen_random_uuid(), '黄芪炖鸡汤', 'Astragalus Stewed Chicken',
    'dinner', 'soup', 'chicken', 'northern',
    ARRAY['savory','light'],
    ARRAY['qi_tonic','blood_tonic','immunity','high_protein'],
    'tcm_seed', false, 90, '补气提神经典方，黄芪益气，鸡肉滋补'),
  (gen_random_uuid(), '党参枸杞乌鸡汤', 'Codonopsis Goji Black Chicken Soup',
    'dinner', 'soup', 'chicken', 'cantonese',
    ARRAY['savory','light'],
    ARRAY['qi_tonic','blood_tonic','yin_nourish','immunity'],
    'tcm_seed', false, 120, '气血双补名方，体弱、产后、术后皆宜'),
  (gen_random_uuid(), '山药红枣排骨汤', 'Yam Red Date Pork Rib Soup',
    'dinner', 'soup', 'pork', 'cantonese',
    ARRAY['savory','light'],
    ARRAY['qi_tonic','blood_tonic','maintain','high_protein'],
    'tcm_seed', false, 75, '健脾益气，山药补脾，红枣补血'),
  (gen_random_uuid(), '红糖姜枣茶', 'Brown Sugar Ginger Date Tea',
    'breakfast', 'soup', 'other', 'northern',
    ARRAY['sweet','aromatic'],
    ARRAY['blood_tonic','qi_tonic','low_sodium'],
    'tcm_seed', true, 10, '宫寒、姨妈期暖宫驱寒，日常代茶饮'),
  (gen_random_uuid(), '酸枣仁百合茶', 'Sour Jujube Lily Bulb Tea',
    'dinner', 'soup', 'other', 'cantonese',
    ARRAY['sweet','light'],
    ARRAY['sleep_aid','yin_nourish','low_sodium','low_sugar'],
    'tcm_seed', true, 15, '中医《伤寒论》安神方，失眠、多梦、心烦'),
  (gen_random_uuid(), '鸭血粉丝汤', 'Duck Blood Vermicelli Soup',
    'lunch', 'soup', 'other', 'jiangnan',
    ARRAY['savory','aromatic'],
    ARRAY['blood_tonic','high_protein','immunity'],
    'tcm_seed', false, 30, '南京经典，鸭血富含铁，气血不足首选'),
  (gen_random_uuid(), '阿胶红枣膏', 'Donkey-hide Gelatin Date Jelly',
    'breakfast', 'dessert', 'other', 'northern',
    ARRAY['sweet'],
    ARRAY['blood_tonic','yin_nourish','nourish','beauty'],
    'tcm_seed', false, 5, '阿胶补血圣品，搭配红枣每日一勺')
ON CONFLICT DO NOTHING;
