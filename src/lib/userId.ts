/**
 * Unified accessor for the current user's localStorage id.
 *
 * Historical state: Login.tsx wrote 'userId'; Onboarding.tsx wrote
 * 'nutri_user_id'. Different parts of the app read different keys, so a
 * user who came through Login would have a working Stripe/profile flow
 * but the recommend hook would read null and skip user_preference_scores
 * entirely (silently breaking the learned-preference signal).
 *
 * This helper reads 'userId' first, falls back to 'nutri_user_id', and
 * on first hit auto-migrates the legacy key into 'userId' so subsequent
 * reads are consistent. New writes should always target 'userId'.
 */

const PRIMARY = 'userId';
const LEGACY  = 'nutri_user_id';

/**
 * TICKET-093 — 内测阶段会话版本 sentinel.
 *
 * 发布新版时一次性强制历史用户重新登陆。App.tsx 模块级 IIFE 启动时检查
 * localStorage[SESSION_KEY] !== SESSION_VERSION → 清认证 keys → RequireAuth
 * 把用户弹回 /login。登陆成功 setUserId() 写入当前 SESSION_VERSION → 下次启动
 * sentinel 命中 → 永久免登（custom auth 长会话不变量）。
 *
 * 想再次强制全员重登：bump 这个常量值（例如 'v2_*'）。
 */
export const SESSION_VERSION = 'v1_internal_2026-05-26';
export const SESSION_KEY = 'nutri_session_v';

export function getUserId(): string | null {
  const primary = localStorage.getItem(PRIMARY);
  if (primary) return primary;
  const legacy = localStorage.getItem(LEGACY);
  if (legacy) {
    localStorage.setItem(PRIMARY, legacy);
    return legacy;
  }
  return null;
}

export function setUserId(id: string): void {
  localStorage.setItem(PRIMARY, id);
  // Keep legacy in sync during transition so any not-yet-migrated read
  // site still works. Safe to delete this line once all reads use getUserId.
  localStorage.setItem(LEGACY, id);
  // TICKET-093 — 登陆成功立即写 session sentinel，下次启动 IIFE 命中 → 永久免登.
  localStorage.setItem(SESSION_KEY, SESSION_VERSION);
}

export function clearUserId(): void {
  localStorage.removeItem(PRIMARY);
  localStorage.removeItem(LEGACY);
}
