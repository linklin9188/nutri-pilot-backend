/**
 * cart — Shopping cart CRUD wrapper (TICKET-080-A).
 *
 * 1 用户 1 购物车 (跨设备 sync, shopping_carts.user_id UNIQUE).
 * cart_items UNIQUE (cart_id, sku_id) — 同 SKU 加车 upsert 累加 qty.
 *
 * 价格/单位/供应商信息 JOIN 自 supplier_skus + suppliers, 不冗余在 cart_items
 * (商品价格变化 cart 显示也跟着变, 下单时刻才冻结到 order_items).
 *
 * 跟 favorites / homeInventory 一样: 任何 DB 失败都不抛, 返回空状态防 UI 卡死.
 */

import { supabase } from './supabase';

export interface CartItem {
  id:                  string;   // cart_items.id
  sku_id:              string;
  sku_name:            string;
  retail_price_hkd:    number;
  unit:                string;
  qty:                 number;
  supplier_id:         string;   // TICKET-083 — 用于 /cart 按供应商分组 + /checkout 多订单拆分
  supplier_name:       string;
  supplier_status:     'active' | 'preview' | 'pending';
}

export interface CartState {
  cartId:        string | null;
  items:         CartItem[];
  subtotalHkd:   number;
}

const EMPTY_CART: CartState = { cartId: null, items: [], subtotalHkd: 0 };

/**
 * 拉用户购物车: shopping_carts → cart_items → JOIN supplier_skus + suppliers.
 * 失败返 EMPTY_CART; 没车也返 EMPTY_CART (cartId=null).
 */
export async function loadCart(userId: string): Promise<CartState> {
  if (!userId) return EMPTY_CART;
  try {
    const { data: cart, error: cartErr } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (cartErr || !cart) return EMPTY_CART;
    const cartId = (cart as any).id as string;

    const { data: rows, error: itemsErr } = await supabase
      .from('cart_items')
      .select(`
        id,
        sku_id,
        qty,
        added_at,
        supplier_skus!cart_items_sku_id_fkey (
          sku_name,
          supplier_id,
          retail_price_hkd,
          price_hkd,
          unit,
          suppliers!supplier_skus_supplier_id_fkey ( name, status )
        )
      `)
      .eq('cart_id', cartId)
      .order('added_at', { ascending: true });
    if (itemsErr || !rows) return { cartId, items: [], subtotalHkd: 0 };

    const items: CartItem[] = (rows as any[]).map(r => {
      const sku = r.supplier_skus || {};
      // retail_price_hkd 是 094 新加的列, 老 SKU 行可能为 null → fallback price_hkd
      const retail = typeof sku.retail_price_hkd === 'number'
        ? sku.retail_price_hkd
        : (typeof sku.price_hkd === 'number' ? sku.price_hkd : 0);
      return {
        id:               r.id,
        sku_id:           r.sku_id,
        sku_name:         sku.sku_name ?? '(已下架)',
        retail_price_hkd: retail,
        unit:             sku.unit ?? '份',
        qty:              r.qty,
        supplier_id:      sku.supplier_id ?? '',
        supplier_name:    sku.suppliers?.name ?? '',
        supplier_status:  (sku.suppliers?.status ?? 'active') as CartItem['supplier_status'],
      };
    });
    return { cartId, items, subtotalHkd: calcSubtotal(items) };
  } catch {
    return EMPTY_CART;
  }
}

/**
 * ensureCart — 取 cart_id, 没有就创建 (1 用户 1 车 UNIQUE).
 * 返回 cart_id 或 null (失败).
 */
async function ensureCart(userId: string): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) return (existing as any).id as string;

    const { data: created, error: createErr } = await supabase
      .from('shopping_carts')
      .insert({ user_id: userId })
      .select('id')
      .single();
    if (createErr || !created) return null;
    return (created as any).id as string;
  } catch {
    return null;
  }
}

