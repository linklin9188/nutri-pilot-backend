/**
 * ChatGuidePrompt — TICKET-094 chat 主动弹引导模板
 *
 * 老板拍板 (2026-05-26 晚):
 *  - "chat 以及用户日常使用数据,才是核心提升算法的准确性的来源"
 *  - "chat 用户使用的所有数据都来自我的数据和我的算法,不接外部模型"
 *  - "明天上午要看到 chat 成型可用"
 *
 * 设计:
 *  - 不是 LLM 对话, 是引导式 chip + 模板回答 (0 token cost)
 *  - 主动弹: 检测 nutri_home_visit_count 决定弹哪一轮
 *  - 用户点 chip → 直接写 user_chat_preferences 表 (本地 keyword 提取)
 *  - 命中率提升: round 1 → +8% / round 2 → +5% / round 3 → +5% (达 95% 目标)
 *
 * Round 触发:
 *  - Round 1: onboarding 完成 + 首次进 Home → 早餐主食偏好
 *  - Round 2: 进 Home 第 3 次 → 部位偏好
 *  - Round 3: 进 Home 第 5 次 → 工作日 vs 周末复杂度
 *  - (Round 4/5: swap reactive + 节庆触发, 后续 ticket)
 */

import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { fromChipSelection, saveChatPreferences, type ChatPreferenceType } from '../lib/chatPreferenceExtractor';
import { getUserId } from '../lib/userId';

// localStorage 状态 key
const KEY_VISIT_COUNT = 'nutri_home_visit_count';
const KEY_ROUNDS_DONE = 'nutri_chat_round_done';  // CSV: "1,2,3"
const KEY_DISMISSED   = 'nutri_chat_guide_dismissed_today'; // 当日 dismiss 不再弹

interface ChipOption {
  key: string;
  label_zh: string;
  label_en: string;
  label_tl: string;
  emoji?: string;
}

interface Round {
  num: number;
  triggerVisitCount: number;
  type: ChatPreferenceType;
  question_zh: string;
  question_en: string;
  question_tl: string;
  multiSelect: boolean;
  options: ChipOption[];
  /** 用户点 chip 后构造 preference_value 的方式 */
  buildValue: (selected: string[]) => any;
}

