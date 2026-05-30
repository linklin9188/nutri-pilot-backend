/**
 * chefAddToToday.ts — TICKET-112 P0: /chef "加入今晚" 真写当日菜单
 *
 * 老板 2026-05-30 批准的 agent-first 改版 P0 后端接线 (纯逻辑, 不碰 UI)。
 * 雇主在 /chef 点"加入今晚" → 真写进 user_weekly_menus 当天对应餐次 →
 * 采购清单 (VerifyIngredients DB-first) + 菲佣端 (loadEmployerTodayMenu) 都能读到。
 *
 * 写入列按餐次区分 (对抗验证 2026-05-30 发现的读者口径差异):
 *   - 晚餐 dinner → swapped_dish_ids。下游晚餐读者都是 swapped 优先:
 *       helperEmployerMenu.ts:133 / useWeeklyMenu.ts loadFromDB dinner。
 *   - 午餐 lunch → dish_ids。采购/WeeklyMenu 的午餐格只读 dish_ids (不读 swapped),
 *       若午餐也写 swapped 则采购清单午餐看不到。菲佣端午餐 swapped-or-dish_ids
 *       回退到 dish_ids 同样可见。
 * 两个时段各命中自己读者的完整路径。
 *
 * merge 保命: 先读该餐次现有生效菜 (swapped 非空则 swapped, 否则 dish_ids) →
 * append 去重 → 写回, 不覆盖丢失已有自动菜。
 *
 * 复用现有引擎, 不新建表 / 不改 schema / 不 bump ALGO_VERSION。
 *
 * 已知限制 (P0 可接受): 若某午餐当天此前已被手动 swap 过 (swapped 非空),
 * chef 加的午餐菜写进 dish_ids, 菲佣端 swapped-first 会读到旧 swapped 而漏掉它。
 * 这是"午餐 + 当天已 swap"的罕见叠加, 主场景 (晚餐 / 未 swap 的午餐) 全链路通。
 */
import { supabase } from './supabase';
import { getUserId } from './userId';
import { ALGO_VERSION, getWeekStartISO, getCacheKey } from '../hooks/useWeeklyMenu';

export type ChefAddMeal = 'lunch' | 'dinner';

export interface ChefAddResult {
  ok: boolean;
  mealType: ChefAddMeal;
  alreadyPresent: boolean;
}

/** day_index 口径: 周一=0 ... 周日=6 (与 useWeeklyMenu / helperEmployerMenu 对齐)。 */
function todayDayIndex(d: Date = new Date()): number {
  const day = d.getDay();               // 0=Sun..6=Sat
  return day === 0 ? 6 : day - 1;        // 周一=0
}

/** 当前时间 ≤ 14 点写午餐, 否则写晚餐。 */
function currentMealType(d: Date = new Date()): ChefAddMeal {
  return d.getHours() <= 14 ? 'lunch' : 'dinner';
}

export async function addDishToTodayMenu(dishId: string): Promise<ChefAddResult> {
  const now        = new Date();
  const userId     = getUserId() ?? 'anonymous';
  const weekStart  = getWeekStartISO(0);
  const dayIndex   = todayDayIndex(now);
  const mealType   = currentMealType(now);
  const cacheKey   = getCacheKey(weekStart);

  try {
    const { data: existing, error: selErr } = await supabase
      .from('user_weekly_menus')
      .select('dish_ids, swapped_dish_ids')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .eq('day_index', dayIndex)
      .eq('meal_type', mealType)
      .maybeSingle();

    if (selErr) return { ok: false, mealType, alreadyPresent: false };

    const dishIds: string[] = existing?.dish_ids ?? [];
    const swapped: string[] = existing?.swapped_dish_ids ?? [];
    const effective: string[] = swapped.length > 0 ? swapped : dishIds;

    const alreadyPresent = effective.includes(dishId);
    const merged = alreadyPresent ? effective : [...effective, dishId];

    // 餐次决定写哪一列 (见文件头注释)。
    const row: Record<string, unknown> = {
      user_id:      userId,
      week_start:   weekStart,
      day_index:    dayIndex,
      meal_type:    mealType,
      algo_version: ALGO_VERSION,
      cache_key:    cacheKey,
    };
    if (mealType === 'dinner') {
      row.swapped_dish_ids = merged;
      // 保留原自动方案 dish_ids 不清空。
      if (existing?.dish_ids) row.dish_ids = dishIds;
    } else {
      // 午餐写 dish_ids (采购午餐格只读这列)。保留已有 swapped 不动。
      row.dish_ids = merged;
      if (existing?.swapped_dish_ids) row.swapped_dish_ids = swapped;
    }

    const { error: upErr } = await supabase
      .from('user_weekly_menus')
      .upsert(row, { onConflict: 'user_id,week_start,day_index,meal_type' });

    if (upErr) return { ok: false, mealType, alreadyPresent };

    return { ok: true, mealType, alreadyPresent };
  } catch {
    return { ok: false, mealType, alreadyPresent: false };
  }
}
