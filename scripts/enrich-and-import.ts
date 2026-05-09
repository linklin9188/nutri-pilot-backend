/**
 * 300-dish enrichment + import pipeline
 *
 * 1. 从内置列表读取中英文菜名 + 分类
 * 2. 批量发给 Gemini 自动生成: origin_cuisine, flavor_tags, health_benefit_tags,
 *    main_ingredient, seasonal_tag, description_zh, description_en
 * 3. 清空旧 dishes 表，批量写入新数据
 *
 * Run: npx tsx scripts/enrich-and-import.ts
 * Options:
 *   --dry-run   只打印结果，不写数据库
 *   --batch N   每批处理 N 道菜 (default: 12)
 */

import pg from 'pg';
import { config } from 'dotenv';
config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const db = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DRY_RUN   = process.argv.includes('--dry-run');
const batchArg  = process.argv.find(a => a.startsWith('--batch='))?.split('=')[1];
const BATCH_SIZE = batchArg ? parseInt(batchArg) : 12;

// ── 300道菜完整列表 ──────────────────────────────────────────────────────────
// [title_zh, title_en, meal_type, cuisine_hint]
// cuisine_hint: 'chinese' | 'western' (used to seed Gemini prompt)

type RawDish = [string, string, 'breakfast'|'lunch'|'dinner'|'all', 'chinese'|'western'];

