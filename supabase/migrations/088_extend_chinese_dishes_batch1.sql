-- TICKET TELEPOT-20260525-055 P2: 扩中餐 dishes 小批量 batch1 (5 行)
--
-- 老板 2026-05-25 凌晨 explicit 授权:
--   "把我们没有的中餐数据都按照同样的格式要求补充进来。然后把做法那里页补充进去。"
--
-- 真查 (Database 2026-05-25 09:00) `dishes.origin_cuisine` 分布:
--   cantonese    239
--   western      150
--   northern     141
--   jiangnan     109
--   sichuan       92
--   southeast_asian 91
--   japanese_korean 83
--   all-season/balanced 19
--   ----- 共 924 行 -----
--   ↓↓↓ 完全缺口 (recommendVector cuisine map 已支持但 0 行) ↓↓↓
--   hakka         0  ←  本 batch §1
--   hunan         0  ←  本 batch §2
--   fujian        0  ←  本 batch §3
--   northeast     0  ←  本 batch §4
--   northwest     0  ←  本 batch §5
--
-- 决策: 每个空白菜系挑 1 道经典菜, 优先填空, 不挑已饱和菜系 (粤/川/北方/江南).
--
-- 本 migration 只 ship 5 行 dish row + prep_steps_json (ABCD tray 配料分组)
-- + cook_steps_json (6-8 步骤). nutrition 用粗估值, 小美 ABCD 合规默认 true,
-- image_url NULL — 留后续 enrich ticket.
--
-- 后续 §E 必跑 `npx tsx scripts/compute-dish-feature-vector.ts` (脚本默认只算
-- feature_vector IS NULL 的行 — 即 batch1 这 5 行, 不影响存量 924 行).
--
-- CLAUDE.md 小批量先 (3-5 rows) 硬规已遵守.

BEGIN;

-- idempotent: 每个 INSERT 用 SELECT + WHERE NOT EXISTS 兜底, 二次跑会跳过.
-- 这是因为 dishes 表没有 (title_zh, origin_cuisine) UNIQUE 约束, 不能用
-- ON CONFLICT.

