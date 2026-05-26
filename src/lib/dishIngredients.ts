import { refineCut } from './ingredientCuts';
import { normalizeIngredientName } from './ingredientNormalization';

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
  /** Suzie's Twist substitutes (Simply Chinese Feasts 4D framework) —
   *  pantry-friendly swaps for this ingredient. Carries through to the
   *  shopping list so the shopper can grab a swap when the primary item
   *  is sold out. Source: prep_steps_json.substitutes_zh. */
  substitutes?: string[];
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

/**
 * TICKET-092 P0 hot-fix — title_zh 关键词推断 main_ingredient.
 *
 * 真因：DB 里 218/929 道菜 main_ingredient='other'（seed pipeline 系统性
 * 漏标），含战斧牛排/葱烧海参/夫妻肺片/烤火鸡/凤爪/醉鸡等明显有蛋白质类
 * 别的菜。原 ING_CAT['other'] = undefined → fallback 'other' → 购物清单
 * 落到"蔬菜豆腐"组（CATEGORY_GROUPS 里 'other' 归蔬菜豆腐）。
 *
 * 在前端按菜名兜底，不依赖 DB 修复。规则保守：只识别"明确含字"的肉禽
 * 海鲜豆蛋，其他真歧义保持 'other'.
 */
function inferIngCatFromTitle(title: string): string {
  const t = (title ?? '').toLowerCase();
  if (!t) return 'other';
  if (/鸡|鸭|鹅|火鸡|凤爪|鸡丁|鸡腿|鸡翅|鸡肉/.test(t)) return 'poultry';
  if (/牛排|牛肉|牛腩|牛筋|牛丸|肺片|和牛|羊/.test(t)) return 'beef';
  if (/猪|排骨|蹄膀|五花|肉丝|肉片|回锅|东坡|叉烧|肘子|肉末|腊肉/.test(t)) return 'pork';
  if (/鱼|虾|蟹|贝|蛤|蚌|海参|海螺|鱿鱼|墨鱼|带鱼|三文|鳕|鲈|生蚝|扇贝|鳝/.test(t)) return 'seafood';
  if (/鸡蛋|鸭蛋|蛋花|煎蛋|蒸蛋/.test(t)) return 'egg';
  if (/豆腐|豆干|腐竹/.test(t)) return 'tofu';
  return 'other';
}

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

// ── prep_steps_json → shopping list (truth source) ───────────────────────────
//
// When a dish has prep_steps_json populated, those entries ARE the authoritative
// ingredient list — they were either authored by the cookbook source or generated
// by gen-dish-steps-claude with full visibility into the dish. The legacy
// main_ingredient + course_type heuristic below misses every secondary ingredient
// the chef actually uses (酱料 / 配菜 / 主食搭档), which is exactly the gap that
// made the shopping list useless for non-trivial dishes like 蒜蓉粉丝蒸扇贝
// (粉丝 / 蒜蓉 / 蒸鱼豉油 all invisible to a 'scallop'+'main_protein' guess).
//
// Tray convention → shopping category:
//   A=主料 → use the dish's main_ingredient category (pork/seafood/...)
//   B=配菜 → 'veggie' (Produce)
//   C=配料 → 'veggie' (Produce) — 粉丝 / 木耳 / 笋 fall here too
//   D=调料 → 'condiment' (Staples)
//   E=其他 / F → 'other'
function trayToCategory(tray: string, mainIngCat: string): string {
  switch (tray) {
    case 'A': return mainIngCat || 'other';
    case 'B':
    case 'C': return 'veggie';
    case 'D': return 'condiment';
    default:  return 'other';
  }
}

function categoryToType(cat: string): 'Meat/Seafood' | 'Produce' | 'Staples' {
  if (['pork','beef','poultry','seafood'].includes(cat)) return 'Meat/Seafood';
  if (['carb','condiment'].includes(cat)) return 'Staples';
  return 'Produce';
}

