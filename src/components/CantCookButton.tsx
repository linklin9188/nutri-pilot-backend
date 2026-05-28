/**
 * CantCookButton — TICKET-098 SPEC v2 Phase 5
 *
 * 菲佣 HelperCook 页加 "🆘 这道我没做过" 按钮.
 * 点击 → 写 user_chat_preferences (helper_cant_cook, dish_id, household_id)
 * → 雇主端可读到 (HelperFamilyPrefsCard 同链路 household_id 维度).
 *
 * UX 原则 (老板 5/27 "不必要不显"):
 *  - 默认按钮可见 (灰色低调 chip 样式)
 *  - 已点过 (LS 标记) → 不显, 换成 green chip "已告诉雇主"
 *  - 一道菜只能告诉一次 (每次重新弹按钮就 spam 雇主了)
 */

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  dish: { id: string; title_zh: string };
}

export default function CantCookButton({ dish }: Props) {
  const { t4 } = useLanguage();
  const LS_KEY = `helper_cant_cook:${dish.id}`;
  const [reported, setReported] = useState<boolean>(
    () => localStorage.getItem(LS_KEY) === '1'
  );
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (reported || busy) return;
    if (!confirm(t4(
      `Tell employer you haven't made "${dish.title_zh}" before?`,
      `告诉雇主你没做过"${dish.title_zh}"?`,
      `Sabihin sa employer na hindi mo pa naluluto "${dish.title_zh}"?`,
      `Beritahu employer kamu belum pernah masak "${dish.title_zh}"?`,
    ))) return;

    setBusy(true);
    const userId = getUserId();
    if (!userId) { setBusy(false); return; }

    try {
      // 查 helper 绑的 household_id (双维度让雇主能收到)
      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('helper_id', userId)
        .eq('status', 'active')
        .limit(1);
      const householdId = (member?.[0] as any)?.household_id ?? null;

      await supabase.from('user_chat_preferences').insert({
        user_id: userId,
        household_id: householdId,
        preference_type: 'dislike_keyword',  // 复用现有 type (algorithm v72 reactive 已读)
        preference_value: {
          dish_id: dish.id,
          title: dish.title_zh,
          reason: 'helper_cant_cook',
        },
        source: 'didnt_eat',  // 复用 didnt_eat source (confidence 0.9 高权重负向)
        confidence: 0.9,
      });

      localStorage.setItem(LS_KEY, '1');
      setReported(true);
    } catch (e) {
      console.warn('[CantCookButton] failed:', e);
    } finally {
      setBusy(false);
    }
  }

  if (reported) {
    return (
      <div className="rounded-2xl px-4 py-2.5 flex items-center justify-center gap-2"
        style={{ background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.25)' }}>
        <span className="material-symbols-outlined text-[#25D366]"
          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        <p style={{ fontSize: 12, color: '#25D366', fontWeight: 600 }}>
          {t4('Told employer ✓', '已告诉雇主 ✓', 'Sinabi na sa employer', 'Sudah dilaporkan')}
        </p>
      </div>
    );
  }

  return (
    <button onClick={handleClick} disabled={busy}
      className="rounded-2xl px-4 py-2.5 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
      style={{ background: 'rgba(0,0,0,0.04)', border: '1px dashed rgba(0,0,0,0.20)' }}>
      <span style={{ fontSize: 14 }}>🆘</span>
      <p style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.65)', fontWeight: 600 }}>
        {busy
          ? t4('Sending...', '发送中...', 'Pinapadala...', 'Mengirim...')
          : t4(
            "I haven't made this — tell employer",
            '我没做过这道 — 告诉雇主',
            'Hindi ko pa naluluto — sabihin sa employer',
            'Belum pernah masak — beritahu employer',
          )}
      </p>
    </button>
  );
}