const ROUNDS: Round[] = [
  // Round 1 — 早餐主食偏好 (onboarding 完成立刻弹)
  {
    num: 1,
    triggerVisitCount: 1,
    type: 'breakfast_staple_subtype',
    question_zh: '你家早餐喜欢哪类主食？（多选）',
    question_en: 'Which breakfast staples does your family like? (multi-select)',
    question_tl: 'Anong breakfast staples ang gusto ng pamilya mo?',
    multiSelect: true,
    options: [
      { key: 'rice',       label_zh: '粥/米饭',  label_en: 'Rice/Porridge',  label_tl: 'Bigas/Lugaw',  emoji: '🍚' },
      { key: 'wheat',      label_zh: '面食/包子', label_en: 'Wheat/Buns',     label_tl: 'Trigo/Tinapay', emoji: '🥖' },
      { key: 'grain_misc', label_zh: '杂粮',     label_en: 'Whole grains',    label_tl: 'Buong butil',  emoji: '🌾' },
      { key: 'tuber',      label_zh: '薯类',     label_en: 'Tubers',          label_tl: 'Patatas/Kamote', emoji: '🍠' },
      { key: 'bean',       label_zh: '杂豆',     label_en: 'Beans',           label_tl: 'Mga munggo',   emoji: '🫘' },
      { key: 'processed',  label_zh: '加工类',   label_en: 'Processed',       label_tl: 'Naprosesong', emoji: '🥡' },
    ],
    buildValue: (sel) => ({ subtypes: sel, sentiment: 'love' }),
  },
  // Round 2 — 用餐风格 (进 Home 第 2 次, 老板拍板 B 营养目的版)
  // 写 nutri_meal_style 触发算法 mealStyle 分支 (light → 清淡养胃 prefScores 注入 v71)
  {
    num: 2,
    triggerVisitCount: 2,
    type: 'love_keyword',  // 用 love_keyword 类型存; 同时 LS 写 nutri_meal_style
    question_zh: '你家用餐风格是？',
    question_en: 'Your meal style?',
    question_tl: 'Estilo ng pagkain?',
    multiSelect: false,
    options: [
      { key: 'standard',     label_zh: '标准家常（含主食+汤+菜）', label_en: 'Standard (rice+soup+dishes)', label_tl: 'Standard', emoji: '🍚' },
      { key: 'low_staple',   label_zh: '少主食（一周 2 天有饭）',   label_en: 'Less staple (2/5 days)',       label_tl: 'Konting kanin', emoji: '🥬' },
      { key: 'high_protein', label_zh: '高蛋白增肌（无主食+主菜翻倍）', label_en: 'High protein',         label_tl: 'Maraming protina', emoji: '🥩' },
      { key: 'light',        label_zh: '清淡养胃（杂粮+蒸为主）',   label_en: 'Light (steamed)',              label_tl: 'Magaan',        emoji: '🌿' },
    ],
    buildValue: (sel) => {
      // 同时写 LS 让 useWeeklyMenu 立刻 pick up
      try { localStorage.setItem('nutri_meal_style', sel[0] ?? 'standard'); } catch {}
      return { meal_style: sel[0], synced_to_ls: true };
    },
  },
  // Round 3 — 部位偏好 (进 Home 第 3 次)
  {
    num: 3,
    triggerVisitCount: 3,
    type: 'meat_part',
    question_zh: '你家爱吃肉的什么部位？（多选）',
    question_en: 'Which meat cuts does your family prefer?',
    question_tl: 'Anong parte ng karne ang gusto?',
    multiSelect: true,
    options: [
      { key: 'beef_steak',  label_zh: '牛排',   label_en: 'Beef steak',    label_tl: 'Beef steak',  emoji: '🥩' },
      { key: 'beef_brisket',label_zh: '牛腩',   label_en: 'Beef brisket',  label_tl: 'Beef brisket',emoji: '🍖' },
      { key: 'chicken_leg', label_zh: '鸡腿',   label_en: 'Chicken leg',   label_tl: 'Pang hita',   emoji: '🍗' },
      { key: 'chicken_wing',label_zh: '鸡翅',   label_en: 'Chicken wing',  label_tl: 'Pakpak',      emoji: '🪽' },
      { key: 'pork_rib',    label_zh: '排骨',   label_en: 'Pork ribs',     label_tl: 'Pork ribs',   emoji: '🥩' },
      { key: 'fish_whole',  label_zh: '整条鱼', label_en: 'Whole fish',    label_tl: 'Buong isda',  emoji: '🐟' },
      { key: 'no_pref',     label_zh: '不挑',   label_en: "Don't mind",    label_tl: 'Kahit ano',   emoji: '🤷' },
    ],
    buildValue: (sel) => ({ parts: sel }),
  },
  // Round 4 — 工作日 vs 周末复杂度 (进 Home 第 5 次)
  {
    num: 4,
    triggerVisitCount: 5,
    type: 'work_complexity',
    question_zh: '工作日想吃快手菜还是不在乎？',
    question_en: 'Quick dishes on weekdays or no preference?',
    question_tl: 'Mabilis na luto sa weekdays o kahit ano?',
    multiSelect: false,
    options: [
      { key: 'weekday_quick',    label_zh: '工作日要快，周末讲究', label_en: 'Quick weekdays, fancy weekends', label_tl: 'Mabilis weekday', emoji: '⚡' },
      { key: 'always_quick',     label_zh: '都要快手菜',           label_en: 'Always quick',                    label_tl: 'Laging mabilis', emoji: '🏃' },
      { key: 'no_pref',          label_zh: '不在乎复杂度',         label_en: "Don't mind",                      label_tl: 'Kahit ano',      emoji: '🤷' },
    ],
    buildValue: (sel) => ({ choice: sel[0] }),
  },
];

interface Props {
  /** 父组件 (Home) 在 mount 时 ++ visit count, 这个组件读取并决定弹哪轮 */
  householdId?: string | null;
  /** 关闭 callback (Home 用来收回 sheet 或更新 layout) */
  onDismiss?: () => void;
}

