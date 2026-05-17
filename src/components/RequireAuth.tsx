/**
 * RequireAuth — gate a route behind a logged-in userId.
 *
 * The app uses CUSTOM auth (CLAUDE.md hard invariant): userId lives in
 * localStorage only, `auth.users` is empty. WeChat OAuth, dev fallback,
 * and QuickSetup all write the same localStorage keys via `setUserId()`.
 * There is NO Supabase session to verify against — the gate is simply
 * `getUserId()` returning a value.
 *
 * Single source of truth (2026-05-17): we only check userId, NOT the
 * separate `isLoggedIn` flag. Multiple historical write paths set userId
 * without touching the flag (QuickSetup, devTestLogin), and gating on
 * both produced a sticky bug where users were bounced back to /login
 * mid-session despite having a valid userId in storage. userId is the
 * minimum the app needs to attribute API calls; the flag is redundant.
 */
import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getUserId } from '../lib/userId';

interface Props {
  children: ReactNode;
  /** Where to send unauthenticated visitors. Defaults to /login. */
  redirectTo?: string;
  /** When true, unauthenticated helpers are bounced to /login?role=helper
   *  so the role chip pre-selects 工人. Both roles share the same /login
   *  form — the chip + ?role= param decide post-login routing. */
  helperRole?: boolean;
}

export default function RequireAuth({ children, redirectTo, helperRole }: Props) {
  const location = useLocation();
  const userId   = getUserId();

  if (!userId) {
    // Surface the rejection so future debugging doesn't require guessing
    // which key was missing. Cheap log, no PII.
    if (typeof console !== 'undefined') {
      console.warn('[RequireAuth] no userId in localStorage, bouncing to /login', {
        from: location.pathname,
        hasLegacyFlag: localStorage.getItem('isLoggedIn'),
      });
    }
    const target = redirectTo ?? (helperRole ? '/login?role=helper' : '/login');
    return <Navigate to={target} state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
