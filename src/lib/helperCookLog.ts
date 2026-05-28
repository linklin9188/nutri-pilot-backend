/**
 * helperCookLog.ts — TICKET-098 SPEC v2 Phase 1 真持久化做菜日志.
 *
 * 老板真测痛点 #1: "我下班路上想知道菲佣今天做没做".
 *
 * 双向 API:
 * - markCookStatus(): 菲佣 toggle 时写, 双写 LS + DB (LS 快速 UI, DB 跨设备)
 * - loadTodayCookLogs(): 雇主 Home 读今日所有菲佣记录 by household_id
 * - getCookLogStatus(): 单个 dish 状态查询 (HelperHome 渲染用)
 */

import { supabase } from './supabase';
import { getUserId } from './userId';

export type CookStatus = 'pending' | 'cooking' | 'done' | 'skipped';

export interface CookLog {
  id?: string;
  helper_id: string;
  household_id?: string | null;
  dish_id: string;
  served_date: string;       // YYYY-MM-DD
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  status: CookStatus;
  started_at?: string | null;
  completed_at?: string | null;
}

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * 菲佣 toggle 做菜状态 → 写 DB (UPSERT 幂等).
 * status='done' 自动写 completed_at; 'cooking' 写 started_at.
 * 失败静默, 上层 LS 仍 toggle 不阻塞 UX.
 */
export async function markCookStatus(params: {
  dishId: string;
  status: CookStatus;
  mealType?: 'breakfast' | 'lunch' | 'dinner';
  householdId?: string | null;
}): Promise<{ ok: boolean }> {
  const helperId = getUserId();
  if (!helperId || !params.dishId) return { ok: false };

  const now = new Date().toISOString();
  const payload: CookLog = {
    helper_id:    helperId,
    household_id: params.householdId ?? null,
    dish_id:      params.dishId,
    served_date:  todayLocal(),
    meal_type:    params.mealType ?? 'lunch',
    status:       params.status,
    started_at:   params.status === 'cooking' ? now : null,
    completed_at: params.status === 'done' ? now : null,
  };

  try {
    const { error } = await supabase
      .from('helper_cook_logs')
      .upsert(payload, { onConflict: 'helper_id,dish_id,served_date' });
    if (error) {
      console.warn('[helperCookLog] markCookStatus failed:', error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e: any) {
    console.warn('[helperCookLog] markCookStatus exception:', e?.message);
    return { ok: false };
  }
}

/**
 * 雇主端: 拉今天 household 下所有菲佣的 cook logs.
 * 用于 Home "👩‍🍳 菲佣今日进度" 卡渲染.
 */
export async function loadTodayCookLogs(
  householdId: string | null | undefined,
): Promise<CookLog[]> {
  if (!householdId) return [];
  try {
    const { data, error } = await supabase
      .from('helper_cook_logs')
      .select('*')
      .eq('household_id', householdId)
      .eq('served_date', todayLocal());
    if (error || !data) return [];
    return data as CookLog[];
  } catch {
    return [];
  }
}

/**
 * 菲佣端: 拉自己今天的 cook logs (HelperHome render task 状态).
 */
export async function loadMyTodayCookLogs(): Promise<CookLog[]> {
  const helperId = getUserId();
  if (!helperId) return [];
  try {
    const { data, error } = await supabase
      .from('helper_cook_logs')
      .select('*')
      .eq('helper_id', helperId)
      .eq('served_date', todayLocal());
    if (error || !data) return [];
    return data as CookLog[];
  } catch {
    return [];
  }
}