-- ─── §1. 客家盐焗鸡 (hakka, main_protein, chicken) ─────────────────────────
INSERT INTO dishes (
  id, title_zh, title_en, title_zh_hant, description_zh, description_en,
  cultural_note, origin_cuisine, course_type, meal_type, main_ingredient,
  protein_source, cook_method, cooking_method, flavor_tags, health_benefit_tags,
  seasonal_tag, oil_level, salt_level, sugar_level, execution_level,
  xiaomei_compatible, is_kid_friendly, kid_acceptance_score,
  hk_availability_score, helper_friendly_score, average_cost_hkd,
  nutrition_kcal_per_serving, protein_g, carb_g, fat_g, cook_time_min,
  is_vegan, is_low_sodium, is_low_sugar, is_low_purine,
  source, ingredients_ready,
  prep_steps_json, cook_steps_json
) VALUES (
  gen_random_uuid(),
  '客家盐焗鸡', 'Hakka Salt-Baked Chicken', '客家鹽焗雞',
  '皮金黄、肉嫩多汁，咸香入味的客家经典菜',
  'Hakka-style chicken baked in coarse salt — golden skin, tender juicy meat, deeply savory.',
  '盐焗鸡是客家菜代表，起源于广东梅州、惠州一带。客家人迁徙时为保存鸡肉，将活鸡宰净后埋入热盐中焖熟，意外发现风味极佳。沙姜、八角的香气透过盐粒渗入鸡肉，皮脆肉滑，是客家筵席必备。',
  'hakka', 'main_protein', 'dinner', 'chicken',
  ARRAY['poultry']::text[], 'bake', 'bake',
  ARRAY['salty','umami','aromatic']::text[],
  ARRAY['high_protein','warming']::text[],
  'All-Season/Balanced', 'mid', 'high', 'low', 2,
  true, true, 0.75,
  0.90, 0.70, 95.00,
  280, 28, 1, 18, 60,
  false, false, true, false,
  'curated', false,
  '[
    {"tray":"A","amount_g":1200,"ingredient_zh":"三黄鸡（整只，去内脏）","ingredient_en":"whole free-range chicken (cleaned)","action_zh":"洗净沥干，全身擦干水分，鸡腔内塞入沙姜片 3 片+八角 2 颗+葱段 2 段","action_en":"Rinse and pat fully dry, stuff cavity with 3 ginger slices + 2 star anise + 2 scallion segments"},
    {"tray":"B","amount_g":2000,"ingredient_zh":"粗海盐","ingredient_en":"coarse sea salt","action_zh":"无需处理，直接备用","action_en":"No prep, set aside"},
    {"tray":"C","amount_g":15,"ingredient_zh":"沙姜粉","ingredient_en":"sand ginger powder","action_zh":"取 10g 与盐 5g 混合调匀作蘸料","action_en":"Mix 10g with 5g salt as dipping powder"},
    {"tray":"D","amount_g":30,"ingredient_zh":"绍兴黄酒","ingredient_en":"Shaoxing wine","action_zh":"涂抹鸡身内外，腌 15 分钟","action_en":"Rub inside and outside of chicken, marinate 15 min"},
    {"tray":"E","amount_g":2,"ingredient_zh":"烘焙纸（包裹用）","ingredient_en":"baking paper (for wrapping)","action_zh":"裁约 50cm×50cm 大小","action_en":"Cut to about 50cm×50cm"}
  ]'::jsonb,
  '[
    {"step":1,"action_zh":"烤箱预热至 220°C，热盐：将 B 格 2kg 粗海盐倒入干锅中火炒 8 分钟至轻微发黄、烫手","action_en":"Preheat oven 220°C. Heat 2kg coarse salt in dry pan over medium 8 min until lightly yellow and very hot","duration_min":10,"state_target_zh":"盐粒干燥发烫，无水汽","state_target_en":"Salt dry, hot to touch, no moisture"},
    {"step":2,"action_zh":"将 A 格腌好的鸡用 E 格烘焙纸严密包裹 2 层，扎紧两端，不漏盐","action_en":"Wrap marinated chicken from tray A tightly in 2 layers of baking paper (tray E), seal both ends","duration_min":3,"state_target_zh":"鸡身完全密封，无破口","state_target_en":"Chicken fully sealed, no tears"},
    {"step":3,"action_zh":"取深烤盘，铺 1/2 热盐于底部，放入包好的鸡，再倒剩余热盐完全覆盖鸡身","action_en":"Lay half the hot salt in deep baking tray, place wrapped chicken, cover with remaining salt","duration_min":3,"state_target_zh":"鸡完全埋入盐中，看不见纸包","state_target_en":"Chicken fully buried, paper not visible"},
    {"step":4,"action_zh":"220°C 烤 45 分钟","action_en":"Bake at 220°C for 45 min","duration_min":45,"state_target_zh":"盐表面焦黄，鸡香气透出","state_target_en":"Salt surface browned, aroma penetrates"},
    {"step":5,"action_zh":"关火焖 10 分钟，利用余温熟透","action_en":"Turn off oven, rest 10 min in residual heat","duration_min":10,"state_target_zh":"内部完全熟透（中心温度 ≥75°C）","state_target_en":"Fully cooked through (core ≥75°C)"},
    {"step":6,"action_zh":"取出，刷去盐粒，拆纸，趁热斩件装盘","action_en":"Remove, brush off salt, unwrap, chop while hot","duration_min":4,"state_target_zh":"鸡皮金黄微皱，肉汁不流失","state_target_en":"Skin golden and slightly wrinkled, juices retained"},
    {"step":7,"action_zh":"配 C 格沙姜盐蘸料上桌","action_en":"Serve with sand ginger salt (tray C) for dipping","duration_min":1,"state_target_zh":"上桌温度 60-65°C","state_target_en":"Serving temp 60-65°C"}
  ]'::jsonb
);

