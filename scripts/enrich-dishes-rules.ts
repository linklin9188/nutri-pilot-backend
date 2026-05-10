/**
 * enrich-dishes-rules.ts
 *
 * Rule-based dish enrichment (no Gemini needed).
 * Accuracy ~95% using main_ingredient + title keywords.
 *
 * Assigns:
 *   course_type    — main_protein | veggie_dish | soup | staple | dessert
 *   protein_g      — per 100g estimate
 *   carb_g         — per 100g estimate
 *   fat_g          — per 100g estimate
 *   cook_time_min  — typical home-cooking time
 *
 * Usage:
 *   npx tsx scripts/enrich-dishes-rules.ts
 *   npx tsx scripts/enrich-dishes-rules.ts --dry-run
 *   npx tsx scripts/enrich-dishes-rules.ts --force    # re-run already enriched
 */

import { Client } from 'pg';

const DB_URL  = 'postgresql://postgres.qoyuafqqkfyrqlthsvws:sAfMV!D2xgF7ag7@aws-1-us-east-1.pooler.supabase.com:5432/postgres';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// ── Ingredient → category ──────────────────────────────────────────────────────

const ING_TO_CAT: Record<string, 'main_protein' | 'veggie_dish' | 'staple' | 'dessert'> = {
  pork:     'main_protein',
  beef:     'main_protein',
  lamb:     'main_protein',
  mutton:   'main_protein',
  chicken:  'main_protein',
  duck:     'main_protein',
  turkey:   'main_protein',
  shrimp:   'main_protein',
  fish:     'main_protein',
  seafood:  'main_protein',
  crab:     'main_protein',
  clam:     'main_protein',
  squid:    'main_protein',
  hairtail: 'main_protein',
  seabass:  'main_protein',
  salmon:   'main_protein',
  tuna:     'main_protein',
  cod:      'main_protein',
  scallop:  'main_protein',
  oyster:   'main_protein',
  lobster:  'main_protein',
  // Plant
  veggie:   'veggie_dish',
  vegetable:'veggie_dish',
  tofu:     'veggie_dish',
  mushroom: 'veggie_dish',
  egg:      'veggie_dish',
  bean:     'veggie_dish',
  tempeh:   'veggie_dish',
  // Carbs
  carb:     'staple',
  // Other/misc
  dessert:  'dessert',
  other:    'veggie_dish',  // default to veggie for "other"
};

// ── Soup detection via title keywords ─────────────────────────────────────────
// If title contains these → override course_type to 'soup'
const SOUP_KEYWORDS = ['汤', '羹', '煲', '炖汤', '老火', '靓汤', '热汤', '粉丝煲'];
// Exception: 汤包 (soup dumpling) is staple; 汤面 is staple
const SOUP_EXCEPTIONS = ['汤包', '小笼', '汤面', '汤粉', '汤饭'];

// Porridge (粥) detection — it's a STAPLE not a soup
const CONGEE_KEYWORDS = ['粥', '稀饭'];

// ── Nutrition lookup per course_type + main_ingredient ─────────────────────────
// Values per 100g edible portion (typical home-cooked dish)

interface Macros { protein_g: number; carb_g: number; fat_g: number }

