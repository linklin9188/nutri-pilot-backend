/**
 * ChatFloatingBubble — TICKET-095 Home 顶部 3 块 (greeting + ChatGuide +
 * IntentInput) 收进右下角浮窗.
 *
 * 老板真测 5/27: "主页尽量清晰 重点在今日菜单上 / 把早安以上的部分都放在一个
 * AI CHAT 的浮窗里 / CHAT 里首先应该是切换语言看用户想用什么语言来对话".
 *
 * 设计:
 * - 右下角圆形 FAB (✨ icon, 56px), 不影响 BottomTabBar
 * - 未读 badge 红点 = ChatGuidePrompt 有待弹 round 未完成 (主动学偏好提示)
 * - 点击展开 bottom sheet, 内嵌:
 *   1. 顶部语言切换 chip (zh/zh-Hant/en/tl/id) — 老板原话第 1 件事
 *   2. Greeting (Hi {nickname} + 头像)
 *   3. ChatGuidePrompt (chip 引导主动学)
 *   4. IntentInputBox (聊天输入 + 3 chip 快捷)
 * - Backdrop 半透 + 点外关闭
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import ChatGuidePrompt from './ChatGuidePrompt';
import IntentInputBox from './IntentInputBox';

// chat-guide rounds 状态 key (跟 ChatGuidePrompt 共享, 用于未读 badge)
const KEY_VISIT_COUNT = 'nutri_home_visit_count';
const KEY_ROUNDS_DONE = 'nutri_chat_round_done';
const KEY_DISMISSED   = 'nutri_chat_guide_dismissed_today';
// 4 chat rounds — 跟 ChatGuidePrompt.ROUNDS 长度一致 (visit count thresholds 1/2/3/5)
const ROUND_TRIGGER_VISITS = [1, 2, 3, 5];

interface Props {
  /** household id 给 ChatGuidePrompt 用 */
  householdId?: string | null;
  /** swap modal 触发 callback 给 IntentInputBox 用 */
  onTriggerSwap?: (intent: string) => void;
  /** 用户头像 + 名字 (显示在 sheet 顶部 greeting) */
  displayName?: string;
  avatarUrl?: string | null;
}

