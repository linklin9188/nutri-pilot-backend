/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import QuickSetup from './pages/QuickSetup';
import Onboarding from './pages/Onboarding';
import HelperPrep from './pages/HelperPrep';
import HelperCook from './pages/HelperCook';
import VerifyIngredients from './pages/VerifyIngredients';
import DeliveryTracking from './pages/DeliveryTracking';
import AIPilot from './pages/AIPilot';
import Settings from './pages/Settings';
import WeeklyMenu from './pages/WeeklyMenu';
import SignIn from './pages/SignIn';
import { LanguageProvider } from './contexts/LanguageContext';

// Smart entry point:
// - First visit (no quickPrefs) → /login (beautiful landing + fun entry button)
// - Return visit (has quickPrefs) → / (home menu, anonymous OK)
function RootRedirect() {
  const hasPrefs = !!localStorage.getItem("quickPrefs");
  return hasPrefs ? <Home /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <LanguageProvider>
      <Router>
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
        </Routes>
      </Router>
    </LanguageProvider>
  );
}