const ALL_DISHES: RawDish[] = [
  // ── 一、中式家常菜 · 畜肉类 (50道) ─────────────────────────────────────
  ['红烧肉',     'Braised Pork Belly',               'dinner', 'chinese'],
  ['糖醋排骨',   'Sweet and Sour Spare Ribs',        'dinner', 'chinese'],
  ['鱼香肉丝',   'Yu-Shiang Shredded Pork',          'dinner', 'chinese'],
  ['京酱肉丝',   'Sautéed Shredded Pork in Sweet Bean Sauce','dinner','chinese'],
  ['回锅肉',     'Twice-Cooked Pork Slices',         'dinner', 'chinese'],
  ['梅菜扣肉',   'Braised Pork with Preserved Vegetables','dinner','chinese'],
  ['粉蒸肉',     'Steamed Pork with Rice Flour',     'dinner', 'chinese'],
  ['尖椒肉片',   'Sautéed Pork with Hot Pepper',     'dinner', 'chinese'],
  ['蒜泥白肉',   'Sliced Boiled Pork with Garlic Sauce','dinner','chinese'],
  ['锅包肉',     'Crispy Sweet and Sour Pork',       'dinner', 'chinese'],
  ['糖醋里脊',   'Sweet and Sour Pork Fillet',       'dinner', 'chinese'],
  ['溜肉段',     'Sautéed Pork Pieces',              'dinner', 'chinese'],
  ['蒜苔炒肉',   'Sautéed Pork with Garlic Bolts',   'dinner', 'chinese'],
  ['芹菜炒肉',   'Sautéed Pork with Celery',         'dinner', 'chinese'],
  ['苦瓜炒肉',   'Sautéed Pork with Bitter Melon',   'dinner', 'chinese'],
  ['青椒肉丝',   'Sautéed Pork with Green Pepper',   'dinner', 'chinese'],
  ['榨菜肉丝',   'Sautéed Pork with Pickled Mustard Root','dinner','chinese'],
  ['蚂蚁上树',   'Sautéed Vermicelli with Minced Pork','dinner','chinese'],
  ['红烧大排',   'Braised Pork Chops',               'dinner', 'chinese'],
  ['椒盐小排',   'Salt and Pepper Spare Ribs',       'dinner', 'chinese'],
  ['卤猪蹄',     'Braised Pig Trotters',             'dinner', 'chinese'],
  ['荷兰豆炒腊肉','Sautéed Preserved Pork with Snow Peas','dinner','chinese'],
  ['水煮牛肉',   'Poached Spicy Beef Slices',        'dinner', 'chinese'],
  ['孜然羊肉',   'Sautéed Lamb with Cumin',          'dinner', 'chinese'],
  ['葱爆羊肉',   'Sautéed Lamb with Scallions',      'dinner', 'chinese'],
  ['杭椒牛柳',   'Sautéed Beef Fillet with Hot Pepper','dinner','chinese'],
  ['土豆炖牛腩', 'Braised Beef Brisket with Potatoes','dinner','chinese'],
  ['酸菜肥牛',   'Beef Slices in Sour Soup',         'dinner', 'chinese'],
  ['咖喱牛肉',   'Curry Beef',                       'dinner', 'chinese'],
  ['蚝油牛柳',   'Beef Fillet in Oyster Sauce',      'dinner', 'chinese'],
  ['西红柿炖牛腩','Stewed Beef Brisket with Tomatoes','dinner','chinese'],
  ['萝卜炖羊肉', 'Stewed Lamb with Radish',          'dinner', 'chinese'],
  ['酱牛肉',     'Spiced Beef',                      'dinner', 'chinese'],
  ['滑溜里脊',   'Slippery Pork Fillet Slices',      'dinner', 'chinese'],
  ['肉末茄子',   'Sautéed Eggplant with Minced Pork','dinner','chinese'],
  ['豆角焖肉',   'Braised Pork with Green Beans',    'dinner', 'chinese'],
  ['莲藕炖排骨', 'Stewed Ribs with Lotus Root',      'dinner', 'chinese'],
  ['冬瓜炖排骨', 'Stewed Ribs with White Gourd',     'dinner', 'chinese'],
  ['海带炖排骨', 'Stewed Ribs with Seaweed',         'dinner', 'chinese'],
  ['糯米排骨',   'Steamed Ribs with Sticky Rice',    'dinner', 'chinese'],
  ['豉汁排骨',   'Steamed Ribs with Black Bean Sauce','dinner','chinese'],
  ['腊味合蒸',   'Steamed Assorted Preserved Meats', 'dinner', 'chinese'],
  ['葱爆牛肉',   'Sautéed Beef with Scallions',      'dinner', 'chinese'],
  ['农家小炒肉', 'Hunan Style Sautéed Pork',         'dinner', 'chinese'],
  ['黑椒牛柳',   'Black Pepper Beef Fillet',         'dinner', 'chinese'],
  ['干煸牛肉丝', 'Dry-Fried Beef Shreds',            'dinner', 'chinese'],
  ['沙茶牛肉',   'Sautéed Beef with Shacha Sauce',   'dinner', 'chinese'],
  ['孜然排骨',   'Cumin Spare Ribs',                 'dinner', 'chinese'],
  ['腐竹焖肉',   'Braised Pork with Yuba',           'dinner', 'chinese'],
  ['香菇滑肉',   'Sautéed Pork with Shiitake',       'dinner', 'chinese'],

  // ── 一、中式家常菜 · 禽蛋类 (35道) ─────────────────────────────────────
  ['宫保鸡丁',   'Kung Pao Chicken',                 'dinner', 'chinese'],
  ['辣子鸡',     'Chongqing Spicy Chicken',          'dinner', 'chinese'],
  ['白切鸡',     'Poached Chicken',                  'dinner', 'chinese'],
  ['三杯鸡',     'Three-Cup Chicken',                'dinner', 'chinese'],
  ['小鸡炖蘑菇', 'Stewed Chicken with Mushrooms',    'dinner', 'chinese'],
  ['大盘鸡',     'Sinkiang Style Braised Chicken',   'dinner', 'chinese'],
  ['啤酒鸭',     'Braised Duck with Beer',           'dinner', 'chinese'],
  ['盐水鸭',     'Nanjing Salted Duck',              'dinner', 'chinese'],
  ['番茄炒蛋',   'Scrambled Eggs with Tomato',       'dinner', 'chinese'],
  ['苦瓜炒蛋',   'Scrambled Eggs with Bitter Melon', 'dinner', 'chinese'],
  ['蛤蜊蒸蛋',   'Steamed Egg Custard with Clams',   'dinner', 'chinese'],
  ['虾仁滑蛋',   'Scrambled Eggs with Shrimp',       'dinner', 'chinese'],
  ['可乐鸡翅',   'Coke Chicken Wings',               'dinner', 'chinese'],
  ['照烧鸡腿',   'Teriyaki Chicken Thighs',          'dinner', 'chinese'],
  ['腰果鸡丁',   'Sautéed Chicken with Cashews',     'dinner', 'chinese'],
  ['柠檬鸡片',   'Lemon Chicken Slices',             'dinner', 'chinese'],
  ['口水鸡',     'Steamed Chicken with Chili Sauce', 'dinner', 'chinese'],
  ['盐焗鸡',     'Salt-Baked Chicken',               'dinner', 'chinese'],
  ['葱油鸡',     'Chicken with Scallion Oil',        'dinner', 'chinese'],
  ['豉油鸡',     'Soy Sauce Chicken',                'dinner', 'chinese'],
  ['咖喱鸡块',   'Curry Chicken Pieces',             'dinner', 'chinese'],
  ['香菇蒸鸡',   'Steamed Chicken with Mushrooms',   'dinner', 'chinese'],
  ['栗子焖鸡',   'Braised Chicken with Chestnuts',   'dinner', 'chinese'],
  ['蒜香鸡翅',   'Garlic Chicken Wings',             'dinner', 'chinese'],
  ['孜然鸡翅',   'Cumin Chicken Wings',              'dinner', 'chinese'],
  ['虎皮鸡蛋',   'Tiger Skin Eggs',                  'dinner', 'chinese'],
  ['韭菜炒鸡蛋', 'Scrambled Eggs with Leeks',        'dinner', 'chinese'],
  ['尖椒炒鸡蛋', 'Scrambled Eggs with Hot Pepper',   'dinner', 'chinese'],
  ['厚蛋烧',     'Chinese Style Egg Roll',           'dinner', 'chinese'],
  ['鸡蛋羹',     'Steamed Egg Custard',              'dinner', 'chinese'],
  ['皮蛋拌豆腐', 'Preserved Egg with Tofu',          'dinner', 'chinese'],
  ['酱鸭',       'Soy-Braised Duck',                 'dinner', 'chinese'],
  ['脆皮炸鸡',   'Crispy Fried Chicken',             'dinner', 'chinese'],
  ['鱼香鸡蛋',   'Yu-Shiang Scrambled Eggs',         'dinner', 'chinese'],
  ['黄焖鸡',     'Braised Chicken with Rice',        'dinner', 'chinese'],

  // ── 一、中式家常菜 · 水产海鲜类 (25道) ─────────────────────────────────
  ['清蒸鲈鱼',     'Steamed Sea Bass',                         'dinner','chinese'],
  ['剁椒鱼头',     'Steamed Fish Head with Chopped Chili',     'dinner','chinese'],
  ['酸菜鱼',       'Fish Fillets with Pickled Vegetables',     'dinner','chinese'],
  ['红烧鲤鱼',     'Braised Carp',                             'dinner','chinese'],
  ['糖醋鱼片',     'Sweet and Sour Fish Fillets',              'dinner','chinese'],
  ['溜鱼片',       'Sautéed Fish Fillets',                     'dinner','chinese'],
  ['煎带鱼',       'Fried Hairtail',                           'dinner','chinese'],
  ['红烧带鱼',     'Braised Hairtail',                         'dinner','chinese'],
  ['油焖大虾',     'Braised Prawns in Oil',                    'dinner','chinese'],
  ['避风塘炒虾',   'Bi Feng Tang Fried Shrimp',               'dinner','chinese'],
  ['蒜蓉粉丝蒸扇贝','Steamed Scallops with Garlic',           'dinner','chinese'],
  ['辣炒蛤蜊',     'Spicy Sautéed Clams',                     'dinner','chinese'],
  ['椒盐虾',       'Salt and Pepper Shrimp',                  'dinner','chinese'],
  ['白灼虾',       'Scalded Shrimp',                          'dinner','chinese'],
  ['宫保虾仁',     'Kung Pao Shrimp',                         'dinner','chinese'],
  ['腰果虾仁',     'Sautéed Shrimp with Cashews',             'dinner','chinese'],
  ['虾仁炒西蓝花', 'Sautéed Shrimp with Broccoli',           'dinner','chinese'],
  ['清炒虾仁',     'Sautéed Shrimp',                          'dinner','chinese'],
  ['葱姜炒蟹',     'Sautéed Crab with Ginger and Scallion',  'dinner','chinese'],
  ['蒜蓉蒸生蚝',   'Steamed Oysters with Garlic',            'dinner','chinese'],
  ['鱿鱼炒青椒',   'Sautéed Squid with Green Pepper',        'dinner','chinese'],
  ['铁板鱿鱼',     'Grilled Squid',                          'dinner','chinese'],
  ['鲫鱼豆腐汤',   'Crucian Carp Soup with Tofu',            'dinner','chinese'],
  ['酱爆小卷',     'Sautéed Small Squid in Bean Sauce',      'dinner','chinese'],
  ['豆豉蒸鱼',     'Steamed Fish with Black Bean Sauce',     'dinner','chinese'],

  // ── 一、中式家常菜 · 蔬菜豆腐类 (40道) ─────────────────────────────────
  ['麻婆豆腐',     'Mapo Tofu',                              'dinner','chinese'],
  ['家常豆腐',     'Home Style Tofu',                        'dinner','chinese'],
  ['蟹粉豆腐',     'Tofu with Crab Roe',                    'dinner','chinese'],
  ['酿豆腐',       'Stuffed Tofu',                           'dinner','chinese'],
  ['地三鲜',       'Sautéed Potato, Eggplant and Pepper',   'dinner','chinese'],
  ['干煸芸豆',     'Sautéed Green Beans',                   'dinner','chinese'],
  ['手撕包菜',     'Hand-Torn Cabbage',                     'dinner','chinese'],
  ['蚝油生菜',     'Lettuce in Oyster Sauce',               'dinner','chinese'],
  ['蒜泥西兰花',   'Sautéed Broccoli with Garlic',          'dinner','chinese'],
  ['荷塘小炒',     'Sautéed Lotus Root and Veggies',        'dinner','chinese'],
  ['酸辣土豆丝',   'Sour and Spicy Potato Strips',          'dinner','chinese'],
  ['干烧茄子',     'Dry Braised Eggplant',                  'dinner','chinese'],
  ['鱼香茄子',     'Yu-Shiang Eggplant',                    'dinner','chinese'],
  ['红烧茄子',     'Braised Eggplant',                      'dinner','chinese'],
  ['蒜蓉粉丝蒸娃娃菜','Steamed Baby Cabbage with Garlic',  'dinner','chinese'],
  ['清炒油麦菜',   'Sautéed Lettuce Hearts',                'dinner','chinese'],
  ['腐乳空心菜',   'Water Spinach with Fermented Bean Curd','dinner','chinese'],
  ['上汤娃娃菜',   'Baby Cabbage in Broth',                 'dinner','chinese'],
  ['虎皮青椒',     'Pan-Seared Green Chili Pepper',         'dinner','chinese'],
  ['糖醋藕片',     'Sweet and Sour Lotus Root',             'dinner','chinese'],
  ['凉拌黄瓜',     'Cucumber Salad with Garlic',            'dinner','chinese'],
  ['蒜泥拌茄子',   'Steamed Eggplant with Garlic Sauce',   'dinner','chinese'],
  ['香菇油菜',     'Sautéed Bok Choy with Mushrooms',      'dinner','chinese'],
  ['芹菜炒豆干',   'Sautéed Celery with Dried Tofu',       'dinner','chinese'],
  ['韭菜炒豆干',   'Sautéed Leeks with Dried Tofu',        'dinner','chinese'],
  ['凉拌三丝',     'Shredded Three Flavors Salad',          'dinner','chinese'],
  ['响油秋葵',     'Okra with Sizzling Oil',                'dinner','chinese'],
  ['葱油蚕豆',     'Fava Beans with Scallion Oil',         'dinner','chinese'],
  ['清炒南瓜',     'Sautéed Pumpkin Slices',               'dinner','chinese'],
  ['咸蛋黄煸苦瓜', 'Bitter Melon with Salted Egg Yolk',    'dinner','chinese'],
  ['冬瓜烧豆腐',   'Braised Winter Melon with Tofu',       'dinner','chinese'],
  ['雪菜毛豆',     'Sautéed Edamame with Preserved Veg',   'dinner','chinese'],
  ['扒油菜',       'Braised Bok Choy',                      'dinner','chinese'],
  ['扒口蘑',       'Braised Button Mushrooms',              'dinner','chinese'],
  ['葱烧木耳',     'Sautéed Wood Ear with Scallions',      'dinner','chinese'],
  ['溜豆腐',       'Sautéed Tofu in Thick Sauce',          'dinner','chinese'],
  ['脆皮豆腐',     'Crispy Tofu',                           'dinner','chinese'],
  ['椒盐豆腐',     'Salt and Pepper Tofu',                  'dinner','chinese'],
  ['孜然土豆片',   'Cumin Potato Slices',                   'dinner','chinese'],
  ['拔丝地瓜',     'Caramelized Sweet Potato',              'dinner','chinese'],

  // ── 一、中式家常菜 · 汤品与主食 (20道) ─────────────────────────────────
  ['西湖牛肉羹',   'West Lake Beef Soup',              'dinner','chinese'],
  ['紫菜蛋花汤',   'Seaweed Egg Drop Soup',            'dinner','chinese'],
  ['番茄牛腩汤',   'Tomato and Beef Brisket Soup',    'dinner','chinese'],
  ['莲藕排骨汤',   'Lotus Root and Rib Soup',         'dinner','chinese'],
  ['玉米排骨汤',   'Corn and Rib Soup',               'dinner','chinese'],
  ['冬瓜排骨汤',   'Winter Melon and Rib Soup',       'dinner','chinese'],
  ['酸辣汤',       'Hot and Sour Soup',               'dinner','chinese'],
  ['扬州炒饭',     'Yangzhou Fried Rice',             'dinner','chinese'],
  ['干炒牛河',     'Sautéed Rice Noodles with Beef', 'dinner','chinese'],
  ['酱油炒饭',     'Fried Rice with Soy Sauce',      'dinner','chinese'],
  ['西红柿鸡蛋面', 'Tomato and Egg Noodles',         'dinner','chinese'],
  ['担担面',       'Dan Dan Noodles',                 'dinner','chinese'],
  ['葱油拌面',     'Noodles with Scallion Oil',      'dinner','chinese'],
  ['炸酱面',       'Noodles with Bean Paste',        'dinner','chinese'],
  ['什锦汤面',     'Assorted Noodle Soup',           'dinner','chinese'],
  ['鲜肉水饺',     'Pork Dumplings',                 'dinner','chinese'],
  ['锅贴',         'Potstickers',                    'dinner','chinese'],
  ['生炒糯米饭',   'Stir-Fried Glutinous Rice',      'dinner','chinese'],
  ['排骨年糕',     'Ribs with Rice Cakes',           'dinner','chinese'],
  ['雪菜肉丝面',   'Noodles with Pork and Preserved Veg','dinner','chinese'],

  // ── 二、中式经典早餐 (30道) ─────────────────────────────────────────────
  ['豆浆',         'Soy Milk',                       'breakfast','chinese'],
  ['油条',         'Youtiao Deep-Fried Dough Sticks','breakfast','chinese'],
  ['茶叶蛋',       'Tea Egg',                        'breakfast','chinese'],
  ['葱油饼',       'Scallion Pancake',               'breakfast','chinese'],
  ['小笼包',       'Soup Dumplings',                 'breakfast','chinese'],
  ['煎饼果子',     'Jianbing Chinese Crepe',         'breakfast','chinese'],
  ['白粥',         'Plain Congee',                   'breakfast','chinese'],
  ['皮蛋瘦肉粥',   'Pork and Century Egg Congee',   'breakfast','chinese'],
  ['鲜肉包',       'Pork Buns',                      'breakfast','chinese'],
  ['馒头',         'Steamed Buns',                   'breakfast','chinese'],
  ['花卷',         'Scallion Rolls',                 'breakfast','chinese'],
  ['烧麦',         'Shumai',                         'breakfast','chinese'],
  ['肠粉',         'Rice Noodle Roll',               'breakfast','chinese'],
  ['豆腐脑',       'Tofu Pudding',                   'breakfast','chinese'],
  ['疙瘩汤',       'Dough Drop Soup',                'breakfast','chinese'],
  ['鸡蛋灌饼',     'Egg Filled Pancake',             'breakfast','chinese'],
  ['韭菜盒子',     'Leek Turnover',                  'breakfast','chinese'],
  ['虾饺',         'Har Gow Shrimp Dumplings',       'breakfast','chinese'],
  ['萝卜糕',       'Turnip Cake',                    'breakfast','chinese'],
  ['馄饨',         'Wonton Soup',                    'breakfast','chinese'],
  ['汤圆',         'Glutinous Rice Balls',           'breakfast','chinese'],
  ['芝麻糊',       'Sesame Paste',                   'breakfast','chinese'],
  ['素菜包',       'Vegetable Buns',                 'breakfast','chinese'],
  ['锅盔',         'Guokui Flatbread',               'breakfast','chinese'],
  ['鸡蛋软饼',     'Soft Egg Pancake',               'breakfast','chinese'],
  ['红薯粥',       'Sweet Potato Congee',            'breakfast','chinese'],
  ['八宝粥',       'Eight Treasure Congee',          'breakfast','chinese'],
  ['生煎包',       'Pan-fried Buns',                 'breakfast','chinese'],
  ['胡辣汤',       'Spicy Soup',                     'breakfast','chinese'],
  ['葱油拌面（早餐版）','Tossed Noodles with Scallion Oil','breakfast','chinese'],

  // ── 三、西式家常菜 · 肉类与海鲜主菜 (30道) ─────────────────────────────
  ['香煎牛排',       'Pan-seared Steak',                 'dinner','western'],
  ['红酒炖牛肉',     'Beef Stew',                        'dinner','western'],
  ['烤全鸡',         'Roast Chicken',                    'dinner','western'],
  ['柠檬黄油鸡排',   'Lemon Butter Chicken',             'dinner','western'],
  ['香煎三文鱼',     'Pan-seared Salmon',                'dinner','western'],
  ['烤鳕鱼',         'Baked Cod',                        'dinner','western'],
  ['香煎猪排',       'Pan-seared Pork Chops',            'dinner','western'],
  ['瑞典肉丸',       'Swedish Meatballs',                'dinner','western'],
  ['帕玛森芝士鸡排', 'Chicken Parmesan',                 'dinner','western'],
  ['蒜香黄油大虾',   'Garlic Butter Shrimp',             'dinner','western'],
  ['炸鱼薯条',       'Fish and Chips',                   'dinner','western'],
  ['牧羊人派',       "Shepherd's Pie",                   'dinner','western'],
  ['BBQ烤排骨',      'BBQ Ribs',                         'dinner','western'],
  ['俄式酸奶牛肉',   'Beef Stroganoff',                  'dinner','western'],
  ['墨西哥铁板鸡肉卷','Chicken Fajitas',                 'dinner','western'],
  ['脆皮烤鸡腿',     'Roasted Chicken Thighs',           'dinner','western'],
  ['香煎法式羊排',   'Pan-seared Lamb Chops',            'dinner','western'],
  ['美式烘焙肉卷',   'Meatloaf',                         'dinner','western'],
  ['慢炖手撕猪肉',   'Pulled Pork',                      'dinner','western'],
  ['柠檬刺山柑鸡排', 'Chicken Piccata',                  'dinner','western'],
  ['玛莎拉酒炖鸡',   'Chicken Marsala',                  'dinner','western'],
  ['白葡萄酒烩贻贝', 'Mussels in White Wine',            'dinner','western'],
  ['意式香肠炒彩椒', 'Sausage and Peppers',              'dinner','western'],
  ['邋遢乔汉堡肉',   'Sloppy Joes',                      'dinner','western'],
  ['墨西哥牛肉塔可', 'Beef Tacos',                       'dinner','western'],
  ['墨西哥辣肉酱',   'Chili Con Carne',                  'dinner','western'],
  ['香煎金枪鱼饼',   'Tuna Patties',                     'dinner','western'],
  ['蒜香白葡萄酒虾', 'Shrimp Scampi',                    'dinner','western'],
  ['肉馅烤彩椒',     'Stuffed Bell Peppers',             'dinner','western'],
  ['啤酒面糊炸鱼',   'Beer Battered Fish',               'dinner','western'],

  // ── 三、西式家常菜 · 意面与主食 (25道) ─────────────────────────────────
  ['经典肉酱意面',     'Spaghetti Bolognese',        'dinner','western'],
  ['奶油培根意面',     'Spaghetti Carbonara',        'dinner','western'],
  ['阿尔弗雷多宽面',   'Fettuccine Alfredo',         'dinner','western'],
  ['芝士通心粉',       'Macaroni and Cheese',        'dinner','western'],
  ['意式千层面',       'Lasagna',                    'dinner','western'],
  ['罗勒青酱意面',     'Pesto Pasta',                'dinner','western'],
  ['蒜香橄榄油意面',   'Aglio e Olio',               'dinner','western'],
  ['奶油蘑菇炖饭',     'Mushroom Risotto',           'dinner','western'],
  ['玛格丽特披萨',     'Margherita Pizza',           'dinner','western'],
  ['意式香肠披萨',     'Pepperoni Pizza',            'dinner','western'],
  ['西班牙海鲜饭',     'Seafood Paella',             'dinner','western'],
  ['经典牛肉汉堡',     'Beef Burger',                'dinner','western'],
  ['俱乐部三明治',     'Club Sandwich',              'dinner','western'],
  ['美式热狗',         'Classic Hot Dog',            'dinner','western'],
  ['鸡肉芝士薄饼',     'Chicken Quesadilla',         'dinner','western'],
  ['焗烤通心粉',       'Baked Ziti',                 'dinner','western'],
  ['愤怒酱意面',       'Penne Arrabbiata',           'dinner','western'],
  ['意式土豆疙瘩',     'Gnocchi',                    'dinner','western'],
  ['法棍披萨',         'French Bread Pizza',         'dinner','western'],
  ['培根生菜番茄三明治','BLT Sandwich',              'dinner','western'],
  ['金枪鱼沙拉三明治', 'Tuna Sandwich',              'dinner','western'],
  ['意式肉丸潜艇堡',   'Meatball Sub',               'dinner','western'],
  ['鸡肉卷',           'Chicken Wrap',               'dinner','western'],
  ['蒜香黄油烤面包',   'Garlic Bread',               'dinner','western'],
  ['瑞士芝士火锅',     'Cheese Fondue',              'dinner','western'],

  // ── 三、西式家常菜 · 汤、沙拉与配菜 (25道) ─────────────────────────────
  ['凯撒沙拉',       'Caesar Salad',                   'dinner','western'],
  ['考伯沙拉',       'Cobb Salad',                     'dinner','western'],
  ['卡布里沙拉',     'Caprese Salad',                  'dinner','western'],
  ['希腊沙拉',       'Greek Salad',                    'dinner','western'],
  ['美式土豆沙拉',   'Potato Salad',                   'dinner','western'],
  ['凉拌卷心菜丝',   'Coleslaw',                       'dinner','western'],
  ['奶油蘑菇汤',     'Cream of Mushroom Soup',         'dinner','western'],
  ['意式番茄浓汤',   'Tomato Soup',                    'dinner','western'],
  ['意式蔬菜杂蔬汤', 'Minestrone Soup',                'dinner','western'],
  ['法式洋葱汤',     'French Onion Soup',              'dinner','western'],
  ['新英格兰蛤蜊巧达汤','Clam Chowder',               'dinner','western'],
  ['南瓜奶油浓汤',   'Pumpkin Soup',                   'dinner','western'],
  ['奶香土豆泥',     'Mashed Potatoes',                'dinner','western'],
  ['美式炸薯条',     'French Fries',                   'dinner','western'],
  ['香草烤小土豆',   'Roast Potatoes',                 'dinner','western'],
  ['黄油煎蘑菇',     'Sautéed Mushrooms',              'dinner','western'],
  ['奶油菠菜',       'Creamed Spinach',                'dinner','western'],
  ['黑胡椒烤芦笋',   'Roasted Asparagus',              'dinner','western'],
  ['蒜香黄油西兰花', 'Garlic Butter Broccoli',         'dinner','western'],
  ['黄油煮玉米',     'Corn on the Cob',                'dinner','western'],
  ['普罗旺斯炖菜',   'Ratatouille',                    'dinner','western'],
  ['通心粉冷沙拉',   'Macaroni Salad',                 'dinner','western'],
  ['意式番茄烤面包塔','Bruschetta',                    'dinner','western'],
  ['茄汁焗豆',       'Baked Beans',                    'dinner','western'],
  ['芝士薯饼烤盘',   'Hash Brown Casserole',           'dinner','western'],

  // ── 四、西式经典早餐 (20道) ─────────────────────────────────────────────
  ['经典美式煎饼',   'Pancakes',                       'breakfast','western'],
  ['华夫饼',         'Waffles',                        'breakfast','western'],
  ['法式吐司',       'French Toast',                   'breakfast','western'],
  ['燕麦粥',         'Oatmeal',                        'breakfast','western'],
  ['美式软炒蛋',     'Scrambled Eggs',                 'breakfast','western'],
  ['单面煎荷包蛋',   'Sunny Side Up',                  'breakfast','western'],
  ['西式芝士煎蛋卷', 'Omelette',                       'breakfast','western'],
  ['班尼迪克蛋',     'Eggs Benedict',                  'breakfast','western'],
  ['牛油果吐司',     'Avocado Toast',                  'breakfast','western'],
  ['奶油芝士贝果',   'Bagel with Cream Cheese',        'breakfast','western'],
  ['炸薯饼',         'Hash Browns',                    'breakfast','western'],
  ['煎早餐香肠',     'Breakfast Sausage',              'breakfast','western'],
  ['脆皮培根',       'Crispy Bacon',                   'breakfast','western'],
  ['早餐墨西哥卷',   'Breakfast Burrito',              'breakfast','western'],
  ['牛角包',         'Croissant',                      'breakfast','western'],
  ['酸奶谷物坚果碗', 'Granola with Yogurt',            'breakfast','western'],
  ['巴西莓果昔碗',   'Smoothie Bowl',                  'breakfast','western'],
  ['英式玛芬夹蛋',   'English Muffin Sandwich',        'breakfast','western'],
  ['综合鲜果沙拉',   'Fruit Salad',                    'breakfast','western'],
  ['北非番茄烤蛋',   'Shakshuka Baked Eggs',           'breakfast','western'],
];

