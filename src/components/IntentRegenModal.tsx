/**
 * IntentRegenModal — text-in / regenerated-menu-out modal.
 *
 * 2 clicks total: open this modal, then click 生成. Everything between
 * (Gemini transform + cache invalidation + week regen) is automatic.
 *
 * On success we clear the weekly-menu cache and dispatch the bias-changed
 * event; useWeeklyMenu's listener picks it up and regenerates immediately.
 */

import { useState } from 'react';
import { parseIntent, saveIntentBias } from '../lib/intentBias';

interface Props {
  open:     boolean;
  onClose:  () => void;
}

const QUICK_SUGGESTIONS = [
  '这周多吃海鲜',
  '孩子怕辣，少点辣的',
  '想要清淡养胃',
  '老人多一点汤水',
  '增肌期，多蛋白少碳水',
  '减脂期，多蔬菜少油',
];

export default function IntentRegenModal({ open, onClose }: Props) {
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!open) return null;

  async function handleGenerate() {
    setError(null);
    if (!text.trim()) { setError('请输入你想要的菜单偏好'); return; }
    setLoading(true);
    try {
      const bias = await parseIntent(text);
      saveIntentBias(bias);
      // Clear the local weekly_menu cache; useWeeklyMenu listens to
      // nutri-intent-bias-changed and will regenerate.
      Object.keys(localStorage).filter(k => k.startsWith('weekly_menu_')).forEach(k => localStorage.removeItem(k));
      window.dispatchEvent(new Event('nutri-prefs-changed'));
      setLoading(false);
      onClose();
    } catch (e: any) {
      setLoading(false);
      setError(e?.message ?? '生成失败，请稍后再试');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-5"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
        style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 20 }}>✨</span>
            <h2 className="font-bold text-white" style={{ fontSize: 16 }}>重新生成菜单</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <span className="material-symbols-outlined text-white/70" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <p className="text-white/50 mb-4" style={{ fontSize: 12, lineHeight: 1.5 }}>
          告诉我你想要什么菜单，比如：「这周多吃海鲜，孩子怕辣，老人想要清淡」
        </p>

        {/* Text input */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={loading}
          placeholder="多海鲜、少辣、孩子友好、老人清淡…"
          className="w-full rounded-2xl px-4 py-3 text-white placeholder:text-white/30 outline-none disabled:opacity-50"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            fontSize: 14, minHeight: 100, resize: 'none',
          }}
        />

        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-2 mt-3">
          {QUICK_SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setText(text ? `${text}，${s}` : s)}
              disabled={loading}
              className="px-3 py-1.5 rounded-full disabled:opacity-30 transition-all active:scale-95"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.65)', fontSize: 11,
              }}
            >
              + {s}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-2xl px-3 py-2"
            style={{ background: 'rgba(255,90,31,0.10)', border: '1px solid rgba(255,90,31,0.25)' }}>
            <p style={{ fontSize: 12, color: '#FF8C54' }}>⚠️ {error}</p>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || !text.trim()}
          className="w-full h-12 rounded-2xl font-bold text-white flex items-center justify-center gap-2 mt-4 transition-all active:scale-[0.98] disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
            boxShadow: '0 8px 24px rgba(255,90,31,0.30)',
            fontSize: 14,
          }}
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>progress_activity</span>
              AI 正在改菜单…
            </>
          ) : (
            <>
              <span style={{ fontSize: 16 }}>✨</span>
              生成新菜单
            </>
          )}
        </button>
      </div>
    </div>
  );
}
