/**
 * OrderDetail — /orders/:id 订单详情 (TICKET-080-A).
 *
 * 包括: 订单号 + 状态 + items 价格 + 收货 + 状态时间线 + (080-C 接 Inalca 后) tracking link.
 *
 * 老板私密红线: order_items 来源 ORDER_ITEM_USER_SELECT 已显式不 SELECT
 *   unit_wholesale_price_hkd + commission_hkd. 这页可放心渲染所有拿到的字段.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import {
  loadOrderDetail,
  getOrderStatusLabel,
  getOrderStatusColor,
  type OrderRow,
  type OrderItemRow,
  type OrderStatusHistoryRow,
} from '../lib/orders';

export default function OrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t3, language } = useLanguage();
  const lang: 'zh' | 'en' | 'tl' = language === 'en' ? 'en' : language === 'tl' ? 'tl' : 'zh';

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [history, setHistory] = useState<OrderStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) { setLoading(false); return; }
      const { order: o, items: its, history: hs } = await loadOrderDetail(id);
      if (!cancelled) {
        setOrder(o);
        setItems(its);
        setHistory(hs);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const formatDateTime = (iso: string): string => {
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

  const c = order ? getOrderStatusColor(order.status) : { bg: '#eee', fg: '#999' };

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
        <h1 className="text-[18px] font-bold flex-1">{t3('Order Detail', '订单详情', 'Detalye ng Order')}</h1>
      </header>

      <main className="px-4 py-4 pb-24 space-y-4">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-[13px]">
            {t3('Loading…', '加载中…', 'Naglo-load…')}
          </div>
        ) : !order ? (
          <div className="bg-white rounded-3xl p-8 text-center mt-8 shadow-sm">
            <div className="text-[48px] mb-3">😕</div>
            <p className="font-bold text-[16px]">{t3('Order not found', '订单未找到', 'Hindi natagpuan')}</p>
          </div>
        ) : (
          <>
            {/* 状态卡 */}
            <section className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold" style={{ color: '#1a1a1a' }}>
                  {order.order_number}
                </span>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {getOrderStatusLabel(order.status, lang)}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">{formatDateTime(order.created_at)}</p>
              {order.tracking_number && (
                <p className="text-[11px] text-gray-500 mt-2">
                  {t3('Tracking', '物流单号', 'Tracking')}: <span className="font-bold">{order.tracking_number}</span>
                </p>
              )}
            </section>

            {/* Items */}
            <section className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                {t3('Items', '商品明细', 'Mga Item')} · {items.length}
              </p>
              <div className="space-y-3">
                {items.map(it => (
                  <div key={it.id} className="flex items-start gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #fff5ef, #ffe6d5)' }}
                    >
                      <span className="text-[20px]">🛍️</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[13px] truncate">{it.sku_name_snapshot}</p>
                      <p className="text-[11px] text-gray-500">
                        HKD {Number(it.unit_retail_price_hkd).toFixed(2)} × {it.qty}
                      </p>
                    </div>
                    <div className="text-[13px] font-black" style={{ color: '#FF5A1F' }}>
                      HKD {Number(it.subtotal_hkd).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-black/5 mt-3 pt-3 space-y-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">{t3('Subtotal', '商品总价', 'Subtotal')}</span>
                  <span className="font-bold">HKD {Number(order.subtotal_hkd).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500">{t3('Delivery fee', '运费', 'Delivery')}</span>
                  <span className="font-bold">HKD {Number(order.delivery_fee_hkd ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[13px] font-bold">{t3('Total', '总价', 'Kabuuan')}</span>
                  <span className="text-[16px] font-black" style={{ color: '#FF5A1F' }}>
                    HKD {Number(order.total_hkd).toFixed(2)}
                  </span>
                </div>
              </div>
            </section>

            {/* Delivery */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                {t3('Delivery', '收货信息', 'Pagpapadala')}
              </p>
              <div className="text-[12px] space-y-1">
                <p><span className="text-gray-500">{t3('Address', '地址', 'Address')}: </span>{order.delivery_address}</p>
                <p><span className="text-gray-500">{t3('Contact', '联系人', 'Contact')}: </span>{order.delivery_contact_name} · {order.delivery_contact_phone}</p>
                {order.delivery_time_slot && (
                  <p><span className="text-gray-500">{t3('Time', '时间', 'Oras')}: </span>{order.delivery_time_slot}</p>
                )}
                {order.delivery_note && (
                  <p><span className="text-gray-500">{t3('Note', '备注', 'Note')}: </span>{order.delivery_note}</p>
                )}
              </div>
            </section>

            {/* Status history timeline */}
            {history.length > 0 && (
              <section className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                  {t3('Status Timeline', '订单状态', 'Status Timeline')}
                </p>
                <div className="space-y-2.5">
                  {history.map(h => (
                    <div key={h.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#FF5A1F' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold">{getOrderStatusLabel(h.status, lang)}</p>
                        {h.note && <p className="text-[11px] text-gray-500">{h.note}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDateTime(h.changed_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Disclaimer */}
            {order.status === 'pending_payment' && (
              <div
                className="p-3 rounded-xl text-[11px] leading-relaxed text-center"
                style={{ background: 'rgba(255,90,31,0.06)', color: '#B45309', border: '1px dashed rgba(255,90,31,0.30)' }}
              >
                {t3(
                  'Payment integration coming soon (test version).',
                  '在线支付即将上线 (当前为测试版)。',
                  'Bayad sa online darating na (test version).',
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