// ── Headcount scaling for prep_steps amounts ───────────────────────────────
//
// Historical prompt asked Claude to generate prep_steps "for a 2-person
// home", and recent prompts say "for a 4-person family". The actual DB
// data is a mixture — sampling typical dishes (披萨 香肠 150g / 羊肉
// 300g / 肉丝 300g / 红烧肉 500g) shows the de-facto baseline is around
// 2.5 effective people. We scale by (effPeople / BASELINE) so a 4-person
// household gets ~1.6× the listed amount and a 1-person student gets
// ~0.4× — close enough to a real shopping target without re-generating
// every prep_steps row.
//
// When the backfill that re-pegs all amount_g to 4-person baseline lands
// (a planned cleanup pass), bump BASELINE_PEOPLE to 4 here so 4-person
// households get exactly 1× and the prep card displays match purchase
// quantities.
const PREP_STEPS_BASELINE_PEOPLE = 2.5;
// Sanity bounds — extreme household sizes shouldn't blow ingredient
// quantities to absurd values (a 1-person shopper buying 60g of pork is
// fine; a 12-person banquet buying 1.5kg per side dish is also fine).
const SCALE_MIN = 0.3;
const SCALE_MAX = 4.0;

function prepStepsToIngredients(dish: any, effPeople: number): ShoppingIngredient[] {
  const steps: any[] = dish.prep_steps_json ?? [];
  if (!Array.isArray(steps) || steps.length === 0) return [];

  const dishId = dish.id ?? dish.title_zh ?? Math.random().toString();
  const dishTitle = dish.title_zh || dish.title || '';
  // TICKET-092 P0 hot-fix — DB 218 道菜 main_ingredient='other'，必须 title 兜底
  // 否则主料 (tray A) 全部落到"蔬菜豆腐"组（战斧牛排误归蔬菜的真因）.
  const dbCat = ING_CAT[(dish.main_ingredient ?? '').toLowerCase()];
  const mainIngCat = (dbCat && dbCat !== 'other') ? dbCat : inferIngCatFromTitle(dishTitle);

  const rawScale = effPeople / PREP_STEPS_BASELINE_PEOPLE;
  const scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, rawScale));

  // Aggregate by ingredient_zh within the same dish — sometimes prep
  // splits one ingredient across two prep actions (洗 + 切), we shouldn't
  // double-buy.
  const byName = new Map<string, ShoppingIngredient>();
  steps.forEach((s, idx) => {
    const nameZh = (s.ingredient_zh ?? '').trim();
    if (!nameZh) return;
    const nameEn = (s.ingredient_en ?? '').trim();
    const rawAmount = Number(s.amount_g) || 0;
    // Condiments (生抽/老抽/盐/糖/料酒) scale much less aggressively —
    // a 4-person family doesn't actually need 1.6× the soy sauce.
    const isCondiment = (s.tray ?? '') === 'D';
    const factor = isCondiment ? Math.min(1.5, 1 + (scale - 1) * 0.4) : scale;
    const amount = Math.round(rawAmount * factor);
    const tray = (s.tray ?? 'E') as string;
    const category = trayToCategory(tray, mainIngCat);
    const subs: string[] = (s.substitutes_zh ?? []).filter(Boolean).slice(0, 3);

    const existing = byName.get(nameZh);
    if (existing) {
      existing.weightGrams += amount;
      // Merge substitutes (dedupe, cap 3)
      if (subs.length > 0) {
        const merged = [...new Set([...(existing.substitutes ?? []), ...subs])].slice(0, 3);
        existing.substitutes = merged;
      }
      return;
    }

    byName.set(nameZh, {
      id: `${dishId}_p${idx}`,
      dishId,
      dishTitle,
      name: nameEn ? `${nameZh} (${nameEn})` : nameZh,
      nameZh,
      type: categoryToType(category),
      weightGrams: amount,
      unit: 'g',
      category,
      substitutes: subs.length > 0 ? subs : undefined,
    });
  });

  return [...byName.values()].filter(i => i.weightGrams > 0);
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Given a dish record from Supabase + headcount, returns the full ingredient list.
 *
 * Priority:
 *   1. If prep_steps_json is populated → use those entries, scaled by
 *      (effPeople / PREP_STEPS_BASELINE_PEOPLE). DB amount_g was historically
 *      sized for a ~2.5-person household; without scaling a 4-person family
 *      would under-buy. Condiments scale gentler than mains.
 *   2. Otherwise → fall back to the main_ingredient + course_type heuristic
 *      which already multiplies by effectivePeople.
 */
