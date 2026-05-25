/**
 * orders — Order CRUD wrapper (TICKET-080-A).
 *
 * 流程:
 *   /cart → /checkout 填地址 → createOrder() →
 *     1. 算 subtotal + commission (从 SKU 当前 retail/wholesale 快照)
 *     2. INSERT orders (status='pending_payment')
 *     3. INSERT order_items (价格快照, 含老板私密 wholesale + commission)
 *     4. INSERT order_status_history (pending_payment)
 *     5. clearCart(userId)
 *     6. 返回 OrderRow → 跳 /order/success
 *
 * 080-B 接 Stripe 时:
 *   - createOrder 后立刻 create-checkout-session 拿 stripe_session_id, UPDATE orders.stripe_session_id
 *   - stripe-webhook 收 checkout.session.completed → UPDATE status='paid' + paid_at + INSERT history
 *
 * 老板私密红线:
 *   - order_items.unit_wholesale_price_hkd + commission_hkd 写入 DB 但 SELECT 不出
 *   - loadOrders / loadOrderDetail 显式只 SELECT 用户可见字段 (排除 wholesale/commission)
 */

import { supabase } from './supabase';
import type { CartItem } from './cart';
import { clearCart, groupItemsBySupplier } from './cart';

export interface CreateOrderInput {
  cartItems:              CartItem[];
  deliveryAddress:        string;
  deliveryContactName:    string;
  deliveryContactPhone:   string;
  deliveryTimeSlot:       string;
  deliveryNote?:          string;
  householdId?:           string | null;
}

export interface OrderRow {
  id:                     string;
  order_number:           string;
  status:                 string;
  subtotal_hkd:           number;
  delivery_fee_hkd:       number;
  total_hkd:              number;
  delivery_address:       string;
  delivery_contact_name:  string;
  delivery_contact_phone: string;
  delivery_time_slot:     string | null;
  delivery_note:          string | null;
  tracking_number:        string | null;
  shipped_at:             string | null;
  delivered_at:           string | null;
  paid_at:                string | null;
  created_at:             string;
}

export interface OrderItemRow {
  id:                    string;
  sku_id:                string | null;
  sku_name_snapshot:     string;
  qty:                   number;
  unit_retail_price_hkd: number;
  subtotal_hkd:          number;
}

export interface OrderStatusHistoryRow {
  id:         string;
  status:     string;
  note:       string | null;
  changed_at: string;
}

// 用户可见 SELECT — 显式排除 commission_total_hkd / stripe_session_id / supplier_order_id 等
// 老板私密 / 内部字段. 任何前端展示路径都走这个常量, 防止 wholesale 泄露.
const ORDER_USER_SELECT = `
  id, order_number, status,
  subtotal_hkd, delivery_fee_hkd, total_hkd,
  delivery_address, delivery_contact_name, delivery_contact_phone,
  delivery_time_slot, delivery_note,
  tracking_number, shipped_at, delivered_at, paid_at,
  created_at
`;

const ORDER_ITEM_USER_SELECT = `
  id, sku_id, sku_name_snapshot, qty,
  unit_retail_price_hkd, subtotal_hkd
`;
// 注意: 显式不 SELECT unit_wholesale_price_hkd + commission_hkd. 老板私密.

/**
 * 私有: 给定一组 cartItems 创建一个 order (含 wholesale 拉取 + items + history).
 * 调用方决定要不要 clearCart (createOrder 单次清; createOrders 多订单完成后统一清).
 */
async function _createSingleOrder(
  userId: string,
  input:  CreateOrderInput,
  subCartItems: CartItem[],
): Promise<OrderRow | null> {
  if (!subCartItems || subCartItems.length === 0) return null;
  // Step 1: 拉 wholesale
  const skuIds = subCartItems.map(it => it.sku_id);
  const { data: skuRows } = await supabase
    .from('supplier_skus')
    .select('id, wholesale_price_hkd')
    .in('id', skuIds);
  const wholesaleMap = new Map<string, number>();
  for (const r of (skuRows as any[]) || []) {
    if (typeof r.wholesale_price_hkd === 'number') wholesaleMap.set(r.id, r.wholesale_price_hkd);
  }

  let subtotal = 0;
  let commissionTotal = 0;
  const itemsToInsert: any[] = [];
  for (const it of subCartItems) {
    const lineSubtotal = it.retail_price_hkd * it.qty;
    const wholesale = wholesaleMap.get(it.sku_id);
    const lineCommission = typeof wholesale === 'number'
      ? (it.retail_price_hkd - wholesale) * it.qty
      : null;
    subtotal += lineSubtotal;
    if (lineCommission !== null) commissionTotal += lineCommission;
    itemsToInsert.push({
      sku_id:                   it.sku_id,
      sku_name_snapshot:        it.sku_name,
      qty:                      it.qty,
      unit_retail_price_hkd:    it.retail_price_hkd,
      unit_wholesale_price_hkd: typeof wholesale === 'number' ? wholesale : null,
      subtotal_hkd:             lineSubtotal,
      commission_hkd:           lineCommission,
    });
  }

  const deliveryFee = 0;
  const total = subtotal + deliveryFee;

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      user_id:                userId,
      household_id:           input.householdId ?? null,
      delivery_address:       input.deliveryAddress,
      delivery_contact_name:  input.deliveryContactName,
      delivery_contact_phone: input.deliveryContactPhone,
      delivery_time_slot:     input.deliveryTimeSlot,
      delivery_note:          input.deliveryNote ?? null,
      subtotal_hkd:           subtotal,
      delivery_fee_hkd:       deliveryFee,
      total_hkd:              total,
      commission_total_hkd:   commissionTotal,
      status:                 'pending_payment',
    })
    .select(ORDER_USER_SELECT)
    .single();
  if (orderErr || !order) {
    console.warn('[orders] _createSingleOrder INSERT failed:', orderErr);
    return null;
  }
  const orderId = (order as any).id as string;

  const itemsWithOrderId = itemsToInsert.map(it => ({ ...it, order_id: orderId }));
  const { error: itemsErr } = await supabase
    .from('order_items')
    .insert(itemsWithOrderId);
  if (itemsErr) {
    console.warn('[orders] order_items INSERT failed:', itemsErr);
  }

  await supabase
    .from('order_status_history')
    .insert({ order_id: orderId, status: 'pending_payment', note: '订单已创建, 等待支付' });

  return order as OrderRow;
}

