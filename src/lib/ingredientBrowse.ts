/**
 * ingredientBrowse.ts — TICKET-112 食材→热门做法 查询 (雇主 craving 飞轮)
 *
 * 老板 5/30: 雇主点食材 (牛肉/鱼/鸡…) → 该食材的爱吃热门做法 top N.
 * 诚实: 用爱吃自己的真实信号排序 (times_cooked / employer_crown_likes /
 * repeat_rate / health_score), 不冒充"下厨房 top10".
 *
 * 复用 DISH_FIELDS, 不新建表. agent-first MVP (/chef) + 未来雇主 craving 入口共用.
 */
import { supabase } from './supabase';
import { DISH_FIELDS } from './dishFields';

/** 食材大类 → main_ingredient 命中关键词 (DB main_ingredient 真值小写匹配) */
export const INGREDIENT_GROUPS: { key: string; emoji: string; zh: string; en: string; match: string[] }[] = [
  { key: 'beef',    emoji: '🥩', zh: '牛肉', en: 'Beef',     match: ['beef', '牛'] },
  { key: 'pork',    emoji: '🐖', zh: '猪肉', en: 'Pork',     match: ['pork', '猪'] },
  { key: 'chicken', emoji: '🍗', zh: '鸡肉', en: 'Chicken',  match: ['chicken', '鸡'] },
  { key: 'fish',    emoji: '🐟', zh: '鱼',   en: 'Fish',     match: ['fish', 'seabass', 'salmon', 'cod', 'hairtail', '鱼', '鲈', '鳕'] },
  { key: 'shrimp',  emoji: '🦐', zh: '虾蟹', en: 'Shrimp',   match: ['shrimp', 'prawn', 'crab', '虾', '蟹'] },
  { key: 'veg',     emoji: '🥬', zh: '蔬菜', en: 'Veggies',  match: ['vegetable', 'veggie', 'tofu', 'mushroom', '菜', '豆腐', '菇'] },
  { key: 'egg',     emoji: '🥚', zh: '蛋',   en: 'Egg',      match: ['egg', '蛋'] },
  { key: 'duck',    emoji: '🦆', zh: '鸭鹅', en: 'Duck',     match: ['duck', 'goose', '鸭', '鹅'] },
];

export interface BrowseDish {
  id: string;
  title_zh: string;
  title_en?: string | null;
  image_url?: string | null;
  description_zh?: string | null;
  flavor_tags?: string[] | null;
  main_ingredient?: string | null;
  cook_method?: string | null;
  cook_time_min?: number | null;
  protein_g?: number | null;
  carb_g?: number | null;
  fat_g?: number | null;
  nutrition_kcal_per_serving?: number | null;
  helper_friendly_score?: number | null;
  xiaomei_compatible?: boolean | null;
  times_cooked?: number | null;
  employer_crown_likes?: number | null;
  repeat_rate?: number | null;
  health_score?: number | null;
}

/** 爱吃热门分 — 真实信号加权 (老板诚实原则: 不冒充外部榜) */
function popularity(d: BrowseDish): number {
  return (d.times_cooked ?? 0) * 0.4
       + (d.employer_crown_likes ?? 0) * 0.3
       + (d.repeat_rate ?? 0) * 0.2
       + (d.health_score ?? 0) * 0.1;
}

/**
 * 取某食材大类的热门做法 top N.
 * cook_method 去重保多样性 (别 10 道全红烧); 时间 ≤60min 优先 (汤豁免).
 */
export async function browseByIngredient(
  groupKey: string,
  opts?: { limit?: number },
): Promise<BrowseDish[]> {
  const group = INGREDIENT_GROUPS.find(g => g.key === groupKey);
  if (!group) return [];

  // PostgREST or: main_ingredient ilike any keyword
  const orFilter = group.match.map(kw => `main_ingredient.ilike.%${kw}%`).join(',');
  const { data, error } = await supabase
    .from('dishes')
    .select(DISH_FIELDS)
    .or(orFilter)
    .limit(120);
  if (error || !data) return [];

  const limit = opts?.limit ?? 10;
  const ranked = (data as BrowseDish[])
    .slice()
    .sort((a, b) => popularity(b) - popularity(a));

  // cook_method 去重 (保多样性), 不够再用剩余补满
  const seen = new Set<string>();
  const diverse: BrowseDish[] = [];
  const rest: BrowseDish[] = [];
  for (const d of ranked) {
    const cm = (d.cook_method ?? '').toLowerCase();
    if (cm && !seen.has(cm)) { seen.add(cm); diverse.push(d); }
    else rest.push(d);
    if (diverse.length >= limit) break;
  }
  const out = diverse.length >= limit ? diverse : [...diverse, ...rest].slice(0, limit);
  return out;
}
