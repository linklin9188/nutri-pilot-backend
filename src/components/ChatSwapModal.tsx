/**
 * ChatSwapModal — TICKET-069 P0 chat 改弹对话窗 + 勾选今日菜换 (老板真测 #14 拍板 1+A).
 *
 * 设计:
 *   1. 用户在 IntentInputBox 输入"想吃新疆菜" / 点 chip → 父组件 trigger 开此弹窗.
 *   2. 弹窗顶部"AI: 好的，我帮你换。今天菜单是：" + 灰底引用 userIntent.
 *   3. 列出今天 lunch + dinner (不含早餐 / 水果, 老板 spec 只换主餐).
 *   4. 每行 ☐ checkbox + 菜名 + 32x32 缩略图.
 *   5. 底部"确认换菜 (已选 N 道)" 三态按钮 (灰/橙/loading).
 *   6. 点确认 → parseIntent(userIntent) → saveIntentBias(bias) 让全局 bias 生效
 *      → 对每个勾选 dish 实查同 type 候选池 → 按 applyIntentBias 排分 → swapDish.
 *   7. 全部 swap 完 → toast → navigate('/weekly').
 *
 * 不写 chat session DB (quick swap, 非多轮对话).
 * 不调 useWeeklyMenu hook (由父组件传 swapDish / weeklyMenu / todayIdx 避免重复 mount).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { type SupabaseDish } from '../hooks/useSupabaseMenu';
import type { WeeklyMenu } from '../hooks/useWeeklyMenu';
import { getDishTitle } from '../lib/dishTitleI18n';
import { parseIntent, saveIntentBias, applyIntentBias } from '../lib/intentBias';
import { supabase } from '../lib/supabase';

interface Props {
  open: boolean;
  userIntent: string;
  onClose: () => void;
  /** 父组件 useWeeklyMenu 已挂的 swap 函数 — 避免重复 mount hook 触发再次菜单生成. */
  swapDish: (dayIndex: number, slotIndex: number, newDish: SupabaseDish) => Promise<void>;
  weeklyMenu: WeeklyMenu | null;
  /** Home/WeeklyMenu 已 clamp 过的 today index (周末 → 0, 工作日 → todayDayIndex()). */
  todayIdx: number;
}

