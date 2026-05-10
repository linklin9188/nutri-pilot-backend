/**
 * dishIngredients.ts
 *
 * Converts a SupabaseDish (with course_type + main_ingredient from DB) into
 * a concrete shopping ingredient list with quantities scaled to headcount.
 *
 * Accuracy target: ~90% (rule-based, avoids Gemini API for speed).
 *
 * Portion baselines (raw weight per adult serving):
 *   main_protein  — meat/poultry: 150g | seafood: 200g (shell/bone waste)
 *   veggie_dish   — 200g per person
 *   soup          — 120g main ingredient + 200ml broth per person
 *   staple        — 80g dry weight per person (rice/noodle)
 *   dessert        — 80g per person
 *
 * Kids count as 0.5 portions.
 */

export interface ShoppingIngredient {
  id: string;
  dishId: string;
  dishTitle: string;
  name: string;          // display name (bilingual)
  nameZh: string;        // short Chinese name for grouping
  type: 'Meat/Seafood' | 'Produce' | 'Staples';
  weightGrams: number;   // already scaled to headcount
  unit: 'g' | 'ml' | 'piece';
  category: string;      // for aggregation: 'pork' | 'seafood' | 'veggie' | 'egg' | 'tofu' | 'carb' | 'condiment'
}

// ── Portion tables ─────────────────────────────────────────────────────────────

/** Raw grams per adult for the MAIN ingredient of each course_type */
const MAIN_PORTION_G: Record<string, number> = {
  main_protein: 150,
  veggie_dish:  200,
  soup:         120,
  staple:        80,
  dessert:       80,
};

/** Seafood needs more raw weight due to shell/bone waste */
const SEAFOOD_WASTE_FACTOR = 1.35;

/** Ingredient category → shopping type */
const CAT_TYPE: Record<string, 'Meat/Seafood' | 'Produce' | 'Staples'> = {
  seafood:  'Meat/Seafood',
  pork:     'Meat/Seafood',
  beef:     'Meat/Seafood',
  poultry:  'Meat/Seafood',
  plant:    'Produce',
  other:    'Produce',
  carb:     'Staples',
};

/** main_ingredient → Chinese display name */
const ING_ZH: Record<string, string> = {
  pork:     '猪肉',
  beef:     '牛肉',
  chicken:  '鸡肉',
  duck:     '鸭肉',
  seafood:  '海鲜',
  fish:     '鱼',
  shrimp:   '虾',
  crab:     '蟹',
  shellfish:'贝类',
  salmon:   '三文鱼',
  hairtail: '带鱼',
  seabass:  '鲈鱼',
  oyster:   '生蚝',
  squid:    '鱿鱼',
  scallop:  '扇贝',
  veggie:   '蔬菜',
  vegetable:'蔬菜',
  tofu:     '豆腐',
  mushroom: '菌菇',
  egg:      '鸡蛋',
  bean:     '豆类',
  carb:     '主食',
  tempeh:   '豆制品',
  lamb:     '羊肉',
  mutton:   '羊肉',
  other:    '其他食材',
};

/** main_ingredient → broad category for aggregation */
const ING_CAT: Record<string, string> = {
  pork: 'pork', beef: 'beef', lamb: 'beef', mutton: 'beef',
  chicken: 'poultry', duck: 'poultry', turkey: 'poultry',
  seafood: 'seafood', fish: 'seafood', shrimp: 'seafood', crab: 'seafood',
  shellfish: 'seafood', squid: 'seafood', scallop: 'seafood',
  salmon: 'seafood', hairtail: 'seafood', seabass: 'seafood', oyster: 'seafood',
  veggie: 'veggie', vegetable: 'veggie', mushroom: 'veggie', bean: 'veggie',
  tofu: 'tofu', egg: 'egg', tempeh: 'tofu',
  carb: 'carb',
};

// ── Secondary ingredient heuristics ───────────────────────────────────────────
// Many dishes need minor supporting ingredients (garlic, ginger, sauce).
// We add small fixed quantities so the shopping list is complete.