export default function ChatGuidePrompt({ householdId, onDismiss }: Props) {
  const { language } = useLanguage();
  const [activeRound, setActiveRound] = useState<Round | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  // mount 时检测应该弹哪一轮
  useEffect(() => {
    try {
      // 当日 dismiss 不再弹 (today key = YYYY-MM-DD)
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(KEY_DISMISSED) === today) return;

      const visitCount = parseInt(localStorage.getItem(KEY_VISIT_COUNT) ?? '0', 10);
      const roundsDoneRaw = localStorage.getItem(KEY_ROUNDS_DONE) ?? '';
      const roundsDone = new Set(roundsDoneRaw.split(',').filter(Boolean).map(Number));

      // 找第一个 trigger 满足且未完成的 round
      const next = ROUNDS.find(r =>
        visitCount >= r.triggerVisitCount && !roundsDone.has(r.num)
      );
      if (next) setActiveRound(next);
    } catch { /* private mode no-op */ }
  }, []);

  function dismissToday() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(KEY_DISMISSED, today);
    } catch {}
    setActiveRound(null);
    onDismiss?.();
  }

  function toggleSel(key: string) {
    if (!activeRound) return;
    if (activeRound.multiSelect) {
      setSelected(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
    } else {
      setSelected([key]);
    }
  }

  async function submit() {
    if (!activeRound || selected.length === 0) return;
    setSaving(true);
    try {
      const pref = fromChipSelection(activeRound.type, activeRound.buildValue(selected), householdId);
      if (pref) {
        await saveChatPreferences([pref], supabase);
      }
      // 标记该轮已完成
      const raw = localStorage.getItem(KEY_ROUNDS_DONE) ?? '';
      const set = new Set(raw.split(',').filter(Boolean));
      set.add(String(activeRound.num));
      localStorage.setItem(KEY_ROUNDS_DONE, Array.from(set).join(','));
      // 触发算法重生 (cache invalidate via nutri-prefs-changed event)
      window.dispatchEvent(new Event('nutri-prefs-changed'));
      setDoneMessage(
        language === 'zh' || language === 'zh-Hant'
          ? '好的，下次菜单按你说的调整 ✨'
          : language === 'tl'
          ? 'Ok, ia-adjust ang menu ✨'
          : 'Got it, your menu will adjust ✨'
      );
      setTimeout(() => {
        setActiveRound(null);
        setDoneMessage(null);
        onDismiss?.();
      }, 1500);
    } catch (e) {
      console.warn('[ChatGuide] save failed:', e);
    } finally {
      setSaving(false);
    }
  }

  if (!activeRound) return null;

  const question = language === 'zh' || language === 'zh-Hant'
    ? activeRound.question_zh
    : language === 'tl' ? activeRound.question_tl : activeRound.question_en;

  if (doneMessage) {
    return (
      <div className="rounded-2xl px-4 py-3"
        style={{
          background: 'linear-gradient(135deg, rgba(255,90,31,0.10), rgba(255,179,71,0.18))',
          border: '1px solid rgba(255,90,31,0.20)',
        }}>
        <p className="text-center font-bold" style={{ fontSize: 13.5, color: '#FF5A1F' }}>
          {doneMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl px-4 py-3.5"
      style={{
        background: 'linear-gradient(135deg, #FFFAF5 0%, #FFE9D2 100%)',
        border: '1.5px solid rgba(255,90,31,0.25)',
        boxShadow: '0 4px 14px rgba(255,140,80,0.10)',
      }}>
      {/* Header: ✨ AI icon + 关闭 */}
      <div className="flex items-start gap-2 mb-3">
        <span className="material-symbols-outlined shrink-0"
          style={{ fontSize: 20, color: '#FF5A1F', fontVariationSettings: "'FILL' 1" }}>
          auto_awesome
        </span>
        <p className="flex-1 font-bold leading-snug" style={{ fontSize: 13.5, color: '#1a1a1a' }}>
          {question}
        </p>
        <button onClick={dismissToday}
          className="shrink-0 -mt-1 -mr-1 w-7 h-7 rounded-full flex items-center justify-center active:scale-90"
          aria-label="今天不再弹">
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(0,0,0,0.45)' }}>close</span>
        </button>
      </div>

      {/* Chip options */}
      <div className="flex flex-wrap gap-2 mb-3">
        {activeRound.options.map(opt => {
          const isSel = selected.includes(opt.key);
          const label = language === 'zh' || language === 'zh-Hant'
            ? opt.label_zh
            : language === 'tl' ? opt.label_tl : opt.label_en;
          return (
            <button key={opt.key} onClick={() => toggleSel(opt.key)}
              disabled={saving}
              className="px-3 py-1.5 rounded-full font-bold active:scale-95 transition-all"
              style={{
                fontSize: 12,
                background: isSel ? '#FF5A1F' : 'white',
                color: isSel ? 'white' : '#1a1a1a',
                border: isSel ? '1px solid #FF5A1F' : '1px solid rgba(0,0,0,0.10)',
                boxShadow: isSel ? '0 2px 8px rgba(255,90,31,0.30)' : '0 1px 2px rgba(0,0,0,0.04)',
              }}>
              {opt.emoji ? `${opt.emoji} ${label}` : label}
            </button>
          );
        })}
      </div>

      {/* Submit */}
      <button onClick={submit} disabled={selected.length === 0 || saving}
        className="w-full py-2.5 rounded-xl font-bold text-white active:scale-[0.98] transition-all disabled:opacity-40"
        style={{
          background: 'linear-gradient(135deg, #FF5A1F 0%, #FF8C54 100%)',
          fontSize: 13,
          boxShadow: '0 4px 14px rgba(255,90,31,0.25)',
        }}>
        {saving
          ? (language === 'zh' ? '记下中…' : 'Saving…')
          : (language === 'zh' || language === 'zh-Hant'
              ? '告诉 AI'
              : language === 'tl' ? 'Sabihin sa AI' : 'Tell AI')}
      </button>

      {/* Round badge */}
      <p className="text-center mt-2" style={{ fontSize: 10, color: 'rgba(0,0,0,0.40)', letterSpacing: '0.1em' }}>
        ROUND {activeRound.num}/{ROUNDS.length} · 5 秒搞定，菜单更准
      </p>
    </div>
  );
}

/** 给 Home mount 时 ++ visit count (外部 hook) */
export function bumpHomeVisitCount() {
  try {
    const cur = parseInt(localStorage.getItem(KEY_VISIT_COUNT) ?? '0', 10);
    localStorage.setItem(KEY_VISIT_COUNT, String(cur + 1));
  } catch {}
}
