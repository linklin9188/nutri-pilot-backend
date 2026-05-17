/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
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
import Pricing from './pages/Pricing';
import Banquet from './pages/Banquet';
import WeekendDining from './pages/WeekendDining';
import ProWellness from './pages/ProWellness';
import ProSchoolBalance from './pages/ProSchoolBalance';
import Favorites from './pages/Favorites';
import WeChatCallback from './pages/WeChatCallback';
import WeChatIn from './pages/WeChatIn';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import RequireAuth from './components/RequireAuth';
import { syncFavoritesFromCloud } from './lib/favorites';
import { LanguageProvider } from './contexts/LanguageContext';
import { supabase } from './lib/supabase';


// Smart entry point for "/". Anonymous-first: visitors don't need to log in
// to use the app. QuickSetup creates a local anonymous userId on completion
// (test-phase pattern preserved). /login is still routable for users who
// choose to attach a real account once social providers come online.
//
// Flow:
//  • Helper role (set via /login?role=helper) → /helper
//  • No quickPrefs yet                         → /setup (anonymous onboarding)
//  • Has quickPrefs                            → Home
function RootRedirect() {
  const role = localStorage.getItem("nutri_role");
  if (role === "helper") return <Navigate to="/helper" replace />;
  const hasPrefs = !!localStorage.getItem("quickPrefs");
  return hasPrefs ? <Home /> : <Navigate to="/setup" replace />;
}

// AppShell bootstraps cross-cutting side effects (favorites sync, Supabase
// session sync FOR THE REAL-OAUTH PATH ONLY).
//
// Custom-auth invariant (CLAUDE.md): the source of truth for "who is logged
// in" is localStorage `userId` / `nutri_user_id` / `isLoggedIn`, written
// by WeChatCallback (real 网页授权) or Login dev fallback. We must NEVER
// blow these keys away on a stray Supabase SIGNED_OUT event — Supabase
// has no session of its own for these users, and a SIGNED_OUT fires
// routinely when token refresh fails or storage events propagate across
// tabs. The previous implementation cleared these keys on SIGNED_OUT and
// dumped freshly-logged-in 微信 users straight back to /login on the
// next tab click.
function AppShell() {
  useEffect(() => {
    // Pull cloud-saved favorites into the local cache on boot. Anonymous
    // users (no userId yet) get a no-op; once they finish QuickSetup the
    // anon userId triggers a sync on the next event tick.
    syncFavoritesFromCloud().catch(() => {/* offline-tolerant */});

    // Only sync IN — i.e. if a real Supabase OAuth session ever materializes
    // (currently none; Facebook/Google/Apple all run through Login's dev
    // fallback path). We do not clear localStorage on SIGNED_OUT because
    // for custom-auth users that key is the only handle on identity.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userId', session.user.id);
        localStorage.setItem('nutri_user_id', session.user.id);
        if (event === 'SIGNED_IN') {
          window.dispatchEvent(new Event('nutri-prefs-changed'));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
    <Routes>
      {/* ── Public — no login needed ──────────────────────────────
          / 是匿名访客唯一能看到的页面（只读，无 AI 成本）。Auth 入口
          (/login /setup /onboarding) 当然也必须公开。WeChat OAuth
          callback 公开是因为这正是把用户从匿名升到 authed 的关键 step。
          /login 兼任原 /signin —— 角色（雇主/工人）通过 ?role=helper
          预选，登录按钮包含 微信 / Instagram / Facebook 三个 provider。 */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/setup" element={<QuickSetup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/auth/wechat/in"   element={<WeChatIn />} />
      <Route path="/auth/wechat/done" element={<WeChatCallback />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />

      {/* ── Auth-gated — 所有消耗 AI token 或修改状态的功能 ──────
          匿名用户访问会被弹回 /login (helper 路径弹回 /login?role=helper)。
          这是防恶意 token 消耗的核心闸门 — Gemini Vision (扫冰箱) /
          Claude (周菜单 / 米其林 / 学校营养) / 任何 mutation 都在这一层
          之后。 */}
      <Route path="/verify"   element={<RequireAuth><VerifyIngredients /></RequireAuth>} />
      <Route path="/delivery" element={<RequireAuth><DeliveryTracking /></RequireAuth>} />
      <Route path="/prep"     element={<RequireAuth helperRole><HelperPrep /></RequireAuth>} />
      <Route path="/cook"     element={<RequireAuth helperRole><HelperCook /></RequireAuth>} />
      <Route path="/ai-pilot" element={<RequireAuth><AIPilot /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/weekly"   element={<RequireAuth><WeeklyMenu /></RequireAuth>} />
      <Route path="/helper"   element={<RequireAuth helperRole><HelperHome /></RequireAuth>} />
      <Route path="/community" element={<RequireAuth><Community /></RequireAuth>} />
      <Route path="/banquet"  element={<RequireAuth><Banquet /></RequireAuth>} />
      <Route path="/weekend"  element={<RequireAuth><WeekendDining /></RequireAuth>} />
      <Route path="/pro/wellness"       element={<RequireAuth><ProWellness /></RequireAuth>} />
      <Route path="/pro/school-balance" element={<RequireAuth><ProSchoolBalance /></RequireAuth>} />
      <Route path="/favorites" element={<RequireAuth><Favorites /></RequireAuth>} />
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