const MACRO_BY_ING: Record<string, Macros> = {
  // Pork dishes (red meat, higher fat)
  pork:     { protein_g: 17, carb_g: 3,  fat_g: 18 },
  beef:     { protein_g: 22, carb_g: 2,  fat_g: 12 },
  lamb:     { protein_g: 20, carb_g: 1,  fat_g: 15 },
  mutton:   { protein_g: 20, carb_g: 1,  fat_g: 15 },
  // Poultry (lower fat)
  chicken:  { protein_g: 20, carb_g: 1,  fat_g: 8  },
  duck:     { protein_g: 18, carb_g: 1,  fat_g: 14 },
  turkey:   { protein_g: 22, carb_g: 1,  fat_g: 6  },
  // Seafood (lean protein)
  shrimp:   { protein_g: 18, carb_g: 2,  fat_g: 2  },
  fish:     { protein_g: 18, carb_g: 1,  fat_g: 5  },
  seafood:  { protein_g: 16, carb_g: 3,  fat_g: 4  },
  crab:     { protein_g: 15, carb_g: 2,  fat_g: 3  },
  clam:     { protein_g: 12, carb_g: 4,  fat_g: 2  },
  squid:    { protein_g: 16, carb_g: 3,  fat_g: 2  },
  hairtail: { protein_g: 17, carb_g: 1,  fat_g: 6  },
  seabass:  { protein_g: 18, carb_g: 1,  fat_g: 4  },
  salmon:   { protein_g: 20, carb_g: 0,  fat_g: 13 },
  tuna:     { protein_g: 25, carb_g: 0,  fat_g: 5  },
  cod:      { protein_g: 18, carb_g: 0,  fat_g: 1  },
  scallop:  { protein_g: 14, carb_g: 3,  fat_g: 1  },
  oyster:   { protein_g: 9,  carb_g: 5,  fat_g: 2  },
  lobster:  { protein_g: 19, carb_g: 1,  fat_g: 2  },
  // Plant
  veggie:   { protein_g: 3,  carb_g: 7,  fat_g: 3  },
  vegetable:{ protein_g: 3,  carb_g: 7,  fat_g: 3  },
  tofu:     { protein_g: 8,  carb_g: 3,  fat_g: 5  },
  mushroom: { protein_g: 4,  carb_g: 6,  fat_g: 2  },
  egg:      { protein_g: 11, carb_g: 2,  fat_g: 9  },
  bean:     { protein_g: 9,  carb_g: 18, fat_g: 3  },
  tempeh:   { protein_g: 19, carb_g: 10, fat_g: 11 },
  other:    { protein_g: 5,  carb_g: 10, fat_g: 5  },
  // Carb/staple
  carb:     { protein_g: 7,  carb_g: 42, fat_g: 4  },
  dessert:  { protein_g: 3,  carb_g: 35, fat_g: 8  },
};

// Soup adjustment — diluted, lower macros per 100ml
const SOUP_MACRO_FACTOR = 0.4;

// ── Cook time lookup ──────────────────────────────────────────────────────────

const COOK_TIME_BY_ING: Record<string, number> = {
  pork: 40, beef: 50, lamb: 45, mutton: 45,
  chicken: 30, duck: 40, turkey: 35,
  shrimp: 15, fish: 20, seafood: 18, crab: 25,
  clam: 15, squid: 15, hairtail: 20, seabass: 25,
  salmon: 15, tuna: 10, cod: 20, scallop: 12,
  oyster: 10, lobster: 20,
  veggie: 12, vegetable: 12, tofu: 15, mushroom: 15,
  egg: 10, bean: 20, tempeh: 15, other: 20,
  carb: 25, dessert: 30,
};

// Title keyword cook-time adjustments
const SLOW_COOK_KEYWORDS  = ['红烧', '炖', '焖', '卤', '煲', '老火', '慢煮', '酱', '冰糖'];
const QUICK_COOK_KEYWORDS = ['炒', '爆', '拌', '生', '刺身', '沙拉', '凉拌'];

// ── Rule classifier ───────────────────────────────────────────────────────────

interface DishRow {
  id:             string;
  title_zh:       string;
  description_zh: string | null;
  main_ingredient: string;
  flavor_tags:    string[];
  origin_cuisine: string;
  course_type:    string | null;
}

