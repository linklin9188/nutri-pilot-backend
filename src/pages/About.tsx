/**
 * About — TICKET-032 landing page for `?ref=<inviterId>` 朋友点开看 Aieats 介绍。
 *
 * 沿用 onboarding 橙系视觉 (`/setup` 同色配)。4 section:
 *   1. Hero — 标题 / 副标 / 立即试用 CTA
 *   2. 截图墙 — 3 张 Q0 真图横排展示 + 价值一句话
 *   3. 5-channel chip — TagBadge 视觉介绍 ("为什么推这道")
 *   4. 底部 CTA — 再放一次立即试用 + 已有账号？登录
 *
 * `?ref=<inviterId>` 当 URL 命中时立刻写 `nutri_referrer_id` localStorage,
 * Backend 024 后续 ship referrals 表时由后端 cron 关联本端 userId → inviter。
 */
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

interface ChannelChip {
  emoji: string;
  zh:    string;
  en:    string;
  descZh: string;
  descEn: string;
  color: string;
}

const CHANNELS: ChannelChip[] = [
  { emoji: '🌶️', zh: '你爱吃',    en: 'You love',     descZh: '按你家口味偏好挑',          descEn: 'Matched to your taste',          color: 'rgba(255,90,31,0.15)' },
  { emoji: '🌿', zh: '当令',      en: 'In season',   descZh: '当季食材最鲜美',            descEn: 'Freshest in-season ingredients', color: 'rgba(34,197,94,0.15)' },
  { emoji: '🎋', zh: '节气',      en: 'Festival',    descZh: '节庆应景菜',                descEn: 'Holiday-appropriate dishes',     color: 'rgba(236,72,153,0.15)' },
  { emoji: '🎒', zh: '孩子补',    en: 'Kid boost',   descZh: '孩子学校缺什么补什么',      descEn: 'Fills school-meal gaps for kids', color: 'rgba(59,130,246,0.15)' },
  { emoji: '💪', zh: '本周补',    en: 'Week boost',  descZh: '本周营养缺口自动补',        descEn: 'Tops up the week nutrition gap', color: 'rgba(168,85,247,0.15)' },
];

const SCREENSHOTS = [
  '/onboarding/q0_couple_2kids.jpg',
  '/onboarding/q0_three_gen.jpg',
  '/onboarding/q0_solo_w_kid.jpg',
];

export default function About() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, isChinese } = useLanguage();

  // Capture ?ref=<inviterId> early — Backend 024 后续 ship 时由后端关联 inviter。
  // 即便用户离开 /about 没立刻 setup, ref 也已落 localStorage, 24 小时内 finish
  // onboarding 都能拿到 (Backend cron 决定有效期)。
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
          {/* TICKET-033 §A — hero 重写对齐真品牌 (母婴 / 节气 / 校园 niche).
              旧文案 '让做饭省心 / Family meal planning that saves time' 调性偏差
              (泛家庭), 跟 index.html OG meta + WhatsApp 推广卡显示真品牌不一致.
              CEO 失误立即修. */}
          <h1 className="font-serif font-black text-white leading-tight"
            style={{ fontSize: 30, letterSpacing: '-0.01em' }}>
            {t('Smart menu for moms', '妈妈们的智能菜单')}
          </h1>
          <p className="mt-3 text-white/65 leading-relaxed" style={{ fontSize: 15 }}>
            {t(
              'Seasonal recipes by solar terms · aligned with school cafeteria · no-repeat nutrition for your baby.',
              '按节气推应季菜 · 同步校园菜谱 · 给宝贝不重复的营养呵护',
            )}
          </p>
          <button
            onClick={() => navigate(setupUrl)}
            className="mt-6 w-full py-4 rounded-2xl font-bold text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 16, boxShadow: '0 8px 28px rgba(255,90,31,0.35)' }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <span>{t('Try Aieats Free', '立即试用 · 免费')}</span>
          </button>
          <p className="mt-2 text-center text-white/35" style={{ fontSize: 11 }}>
            {t('Free 7 days · no card needed', '7 天免费 · 无需信用卡')}
          </p>
          {/* 情感钩子 — small italic, 对齐 OG card "每一餐，都是给家人的惦记 ～" */}
          <p className="mt-5 text-center italic font-serif text-white/55" style={{ fontSize: 13, letterSpacing: '0.02em' }}>
            {t('Every meal is care for your family.', '每一餐，都是给家人的惦记 ～')}
          </p>
        </motion.div>
      </section>

      {/* ── 2. 截图墙 ─────────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-10">
        <p className="text-white/55 mb-3" style={{ fontSize: 13 }}>
          {t('Built for families like yours', '我们为你做的事')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {SCREENSHOTS.map((src, idx) => (
            <motion.img
              key={src}
              src={src}
              alt={t('Family example', '家庭场景')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.10 + idx * 0.08, ease: 'easeOut' }}
              className="w-full aspect-square object-cover rounded-2xl"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              onError={e => { (e.target as HTMLImageElement).style.background = 'rgba(255,90,31,0.10)'; }}
            />
          ))}
        </div>
        <p className="mt-3 text-white/45 leading-relaxed" style={{ fontSize: 12 }}>
          {t(
            'From single parents to three-generation households — your menu adapts to who\'s home tonight.',
            '从单亲家庭到三代同堂 — 菜单跟着今晚谁在家自动调整。',
          )}
        </p>
      </section>

      {/* ── 3. 5-channel chip ─────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-10">
        <p className="text-white/55 mb-3" style={{ fontSize: 13 }}>
          {t('5 reasons we recommend a dish', '为什么推这道菜')}
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {CHANNELS.map((c, idx) => (
            <motion.span
              key={c.emoji}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.30, delay: 0.20 + idx * 0.06, ease: 'easeOut' }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold"
              style={{ background: c.color, color: 'white', fontSize: 12, border: `1px solid ${c.color.replace('0.15', '0.30')}` }}>
              <span>{c.emoji}</span>
              <span>{isChinese ? c.zh : c.en}</span>
            </motion.span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {CHANNELS.map(c => (
            <div key={c.emoji + 'desc'} className="flex items-baseline gap-2">
              <span style={{ fontSize: 13 }}>{c.emoji}</span>
              <p className="text-white/50" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                <span className="text-white/75 font-bold">{isChinese ? c.zh : c.en}</span>
                {' — '}
                {isChinese ? c.descZh : c.descEn}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. 底部 CTA ──────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-16 mt-auto">
        <button
          onClick={() => navigate(setupUrl)}
          className="w-full py-4 rounded-2xl font-bold text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 16, boxShadow: '0 8px 28px rgba(255,90,31,0.35)' }}>
          <span style={{ fontSize: 18 }}>🍽️</span>
          <span>{t('Try Aieats Free', '立即试用 · 免费')}</span>
        </button>
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
