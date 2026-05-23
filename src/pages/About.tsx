/**
 * About — TICKET-037 simplified landing per 老板 2026-05-23 review.
 *
 * `?ref=<inviterId>` 朋友点开看 Aieats 介绍。沿用 onboarding 橙系视觉。
 * Layout 3 块（精简自原 4 section）:
 *   1. Hero — eyebrow + 副标（无 H1, 无顶部 CTA, 无情感钩子）
 *   2. 5-channel chip 横排（无标题, 无 chip 下说明）
 *   3. 底部 CTA — 立即试用 + "一个月免费" + 已有账号？登录
 *
 * `?ref=<inviterId>` 命中立刻写 `nutri_referrer_id` localStorage,
 * Backend cron 后续关联 userId → inviter。
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

interface ChannelChip {
  emoji: string;
  zh:    string;
  en:    string;
  color: string;
}

const CHANNELS: ChannelChip[] = [
  { emoji: '🌶️', zh: '你爱吃',    en: 'You love',     color: 'rgba(255,90,31,0.15)' },
  { emoji: '🌿', zh: '当令',      en: 'In season',   color: 'rgba(34,197,94,0.15)' },
  { emoji: '🎋', zh: '节气',      en: 'Festival',    color: 'rgba(236,72,153,0.15)' },
  { emoji: '🎒', zh: '孩子补',    en: 'Kid boost',   color: 'rgba(59,130,246,0.15)' },
  { emoji: '💪', zh: '本周补',    en: 'Week boost',  color: 'rgba(168,85,247,0.15)' },
];

export default function About() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, isChinese } = useLanguage();

  // Capture ?ref=<inviterId> early — Backend cron 后续关联 inviter。
  useEffect(() => {
    const ref = params.get('ref');
    if (ref && ref.trim()) {
      try { localStorage.setItem('nutri_referrer_id', ref.trim()); }
      catch { /* private mode — non-critical */ }
    }
  }, [params]);

  const refQuery = params.get('ref');
  const setupUrl = refQuery ? `/setup?ref=${encodeURIComponent(refQuery)}` : '/setup';

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#0a0a0a' }}>
      {/* Ambient glow */}
      <div className="absolute inset-0 z-0 pointer-events-none max-w-md mx-auto">
        <div style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.18) 0%, transparent 60%)',
          position: 'absolute', inset: 0,
        }} />
      </div>

      {/* ── 1. Hero ────────────────────────────────────────────── */}
      <section className="relative z-10 px-6 pt-16 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}>
          <p className="font-bold uppercase tracking-[0.20em] mb-3"
            style={{ fontSize: 11, color: '#FF8C54' }}>
            {t('Aieats · Smart Menu for Moms', '爱吃 Aieats · 妈妈们的智能菜单')}
          </p>
          <p className="text-white/75 leading-relaxed" style={{ fontSize: 15 }}>
            {t(
              'Seasonal recipes by solar terms · aligned with school cafeteria · no-repeat nutrition for your baby.',
              '按节气推应季菜 · 同步校园菜谱 · 给宝贝不重复的营养呵护',
            )}
          </p>
        </motion.div>
      </section>

      {/* ── 2. 5-channel chip ─────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-10">
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c, idx) => (
            <motion.span
              key={c.emoji}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.30, delay: 0.15 + idx * 0.06, ease: 'easeOut' }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold"
              style={{ background: c.color, color: 'white', fontSize: 12, border: `1px solid ${c.color.replace('0.15', '0.30')}` }}>
              <span>{c.emoji}</span>
              <span>{isChinese ? c.zh : c.en}</span>
            </motion.span>
          ))}
        </div>
      </section>

      {/* ── 3. 底部 CTA ──────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-16 mt-auto">
        <button
          onClick={() => navigate(setupUrl)}
          className="w-full py-4 rounded-2xl font-bold text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 16, boxShadow: '0 8px 28px rgba(255,90,31,0.35)' }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <span>{t('Try Aieats Free', '立即试用 · 免费')}</span>
        </button>
        <p className="mt-2 text-center text-white/45" style={{ fontSize: 11 }}>
          {t('Free for one month', '一个月免费')}
        </p>
        <p className="mt-4 text-center" style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {t('Already have an account?', '已有账号？')}{' '}
          <button onClick={() => navigate('/login')}
            className="underline font-bold" style={{ color: '#FF8C54' }}>
            {t('Sign in', '登录')}
          </button>
        </p>
        {refQuery && (
          <p className="mt-3 text-center text-white/25" style={{ fontSize: 10, letterSpacing: '0.04em' }}>
            {t(`Invited by a friend (ref: ${refQuery.slice(0, 8)}…)`, `朋友推荐 (ref: ${refQuery.slice(0, 8)}…)`)}
          </p>
        )}
      </section>
    </div>
  );
}
