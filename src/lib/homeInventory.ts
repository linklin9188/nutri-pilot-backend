/**
 * homeInventory.ts — TICKET-075 P0 §2 (老板真测 #18 全链路 6 断点)
 *
 * 原 home_inventory_<userId>_<date> localStorage 单设备孤岛 → DB 主存 + LS 副 cache.
 * 雇主 /verify 勾"我家有"、菲佣 /helper-prep 勾"已备齐" 共享同一 household 同一日的
 * inventory 行, 切设备 / 跨账号都看得见.
 *
 * 调用方:
 *   • src/pages/VerifyIngredients.tsx (雇主) — load / set / commitFromLs
 *   • src/pages/HelperPrep.tsx        (菲佣) — load / set
 *
 * 不引 auth.users / auth.uid()(CLAUDE.md 硬规); household_id 由调用方查
 * households + household_members 后传进来.
 */
import { supabase } from './supabase';

export interface HomeInventoryItem {
  id:              string;
  household_id:    string;
  ingredient_name: string;
  is_available:    boolean;
  marked_by:       string | null;
  marked_at:       string;
  for_date:        string;
}

/** 默认日期 = 本地今天 YYYY-MM-DD (跟 VerifyIngredients 同口径不踩 UTC 坑). */
function todayLocal(): string {
  const d = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** 拉某 household 某日 inventory 全部行. */
export async function loadHomeInventory(
  householdId: string,
  forDate?:    string,
): Promise<HomeInventoryItem[]> {
  if (!householdId) return [];
  const date = forDate ?? todayLocal();
  const { data, error } = await supabase
    .from('home_inventory')
    .select('*')
    .eq('household_id', householdId)
    .eq('for_date', date);
  if (error || !data) return [];
  return data as HomeInventoryItem[];
}

/** 设置某食材是否"我家有". upsert 单条, 不存在则插. */
export async function setIngredientAvailable(
  householdId:    string,
  ingredientName: string,
  isAvailable:    boolean,
  markedBy:       'employer' | 'helper',
  forDate?:       string,
): Promise<boolean> {
  if (!householdId || !ingredientName) return false;
  const date = forDate ?? todayLocal();
  const { error } = await supabase
    .from('home_inventory')
    .upsert({
      household_id:    householdId,
      ingredient_name: ingredientName,
      is_available:    isAvailable,
      marked_by:       markedBy,
      for_date:        date,
    }, { onConflict: 'household_id,ingredient_name,for_date' });
  if (error) {
    console.warn('[homeInventory.set] upsert failed:', error);
    return false;
  }
  return true;
}

/**
 * 把整份 LS map (ingredient_name → is_available) 批量 push DB. 用于:
 *   1. VerifyIngredients "确认采购通知菲佣" 按钮 — 把当前所有勾选一次性 commit
 *   2. 首次 mount 兼容: LS 有数据但 DB 没 → 一次性迁移上去
 *
 * 返回成功 push 的行数 (失败返回 0).
 */
export async function commitInventoryFromLs(
  householdId: string,
  lsMap:       Record<string, boolean>,
  markedBy:    'employer' | 'helper',
  forDate?:    string,
): Promise<number> {
  if (!householdId) return 0;
  const date = forDate ?? todayLocal();
  const rows = Object.entries(lsMap).map(([ingredient_name, is_available]) => ({
    household_id: householdId,
    ingredient_name,
    is_available,
    marked_by:    markedBy,
    for_date:     date,
  }));
  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from('home_inventory')
    .upsert(rows, { onConflict: 'household_id,ingredient_name,for_date' });
  if (error) {
    console.warn('[homeInventory.commit] batch upsert failed:', error);
    return 0;
  }
  return rows.length;
}

/**
 * 把 DB 拉回来的 HomeInventoryItem[] 折叠成 LS map 同形状,
 * 让 VerifyIngredients / HelperPrep UI 不用改单条渲染逻辑.
 */
export function inventoryToMap(items: HomeInventoryItem[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const it of items) {
    if (it.is_available) m[it.ingredient_name] = true;
  }
  return m;
}
