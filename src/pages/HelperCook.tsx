import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { type CookStep } from "../hooks/useSupabaseMenu";
import { useLanguage } from "../contexts/LanguageContext";
import { getUserId } from "../lib/userId";
import { getDishTitle } from "../lib/dishTitleI18n";
import HelperTabBar from "../components/HelperTabBar";

interface DishWithCook {
  id: string;
  title_zh: string;
  title_zh_hant?: string;
  title_en?: string;
  image_url?: string;
  cook_steps_json?: CookStep[] | null;
  // UI 015 §K — Database 012 §B 添加的 3 列。Backend 011 ship 后约 500-600 道菜
  // 灌入 video_url；其他菜 NULL → 显示 "Tutorial coming soon" 灰色占位。
  video_url?: string | null;
  video_lang?: string | null;
  video_platform?: string | null;
}

interface TimerState {
  remaining: number;
  running: boolean;
}

// ── Parse heat level from action text ─────────────────────────────────────────
// Chinese dishes: 大火 / 中火 / 小火 / 慢炖 only — no dial numbers
// Temperature-based: oven/steak steps that specify °C or 度
function parseHeat(text: string): {
  level: 'high' | 'medium' | 'low' | 'simmer' | 'temp' | null;
  tempC: number | null;
  label: string;
  sublabel: string;
} {
  // Temperature (oven/steak: 180度, 180°C, 200°C etc)
  const tempMatch = text.match(/(\d{2,3})\s*(?:°C|℃|度[C℃]?)/);
  if (tempMatch) {
    const t = parseInt(tempMatch[1]);
    return { level: 'temp', tempC: t, label: `${t}°C`, sublabel: t >= 200 ? 'Very hot oven' : t >= 160 ? 'Hot oven' : 'Warm oven' };
  }
  if (/大火|high heat/i.test(text))   return { level: 'high',   tempC: null, label: 'High Heat',   sublabel: 'Fast & hot — keep it moving' };
  if (/中火|medium heat/i.test(text)) return { level: 'medium', tempC: null, label: 'Medium Heat', sublabel: 'Steady heat — stir evenly' };
  if (/小火|文火|low heat/i.test(text)) return { level: 'low',  tempC: null, label: 'Low Heat',    sublabel: 'Gentle — don\'t rush' };
  if (/慢炖|焖|simmer/i.test(text))   return { level: 'simmer', tempC: null, label: 'Simmer',      sublabel: 'Cover and wait patiently' };
  return { level: null, tempC: null, label: '', sublabel: '' };
}

