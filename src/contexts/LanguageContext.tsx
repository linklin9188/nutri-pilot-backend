import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (en: string, zh: string) => string;
}

// Also widen setLanguage to mark the user pick as explicit.

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasExplicitPref, setHasExplicitPref] = useState<boolean>(() => {
    const saved = localStorage.getItem('appLanguage');
    return saved === 'en' || saved === 'zh';
  });
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('appLanguage');
    if (saved === 'en' || saved === 'zh') return saved;
    // Helper role defaults to English, employer defaults to Chinese
    const role = localStorage.getItem('nutri_role');
    return role === 'helper' ? 'en' : 'zh';
  });

  // Persist explicit user picks. We only flip hasExplicitPref via the toggle
  // (below) so that role-driven defaults can still apply on first login.
  useEffect(() => {
    if (hasExplicitPref) localStorage.setItem('appLanguage', language);
  }, [language, hasExplicitPref]);

  // When the user logs in or switches role, re-derive the default language
  // unless they've made an explicit pick already. Triggered by the
  // 'nutri-prefs-changed' event that login handlers / Settings dispatch.
  useEffect(() => {
    const sync = () => {
      if (hasExplicitPref) return;
      const role = localStorage.getItem('nutri_role');
      setLanguage(role === 'helper' ? 'en' : 'zh');
    };
    window.addEventListener('nutri-prefs-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('nutri-prefs-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [hasExplicitPref]);

  const toggleLanguage = () => {
    setHasExplicitPref(true);
    setLanguage(prev => prev === 'en' ? 'zh' : 'en');
  };

  const t = (en: string, zh: string) => {
    return language === 'en' ? en : zh;
  };

  const explicitSetLanguage = (lang: Language) => {
    setHasExplicitPref(true);
    setLanguage(lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: explicitSetLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
