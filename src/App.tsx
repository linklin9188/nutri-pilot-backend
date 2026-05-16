/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import QuickSetup from './pages/QuickSetup';
import Onboarding from './pages/Onboarding';
import HelperPrep from './pages/HelperPrep';
import HelperCook from './pages/HelperCook';
import HelperHome from './pages/HelperHome';
import Community from './pages/Community';
import VerifyIngredients from './pages/VerifyIngredients';
import DeliveryTracking from './pages/DeliveryTracking';
import AIPilot from './pages/AIPilot';
import Settings from './pages/Settings';
import WeeklyMenu from './pages/WeeklyMenu';
import SignIn from './pages/SignIn';
import Pricing from './pages/Pricing';
import Banquet from './pages/Banquet';
import ProWellness from './pages/ProWellness';
import ProSchoolBalance from './pages/ProSchoolBalance';
import Favorites from './pages/Favorites';
import { LanguageProvider } from './contexts/LanguageContext';
import { supabase } from './lib/supabase';


// Smart entry point for "/".
// Verifies a real Supabase session before treating the visitor as logged in,
// so stale `localStorage.isLoggedIn` from old test-phase / anon flows can't
// keep an unauthenticated visitor stuck on Home.
//
// Flow:
//  • Loading session   → render nothing (brief flash)
//  • No session        → clear stale flags, redirect to /login
//  • Authed + helper   → /helper
//  • Authed, no prefs  → /setup
//  • Authed + prefs    → Home
function RootRedirect() {
  const [authState, setAuthState] = useState<'loading' | 'authed' | 'unauthed'>(
    // Optimistic: if localStorage says logged-in, render Home immediately
    // while we double-check Supabase in the background. If the check fails,
    // we'll redirect on the next render.
    localStorage.getItem("isLoggedIn") === "true" ? 'authed' : 'loading'
  );

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        setAuthState('authed');
      } else {
        // No real session — wipe stale flags and bounce to /login.
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userId');
        localStorage.removeItem('nutri_user_id');
        setAuthState('unauthed');
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (authState === 'loading') return null;
  if (authState === 'unauthed') return <Navigate to="/login" replace />;

  // Authed below
  const role = localStorage.getItem("nutri_role");
  if (role === "helper") return <Navigate to="/helper" replace />;
  const hasPrefs = !!localStorage.getItem("quickPrefs");
  return hasPrefs ? <Home /> : <Navigate to="/setup" replace />;
}

// AppShell restores Supabase auth session on startup and listens for auth changes.
function AppShell() {
  useEffect(() => {
    // Restore session from Supabase (handles token refresh automatically)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userId', session.user.id);
        localStorage.setItem('nutri_user_id', session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userId', session.user.id);
        localStorage.setItem('nutri_user_id', session.user.id);
        if (event === 'SIGNED_IN') {
          window.dispatchEvent(new Event('nutri-prefs-changed'));
        }
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userId');
        localStorage.removeItem('nutri_user_id');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/setup" element={<QuickSetup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/verify" element={<VerifyIngredients />} />
      <Route path="/delivery" element={<DeliveryTracking />} />
      <Route path="/prep" element={<HelperPrep />} />
      <Route path="/cook" element={<HelperCook />} />
      <Route path="/ai-pilot" element={<AIPilot />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/weekly" element={<WeeklyMenu />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/helper" element={<HelperHome />} />
      <Route path="/community" element={<Community />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/banquet" element={<Banquet />} />
      <Route path="/pro/wellness" element={<ProWellness />} />
      <Route path="/pro/school-balance" element={<ProSchoolBalance />} />
      <Route path="/favorites" element={<Favorites />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Router>
        <AppShell />
      </Router>
    </LanguageProvider>
  );
}
