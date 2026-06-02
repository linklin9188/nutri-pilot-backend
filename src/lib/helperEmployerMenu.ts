/**
 * helperEmployerMenu.ts — TICKET-075 P0 §3 (老板真测 #18 全链路 6 断点)
 *
 * 抽 HelperHome.tsx:175-260 的三步绑定查询 + 当日菜单读取 + householdId 解析,
 * 让 HelperPrep / HelperCook / 未来其它菲佣页面 不用各自复制粘贴.
 *
 * 流程:
 *   1. helper_id (= helper userId) → household_members.household_id
 *   2. household_id → households.employer_id
 *   3. (employer_id, week_start, day_index) → user_weekly_menus → dish_ids[]
 *   4. dish_ids → dishes.* (title / image / prep_steps_json / cook_steps_json …)
 *
 * 任一步骤断 → 返回 { householdId: null, employerId: null, dishes: [] },
 * 不抛错让调用方做 fallback (e.g. "等雇主生成菜单").
 *
 * 失败 console.warn 留 diagnose (匹配 HelperHome 原 TICKET-009 风格),
 * 不向用户弹窗.
 *
 * P0 fix 2026-05-28 (老板真测 "雇主点做饭跳出来不是做饭"): 当 step 1 查不到
 * household_members 行 (= 调用者不是 helper, 或 helper 没绑家庭), fallback
 * 把当前 user 直接当 employer, 跳过 step 1+2 直接走 step 3. 配合老板 ruling
 * "做饭/当日菜单是业务流程级共用页, 不绑角色, 雇主菲佣共用同一 UI" — 让
 * HelperCook / HelperPrep 等业务页一份代码同时服务两端.
 */
import { supabase } from './supabase';

export interface EmployerDishLite {
  id:               string;
  title_zh:         string;
  title_en?:        string | null;
  image_url?:       string | null;
  main_ingredient?: string | null;
  course_type?:     string | null;
  meal_type?:       string | null;
  prep_steps_json?: unknown;
  cook_steps_json?: unknown;
  video_url?:       string | null;
  video_lang?:      string | null;
  video_platform?:  string | null;
  cook_time_min?:   number | null;
  steps_verified?:  boolean | null;
  description_zh?:  string | null;
  description_en?:  string | null;
}

export interface EmployerMenuResult {
  householdId: string | null;
  employerId:  string | null;
  /** 今日全部 (breakfast + lunch + dinner) dish 按 meal 顺序排平后的数组 */
  dishes:      EmployerDishLite[];
  /** 按 meal 分桶, UI 想 3 卡 grid 时直接用 */
  byMeal:      { breakfast: EmployerDishLite[]; lunch: EmployerDishLite[]; dinner: EmployerDishLite[] };
}

const EMPTY: EmployerMenuResult = {
  householdId: null,
  employerId:  null,
  dishes:      [],
  byMeal:      { breakfast: [], lunch: [], dinner: [] },
};

/**
 * 计算 helper 视角 "今天" 的雇主菜单. 默认 selectFields 含 HelperCook 需要的
 * cook_steps_json + video; HelperPrep 不读但多拉几列代价可忽略, 维护 DRY.
 */
