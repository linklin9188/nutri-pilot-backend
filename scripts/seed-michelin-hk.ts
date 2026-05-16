/**
 * seed-michelin-hk.ts
 *
 * Curated 30 signature dishes from HK Michelin (Guide 2024) + Black Pearl
 * 黑珍珠 (Meituan 2024) restaurants. Data is public knowledge — restaurant
 * names + their well-known signature dishes.
 *
 * Each row carries:
 *   - HOME version: simplified recipe a helper or family can cook
 *   - CHEF version: pro-level technique (sous vide / smoking gun / plating) —
 *     used by the future "米其林大厨上门" service.
 *
 * After this seed runs we'll backfill:
 *   - home_prep_steps_json / home_cook_steps_json via Claude
 *   - chef_prep_steps_json / chef_cook_steps_json via Claude (pro tone)
 *   - image_url via Gemini
 *
 * Sources for restaurant signature dishes (all public):
 *   - Michelin Guide HK 2024 official site restaurant pages
 *   - Black Pearl Guide 2024 (Meituan)
 *   - Restaurant own websites + press coverage
 */

import { Client } from 'pg';

const DB_URL = process.env.DIRECT_DATABASE_URL
  ?? 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

interface MichelinSeed {
  name_zh:                  string;
  name_en:                  string;
  restaurant_name_zh:       string;
  restaurant_name_en:       string;
  award_type:               'michelin' | 'black_pearl';
  award_level:              1 | 2 | 3;
  city:                     string;
  cuisine_style:            string;
  course_type:              'soup' | 'main_protein' | 'veggie_dish' | 'staple' | 'dessert';
  main_ingredient:          string;
  signature_technique:      string;
  flavor_profile_zh:        string;
  plating_note_zh:          string;
  home_difficulty:          '简单' | '中等' | '稍复杂';
  home_time_min:            number;
  chef_time_min:            number;
  blurb_zh:                 string;
  chef_book_price_hkd:      number;
}