const HEAT_CONFIG = {
  high:   { bg: '#FF4500', light: 'rgba(255,69,0,0.12)',   border: 'rgba(255,69,0,0.3)',   icon: '🔥🔥🔥' },
  medium: { bg: '#FF8C00', light: 'rgba(255,140,0,0.12)', border: 'rgba(255,140,0,0.3)',  icon: '🔥🔥' },
  low:    { bg: '#4DA6FF', light: 'rgba(77,166,255,0.12)', border: 'rgba(77,166,255,0.3)', icon: '🔥' },
  simmer: { bg: '#00B4A0', light: 'rgba(0,180,160,0.12)',  border: 'rgba(0,180,160,0.3)',  icon: '♨️' },
  temp:   { bg: '#9B59B6', light: 'rgba(155,89,182,0.12)', border: 'rgba(155,89,182,0.3)', icon: '🌡️' },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function totalCookMin(steps: CookStep[]) {
  return steps.reduce((sum, s) => sum + (s.duration_min || 0), 0);
}

// ── Dish List Screen ──────────────────────────────────────────────────────────
function DishListScreen({ dishes, loading, onSelect }: {
  dishes: DishWithCook[];
  loading: boolean;
  onSelect: (dish: DishWithCook) => void;
}) {
  const navigate = useNavigate();
  const { t3, t4, language, cycleLanguageForRole } = useLanguage();
  // TICKET-029 — upgraded to getDishTitle (zh / zh-Hant / en / tl / id picker).
  // Backend 022 §C ship 给 924 dishes 灌 title_zh_hant + title_en.
  const dishTitle = (d: DishWithCook) => getDishTitle(d, language);
  // TICKET-20260525-060 — lang chip short code (EN / TL / ID), matches HelperHome
  const langChip = language === 'tl' ? 'TL' : language === 'id' ? 'ID' : 'EN';
  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#FEF7E5', paddingBottom: 80 }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-5 pt-12 pb-4" style={{ background: '#FEF7E5' }}>
        <div className="flex items-center gap-3 mb-1">
          {/* TICKET-058 §1 — cooking 退出统一回 /helper. 原 navigate(localStorage role==='helper'?'/helper':'/')
              在 helper context 下走对，但老板真测确认从 helper /cook 退出回到了 / (employer Home).
              根因: nutri_role 未必被设置/同步, 老板测试设备上 localStorage.getItem('nutri_role') !== 'helper' 走了 '/' fallback.
              这是 helper-only 页, 统一 navigate('/helper') 最稳, 避免任何 fallback 漏洞. */}
          <button onClick={() => navigate('/helper')}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(0,0,0,0.06)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#1a1a1a' }}>arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black" style={{ fontSize: 22, color: '#1a1a1a' }}>
              {t4("Today's Cooking", "今日烹饪", "Pagluluto Ngayon", "Masakan Hari Ini")}
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>
              {t4("Choose a dish to start", "选一道菜开始", "Pumili ng ulam", "Pilih hidangan untuk mulai")}
            </p>
          </div>
          {/* TICKET-20260525-060 — lang chip (EN / TL / ID), matches HelperHome */}
          <button
            onClick={cycleLanguageForRole}
            className="px-3 h-8 rounded-full font-bold active:scale-95 transition-transform flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#1a1a1a', fontSize: 12 }}
            title="Switch language"
          >
            {langChip}
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 pb-10 flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : dishes.length === 0 ? (() => {
          // TICKET-010 §J — role-aware empty state (parity with HelperPrep)
          const role = localStorage.getItem('nutri_role');
          const isEmployer = role !== 'helper';
          return (
            <div className="flex flex-col items-center justify-center py-24 gap-3 px-8 text-center">
              <span className="text-5xl">🍽</span>
              <p style={{ color: 'rgba(0,0,0,0.65)', fontSize: 14, fontWeight: 600 }}>
                {isEmployer
                  ? t4("No menu for today yet",
                       "今日还没有菜单",
                       "Wala pang menu para ngayon",
                       "Belum ada menu hari ini")
                  : t4("No menu yet. Ask the employer to generate today's menu first.",
                       "还没有菜单，请等雇主生成今日菜单。",
                       "Wala pang menu. Hintayin ang employer na gumawa ng menu.",
                       "Belum ada menu. Minta majikan membuat menu hari ini dulu.")}
              </p>
              {isEmployer && (
                <button onClick={() => navigate('/weekly')}
                  className="mt-3 px-6 py-2.5 rounded-full font-bold text-white active:scale-95"
                  style={{ fontSize: 13, background: '#FF5A1F', boxShadow: '0 6px 18px rgba(255,90,31,0.30)' }}>
                  {t4("Generate this week's menu", "生成本周菜单", "Gumawa ng menu sa linggo", "Buat menu minggu ini")}
                </button>
              )}
            </div>
          );
        })() : (
          dishes.map((dish, i) => {
            const steps = dish.cook_steps_json ?? [];
            const mins = Math.round(totalCookMin(steps));
            const hasSteps = steps.length > 0;
            return (
              <button key={dish.id} onClick={() => onSelect(dish)}
                className="w-full rounded-3xl overflow-hidden active:scale-[0.97] transition-transform text-left"
                style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                {/* Dish image */}
                <div className="relative w-full" style={{ height: 140 }}>
                  {dish.image_url ? (
                    <img src={dish.image_url} alt={dishTitle(dish)}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.03)' }}>
                      <span style={{ fontSize: 40 }}>🍳</span>
                    </div>
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }} />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                    <h2 className="text-white font-bold" style={{ fontSize: 18 }}>{dishTitle(dish)}</h2>
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
                      <span className="material-symbols-outlined text-white/70" style={{ fontSize: 12 }}>schedule</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                        {mins > 0 ? `~${mins} min` : '—'}
                      </span>
                    </div>
                  </div>
                  {/* Dish number badge */}
                  <div className="absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center font-black text-white"
                    style={{ background: 'rgba(0,0,0,0.6)', fontSize: 13 }}>
                    {i + 1}
                  </div>
                </div>
                {/* Footer */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: hasSteps ? '#25D366' : 'rgba(0,0,0,0.4)' }}>
                      {hasSteps ? 'check_circle' : 'hourglass_empty'}
                    </span>
                    <span style={{ fontSize: 12, color: hasSteps ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)' }}>
                      {hasSteps
                        ? `${steps.length} ${t4('steps', '步', 'hakbang', 'langkah')}`
                        : t4('Steps generating…', '步骤生成中…', 'Ginagawa ang hakbang…', 'Sedang membuat langkah…')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ background: hasSteps ? 'rgba(255,90,31,0.18)' : 'rgba(0,0,0,0.05)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: hasSteps ? '#FF5A1F' : 'rgba(0,0,0,0.35)' }}>
                      {hasSteps
                        ? t4('Start cooking ›', '开始烹饪 ›', 'Magsimulang magluto ›', 'Mulai memasak ›')
                        : t4('Not ready', '尚未准备', 'Hindi pa handa', 'Belum siap')}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </main>
      <HelperTabBar active="cook" />
    </div>
  );
}

// ── Step-by-step Cooking Screen ───────────────────────────────────────────────
function CookingScreen({ dish, dishes, dishIndex, onBack, onNextDish }: {
  dish: DishWithCook;
  dishes: DishWithCook[];
  dishIndex: number;
  onBack: () => void;
  onNextDish: (dish: DishWithCook) => void;
}) {
  const { t4, isChinese, language, cycleLanguageForRole } = useLanguage();
  // TICKET-029 — upgraded to getDishTitle (zh / zh-Hant / en / tl / id picker).
  const dishTitle = (d: DishWithCook) => getDishTitle(d, language);
  // TICKET-20260525-060 — lang chip short code (EN / TL / ID), matches HelperHome
  const langChip = language === 'tl' ? 'TL' : language === 'id' ? 'ID' : 'EN';
  const steps = dish.cook_steps_json ?? [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<Record<number, TimerState>>({});
  const activeTimerRef = useRef<number | null>(null);

  // Helper feedback ✓ acks per current step (keys: "<stepIdx>-<type>").
  // Cleared after 3s so the button returns to normal — feedback is fire-and-forget,
  // the silent retry below makes failures invisible to the helper.
  const [feedbackAck, setFeedbackAck] = useState<Set<string>>(new Set());
  async function sendStepFeedback(type: 'cant_understand' | 'too_hard' | 'missing_ingredient') {
    const ackKey = `${currentIdx}-${type}`;
    setFeedbackAck(prev => { const s = new Set(prev); s.add(ackKey); return s; });
    setTimeout(() => {
      setFeedbackAck(prev => { const s = new Set(prev); s.delete(ackKey); return s; });
    }, 3000);
    const payload = {
      user_id: getUserId() ?? 'anonymous',
      dish_id: dish.id,
      step_index: currentIdx,
      feedback_type: type,
      locale: language,
    };
    const attempt = () => supabase.from('user_feedback_helper').insert(payload);
    try {
      const { error } = await attempt();
      if (error) await attempt(); // silent retry once (table-missing / transient)
    } catch { /* silent — helper should never see an error */ }
  }

  const step = steps[currentIdx];
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === steps.length - 1;
  const isDone = completed.has(currentIdx);
  const allStepsDone = completed.size === steps.length && steps.length > 0;
  const hasNextDish = dishIndex < dishes.length - 1;
  const nextDish = hasNextDish ? dishes[dishIndex + 1] : null;
  const heat = step ? parseHeat(step.action_zh) : { level: null, tempC: null, label: '', sublabel: '' };
  const heatCfg = heat.level ? HEAT_CONFIG[heat.level] : null;
  const timer = timers[currentIdx];
  const timerRunning = timer?.running ?? false;
  const timerRemaining = timer?.remaining ?? (step ? Math.round(step.duration_min * 60) : 0);
  const timerDone = timer ? timer.remaining === 0 : false;
  const completedCount = completed.size;

  // Auto-start timer whenever step changes (if step has a duration)
  useEffect(() => {
    if (!step || step.duration_min <= 0) return;
    const idx = currentIdx;
    setTimers(prev => {
      if (prev[idx]) return prev; // already has timer state, don't reset
      // Pause all other running timers
      const next: Record<number, TimerState> = {};
      for (const k of Object.keys(prev)) {
        const n = Number(k);
        next[n] = prev[n].running ? { ...prev[n], running: false } : prev[n];
      }
      next[idx] = { remaining: Math.round(step.duration_min * 60), running: true };
      activeTimerRef.current = idx;
      return next;
    });
  }, [currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown tick
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          const k = Number(key);
          const s = next[k];
          if (s.running && s.remaining > 0) {
            next[k] = { ...s, remaining: s.remaining - 1 };
            changed = true;
          } else if (s.running && s.remaining === 0) {
            next[k] = { ...s, running: false };
            if (activeTimerRef.current === k) activeTimerRef.current = null;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Tap timer to pause/resume
  function handleTimer() {
    if (!step || step.duration_min <= 0) return;
    const idx = currentIdx;
    setTimers(prev => {
      const existing = prev[idx];
      const next: Record<number, TimerState> = { ...prev };
      if (!existing || !existing.running) {
        // Resume or restart
        for (const k of Object.keys(next)) {
          const n = Number(k);
          if (n !== idx && next[n].running) next[n] = { ...next[n], running: false };
        }
        const rem = existing?.remaining > 0 ? existing.remaining : Math.round(step.duration_min * 60);
        next[idx] = { remaining: rem, running: true };
        activeTimerRef.current = idx;
      } else {
        // Pause
        next[idx] = { ...existing, running: false };
        activeTimerRef.current = null;
      }
      return next;
    });
  }

  function markDoneAndNext() {
    setCompleted(prev => { const s = new Set(prev); s.add(currentIdx); return s; });
    if (!isLast) setCurrentIdx(i => i + 1);
  }

  function goTo(idx: number) {
    setCurrentIdx(idx);
  }

  // β hotfix — cook_steps_json NULL / empty 时 step 为 undefined。原代码
  // `return null` → 白屏。改成 friendly placeholder，把 Backend dish-seed
  // pipeline 还没跑到的 dish 暴露成"正在准备"提示而不是空白页。
  if (!step) {
    return (
      <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#FEF7E5' }}>
        <header className="sticky top-0 z-50 px-5 pt-12 pb-4" style={{ background: '#FEF7E5' }}>
          <div className="flex items-center gap-3">
            <button onClick={onBack}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
            </button>
            <h1 className="font-black flex-1 min-w-0 truncate" style={{ fontSize: 17, color: '#1a1a1a' }}>{dishTitle(dish)}</h1>
            {/* TICKET-20260525-060 — lang chip (EN / TL / ID) */}
            <button
              onClick={cycleLanguageForRole}
              className="px-3 h-8 rounded-full font-bold active:scale-95 transition-transform flex-shrink-0"
              style={{ background: 'rgba(0,0,0,0.06)', color: '#1a1a1a', fontSize: 12 }}
              title="Switch language"
            >
              {langChip}
            </button>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
          <span style={{ fontSize: 56 }}>👩‍🍳</span>
          <p className="font-bold" style={{ fontSize: 16, color: '#1a1a1a' }}>
            {t4('Recipe is being prepared…', '小厨师正在准备菜谱…', 'Hinahanda ang recipe…', 'Resep sedang disiapkan…')}
          </p>
          <p style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13, lineHeight: 1.5 }}>
            {t4('New recipes ship daily — check back tomorrow.',
                '每天都有新菜谱上线，明天再来看看。',
                'Bago ang mga recipe araw-araw — bumalik bukas.',
                'Resep baru setiap hari — cek lagi besok.')}
          </p>
        </main>
      </div>
    );
  }

  const durationSec = Math.round(step.duration_min * 60);
  const hasTimer = durationSec > 0;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#FEF7E5' }}>

      {/* Header */}
      <header className="sticky top-0 z-50 px-5 pt-12 pb-4" style={{ background: '#FEF7E5' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black leading-tight" style={{ fontSize: 17, color: '#1a1a1a' }}>
              {dishTitle(dish)}
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>
              {t4(
                `Step ${currentIdx + 1} of ${steps.length} · ${completedCount} done`,
                `第 ${currentIdx + 1} 步 / 共 ${steps.length} · 已完成 ${completedCount}`,
                `Hakbang ${currentIdx + 1} ng ${steps.length} · ${completedCount} tapos`,
                `Langkah ${currentIdx + 1} dari ${steps.length} · ${completedCount} selesai`,
              )}
            </p>
          </div>
          {/* TICKET-20260525-060 — lang chip (EN / TL / ID), helper-only, not affecting cooking progress */}
          <button
            onClick={cycleLanguageForRole}
            className="px-3 h-8 rounded-full font-bold active:scale-95 transition-transform flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#1a1a1a', fontSize: 12 }}
            title="Switch language"
          >
            {langChip}
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%`, background: '#25D366' }} />
        </div>

        {/* Step dots */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {steps.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className="rounded-full transition-all active:scale-90"
              style={{
                width: i === currentIdx ? 24 : 8,
                height: 8,
                background: completed.has(i) ? '#25D366' : i === currentIdx ? '#FF5A1F' : 'rgba(0,0,0,0.15)',
              }} />
          ))}
        </div>
      </header>

      <main className="flex-1 px-5 pb-6 flex flex-col gap-4">

        {/* UI 015 §K — Watch tutorial video 按钮：dish.video_url 存在时红色显示
            外链 YouTube/Bilibili 教程；NULL → 灰色 "Tutorial coming soon" 占位。
            Database 012 §B 加 3 列；Backend 011 ship 灌入 ~500-600 道菜的 video_url。 */}
        {dish.video_url ? (
          <a href={dish.video_url} target="_blank" rel="noopener noreferrer"
            className="block py-3 px-5 rounded-2xl text-center font-bold active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(135deg, #FF4757, #FF6B6B)',
              color: '#FFFFFF', fontSize: 15,
              boxShadow: '0 4px 16px rgba(255,71,87,0.3)',
            }}>
            🎬 {t4('Watch tutorial', '看视频教程', 'Manood ng tutorial', 'Tonton tutorial')}
            {dish.video_lang && <span className="opacity-80 ml-1" style={{ fontSize: 12 }}> · {dish.video_lang.toUpperCase()}</span>}
          </a>
        ) : (
          <div className="block py-3 px-5 rounded-2xl text-center"
            style={{ background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.35)', fontSize: 13 }}>
            {t4('Tutorial coming soon', '视频教程稍后上架', 'Susunod ang tutorial', 'Tutorial segera')}
          </div>
        )}

        {/* Heat level indicator — labels come from a 4-language table
            keyed by heat.level so 大火/中火/小火 etc. translate properly. */}
        {heatCfg && (() => {
          const HEAT_LABEL = {
            high:   { en: 'High Heat',   zh: '大火',   tl: 'Mataas na Apoy',  id: 'Api Besar' },
            medium: { en: 'Medium Heat', zh: '中火',   tl: 'Katamtamang Apoy', id: 'Api Sedang' },
            low:    { en: 'Low Heat',    zh: '小火',   tl: 'Mahinang Apoy',   id: 'Api Kecil' },
            simmer: { en: 'Simmer',      zh: '文火慢炖', tl: 'Pakuluan ng Mahina', id: 'Api Pelan' },
            temp:   { en: heat.label,    zh: heat.label, tl: heat.label, id: heat.label }, // raw °C
          } as const;
          const HEAT_SUB = {
            high:   { en: 'Fast & hot — keep it moving',   zh: '快速翻炒，不能停手',           tl: 'Mabilis at mainit — galawin lagi', id: 'Cepat & panas — aduk terus' },
            medium: { en: 'Steady heat — stir evenly',     zh: '火力稳定，均匀翻炒',           tl: 'Pantay na init — haluin nang patas', id: 'Panas stabil — aduk merata' },
            low:    { en: 'Gentle — don\'t rush',          zh: '温柔加热，不要急',             tl: 'Mahina — huwag magmadali',          id: 'Lembut — jangan terburu-buru' },
            simmer: { en: 'Cover and wait patiently',      zh: '盖盖焖煮，耐心等候',           tl: 'Takpan at maghintay',               id: 'Tutup dan tunggu' },
            temp:   { en: heat.sublabel, zh: heat.sublabel, tl: heat.sublabel, id: heat.sublabel },
          } as const;
          const lvl = heat.level as keyof typeof HEAT_LABEL;
          const lab = HEAT_LABEL[lvl];
          const sub = HEAT_SUB[lvl];
          return (
            <div className="rounded-3xl px-5 py-4 flex items-center gap-4"
              style={{ background: heatCfg.light, border: `1.5px solid ${heatCfg.border}` }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-3xl"
                style={{ background: heatCfg.bg + '22' }}>
                {heatCfg.icon}
              </div>
              <div>
                <p className="font-black" style={{ fontSize: 26, color: heatCfg.bg, lineHeight: 1 }}>
                  {t4(lab.en, lab.zh, lab.tl, lab.id)}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                  {t4(sub.en, sub.zh, sub.tl, sub.id)}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Step action text */}
        <div className="rounded-3xl px-5 py-5 flex-1"
          style={{ background: isDone ? 'rgba(37,211,102,0.10)' : '#FFFFFF', border: `1.5px solid ${isDone ? 'rgba(37,211,102,0.30)' : 'rgba(0,0,0,0.08)'}`, boxShadow: isDone ? 'none' : '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-[14px]"
              style={{ background: isDone ? '#25D366' : '#FF5A1F' }}>
              {isDone ? '✓' : step.step}
            </div>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', fontWeight: 600 }}>
              {isDone
                ? t4('Done ✓', '已完成 ✓', 'Tapos ✓', 'Selesai ✓')
                : t4('Current step', '当前步骤', 'Kasalukuyang hakbang', 'Langkah saat ini')}
            </span>
          </div>
          <p className="leading-relaxed" style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.6, color: '#1a1a1a' }}>
            {/* Single-language per i18n cleanup. zh / 繁 → action_zh;
                en / tl / id → action_en (fallback to action_zh when EN
                hasn't been translated). The old code rendered EN on top
                and stacked the Chinese underneath for every step. */}
            {isChinese ? (step.action_zh || step.action_en) : (step.action_en || step.action_zh)}
          </p>

          {/* 物性目标 / state target — Simply Chinese Feasts 4D framework.
              The sensory checkpoint that tells a human cook "this step is
              actually done" (肉变色 / 皮金黄酥脆 / 汤汁挂勺). For non-robot
              execution this is the difference between "started" and
              "finished" — duration alone is mechanical. */}
          {(step.state_target_zh || step.state_target_en) && (
            <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-2xl"
              style={{ background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)' }}>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 18, color: '#FFC800', marginTop: 1, fontVariationSettings: "'FILL' 1" }}>
                target
              </span>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 10, color: 'rgba(180,140,0,1)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
                  {t4('Done when', '完成标志', 'Tapos kapag', 'Selesai saat')}
                </div>
                <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.85)', fontWeight: 500, lineHeight: 1.5 }}>
                  {isChinese ? (step.state_target_zh || step.state_target_en) : (step.state_target_en || step.state_target_zh)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Helper feedback buttons — 3 zero-cognition-load 1-taps for the
            person actually cooking. Drives the B 数据飞轮: every tap goes
            to user_feedback_helper with step_index so we know WHICH step in WHICH
            dish is unclear / too hard / missing materials. Posts silently
            (with one retry) so a failure never surfaces to the helper. */}
        {(() => {
          const FB_BUTTONS: Array<{
            type: 'cant_understand' | 'too_hard' | 'missing_ingredient';
            emoji: string;
            label: { en: string; zh: string; tl: string; id: string };
          }> = [
            { type: 'cant_understand',     emoji: '❓', label: { en: "Don't get it", zh: '看不懂',  tl: 'Hindi maintindihan', id: 'Tidak paham' } },
            { type: 'too_hard',            emoji: '🥵', label: { en: 'Too hard',     zh: '太难了',  tl: 'Masyadong mahirap',  id: 'Terlalu sulit' } },
            { type: 'missing_ingredient', emoji: '🛒', label: { en: 'Missing item', zh: '没材料',  tl: 'Walang sangkap',     id: 'Bahan tidak ada' } },
          ];
          return (
            <div className="grid grid-cols-3 gap-2">
              {FB_BUTTONS.map(({ type, emoji, label }) => {
                const acked = feedbackAck.has(`${currentIdx}-${type}`);
                return (
                  <button key={type} onClick={() => sendStepFeedback(type)}
                    className="rounded-2xl py-2.5 px-2 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                    style={{
                      background: acked ? 'rgba(37,211,102,0.16)' : '#FFFFFF',
                      border: `1px solid ${acked ? 'rgba(37,211,102,0.35)' : 'rgba(0,0,0,0.08)'}`,
                    }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{acked ? '✓' : emoji}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: acked ? '#25D366' : 'rgba(0,0,0,0.7)',
                      lineHeight: 1.2, textAlign: 'center',
                    }}>
                      {t4(label.en, label.zh, label.tl, label.id)}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Timer */}
        {hasTimer && (
          <button onClick={handleTimer}
            className="w-full rounded-3xl py-5 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
            style={{
              background: timerDone ? 'rgba(37,211,102,0.12)' : timerRunning ? 'rgba(255,90,31,0.12)' : '#FFFFFF',
              border: `1.5px solid ${timerDone ? 'rgba(37,211,102,0.3)' : timerRunning ? 'rgba(255,90,31,0.3)' : 'rgba(0,0,0,0.08)'}`,
            }}>
            <div className="font-black tabular-nums" style={{
              fontSize: 52,
              letterSpacing: 2,
              color: timerDone ? '#25D366' : timerRunning ? '#FF5A1F' : 'rgba(0,0,0,0.7)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {timerDone ? t4('Done!', '完成！', 'Tapos na!', 'Selesai!') : formatTime(timerRemaining)}
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined" style={{
                fontSize: 18,
                color: timerDone ? '#25D366' : timerRunning ? '#FF5A1F' : 'rgba(0,0,0,0.55)',
                fontVariationSettings: "'FILL' 1",
              }}>
                {timerDone ? 'check_circle' : timerRunning ? 'pause_circle' : 'play_circle'}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: timerDone ? '#25D366' : timerRunning ? '#FF5A1F' : 'rgba(0,0,0,0.55)',
              }}>
                {timerDone
                  ? t4('Timer done ✓', '计时结束 ✓', 'Tapos na ang oras ✓', 'Waktu habis ✓')
                  : timerRunning
                    ? t4('Tap to pause', '点击暂停', 'I-tap para i-pause', 'Ketuk untuk jeda')
                    : t4('Tap to resume', '点击继续', 'I-tap para ituloy', 'Ketuk untuk lanjut')}
              </span>
              {timerRunning && <div className="w-2 h-2 rounded-full bg-[#FF5A1F] animate-pulse" />}
            </div>
          </button>
        )}
      </main>

      {/* Bottom navigation */}
      {allStepsDone ? (
        /* All steps complete — offer next dish or return to list */
        <div className="px-5 pb-10 flex flex-col gap-3">
          <div className="rounded-3xl p-5 text-center"
            style={{ background: 'rgba(37,211,102,0.14)', border: '1.5px solid rgba(37,211,102,0.35)' }}>
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-black" style={{ fontSize: 18, color: '#1a1a1a' }}>
              {dishTitle(dish)} {t4('done!', '完成！', 'tapos na!', 'selesai!')}
            </p>
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', marginTop: 4 }}>
              {dishIndex + 1} / {dishes.length} {t4('dishes', '道菜', 'ulam', 'hidangan')}
            </p>
          </div>
          {nextDish ? (
            <button onClick={() => onNextDish(nextDish)}
              className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF9054)', fontSize: 15, boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}>
              {t4('Next dish: ', '开始下一道：', 'Susunod na ulam: ', 'Hidangan berikutnya: ')}{dishTitle(nextDish)}
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_forward_ios</span>
            </button>
          ) : (
            <div className="rounded-2xl p-4 text-center"
              style={{ background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.30)' }}>
              <p className="font-black" style={{ fontSize: 16, color: '#1a1a1a' }}>
                {t4(
                  'All done! Today’s menu is ready 🍽️',
                  '全部完成！今日菜肴上桌 🍽️',
                  'Tapos na! Handa na ang menu ngayon 🍽️',
                  'Semua selesai! Menu hari ini siap 🍽️',
                )}
              </p>
            </div>
          )}
          <button onClick={onBack}
            className="w-full h-12 rounded-2xl flex items-center justify-center font-semibold"
            style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.6)', fontSize: 14 }}>
            {t4('Back to menu', '返回菜单列表', 'Bumalik sa menu', 'Kembali ke menu')}
          </button>
        </div>
      ) : (
        <div className="px-5 pb-10 flex gap-3">
          <button onClick={() => goTo(currentIdx - 1)} disabled={isFirst}
            className="flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30"
            style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#1a1a1a' }}>arrow_back_ios</span>
            <span className="font-bold" style={{ fontSize: 14, color: '#1a1a1a' }}>
              {t4('Back', '上一步', 'Bumalik', 'Kembali')}
            </span>
          </button>

          {isLast ? (
            <button onClick={markDoneAndNext}
              className="flex-[2] h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', fontSize: 15 }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              {t4('Finish this dish!', '完成这道菜！', 'Tapusin ang ulam na ito!', 'Selesaikan hidangan ini!')}
            </button>
          ) : (
            <button onClick={markDoneAndNext}
              className="flex-[2] h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF9054)', fontSize: 15 }}>
              {t4('Done, next step', '完成，下一步', 'Tapos, susunod', 'Selesai, lanjut')}
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_forward_ios</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function HelperCook() {
  const [dishes, setDishes] = useState<DishWithCook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const singleDishId = searchParams.get('dish_id');
  const { language, setLanguage } = useLanguage();

  // TICKET-20260525-060 — Helper view never uses Chinese. If a stale appLanguage
  // from a prior employer session leaked in, snap to EN on mount. Matches
  // HelperHome.tsx:73-78 pattern. Lives on top-level so it runs once for both
  // DishListScreen + CookingScreen sub-routes.
  useEffect(() => {
    if (language === 'zh' || language === 'zh-Hant') {
      setLanguage('en');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // β hotfix — 从 Home 直接点 dish 或 /prep 的"开始烹饪"按钮会带
        // `?dish_id=X` 跳到这里。原代码只读 localStorage.generatedMenu，
        // 单 dish 路径直接拿不到数据→空列表→白屏。补 singleDishId path
        // 跟 HelperPrep 对齐。
        if (singleDishId) {
          const { data } = await supabase
            .from('dishes')
            .select('id, title_zh, title_en, image_url, cook_steps_json, video_url, video_lang, video_platform')
            .eq('id', singleDishId)
            .single();
          if (data) {
            setDishes([data as DishWithCook]);
            setSelectedIdx(0);  // 单 dish 路径直接进入 CookingScreen
          }
          setLoading(false);
          return;
        }

        const raw = localStorage.getItem('generatedMenu');
        if (!raw) { setLoading(false); return; }
        const todayDishes: any[] = JSON.parse(raw);
        const ids = todayDishes.map((d: any) => d.id).filter(Boolean);
        if (ids.length === 0) { setDishes(todayDishes); setLoading(false); return; }

        const { data } = await supabase
          .from('dishes')
          .select('id, title_zh, title_en, image_url, cook_steps_json, video_url, video_lang, video_platform')
          .in('id', ids);

        if (data && data.length > 0) {
          const map = new Map(data.map(d => [d.id, d]));
          const ordered = ids.map(id => map.get(id) ?? todayDishes.find((d: any) => d.id === id)).filter(Boolean);
          setDishes(ordered as DishWithCook[]);
        } else {
          setDishes(todayDishes);
        }
      } catch (e) {
        console.error('HelperCook load error:', e);
      }
      setLoading(false);
    }
    load();
  }, [singleDishId]);

  if (selectedIdx !== null && dishes[selectedIdx]) {
    return (
      <CookingScreen
        dish={dishes[selectedIdx]}
        dishes={dishes}
        dishIndex={selectedIdx}
        onBack={() => setSelectedIdx(null)}
        onNextDish={d => setSelectedIdx(dishes.indexOf(d))}
      />
    );
  }

  return (
    <DishListScreen
      dishes={dishes}
      loading={loading}
      onSelect={d => setSelectedIdx(dishes.indexOf(d))}
    />
  );
}