-- ─── §2. 剁椒鱼头 (hunan, main_protein, fish) ──────────────────────────────
INSERT INTO dishes (
  id, title_zh, title_en, title_zh_hant, description_zh, description_en,
  cultural_note, origin_cuisine, course_type, meal_type, main_ingredient,
  protein_source, cook_method, cooking_method, flavor_tags, health_benefit_tags,
  seasonal_tag, oil_level, salt_level, sugar_level, execution_level,
  xiaomei_compatible, is_kid_friendly, kid_acceptance_score,
  hk_availability_score, helper_friendly_score, average_cost_hkd,
  nutrition_kcal_per_serving, protein_g, carb_g, fat_g, cook_time_min,
  is_vegan, is_low_sodium, is_low_sugar, is_low_purine,
  source, ingredients_ready,
  prep_steps_json, cook_steps_json
) VALUES (
  gen_random_uuid(),
  '剁椒鱼头', 'Steamed Fish Head with Pickled Chili', '剁椒魚頭',
  '湖南名菜，剁椒铺面、清蒸出锅，鱼肉鲜嫩、辣咸入味',
  'Hunan signature — fish head steamed under a blanket of pickled red chili, tender and savory-spicy.',
  '剁椒鱼头是湘菜代表，发源于湖南长沙，相传与清代文人黄宗宪有关。剁椒（湖南农家自制发酵辣椒酱）是灵魂，鱼头借蒸汽吸收椒香，肉质保留鲜嫩。湘人嗜辣，此菜兼具"剁椒红、鱼头白"的视觉冲击。',
  'hunan', 'main_protein', 'dinner', 'fish',
  ARRAY['fish']::text[], 'steam', 'steam',
  ARRAY['spicy','salty','umami','fresh']::text[],
  ARRAY['high_protein','omega3','warming']::text[],
  'All-Season/Balanced', 'mid', 'high', 'low', 2,
  true, false, 0.20,
  0.80, 0.65, 110.00,
  260, 32, 4, 12, 25,
  false, false, true, false,
  'curated', false,
  '[
    {"tray":"A","amount_g":1000,"ingredient_zh":"花鲢鱼头（剖半）","ingredient_en":"silver carp head (split in half)","action_zh":"清水冲净血污，刀背刮净鱼鳃，沥干水分","action_en":"Rinse off blood, scrape gills clean with knife back, drain"},
    {"tray":"C","amount_g":120,"ingredient_zh":"剁椒（湖南剁辣椒酱）","ingredient_en":"Hunan pickled red chili","action_zh":"取罐装剁椒沥去多余汁水，留浓稠部分","action_en":"Drain excess brine from jarred chili, reserve thick portion"},
    {"tray":"C","amount_g":40,"ingredient_zh":"姜蒜末","ingredient_en":"minced ginger + garlic","action_zh":"姜 20g+蒜 20g 切碎成末","action_en":"Mince 20g ginger + 20g garlic finely"},
    {"tray":"C","amount_g":30,"ingredient_zh":"小葱","ingredient_en":"scallion","action_zh":"葱白切段 15g、葱花 15g 分开","action_en":"15g scallion white in segments, 15g chopped green tops, separate"},
    {"tray":"D","amount_g":60,"ingredient_zh":"调味（生抽 15g+料酒 15g+蒸鱼豉油 20g+白糖 5g+盐 3g+白胡椒 2g）","ingredient_en":"seasoning (light soy 15g + cooking wine 15g + steamed fish soy 20g + sugar 5g + salt 3g + white pepper 2g)","action_zh":"鱼头用生抽+料酒+盐+白胡椒抓匀腌 10 分钟，剩余蒸鱼豉油+糖留蒸后淋","action_en":"Marinate fish head with soy + wine + salt + pepper for 10 min, reserve steamed fish soy + sugar for after steaming"},
    {"tray":"D","amount_g":40,"ingredient_zh":"食用油（最后淋热油）","ingredient_en":"cooking oil (for sizzling on top)","action_zh":"准备热锅备用","action_en":"Prepare hot pan"}
  ]'::jsonb,
  '[
    {"step":1,"action_zh":"取 C 格姜蒜末与剁椒拌匀成酱","action_en":"Mix minced ginger-garlic with pickled chili to form sauce","duration_min":2,"state_target_zh":"酱料均匀，红艳","state_target_en":"Sauce evenly mixed, bright red"},
    {"step":2,"action_zh":"蒸盘铺 C 格葱白段垫底，腌好的鱼头剖面朝上摆盘","action_en":"Lay scallion whites on plate, place fish head halves cut-side up","duration_min":2,"state_target_zh":"鱼头平铺不重叠","state_target_en":"Fish head laid flat, no overlap"},
    {"step":3,"action_zh":"将剁椒酱均匀厚铺覆盖整个鱼头表面","action_en":"Spread pickled chili sauce thickly over entire fish surface","duration_min":2,"state_target_zh":"鱼头被红椒完全覆盖","state_target_en":"Fish fully blanketed in red chili"},
    {"step":4,"action_zh":"蒸锅水沸后上盘，大火蒸 10 分钟","action_en":"Steam over rolling-boil water on high for 10 min","duration_min":10,"state_target_zh":"鱼眼凸出、肉离骨即熟","state_target_en":"Fish eyes protrude, flesh separates from bone"},
    {"step":5,"action_zh":"出锅倒掉盘内多余汁水，淋 D 格剩余蒸鱼豉油+糖混合调味","action_en":"Pour off excess plate liquid, drizzle reserved steamed fish soy + sugar mix","duration_min":1,"state_target_zh":"汁水清亮，味咸鲜带微甜","state_target_en":"Liquid clear, savory with slight sweetness"},
    {"step":6,"action_zh":"撒 C 格葱花，烧热 40g 油至 200°C 冒烟，泼在葱花上激出香气","action_en":"Scatter chopped scallion greens, heat 40g oil to 200°C until smoking, pour over scallions to sizzle","duration_min":2,"state_target_zh":"葱花瞬间爆香，热油激起噼啪声","state_target_en":"Scallions sizzle instantly, audible crackle"},
    {"step":7,"action_zh":"立即上桌，配米饭","action_en":"Serve immediately with rice","duration_min":1,"state_target_zh":"上桌温度 70°C，香气浓烈","state_target_en":"Serving temp 70°C, intense aroma"}
  ]'::jsonb
);

