/**
 * IntentInputBox — TICKET-066 P0 chat 主入口统一 (TICKET-069 P0 改为弹对话窗触发器).
 *
 * Home/WeeklyMenu 顶部"说话换菜单"输入框. 不再立即重排; 改为触发 onTriggerSwap →
 * 父组件打开 ChatSwapModal → 用户勾选今日要换的菜 → AI 按 bias 换.
 *
 * TICKET-069 老板真测 #14 拍板 1+A:
 *   - chip 改回 6 个中性 (无菜系名), 不再"多西北菜"暗示
 *   - 不再 parseIntent → saveIntentBias → clear cache → 重排; 输入只是"想说什么"
 *   - 弹 ChatSwapModal: 用户在弹窗里看今天菜单 + 勾要换的菜
 *   - AI 按 intent 直接选 1 道换, 不让用户 3 选 1
 *
 * 不写 chat session DB (这是 quick swap, 不是多轮对话).
 *
 * 设计 (老板拍板):
 *   - 圆角白底输入框 (52px 高, 16px 圆角, 半透白底 + 1.5px primary 描边)
 *   - 左 ✨ AI icon (auto_awesome, 橙 #FF5A1F, 18px)
 *   - placeholder 三语
 *   - 右"发送"小按钮 (橙底)
 *   - 下方 6 个横滑 chip (overflow-x-auto)
 */

import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  /**
   * TICKET-069: 用户提交输入或点 chip → 父组件接此回调 → 打开 ChatSwapModal.
   * userIntent 是原始用户文本 (chip 已按当前语言映射成 zh/en/tl 一句话).
   */
  onTriggerSwap?: (userIntent: string) => void;
  /** 风格变体 — home: 白底浅描边 (浅色 Home bg); weekly: 半透白 (深色 WeeklyMenu bg). */
  variant?: 'home' | 'weekly';
}

interface ChipDef {
  en: string;
  zh: string;
  tl: string;
}

// TICKET-069: 6 个中性 chip (无菜系名). 复用 IntentRegenModal QUICK_SUGGESTIONS 原版三语化.
// 老板拍板"chip 不要偏向" → 之前的"多西北菜 / 少辣 / 清淡养胃 / 多海鲜 / 增肌期 / 减脂期"里
// "多西北菜"是菜系偏向, 老板已 memory 标 (feedback_no_default_cuisine_bias.md).
const QUICK_CHIPS: ChipDef[] = [
  { en: 'Eat more seafood this week',          zh: '这周多吃海鲜',         tl: 'Higit pang seafood ngayong linggo' },
  { en: 'Kids dislike spicy, less spicy',      zh: '孩子怕辣，少点辣的',   tl: 'Hindi maanghang para sa bata' },
  { en: 'Light and gentle on stomach',         zh: '想要清淡养胃',         tl: 'Banayad at maingat sa tiyan' },
  { en: 'More soup for the elderly',           zh: '老人多一点汤水',       tl: 'Higit pang sabaw para sa matatanda' },
  { en: 'Muscle gain: more protein, less carb', zh: '增肌期，多蛋白少碳水', tl: 'Pagtaas ng kalamnan: higit pang protina' },
  { en: 'Cutting: more veg, less oil',         zh: '减脂期，多蔬菜少油',   tl: 'Pagbawas taba: higit pang gulay' },
];

export default function IntentInputBox({ onTriggerSwap, variant = 'home' }: Props) {
  const { t3 } = useLanguage();
  const [text, setText] = useState('');

  const isWeekly = variant === 'weekly';

  function submit(payload: string) {
    const raw = payload.trim();
    if (!raw) return;
    // TICKET-069: 不再 parseIntent 立即重排. 仅 trigger 父组件开弹窗.
    onTriggerSwap?.(raw);
    setText('');
  }

  function handleChipTap(chip: ChipDef) {
    submit(t3(chip.en, chip.zh, chip.tl));
  }

  function handleSendTap() {
    if (!text.trim()) return;
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
          className={`flex-1 min-w-0 bg-transparent outline-none ${placeholderClass}`}
          style={{
            fontSize: 14,
            color: inputTextColor,
          }}
        />
        <button
          onClick={handleSendTap}
          disabled={!text.trim()}
          className="shrink-0 px-3 h-9 rounded-xl font-bold flex items-center justify-center active:scale-95 transition-all disabled:opacity-40"
          style={{
            background: '#FF5A1F',
            color: 'white',
            fontSize: 12,
            minWidth: 56,
          }}
          aria-label={t3('Send', '发送', 'Ipadala')}
        >
          {t3('Send', '发送', 'Ipadala')}
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
            className="shrink-0 px-3 py-1.5 rounded-full font-semibold active:scale-95 transition-all"
            style={{
              ...chipStyle,
              fontSize: 11.5,
              whiteSpace: 'nowrap',
            }}
          >
            {t3(chip.en, chip.zh, chip.tl)}
          </button>
        ))}
      </div>
    </div>
  );
}