// ── Gemini batch enrichment ──────────────────────────────────────────────────

interface EnrichedDish {
  title_zh: string;
  title_en: string;
  meal_type: string;
  origin_cuisine: string;
  flavor_tags: string[];
  health_benefit_tags: string[];
  main_ingredient: string;
  seasonal_tag: string;
  description_zh: string;
  description_en: string;
}

const CUISINE_VALUES  = 'cantonese|sichuan|jiangnan|northern|western|japanese_korean|southeast_asian';
const FLAVOR_VALUES   = 'light|spicy|sweet|salty|sour|seafood|veggie';
const HEALTH_VALUES   = 'damp_clear|muscle_gain|lose_weight|maintain|detox';
const INGR_VALUES     = 'beef|chicken|pork|fish|shrimp|crab|squid|scallop|oyster|clam|salmon|cod|seabass|hairtail|tuna|duck|lamb|egg|tofu|mushroom|veggie|carb|dessert|other';
const SEASON_VALUES   = 'All-Season/Balanced|Spring|Summer|Autumn|Winter';

// Valid enum values for DB columns
const VALID_FLAVOR_TAGS   = new Set(['light','spicy','sweet','salty','sour','seafood','veggie']);
const VALID_HEALTH_TAGS   = new Set(['lose_weight','muscle_gain','maintain','detox','pregnancy','damp_clear','authentic_hk']);

