/**
 * InviteCodeBindCard — TICKET-097 菲佣端邀请码绑定卡 (从 HelperHome 抽出).
 *
 * 老板真测 5/27: "主页的菲佣邀请码可能复杂了, 放在菲佣界面的设置里去".
 * 把 HelperHome.tsx:981-1035 整段邀请码 UI 抽成独立组件, 在 HelperSettings 用.
 *
 * 真链路 (老板原问 "是真的联动吗?" → DB 实查 households + household_members
 * 真表真行, TICKET-073 已修过 mint fake):
 *   1. SELECT households WHERE invite_code = code → 拿 household_id
 *   2. UPSERT household_members (household_id, helper_id, status='active')
 *   3. HelperHome / HelperPrep / HelperCook 调 loadEmployerTodayMenu(helper_id)
 *      → household_members → households.employer_id → user_weekly_menus →
 *      dishes → 真菜单
 *
 * 不变量:
 * - 不动 DB schema
 * - 不动 households / household_members 表结构
 * - RLS 已是 anon-first FOR ALL USING (true) (migration 025 ship)
 */

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  /** 绑定成功后 callback (UI 可 reload / 跳转) */
  onBound?: () => void;
  /** 已绑定时是否显示已绑定卡片 (默认 true), false = 已绑定不渲染 */
  showWhenBound?: boolean;
  /** 已绑定状态 (上层传入, 避免重复 query) */
  isLinked?: boolean;
}

export default function InviteCodeBindCard({ onBound, showWhenBound = true, isLinked = false }: Props) {
  const { t3 } = useLanguage();
  const [showInput, setShowInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeDone, setCodeDone] = useState(false);

  async function handleJoin() {
    const code = codeInput.trim();
    if (code.length !== 6) {
      setCodeError(t3('Please enter a 6-digit code', '请输入 6 位邀请码', 'Mangyari mag-enter ng 6 digit'));
      return;
    }
    const userId = getUserId();
    if (!userId) {
      setCodeError(t3('Please sign in first', '请先登录', 'Mag sign in muna'));
      return;
    }

    setCodeLoading(true);
    setCodeError('');

    const { data: hh } = await supabase
      .from('households')
      .select('id')
      .eq('invite_code', code)
      .maybeSingle();

    if (!hh) {
      setCodeError(t3(
        'Code not found. Ask your employer for the correct code.',
        '未找到邀请码，请向雇主确认',
        'Hindi nakita. Tanungin ang employer.',
      ));
      setCodeLoading(false);
      return;
    }

    const { error } = await supabase
      .from('household_members')
      .upsert(
        { household_id: hh.id, helper_id: userId, status: 'active' },
        { onConflict: 'household_id,helper_id' },
      );

    if (error) {
      setCodeError(t3('Something went wrong. Please try again.', '出错了，请重试', 'May error, subukan ulit.'));
    } else {
      setCodeDone(true);
      setShowInput(false);
      onBound?.();
    }
    setCodeLoading(false);
  }

  // 已绑定 → 显示成功卡 / 或返 null (按 prop)
  if (codeDone || isLinked) {
    if (!showWhenBound) return null;
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
        style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)' }}>
        <span className="material-symbols-outlined text-[#25D366]"
          style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>
          check_circle
        </span>
        <p style={{ fontSize: 13, color: '#25D366', fontWeight: 600 }}>
          {t3("Linked to employer's household 🎉", '已绑定雇主家庭 🎉', 'Nakaugnay na sa employer 🎉')}
        </p>
      </div>
    );
  }

  // 未绑定 + 显示输入框
  if (showInput) {
    return (
      <div className="flex flex-col gap-2 px-4 py-4 rounded-2xl"
        style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.10)' }}>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', marginBottom: 4 }}>
          {t3(
            'Enter the 6-digit code from your employer:',
            '输入雇主的 6 位邀请码：',
            'Ilagay ang 6-digit code mula sa employer:',
          )}
        </p>
        <div className="flex gap-2">
          <input
            value={codeInput}
            onChange={e => { setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setCodeError(''); }}
            placeholder="000000"
            maxLength={6}
            className="flex-1 rounded-xl px-4 py-2.5 font-black text-center tracking-[0.25em]"
            style={{
              background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.15)',
              color: '#1a1a1a', fontSize: 20, outline: 'none',
            }}
          />
          <button
            onClick={handleJoin}
            disabled={codeLoading || codeInput.length !== 6}
            className="px-4 rounded-xl font-bold text-white active:scale-95 transition-all disabled:opacity-40"
            style={{ background: '#25D366', fontSize: 13 }}>
            {codeLoading ? '...' : t3('Join', '加入', 'Sumali')}
          </button>
        </div>
        {codeError && <p style={{ fontSize: 11, color: '#d63838' }}>{codeError}</p>}
        <button onClick={() => setShowInput(false)} style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
          {t3('Cancel', '取消', 'Kanselahin')}
        </button>
      </div>
    );
  }

  // 未绑定 + 折叠按钮 (默认)
  return (
    <button
      onClick={() => setShowInput(true)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl active:scale-[0.98] transition-all"
      style={{ background: 'rgba(0,0,0,0.03)', border: '1px dashed rgba(0,0,0,0.18)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(0,0,0,0.4)' }}>link</span>
      <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>
        {t3('Enter employer invite code', '输入雇主邀请码', 'Ilagay ang employer invite code')}
      </p>
      <span className="ml-auto" style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)' }}>›</span>
    </button>
  );
}
