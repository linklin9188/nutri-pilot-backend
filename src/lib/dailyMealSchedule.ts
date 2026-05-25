/**
 * dailyMealSchedule.ts — TICKET-082 P0 §Phase 2
 *
 * 用餐时间日级化 lib. 三层 fallback 链:
 *   1. household_meal_schedule (household_id, for_date) — 当天用户/菲佣/chat 设过
 *   2. user_profiles.lunch_time / dinner_time (雇主 employerUserId) — 默认时间
 *   3. 硬编码 12:00 / 19:00 — 终极兜底
 *
 * setDailyMealTime: upsert ON CONFLICT (household_id, for_date) DO UPDATE.
 * set_by 追加 employer/helper/chat 三选一, 未来冲突仲裁 + 审计.
 *
 * 调用方:
 *   - lib/cookSchedule.ts (Phase 3): loadTodayCookSchedule 改读 daily
 *   - Home.tsx (Phase 5a): 顶部 chip
 *   - WeeklyMenu.tsx (Phase 5b): 每天 chip
 *   - HelperHome.tsx (Phase 6): 时间卡 ✏️
 *   - ChatSwapModal.tsx (Phase 7): 自然语言识别后写
 */
import { supabase } from './supabase';

export interface DailyMealSchedule {
  household_id: string;
  for_date: string;            // 'YYYY-MM-DD'
  lunch_time: string | null;   // 'HH:MM' (UI 用), null 表示未设
  dinner_time: string | null;
  set_by: 'employer' | 'helper' | 'chat' | null;
}

export const DEFAULT_LUNCH  = '12:00';
export const DEFAULT_DINNER = '19:00';

/** DB 'HH:MM:SS' → UI 'HH:MM'; null/undefined → null */
function toHHMM(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.slice(0, 5);
}

/**
 * 拉某家某天的 schedule.
 * 没设过 → 回 user_profiles fallback. 雇主 profile 也没设 → 硬编码 12:00/19:00.
 * 永不抛错 (read-only, 失败也得返默认让 UI 能渲).
 */
export async function loadDailySchedule(
  householdId: string | null | undefined,
  forDate: string,
  employerUserId: string | null | undefined,
): Promise<DailyMealSchedule> {
  const empty: DailyMealSchedule = {
    household_id: householdId ?? '',
    for_date: forDate,
    lunch_time: DEFAULT_LUNCH,
    dinner_time: DEFAULT_DINNER,
    set_by: null,
  };
  if (!householdId) return empty;

  // 1. 当天 daily override
  const { data: row, error } = await supabase
    .from('household_meal_schedule')
    .select('lunch_time, dinner_time, set_by')
    .eq('household_id', householdId)
    .eq('for_date', forDate)
    .maybeSingle();
  if (error) {
    console.warn('[dailyMealSchedule] daily fetch error:', error);
  }
  const daily = row as { lunch_time?: string | null; dinner_time?: string | null; set_by?: string | null } | null;
  const dailyLunch  = toHHMM(daily?.lunch_time);
  const dailyDinner = toHHMM(daily?.dinner_time);

  // 2. fallback: user_profiles 默认
  let defaultLunch:  string | null = null;
  let defaultDinner: string | null = null;
  if (employerUserId && (dailyLunch === null || dailyDinner === null)) {
    const { data: prof, error: profErr } = await supabase
      .from('user_profiles')
      .select('lunch_time, dinner_time')
      .eq('id', employerUserId)
      .maybeSingle();
    if (profErr) {
      console.warn('[dailyMealSchedule] profile fallback error:', profErr);
    }
    const p = prof as { lunch_time?: string | null; dinner_time?: string | null } | null;
    defaultLunch  = toHHMM(p?.lunch_time);
    defaultDinner = toHHMM(p?.dinner_time);
  }

  return {
    household_id: householdId,
    for_date: forDate,
    lunch_time:  dailyLunch  ?? defaultLunch  ?? DEFAULT_LUNCH,
    dinner_time: dailyDinner ?? defaultDinner ?? DEFAULT_DINNER,
    set_by: (daily?.set_by as DailyMealSchedule['set_by']) ?? null,
  };
}

/**
 * 设某家某天某餐时间.
 * upsert ON CONFLICT (household_id, for_date) DO UPDATE — 同天再设覆盖, 另一餐保留.
 * time 'HH:MM' (UI 来), 内部补 ':00' → 'HH:MM:SS' (Postgres time 列).
 */
export async function setDailyMealTime(
  householdId: string,
  forDate: string,
  meal: 'lunch' | 'dinner',
  time: string,             // 'HH:MM'
  setBy: 'employer' | 'helper' | 'chat',
): Promise<void> {
  if (!householdId) throw new Error('household_id required');
  const timeWithSec = time.length === 5 ? time + ':00' : time;

  // 先读现有行, 保留另一餐字段 (upsert 不传字段会 NULL 覆盖)
  const { data: existing } = await supabase
    .from('household_meal_schedule')
    .select('lunch_time, dinner_time')
    .eq('household_id', householdId)
    .eq('for_date', forDate)
    .maybeSingle();

  const ex = existing as { lunch_time?: string | null; dinner_time?: string | null } | null;
  const payload: Record<string, unknown> = {
    household_id: householdId,
    for_date: forDate,
    lunch_time:  meal === 'lunch'  ? timeWithSec : (ex?.lunch_time  ?? null),
    dinner_time: meal === 'dinner' ? timeWithSec : (ex?.dinner_time ?? null),
    set_by: setBy,
  };

  const { error } = await supabase
    .from('household_meal_schedule')
    .upsert(payload, { onConflict: 'household_id,for_date' });
  if (error) {
    console.warn('[dailyMealSchedule] upsert error:', error);
    throw error;
  }
}

/** Date → 'YYYY-MM-DD' local (避免 toISOString 时区漂) */
export function dateToISODay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