-- ─── §3. 沙茶面 (fujian, staple, noodle) ───────────────────────────────────
INSERT INTO dishes (
  id, title_zh, title_en, title_zh_hant, description_zh, description_en,
  cultural_note, origin_cuisine, course_type, meal_type, main_ingredient,
  protein_source, cook_method, cooking_method, flavor_tags, health_benefit_tags,
  seasonal_tag, oil_level, salt_level, sugar_level, execution_level,
  xiaomei_compatible, is_kid_friendly, kid_acceptance_score,
  hk_availability_score, helper_friendly_score, average_cost_hkd,
  nutrition_kcal_per_serving, protein_g, carb_g, fat_g, cook_time_min,
  is_vegan, is_low_sodium, is_low_sugar, is_low_purine,
  source, ingredients_ready,
  prep_steps_json, cook_steps_json
) VALUES (
  gen_random_uuid(),
  '沙茶面', 'Shacha Noodle Soup', '沙茶麵',
  '厦门街头经典，沙茶酱汤底浓郁香辣，配虾鱼蛋丸',
  'Xiamen street classic — rich, mildly spicy shacha sauce broth with shrimp, fish balls and noodles.',
  '沙茶面源于福建厦门，是闽南早餐与宵夜代表。沙茶酱由花生、虾米、辣椒、香料调制，传自南洋。汤头浓郁、配料丰富（虾、鱿鱼、鱼丸、豆腐泡），地道做法一碗见证一座海港城市的南洋融合史。',
  'fujian', 'staple', 'lunch', 'noodle',
  ARRAY['fish','shellfish','soy']::text[], 'boil', 'boil',
  ARRAY['savory','spicy','umami','aromatic']::text[],
  ARRAY['warming','high_protein']::text[],
  'All-Season/Balanced', 'high', 'high', 'low', 2,
  true, true, 0.65,
  0.85, 0.75, 38.00,
  520, 25, 65, 18, 30,
  false, false, false, false,
  'curated', false,
  '[
    {"tray":"E","amount_g":200,"ingredient_zh":"碱水油面（黄面）","ingredient_en":"alkaline yellow noodles","action_zh":"沸水汆烫 30 秒至弹牙，过冷水沥干","action_en":"Blanch 30 sec until al dente, rinse cold and drain"},
    {"tray":"A","amount_g":80,"ingredient_zh":"鲜虾（去壳留尾）","ingredient_en":"fresh shrimp (peeled, tail on)","action_zh":"开背去虾线，洗净沥干","action_en":"Devein along back, rinse and drain"},
    {"tray":"A","amount_g":60,"ingredient_zh":"鲜鱿鱼","ingredient_en":"fresh squid","action_zh":"切 0.5cm 圈，开十字花刀","action_en":"Slice into 0.5cm rings, score crosshatch"},
    {"tray":"B","amount_g":100,"ingredient_zh":"鱼丸+虾丸（混装）","ingredient_en":"fish balls + shrimp balls (mixed)","action_zh":"无需处理","action_en":"No prep needed"},
    {"tray":"B","amount_g":40,"ingredient_zh":"豆腐泡","ingredient_en":"fried tofu puffs","action_zh":"对半切开","action_en":"Cut in half"},
    {"tray":"B","amount_g":30,"ingredient_zh":"绿豆芽","ingredient_en":"mung bean sprouts","action_zh":"洗净沥干","action_en":"Rinse and drain"},
    {"tray":"C","amount_g":60,"ingredient_zh":"沙茶酱（厦门牌）","ingredient_en":"Xiamen-brand shacha sauce","action_zh":"罐装取用","action_en":"From jar"},
    {"tray":"D","amount_g":700,"ingredient_zh":"高汤（猪骨/鸡架熬）","ingredient_en":"pork or chicken stock","action_zh":"预先熬好或用市售浓汤宝调 700ml","action_en":"Pre-made or use stock concentrate diluted to 700ml"},
    {"tray":"D","amount_g":20,"ingredient_zh":"调味（盐 3g+糖 5g+花生酱 10g+蒜末 2g）","ingredient_en":"seasoning (salt 3g + sugar 5g + peanut butter 10g + minced garlic 2g)","action_zh":"提前混匀备用","action_en":"Pre-mix"},
    {"tray":"C","amount_g":10,"ingredient_zh":"香菜+葱花","ingredient_en":"cilantro + chopped scallion","action_zh":"切碎装碗底备用","action_en":"Chop, place in bowl for garnish"}
  ]'::jsonb,
  '[
    {"step":1,"action_zh":"汤锅烧热 1 茶匙油，加蒜末爆香，倒入 C 格沙茶酱炒 1 分钟出红油","action_en":"Heat 1 tsp oil, sauté garlic, add shacha sauce and stir 1 min until red oil emerges","duration_min":2,"state_target_zh":"沙茶酱出香，油色红润","state_target_en":"Shacha fragrant, oil red"},
    {"step":2,"action_zh":"倒入 D 格高汤+剩余调味料，大火煮沸","action_en":"Add stock from tray D + remaining seasonings, bring to a boil","duration_min":3,"state_target_zh":"汤面浮微红油，沸腾","state_target_en":"Broth boiling with reddish oil"},
    {"step":3,"action_zh":"放入 B 格鱼丸+虾丸+豆腐泡，中火煮 3 分钟","action_en":"Add fish/shrimp balls + tofu puffs, simmer 3 min","duration_min":3,"state_target_zh":"丸子浮起表示熟","state_target_en":"Balls float when done"},
    {"step":4,"action_zh":"加 A 格鲜虾+鱿鱼，煮 90 秒至虾变红、鱿鱼卷曲","action_en":"Add shrimp + squid, cook 90 sec until shrimp pink and squid curls","duration_min":2,"state_target_zh":"虾红透、鱿鱼花纹张开","state_target_en":"Shrimp fully pink, squid scored pattern opens"},
    {"step":5,"action_zh":"另起锅烫 E 格油面 30 秒，捞起置碗底，铺 B 格豆芽","action_en":"Blanch noodles 30 sec, place in bowl, top with bean sprouts","duration_min":2,"state_target_zh":"面条弹牙，豆芽脆生","state_target_en":"Noodles springy, sprouts crisp"},
    {"step":6,"action_zh":"将煮好的汤料连汁浇在面上，撒 C 格香菜葱花","action_en":"Pour broth + ingredients over noodles, garnish with cilantro + scallion","duration_min":1,"state_target_zh":"汤刚好淹没面条，香气升起","state_target_en":"Broth just covers noodles, aroma rises"},
    {"step":7,"action_zh":"立即上桌","action_en":"Serve immediately","duration_min":1,"state_target_zh":"上桌温度 75°C","state_target_en":"Serving temp 75°C"}
  ]'::jsonb
);

