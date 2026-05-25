/**
 * IntentInputBox — TICKET-066 P0 chat 主入口统一.
 *
 * 把原 IntentRegenModal 弹窗 + Home 悬浮 chat FAB 合并为 Home/WeeklyMenu 顶部
 * 永远可见的"说话换菜单"输入框. 单一 use case: 用户说一句话 → parseIntent
 * → saveIntentBias → clear weekly_menu_* 缓存 → 派事件让 useWeeklyMenu 重算.
 *
 * 不做多轮对话 (那是 /chat ChatAgent 的活儿; 这里只走 quick-intent 单次).
 * 不写 chat session DB.
 *
 * 设计 (老板拍板):
 *   - 圆角白底输入框 (52px 高, 16px 圆角, 半透白底 + 1.5px primary 描边)
 *   - 左 ✨ AI icon (auto_awesome, 橙 #FF5A1F, 18px)
 *   - placeholder 三语
 *   - 右"发送"小按钮 (橙底)
 *   - 下方 6 个横滑 chip (overflow-x-auto)
 *   - 成功/失败 toast (3 秒自动消失)
 */

import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { parseIntent, saveIntentBias } from '../lib/intentBias';
import { extractClientOverrides, applyHeadcountOverride } from '../lib/intentClientOverrides';

interface Props {
  /** 提交成功后回调 (e.g. 父组件重算菜单 / 关 modal). */
  onSuccess?: () => void;
  /** 风格变体 — home: 白底浅描边 (浅色 Home bg); weekly: 半透白 (深色 WeeklyMenu bg). */
  variant?: 'home' | 'weekly';
}

interface ChipDef {
  en: string;
  zh: string;
  tl: string;
}

const QUICK_CHIPS: ChipDef[] = [
  { en: 'More northwest',          zh: '多西北菜',     tl: 'Higit pang Hilagang-kanluran' },
  { en: 'Less spicy',              zh: '少辣',         tl: 'Hindi maanghang' },
  { en: 'Light & gentle',          zh: '清淡养胃',     tl: 'Banayad' },
  { en: 'More seafood',            zh: '多海鲜',       tl: 'Higit pang seafood' },
  { en: 'Muscle gain',             zh: '增肌期',       tl: 'Pagtaas ng kalamnan' },
  { en: 'Cutting',                 zh: '减脂期',       tl: 'Pagbawas taba' },
];