/**
 * 加 SKU 到购物车: 同 SKU 已在车里 → qty += qty (UPDATE), 否则 INSERT.
 *
 * 不用 PostgREST upsert (UNIQUE cart_id+sku_id 触发 ON CONFLICT) — 那需要 RPC
 * 拿到旧 qty 才能累加. 这里 SELECT-then-UPDATE-or-INSERT 两个 round-trip 简单清晰.
 */
export async function addToCart(userId: string, skuId: string, qty: number = 1): Promise<boolean> {
  if (!userId || !skuId || qty <= 0) return false;
  try {
    const cartId = await ensureCart(userId);
    if (!cartId) return false;

    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, qty')
      .eq('cart_id', cartId)
      .eq('sku_id', skuId)
      .maybeSingle();

    if (existing) {
      const newQty = ((existing as any).qty as number) + qty;
      const { error: updateErr } = await supabase
        .from('cart_items')
        .update({ qty: newQty })
        .eq('id', (existing as any).id);
      if (updateErr) return false;
    } else {
      const { error: insertErr } = await supabase
        .from('cart_items')
        .insert({ cart_id: cartId, sku_id: skuId, qty });
      if (insertErr) return false;
    }

    // 触发 shopping_carts.updated_at trigger (touch cart)
    await supabase.from('shopping_carts').update({ updated_at: new Date().toISOString() }).eq('id', cartId);

    try { window.dispatchEvent(new Event('nutri-cart-changed')); } catch {}
    return true;
  } catch {
    return false;
  }
}

/** 改数量 (qty <= 0 → 删除) */
export async function updateCartItemQty(cartItemId: string, qty: number): Promise<boolean> {
  if (!cartItemId) return false;
  try {
    if (qty <= 0) {
      return removeFromCart(cartItemId);
    }
    const { error } = await supabase
      .from('cart_items')
      .update({ qty })
      .eq('id', cartItemId);
    if (error) return false;
    try { window.dispatchEvent(new Event('nutri-cart-changed')); } catch {}
    return true;
  } catch {
    return false;
  }
}

/** 删除 item */
export async function removeFromCart(cartItemId: string): Promise<boolean> {
  if (!cartItemId) return false;
  try {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', cartItemId);
    if (error) return false;
    try { window.dispatchEvent(new Event('nutri-cart-changed')); } catch {}
    return true;
  } catch {
    return false;
  }
}

/** 清空 (删 cart_items 但保留 shopping_carts 行, 下次 ensureCart 复用) */
export async function clearCart(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data: cart } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!cart) return true;
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', (cart as any).id);
    if (error) return false;
    try { window.dispatchEvent(new Event('nutri-cart-changed')); } catch {}
    return true;
  } catch {
    return false;
  }
}

/** 算总价 */
export function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, it) => sum + it.retail_price_hkd * it.qty, 0);
}

/** 一个供应商组 (Cart / Checkout 按 supplier 拆订单显示用). */
export interface SupplierGroup {
  supplierId:    string;
  supplierName:  string;
  items:         CartItem[];
  subtotalHkd:   number;
}

/**
 * TICKET-083 — 按 supplier_id 把 cart items 分组. 用于 /cart 按供应商展示 +
 * /checkout 多订单拆分. 同一 supplier 内保持原 added_at 顺序.
 */
export function groupItemsBySupplier(items: CartItem[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();
  for (const it of items) {
    const key = it.supplier_id || '__unknown__';
    const existing = map.get(key);
    if (existing) {
      existing.items.push(it);
      existing.subtotalHkd += it.retail_price_hkd * it.qty;
    } else {
      map.set(key, {
        supplierId:   it.supplier_id,
        supplierName: it.supplier_name,
        items:        [it],
        subtotalHkd:  it.retail_price_hkd * it.qty,
      });
    }
  }
  return [...map.values()];
}

/** 快速取 cart 商品数 (header 红点). 失败返 0. */
export async function getCartCount(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const { data: cart } = await supabase
      .from('shopping_carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!cart) return 0;
    const { count } = await supabase
      .from('cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('cart_id', (cart as any).id);
    return count ?? 0;
  } catch {
    return 0;
  }
}
