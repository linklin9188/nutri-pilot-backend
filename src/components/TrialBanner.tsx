/**
 * TrialBanner — TICKET-078 (30 天免费体验硬接).
 *
 * 老板拍板双收入商业模式 (2026-05-25)："任何用户免费体验一个月, 不过都是
 * 按照订阅模式, 一个月后没有取消就再收费"。
 *
 * 显示条件：
 *   1. tier === 'trial' 且 trialDaysLeft <= 7 → 橙底友好提醒 (剩 7 天内才推)
 *   2. tier === 'expired'                     → 红底强提醒 (试用结束 + 升级)
 *   3. tier === 'paid' / loading              → 不渲染
 *
 * 位置：Home 顶部 Hi 昵称 chip 之下 (Home.tsx 1344 之后)。
 * 点 [升级 →] 跳 /pricing；红 banner 加 [取消订阅] 链接是后期事 (本 ticket
 * 老板说"放着"不动 Stripe portal)。
 *
 * 三语 t3 — 简中 / 英文 / 菲律宾语 (zh-Hant 和 id 由 LanguageContext 兜底
 * 走 zh / en, 后期可单独翻)。
 *
 * 主色 #FF5A1F (橙 — 主题色) / #E53935 (红 — 警告色, 项目里 paywall 一致用红)。
 */

import { useNavigate } from "react-router-dom";
import { useSubscription } from "../lib/subscription";
import { useLanguage } from "../contexts/LanguageContext";

const TRIAL_WARN_DAYS = 7; // 剩 ≤ 7 天才弹友好提醒

export default function TrialBanner() {
  const { tier, trialDaysLeft, loading } = useSubscription();
  const navigate = useNavigate();
  const { t3 } = useLanguage();

  // loading 期保险, paid 不显示, trial 但还有 > 7 天也不打扰
  if (loading) return null;
  if (tier === 'paid') return null;
  if (tier === 'trial' && trialDaysLeft > TRIAL_WARN_DAYS) return null;

  // -------- expired (红) --------
  if (tier === 'expired') {
    return (
      <div
        className="mx-3 mt-3 rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer"
        onClick={() => navigate('/pricing')}
        style={{
          background: "linear-gradient(135deg, #E53935 0%, #FF6B6B 100%)",
          boxShadow: "0 8px 20px rgba(229,57,53,0.28)",
        }}
        role="button"
        aria-label={t3('Trial ended, upgrade to continue', '免费体验已结束, 升级继续使用', 'Tapos na ang libreng pagsubok')}
      >
        <span style={{ fontSize: 22 }}>⏰</span>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
            {t3('Free trial ended', '免费体验已结束', 'Tapos na ang libreng pagsubok')}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.88)", marginTop: 1 }}>
            {t3('HK$66/mo, cancel anytime', 'HK$66/月, 随时取消', 'HK$66/buwan, kanselahin kahit kailan')}
          </div>
        </div>
        <button
          className="px-3 h-8 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition-transform"
          style={{ background: "white", color: "#E53935", fontSize: 12 }}
          onClick={(e) => { e.stopPropagation(); navigate('/pricing'); }}
        >
          {t3('Upgrade', '升级', 'I-upgrade')} →
        </button>
      </div>
    );
  }

  // -------- trial 剩 ≤ 7 天 (橙) --------
  // trialDaysLeft 0 在 trial 分支不太可能 (那会走 expired), 兜底显示 "今天到期"
  const daysCopy = trialDaysLeft <= 0
    ? t3('Expires today', '今天到期', 'Mag-e-expire ngayon')
    : t3(`${trialDaysLeft} days left`, `剩 ${trialDaysLeft} 天`, `${trialDaysLeft} araw na lang`);

  return (
    <div
      className="mx-3 mt-3 rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer"
      onClick={() => navigate('/pricing')}
      style={{
        background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 60%, #FFB347 100%)",
        boxShadow: "0 8px 20px rgba(255,90,31,0.28)",
      }}
      role="button"
      aria-label={t3('Free trial reminder', '免费体验提醒', 'Paalala sa libreng pagsubok')}
    >
      <span style={{ fontSize: 22 }}>🎁</span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
          {t3('Free trial: ', '免费体验 · ', 'Libreng pagsubok · ')}{daysCopy}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.88)", marginTop: 1 }}>
          {t3('Then HK$66/mo, cancel anytime', '之后 HK$66/月, 随时取消', 'Pagkatapos HK$66/buwan, kanselahin kahit kailan')}
        </div>
      </div>
      <button
        className="px-3 h-8 rounded-xl font-bold flex items-center gap-1 active:scale-95 transition-transform"
        style={{ background: "white", color: "#FF5A1F", fontSize: 12 }}
        onClick={(e) => { e.stopPropagation(); navigate('/pricing'); }}
      >
        {t3('Upgrade', '升级', 'I-upgrade')} →
      </button>
    </div>
  );
}
