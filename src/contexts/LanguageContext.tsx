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
 *   id     — Bahasa Indonesia (Indonesian helper view default)
 */
export type Language = 'zh' | 'zh-Hant' | 'en' | 'tl' | 'id';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;        // legacy 2-way toggle (zh ↔ en)
  cycleLanguage: () => void;         // walks the full matrix (zh/繁/en/tl/id)
  /** Role-aware cycle. Two disjoint 3-language sets — Tagalog / Indonesian
   *  never appear in the employer's chrome (HK Chinese family that doesn't
   *  read either), and 中文 never appears in the helper's chrome (Filipino
   *  /Indonesian worker that doesn't read Chinese). Disambiguate by
   *  localStorage.nutri_role at click time.
   *
   *    role=employer  →  zh → 繁 → en        (HK family)
   *    role=helper    →  en → tl → id        (domestic helper)
   *
   *  Prep/Cook pages live in BOTH role contexts depending on which entry
   *  point you arrive from, so they pick the right cycle per click.
   */
  cycleLanguageForRole: () => void;
  t: (en: string, zh: string) => string;
  /** 3-language helper for content authored with Tagalog — used in helper-
   *  facing views (HelperHome / HelperPrep / HelperCook). Falls back to
   *  English when the Tagalog string isn't provided, and to the Chinese
   *  string for zh / zh-Hant users. */
  t3: (en: string, zh: string, tl: string) => string;
  /** 4-language helper for views that need explicit Bahasa Indonesia.
   *  HelperCook step screen is the canonical caller — both Filipino and
   *  Indonesian helpers spend the most time looking at "Step X of Y",
   *  "Tap to pause", "Done, next step", etc., so each gets a real
   *  translation instead of falling back to English. */
  t4: (en: string, zh: string, tl: string, id: string) => string;
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
  id:        'en',     // Bahasa Indonesia falls back to English
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/**
 * Map a BCP-47 locale tag (navigator.language / navigator.languages) to one
 * of our supported Languages. Conservative — anything we don't recognise
 * falls back to English.
 */
function detectFromBrowser(): Language | null {
  const tags = typeof navigator !== 'undefined'
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [];
  for (const raw of tags) {
    if (!raw) continue;
    const tag = raw.toLowerCase();
    // Traditional Chinese: zh-Hant, zh-TW, zh-HK, zh-MO
    if (tag === 'zh-hant' || tag.startsWith('zh-hant-') ||
        tag === 'zh-tw'   || tag === 'zh-hk' || tag === 'zh-mo') return 'zh-Hant';
    // Simplified Chinese: zh, zh-CN, zh-Hans, zh-SG, zh-MY
    if (tag === 'zh' || tag.startsWith('zh-cn') || tag.startsWith('zh-hans') ||
        tag === 'zh-sg' || tag === 'zh-my') return 'zh';
    // English variants
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
    // Tagalog / Filipino — helper-facing
    if (tag === 'tl' || tag.startsWith('tl-') || tag === 'fil' || tag.startsWith('fil-')) return 'tl';
    // Bahasa Indonesia
    if (tag === 'id' || tag.startsWith('id-')) return 'id';
  }
  return null;
}

function defaultForRole(): Language {
  const role = localStorage.getItem('nutri_role');
  // Helpers: keep browser detection for Tagalog/Indonesian users, else English.
  if (role === 'helper') {
    const tl = detectFromBrowser();
    return tl === 'tl' || tl === 'id' ? tl : 'en';
  }
  // Employer side: English-first by product decision (HK + international
  // market, where most users read English faster). The chip in Login/header
  // still cycles 简 / 繁 / EN so users who prefer Chinese can flip. When we
  // push into mainland China, flip this default to detectFromBrowser() ?? 'zh'.
  return 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasExplicitPref, setHasExplicitPref] = useState<boolean>(() => {
    const saved = localStorage.getItem('appLanguage') as Language | null;
    return saved === 'zh' || saved === 'zh-Hant' || saved === 'en' || saved === 'tl' || saved === 'id';
  });
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('appLanguage') as Language | null;
    if (saved === 'zh' || saved === 'zh-Hant' || saved === 'en' || saved === 'tl' || saved === 'id') return saved;
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
      const order: Language[] = ['zh', 'zh-Hant', 'en', 'tl', 'id'];
      return order[(order.indexOf(prev) + 1) % order.length];
    });
  };

  // Role-aware cycle. Read role at click time, not at hook setup, so a user
  // who switches role (e.g. via "switch to helper view") gets the right
  // cycle without remounting.
  //
  // We compute `next` from the closure `language` value rather than from
  // the setState updater (`prev`). React 18 StrictMode invokes updater
  // functions twice in dev to surface side-effect bugs — and our updater
  // advances state, which is exactly the kind of non-idempotent function
  // that breaks under double-invocation (the click would skip 2 steps in
  // dev). Reading from closure is idempotent: setLanguage('tl') called
  // twice still lands on 'tl'.
  const cycleLanguageForRole = () => {
    setHasExplicitPref(true);
    const role = localStorage.getItem('nutri_role');
    const order: Language[] = role === 'helper'
      ? ['en', 'tl', 'id']            // helper: 3 langs, no Chinese
      : ['zh', 'zh-Hant', 'en'];      // employer: 3 langs, no tl/id (HK family)
    const idx = order.indexOf(language);
    const next = idx === -1 ? order[0] : order[(idx + 1) % order.length];
    setLanguage(next);
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

  // 4-language helper — adds explicit Indonesian. HelperCook step screen
  // is the canonical caller. Same lookup order: language === id|tl|en|zh.
  const t4 = (en: string, zh: string, tl: string, id: string) => {
    if (language === 'id')  return id;
    if (language === 'tl')  return tl;
    if (language === 'en')  return en;
    return zh;
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
        cycleLanguageForRole,
        t,
        t3,
        t4,
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
  id:        'Indonesia',
};
