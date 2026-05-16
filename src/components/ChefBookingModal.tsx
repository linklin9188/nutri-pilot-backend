/**
 * ChefBookingModal — "米其林大厨上门" placeholder lead form.
 *
 * Shown when a Pro user taps the "📞 预约大厨" CTA on a Michelin dish card.
 * No real booking system yet; we just collect interest into
 * `user_chef_interest` for manual follow-up.
 */

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';

interface Props {
  open: boolean;
  onClose: () => void;
  dish?: {
    michelin_dish_id: string;
    name_zh: string;
    restaurant_name_zh: string;
    chef_book_price_hkd?: number | null;
  } | null;
}

export default function ChefBookingModal({ open, onClose, dish }: Props) {
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [email, setEmail]     = useState('');
  const [date, setDate]       = useState('');
  const [people, setPeople]   = useState('6');
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setError(null);
    if (!name.trim() && !phone.trim() && !email.trim()) {
      setError('请至少留一个联系方式（姓名、电话或邮箱）');
      return;
    }
    setLoading(true);
    try {
      const userId = getUserId();
      const { error: e } = await supabase.from('user_chef_interest').insert({
        user_id:         userId,
        michelin_dish_id: dish?.michelin_dish_id ?? null,
        contact_name:    name.trim() || null,
        phone:           phone.trim() || null,
        email:           email.trim() || null,
        preferred_date:  date || null,
        party_size:      parseInt(people, 10) || null,
        notes:           notes.trim() || null,
      });
      if (e) throw e;
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-5"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 shadow-2xl bg-white"
        onClick={e => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">🎩</div>
            <h2 className="font-serif font-black mb-2" style={{ fontSize: 22, color: '#1a1a1a' }}>已收到您的预约意向</h2>
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', lineHeight: 1.6 }}>
              米其林大厨上门服务尚在筹备中。我们会在 24 小时内与您联系，讨论档期、菜单细节与报价。
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full h-11 rounded-2xl font-bold text-white active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #1a1a1a, #404040)', fontSize: 14 }}
            >
              好的
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.42)', fontWeight: 600 }}>
                  Chef at Home · 敬请期待
                </p>
                <h2 className="font-serif font-black mt-0.5" style={{ fontSize: 19, color: '#1a1a1a' }}>预约米其林大厨上门</h2>
                {dish && (
                  <p className="mt-1" style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
                    主推：{dish.name_zh} · 出自 {dish.restaurant_name_zh}
                    {dish.chef_book_price_hkd ? ` · 参考 HK$${dish.chef_book_price_hkd}/桌` : ''}
                  </p>
                )}
              </div>
              <button onClick={onClose} disabled={loading} className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 bg-black/[0.05]">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', lineHeight: 1.55, marginBottom: 14 }}>
              留下联系方式，我们会在 24 小时内回覆，讨论档期、菜单、报价。
            </p>

            <div className="space-y-2.5">
              <input value={name} onChange={e => setName(e.target.value)} disabled={loading}
                placeholder="您的姓名（可选）"
                className="w-full rounded-xl px-3 py-2.5 outline-none"
                style={{ fontSize: 13, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }} />
              <input value={phone} onChange={e => setPhone(e.target.value)} disabled={loading}
                placeholder="手机号 / WhatsApp"
                className="w-full rounded-xl px-3 py-2.5 outline-none"
                style={{ fontSize: 13, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }} />
              <input value={email} onChange={e => setEmail(e.target.value)} disabled={loading}
                placeholder="邮箱"
                className="w-full rounded-xl px-3 py-2.5 outline-none"
                style={{ fontSize: 13, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }} />
              <div className="grid grid-cols-2 gap-2.5">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={loading}
                  className="rounded-xl px-3 py-2.5 outline-none"
                  style={{ fontSize: 13, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }} />
                <input type="number" min="2" max="20" value={people} onChange={e => setPeople(e.target.value)} disabled={loading}
                  placeholder="人数"
                  className="rounded-xl px-3 py-2.5 outline-none"
                  style={{ fontSize: 13, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }} />
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={loading}
                placeholder="特别要求（菜系偏好 / 忌口 / 场合）..."
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 outline-none resize-none"
                style={{ fontSize: 13, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }} />
            </div>

            {error && (
              <div className="mt-3 rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,90,31,0.08)', border: '1px solid rgba(255,90,31,0.25)' }}>
                <p style={{ fontSize: 12, color: '#7a3000' }}>⚠️ {error}</p>
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full h-12 rounded-2xl font-bold text-white flex items-center justify-center gap-2 mt-4 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1a1a1a, #404040)', boxShadow: '0 8px 24px rgba(0,0,0,0.20)', fontSize: 14 }}
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>progress_activity</span>
                  提交中…
                </>
              ) : '提交预约意向'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
