import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Language matrix. We split Chinese into 简体 / 繁體 so HK / TW users get the
 * familiar character set, and add Tagalog so Filipino domestic helpers get
 * their first-language step-by-step prep instructions.
 *
 *   zh     — 简体中文 (default for mainland / employer)
 *   zh-Hant — 繁體中文  (HK / TW / older mainland users mixing with HK family)
 *   en     — English  (international users / fallback)
 *   tl     — Tagalog  (Filipino helper view default)
 */
export type Language = 'zh' | 'zh-Hant' | 'en' | 'tl';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;        // legacy 2-way toggle (zh ↔ en)
  cycleLanguage: () => void;         // walks the full matrix
  t: (en: string, zh: string) => string;
  /** 3-language helper for content authored with Tagalog — used in helper-
   *  facing views (HelperHome / HelperPrep / HelperCook). Falls back to
   *  English when the Tagalog string isn't provided, and to the Chinese
   *  string for zh / zh-Hant users. */
  t3: (en: string, zh: string, tl: string) => string;
  isChinese: boolean;                // true for zh AND zh-Hant
  isEnglishish: boolean;             // true for en AND tl (until Tagalog strings land)
  isTagalog: boolean;                // true for tl only
}

/** Standalone helpers — handy in non-React modules (e.g. geminiRecipe). */
export const isChinese = (lang: Language) => lang === 'zh' || lang === 'zh-Hant';
export const isEnglishish = (lang: Language) => lang === 'en' || lang === 'tl';

// Approximate fall-back chain when a string isn't translated yet.
const FALLBACK: Record<Language, Language> = {
  zh:        'zh',
  'zh-Hant': 'zh',     // 繁體 falls back to 简体 (close enough)
  en:        'en',
  tl:        'en',     // Tagalog falls back to English (interfaces only)
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function defaultForRole(): Language {
  const role = localStorage.getItem('nutri_role');
  // Helpers default to English; the helper view will switch to Tagalog
  // once we expose a Tagalog button. We don't auto-pick Tagalog because
  // English is a safe assumption when we don't know the helper's origin.
  return role === 'helper' ? 'en' : 'zh';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasExplicitPref, setHasExplicitPref] = useState<boolean>(() => {
    const saved = localStorage.getItem('appLanguage') as Language | null;
    return saved === 'zh' || saved === 'zh-Hant' || saved === 'en' || saved === 'tl';
  });
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('appLanguage') as Language | null;
    if (saved === 'zh' || saved === 'zh-Hant' || saved === 'en' || saved === 'tl') return saved;
    return defaultForRole();
  });

  useEffect(() => {
    if (hasExplicitPref) localStorage.setItem('appLanguage', language);
  }, [language, hasExplicitPref]);

  useEffect(() => {
    const sync = () => {
      if (hasExplicitPref) return;
      setLanguage(defaultForRole());
    };
    window.addEventListener('nutri-prefs-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('nutri-prefs-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, [hasExplicitPref]);

  // 2-way toggle preserved for existing callers (zh / en switch in HelperPrep
  // header, Login chip, etc.). Walks zh ↔ en regardless of intermediate state.
  const toggleLanguage = () => {
    setHasExplicitPref(true);
    setLanguage(prev => prev === 'en' ? 'zh' : 'en');
  };

  // Cycles through the full 4-language matrix; used by the language picker in
  // Settings where users can explicitly land on 繁體 or Tagalog.
  const cycleLanguage = () => {
    setHasExplicitPref(true);
    setLanguage(prev => {
      const order: Language[] = ['zh', 'zh-Hant', 'en', 'tl'];
      return order[(order.indexOf(prev) + 1) % order.length];
    });
  };

  // t(en, zh) — kept binary-compatible with all existing call sites.
  // - For 'zh-Hant' we serve the same string as 'zh' (good enough for now;
  //   replace with a real S2T table later if you want Hong Kong character forms).
  // - For 'tl' we serve English until the helper-specific Tagalog strings
  //   are added explicitly via t() overrides on a per-page basis.
  const t = (en: string, zh: string) => {
    const effective = FALLBACK[language] ?? language;
    return effective === 'en' ? en : zh;
  };

  // 3-language helper. Use this in helper-facing screens that have explicit
  // Tagalog wording. Mainland-en / international-en users still see the
  // English string.
  const t3 = (en: string, zh: string, tl: string) => {
    if (language === 'tl')  return tl;
    if (language === 'en')  return en;
    return zh;   // 'zh' and 'zh-Hant' both fall here
  };

  const explicitSetLanguage = (lang: Language) => {
    setHasExplicitPref(true);
    setLanguage(lang);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage: explicitSetLanguage,
        toggleLanguage,
        cycleLanguage,
        t,
        t3,
        isChinese:    isChinese(language),
        isEnglishish: isEnglishish(language),
        isTagalog:    language === 'tl',
      }}
    >
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

/** Display label for the active language. */
export const LANGUAGE_LABEL: Record<Language, string> = {
  zh:        '简体',
  'zh-Hant': '繁體',
  en:        'EN',
  tl:        'Tagalog',
};