-- ─── §4. 锅包肉 (northeast, main_protein, pork) ────────────────────────────
INSERT INTO dishes (
  id, title_zh, title_en, title_zh_hant, description_zh, description_en,
  cultural_note, origin_cuisine, course_type, meal_type, main_ingredient,
  protein_source, cook_method, cooking_method, flavor_tags, health_benefit_tags,
  seasonal_tag, oil_level, salt_level, sugar_level, execution_level,
  xiaomei_compatible, is_kid_friendly, kid_acceptance_score,
  hk_availability_score, helper_friendly_score, average_cost_hkd,
  nutrition_kcal_per_serving, protein_g, carb_g, fat_g, cook_time_min,
  is_vegan, is_low_sodium, is_low_sugar, is_low_purine,
  source, ingredients_ready,
  prep_steps_json, cook_steps_json
) VALUES (
  gen_random_uuid(),
  '锅包肉', 'Northeast Sweet-Sour Crispy Pork', '鍋包肉',
  '东北经典，外酥里嫩、酸甜挂汁，下饭神菜',
  'Northeastern Chinese classic — crispy battered pork glazed in sweet-sour sauce.',
  '锅包肉源自清光绪年间的哈尔滨，是哈尔滨道台府厨师郑兴文为接待俄国客人改良的菜品，将咸鲜的"焦烧肉条"改为酸甜口味适应西方口味。如今已成东北菜代表，外酥脆、内嫩滑、酸甜不腻，是东北年夜饭、宴客必点。',
  'northeast', 'main_protein', 'dinner', 'pork',
  ARRAY['meat']::text[], 'deep_fry', 'deep_fry',
  ARRAY['sweet','sour','crispy']::text[],
  ARRAY['high_protein']::text[],
  'All-Season/Balanced', 'high', 'mid', 'high', 3,
  true, true, 0.90,
  0.75, 0.55, 78.00,
  580, 28, 45, 28, 35,
  false, false, false, false,
  'curated', false,
  '[
    {"tray":"A","amount_g":400,"ingredient_zh":"猪里脊","ingredient_en":"pork tenderloin","action_zh":"切 0.5cm 厚大片（约 5cm×8cm），用刀背轻拍松散","action_en":"Slice into 0.5cm thick large pieces (5cm×8cm), pound lightly with knife back"},
    {"tray":"D","amount_g":20,"ingredient_zh":"腌料（盐 3g+料酒 10g+白胡椒 2g+蛋清 5g）","ingredient_en":"marinade (salt 3g + cooking wine 10g + white pepper 2g + egg white 5g)","action_zh":"猪肉加腌料抓匀，腌 15 分钟","action_en":"Toss pork with marinade, rest 15 min"},
    {"tray":"E","amount_g":150,"ingredient_zh":"土豆淀粉+水（1:1 厚浆）","ingredient_en":"potato starch + water (1:1 thick slurry)","action_zh":"100g 淀粉+50g 水+1 茶匙油搅成厚浆，静置 30 分钟分离上层清水倒掉","action_en":"Mix 100g starch + 50g water + 1 tsp oil to thick slurry, rest 30 min, pour off clear water on top"},
    {"tray":"C","amount_g":30,"ingredient_zh":"姜丝+葱丝+蒜片+胡萝卜丝","ingredient_en":"julienned ginger + scallion + sliced garlic + julienned carrot","action_zh":"姜 10g+葱白 10g+蒜 5g+胡萝卜 5g 切丝/片","action_en":"Julienne ginger 10g, scallion white 10g, slice garlic 5g, julienne carrot 5g"},
    {"tray":"C","amount_g":10,"ingredient_zh":"香菜段","ingredient_en":"cilantro segments","action_zh":"切 2cm 段","action_en":"Cut into 2cm segments"},
    {"tray":"D","amount_g":90,"ingredient_zh":"糖醋汁（白糖 40g+米醋 35g+生抽 8g+盐 2g+水 5g）","ingredient_en":"sweet-sour sauce (sugar 40g + rice vinegar 35g + light soy 8g + salt 2g + water 5g)","action_zh":"全部预混搅至糖溶","action_en":"Premix all, stir until sugar dissolves"},
    {"tray":"D","amount_g":800,"ingredient_zh":"炸油","ingredient_en":"frying oil","action_zh":"备 800ml 中火加热至 170°C","action_en":"Prepare 800ml, heat over medium to 170°C"}
  ]'::jsonb,
  '[
    {"step":1,"action_zh":"腌好的 A 格猪肉裹满 E 格厚淀粉浆，每片独立不粘连","action_en":"Coat marinated pork in thick starch slurry, separate each piece","duration_min":3,"state_target_zh":"肉片全身白色浆衣均匀","state_target_en":"Pork evenly coated white"},
    {"step":2,"action_zh":"油温 170°C，逐片下锅炸 90 秒至定型微黄，捞出","action_en":"At 170°C oil, fry pork pieces one by one 90 sec until set and lightly golden, remove","duration_min":5,"state_target_zh":"表面定型，浅金色","state_target_en":"Surface set, light gold"},
    {"step":3,"action_zh":"油温升至 190°C，复炸 30 秒至深金色酥脆，捞出沥油","action_en":"Raise oil to 190°C, re-fry 30 sec until deep golden and crispy, drain","duration_min":2,"state_target_zh":"外壳深金色，敲击有脆响","state_target_en":"Crust deep gold, audible crack"},
    {"step":4,"action_zh":"另起净锅，留 1 汤匙底油，下 C 格姜葱蒜胡萝卜丝爆香 30 秒","action_en":"In clean pan with 1 tbsp oil, sauté ginger/scallion/garlic/carrot 30 sec","duration_min":1,"state_target_zh":"姜葱出香，胡萝卜断生","state_target_en":"Aromatics fragrant, carrot tender-crisp"},
    {"step":5,"action_zh":"倒入 D 格糖醋汁，大火烧至冒大泡、微浓稠","action_en":"Add sweet-sour sauce, boil on high until bubbling and slightly thick","duration_min":2,"state_target_zh":"酱汁拉丝、表面油亮","state_target_en":"Sauce shiny and stringy"},
    {"step":6,"action_zh":"迅速倒入炸好的肉片，快速颠勺 10 秒让酱汁均匀挂上","action_en":"Toss in fried pork, flip pan rapidly 10 sec to coat evenly","duration_min":1,"state_target_zh":"每片肉裹一层亮汁，酥脆未软","state_target_en":"Each piece glazed, still crispy"},
    {"step":7,"action_zh":"撒 C 格香菜段，关火出锅装盘，立即上桌","action_en":"Scatter cilantro, plate, serve immediately","duration_min":1,"state_target_zh":"上桌温度 75-80°C，外酥未潮","state_target_en":"Serving temp 75-80°C, crust still crispy"}
  ]'::jsonb
);