export function dishToIngredients(dish: any, adults: number, kids: number): ShoppingIngredient[] {
  const effectivePeople = Math.max(1, adults + kids * 0.5);

  // Path A — prep_steps_json present, use it (scaled).
  if (Array.isArray(dish.prep_steps_json) && dish.prep_steps_json.length > 0) {
    return prepStepsToIngredients(dish, effectivePeople);
  }

  // Path B — heuristic fallback (legacy, used for dishes without prep_steps yet)
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
    // Refine the coarse 'pork' / 'chicken' label into the actual cut by
    // reading the dish title (糖醋排骨 → 猪小排, 可乐鸡翅 → 鸡翅).
    // refineCut returns null for ingKeys without a rules table (e.g. obscure
    // 'other') — in that case we fall back to the legacy generic label.
    const refined = refineCut(ingKey, dishTitle);
    const ingZh = refined?.nameZh ?? (ING_ZH[ingKey] ?? '食材');
    const ingEn = refined?.nameEn ?? mainIngEn(ingKey);
    result.push({
      id: `${dishId}_main`,
      dishId, dishTitle,
      name: `${ingZh} (${ingEn})`,
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
  /** Merged substitutes across all dishes that use this ingredient — shown
   *  in the shopping list so the shopper knows what to grab if the primary
   *  item is sold out. */
  substitutes?: string[];
  /** TICKET-049 P1 — 规范化聚合后的原始变体名集合。例：canonical=葱 时
   *  variants 可能是 ['葱段','葱丝']，UI 在 canonical 名下方用小字展示
   *  (葱段 + 葱丝) 让用户知道为什么这两道菜合一起。只有 length >= 2 才需要
   *  显示 —— 单一变体 = 没合并 = 无信息量。 */
  variants?: string[];
}

/**
 * Aggregate ingredients across multiple dishes (for weekly shopping).
 * Combines same ingredient type + category, sums quantities.
 * Condiments are capped to avoid over-ordering.
 *
 * TICKET-049 P1: key 由 nameZh 改成 normalizeIngredientName(nameZh) ——
 * 把"葱段 / 葱丝"等切法变体先规范化到 canonical 名（葱）再聚合，老板
 * 真测发现的"同一根葱出现两行"被这里彻底拍平。canonical 名直接覆盖
 * AggregatedIngredient.nameZh，UI 显示的就是合并后的清单名；原始变体名
 * 记到 variants[] 给 UI 用小字 (葱段 + 葱丝) 透传可见性。
 */
export function aggregateIngredients(
  allIngredients: ShoppingIngredient[],
): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();

  for (const ing of allIngredients) {
    // TICKET-049: 规范化后的 canonical 名作为聚合 key。
    const canonical = normalizeIngredientName(ing.nameZh);
    const key = canonical;

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
      // Merge substitutes from the new contributor (dedupe, cap 3)
      if (ing.substitutes && ing.substitutes.length > 0) {
        existing.substitutes = [...new Set([...(existing.substitutes ?? []), ...ing.substitutes])].slice(0, 3);
      }
      // TICKET-049: 记录原始变体名（dedupe）。
      if (!existing.variants!.includes(ing.nameZh)) {
        existing.variants!.push(ing.nameZh);
      }
    } else {
      map.set(key, {
        nameZh: canonical,
        // name 字段保留首次出现的英文括号版本 —— canonical 名通常不带英文，
        // 拿原始 name 当 fallback 比硬替换合理。
        name: ing.name,
        type: ing.type,
        weightGrams: ing.weightGrams,
        category: ing.category,
        unit: ing.unit,
        dishes: [ing.dishTitle],
        substitutes: ing.substitutes,
        variants: [ing.nameZh],
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
