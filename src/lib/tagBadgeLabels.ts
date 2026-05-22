/**
 * tagBadgeLabels — TICKET-019 §C i18n for 5-channel TagBadge
 *
 * Resolves a localized label for a TagBadge.kind, with optional placeholder
 * substitution ({festival} / {tag}). Algorithm 018 may set badge.label
 * explicitly (when it knows the right phrasing) — that wins. Otherwise we
 * fall back to a per-(kind, lang) template.
 *
 * Lang resolution priority:
 *   1. explicit `lang` arg from caller
 *   2. localStorage `nutri_lang` ('zh-CN' | 'zh-HK' | 'en')
 *   3. navigator.language prefix (zh / en / *)
 *   4. 'zh-CN' default
 *
 * Aieats audience:
 *   - 大陆: zh-CN simplified
 *   - HK / TW: zh-HK traditional
 *   - 海外华人 / SEA workers: en
 *
 * No external i18n framework — 5 channel × 3 lang = 15 static templates.
 */
import type { TagBadge, TagBadgeKind } from '../components/TagBadge';

export type Lang = 'zh-CN' | 'zh-HK' | 'en';

const TEMPLATES: Record<TagBadgeKind, Record<Lang, string>> = {
  preference: {
    'zh-CN': '你爱吃',
    'zh-HK': '你鍾意食',
    'en':    'You love',
  },
  seasonal: {
    'zh-CN': '本季当令',
    'zh-HK': '當造食材',
    'en':    'In season',
  },
  festival: {
    'zh-CN': '{festival} 应景',
    'zh-HK': '{festival} 應節',
    'en':    '{festival} pick',
  },
  school_balance: {
    'zh-CN': '孩子补 {tag}',
    'zh-HK': '小朋友補 {tag}',
    'en':    'Kid: {tag}',
  },
  weekly_balance: {
    'zh-CN': '本周补 {tag}',
    'zh-HK': '本週補 {tag}',
    'en':    'Week: {tag}',
  },
};

export function resolveLang(explicit?: Lang): Lang {
  if (explicit) return explicit;
  if (typeof window === 'undefined') return 'zh-CN';
  const stored = (() => {
    try { return localStorage.getItem('nutri_lang'); }
    catch { return null; }
  })();
  if (stored === 'zh-CN' || stored === 'zh-HK' || stored === 'en') return stored;
  const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : '';
  if (/^zh-(HK|TW|MO)/i.test(nav)) return 'zh-HK';
  if (/^zh/i.test(nav))             return 'zh-CN';
  if (/^en/i.test(nav))             return 'en';
  return 'zh-CN';
}

export function labelFor(badge: TagBadge, langArg?: Lang): string {
  // Caller-supplied label always wins (Algorithm 018 may compute context-aware
  // phrasing — "你常点红肉 + 微辣" — that's better than the generic template).
  if (badge.label && badge.label.trim()) return badge.label;

  const lang = resolveLang(langArg);
  let tmpl = TEMPLATES[badge.kind]?.[lang] ?? TEMPLATES[badge.kind]?.['zh-CN'] ?? '';
  // Substitute placeholders if reason carries hints (best-effort).
  if (badge.reason) {
    // {festival} for festival kind — pull leading non-space token from reason.
    if (badge.kind === 'festival') {
      const fest = badge.reason.split(/[\s,。]/)[0];
      if (fest) tmpl = tmpl.replace('{festival}', fest);
    }
    // {tag} for school_balance / weekly_balance — try "补 X" / "缺 X" extraction.
    if (badge.kind === 'school_balance' || badge.kind === 'weekly_balance') {
      const m = badge.reason.match(/(?:补|缺)\s*([^,，。.\s]+)/);
      if (m) tmpl = tmpl.replace('{tag}', m[1]);
    }
  }
  // Drop unresolved placeholders so users don't see literal "{festival}".
  tmpl = tmpl.replace(/\s*\{[a-z_]+\}/g, '').trim();
  return tmpl;
}