export async function loadEmployerTodayMenu(
  helperUserId: string | null | undefined,
  dayOffset: number = 0,
): Promise<EmployerMenuResult> {
  if (!helperUserId) return EMPTY;

  // 1. household membership (helper 视角)
  const { data: member, error: memberErr } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('helper_id', helperUserId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
    .limit(1);
  if (memberErr) {
    console.warn('[helperEmployerMenu] household_members fetch error:', memberErr);
    return EMPTY;
  }
  const householdId = (member?.[0] as any)?.household_id as string | undefined;

  // 2. household → employer, 或 fallback: 当前 user 就是 employer
  let employerId: string | undefined;
  if (householdId) {
    const { data: hh, error: hhErr } = await supabase
      .from('households')
      .select('employer_id')
      .eq('id', householdId)
      .maybeSingle();
    if (hhErr) {
      console.warn('[helperEmployerMenu] households fetch error:', hhErr);
      return { ...EMPTY, householdId };
    }
    employerId = (hh as any)?.employer_id as string | undefined;
    if (!employerId) {
      console.warn('[helperEmployerMenu] household', householdId, 'has no employer_id');
      return { ...EMPTY, householdId };
    }
  } else {
    // P0 2026-05-28: 调用者不是 helper (查不到 household_members 行) → 当 employer 自己用,
    // 直接把当前 userId 当 employer_id, 跳过 household lookup 走 step 3 读自己菜单.
    employerId = helperUserId;
  }

  // 3. 目标日 weekStart (Mon=0 周一对齐, 同 HelperHome.tsx:208-212)。
  //    dayOffset: 0=今天 / 1=明天 — 从目标日反推周一, 自动处理跨周。
  //    ⚠️ 必须用本地日期 (非 toISOString 的 UTC): 写入侧 useWeeklyMenu.getWeekStartISO
  //    / chefAddToToday 都用 formatLocalDate(本地)。香港 UTC+8 凌晨 0–8 点 toISOString
  //    会回退到 UTC 前一天, 导致 week_start 比写入侧早一天 → 菲佣读不到当天菜单 (实测
  //    2026-06-02 7/7 天凌晨断链, 此处修)。
  const target = new Date();
  target.setDate(target.getDate() + dayOffset);
  const dow    = (target.getDay() + 6) % 7;
  const monday = new Date(target);
  monday.setDate(target.getDate() - dow);
  const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  const { data: menuRows, error: menuErr } = await supabase
    .from('user_weekly_menus')
    .select('meal_type, dish_ids, swapped_dish_ids')
    .eq('user_id', employerId)
    .eq('week_start', weekStart)
    .eq('day_index', dow);

  if (menuErr) {
    console.warn('[helperEmployerMenu] user_weekly_menus fetch error:', menuErr);
    return { ...EMPTY, householdId, employerId };
  }
  if (!menuRows || menuRows.length === 0) {
    console.warn('[helperEmployerMenu] employer', employerId, 'has no menu for', weekStart, 'dow=', dow);
    return { ...EMPTY, householdId, employerId };
  }

  const idsByMeal: Record<'breakfast' | 'lunch' | 'dinner', string[]> = {
    breakfast: [], lunch: [], dinner: [],
  };
  for (const m of menuRows as any[]) {
    // swapped_dish_ids 优先 (用户换过菜); 没换则用 dish_ids
    const ids: string[] = (m.swapped_dish_ids?.length ? m.swapped_dish_ids : m.dish_ids) ?? [];
    if (m.meal_type === 'breakfast' || m.meal_type === 'lunch' || m.meal_type === 'dinner') {
      idsByMeal[m.meal_type as 'breakfast' | 'lunch' | 'dinner'].push(...ids);
    }
  }
  const allIds = [...idsByMeal.breakfast, ...idsByMeal.lunch, ...idsByMeal.dinner];
  if (allIds.length === 0) return { ...EMPTY, householdId, employerId };

  // 4. dishes 详情 — 一把全字段拉, HelperCook (cook_steps_json + video) 和
  //    HelperPrep (prep_steps_json + main_ingredient) 都覆盖.
  const { data: dishRows, error: dishErr } = await supabase
    .from('dishes')
    .select(
      'id, title_zh, title_en, image_url, main_ingredient, course_type, meal_type, ' +
      'prep_steps_json, cook_steps_json, video_url, video_lang, video_platform, cook_time_min, ' +
      'steps_verified, description_zh, description_en',
    )
    .in('id', allIds);
  if (dishErr) {
    console.warn('[helperEmployerMenu] dishes fetch error:', dishErr);
    return { ...EMPTY, householdId, employerId };
  }

  const idMap = new Map((dishRows ?? []).map((d: any) => [d.id, d as EmployerDishLite]));
  const resolve = (ids: string[]): EmployerDishLite[] =>
    ids.map(id => idMap.get(id)).filter(Boolean) as EmployerDishLite[];

  const byMeal = {
    breakfast: resolve(idsByMeal.breakfast).map(d => ({ ...d, meal_type: 'breakfast' as const })),
    lunch:     resolve(idsByMeal.lunch).map(d => ({ ...d, meal_type: 'lunch' as const })),
    dinner:    resolve(idsByMeal.dinner).map(d => ({ ...d, meal_type: 'dinner' as const })),
  };
  const dishes = [...byMeal.breakfast, ...byMeal.lunch, ...byMeal.dinner];

  return { householdId, employerId, dishes, byMeal };
}

/**
 * 仅拉 helper 当前绑定的 householdId, 不读菜单 — 给只关心 inventory 共享的
 * HelperPrep 用 (Phase 5b setIngredientAvailable 第一个参数).
 */
export async function loadHelperHouseholdId(
  helperUserId: string | null | undefined,
): Promise<string | null> {
  if (!helperUserId) return null;
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('helper_id', helperUserId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
    .limit(1);
  if (error) {
    console.warn('[helperEmployerMenu.loadHouseholdId] error:', error);
    return null;
  }
  return ((data?.[0] as any)?.household_id as string | undefined) ?? null;
}
