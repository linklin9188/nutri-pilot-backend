/**
 * admin/api.ts — typed wrapper around /api/admin/* endpoints.
 *
 * Every call sends the admin session token in `X-Admin-Token` header.
 * Server validates it against the in-memory session store (sprint 0) or
 * a signed-token check (002 sprint upgrade).
 */

import { getAdminToken, clearAdminSession } from './auth';

const BASE = ''; // same origin — Railway / nothinkeats.com serves both

export interface AdminMe {
  is_admin: boolean;
  username: string;
}

export interface AdminStats {
  total_users:        number;
  trial_active_users: number;
  premium_users:      number;
  new_users_7d:       number;
  active_users_7d:    number;
  total_menus:        number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Admin-Token': token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearAdminSession();
    if (location.pathname !== '/admin/login') location.assign('/admin/login');
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return call<{ token: string; username: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function adminMe(): Promise<AdminMe> {
  return call<AdminMe>('/api/admin/me');
}

export async function adminStats(): Promise<AdminStats> {
  return call<AdminStats>('/api/admin/stats');
}

// ── TICKET-046 第 4 步 — supplier admin ──────────────────────────────────

export interface AdminSupplier {
  id:               string;
  name:             string;
  brand_logo_url:   string | null;
  category:         string | null;
  contact_whatsapp: string | null;
  contact_url:      string | null;
  api_base_url:     string | null;
  api_auth_type:    string | null;
  api_status:       string;
  status:           string;
  created_at?:      string;
  updated_at?:      string;
}

export interface AdminSku {
  id:                              string;
  supplier_id:                     string;
  sku_name:                        string;
  sku_image_url:                   string | null;
  price_hkd:                       number | null;
  unit:                            string | null;
  order_url:                       string;
  ingredient_keywords:             string[];
  inventory_check_endpoint_path:   string | null;
  sku_external_id:                 string | null;
  active:                          boolean;
  created_at?:                     string;
  updated_at?:                     string;
}

export interface SupplierReportRow {
  supplier_id:   string;
  supplier_name: string;
  click_count:   number;
  unique_users:  number;
  top_skus:      Array<{ sku_id: string; sku_name: string; count: number }>;
  top_dishes:    Array<{ dish_id: string; dish_name: string; count: number }>;
}

export async function listSuppliers(): Promise<AdminSupplier[]> {
  const r = await call<{ suppliers: AdminSupplier[] }>('/api/admin/suppliers');
  return r.suppliers ?? [];
}

export async function createSupplier(
  payload: Partial<AdminSupplier>,
): Promise<AdminSupplier> {
  const r = await call<{ supplier: AdminSupplier }>('/api/admin/suppliers', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
  return r.supplier;
}

export async function updateSupplier(
  id:      string,
  payload: Partial<AdminSupplier>,
): Promise<AdminSupplier> {
  const r = await call<{ supplier: AdminSupplier }>(`/api/admin/suppliers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body:   JSON.stringify(payload),
  });
  return r.supplier;
}

export async function listSkus(supplierId?: string): Promise<AdminSku[]> {
  const qs = supplierId ? `?supplier_id=${encodeURIComponent(supplierId)}` : '';
  const r = await call<{ skus: AdminSku[] }>(`/api/admin/skus${qs}`);
  return r.skus ?? [];
}

export async function createSku(
  payload: Partial<AdminSku>,
): Promise<AdminSku> {
  const r = await call<{ sku: AdminSku }>('/api/admin/skus', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
  return r.sku;
}

export async function updateSku(
  id:      string,
  payload: Partial<AdminSku>,
): Promise<AdminSku> {
  const r = await call<{ sku: AdminSku }>(`/api/admin/skus/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body:   JSON.stringify(payload),
  });
  return r.sku;
}

export async function supplierReport(): Promise<{
  suppliers:      SupplierReportRow[];
  week_start_iso: string;
}> {
  return call<{ suppliers: SupplierReportRow[]; week_start_iso: string }>(
    '/api/admin/supplier-report',
  );
}

// ── TICKET TELEPOT-20260525-090 — 订单 / commission / 用户增长 ──────────────

export interface AdminOrderRow {
  id:                      string;
  order_number:            string;
  user_id:                 string;
  status:                  string;
  subtotal_hkd:            number | null;
  delivery_fee_hkd:        number | null;
  total_hkd:               number | null;
  commission_total_hkd:    number | null;
  delivery_address:        string | null;
  delivery_contact_name:   string | null;
  delivery_contact_phone:  string | null;
  created_at:              string;
  paid_at:                 string | null;
  stripe_session_id:       string | null;
  items_count:             number;
}

export type AdminOrderRange  = 'today' | 'week' | 'month' | 'all';
export type AdminOrderStatus = 'all' | 'pending_payment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export async function adminOrders(opts: {
  status?: AdminOrderStatus;
  range?:  AdminOrderRange;
  limit?:  number;
} = {}): Promise<{ orders: AdminOrderRow[] }> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.range)  qs.set('range',  opts.range);
  if (opts.limit)  qs.set('limit',  String(opts.limit));
  const tail = qs.toString();
  return call<{ orders: AdminOrderRow[] }>(`/api/admin/orders${tail ? `?${tail}` : ''}`);
}

export interface AdminCommissionRow {
  month:            string;
  supplier_id:      string;
  supplier_name:    string;
  order_count:      number;
  total_wholesale:  number;
  total_retail:     number;
  total_commission: number;
}

export async function adminCommission(month?: string): Promise<{
  month:        string;
  total_orders: number;
  suppliers:    AdminCommissionRow[];
}> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  return call<{
    month:        string;
    total_orders: number;
    suppliers:    AdminCommissionRow[];
  }>(`/api/admin/commission${qs}`);
}

export interface AdminUserGrowthSummary {
  total:         number;
  new_today:     number;
  new_week:      number;
  new_month:     number;
  trial_active:  number;
  paid_count:    number;
  trial_expired: number;
  conv_rate:     number;
}

export interface AdminRecentUserRow {
  id_short:     string;
  display_name: string | null;
  created_at:   string | null;
  trial_end_at: string | null;
  tier:         'paid' | 'trial' | 'expired';
  hometown:     string | null;
  dietary_goal: string | null;
}

export async function adminUsersGrowth(): Promise<{
  summary: AdminUserGrowthSummary;
  recent:  AdminRecentUserRow[];
}> {
  return call<{
    summary: AdminUserGrowthSummary;
    recent:  AdminRecentUserRow[];
  }>('/api/admin/users-growth');
}