function sanitizeFlavors(tags: string[]): string[] {
  const filtered = tags.filter(t => VALID_FLAVOR_TAGS.has(t));
  return filtered.length > 0 ? filtered : ['light'];
}
function sanitizeHealth(tags: string[]): string[] {
  const filtered = tags.filter(t => VALID_HEALTH_TAGS.has(t));
  return filtered.length > 0 ? filtered : ['maintain'];
}

function buildPrompt(batch: RawDish[]): string {
  const list = batch.map(([zh, en, meal, style]) =>
    `- ${zh} (${en}) [meal:${meal}, style:${style}]`
  ).join('\n');

  return `You are a culinary data expert specializing in Chinese and Western home cooking.

For each dish below, return a JSON array (one object per dish) with EXACTLY these fields:
- title_zh: the Chinese name as given
- origin_cuisine: one of [${CUISINE_VALUES}]
- flavor_tags: array, pick 1-3 from [${FLAVOR_VALUES}]
- health_benefit_tags: array, pick 1-3 from [${HEALTH_VALUES}]
- main_ingredient: ONE value from [${INGR_VALUES}]
- seasonal_tag: one of [${SEASON_VALUES}]
- description_zh: ≤15 Chinese characters, appetizing summary
- description_en: ≤20 English words, appetizing summary

Rules:
- Western dishes → origin_cuisine: western
- Cantonese style → cantonese; Sichuan/spicy → sichuan; Northern Chinese → northern
- Breakfast items (porridge, buns, crepes, eggs): health_benefit_tags should include "maintain"
- Steamed/light dishes → include "light" in flavor_tags; soup → "light"
- Spicy dishes → include "spicy" in flavor_tags
- Vegetable/tofu dishes → include "veggie" in flavor_tags + health_benefit_tags "maintain" or "detox"
- Seafood dishes → include "seafood" in flavor_tags
- Carb mains (noodles, rice, bread, dumplings) → main_ingredient: carb
- Salads/cold dishes → health_benefit_tags should include "lose_weight" or "detox"

Dishes to classify:
${list}

Return ONLY a valid JSON array, no markdown, no explanation.`;
}

