/**
 * RequireAuth — gate a route behind a real Supabase auth session.
 *
 * Anti-abuse measure: anonymous users can browse Home (read-only, no AI
 * cost — DB queries only) but must log in to access anything that:
 *   - calls Claude / Gemini APIs (fridge scan, weekly gen, michelin
 *     elevation, school nutrition, AI pilot)
 *   - mutates household / helper state (settings, prep, cook, community)
 *   - reveals Pro paywall / payment flows
 *
 * The check is BOTH localStorage flag AND Supabase session — flag-only
 * lets a determined attacker just set localStorage. Session is the
 * authoritative source.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type AuthState = 'checking' | 'authed' | 'anon';

interface Props {
  children: ReactNode;
  /** Where to send unauthenticated visitors. Defaults to /login. */
  redirectTo?: string;
  /** When true the helper /signin route is used (helpers don't share the
   *  employer login form). */
  helperRole?: boolean;
}

export default function RequireAuth({ children, redirectTo, helperRole }: Props) {
  const location = useLocation();
  const [state, setState] = useState<AuthState>(() => {
    // Optimistic: if localStorage says logged-in AND a userId exists,
    // render immediately while we verify against Supabase. The verify
    // step still runs and can flip to 'anon' if the session is gone.
    const flag = localStorage.getItem('isLoggedIn') === 'true';
    const uid  = localStorage.getItem('userId') || localStorage.getItem('nutri_user_id');
    return flag && uid ? 'authed' : 'checking';
  });

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) setState('authed');
      else {
        // No real session — clear the flag so future renders don't keep
        // showing the optimistic 'authed' state.
        localStorage.removeItem('isLoggedIn');
        setState('anon');
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') {
    // Brief loader to avoid flashing the login redirect for users with a
    // valid session that's just slow to round-trip. Single spinner.
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <div className="w-6 h-6 border-2 border-white/15 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'anon') {
    const target = redirectTo ?? (helperRole ? '/signin?role=helper' : '/login');
    // Pass `from` so post-login we can bounce back to where they wanted.
    return <Navigate to={target} state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
