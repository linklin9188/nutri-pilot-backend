/**
 * Orders — /orders 订单历史列表 (TICKET-080-A).
 *
 * 按 created_at desc 列出用户所有订单 (含全部 status). 点卡跳 /orders/:id 详情.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import BottomTabBar from '../components/BottomTabBar';
import { getUserId } from '../lib/userId';
import {
  loadOrders,
  getOrderStatusLabel,
  getOrderStatusColor,
  type OrderRow,
} from '../lib/orders';

export default function Orders() {
  const navigate = useNavigate();
  const { t3, language } = useLanguage();
  const lang: 'zh' | 'en' | 'tl' = language === 'en' ? 'en' : language === 'tl' ? 'tl' : 'zh';

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) { navigate('/login'); return; }
      const list = await loadOrders(uid);
      if (!cancelled) {
        setOrders(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${dd} ${hh}:${mm}`;
    } catch { return iso; }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#f5f5f5]">
      <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-black/5 active:scale-95"
          aria-label={t3('Back', '返回', 'Bumalik')}
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <h1 className="text-[18px] font-bold flex-1">{t3('My Orders', '我的订单', 'Mga Order Ko')}</h1>
      </header>

      <main className="px-4 py-4 pb-24 space-y-3">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-[13px]">
            {t3('Loading…', '加载中…', 'Naglo-load…')}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center mt-8 shadow-sm">
            <div className="text-[56px] mb-3">📦</div>
            <p className="font-bold text-[16px] mb-1">{t3('No orders yet', '还没有订单', 'Walang order pa')}</p>
            <p className="text-[12px] text-gray-500 mb-5">
              {t3('Browse the shopping list to start', '去采购清单看看吧', 'Tingnan ang listahan')}
            </p>
            <button
              onClick={() => navigate('/verify')}
              className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white active:scale-95"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
            >
              {t3('Go to shopping list', '去采购清单', 'Pumunta')}
            </button>
          </div>
        ) : (
          orders.map(o => {
            const c = getOrderStatusColor(o.status);
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/orders/${o.id}`)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-[0.99] transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-bold" style={{ color: '#1a1a1a' }}>
                    {o.order_number}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {getOrderStatusLabel(o.status, lang)}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-[11px] text-gray-400">
                    {formatDate(o.created_at)}
                  </div>
                  <div className="text-[15px] font-black" style={{ color: '#FF5A1F' }}>
                    HKD {Number(o.total_hkd).toFixed(2)}
                  </div>
                </div>
                {o.tracking_number && (
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    {t3('Tracking', '物流单号', 'Tracking')}: {o.tracking_number}
                  </p>
                )}
              </button>
            );
          })
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}
