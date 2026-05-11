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
import { LanguageProvider } from './contexts/LanguageContext';
import { supabase } from './lib/supabase';

// ── Dev-only role switcher (localhost only) ───────────────────────────────────
const IS_DEV = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

function DevRoleSwitcher() {
  const navigate = useNavigate();
  const [role, setRole] = useState(localStorage.getItem("nutri_role") ?? "employer");
  const [open, setOpen] = useState(false);

  if (!IS_DEV) return null;

  function switchTo(r: string) {
    localStorage.setItem("nutri_role", r);
    setRole(r);
    setOpen(false);
    navigate(r === "helper" ? "/helper" : "/");
  }

  return (
    <div style={{ position: "fixed", bottom: 80, right: 16, zIndex: 9999 }}>
      {open && (
        <div style={{
          position: "absolute", bottom: 44, right: 0,
          background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14, padding: "6px 4px", minWidth: 140,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {["employer", "helper"].map(r => (
            <button key={r} onClick={() => switchTo(r)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px", fontSize: 13, fontWeight: 600,
                color: role === r ? "#f7971e" : "rgba(255,255,255,0.75)",
                background: role === r ? "rgba(247,151,30,0.12)" : "transparent",
                border: "none", borderRadius: 10, cursor: "pointer",
              }}>
              {r === "employer" ? "👔 雇主" : "🧹 工人"}
              {role === r && " ✓"}
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(v => !v)}
        title="Dev: switch role"
        style={{
          width: 36, height: 36, borderRadius: "50%",
          background: role === "employer" ? "#f7971e" : "#25D366",
          border: "2px solid rgba(255,255,255,0.25)",
          color: "white", fontSize: 16, cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {role === "employer" ? "👔" : "🧹"}
      </button>
    </div>
  );
}

// Smart entry point:
// - Helper role → /helper
// - First employer visit (no quickPrefs) → /setup
// - Return employer visit → Home
function RootRedirect() {
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
    <DevRoleSwitcher />
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
