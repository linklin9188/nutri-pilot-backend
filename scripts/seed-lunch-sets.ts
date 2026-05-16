/**
 * seed-lunch-sets.ts — fill the lunch-only 盖饭 / 面套餐 gap.
 *
 * All 20 dishes are inserted with meal_type='lunch' so they ONLY show up
 * in the 午餐 pool — never breakfast, never dinner. The recommend hook's
 * mealTypeFilter map:
 *    '早餐': ['breakfast']
 *    '午餐': ['lunch','dinner','all']
 *    '晚餐': ['dinner','all']
 * means meal_type='lunch' lights up exclusively at lunch.
 *
 * Categories:
 *   港式快餐盖饭 (7): 黑椒牛柳饭/滑蛋虾仁饭/叉烧饭/烧鸭饭/卤肉饭/咖喱鸡饭/蜜汁叉烧饭
 *   上班族盖饭   (4): 鸡腿盖饭/排骨盖饭/番茄牛肉盖饭/鱼香肉丝盖饭
 *   北方面       (4): 兰州拉面/油泼面/阳春面/清汤牛肉面
 *   川式         (3): 红油抄手/重庆小面/酸辣粉
 *   港式烧味饭   (2): 烧腊双拼饭/切鸡饭
 *
 * Idempotent: ON conflict by title_zh is skipped.
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

interface DishSeed {
  title_zh: string;
  title_en: string;
  description_zh: string;
  description_en: string;
  origin_cuisine: string;
  main_ingredient: string;
  course_type: 'staple' | 'main_protein';
  flavor_tags: string[];
  health_benefit_tags: string[];
  is_vegan: boolean;
  execution_level: number;
}

const SEEDS: DishSeed[] = [
  // ── 港式快餐盖饭 (7) ──
  { title_zh: '黑椒牛柳饭', title_en: 'Black Pepper Beef Rice',
    description_zh: '牛柳条配洋葱青椒，黑椒汁勾芡，浇在白米饭上，港式茶餐厅经典。',
    description_en: 'Beef strips with onion & bell pepper in black pepper sauce over rice.',
    origin_cuisine: 'cantonese', main_ingredient: 'beef', course_type: 'staple',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein', 'muscle_gain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '滑蛋虾仁饭', title_en: 'Shrimp & Scrambled Egg Rice',
    description_zh: '虾仁配嫩滑蛋液炒香，盖在白饭上，富含蛋白质，老少咸宜。',
    description_en: 'Stir-fried shrimp with silky scrambled egg over rice.',
    origin_cuisine: 'cantonese', main_ingredient: 'shrimp', course_type: 'staple',
    flavor_tags: ['light', 'savory'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '叉烧饭', title_en: 'Char Siu Rice',
    description_zh: '蜜汁叉烧切片，配青菜白饭，淋少许叉烧汁，港人午餐最爱。',
    description_en: 'Sliced honey-glazed BBQ pork with bok choy and rice.',
    origin_cuisine: 'cantonese', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['sweet', 'savory'], health_benefit_tags: ['high_protein'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '烧鸭饭', title_en: 'Roast Duck Rice',
    description_zh: '广式烧鸭切件，配白饭、青菜、淋烧鸭汁，皮脆肉嫩。',
    description_en: 'Cantonese roast duck pieces over rice with greens and jus.',
    origin_cuisine: 'cantonese', main_ingredient: 'poultry', course_type: 'staple',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '卤肉饭', title_en: 'Braised Pork Rice',
    description_zh: '台式卤肉酱浇在白饭上，配卤蛋和酸菜，咸香入味、暖胃满足。',
    description_en: 'Taiwan-style braised pork over rice with braised egg and pickle.',
    origin_cuisine: 'cantonese', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['savory', 'sweet'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '咖喱鸡饭', title_en: 'Curry Chicken Rice',
    description_zh: '鸡腿肉配土豆、胡萝卜、洋葱炖咖喱，配白饭，香料温和不辣。',
    description_en: 'Chicken thigh with potato, carrot, onion in mild curry over rice.',
    origin_cuisine: 'cantonese', main_ingredient: 'poultry', course_type: 'staple',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '蜜汁叉烧饭', title_en: 'Honey Char Siu Rice',
    description_zh: '叉烧用蜜汁腌制再烤，外焦内嫩，淋酱汁配饭，比普通叉烧饭更甜香。',
    description_en: 'Honey-marinated BBQ pork over rice — sweeter and stickier.',
    origin_cuisine: 'cantonese', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['sweet', 'savory'], health_benefit_tags: ['high_protein'],
    is_vegan: false, execution_level: 1 },

  // ── 上班族盖饭 (4) ──
  { title_zh: '鸡腿盖饭', title_en: 'Chicken Leg Rice Bowl',
    description_zh: '去骨鸡腿煎至金黄，淋照烧/葱油汁，配白饭和蔬菜，简单高蛋白。',
    description_en: 'Pan-seared boneless chicken leg with teriyaki sauce over rice + veg.',
    origin_cuisine: 'northern', main_ingredient: 'poultry', course_type: 'staple',
    flavor_tags: ['savory', 'sweet'], health_benefit_tags: ['high_protein', 'muscle_gain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '排骨盖饭', title_en: 'Pork Rib Rice Bowl',
    description_zh: '炸或卤排骨配白饭，淋酱汁和青菜，上班族午餐常见选择。',
    description_en: 'Fried or braised pork ribs over rice with sauce and greens.',
    origin_cuisine: 'northern', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '番茄牛肉盖饭', title_en: 'Tomato Beef Rice Bowl',
    description_zh: '牛肉片炒番茄炖出酸甜汤汁，浇白饭上，开胃又营养。',
    description_en: 'Beef slices simmered with tomato into tangy sauce over rice.',
    origin_cuisine: 'northern', main_ingredient: 'beef', course_type: 'staple',
    flavor_tags: ['sweet', 'sour'], health_benefit_tags: ['high_protein', 'muscle_gain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '鱼香肉丝盖饭', title_en: 'Fish-fragrant Pork Rice Bowl',
    description_zh: '肉丝、木耳、胡萝卜丝、笋丝鱼香味炒制，淋酸甜微辣酱汁配饭。',
    description_en: 'Pork shreds with fungus, carrot, bamboo in fish-fragrant sauce over rice.',
    origin_cuisine: 'sichuan', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['sweet', 'sour', 'savory'], health_benefit_tags: ['high_protein'],
    is_vegan: false, execution_level: 1 },

  // ── 北方面 (4) ──
  { title_zh: '兰州拉面', title_en: 'Lanzhou Beef Noodles',
    description_zh: '手拉面配清汤牛肉，撒葱花、香菜、辣椒油，西北经典。',
    description_en: 'Hand-pulled noodles in clear beef broth with scallion, cilantro, chili oil.',
    origin_cuisine: 'northern', main_ingredient: 'beef', course_type: 'staple',
    flavor_tags: ['savory', 'aromatic'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 2 },
  { title_zh: '油泼面', title_en: 'Hot Oil Noodles (Youpo Mian)',
    description_zh: '宽面煮熟撒辣椒粉、葱花、蒜末，热油浇上"刺啦"一声，陕西经典。',
    description_en: 'Wide noodles topped with chili, scallion, garlic — finished with sizzling hot oil.',
    origin_cuisine: 'northern', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['spicy', 'aromatic'], health_benefit_tags: ['maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '阳春面', title_en: 'Yangchun Noodles',
    description_zh: '清汤面，加点猪油、葱花、酱油，朴素到极致的江浙家常。',
    description_en: 'Plain noodles in clear broth with lard, scallion, soy — humble classic.',
    origin_cuisine: 'jiangnan', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['light', 'savory'], health_benefit_tags: ['maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '清汤牛肉面', title_en: 'Clear Broth Beef Noodles',
    description_zh: '牛骨清汤煮面，配卤牛肉片和小白菜，比兰州拉面更家常。',
    description_en: 'Beef-bone clear broth with noodles, sliced braised beef, bok choy.',
    origin_cuisine: 'northern', main_ingredient: 'beef', course_type: 'staple',
    flavor_tags: ['light', 'savory'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },

  // ── 川式 (3) ──
  { title_zh: '红油抄手', title_en: 'Hot Oil Wonton',
    description_zh: '猪肉馄饨煮熟，淋红油辣酱、蒜泥、葱花，川渝早午餐都吃。',
    description_en: 'Pork wontons in chili oil with garlic and scallion — Sichuan classic.',
    origin_cuisine: 'sichuan', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['spicy', 'savory'], health_benefit_tags: ['maintain'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '重庆小面', title_en: 'Chongqing Xiao Mian',
    description_zh: '碱水面配麻辣酱底，撒花生碎、葱花、芽菜，重庆人最爱。',
    description_en: 'Alkaline noodles in spicy ma-la sauce with peanut, scallion, preserved veg.',
    origin_cuisine: 'sichuan', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['spicy', 'aromatic'], health_benefit_tags: ['maintain'],
    is_vegan: true, execution_level: 1 },
  { title_zh: '酸辣粉', title_en: 'Hot & Sour Sweet Potato Noodles',
    description_zh: '红薯粉条 + 酸辣汤底 + 花生 + 香菜 + 榨菜，开胃醒神。',
    description_en: 'Sweet potato noodles in hot-sour broth with peanut, cilantro, pickle.',
    origin_cuisine: 'sichuan', main_ingredient: 'grain', course_type: 'staple',
    flavor_tags: ['spicy', 'sour'], health_benefit_tags: ['detox'],
    is_vegan: true, execution_level: 1 },

  // ── 港式烧味饭 (2) ──
  { title_zh: '烧腊双拼饭', title_en: 'Roast Meat Combo Rice',
    description_zh: '叉烧 + 烧鸭（或烧肉）双拼，配青菜和白饭，淋烧腊汁。',
    description_en: 'Combo of char siu + roast duck (or roast pork) over rice with greens.',
    origin_cuisine: 'cantonese', main_ingredient: 'pork', course_type: 'staple',
    flavor_tags: ['savory', 'sweet', 'aromatic'], health_benefit_tags: ['high_protein'],
    is_vegan: false, execution_level: 1 },
  { title_zh: '切鸡饭', title_en: 'Poached Chicken Rice',
    description_zh: '白切鸡切件铺白饭上，配姜葱蓉蘸料和青菜，清淡不油。',
    description_en: 'Poached chicken sliced over rice with ginger-scallion dip and greens.',
    origin_cuisine: 'cantonese', main_ingredient: 'poultry', course_type: 'staple',
    flavor_tags: ['light', 'savory'], health_benefit_tags: ['high_protein', 'maintain'],
    is_vegan: false, execution_level: 1 },
];

(async () => {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let inserted = 0, skipped = 0;
  for (const s of SEEDS) {
    const exists = await db.query(`SELECT 1 FROM dishes WHERE title_zh = $1 LIMIT 1`, [s.title_zh]);
    if (exists.rows.length > 0) {
      console.log(`  ⏭  ${s.title_zh} (已存在)`);
      skipped++;
      continue;
    }
    await db.query(`
      INSERT INTO dishes(
        title_zh, title_en, description_zh, description_en,
        meal_type, origin_cuisine, main_ingredient, course_type,
        flavor_tags, health_benefit_tags,
        seasonal_tag, is_vegan, execution_level
      ) VALUES ($1,$2,$3,$4,'lunch',$5,$6,$7,$8,$9,'All-Season/Balanced',$10,$11)
    `, [
      s.title_zh, s.title_en, s.description_zh, s.description_en,
      s.origin_cuisine, s.main_ingredient, s.course_type,
      s.flavor_tags, s.health_benefit_tags,
      s.is_vegan, s.execution_level,
    ]);
    console.log(`  ✅ ${s.title_zh.padEnd(14)} [${s.origin_cuisine}/${s.main_ingredient}]`);
    inserted++;
  }
  console.log(`\n📊 Done: ${inserted} inserted · ${skipped} skipped (all meal_type='lunch')`);
  await db.end();
})();