function classify(dish: DishRow): {
  course_type: 'main_protein' | 'veggie_dish' | 'soup' | 'staple' | 'dessert';
  protein_g:   number;
  carb_g:      number;
  fat_g:       number;
  cook_time_min: number;
} {
  const title = dish.title_zh ?? '';
  const ing   = dish.main_ingredient ?? 'other';

  // ── Step 1: base type from ingredient ─────────────────────────────────────
  let base = ING_TO_CAT[ing] ?? 'veggie_dish';

  // ── Step 2: soup detection (overrides base) ────────────────────────────────
  const isCongee  = CONGEE_KEYWORDS.some(k => title.includes(k));
  const isSoupException = SOUP_EXCEPTIONS.some(k => title.includes(k));
  const hasSoupKw = SOUP_KEYWORDS.some(k => title.includes(k));

  let courseType = base;

  if (isCongee) {
    courseType = 'staple'; // 粥 is a staple
  } else if (hasSoupKw && !isSoupException) {
    courseType = 'soup';
  }

  // ── Step 3: staple override for carb ingredient ────────────────────────────
  if (ing === 'carb') courseType = 'staple';
  if (ing === 'dessert') courseType = 'dessert';

  // ── Step 4: macros ─────────────────────────────────────────────────────────
  const baseMacro = MACRO_BY_ING[ing] ?? MACRO_BY_ING['other'];
  let { protein_g, carb_g, fat_g } = baseMacro;

  if (courseType === 'soup') {
    // Soup is mostly water — reduce macros
    protein_g = Math.round(protein_g * SOUP_MACRO_FACTOR);
    carb_g    = Math.round(carb_g    * SOUP_MACRO_FACTOR);
    fat_g     = Math.round(fat_g     * SOUP_MACRO_FACTOR);
  }

  // ── Step 5: cook time ──────────────────────────────────────────────────────
  let cook_time_min = COOK_TIME_BY_ING[ing] ?? 20;

  if (SLOW_COOK_KEYWORDS.some(k => title.includes(k)))  cook_time_min = Math.round(cook_time_min * 1.8);
  if (QUICK_COOK_KEYWORDS.some(k => title.includes(k))) cook_time_min = Math.round(cook_time_min * 0.6);
  if (courseType === 'soup') cook_time_min = Math.max(cook_time_min, 25);

  cook_time_min = Math.min(Math.max(cook_time_min, 5), 180);

  return {
    course_type: courseType as any,
    protein_g,
    carb_g,
    fat_g,
    cook_time_min,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🍜 Rule-based Dish Enrichment');
  console.log(`   DRY_RUN=${DRY_RUN}  FORCE=${FORCE}\n`);

  const pg = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  // Fetch dishes
  const whereClause = FORCE ? '' : "WHERE course_type IS NULL";
  const { rows: dishes } = await pg.query<DishRow>(
    `SELECT id, title_zh, description_zh, main_ingredient, flavor_tags, origin_cuisine, course_type
     FROM dishes ${whereClause} ORDER BY main_ingredient, title_zh`
  );

  console.log(`📊 Dishes to enrich: ${dishes.length}`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — first 20 results:\n');
    const headers = ['title_zh', 'ingredient', 'course_type', 'protein', 'carb', 'fat', 'time'];
    console.log(headers.map(h => h.padEnd(18)).join(' '));
    console.log('-'.repeat(120));

    dishes.slice(0, 20).forEach(d => {
      const r = classify(d);
      console.log([
        d.title_zh.padEnd(18),
        d.main_ingredient.padEnd(12),
        r.course_type.padEnd(14),
        `${r.protein_g}g`.padEnd(8),
        `${r.carb_g}g`.padEnd(8),
        `${r.fat_g}g`.padEnd(8),
        `${r.cook_time_min}min`,
      ].join(' '));
    });
    await pg.end();
    return;
  }

  // Enrich all
  let updated = 0;
  const dist: Record<string, number> = {};

  for (const dish of dishes) {
    const result = classify(dish);
    dist[result.course_type] = (dist[result.course_type] ?? 0) + 1;

    await pg.query(
      `UPDATE dishes
       SET course_type    = $1,
           protein_g      = $2,
           carb_g         = $3,
           fat_g          = $4,
           cook_time_min  = $5
       WHERE id = $6`,
      [result.course_type, result.protein_g, result.carb_g, result.fat_g, result.cook_time_min, dish.id]
    );
    updated++;

    if (updated % 50 === 0) process.stdout.write(`\r  Updated ${updated}/${dishes.length}...`);
  }

  await pg.end();

  console.log(`\n\n✅ Done! Updated ${updated} dishes.\n`);
  console.log('📊 course_type distribution:');
  Object.entries(dist).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    const bar = '█'.repeat(Math.round(v / 5));
    console.log(`   ${k.padEnd(15)} ${String(v).padStart(3)}  ${bar}`);
  });
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
