/**
 * purchaseFlow — TICKET-083 P0 雇主 ⇄ 菲佣 采购流程 (老板真测真实业务流).
 *
 * 正确顺序:
 *   雇主 ① 生成菜单 → ② "📤 发送清单给菲佣" (sendListToHelper) →
 *   菲佣 ③ 勾"我家有" → ④ "✅ 确认完了" (confirmInventoryAndNotifyEmployer) →
 *   雇主 ⑤ Home 红点 (loadUnreadNotifications + 'helper_confirmed') →
 *   ⑥ autoFillCartFromConfirmedList (按 supplier 分组加车) → ⑦ /cart → /checkout.
 *
 * 数据源头 = 菲佣 (天天做饭知道冰箱有啥). 雇主只接清单 + 下单.
 *
 * Persistence:
 *   - purchase_notifications: 双向 (employer_sent / helper_confirmed)
 *   - home_inventory.confirmed_at + confirmed_by_helper_id: 菲佣"确认完了"快照
 *
 * Caller:
 *   - VerifyIngredients.tsx (雇主端) — sendListToHelper + load notifications +
 *     autoFillCartFromConfirmedList
 *   - HelperPrep.tsx (菲佣端) — confirmInventoryAndNotifyEmployer
 *   - components/PurchaseNotificationBanner.tsx (Home 顶部红点)
 */
import { supabase } from './supabase';
import { addToCart } from './cart';

export type NotifyType = 'employer_sent' | 'helper_confirmed';

export interface PurchaseNotification {
  id:                 string;
  household_id:       string;
  for_date:           string;
  notify_type:        NotifyType;
  message_zh:         string | null;
  message_en:         string | null;
  message_tl:         string | null;
  to_be_bought_count: number;
  read_at:            string | null;
  created_at:         string;
}

