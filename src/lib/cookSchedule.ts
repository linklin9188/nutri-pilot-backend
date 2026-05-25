/**
 * cookSchedule.ts — TICKET-076 P0 §Phase 3 (老板 #19 智能菜单延伸需求)
 *
 * 把雇主 user_profiles.lunch_time / dinner_time 与今日菜单结合,
 * 反推菲佣"开做时间 / 备菜时间", HelperHome 顶部时间卡 + Web Notification
 * 提醒共用这个 lib.
 *
 * 算法约定 (CEO 拍板, 不再 ask user):
 *   - 备菜固定 15 分钟 buffer (DB 暂无 prep_time 列, 本 ticket 不补列)
 *   - 做菜耗时取 max(cook_time_min), 假设菲佣"并行做" (炒锅 + 炖锅 + 蒸锅 同时)
 *     真实 4 道菜 sum 太晚 (4 道 × 30 min = 2 小时开做不现实)
 *   - cook_time_min 为 null 的菜按 25 分钟兜底
 *
 * 时间反推链 (晚饭 19:00 / 最长菜 30 min 为例):
 *   eatTime       = 19:00
 *   startCookTime = 19:00 - 30 = 18:30
 *   startPrepTime = 18:30 - 15 = 18:15
 */
import { loadDailySchedule, dateToISODay } from './dailyMealSchedule';
import { loadEmployerTodayMenu, type EmployerDishLite } from './helperEmployerMenu';

export interface CookSchedule {
  meal:           'lunch' | 'dinner';
  eatTime:        string;  // 'HH:MM' 用户在 Settings 设的开饭时间
  startCookTime:  string;  // 'HH:MM' 菲佣应开做时间 = eat - cookMin
  startPrepTime:  string;  // 'HH:MM' 备菜开始 = startCook - PREP_BUFFER
  dishes:         { id: string; title_zh: string; cook_time_min: number | null }[];
  totalCookMin:   number;  // max(cook_time_min over dishes) — 并行假设
}

export interface DayCookSchedule {
  lunch:  CookSchedule | null;
  dinner: CookSchedule | null;
}

const PREP_BUFFER_MIN  = 15;  // 备菜固定 15 分钟
const FALLBACK_COOK_MIN = 25; // cook_time_min 缺失时的兜底单菜耗时

/** 'HH:MM' 减 N 分钟, 跨午夜 clamp 到 00:00 (现实里不会跨, 但兜底) */
function subtractMinutes(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  let total = h * 60 + m - mins;
  if (total < 0) total = 0;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/** 取一组菜的最长 cook_time_min — 缺失值按 FALLBACK_COOK_MIN 兜底 */
function maxCookMin(dishes: EmployerDishLite[]): number {
  if (dishes.length === 0) return 0;
  let mx = 0;
  for (const d of dishes) {
    const m = (d.cook_time_min ?? FALLBACK_COOK_MIN) | 0;
    if (m > mx) mx = m;
  }
  return mx;
}

function buildMealSchedule(
  meal: 'lunch' | 'dinner',
  eatTime: string,
  dishes: EmployerDishLite[],
): CookSchedule | null {
  if (dishes.length === 0) return null;
  const totalCookMin  = maxCookMin(dishes);
  const startCookTime = subtractMinutes(eatTime, totalCookMin);
  const startPrepTime = subtractMinutes(startCookTime, PREP_BUFFER_MIN);
  return {
    meal,
    eatTime,
    startCookTime,
    startPrepTime,
    dishes: dishes.map(d => ({
      id: d.id,
      title_zh: d.title_zh,
      cook_time_min: d.cook_time_min ?? null,
    })),
    totalCookMin,
  };
}

/**
 * 拿 helper 视角 "今天" 的备菜时间表.
 *
 * 1. helperUserId → loadEmployerTodayMenu (lib/helperEmployerMenu)
 *    给出 employerId + byMeal { breakfast, lunch, dinner }
 * 2. employerId → user_profiles.lunch_time / dinner_time
 * 3. 各 meal 反推 startCookTime / startPrepTime
 *
 * 任一环节断 → 返回 { lunch: null, dinner: null }, 不抛错让调用方 fallback.
 * 早饭不算 (中国家庭早饭多预备 or 外食, 时间紧迫提醒意义有限).
 */
export async function loadTodayCookSchedule(
  helperUserId: string | null | undefined,
): Promise<DayCookSchedule> {
  const empty: DayCookSchedule = { lunch: null, dinner: null };
  if (!helperUserId) return empty;

  // 1. employer menu
  const menu = await loadEmployerTodayMenu(helperUserId);
  if (!menu.employerId) return empty;

  // 2. employer 用餐时间 — TICKET-082: 日级 schedule (household_meal_schedule)
  //    优先, 没设回退 user_profiles.lunch_time/dinner_time, 都没设硬编码默认.
  const today = dateToISODay(new Date());
  const sched = await loadDailySchedule(menu.householdId, today, menu.employerId);
  const lunchTime  = sched.lunch_time  ?? '12:00';
  const dinnerTime = sched.dinner_time ?? '19:00';

  // 3. 反推
  return {
    lunch:  buildMealSchedule('lunch',  lunchTime,  menu.byMeal.lunch),
    dinner: buildMealSchedule('dinner', dinnerTime, menu.byMeal.dinner),
  };
}