async function enrichBatch(batch: RawDish[]): Promise<EnrichedDish[]> {
  const prompt = buildPrompt(batch);

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(JSON.stringify(json));
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  let parsed: any[] = [];
  try {
    // Strip markdown code fences if any
    const clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    console.warn('  ⚠ JSON parse failed, raw:', text.slice(0, 200));
  }

  return batch.map(([zh, en, meal], idx) => {
    const g = parsed[idx] ?? {};
    return {
      title_zh:            zh,
      title_en:            en,
      meal_type:           meal,
      origin_cuisine:      g.origin_cuisine      ?? (batch[idx][3] === 'western' ? 'western' : 'cantonese'),
      flavor_tags:         Array.isArray(g.flavor_tags)         ? g.flavor_tags         : ['light'],
      health_benefit_tags: Array.isArray(g.health_benefit_tags) ? g.health_benefit_tags : ['maintain'],
      main_ingredient:     g.main_ingredient     ?? 'other',
      seasonal_tag:        g.seasonal_tag        ?? 'All-Season/Balanced',
      description_zh:      g.description_zh      ?? '',
      description_en:      g.description_en      ?? '',
    };
  });
}

// ── Chunk helper ─────────────────────────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🍽  Nutri-Pilot dish enrichment pipeline`);
  console.log(`   ${ALL_DISHES.length} dishes · batch=${BATCH_SIZE} · dry-run=${DRY_RUN}\n`);

  const batches = chunk(ALL_DISHES, BATCH_SIZE);
  const allEnriched: EnrichedDish[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  [${i + 1}/${batches.length}] ${batch[0][0]} … `);
    try {
      const enriched = await enrichBatch(batch);
      allEnriched.push(...enriched);
      console.log(`✅ (${enriched.length} dishes)`);
    } catch (err: any) {
      console.warn(`⚠ ${err?.message ?? err}`);
      // Push placeholder so indices stay aligned
      batch.forEach(([zh, en, meal, style]) => allEnriched.push({
        title_zh: zh, title_en: en, meal_type: meal,
        origin_cuisine: style === 'western' ? 'western' : 'cantonese',
        flavor_tags: ['light'], health_benefit_tags: ['maintain'],
        main_ingredient: 'other', seasonal_tag: 'All-Season/Balanced',
        description_zh: '', description_en: '',
      }));
    }
    // Rate limit: ~1 req/s
    if (i < batches.length - 1) await new Promise(r => setTimeout(r, 1100));
  }

  console.log(`\n📊 Enrichment complete: ${allEnriched.length} dishes ready`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] First 3 dishes:');
    allEnriched.slice(0, 3).forEach(d => console.log(JSON.stringify(d, null, 2)));
    return;
  }

  // ── Write to DB ────────────────────────────────────────────────────────────
  await db.connect();
  console.log('\n🔗 Connected to DB');

  // Clear old dishes (keeps schema, removes all rows)
  const { rowCount: deleted } = await db.query('DELETE FROM dishes');
  console.log(`🗑  Cleared ${deleted} old dishes`);

  let inserted = 0;
  for (const d of allEnriched) {
    try {
      const flavorTags  = sanitizeFlavors(d.flavor_tags);
      const healthTags  = sanitizeHealth(d.health_benefit_tags);
      await db.query(`
        INSERT INTO dishes
          (title_zh, title_en, meal_type, origin_cuisine,
           flavor_tags, health_benefit_tags, main_ingredient,
           seasonal_tag, description_zh, description_en, image_url, is_vegan)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'',false)
      `, [
        d.title_zh, d.title_en, d.meal_type, d.origin_cuisine,
        flavorTags, healthTags,
        d.main_ingredient, d.seasonal_tag, d.description_zh, d.description_en,
      ]);
      inserted++;
    } catch (err: any) {
      console.warn(`  ⚠ Insert failed for ${d.title_zh}: ${err?.message}`);
    }
  }

  console.log(`✅ Inserted ${inserted}/${allEnriched.length} dishes`);

  // Summary
  const { rows: summary } = await db.query(`
    SELECT meal_type, COUNT(*)::int AS cnt
    FROM dishes GROUP BY meal_type ORDER BY cnt DESC
  `);
  console.log('\n📊 By meal type:');
  summary.forEach(r => console.log(`   ${(r.meal_type ?? 'null').padEnd(12)} ${r.cnt}`));

  const { rows: ing } = await db.query(`
    SELECT main_ingredient, COUNT(*)::int AS cnt
    FROM dishes GROUP BY main_ingredient ORDER BY cnt DESC LIMIT 10
  `);
  console.log('\n📊 Top ingredients:');
  ing.forEach(r => console.log(`   ${r.main_ingredient.padEnd(12)} ${r.cnt}`));

  await db.end();
  console.log('\n✅ Done — dishes table updated with 300 classic dishes');
}

main().catch(err => { console.error(err); process.exit(1); });
