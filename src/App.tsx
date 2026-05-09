/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import HelperPrep from './pages/HelperPrep';
import HelperCook from './pages/HelperCook';
import VerifyIngredients from './pages/VerifyIngredients';
import DeliveryTracking from './pages/DeliveryTracking';
import AIPilot from './pages/AIPilot';
import Settings from './pages/Settings';
import { LanguageProvider } from './contexts/LanguageContext';

export default function App() {
  return (
    <LanguageProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/verify" element={<VerifyIngredients />} />
          <Route path="/delivery" element={<DeliveryTracking />} />
          <Route path="/prep" element={<HelperPrep />} />
          <Route path="/cook" element={<HelperCook />} />
          <Route path="/ai-pilot" element={<AIPilot />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Router>
    </LanguageProvider>
  );
}
