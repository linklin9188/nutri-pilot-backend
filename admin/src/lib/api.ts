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