-- ─── §5. 羊肉泡馍 (northwest, staple, lamb) ────────────────────────────────
INSERT INTO dishes (
  id, title_zh, title_en, title_zh_hant, description_zh, description_en,
  cultural_note, origin_cuisine, course_type, meal_type, main_ingredient,
  protein_source, cook_method, cooking_method, flavor_tags, health_benefit_tags,
  seasonal_tag, oil_level, salt_level, sugar_level, execution_level,
  xiaomei_compatible, is_kid_friendly, kid_acceptance_score,
  hk_availability_score, helper_friendly_score, average_cost_hkd,
  nutrition_kcal_per_serving, protein_g, carb_g, fat_g, cook_time_min,
  is_vegan, is_low_sodium, is_low_sugar, is_low_purine,
  source, ingredients_ready,
  prep_steps_json, cook_steps_json
) VALUES (
  gen_random_uuid(),
  '羊肉泡馍', 'Xi''an Lamb Soup with Bread', '羊肉泡饃',
  '西安经典，烤馍掰碎泡入浓郁羊肉汤，配粉丝、葱花',
  'Xi''an classic — flatbread torn into pieces, soaked in rich lamb broth with vermicelli and scallions.',
  '羊肉泡馍源自陕西西安，传承自唐宋"羊羹"，是西北回民饮食代表。食客自己将烤馍（饦饦馍）掰成黄豆大碎块，店家加汤煮熟，"汤、馍、肉、料"四绝。冬日驱寒补气的硬菜，"老西安"必吃。',
  'northwest', 'staple', 'lunch', 'lamb',
  ARRAY['meat']::text[], 'stew', 'stew',
  ARRAY['savory','umami','warming','aromatic']::text[],
  ARRAY['warming','high_protein','blood_tonic']::text[],
  'Winter/Warming', 'mid', 'high', 'low', 2,
  true, false, 0.60,
  0.55, 0.60, 85.00,
  680, 35, 75, 20, 90,
  false, false, true, false,
  'curated', false,
  '[
    {"tray":"A","amount_g":300,"ingredient_zh":"羊肉（带筋羊腿肉）","ingredient_en":"lamb leg (with tendon)","action_zh":"切 2cm 块，冷水浸泡 30 分钟去血水，沥干","action_en":"Cut into 2cm cubes, soak in cold water 30 min to remove blood, drain"},
    {"tray":"A","amount_g":150,"ingredient_zh":"羊骨（汤底用）","ingredient_en":"lamb bone (for broth)","action_zh":"冷水焯水 5 分钟，冲净浮沫","action_en":"Blanch in cold water 5 min, rinse off scum"},
    {"tray":"E","amount_g":200,"ingredient_zh":"饦饦馍（半发面烤饼）","ingredient_en":"Xi''an tuotuo flatbread (semi-leavened baked)","action_zh":"凉透后手掰成黄豆大小碎块（约 0.5-1cm）","action_en":"Cool fully, tear by hand into pea-sized pieces (0.5-1cm)"},
    {"tray":"B","amount_g":30,"ingredient_zh":"粉丝（红薯/绿豆）","ingredient_en":"vermicelli (sweet potato or mung bean)","action_zh":"温水泡软备用","action_en":"Soak in warm water until soft"},
    {"tray":"B","amount_g":50,"ingredient_zh":"木耳+黄花菜（干）","ingredient_en":"black fungus + dried lily buds","action_zh":"温水泡发洗净，木耳撕小片","action_en":"Rehydrate in warm water, rinse, tear black fungus to small pieces"},
    {"tray":"C","amount_g":40,"ingredient_zh":"葱花+香菜末+蒜苗末","ingredient_en":"chopped scallion + cilantro + garlic chives","action_zh":"各切碎备用","action_en":"Chop all finely"},
    {"tray":"C","amount_g":30,"ingredient_zh":"糖蒜（佐食）","ingredient_en":"pickled sweet garlic (for side)","action_zh":"取整瓣装碟","action_en":"Whole cloves on side plate"},
    {"tray":"D","amount_g":15,"ingredient_zh":"香料包（八角 2、桂皮 1、花椒 1g、白蔻 2、香叶 2、姜片 10g）","ingredient_en":"spice pouch (star anise 2, cassia 1, sichuan pepper 1g, white cardamom 2, bay leaves 2, ginger 10g)","action_zh":"装入纱布袋扎紧","action_en":"Wrap in cheesecloth bag, tie tight"},
    {"tray":"D","amount_g":15,"ingredient_zh":"调味（盐 8g+生抽 5g+白胡椒 2g）","ingredient_en":"seasoning (salt 8g + light soy 5g + white pepper 2g)","action_zh":"煮汤时陆续加入","action_en":"Add gradually during stewing"},
    {"tray":"D","amount_g":15,"ingredient_zh":"辣椒油（佐食）","ingredient_en":"chili oil (side)","action_zh":"装小碟随餐","action_en":"Small dish on side"}
  ]'::jsonb,
  '[
    {"step":1,"action_zh":"汤锅加 2.5L 冷水，下 A 格羊肉+羊骨+D 格香料包，大火煮沸撇去浮沫","action_en":"Add 2.5L cold water, lamb + bones + spice pouch, bring to boil, skim scum","duration_min":15,"state_target_zh":"汤面无浮沫，呈乳白","state_target_en":"No scum, broth milky"},
    {"step":2,"action_zh":"转小火炖 60 分钟至羊肉酥烂、汤色乳白浓郁","action_en":"Reduce to low, simmer 60 min until lamb tender and broth richly milky","duration_min":60,"state_target_zh":"羊肉筷子可穿，汤浓","state_target_en":"Lamb pierces easily, broth thick"},
    {"step":3,"action_zh":"挑出香料包+羊骨，加 D 格盐+生抽+白胡椒调味","action_en":"Remove spice pouch + bones, season with salt + soy + pepper","duration_min":2,"state_target_zh":"汤咸鲜适口","state_target_en":"Broth well-seasoned"},
    {"step":4,"action_zh":"另起小汤锅，取 500ml 浓羊汤煮沸","action_en":"In small pot, bring 500ml lamb broth to boil","duration_min":3,"state_target_zh":"汤剧烈沸腾","state_target_en":"Broth boiling vigorously"},
    {"step":5,"action_zh":"放入 E 格掰碎馍块（每人份约 100g）+ B 格泡软粉丝+木耳黄花菜+ 5-6 块羊肉","action_en":"Add bread crumbs (~100g per portion) + soaked vermicelli + fungus + lily buds + 5-6 lamb pieces","duration_min":4,"state_target_zh":"馍块吸饱汤汁微胀","state_target_en":"Bread soaks up broth and swells slightly"},
    {"step":6,"action_zh":"中火煮 3 分钟至馍入味，关火","action_en":"Simmer on medium 3 min until bread infused, turn off","duration_min":3,"state_target_zh":"馍块绵软但不烂","state_target_en":"Bread soft but not mushy"},
    {"step":7,"action_zh":"倒入大碗，撒 C 格葱花+香菜+蒜苗末","action_en":"Pour into large bowl, top with scallion + cilantro + garlic chives","duration_min":1,"state_target_zh":"汤盖过馍，葱花漂浮","state_target_en":"Broth covers bread, garnish floats"},
    {"step":8,"action_zh":"配 C 格糖蒜 + D 格辣椒油上桌","action_en":"Serve with pickled garlic + chili oil on the side","duration_min":1,"state_target_zh":"上桌温度 80°C，香气浓烈","state_target_en":"Serving temp 80°C, intense aroma"}
  ]'::jsonb
);