export default function IntentInputBox({ onSuccess, variant = 'home' }: Props) {
  const { t3 } = useLanguage();
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const isWeekly = variant === 'weekly';

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function submit(payload: string) {
    const raw = payload.trim();
    if (!raw) return;
    setLoading(true);
    try {
      // Client-side hard overrides first (headcount / meal scope) — same as
      // the legacy IntentRegenModal flow. These are deterministic, no quota.
      const overrides = extractClientOverrides(raw);
      if (overrides.headcount && overrides.headcount > 0) {
        applyHeadcountOverride(overrides.headcount);
      }

      // Then ask Gemini (via edge fn) for soft preference bias.
      const bias = await parseIntent(raw);
      saveIntentBias(bias);

      // Invalidate weekly_menu_* cache and ping listeners; useWeeklyMenu
      // will pick up nutri-prefs-changed and regenerate.
      Object.keys(localStorage)
        .filter(k => k.startsWith('weekly_menu_'))
        .forEach(k => localStorage.removeItem(k));
      window.dispatchEvent(new Event('nutri-prefs-changed'));

      setText('');
      setLoading(false);
      showToast(
        'ok',
        t3('Adjusted to your preference', '已按你的偏好调整', 'Inayos ayon sa iyong gusto'),
      );
      onSuccess?.();
    } catch (e: any) {
      setLoading(false);
      showToast(
        'err',
        e?.message
          ? String(e.message)
          : t3('Failed, try again', '解析失败请重试', 'Nabigo, ulit ulitin'),
      );
    }
  }

  function handleChipTap(chip: ChipDef) {
    if (loading) return;
    submit(t3(chip.en, chip.zh, chip.tl));
  }

  function handleSendTap() {
    if (loading || !text.trim()) return;
    submit(text);
  }

  // Color/border tokens differ between home (light bg) + weekly (dark bg) so the
  // input still reads as "an input box" against both backgrounds.
  const wrapStyle = isWeekly
    ? {
        background: 'rgba(255,255,255,0.07)',
        border:     '1.5px solid rgba(255,90,31,0.40)',
      }
    : {
        background: 'rgba(255,255,255,0.95)',
        border:     '1.5px solid rgba(255,90,31,0.30)',
      };

  const inputTextColor = isWeekly ? 'rgba(255,255,255,0.95)' : '#1a1a1a';
  const placeholderClass = isWeekly
    ? 'placeholder:text-white/40'
    : 'placeholder:text-black/35';

  const chipStyle = isWeekly
    ? {
        background: 'rgba(255,255,255,0.07)',
        border:     '1px solid rgba(255,90,31,0.35)',
        color:      'rgba(255,255,255,0.85)',
      }
    : {
        background: 'rgba(255,255,255,0.92)',
        border:     '1px solid rgba(255,90,31,0.22)',
        color:      '#1a1a1a',
      };

  return (
    <div className="relative w-full">
      {/* Input row */}
      <div
        className="flex items-center gap-2 px-3"
        style={{
          height: 52,
          borderRadius: 16,
          ...wrapStyle,
          boxShadow: isWeekly ? 'none' : '0 6px 20px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <span
          className="material-symbols-outlined shrink-0"
          style={{
            fontSize: 18,
            color: '#FF5A1F',
            fontVariationSettings: "'FILL' 1",
          }}
        >
          auto_awesome
        </span>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={loading}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendTap();
            }
          }}
          placeholder={t3(
            "Tell me what you'd like to eat...",
            '说说你想吃什么...',
            'Sabihin kung ano gusto mo kainin...',
          )}
          className={`flex-1 min-w-0 bg-transparent outline-none ${placeholderClass} disabled:opacity-50`}
          style={{
            fontSize: 14,
            color: inputTextColor,
          }}
        />
        <button
          onClick={handleSendTap}
          disabled={loading || !text.trim()}
          className="shrink-0 px-3 h-9 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all disabled:opacity-40"
          style={{
            background: '#FF5A1F',
            color: 'white',
            fontSize: 12,
            minWidth: 56,
          }}
          aria-label={t3('Send', '发送', 'Ipadala')}
        >
          {loading ? (
            <span
              className="material-symbols-outlined animate-spin"
              style={{ fontSize: 16 }}
            >
              progress_activity
            </span>
          ) : (
            t3('Send', '发送', 'Ipadala')
          )}
        </button>
      </div>

      {/* Quick chips — horizontal scroll, no wrap */}
      <div
        className="flex gap-2 mt-2 overflow-x-auto"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {QUICK_CHIPS.map(chip => (
          <button
            key={chip.en}
            onClick={() => handleChipTap(chip)}
            disabled={loading}
            className="shrink-0 px-3 py-1.5 rounded-full font-semibold active:scale-95 transition-all disabled:opacity-40"
            style={{
              ...chipStyle,
              fontSize: 11.5,
            }}
          >
            {t3(chip.en, chip.zh, chip.tl)}
          </button>
        ))}
      </div>

      {/* Toast (black bg / red bg) — absolute bottom, 3s auto-dismiss */}
      {toast && (
        <div
          className="absolute left-1/2 z-50 px-4 py-2.5 rounded-full font-bold pointer-events-none"
          style={{
            transform: 'translateX(-50%)',
            bottom: -52,
            background: toast.kind === 'ok' ? 'rgba(0,0,0,0.88)' : 'rgba(220,38,38,0.95)',
            color: 'white',
            fontSize: 12.5,
            boxShadow: '0 8px 22px rgba(0,0,0,0.20)',
            maxWidth: '92%',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
