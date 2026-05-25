/**
 * PurchaseNotificationBanner — TICKET-083 §5a 雇主 Home 顶部红卡.
 *
 * 当菲佣 ④ "✅ 确认完了" 后, helper_confirmed notification 写入 DB,
 * 雇主下次开 Home 此组件 mount 时拉到 → 显红卡:
 *
 *   ┌──────────────────────────────────────┐
 *   │  🔔 菲佣确认完了 · 还要买 12 件   →   │
 *   │  点这里自动加进购物车                  │
 *   └──────────────────────────────────────┘
 *
 * onClick:
 *   1. autoFillCartFromConfirmedList (按 supplier 分组加车)
 *   2. markNotificationRead (防红卡持续弹)
 *   3. navigate('/cart')
 *
 * 没绑 household / 没 helper_confirmed 通知 / 通知已读 → 不渲染.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import { supabase } from '../lib/supabase';
import {
  loadUnreadNotifications,
  autoFillCartFromConfirmedList,
  markNotificationRead,
  pickNotifMessage,
  type PurchaseNotification,
} from '../lib/purchaseFlow';

export default function PurchaseNotificationBanner() {
  const navigate = useNavigate();
  const { t3, language } = useLanguage();
  const lang: 'zh' | 'en' | 'tl' = language === 'en' ? 'en' : language === 'tl' ? 'tl' : 'zh';

  const [notif, setNotif]               = useState<PurchaseNotification | null>(null);
  const [householdId, setHouseholdId]   = useState<string | null>(null);
  const [autoFilling, setAutoFilling]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) return;
      // 拉雇主第一个 household
      try {
        const { data } = await supabase
          .from('households')
          .select('id')
          .eq('employer_id', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const hid = (data as any)?.id as string | undefined;
        if (!hid) return;
        setHouseholdId(hid);
        const unread = await loadUnreadNotifications(hid);
        if (cancelled) return;
        // 只显 helper_confirmed (employer_sent 是雇主自己发的, 自己看没意义)
        const helperConfirmed = unread.find(n => n.notify_type === 'helper_confirmed');
        if (helperConfirmed) setNotif(helperConfirmed);
      } catch (e) {
        console.warn('[PurchaseNotificationBanner] load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleClick = async () => {
    if (autoFilling || !notif || !householdId) return;
    const uid = getUserId();
    if (!uid) { navigate('/login'); return; }
    setAutoFilling(true);
    try {
      await autoFillCartFromConfirmedList(uid, householdId, notif.for_date);
      await markNotificationRead(notif.id);
      navigate('/cart');
    } finally {
      setAutoFilling(false);
    }
  };

  if (!notif) return null;

  const msg = pickNotifMessage(notif, lang);

  return (
    <div className="px-5 pt-3">
      <button
        onClick={handleClick}
        disabled={autoFilling}
        className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.99] transition-all disabled:opacity-70"
        style={{
          background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
          boxShadow: '0 10px 24px rgba(255,90,31,0.28)',
        }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.25)' }}
        >
          <span
            className="material-symbols-outlined text-white"
            style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}
          >
            notifications_active
          </span>
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="font-bold text-[14px] text-white truncate">
            {autoFilling
              ? t3('Adding to cart…', '加入购物车中…', 'Inilalagay sa cart…')
              : msg || t3(
                  `Helper confirmed · ${notif.to_be_bought_count} to buy`,
                  `🔔 菲佣确认完了 · 还要买 ${notif.to_be_bought_count} 件`,
                  `Kumpirmado · ${notif.to_be_bought_count} bibilhin`,
                )}
          </p>
          <p className="text-[11px] text-white/85 mt-0.5">
            {t3(
              'Tap to auto-fill cart by supplier',
              '点这里按供应商自动加进购物车',
              'I-tap para auto-fill ang cart',
            )}
          </p>
        </div>
        <span
          className="material-symbols-outlined text-white flex-shrink-0"
          style={{ fontSize: 22 }}
        >
          arrow_forward
        </span>
      </button>
    </div>
  );
}
