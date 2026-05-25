/**
 * OrderSuccess — /order/success?order_id=X (单订单) 或 /orders/success?ids=A,B (多订单).
 *
 * 080-B: 区分 2 种入场:
 *   (a) 从 Stripe Checkout 跳回 → URL 带 ?session=cs_xxx → "✅ 付款成功" (乐观显示;
 *       webhook 异步会把 orders.status 更成 'paid', 这里不等)
 *   (b) 直接进 success (Stripe 跳转兜底) → 无 session 参数 → "订单已创建 · 待付款"
 *       + 按钮 "去付款" (重新调 create-order-checkout 跳)
 *
 * TICKET-083 §7c: 多订单按 ids= 逗号分隔 → 渲染 N 个订单卡 (每个 supplier 一个).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import {
  loadOrderDetail,
  getOrderStatusLabel,
  getOrderStatusColor,
  type OrderRow,
} from '../lib/orders';

export default function OrderSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t3, language } = useLanguage();
  const lang: 'zh' | 'en' | 'tl' = language === 'en' ? 'en' : language === 'tl' ? 'tl' : 'zh';

  // 单订单 (老路 /order/success?order_id=X) 或 多订单 (/orders/success?ids=A,B,C)
  const singleId = params.get('order_id') || '';
  const idsParam = params.get('ids') || '';
  const sessionId = params.get('session') || '';  // 080-B: Stripe 跳回时带这个
  const orderIds = idsParam
    ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
    : (singleId ? [singleId] : []);

  // 080-B: 有 session 参数 = 从 Stripe 跳回; 没 session = 直进 (待付款)
  const cameFromStripe = Boolean(sessionId);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payRetrying, setPayRetrying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (orderIds.length === 0) { setLoading(false); return; }
      const results = await Promise.all(orderIds.map(id => loadOrderDetail(id)));
      if (cancelled) return;
      const loaded = results
        .map(r => r.order)
        .filter((o): o is OrderRow => o != null);
      setOrders(loaded);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam, singleId]);

  const isMulti = orders.length > 1;
  const totalAll = orders.reduce((sum, o) => sum + Number(o.total_hkd || 0), 0);

  // 仍 pending_payment 的订单 → 可以重新发起付款
  const pendingOrderIds = orders
    .filter(o => o.status === 'pending_payment')
    .map(o => o.id);
  const hasPending = pendingOrderIds.length > 0;

  const handleRetryPay = async () => {
    if (payRetrying) return;
    setPayError(null);
    const uid = getUserId();
    if (!uid) { navigate('/login'); return; }
    if (pendingOrderIds.length === 0) return;
    setPayRetrying(true);
    try {
      const supaUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL ?? '';
      const resp = await fetch(
        `${supaUrl}/functions/v1/create-order-checkout`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderIds:     pendingOrderIds,
            userId:       uid,
            returnOrigin: window.location.origin,
          }),
        },
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const j = await resp.json();
      if (!j?.url) throw new Error('missing stripe url');
      window.location.href = j.url as string;
    } catch (e) {
      console.warn('[OrderSuccess] retry pay failed:', e);
      setPayError(t3('Payment redirect failed, try again', '跳转付款失败, 请重试', 'Subukan ulit'));
      setPayRetrying(false);
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-[#f5f5f5] flex flex-col pb-8">
      <main className="flex-1 px-5 py-8 flex flex-col items-center">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-[13px]">
            {t3('Loading…', '加载中…', 'Naglo-load…')}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center mt-12 shadow-sm w-full">
            <div className="text-[48px] mb-3">😕</div>
            <p className="font-bold text-[16px] mb-2">{t3('Order not found', '订单未找到', 'Order hindi natagpuan')}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-2.5 rounded-full text-[13px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
            >
              {t3('Back to Home', '返回首页', 'Bumalik sa Home')}
            </button>
          </div>
        ) : (
          <>
            {/* TICKET-080-B: 区分付款已完成 vs 待付款 */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mt-8 mb-4"
              style={cameFromStripe
                ? { background: 'linear-gradient(135deg, #25D366, #16A34A)', boxShadow: '0 12px 32px rgba(22,163,74,0.30)' }
                : { background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', boxShadow: '0 12px 32px rgba(255,90,31,0.30)' }
              }
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: 56, fontVariationSettings: "'FILL' 1" }}>
                {cameFromStripe ? 'check' : 'hourglass_top'}
              </span>
            </div>
            <h1 className="text-[22px] font-black mb-1" style={{ color: '#1a1a1a' }}>
              {cameFromStripe
                ? (isMulti
                    ? t3(`${orders.length} Payments Successful`, `${orders.length} 笔付款成功`, `${orders.length} Bayad Tagumpay`)
                    : t3('Payment Successful', '付款成功', 'Tagumpay ang Bayad'))
                : (isMulti
                    ? t3(`${orders.length} Orders Created · Pending Payment`, `${orders.length} 个订单已创建 · 待付款`, `${orders.length} Orders Naipasa · Hintay Bayad`)
                    : t3('Order Created · Pending Payment', '订单已创建 · 待付款', 'Naipasa ang Order · Hintay Bayad'))
              }
            </h1>
            <p className="text-[12px] text-gray-500 mb-6">
              {cameFromStripe
                ? t3('Thank you for your payment', '感谢您的付款', 'Salamat sa iyong bayad')
                : t3('Please complete payment to confirm', '请完成付款以确认订单', 'Mag-bayad para kumpirmahin')}
            </p>

            {/* TICKET-083 §7c — 多订单卡 (每订单一张) */}
            <div className="w-full space-y-3">
              {orders.map(order => {
                const statusColor = getOrderStatusColor(order.status);
                return (
                  <div key={order.id} className="bg-white rounded-3xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">{t3('Order #', '订单号', 'Order #')}</span>
                      <span className="text-[12px] font-bold" style={{ color: '#1a1a1a' }}>{order.order_number}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">{t3('Status', '状态', 'Status')}</span>
                      <span
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: statusColor.bg, color: statusColor.fg }}
                      >
                        {getOrderStatusLabel(order.status, lang)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">{t3('Subtotal', '总价', 'Kabuuan')}</span>
                      <span className="text-[16px] font-black" style={{ color: '#FF5A1F' }}>
                        HKD {Number(order.total_hkd).toFixed(2)}
                      </span>
                    </div>
                    {order.delivery_time_slot && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-500">{t3('Delivery', '送货时间', 'Paghahatid')}</span>
                        <span className="text-[11px] text-right max-w-[60%]">{order.delivery_time_slot}</span>
                      </div>
                    )}
                    <div className="border-t border-black/5 pt-3">
                      <p className="text-[11px] text-gray-500 mb-1">{t3('Address', '收货地址', 'Address')}</p>
                      <p className="text-[12px] leading-relaxed">{order.delivery_address}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="w-full mt-2 py-2.5 rounded-full font-bold text-[12px] text-white active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
                    >
                      {t3('View Detail', '查看详情', 'Tingnan')}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Multi-order grand total */}
            {isMulti && (
              <div className="w-full mt-4 bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <span className="text-[13px] font-bold">{t3('Grand total', '订单总计', 'Kabuuang halaga')}</span>
                <span className="text-[18px] font-black" style={{ color: '#FF5A1F' }}>
                  HKD {totalAll.toFixed(2)}
                </span>
              </div>
            )}

            {/* Disclaimer (080-B: 付款已接 Stripe; 配送仍待 Inalca API 接通) */}
            <div
              className="mt-4 p-3 rounded-xl text-[11px] leading-relaxed text-center w-full"
              style={{ background: 'rgba(255,90,31,0.06)', color: '#B45309', border: '1px dashed rgba(255,90,31,0.30)' }}
            >
              {cameFromStripe
                ? t3(
                    'Payment received. Supplier delivery integration coming soon — we will notify you once shipped.',
                    '付款已收到。供应商配送对接即将上线, 发货后会通知您。',
                    'Natanggap na ang bayad. Delivery integration darating na — sasabihin pag pinadala.',
                  )
                : t3(
                    'Your order is on file. Please complete payment to confirm.',
                    '订单已存档, 完成付款后即可确认。',
                    'Naka-file ang order. Kumpletuhin ang bayad para kumpirmahin.',
                  )}
            </div>

            {payError && (
              <div className="mt-3 p-3 rounded-xl text-[12px] text-red-700 bg-red-50 border border-red-200 w-full text-center">
                {payError}
              </div>
            )}

            {/* Actions */}
            <div className="w-full mt-6 space-y-2.5">
              {/* 080-B: 待付款 → 主 CTA = 去付款.
                  ⚠️ cameFromStripe 时 webhook 异步, 订单 DB status 还可能是 pending_payment.
                  这种情况不显"去付款" (会让用户以为没付成功). 只在直进 (没 session 参数)
                  的纯创建场景才显. */}
              {hasPending && !cameFromStripe && (
                <button
                  onClick={handleRetryPay}
                  disabled={payRetrying}
                  className="w-full py-3 rounded-full font-bold text-[14px] text-white active:scale-95 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', boxShadow: '0 8px 20px rgba(255,90,31,0.30)' }}
                >
                  {payRetrying
                    ? t3('Redirecting…', '跳转中…', 'Pumupunta…')
                    : t3(`Pay Now (HKD ${totalAll.toFixed(2)})`, `去付款 (HKD ${totalAll.toFixed(2)})`, `Magbayad Na (HKD ${totalAll.toFixed(2)})`)}
                </button>
              )}
              <button
                onClick={() => navigate('/orders')}
                className={`w-full py-3 rounded-full font-bold text-[14px] active:scale-95 ${hasPending && !cameFromStripe ? 'bg-white border border-black/10' : 'text-white'}`}
                style={hasPending && !cameFromStripe
                  ? { color: '#1a1a1a' }
                  : { background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', color: '#fff' }
                }
              >
                {t3('View All Orders', '查看全部订单', 'Tingnan Lahat')}
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 rounded-full font-bold text-[14px] bg-white border border-black/10 active:scale-95"
                style={{ color: '#1a1a1a' }}
              >
                {t3('Back to Home', '返回首页', 'Bumalik sa Home')}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
