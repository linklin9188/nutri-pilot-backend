/**
 * Checkout — /checkout 结账页 (TICKET-080-A → 080-B).
 *
 * 流程 (080-B): /cart "去结账" → /checkout 填地址 + 选送货时间 → 点"确认下单" →
 *   1. createOrders() (按 supplier 拆 N 张订单, status='pending_payment')
 *   2. 调 create-order-checkout edge fn → 拿 Stripe Checkout url
 *   3. window.location.href = url 跳 Stripe
 *   4. 用户付款完跳回 /orders/success?ids=A,B&session=cs_xxx
 *   5. webhook 异步把 orders.status 改 'paid'
 *
 * 兜底: Stripe 跳转失败 → alert + navigate /orders/success?ids=... (订单已创建,
 * 用户可以在 success 页点"去付款"重试).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { loadCart, groupItemsBySupplier, type CartItem } from '../lib/cart';
import { createOrders } from '../lib/orders';

interface TimeSlot {
  id:    string;
  label: { zh: string; en: string; tl: string };
}

// 三天 × 上下午 6 个时段; 080-C 接 Inalca 后改成 API 真给可选时段
const TIME_SLOTS: TimeSlot[] = [
  { id: 'tomorrow_morning',   label: { zh: '明天上午 09:00-12:00',   en: 'Tomorrow 9:00-12:00 AM',  tl: 'Bukas 9:00-12:00 AM'  } },
  { id: 'tomorrow_afternoon', label: { zh: '明天下午 14:00-17:00',   en: 'Tomorrow 2:00-5:00 PM',   tl: 'Bukas 2:00-5:00 PM'   } },
  { id: 'day_after_morning',  label: { zh: '后天上午 09:00-12:00',   en: 'Day after 9:00-12:00 AM', tl: 'Sa Makalawa 9:00 AM'  } },
  { id: 'day_after_afternoon',label: { zh: '后天下午 14:00-17:00',   en: 'Day after 2:00-5:00 PM',  tl: 'Sa Makalawa 2:00 PM'  } },
  { id: 'weekend_morning',    label: { zh: '本周末上午 09:00-12:00', en: 'Weekend 9:00-12:00 AM',   tl: 'Weekend 9:00-12:00 AM'} },
  { id: 'weekend_afternoon',  label: { zh: '本周末下午 14:00-17:00', en: 'Weekend 2:00-5:00 PM',    tl: 'Weekend 2:00-5:00 PM' } },
];

export default function Checkout() {
  const navigate = useNavigate();
  const { t3, language } = useLanguage();
  const lang: 'zh' | 'en' | 'tl' = language === 'en' ? 'en' : language === 'tl' ? 'tl' : 'zh';

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [timeSlotId, setTimeSlotId] = useState(TIME_SLOTS[0].id);
  const [note, setNote] = useState('');

  // Mount: 拉购物车 + 用户名 default. 空车 → 直接踢回 /cart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = getUserId();
      if (!uid) { navigate('/login'); return; }
      const cart = await loadCart(uid);
      if (cancelled) return;
      if (cart.items.length === 0) {
        navigate('/cart', { replace: true });
        return;
      }
      setCartItems(cart.items);
      setSubtotal(cart.subtotalHkd);

      // 拉用户 profile 给 default 联系人. display_name 可能为 null (CLAUDE.md 已知偏离),
      // null 时让用户自己填.
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', uid)
          .maybeSingle();
        if (!cancelled && data && (data as any).display_name) {
          setContactName((data as any).display_name as string);
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);
    // 校验
    if (!address.trim()) { setError(t3('Address required', '请填写收货地址', 'Kailangan ng address')); return; }
    if (!contactName.trim()) { setError(t3('Name required', '请填写联系人', 'Kailangan ng pangalan')); return; }
    if (!contactPhone.trim()) { setError(t3('Phone required', '请填写联系电话', 'Kailangan ng telepono')); return; }
    const uid = getUserId();
    if (!uid) { navigate('/login'); return; }

    const slot = TIME_SLOTS.find(s => s.id === timeSlotId);
    const slotLabel = slot ? slot.label[lang] : timeSlotId;

    setSubmitting(true);
    try {
      // TICKET-083 §7a — createOrders (复数) 按 supplier_id 拆多张订单
      const orders = await createOrders(uid, {
        cartItems,
        deliveryAddress:      address.trim(),
        deliveryContactName:  contactName.trim(),
        deliveryContactPhone: contactPhone.trim(),
        deliveryTimeSlot:     slotLabel,
        deliveryNote:         note.trim() || undefined,
      });
      if (orders.length === 0) {
        setError(t3('Order failed, please retry', '订单创建失败, 请重试', 'Subukan ulit'));
        setSubmitting(false);
        return;
      }
      // TICKET-080-B — 调 create-order-checkout 拿 Stripe url, 跳付款
      const orderIds = orders.map(o => o.id);
      const supaUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL ?? '';
      try {
        const resp = await fetch(
          `${supaUrl}/functions/v1/create-order-checkout`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderIds,
              userId:       uid,
              returnOrigin: window.location.origin,
            }),
          },
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const j = await resp.json();
        if (!j?.url) throw new Error('missing stripe url');
        window.location.href = j.url as string;
        // 不 setSubmitting(false) — 页面已离开
        return;
      } catch (e) {
        // Stripe 跳转失败兜底: 订单已建, 跳 success 让用户从那里点"去付款"重试
        console.warn('[Checkout] Stripe redirect failed, fallback to /orders/success:', e);
        const ids = orderIds.join(',');
        navigate(`/orders/success?ids=${encodeURIComponent(ids)}`, { replace: true });
      }
    } catch {
      setError(t3('Network error, please retry', '网络错误, 请重试', 'Network error, subukan ulit'));
      setSubmitting(false);
    }
  };

  const total = subtotal;  // 080-A 不收运费

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
        <h1 className="text-[18px] font-bold flex-1">{t3('Checkout', '结账', 'Mag-checkout')}</h1>
      </header>

      <main className="px-4 py-4 pb-44 space-y-4">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-[13px]">
            {t3('Loading…', '加载中…', 'Naglo-load…')}
          </div>
        ) : (
          <>
            {/* TICKET-083 §7b — 订单摘要按供应商分组 + 多订单拆分提示 */}
            {(() => {
              const groups = groupItemsBySupplier(cartItems);
              const multi  = groups.length > 1;
              return (
                <section className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    {multi
                      ? t3(
                          `Will create ${groups.length} orders`,
                          `你将创建 ${groups.length} 个订单`,
                          `Gagawa ng ${groups.length} orders`,
                        )
                      : t3('Order Summary', '订单摘要', 'Buod ng Order')} · {cartItems.length}
                  </p>
                  <div className="space-y-3">
                    {groups.map(g => (
                      <div key={g.supplierId || 'unknown'}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[12px]">🛒</span>
                          <p className="text-[12px] font-bold" style={{ color: '#1a1a1a' }}>
                            {g.supplierName || t3('Other supplier', '其他供应商', 'Iba pang supplier')}
                          </p>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F' }}
                          >
                            {g.items.length} {t3('items', '件', 'item')} · HKD {g.subtotalHkd.toFixed(2)}
                          </span>
                        </div>
                        <div className="space-y-1 pl-5">
                          {g.items.map(it => (
                            <div key={it.id} className="flex items-center justify-between text-[12px]">
                              <span className="truncate flex-1 pr-2" style={{ color: '#1a1a1a' }}>
                                {it.sku_name} <span className="text-gray-400">×{it.qty}</span>
                              </span>
                              <span className="font-bold">HKD {(it.retail_price_hkd * it.qty).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-black/5 mt-3 pt-3 flex items-center justify-between">
                    <span className="text-[13px] font-bold">{t3('Subtotal', '商品总价', 'Subtotal')}</span>
                    <span className="text-[15px] font-black" style={{ color: '#FF5A1F' }}>
                      HKD {subtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-gray-500">{t3('Delivery fee', '运费', 'Delivery fee')}</span>
                    <span className="text-[12px] text-gray-500">{t3('Free', '免运费', 'Libre')}</span>
                  </div>
                </section>
              );
            })()}

            {/* 收货地址 */}
            <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {t3('Delivery', '收货信息', 'Pagpapadala')}
              </p>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">
                  {t3('Address', '收货地址', 'Address')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder={t3('Building, floor, unit', '楼号 / 楼层 / 单元', 'Building, palapag, unit')}
                  className="w-full px-3 py-2.5 rounded-lg border border-black/10 text-[14px] focus:outline-none focus:border-[#FF5A1F]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">
                    {t3('Name', '联系人', 'Pangalan')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder={t3('Contact name', '联系人姓名', 'Pangalan')}
                    className="w-full px-3 py-2.5 rounded-lg border border-black/10 text-[14px] focus:outline-none focus:border-[#FF5A1F]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">
                    {t3('Phone', '联系电话', 'Telepono')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="+852 ..."
                    className="w-full px-3 py-2.5 rounded-lg border border-black/10 text-[14px] focus:outline-none focus:border-[#FF5A1F]"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">
                  {t3('Delivery time', '送货时间', 'Oras ng paghahatid')}
                </label>
                <select
                  value={timeSlotId}
                  onChange={e => setTimeSlotId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-black/10 text-[14px] focus:outline-none focus:border-[#FF5A1F] bg-white"
                >
                  {TIME_SLOTS.map(s => (
                    <option key={s.id} value={s.id}>{s.label[lang]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">
                  {t3('Note (optional)', '备注 (选填)', 'Note (opsyonal)')}
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder={t3('e.g. leave at front desk', '例如: 放门卫处', 'hal: iwan sa harapan')}
                  className="w-full px-3 py-2.5 rounded-lg border border-black/10 text-[14px] focus:outline-none focus:border-[#FF5A1F] resize-none"
                />
              </div>
            </section>

            {/* Disclaimer (080-B: 付款已接 Stripe; 配送仍待 Inalca API 接通) */}
            <p className="text-center text-[10px] text-gray-400 px-4 leading-relaxed">
              {t3(
                'Secure payment by Stripe. Delivery integration with supplier coming soon.',
                '付款由 Stripe 提供安全保障; 供应商配送对接即将上线。',
                'Ligtas na bayad sa pamamagitan ng Stripe. Delivery integration darating na.',
              )}
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-700">
                {error}
              </div>
            )}
          </>
        )}
      </main>

      {/* Sticky submit */}
      {!loading && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-black/5 px-5 py-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-gray-500">{t3('Total', '总价', 'Kabuuan')}</span>
            <span className="text-[20px] font-black" style={{ color: '#FF5A1F' }}>
              HKD {total.toFixed(2)}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3.5 rounded-full font-bold text-[14px] text-white active:scale-95 transition-all disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
              boxShadow: '0 8px 20px rgba(255,90,31,0.30)',
            }}
          >
            {submitting
              ? t3('Redirecting to payment…', '跳转付款…', 'Pumupunta sa bayad…')
              : t3(`Pay HKD ${total.toFixed(2)}`, `去付款 HKD ${total.toFixed(2)}`, `Magbayad HKD ${total.toFixed(2)}`)}
          </button>
        </div>
      )}
    </div>
  );
}
