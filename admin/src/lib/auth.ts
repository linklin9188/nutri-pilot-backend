/**
 * admin/auth.ts — admin session token & username, isolated from main app.
 *
 * localStorage keys are prefixed `aieats_admin_*` so they don't collide with
 * main-app keys (`userId`, `nutri_user_id`, `isLoggedIn`, `isPremium` …).
 * The admin app must never read main-app localStorage and vice versa.
 */

const LS_TOKEN = 'aieats_admin_token';
const LS_USER  = 'aieats_admin_username';

export function getAdminToken(): string | null {
  return localStorage.getItem(LS_TOKEN);
}

export function getAdminUsername(): string | null {
  return localStorage.getItem(LS_USER);
}

export function setAdminSession(token: string, username: string): void {
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_USER, username);
}

export function clearAdminSession(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
}

export function isAdminLoggedIn(): boolean {
  return !!getAdminToken();
}