/**
 * createOrder — 单订单 (back-compat 入口). 内部走 _createSingleOrder + clearCart.
 *
 * 080-A: status='pending_payment', 不接 Stripe. 080-B 接通后 createOrder 后立刻
 * 触发 create-checkout-session.
 *
 * TICKET-083: 多供应商场景请改用 createOrders 拆多张订单.
 */
export async function createOrder(
  userId: string,
  input: CreateOrderInput,
): Promise<OrderRow | null> {
  if (!userId) return null;
  if (!input.cartItems || input.cartItems.length === 0) return null;
  try {
    const order = await _createSingleOrder(userId, input, input.cartItems);
    if (!order) return null;
    await clearCart(userId);
    return order;
  } catch (e) {
    console.warn('[orders] createOrder exception:', e);
    return null;
  }
}

/**
 * createOrders — TICKET-083 §7a 多订单. 按 supplier_id 拆 cartItems 创建多张 order.
 *
 * 流程:
 *   1. groupItemsBySupplier(cartItems) → N 个 supplier 组
 *   2. 对每组调 _createSingleOrder (各自 wholesale + commission + history)
 *   3. 全部成功后 clearCart (中途失败的部分订单不回滚, RLS 没事务支持; 失败的 group 跳过)
 *   4. 返回 OrderRow[] 给 Checkout 跳 /orders/success?ids=A,B
 */
export async function createOrders(
  userId: string,
  input:  CreateOrderInput,
): Promise<OrderRow[]> {
  if (!userId) return [];
  if (!input.cartItems || input.cartItems.length === 0) return [];
  try {
    const groups = groupItemsBySupplier(input.cartItems);
    const orders: OrderRow[] = [];
    for (const g of groups) {
      const o = await _createSingleOrder(userId, input, g.items);
      if (o) orders.push(o);
    }
    if (orders.length > 0) {
      await clearCart(userId);
    }
    return orders;
  } catch (e) {
    console.warn('[orders] createOrders exception:', e);
    return [];
  }
}

/** 拉用户订单列表 */
export async function loadOrders(userId: string): Promise<OrderRow[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_USER_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as OrderRow[];
  } catch {
    return [];
  }
}

/** 拉单订单详情 + items + 状态历史 */
export async function loadOrderDetail(orderId: string): Promise<{
  order:   OrderRow | null;
  items:   OrderItemRow[];
  history: OrderStatusHistoryRow[];
}> {
  if (!orderId) return { order: null, items: [], history: [] };
  try {
    const [{ data: order }, { data: items }, { data: history }] = await Promise.all([
      supabase.from('orders').select(ORDER_USER_SELECT).eq('id', orderId).maybeSingle(),
      supabase.from('order_items').select(ORDER_ITEM_USER_SELECT).eq('order_id', orderId).order('id', { ascending: true }),
      supabase.from('order_status_history').select('id, status, note, changed_at').eq('order_id', orderId).order('changed_at', { ascending: true }),
    ]);
    return {
      order:   (order as OrderRow) || null,
      items:   (items as OrderItemRow[]) || [],
      history: (history as OrderStatusHistoryRow[]) || [],
    };
  } catch {
    return { order: null, items: [], history: [] };
  }
}

/** 状态机文案 (三语) — 配套 /orders 卡片 + 详情页. */
export function getOrderStatusLabel(status: string, lang: 'zh' | 'en' | 'tl' = 'zh'): string {
  const map: Record<string, [string, string, string]> = {
    pending_payment: ['等待支付', 'Pending Payment', 'Hinihintay ang Bayad'],
    paid:            ['已支付',   'Paid',            'Bayad na'],
    preparing:       ['备货中',   'Preparing',       'Inihahanda'],
    shipped:         ['已发货',   'Shipped',         'Pinadala'],
    delivered:       ['已送达',   'Delivered',       'Naihatid'],
    cancelled:       ['已取消',   'Cancelled',       'Kinansela'],
    refunded:        ['已退款',   'Refunded',        'Ibinalik'],
  };
  const tup = map[status] || [status, status, status];
  return lang === 'en' ? tup[1] : lang === 'tl' ? tup[2] : tup[0];
}

/** 状态机颜色 (UI badge) */
export function getOrderStatusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'paid':       return { bg: 'rgba(37,211,102,0.12)', fg: '#16A34A' };
    case 'preparing':  return { bg: 'rgba(59,130,246,0.12)', fg: '#2563eb' };
    case 'shipped':    return { bg: 'rgba(168,85,247,0.12)', fg: '#9333ea' };
    case 'delivered':  return { bg: 'rgba(37,211,102,0.18)', fg: '#16A34A' };
    case 'cancelled':  return { bg: 'rgba(0,0,0,0.08)',      fg: '#555'    };
    case 'refunded':   return { bg: 'rgba(239,68,68,0.10)',  fg: '#ef4444' };
    case 'pending_payment':
    default:           return { bg: 'rgba(255,90,31,0.12)',  fg: '#FF5A1F' };
  }
}
