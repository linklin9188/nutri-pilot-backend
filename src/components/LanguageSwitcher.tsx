/**
 * LanguageSwitcher — 5-lang floating chip used on public pages (/login hero).
 *
 * 不绑 role（公开页谁都能切到自己读得懂的语言）。Home 顶部的 picker 自带 role
 * 过滤逻辑，那个就地 inline，不复用此组件；/login 等无 role 上下文的页面用这个。
 *
 * UX：单 chip 显当前语言，点开 dropdown 5 选 1。位置由 `className` 注入
 * (caller 决定 fixed/absolute/inline)。
 */
import { useState } from 'react';
import { useLanguage, LANGUAGE_LABEL, type Language } from '../contexts/LanguageContext';

const LANGS: Language[] = ['zh', 'zh-Hant', 'en', 'tl', 'id'];

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="px-3 h-8 rounded-full inline-flex items-center justify-center gap-1 font-bold active:scale-95 transition-transform"
          style={{
            background: 'rgba(255,255,255,0.12)',
            border:     '1px solid rgba(255,255,255,0.18)',
            color:      'white',
            fontSize:   11,
            minWidth:   58,
            backdropFilter: 'blur(8px)',
          }}
          title="切换语言 / Switch language"
        >
          {LANGUAGE_LABEL[language]}
          <span className="material-symbols-outlined" style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.65)',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>expand_more</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-40 rounded-2xl p-2 flex flex-col gap-1"
              style={{
                background: '#1a1a1a',
                boxShadow: '0 14px 38px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.20)',
                border: '1px solid rgba(255,255,255,0.10)',
                minWidth: 130,
              }}>
              {LANGS.map(key => {
                const active = key === language;
                return (
                  <button key={key}
                    onClick={() => { setLanguage(key); setOpen(false); }}
                    className="px-3 py-2 rounded-xl font-bold active:scale-95 transition-all text-left"
                    style={{
                      background: active ? '#FF5A1F' : 'rgba(255,255,255,0.04)',
                      color:      active ? 'white' : 'rgba(255,255,255,0.85)',
                      fontSize:   12,
                    }}>
                    {LANGUAGE_LABEL[key]}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