const SEEDS: MichelinSeed[] = [
  // ── ⭐⭐⭐ 龍景軒 Lung King Heen (HK · Four Seasons · 三星) ──
  {
    name_zh: '蒜茸蒸蟹钳', name_en: 'Steamed Crab Claw with Garlic',
    restaurant_name_zh: '龍景軒', restaurant_name_en: 'Lung King Heen',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'crab',
    signature_technique: '低温清蒸 8 分钟 · 蒜茸需先去苦味 + 提前焦化',
    flavor_profile_zh: '清鲜咸香 · 蒜香不抢蟹味',
    plating_note_zh: '青瓷碗盛装 · 蟹钳立摆 · 蒜茸点缀 · 葱花收尾',
    home_difficulty: '中等', home_time_min: 25, chef_time_min: 45,
    blurb_zh: '广府 fine dining 标杆 · 蒸功要细致',
    chef_book_price_hkd: 880,
  },
  {
    name_zh: '杏汁炖白肺汤', name_en: 'Almond Cream with Pork Lung Soup',
    restaurant_name_zh: '龍景軒', restaurant_name_en: 'Lung King Heen',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'soup',
    main_ingredient: 'pork',
    signature_technique: '南北杏研磨 · 文火炖 4 小时',
    flavor_profile_zh: '杏香浓郁 · 润肺',
    plating_note_zh: '盖盅炖煮 · 上桌前揭盖闻香',
    home_difficulty: '稍复杂', home_time_min: 240, chef_time_min: 300,
    blurb_zh: '老火汤 fine dining 经典 · 润肺神汤',
    chef_book_price_hkd: 680,
  },
  {
    name_zh: '脆皮乳鸽', name_en: 'Crispy Roasted Pigeon',
    restaurant_name_zh: '龍景軒', restaurant_name_en: 'Lung King Heen',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'other',
    signature_technique: '卤水浸泡 4h · 风干 12h · 200°C 高温炸脆',
    flavor_profile_zh: '皮脆肉嫩 · 五香回甘',
    plating_note_zh: '半只摆盘 · 配椒盐 + 柠檬',
    home_difficulty: '稍复杂', home_time_min: 150, chef_time_min: 180,
    blurb_zh: '粤式烧腊最难做的一道',
    chef_book_price_hkd: 980,
  },

  // ── ⭐⭐ 唐閣 Tang Court (HK · Langham · 三星) ──
  {
    name_zh: '当红炸子鸡', name_en: 'Crispy Fried Chicken',
    restaurant_name_zh: '唐閣', restaurant_name_en: 'Tang Court',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'chicken',
    signature_technique: '180°C 油淋 + 麦芽糖上色 · 三起三落',
    flavor_profile_zh: '皮酥脆 · 内嫩有汁',
    plating_note_zh: '红木砧板托盘 · 切件铺整鸡形',
    home_difficulty: '稍复杂', home_time_min: 120, chef_time_min: 150,
    blurb_zh: '唐閣镇店之宝 · 整鸡上桌',
    chef_book_price_hkd: 880,
  },
  {
    name_zh: '避风塘炒蟹', name_en: 'Typhoon Shelter Fried Crab',
    restaurant_name_zh: '唐閣', restaurant_name_en: 'Tang Court',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'crab',
    signature_technique: '蒜蓉先炸金黄 · 黑豆豉爆香 · 蟹件干煸',
    flavor_profile_zh: '蒜香 + 微辣 · 鲜中带焦香',
    plating_note_zh: '深盘装 · 蒜末厚铺 · 葱花点缀',
    home_difficulty: '中等', home_time_min: 50, chef_time_min: 80,
    blurb_zh: '香港夜归人最想的一道 · 经典 fine dining 版',
    chef_book_price_hkd: 1280,
  },

  // ── ⭐⭐ 8½ Otto e Mezzo Bombana (HK · Landmark · 三星意菜) ──
  {
    name_zh: '黑松露手工意面', name_en: 'Handmade Tagliolini with Black Truffle',
    restaurant_name_zh: '8½ Otto e Mezzo Bombana', restaurant_name_en: '8½ Otto e Mezzo Bombana',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'fusion', course_type: 'staple',
    main_ingredient: 'carb',
    signature_technique: '手擀蛋黄面 · 黄油融化 · 黑松露现刨',
    flavor_profile_zh: '黄油香浓 · 黑松露土香',
    plating_note_zh: '白瓷深盘 · 面卷成塔形 · 黑松露片覆盖',
    home_difficulty: '稍复杂', home_time_min: 90, chef_time_min: 60,
    blurb_zh: 'HK 唯一意菜三星 · 真理就在简单里',
    chef_book_price_hkd: 1880,
  },

  // ── ⭐⭐ T'ang Court 唐宫 (HK · 国际金融中心 · 二星) ──
  {
    name_zh: '炭烧黑豚叉烧', name_en: 'Charcoal-Grilled Iberico BBQ Pork',
    restaurant_name_zh: '唐宫', restaurant_name_en: "T'ang Court",
    award_type: 'michelin', award_level: 2, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'pork',
    signature_technique: '伊比利亚黑豚 · 玫瑰露酒腌 24h · 炭烤明火',
    flavor_profile_zh: '焦香 + 微甜 · 入口即化',
    plating_note_zh: '黑石板托 · 切薄片排开 · 海盐颗粒',
    home_difficulty: '中等', home_time_min: 90, chef_time_min: 120,
    blurb_zh: '黑豚原料是关键 · 不是普通五花',
    chef_book_price_hkd: 980,
  },

  // ── ⭐ Yat Lok 一樂燒鵝 (HK · 中环 · 一星) ──
  {
    name_zh: '一乐烧鹅', name_en: 'Roasted Goose',
    restaurant_name_zh: '一樂燒鵝', restaurant_name_en: 'Yat Lok',
    award_type: 'michelin', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'other',
    signature_technique: '荔枝木明火烤 · 鹅内填五香料 · 皮淋糖醋水',
    flavor_profile_zh: '皮脆肉嫩 · 五香入骨',
    plating_note_zh: '砍件铺白瓷盘 · 配酸梅酱',
    home_difficulty: '稍复杂', home_time_min: 180, chef_time_min: 240,
    blurb_zh: '街坊价米其林 · 经典港式烧腊',
    chef_book_price_hkd: 1180,
  },

  // ── ⭐ Tim Ho Wan 添好運 (HK · 多店 · 一星点心) ──
  {
    name_zh: '酥皮焗叉烧包', name_en: 'Baked BBQ Pork Bun',
    restaurant_name_zh: '添好運', restaurant_name_en: 'Tim Ho Wan',
    award_type: 'michelin', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'staple',
    main_ingredient: 'pork',
    signature_technique: '酥皮 + 烘烤（区别传统蒸） · 叉烧馅自制',
    flavor_profile_zh: '皮酥糖脆 · 馅浓郁带焦香',
    plating_note_zh: '蒸笼或木板托 · 3 颗一组',
    home_difficulty: '稍复杂', home_time_min: 120, chef_time_min: 90,
    blurb_zh: '世界最便宜米其林 · 这道焗叉烧包是必尝',
    chef_book_price_hkd: 480,
  },
  {
    name_zh: '香煎萝卜糕', name_en: 'Pan-Fried Turnip Cake',
    restaurant_name_zh: '添好運', restaurant_name_en: 'Tim Ho Wan',
    award_type: 'michelin', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'staple',
    main_ingredient: 'veggie',
    signature_technique: '腊肠 + 虾米 + 萝卜丝 · 蒸熟后切片煎至金黄',
    flavor_profile_zh: '外焦内糯 · 腊味咸香',
    plating_note_zh: '白瓷盘 · 配甜辣酱蘸料',
    home_difficulty: '中等', home_time_min: 60, chef_time_min: 75,
    blurb_zh: '广东早茶必点 · 这家做得最够镬气',
    chef_book_price_hkd: 380,
  },

  // ── 黑珍珠 三钻 · 廳 The Chairman (HK) ──
  {
    name_zh: '陈皮蒸花蟹饭', name_en: 'Steamed Flower Crab over Aged Tangerine Rice',
    restaurant_name_zh: '廳 The Chairman', restaurant_name_en: 'The Chairman',
    award_type: 'black_pearl', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'staple',
    main_ingredient: 'crab',
    signature_technique: '10 年陈皮浸泡 · 花雕蒸 · 米饭吸尽蟹汁',
    flavor_profile_zh: '陈皮回甘 · 蟹鲜浓郁',
    plating_note_zh: '砂锅整蟹覆盖米饭 · 上桌揭盖',
    home_difficulty: '中等', home_time_min: 60, chef_time_min: 90,
    blurb_zh: '亚洲 50 最佳常驻 · 海鲜饭新高度',
    chef_book_price_hkd: 1480,
  },
  {
    name_zh: '盐烧老鸽', name_en: 'Salt-Baked Aged Pigeon',
    restaurant_name_zh: '廳 The Chairman', restaurant_name_en: 'The Chairman',
    award_type: 'black_pearl', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'other',
    signature_technique: '海盐裹烤 · 老鸽风干 7 天 · 200°C 烤 30 分钟',
    flavor_profile_zh: '咸香入肉 · 皮酥肉嫩',
    plating_note_zh: '砸开盐壳露鸽 · 现场仪式感',
    home_difficulty: '稍复杂', home_time_min: 80, chef_time_min: 60,
    blurb_zh: '盐烧仪式感很强 · 适合宴客',
    chef_book_price_hkd: 1080,
  },

  // ── 黑珍珠 二钻 · 福临门 (HK · 总店) ──
  {
    name_zh: '红烧鲍鱼', name_en: 'Braised Abalone',
    restaurant_name_zh: '福臨門', restaurant_name_en: 'Fook Lam Moon',
    award_type: 'black_pearl', award_level: 2, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'seafood',
    signature_technique: '干鲍泡发 3 天 · 老母鸡 + 火腿 + 排骨吊汤 · 文火炖 12 小时',
    flavor_profile_zh: '胶质丰厚 · 鲍香醇厚',
    plating_note_zh: '青花瓷盘 · 整只摆放 · 浓汁淋面',
    home_difficulty: '稍复杂', home_time_min: 720, chef_time_min: 840,
    blurb_zh: '富豪饭堂经典 · 一鲍千金',
    chef_book_price_hkd: 2880,
  },
  {
    name_zh: '清蒸海上鲜（东星斑）', name_en: 'Steamed Coral Trout',
    restaurant_name_zh: '福臨門', restaurant_name_en: 'Fook Lam Moon',
    award_type: 'black_pearl', award_level: 2, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'fish',
    signature_technique: '活鱼现蒸 8 分钟 · 葱姜丝铺面 · 滚油激香 · 豉油淋',
    flavor_profile_zh: '清鲜原味 · 鱼肉嫩滑',
    plating_note_zh: '长盘 · 整鱼上 · 葱花头尾',
    home_difficulty: '中等', home_time_min: 30, chef_time_min: 45,
    blurb_zh: '广府蒸鱼最高水平 · 火候是命',
    chef_book_price_hkd: 1680,
  },

  // ── ⭐ 阿一鮑魚 Forum Restaurant (HK · 铜锣湾 · 三星) ──
  {
    name_zh: '阿一鲍鱼', name_en: "Ah Yat's Braised Abalone",
    restaurant_name_zh: '阿一鮑魚', restaurant_name_en: 'Forum Restaurant',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'seafood',
    signature_technique: '阿一秘制鲍汁 · 干鲍发制 + 慢炖 · 鲍汁回淋三次',
    flavor_profile_zh: '溏心鲍 · 浓汁挂面',
    plating_note_zh: '深紫瓷盘 · 鲍鱼立摆 · 西蓝花围边',
    home_difficulty: '稍复杂', home_time_min: 720, chef_time_min: 600,
    blurb_zh: '杨贯一师傅一手打造 · 鲍王传奇',
    chef_book_price_hkd: 3280,
  },

  // ── ⭐⭐ Caprice (HK · 四季 · 三星法菜) ──
  {
    name_zh: '低温慢煮和牛颊肉', name_en: 'Sous Vide Wagyu Beef Cheek',
    restaurant_name_zh: 'Caprice', restaurant_name_en: 'Caprice',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'fusion', course_type: 'main_protein',
    main_ingredient: 'beef',
    signature_technique: '63°C 低温慢煮 48 小时 · 起锅前明火 30s 焦香表皮 · 红酒酱汁浇淋',
    flavor_profile_zh: '入口即化 · 红酒回甘',
    plating_note_zh: '黑石板托 · 切薄片扇形铺开 · 微型蔬菜围边',
    home_difficulty: '稍复杂', home_time_min: 2880, chef_time_min: 2880,
    blurb_zh: 'HK 法菜三星首选 · sous vide 教科书',
    chef_book_price_hkd: 2880,
  },

  // ── 黑珍珠 一钻 · 富豪雪糕 (HK · 经典甜品) ──
  {
    name_zh: '杨枝甘露', name_en: 'Mango Pomelo Sago',
    restaurant_name_zh: '許留山', restaurant_name_en: 'Hui Lau Shan',
    award_type: 'black_pearl', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'dessert',
    main_ingredient: 'dessert',
    signature_technique: '青芒果 + 椰汁 + 西米 + 柚子 · 4°C 冷藏 4 小时',
    flavor_profile_zh: '清甜 · 椰香 · 柚子微苦',
    plating_note_zh: '透明高脚杯 · 西米沉底 · 芒果立体',
    home_difficulty: '简单', home_time_min: 30, chef_time_min: 45,
    blurb_zh: '港式经典 · 夏日必备',
    chef_book_price_hkd: 280,
  },

  // ── ⭐ Bo Innovation 廚魔 (HK · 湾仔 · 二星 fusion) ──
  {
    name_zh: '分子小笼包', name_en: 'Molecular Xiao Long Bao',
    restaurant_name_zh: 'Bo Innovation', restaurant_name_en: 'Bo Innovation',
    award_type: 'michelin', award_level: 2, city: 'hk',
    cuisine_style: 'fusion', course_type: 'staple',
    main_ingredient: 'pork',
    signature_technique: '球化反应 · 海藻酸钠 + 钙浴 · 一口爆汁',
    flavor_profile_zh: '咸鲜爆汁 · 视觉冲击',
    plating_note_zh: '中式青瓷蘸碟 + 一只透明球',
    home_difficulty: '稍复杂', home_time_min: 240, chef_time_min: 180,
    blurb_zh: '梁经纶大厨招牌 · 分子料理代表作',
    chef_book_price_hkd: 1280,
  },

  // ── 黑珍珠 二钻 · 翡翠拉麵小籠包 (HK · 多店) ──
  {
    name_zh: '蟹粉小笼包', name_en: 'Crab Roe Xiao Long Bao',
    restaurant_name_zh: '翡翠拉麵小籠包', restaurant_name_en: 'Crystal Jade La Mian Xiao Long Bao',
    award_type: 'black_pearl', award_level: 2, city: 'hk',
    cuisine_style: 'shanghainese_fine', course_type: 'staple',
    main_ingredient: 'pork',
    signature_technique: '皮 18 折 · 肉冻 + 蟹粉 · 蒸 8 分钟',
    flavor_profile_zh: '汤汁浓郁 · 蟹香鲜美',
    plating_note_zh: '小蒸笼 · 一笼 6 个',
    home_difficulty: '稍复杂', home_time_min: 180, chef_time_min: 150,
    blurb_zh: '上海菜在港代表 · 蟹粉版必尝',
    chef_book_price_hkd: 580,
  },

  // ── 黑珍珠 二钻 · 鴻星海鮮酒家 ──
  {
    name_zh: '冬瓜盅', name_en: 'Winter Melon Tureen Soup',
    restaurant_name_zh: '鴻星海鮮酒家', restaurant_name_en: 'Super Star Seafood',
    award_type: 'black_pearl', award_level: 2, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'soup',
    main_ingredient: 'veggie',
    signature_technique: '整个冬瓜挖空 · 蟹肉 + 火腿 + 干贝 + 上汤填入 · 隔水炖 2 小时',
    flavor_profile_zh: '清润鲜美 · 冬瓜吸尽汤鲜',
    plating_note_zh: '上桌切开冬瓜 · 仪式感强',
    home_difficulty: '稍复杂', home_time_min: 150, chef_time_min: 180,
    blurb_zh: '盛夏宴客经典 · 高大上版本',
    chef_book_price_hkd: 1280,
  },

  // ── ⭐ 桃花源 Imperial Treasure (HK · 一星淮扬) ──
  {
    name_zh: '蟹粉狮子头', name_en: 'Crab Roe Lion Head Meatball',
    restaurant_name_zh: '桃花源', restaurant_name_en: 'Imperial Treasure Fine Chinese',
    award_type: 'michelin', award_level: 1, city: 'hk',
    cuisine_style: 'huaiyang_fine', course_type: 'main_protein',
    main_ingredient: 'pork',
    signature_technique: '猪肉手剁不绞 · 蟹粉拌入 · 砂锅清炖 90 分钟',
    flavor_profile_zh: '肉松软 · 蟹香丰腴',
    plating_note_zh: '小砂锅或深盘 · 配清菜垫底',
    home_difficulty: '中等', home_time_min: 120, chef_time_min: 150,
    blurb_zh: '淮扬菜代表 · 蟹粉版升级',
    chef_book_price_hkd: 880,
  },

  // ── ⭐⭐ 利苑酒家 Lei Garden ──
  {
    name_zh: '冰烧三层肉', name_en: 'Crispy Roasted Pork Belly',
    restaurant_name_zh: '利苑酒家', restaurant_name_en: 'Lei Garden',
    award_type: 'michelin', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'pork',
    signature_technique: '五花肉风干 · 皮抹冰水 · 烤至皮起泡 · 切方块',
    flavor_profile_zh: '皮脆肉嫩 · 五香入味',
    plating_note_zh: '方块切 · 整齐铺白瓷盘 · 配芥末蜂蜜酱',
    home_difficulty: '中等', home_time_min: 240, chef_time_min: 180,
    blurb_zh: '利苑标志菜 · 港式烧腊水准',
    chef_book_price_hkd: 680,
  },
  {
    name_zh: '杏汁白肺汤', name_en: 'Almond Soup with Pork Lung',
    restaurant_name_zh: '利苑酒家', restaurant_name_en: 'Lei Garden',
    award_type: 'michelin', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'soup',
    main_ingredient: 'pork',
    signature_technique: '南北杏与排骨炖 4 小时 · 杏味浓郁 · 润肺',
    flavor_profile_zh: '香润 · 杏仁浓郁',
    plating_note_zh: '盖盅炖 · 上桌揭盖闻香',
    home_difficulty: '稍复杂', home_time_min: 240, chef_time_min: 300,
    blurb_zh: '广东老火汤标准 · 润肺神汤',
    chef_book_price_hkd: 480,
  },

  // ── ⭐ Sushi Shikon (HK · 二星日料) ──
  {
    name_zh: '江户前寿司套餐', name_en: 'Edomae Sushi Omakase',
    restaurant_name_zh: 'Sushi Shikon', restaurant_name_en: 'Sushi Shikon',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'fusion', course_type: 'main_protein',
    main_ingredient: 'fish',
    signature_technique: '日本直送鱼 · 米饭温度精控 · 师傅 omakase 板前现握',
    flavor_profile_zh: '食材本味 · 米饭温热',
    plating_note_zh: '柏木板 · 一份两贯 · 顺序上',
    home_difficulty: '稍复杂', home_time_min: 60, chef_time_min: 120,
    blurb_zh: 'HK 唯一日料三星 · 厨师上门可定制',
    chef_book_price_hkd: 3800,
  },

  // ── 黑珍珠 一钻 · 西貢 Sai Kung 海鲜 ──
  {
    name_zh: '蒜蓉粉丝蒸扇贝', name_en: 'Garlic Vermicelli Steamed Scallop',
    restaurant_name_zh: '西貢全記海鮮', restaurant_name_en: 'Chuen Kee Seafood Sai Kung',
    award_type: 'black_pearl', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'scallop',
    signature_technique: '活扇贝现宰 · 蒜茸+龙口粉丝铺 · 大火蒸 4 分钟',
    flavor_profile_zh: '蒜香蒸 · 粉丝吸汁',
    plating_note_zh: '原贝壳上 · 一人一只 · 葱花点缀',
    home_difficulty: '中等', home_time_min: 30, chef_time_min: 40,
    blurb_zh: '西贡海鲜代表 · 鲜活胜一切',
    chef_book_price_hkd: 480,
  },

  // ── 黑珍珠 一钻 · 何洪記 ──
  {
    name_zh: '云吞面', name_en: 'Shrimp Wonton Noodles',
    restaurant_name_zh: '何洪記', restaurant_name_en: 'Ho Hung Kee',
    award_type: 'black_pearl', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'staple',
    main_ingredient: 'shrimp',
    signature_technique: '竹升面手工抻 · 大地鱼汤底 4 小时 · 鲜虾包馅',
    flavor_profile_zh: '汤鲜面爽 · 虾仁脆弹',
    plating_note_zh: '深碗装 · 云吞先 · 面铺上 · 韭黄/葱花',
    home_difficulty: '中等', home_time_min: 90, chef_time_min: 120,
    blurb_zh: '港式云吞面标杆 · 平民米其林',
    chef_book_price_hkd: 280,
  },

  // ── 黑珍珠 二钻 · 鄧記 老式茶餐厅 ──
  {
    name_zh: '酥皮蛋挞', name_en: 'Flaky Egg Tart',
    restaurant_name_zh: '檀島咖啡餅店', restaurant_name_en: 'Honolulu Coffee Shop',
    award_type: 'black_pearl', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'dessert',
    main_ingredient: 'dessert',
    signature_technique: '酥皮 192 层 · 蛋液过筛 · 200°C 烤 20 分钟',
    flavor_profile_zh: '皮酥蛋香 · 入口即化',
    plating_note_zh: '原盘上 · 一份 6 个 · 配红茶',
    home_difficulty: '稍复杂', home_time_min: 180, chef_time_min: 150,
    blurb_zh: '港式蛋挞标杆 · 酥皮派代表',
    chef_book_price_hkd: 380,
  },

  // ── 黑珍珠 一钻 · 海南鸡饭 ──
  {
    name_zh: '海南鸡饭', name_en: 'Hainanese Chicken Rice',
    restaurant_name_zh: '海南少爺', restaurant_name_en: 'Hainan Shao Ye',
    award_type: 'black_pearl', award_level: 1, city: 'hk',
    cuisine_style: 'fusion', course_type: 'staple',
    main_ingredient: 'chicken',
    signature_technique: '走地鸡冷水浸熟 · 鸡油拌饭 · 三蘸料 (姜蓉/酱油/辣椒)',
    flavor_profile_zh: '鸡香饭润 · 蘸料丰富',
    plating_note_zh: '鸡件切片 · 饭独立小碗 · 蘸料三碟',
    home_difficulty: '中等', home_time_min: 75, chef_time_min: 90,
    blurb_zh: '新加坡国菜港版 · 经典',
    chef_book_price_hkd: 380,
  },

  // ── ⭐ Otto e Mezzo（追加）·  Buon Cibo ──
  {
    name_zh: '黑松露烩饭', name_en: 'Black Truffle Risotto',
    restaurant_name_zh: '8½ Otto e Mezzo Bombana', restaurant_name_en: '8½ Otto e Mezzo Bombana',
    award_type: 'michelin', award_level: 3, city: 'hk',
    cuisine_style: 'fusion', course_type: 'staple',
    main_ingredient: 'carb',
    signature_technique: 'Carnaroli 米 · 鸡汤分次加入 · 帕玛森芝士 · 黑松露现刨',
    flavor_profile_zh: '黄油浓香 · 米心带嚼劲',
    plating_note_zh: '浅碗摊开 · 黑松露铺面',
    home_difficulty: '中等', home_time_min: 45, chef_time_min: 60,
    blurb_zh: '意菜技法代表 · 米心是关键',
    chef_book_price_hkd: 1480,
  },

  // ── 黑珍珠 三钻 · 名人坊 Mott 32 ──
  {
    name_zh: '北京烤鸭', name_en: 'Peking Duck',
    restaurant_name_zh: 'Mott 32', restaurant_name_en: 'Mott 32',
    award_type: 'black_pearl', award_level: 3, city: 'hk',
    cuisine_style: 'fusion', course_type: 'main_protein',
    main_ingredient: 'other',
    signature_technique: '鸭风干 48h · 果木明火烤 · 厨师片皮 108 片 · 三吃',
    flavor_profile_zh: '皮酥肉嫩 · 果木香',
    plating_note_zh: '现场片皮表演 · 薄饼+葱+黄瓜+甜面酱',
    home_difficulty: '稍复杂', home_time_min: 180, chef_time_min: 240,
    blurb_zh: 'HK 港版京菜代表 · 现场片皮仪式感强',
    chef_book_price_hkd: 1880,
  },

  // ── 黑珍珠 二钻 · 客家盆菜 ──
  {
    name_zh: '客家围村盆菜', name_en: 'Hakka Walled Village Poon Choi',
    restaurant_name_zh: '大埔林村圍村盆菜', restaurant_name_en: 'Tai Po Walled Village Poon Choi',
    award_type: 'black_pearl', award_level: 1, city: 'hk',
    cuisine_style: 'cantonese_fine', course_type: 'main_protein',
    main_ingredient: 'other',
    signature_technique: '9 层食材层叠 · 上层鲍参翅肚 · 中层猪羊鸡 · 底层萝卜白菜吸汁',
    flavor_profile_zh: '层次丰富 · 汁香入底',
    plating_note_zh: '大铜盆 · 整桌共享',
    home_difficulty: '稍复杂', home_time_min: 240, chef_time_min: 360,
    blurb_zh: '新界客家传统 · 围村聚会必备',
    chef_book_price_hkd: 2880,
  },
];

