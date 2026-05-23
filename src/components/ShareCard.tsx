/**
 * ShareCard — TICKET-031 §A 推广卡组件。
 *
 * 老板拍板的拓客起点：朋友圈 / WhatsApp 一键分享带图 + hook + 链接。
 * 3 入口（WhatsApp / 复制 / 系统原生分享），mobile 用户走系统分享 = 微信会自然
 * 出现在选项里（iOS Share Sheet / Android Intent）。
 *
 * 用法：
 *   import ShareCard from '../components/ShareCard';
 *   <ShareCard />                              // 默认 inline
 *   <ShareCard userId={uid} compact />         // 紧凑 hero icon 模式 (Home 用)
 *
 * `?ref=<userId>` 链接参数：Backend 024 后续接 ref tracking（本棒不做，
 * 只把 ref 写到分享 URL — 不破环境也不耦合）。
 */
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';

export interface ShareCardProps {
  /** Override userId (default: getUserId() from auth). */
  userId?: string | null;
  /** Compact mode — just buttons, no header img / hook text. Used in Home pop-sheet. */
  compact?: boolean;
}

export default function ShareCard({ userId, compact = false }: ShareCardProps) {
  const { t } = useLanguage();
  const [toast, setToast] = useState<string | null>(null);
  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  const uid = userId ?? getUserId() ?? '';
  // ref query param drives future Backend 024 tracking — included now so
  // links shipped today are already trackable when backend lights up.
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nothinkeats.com';
  const link = uid
    ? `${origin}/?ref=${encodeURIComponent(uid)}`
    : `${origin}/`;
  const hook = t(
    'Family meal planning that actually saves time. Aieats AI plans your week with what your family eats.',
    '让做饭省心 — Aieats 一周菜单 AI 推荐，全家爱吃的菜配齐了。',
  );
  const shareText = `${hook}\n\n${link}`;

  async function handleWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    try { window.open(url, '_blank', 'noopener,noreferrer'); }
    catch { flash(t('Failed to open WhatsApp', '打不开 WhatsApp')); }
  }
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareText);
      flash(t('Copied — paste anywhere', '已复制，粘贴到任意地方'));
    } catch {
      flash(t('Copy blocked — long-press the text', '复制失败，长按文字手动复制'));
    }
  }
  async function handleNativeShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Aieats', text: hook, url: link });
      } catch {
        /* user cancel — silent */
      }
    } else {
      flash(t('Use Copy button on this device', '该设备不支持原生分享，请用复制按钮'));
    }
  }

  return (
    <div className="rounded-2xl p-4 relative"
      style={{ background: '#FFF7F0', border: '1px solid rgba(255,140,84,0.30)' }}>
      {/* Toast — local, non-blocking */}
      {toast && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-white font-bold z-10"
          style={{ background: '#FF5A1F', fontSize: 12, boxShadow: '0 4px 12px rgba(255,90,31,0.30)' }}>
          {toast}
        </div>
      )}

      {!compact && (
        <>
          {/* Header img — reuse Backend 022 Q0 image (couple+2kids = 标志性家庭) */}
          <img src="/onboarding/q0_couple_2kids.jpg"
            alt={t('A family meal', '一家人吃饭')}
            className="w-full rounded-xl aspect-[3/2] object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <p className="mt-3 leading-snug" style={{ fontSize: 14, color: '#1a1a1a' }}>{hook}</p>
          <p className="mt-2 font-mono truncate" style={{ fontSize: 11, color: '#FF5A1F' }}>{link}</p>
        </>
      )}

      <div className={`grid grid-cols-3 gap-2 ${compact ? '' : 'mt-3'}`}>
        <button onClick={handleWhatsApp}
          className="py-2.5 rounded-xl font-bold text-white active:scale-95 transition-transform flex items-center justify-center gap-1"
          style={{ background: '#25D366', fontSize: 12 }}>
          <span>📲</span><span>WhatsApp</span>
        </button>
        <button onClick={handleCopy}
          className="py-2.5 rounded-xl font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"
          style={{ background: 'rgba(0,0,0,0.06)', color: '#1a1a1a', fontSize: 12 }}>
          <span>📋</span><span>{t('Copy', '复制')}</span>
        </button>
        <button onClick={handleNativeShare}
          className="py-2.5 rounded-xl font-bold text-white active:scale-95 transition-transform flex items-center justify-center gap-1"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 12 }}>
          <span>🔗</span><span>{t('Share', '分享')}</span>
        </button>
      </div>
    </div>
  );
}
