/**
 * RequireAuth — gate a route behind a logged-in userId.
 *
 * The app uses CUSTOM auth (CLAUDE.md hard invariant): userId lives in
 * localStorage only, `auth.users` is empty. WeChat OAuth, dev fallback,
 * and future phone-OTP all write the same localStorage keys via
 * `setUserId()`. There is NO Supabase session to verify against, so the
 * gate is `getUserId()` returning a value.
 *
 * Pages this protects: anything that calls Claude / Gemini APIs, mutates
 * household/helper state, or reveals Pro paywall flows. Anonymous users
 * land on /login (helper-flagged routes land on /login?role=helper so
 * the chip pre-selects 工人).
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
  const flag     = localStorage.getItem('isLoggedIn') === 'true';

  if (!userId || !flag) {
    const target = redirectTo ?? (helperRole ? '/login?role=helper' : '/login');
    return <Navigate to={target} state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