export default function ChatSwapModal({
  open, userIntent, onClose, swapDish, weeklyMenu, todayIdx,
}: Props) {
  const { t3, language } = useLanguage();
  const navigate = useNavigate();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [swapping, setSwapping]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [toast, setToast]           = useState<string | null>(null);

  // 弹窗每次打开 reset 勾选 / error.
  useEffect(() => {
    if (open) {
      setCheckedIds(new Set());
      setError(null);
      setToast(null);
      setSwapping(false);
    }
  }, [open]);

  // 今天菜单 lunch + dinner. weeklyMenu.days[todayIdx].dishes 是 SupabaseDish[]
  // (slot allocation 已合到 day.dishes). Algorithm 现状 5-day, lunch 在前 dinner 在后.
  // 实际 slot 顺序由 generateWeekPlan 决定; 这里不按 meal 拆, 因为 day.dishes 是
  // mixed slots (lunch 主菜 + dinner 主菜 + 汤 + 蔬菜...). 老板 spec "lunch + dinner"
  // 实际意思是"今日全部主餐", 早餐 / 水果不在 day.dishes 里 (在 day.slots[]).
  const todayDishes = useMemo<SupabaseDish[]>(() => {
    if (!weeklyMenu) return [];
    const day = weeklyMenu.days?.[todayIdx];
    return (day?.dishes ?? []) as SupabaseDish[];
  }, [weeklyMenu, todayIdx]);

  function toggleChecked(id: string) {
    if (swapping) return;
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    if (swapping || checkedIds.size === 0 || !weeklyMenu) return;
    setSwapping(true);
    setError(null);
    try {
      // Step 1: parseIntent (Gemini, 20/day quota) — 拿到结构化 bias.
      const bias = await parseIntent(userIntent);
      // Step 2: 全局存 bias. 后续 swapDish 写表读 ALGO_VERSION/cache_key, useWeeklyMenu
      // 下次重算时 cache 也会失效 (getIntentHash 进 cache_key). 单道 swap 不重排全周.
      saveIntentBias(bias);

      const day = weeklyMenu.days[todayIdx];
      if (!day) throw new Error(t3('Today menu not found', '今日菜单未找到', 'Hindi nakita menu ngayon'));

      // Step 3: 对每个勾选 dish 找替换. 已 swap 的 ids 累计排除, 避免连续 swap 撞同一道.
      let swapped = 0;
      const excludeIds = new Set<string>(day.dishes.map(d => d.id));
      for (let slotIdx = 0; slotIdx < day.dishes.length; slotIdx++) {
        const current = day.dishes[slotIdx];
        if (!current || !checkedIds.has(current.id)) continue;

        // 同 type 候选池, 取 limit 30 后按 bias 排分.
        const inList = `(${Array.from(excludeIds).map(id => `"${id}"`).join(',')})`;
        let query = supabase.from('dishes').select('*').limit(30);
        if (current.type) query = query.eq('type', current.type);
        if (excludeIds.size > 0) query = query.not('id', 'in', inList);
        const { data, error: qErr } = await query;
        if (qErr) throw new Error(qErr.message);
        if (!data || data.length === 0) continue;  // 该 slot 找不到候选, 跳过

        // applyIntentBias 接 baseScore=0, 让 bias 单独决定排序 (cuisine + category + tag).
        // 不复用 scoreForWeek (它依赖大量 context: imagePrefs/familyPrefs/seasonHints...),
        // 这里 quick swap, 只要 bias 命中的菜浮上来即可.
        const ranked = (data as SupabaseDish[])
          .map(d => ({ d, s: applyIntentBias(0, d as any, bias) }))
          .sort((a, b) => b.s - a.s);

        const pick = ranked[0]?.d;
        if (!pick) continue;

        await swapDish(todayIdx, slotIdx, pick);
        excludeIds.add(pick.id);
        // 同时把被换走的 current.id 加入 exclude, 避免后续 slot 又把它换回来.
        excludeIds.add(current.id);
        swapped += 1;
      }

      if (swapped === 0) {
        throw new Error(t3('No swap candidates', '暂无候选可换', 'Walang mapagpipiliang ipalit'));
      }

      // Step 4: toast + dispatch + navigate + close.
      setToast(t3(
        `Swapped ${swapped}, opening menu...`,
        `已换 ${swapped} 道, 跳菜单页...`,
        `Pinalitan ${swapped}, papunta sa menu...`,
      ));
      window.dispatchEvent(new Event('nutri-weekly-menu-changed'));
      setTimeout(() => {
        navigate('/weekly');
        onClose();
      }, 1000);
    } catch (e: any) {
      setSwapping(false);
      setError(
        e?.message
          ? String(e.message)
          : t3('Swap failed', '换菜失败', 'Nabigo'),
      );
    }
  }

  if (!open) return null;

  const checkedCount = checkedIds.size;
  const btnEnabled = checkedCount > 0 && !swapping;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:px-5"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => !swapping && onClose()}
    >
      <div
        className="w-full sm:max-w-md flex flex-col"
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px 24px 0 0',
          maxHeight: '85vh',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.40)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: '#FF5A1F', fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
            <h2 className="font-bold text-white" style={{ fontSize: 16 }}>
              {t3('AI Assistant', 'AI 助手', 'AI Katulong')}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={swapping}
            className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-label={t3('Close', '关闭', 'Isara')}
          >
            <span className="material-symbols-outlined text-white/70" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* User quote */}
          <div className="mb-3">
            <p className="text-white/40 mb-1.5" style={{ fontSize: 11 }}>
              {t3('You said:', '你说:', 'Sinabi mo:')}
            </p>
            <div
              className="rounded-2xl px-3.5 py-2.5"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p className="text-white/85" style={{ fontSize: 13, lineHeight: 1.5 }}>
                "{userIntent}"
              </p>
            </div>
          </div>

          {/* AI reply */}
          <div className="flex items-start gap-2 mb-4">
            <div
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,90,31,0.18)' }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#FF5A1F', fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
            </div>
            <p className="text-white/85" style={{ fontSize: 13, lineHeight: 1.55 }}>
              {t3(
                "Got it. I'll help you swap. Today's menu is:",
                '好的，我帮你换。今天菜单是：',
                'Okay. Tutulungan kitang ipalit. Menu ngayon:',
              )}
            </p>
          </div>

          {/* Today dish list */}
          {todayDishes.length === 0 ? (
            <p className="text-white/40 text-center py-6" style={{ fontSize: 12 }}>
              {t3('No dishes today', '今日暂无菜单', 'Walang menu ngayon')}
            </p>
          ) : (
            <div className="space-y-2">
              {todayDishes.map((d, idx) => {
                const id = d.id;
                const checked = checkedIds.has(id);
                const title = getDishTitle(d as any, language) || d.title_zh || '—';
                const img = (d.image_url || d.img || '').trim();
                return (
                  <button
                    key={`${id}-${idx}`}
                    onClick={() => toggleChecked(id)}
                    disabled={swapping}
                    className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 active:scale-[0.99] transition-all disabled:opacity-50"
                    style={{
                      background: checked ? 'rgba(255,90,31,0.10)' : 'rgba(255,255,255,0.04)',
                      border: checked
                        ? '1.5px solid rgba(255,90,31,0.60)'
                        : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {/* Checkbox */}
                    <span
                      className="material-symbols-outlined shrink-0"
                      style={{
                        fontSize: 22,
                        color: checked ? '#FF5A1F' : 'rgba(255,255,255,0.40)',
                        fontVariationSettings: checked ? "'FILL' 1" : "'FILL' 0",
                      }}
                    >
                      {checked ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    {/* Thumbnail */}
                    <div
                      className="shrink-0 rounded-lg overflow-hidden"
                      style={{
                        width: 32, height: 32,
                        background: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {img && (
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                    {/* Title */}
                    <span
                      className="flex-1 text-left text-white truncate"
                      style={{ fontSize: 13, fontWeight: 500 }}
                    >
                      {title}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Hint */}
          {todayDishes.length > 0 && (
            <p className="text-white/40 mt-4" style={{ fontSize: 11, lineHeight: 1.55 }}>
              {t3(
                'Check the ones to swap. AI will pick 1 replacement per your request.',
                '勾要换的，AI 按你说的推 1 道替换',
                'Lagyan ng check ang ipapalit. AI pipili ng 1 kapalit.',
              )}
            </p>
          )}

          {/* Error */}
          {error && (
            <div
              className="mt-3 rounded-2xl px-3 py-2"
              style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)' }}
            >
              <p style={{ fontSize: 12, color: '#FF8C8C' }}>{error}</p>
            </div>
          )}
        </div>

        {/* Sticky footer button */}
        <div
          className="px-5 py-3 shrink-0"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)',
          }}
        >
          <button
            onClick={handleConfirm}
            disabled={!btnEnabled}
            className="w-full h-14 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            style={{
              background: btnEnabled
                ? 'linear-gradient(135deg, #FF5A1F, #FF8C54)'
                : 'rgba(255,255,255,0.08)',
              color: btnEnabled ? 'white' : 'rgba(255,255,255,0.40)',
              boxShadow: btnEnabled ? '0 8px 24px rgba(255,90,31,0.32)' : 'none',
              fontSize: 14,
            }}
          >
            {swapping ? (
              <>
                <span
                  className="material-symbols-outlined animate-spin"
                  style={{ fontSize: 18 }}
                >
                  progress_activity
                </span>
                {t3('AI swapping...', 'AI 正在换菜...', 'AI nagpapalit...')}
              </>
            ) : (
              t3(
                `Confirm swap (${checkedCount} selected)`,
                `确认换菜 (已选 ${checkedCount} 道)`,
                `Kumpirmahin (${checkedCount} napili)`,
              )
            )}
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className="absolute left-1/2 z-[130] px-4 py-2.5 rounded-full font-bold pointer-events-none"
            style={{
              transform: 'translateX(-50%)',
              bottom: 100,
              background: 'rgba(0,0,0,0.92)',
              color: 'white',
              fontSize: 12.5,
              boxShadow: '0 8px 22px rgba(0,0,0,0.40)',
              maxWidth: '92%',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
