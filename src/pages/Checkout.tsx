/**
 * Checkout — /checkout 结账页 (TICKET-080-A).
 *
 * 流程: /cart "去结账" → /checkout 填地址 + 选送货时间 → 点"确认下单" →
 *   createOrder() → 跳 /order/success?order_id=X.
 *
 * 080-A: 不接 Stripe, status='pending_payment' 直接生成订单 + 清空购物车.
 *        OrderSuccess 显示"等待支付 (测试版)" disclaimer.
 *
 * 080-B 接 Stripe 时 createOrder() 后立刻 create-checkout-session, redirect Stripe.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { loadCart, type CartItem } from '../lib/cart';
import { createOrder } from '../lib/orders';

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
      const order = await createOrder(uid, {
        cartItems,
        deliveryAddress:      address.trim(),
        deliveryContactName:  contactName.trim(),
        deliveryContactPhone: contactPhone.trim(),
        deliveryTimeSlot:     slotLabel,
        deliveryNote:         note.trim() || undefined,
      });
      if (!order) {
        setError(t3('Order failed, please retry', '订单创建失败, 请重试', 'Subukan ulit'));
        setSubmitting(false);
        return;
      }
      // 跳 success 页
      navigate(`/order/success?order_id=${encodeURIComponent(order.id)}`, { replace: true });
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
            {/* 订单摘要 */}
            <section className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {t3('Order Summary', '订单摘要', 'Buod ng Order')} · {cartItems.length}
              </p>
              <div className="space-y-1.5">
                {cartItems.map(it => (
                  <div key={it.id} className="flex items-center justify-between text-[12px]">
                    <span className="truncate flex-1 pr-2" style={{ color: '#1a1a1a' }}>
                      {it.sku_name} <span className="text-gray-400">×{it.qty}</span>
                    </span>
                    <span className="font-bold">HKD {(it.retail_price_hkd * it.qty).toFixed(2)}</span>
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

            {/* Disclaimer */}
            <p className="text-center text-[10px] text-gray-400 px-4 leading-relaxed">
              {t3(
                'Test version: order will be recorded but payment & delivery are not yet live. Coming soon.',
                '当前为测试版: 订单会被记录, 但实际付款 + 配送功能即将上线。',
                'Test version: ire-record ang order pero hindi pa live ang bayad at delivery.',
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
              ? t3('Submitting…', '提交中…', 'Sini-submit…')
              : t3(`Confirm Order (HKD ${total.toFixed(2)})`, `确认下单 (HKD ${total.toFixed(2)})`, `Kumpirmahin (HKD ${total.toFixed(2)})`)}
          </button>
        </div>
      )}
    </div>
  );
}