interface SecondaryIng {
  name: string;
  nameZh: string;
  type: 'Meat/Seafood' | 'Produce' | 'Staples';
  weightGrams: number;  // fixed amount (not headcount-scaled — condiments are shared)
  category: string;
}

function getSecondaryIngredients(dish: any): SecondaryIng[] {
  const title: string = (dish.title_zh || dish.title || '').toLowerCase();
  const ing: string  = (dish.main_ingredient || '').toLowerCase();
  const result: SecondaryIng[] = [];

  // Aromatics — nearly every savory dish uses these
  if (!['carb', 'dessert'].includes(dish.course_type ?? '')) {
    result.push({ name: '葱姜蒜 (Aromatics)', nameZh: '葱姜蒜', type: 'Produce', weightGrams: 50, category: 'condiment' });
  }

  // Pork belly / 回锅 → leek
  if (ing === 'pork' && (title.includes('回锅') || title.includes('五花'))) {
    result.push({ name: '蒜苗 (Garlic sprouts)', nameZh: '蒜苗', type: 'Produce', weightGrams: 80, category: 'veggie' });
  }

  // Crab / shrimp → ginger + scallion
  if (['crab', 'shrimp'].includes(ing)) {
    result.push({ name: '姜片 (Fresh ginger)', nameZh: '姜片', type: 'Produce', weightGrams: 30, category: 'condiment' });
  }

  // Tofu → always needs condiments; mapo → doubanjiang
  if (ing === 'tofu') {
    if (title.includes('麻婆')) {
      result.push({ name: '豆瓣酱 (Doubanjiang)', nameZh: '豆瓣酱', type: 'Staples', weightGrams: 60, category: 'condiment' });
    }
    result.push({ name: '嫩豆腐 (Silken tofu)', nameZh: '嫩豆腐', type: 'Produce', weightGrams: 0, category: 'tofu' }); // weight handled by main
  }

  // Soup → needs stock/broth
  if (dish.course_type === 'soup') {
    result.push({ name: '鸡高汤 (Chicken stock)', nameZh: '高汤', type: 'Staples', weightGrams: 400, category: 'condiment' });
  }

  // Staple: rice → just rice, noodles → noodles
  if (dish.course_type === 'staple') {
    if (title.includes('面') || title.includes('意粉') || title.includes('意面')) {
      // noodle: no extra
    } else if (title.includes('饺') || title.includes('包') || title.includes('馒头')) {
      result.push({ name: '面粉 (All-purpose flour)', nameZh: '面粉', type: 'Staples', weightGrams: 0, category: 'carb' });
    }
    // rice needs soy sauce
    result.push({ name: '生抽酱油 (Light soy sauce)', nameZh: '生抽', type: 'Staples', weightGrams: 30, category: 'condiment' });
  }

  return result;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Given a dish record from Supabase + headcount, returns the full ingredient list.
 */
export function dishToIngredients(dish: any, adults: number, kids: number): ShoppingIngredient[] {
  const effectivePeople = Math.max(1, adults + kids * 0.5);
  const courseType: string = dish.course_type ?? 'main_protein';
  const ingKey: string = (dish.main_ingredient ?? 'other').toLowerCase();
  const isSeafood = ING_CAT[ingKey] === 'seafood';
  const ingType: 'Meat/Seafood' | 'Produce' | 'Staples' =
    CAT_TYPE[ING_CAT[ingKey] ?? 'other'] ?? 'Produce';

  const result: ShoppingIngredient[] = [];
  const dishId = dish.id ?? dish.title_zh ?? Math.random().toString();
  const dishTitle = dish.title_zh || dish.title || '';

  // ── Main ingredient ─────────────────────────────────────────────────────────
  let baseG = MAIN_PORTION_G[courseType] ?? 150;
  if (isSeafood) baseG *= SEAFOOD_WASTE_FACTOR;

  // Egg is sold by piece not weight
  if (ingKey === 'egg') {
    const eggCount = Math.ceil(effectivePeople * 1.5);
    result.push({
      id: `${dishId}_main`,
      dishId, dishTitle,
      name: `鸡蛋 (Eggs) ×${eggCount}`,
      nameZh: '鸡蛋',
      type: 'Produce',
      weightGrams: eggCount * 60,
      unit: 'piece',
      category: 'egg',
    });
  } else {
    const mainW = Math.round(baseG * effectivePeople);
    const ingZh = ING_ZH[ingKey] ?? '食材';
    result.push({
      id: `${dishId}_main`,
      dishId, dishTitle,
      name: `${ingZh} (${mainIngEn(ingKey)})`,
      nameZh: ingZh,
      type: ingType,
      weightGrams: mainW,
      unit: 'g',
      category: ING_CAT[ingKey] ?? 'other',
    });
  }

  // ── Secondary/condiment ingredients ────────────────────────────────────────
  const secondaries = getSecondaryIngredients(dish);
  secondaries.forEach((s, i) => {
    if (s.weightGrams === 0) return; // skip zero-weight placeholders
    result.push({
      id: `${dishId}_sec${i}`,
      dishId, dishTitle,
      name: s.name,
      nameZh: s.nameZh,
      type: s.type,
      weightGrams: s.weightGrams,
      unit: 'g',
      category: s.category,
    });
  });

  return result;
}

function mainIngEn(key: string): string {
  const map: Record<string, string> = {
    pork: 'Pork', beef: 'Beef', chicken: 'Chicken', duck: 'Duck',
    seafood: 'Seafood', fish: 'Fish', shrimp: 'Shrimp', crab: 'Crab',
    salmon: 'Salmon', hairtail: 'Hairtail', seabass: 'Sea Bass', oyster: 'Oyster',
    squid: 'Squid', scallop: 'Scallop',
    veggie: 'Seasonal Veg', vegetable: 'Seasonal Veg', tofu: 'Tofu',
    mushroom: 'Mushrooms', egg: 'Eggs', bean: 'Beans', tempeh: 'Tempeh',
    carb: 'Staple', lamb: 'Lamb', mutton: 'Lamb', other: 'Ingredient',
  };
  return map[key] ?? 'Ingredient';
}

// ── Weekly aggregation ─────────────────────────────────────────────────────────

export interface AggregatedIngredient {
  nameZh: string;
  name: string;
  type: 'Meat/Seafood' | 'Produce' | 'Staples';
  weightGrams: number;
  category: string;
  unit: 'g' | 'ml' | 'piece';
  dishes: string[];   // which dishes use this ingredient
}

/**
 * Aggregate ingredients across multiple dishes (for weekly shopping).
 * Combines same ingredient type + category, sums quantities.
 * Condiments are capped to avoid over-ordering.
 */
export function aggregateIngredients(
  allIngredients: ShoppingIngredient[],
): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();

  for (const ing of allIngredients) {
    // Key: nameZh (condiments share across all dishes)
    const key = ing.nameZh;

    if (map.has(key)) {
      const existing = map.get(key)!;
      // Condiments: cap at reasonable weekly amount
      const isCond = ing.category === 'condiment';
      if (isCond) {
        existing.weightGrams = Math.min(existing.weightGrams + ing.weightGrams, 200);
      } else {
        existing.weightGrams += ing.weightGrams;
      }
      if (!existing.dishes.includes(ing.dishTitle)) {
        existing.dishes.push(ing.dishTitle);
      }
    } else {
      map.set(key, {
        nameZh: ing.nameZh,
        name: ing.name,
        type: ing.type,
        weightGrams: ing.weightGrams,
        category: ing.category,
        unit: ing.unit,
        dishes: [ing.dishTitle],
      });
    }
  }

  // Sort: Meat/Seafood first → Produce → Staples, then by weight desc
  const typeOrder = { 'Meat/Seafood': 0, 'Produce': 1, 'Staples': 2 };
  return Array.from(map.values()).sort((a, b) => {
    const tDiff = typeOrder[a.type] - typeOrder[b.type];
    if (tDiff !== 0) return tDiff;
    return b.weightGrams - a.weightGrams;
  });
}