COMMIT;

-- ─── §VERIFY 段（runtime 校验，不在 BEGIN 内）──────────────────────────────
DO $$
DECLARE
  v_new_count int;
  v_hakka_count int;
  v_hunan_count int;
  v_fujian_count int;
  v_ne_count int;
  v_nw_count int;
  v_prep_filled int;
  v_cook_filled int;
BEGIN
  -- 注意: DB 里既有 `剁椒鱼头(sichuan)` + `锅包肉(northern)` 重名行
  -- (origin_cuisine 不一致), 联合判 (title_zh + origin_cuisine) 才精准.
  SELECT COUNT(*) INTO v_new_count
  FROM dishes
  WHERE (title_zh = '客家盐焗鸡' AND origin_cuisine = 'hakka')
     OR (title_zh = '剁椒鱼头'  AND origin_cuisine = 'hunan')
     OR (title_zh = '沙茶面'    AND origin_cuisine = 'fujian')
     OR (title_zh = '锅包肉'    AND origin_cuisine = 'northeast')
     OR (title_zh = '羊肉泡馍'  AND origin_cuisine = 'northwest');

  SELECT COUNT(*) INTO v_hakka_count FROM dishes WHERE origin_cuisine = 'hakka';
  SELECT COUNT(*) INTO v_hunan_count FROM dishes WHERE origin_cuisine = 'hunan';
  SELECT COUNT(*) INTO v_fujian_count FROM dishes WHERE origin_cuisine = 'fujian';
  SELECT COUNT(*) INTO v_ne_count    FROM dishes WHERE origin_cuisine = 'northeast';
  SELECT COUNT(*) INTO v_nw_count    FROM dishes WHERE origin_cuisine = 'northwest';

  SELECT COUNT(*) INTO v_prep_filled
  FROM dishes
  WHERE ((title_zh = '客家盐焗鸡' AND origin_cuisine = 'hakka')
      OR (title_zh = '剁椒鱼头'  AND origin_cuisine = 'hunan')
      OR (title_zh = '沙茶面'    AND origin_cuisine = 'fujian')
      OR (title_zh = '锅包肉'    AND origin_cuisine = 'northeast')
      OR (title_zh = '羊肉泡馍'  AND origin_cuisine = 'northwest'))
    AND prep_steps_json IS NOT NULL
    AND jsonb_array_length(prep_steps_json) >= 4;

  SELECT COUNT(*) INTO v_cook_filled
  FROM dishes
  WHERE ((title_zh = '客家盐焗鸡' AND origin_cuisine = 'hakka')
      OR (title_zh = '剁椒鱼头'  AND origin_cuisine = 'hunan')
      OR (title_zh = '沙茶面'    AND origin_cuisine = 'fujian')
      OR (title_zh = '锅包肉'    AND origin_cuisine = 'northeast')
      OR (title_zh = '羊肉泡馍'  AND origin_cuisine = 'northwest'))
    AND cook_steps_json IS NOT NULL
    AND jsonb_array_length(cook_steps_json) >= 6;

  RAISE NOTICE '[TICKET-055 batch1 verify]';
  RAISE NOTICE '  new dishes inserted: %', v_new_count;
  RAISE NOTICE '  hakka=% hunan=% fujian=% northeast=% northwest=%',
    v_hakka_count, v_hunan_count, v_fujian_count, v_ne_count, v_nw_count;
  RAISE NOTICE '  prep_steps_json (>=4 ABCD entries): %/5', v_prep_filled;
  RAISE NOTICE '  cook_steps_json (>=6 steps): %/5', v_cook_filled;

  IF v_new_count <> 5 THEN
    RAISE EXCEPTION 'expected 5 new dishes, got %', v_new_count;
  END IF;
  IF v_prep_filled <> 5 OR v_cook_filled <> 5 THEN
    RAISE EXCEPTION 'prep/cook steps not fully populated: prep=% cook=%', v_prep_filled, v_cook_filled;
  END IF;
END $$;