export default function ChatFloatingBubble({
  householdId,
  onTriggerSwap,
  displayName = '',
  avatarUrl = null,
}: Props) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  // 检测是否有待弹 round (mount + open 变化时重算)
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(KEY_DISMISSED) === today) {
        setHasUnread(false);
        return;
      }
      const visitCount = parseInt(localStorage.getItem(KEY_VISIT_COUNT) ?? '0', 10);
      const roundsDone = new Set(
        (localStorage.getItem(KEY_ROUNDS_DONE) ?? '').split(',').filter(Boolean).map(Number)
      );
      // 有任一 round 未做且 visit count 已达 trigger → 显未读
      const has = ROUND_TRIGGER_VISITS.some(
        (trig, idx) => visitCount >= trig && !roundsDone.has(idx + 1)
      );
      setHasUnread(has);
    } catch { /* private mode */ }
  }, [open]);

  // 语言切换按 role 限制 (跟 Home 之前的逻辑一致)
  const langOptions: Array<{ key: 'zh' | 'zh-Hant' | 'en' | 'tl' | 'id'; label: string }> = (() => {
    const role = typeof window !== 'undefined' ? localStorage.getItem('nutri_role') : null;
    if (role === 'helper') {
      return [
        { key: 'en', label: 'EN' },
        { key: 'tl', label: 'Tagalog' },
        { key: 'id', label: 'Bahasa' },
      ];
    }
    return [
      { key: 'zh',      label: '简体' },
      { key: 'zh-Hant', label: '繁體' },
      { key: 'en',      label: 'EN'   },
    ];
  })();

  return (
    <>
      {/* FAB — 固定右下角 (BottomTabBar 上方) */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed z-[90] active:scale-90 transition-transform"
        style={{
          right: 16,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',  // BottomTabBar 高度 ~72px + 12px gap
          width: 56,
          height: 56,
          borderRadius: 28,
          background: 'linear-gradient(135deg, #FF5A1F 0%, #FF8C54 100%)',
          boxShadow: '0 8px 24px rgba(255,90,31,0.40), 0 2px 6px rgba(0,0,0,0.10)',
          border: 'none',
          color: 'white',
        }}
        aria-label={t('Chat with AI', '跟 AI 聊天')}
      >
        <span className="material-symbols-outlined" style={{
          fontSize: 28, color: 'white', fontVariationSettings: "'FILL' 1",
        }}>
          {open ? 'close' : 'auto_awesome'}
        </span>
        {/* 未读红点 */}
        {!open && hasUnread && (
          <span
            className="absolute"
            style={{
              top: 6, right: 6,
              width: 12, height: 12, borderRadius: 6,
              background: '#FF3B30',
              border: '2px solid white',
              boxShadow: '0 0 0 1px rgba(255,59,48,0.30)',
              animation: 'pulse 2s ease-in-out infinite',
            }}
            aria-label="有新提示"
          />
        )}
      </button>

      {/* Bottom sheet */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100]"
              style={{ background: 'rgba(0,0,0,0.40)' }}
              onClick={() => setOpen(false)}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed left-0 right-0 bottom-0 z-[101] max-w-md mx-auto rounded-t-3xl flex flex-col"
              style={{
                background: '#FFFAF5',
                paddingBottom: 'env(safe-area-inset-bottom, 16px)',
                maxHeight: '85vh',
                boxShadow: '0 -20px 60px rgba(0,0,0,0.20)',
              }}
            >
              {/* Header: drag handle + title + close */}
              <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-black/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{
                    fontSize: 20, color: '#FF5A1F', fontVariationSettings: "'FILL' 1",
                  }}>auto_awesome</span>
                  <p className="font-bold" style={{ fontSize: 15, color: '#1a1a1a' }}>
                    {t('AI Assistant', 'AI 小助手')}
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                  style={{ background: 'rgba(0,0,0,0.05)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close</span>
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-3">
                {/* 1. 语言切换 chip — 老板拍板 sheet 内第一项 */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1"
                    style={{ color: 'rgba(0,0,0,0.42)', letterSpacing: '0.10em' }}>
                    {t('Language', '语言')}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {langOptions.map(({ key, label }) => {
                      const active = key === language;
                      return (
                        <button
                          key={key}
                          onClick={() => setLanguage(key)}
                          className="px-3 py-2 rounded-xl font-bold active:scale-95 transition-all"
                          style={{
                            background: active ? '#FF5A1F' : 'white',
                            color: active ? 'white' : '#1a1a1a',
                            fontSize: 12,
                            border: active ? '1px solid #FF5A1F' : '1px solid rgba(0,0,0,0.08)',
                            boxShadow: active ? '0 2px 8px rgba(255,90,31,0.30)' : '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Greeting (Hi {nickname} + 头像) */}
                <div
                  className="flex items-center gap-3 p-3 rounded-2xl active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => { setOpen(false); navigate('/settings'); }}
                  style={{
                    background: 'white',
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt=""
                      className="rounded-full object-cover"
                      style={{ width: 40, height: 40, border: '1.5px solid #FF5A1F' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div
                      className="rounded-full flex items-center justify-center font-bold"
                      style={{
                        width: 40, height: 40,
                        background: 'linear-gradient(135deg, #FF5A1F, #FFB347)',
                        color: '#fff', fontSize: 16,
                      }}
                    >
                      {(displayName.trim().charAt(0) || 'U').toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold" style={{ fontSize: 14, color: '#1a1a1a' }}>
                      {t('Hi, ', '你好, ')}
                      <span style={{ color: '#FF5A1F' }}>
                        {displayName.trim() || t('friend', '朋友')}
                      </span>
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
                      {t('Tap to edit profile', '点击修改资料')}
                    </p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(0,0,0,0.30)' }}>
                    chevron_right
                  </span>
                </div>

                {/* 3. ChatGuidePrompt (主动 chip 引导) */}
                <ChatGuidePrompt householdId={householdId} />

                {/* 4. IntentInputBox (聊天输入 + 3 chip) */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2 px-1"
                    style={{ color: 'rgba(0,0,0,0.42)', letterSpacing: '0.10em' }}>
                    {t('Tell AI', '告诉 AI 想吃什么')}
                  </p>
                  <IntentInputBox
                    variant="home"
                    onTriggerSwap={(intent) => {
                      setOpen(false);
                      onTriggerSwap?.(intent);
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* pulse 动画 (FAB 未读红点用) */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
        }
      `}</style>
    </>
  );
}
