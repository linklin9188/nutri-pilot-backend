/**
 * OrderSuccess — /order/success?order_id=X (单订单) 或 /orders/success?ids=A,B (多订单).
 *
 * 080-A: 显示绿勾 + 订单号 + "等待支付" badge + 测试版 disclaimer (没真接 Stripe).
 * TICKET-083 §7c: 多订单模式按 ids= 逗号分隔 → 渲染 N 个订单卡 (每个 supplier 一个).
 * 080-B 接 Stripe 后改成"已支付" badge (status='paid') + 真发邮件确认.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
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
  const orderIds = idsParam
    ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
    : (singleId ? [singleId] : []);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

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
            {/* Big green check */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mt-8 mb-4"
              style={{ background: 'linear-gradient(135deg, #25D366, #16A34A)', boxShadow: '0 12px 32px rgba(22,163,74,0.30)' }}
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: 56, fontVariationSettings: "'FILL' 1" }}>
                check
              </span>
            </div>
            <h1 className="text-[22px] font-black mb-1" style={{ color: '#1a1a1a' }}>
              {isMulti
                ? t3(`${orders.length} Orders Submitted`, `${orders.length} 个订单已提交`, `${orders.length} Orders Naipasa`)
                : t3('Order Submitted', '订单已提交', 'Naipasa ang Order')}
            </h1>
            <p className="text-[12px] text-gray-500 mb-6">
              {t3('Thank you for your order', '感谢您的下单', 'Salamat sa iyong order')}
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

            {/* Disclaimer */}
            <div
              className="mt-4 p-3 rounded-xl text-[11px] leading-relaxed text-center w-full"
              style={{ background: 'rgba(255,90,31,0.06)', color: '#B45309', border: '1px dashed rgba(255,90,31,0.30)' }}
            >
              {t3(
                'Test version: live payment & supplier delivery integration coming soon. Your order is on file.',
                '当前为测试版: 实际付款 + 供应商配送功能即将上线, 订单已存档。',
                'Test version: live payment at delivery darating na. Naka-file ang order.',
              )}
            </div>

            {/* Actions */}
            <div className="w-full mt-6 space-y-2.5">
              <button
                onClick={() => navigate('/orders')}
                className="w-full py-3 rounded-full font-bold text-[14px] text-white active:scale-95"
                style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
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