/** Local YYYY-MM-DD (不踩 UTC 坑, 跟 VerifyIngredients / HelperPrep 同口径). */
function todayLocal(): string {
  const d = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * 雇主 ② "📤 发送清单给菲佣". 写入 employer_sent 通知 + 重置 read_at.
 * to_be_bought_count = 0 (菲佣还没勾, 数字由 helper_confirmed 时填).
 *
 * UPSERT ON CONFLICT (household_id, for_date, notify_type) → 雇主重发刷新 created_at.
 */
export async function sendListToHelper(
  householdId: string,
  forDate?:    string,
): Promise<boolean> {
  if (!householdId) return false;
  const date = forDate ?? todayLocal();
  try {
    const { error } = await supabase
      .from('purchase_notifications')
      .upsert({
        household_id:       householdId,
        for_date:           date,
        notify_type:        'employer_sent',
        message_zh:         '雇主已发送采购清单, 请确认家里有哪些',
        message_en:         'Employer sent shopping list — please confirm what you have at home',
        message_tl:         'Ipinadala ng employer ang shopping list — kumpirmahin kung ano ang meron sa bahay',
        to_be_bought_count: 0,
        read_at:            null,
        created_at:         new Date().toISOString(),
      }, { onConflict: 'household_id,for_date,notify_type' });
    if (error) {
      console.warn('[purchaseFlow.sendListToHelper] upsert failed:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[purchaseFlow.sendListToHelper] exception:', e);
    return false;
  }
}

/**
 * 菲佣 ④ "✅ 确认完了". 三步原子操作:
 *   1. UPDATE home_inventory.confirmed_at + confirmed_by_helper_id (整个 household
 *      + for_date 的所有行)
 *   2. UPSERT helper_confirmed notification (to_be_bought_count = 还要买的数量)
 *   3. (副作用) read_at=null 让雇主下次开 Home 看到红点
 *
 * toBeBoughtIngredients = home_inventory.filter(i => !i.is_available).map(name).
 */
export async function confirmInventoryAndNotifyEmployer(
  householdId:            string,
  forDate:                string | undefined,
  helperUserId:           string | null,
  toBeBoughtIngredients:  string[],
): Promise<boolean> {
  if (!householdId) return false;
  const date = forDate ?? todayLocal();
  try {
    // Step 1: 整行刷 confirmed_at, 即使某行还没行 (用户没勾任何) 也允许 (NOOP, 之后
    // helper 一定有 home_inventory 行因为菲佣会先勾才点确认; 极端 case 没勾也允许
    // "🆗 我家什么都没有, 全要买"这种语义).
    const { error: updErr } = await supabase
      .from('home_inventory')
      .update({
        confirmed_at:           new Date().toISOString(),
        confirmed_by_helper_id: helperUserId,
      })
      .eq('household_id', householdId)
      .eq('for_date', date);
    if (updErr) {
      console.warn('[purchaseFlow.confirm] inventory UPDATE failed:', updErr);
      // 不阻塞: notification 仍然要写, 让雇主收到"菲佣确认了"
    }

    // Step 2: 写 helper_confirmed notification
    const n = toBeBoughtIngredients.length;
    const { error: notifErr } = await supabase
      .from('purchase_notifications')
      .upsert({
        household_id:       householdId,
        for_date:           date,
        notify_type:        'helper_confirmed',
        message_zh:         `菲佣确认完了 · 还要买 ${n} 件`,
        message_en:         `Helper confirmed · ${n} items to buy`,
        message_tl:         `Kumpirmado ng helper · ${n} bibilhin`,
        to_be_bought_count: n,
        read_at:            null,
        created_at:         new Date().toISOString(),
      }, { onConflict: 'household_id,for_date,notify_type' });
    if (notifErr) {
      console.warn('[purchaseFlow.confirm] notification upsert failed:', notifErr);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[purchaseFlow.confirm] exception:', e);
    return false;
  }
}

/** 拉某 household 今日所有未读通知 (按 created_at desc). */
export async function loadUnreadNotifications(
  householdId: string,
  forDate?:    string,
): Promise<PurchaseNotification[]> {
  if (!householdId) return [];
  const date = forDate ?? todayLocal();
  try {
    const { data, error } = await supabase
      .from('purchase_notifications')
      .select('*')
      .eq('household_id', householdId)
      .eq('for_date', date)
      .is('read_at', null)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as PurchaseNotification[];
  } catch {
    return [];
  }
}

/** 拉某 household 今日某 type 的通知 (不管是否已读), VerifyIngredients 按钮状态用. */
export async function loadNotification(
  householdId: string,
  notifyType:  NotifyType,
  forDate?:    string,
): Promise<PurchaseNotification | null> {
  if (!householdId) return null;
  const date = forDate ?? todayLocal();
  try {
    const { data, error } = await supabase
      .from('purchase_notifications')
      .select('*')
      .eq('household_id', householdId)
      .eq('for_date', date)
      .eq('notify_type', notifyType)
      .maybeSingle();
    if (error || !data) return null;
    return data as PurchaseNotification;
  } catch {
    return null;
  }
}

/** 标记单条通知已读. */
export async function markNotificationRead(notifId: string): Promise<boolean> {
  if (!notifId) return false;
  try {
    const { error } = await supabase
      .from('purchase_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notifId);
    return !error;
  } catch {
    return false;
  }
}

/** 一个供应商组. */
export interface SupplierCartGroup {
  supplierId:    string;
  supplierName:  string;
  itemsAdded:    number;
}

/** 自动加购结果. */
export interface AutoFillCartResult {
  supplierGroups:    SupplierCartGroup[];
  totalItemsAdded:   number;
  unmatchedCount:    number;   // 没匹配到 SKU 的食材数 (用户自己去其他渠道买)
}

/**
 * 雇主 ⑥ 收红点 → 点 → 自动加购物车.
 *
 * 流程:
 *   1. SELECT home_inventory WHERE household + for_date AND is_available=false
 *      → 这些是菲佣确认完后"还要买的"
 *   2. SELECT supplier_skus 全部 (ingredient_keywords 数组 + supplier 关联),
 *      只看 active+preview 供应商
 *   3. 对每个 ingredient_name, 找第一个 keyword 命中的 SKU, addToCart(uid, sku.id, 1)
 *   4. 按 supplier_id 分组返回 (UI 显"加了 X 件来自 🇮🇹 Inalca")
 *   5. 没匹配的食材不加 (用户自己买; 在 toast / banner 显示 unmatched count)
 */
export async function autoFillCartFromConfirmedList(
  userId:       string,
  householdId:  string,
  forDate?:     string,
): Promise<AutoFillCartResult> {
  const emptyResult: AutoFillCartResult = {
    supplierGroups: [], totalItemsAdded: 0, unmatchedCount: 0,
  };
  if (!userId || !householdId) return emptyResult;
  const date = forDate ?? todayLocal();
  try {
    // Step 1: 拉"要买的"食材清单 (菲佣勾过, is_available=false 的)
    const { data: invRows, error: invErr } = await supabase
      .from('home_inventory')
      .select('ingredient_name')
      .eq('household_id', householdId)
      .eq('for_date', date)
      .eq('is_available', false);
    if (invErr || !invRows || invRows.length === 0) return emptyResult;
    const toBeBought = (invRows as any[])
      .map(r => String(r.ingredient_name || '').trim())
      .filter(Boolean);
    if (toBeBought.length === 0) return emptyResult;

    // Step 2: 拉 SKU + supplier (只 active/preview, status pending 不接订)
    const { data: skuRows, error: skuErr } = await supabase
      .from('supplier_skus')
      .select(`
        id,
        supplier_id,
        sku_name,
        ingredient_keywords,
        active,
        suppliers!supplier_skus_supplier_id_fkey ( id, name, status )
      `)
      .eq('active', true);
    if (skuErr || !skuRows || skuRows.length === 0) {
      // 没 SKU → 所有食材都 unmatched
      return { supplierGroups: [], totalItemsAdded: 0, unmatchedCount: toBeBought.length };
    }
    const validSkus = (skuRows as any[]).filter(r =>
      ['active', 'preview'].includes(r.suppliers?.status ?? '')
    );

    // Step 3 + 4: 对每个食材找首个命中 SKU, addToCart, 累计 supplier groups
    const groupsBySupplier = new Map<string, SupplierCartGroup>();
    let unmatchedCount = 0;
    let totalAdded = 0;
    for (const ingName of toBeBought) {
      const lowerName = ingName.toLowerCase();
      const matched = validSkus.find(sku => {
        const kws = Array.isArray(sku.ingredient_keywords) ? sku.ingredient_keywords : [];
        return kws.some((kw: string) =>
          kw && typeof kw === 'string' && lowerName.includes(kw.toLowerCase())
        );
      });
      if (!matched) {
        unmatchedCount += 1;
        continue;
      }
      const ok = await addToCart(userId, matched.id, 1);
      if (!ok) {
        unmatchedCount += 1;
        continue;
      }
      totalAdded += 1;
      const supId   = matched.supplier_id as string;
      const supName = matched.suppliers?.name as string ?? '';
      const grp = groupsBySupplier.get(supId);
      if (grp) {
        grp.itemsAdded += 1;
      } else {
        groupsBySupplier.set(supId, {
          supplierId:   supId,
          supplierName: supName,
          itemsAdded:   1,
        });
      }
    }

    return {
      supplierGroups:  [...groupsBySupplier.values()],
      totalItemsAdded: totalAdded,
      unmatchedCount,
    };
  } catch (e) {
    console.warn('[purchaseFlow.autoFillCart] exception:', e);
    return emptyResult;
  }
}

/**
 * UI helper — 给定通知 + 当前语言, 返回最优文案. fallback chain:
 *   pickedLang → zh → en → tl → ''
 */
export function pickNotifMessage(
  n: PurchaseNotification,
  lang: 'zh' | 'en' | 'tl',
): string {
  if (lang === 'zh' && n.message_zh) return n.message_zh;
  if (lang === 'en' && n.message_en) return n.message_en;
  if (lang === 'tl' && n.message_tl) return n.message_tl;
  return n.message_zh || n.message_en || n.message_tl || '';
}