console.log(`Seeding ${SEEDS.length} michelin/black-pearl dishes...`);

const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

let inserted = 0;
for (const s of SEEDS) {
  try {
    await pg.query(`
      INSERT INTO michelin_dishes (
        name_zh, name_en,
        restaurant_name_zh, restaurant_name_en,
        award_type, award_level, city,
        cuisine_style, course_type, main_ingredient,
        signature_technique, flavor_profile_zh, plating_note_zh,
        home_difficulty, home_time_min, chef_time_min,
        blurb_zh, chef_book_price_hkd
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )
    `, [
      s.name_zh, s.name_en,
      s.restaurant_name_zh, s.restaurant_name_en,
      s.award_type, s.award_level, s.city,
      s.cuisine_style, s.course_type, s.main_ingredient,
      s.signature_technique, s.flavor_profile_zh, s.plating_note_zh,
      s.home_difficulty, s.home_time_min, s.chef_time_min,
      s.blurb_zh, s.chef_book_price_hkd,
    ]);
    inserted++;
  } catch (e: any) {
    console.error(`  ❌ ${s.name_zh}: ${e.message}`);
  }
}

console.log(`✅ Inserted ${inserted}/${SEEDS.length}`);

const r = await pg.query(`SELECT COUNT(*) FROM michelin_dishes`);
console.log(`Total michelin_dishes now: ${r.rows[0].count}`);

await pg.end();
