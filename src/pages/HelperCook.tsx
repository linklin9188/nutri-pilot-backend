import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { type CookStep } from "../hooks/useSupabaseMenu";

interface DishWithCook {
  id: string;
  title_zh: string;
  title_en?: string;
  image_url?: string;
  cook_steps_json?: CookStep[] | null;
}

interface TimerState {
  remaining: number;
  running: boolean;
}

// ── Voice command keyword map ──────────────────────────────────────────────────
// Both Chinese and English so owner (ZH) and helper (EN/Tagalog-EN) both work.
const VOICE_CMDS = {
  next:  ['下一步', '下一个', '继续', '往下', 'next', 'next step', 'continue', 'forward'],
  prev:  ['上一步', '上一个', '返回', '往上', 'previous', 'back', 'go back', 'prev', 'last step'],
  start: ['开始', '开始计时', '计时', 'start', 'timer', 'start timer', 'begin', 'go'],
  done:  ['好了', '完成', '做好了', '这步好了', 'done', 'finish', 'finished', 'complete', 'ok done'],
  pause: ['暂停', '等一下', '先停', 'pause', 'stop', 'wait', 'hold on'],
};

function matchVoiceCmd(transcript: string): keyof typeof VOICE_CMDS | null {
  const t = transcript.toLowerCase().trim();
  for (const [cmd, keywords] of Object.entries(VOICE_CMDS)) {
    if (keywords.some(kw => t.includes(kw.toLowerCase()))) {
      return cmd as keyof typeof VOICE_CMDS;
    }
  }
  return null;
}

// ── Web Speech API shim ────────────────────────────────────────────────────────
const SpeechRecognition =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

export default function HelperCook() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, toggleLanguage, language } = useLanguage();

  const [dishes, setDishes]       = useState<DishWithCook[]>([]);
  const [loading, setLoading]     = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [timers, setTimers]       = useState<Record<string, TimerState>>({});
  const activeTimerKey            = useRef<string | null>(null);

  // ── Voice state ──────────────────────────────────────────────────────────────
  const [voiceOn, setVoiceOn]         = useState(false);
  const [voiceToast, setVoiceToast]   = useState<string | null>(null);  // feedback text
  const [voiceSupported]              = useState(() => !!SpeechRecognition);
  // Flat index of the "current focused step" for voice navigation
  const [focusedFlat, setFocusedFlat] = useState(0);
  const recognitionRef = useRef<any>(null);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const singleDishId = searchParams.get('dish_id');

  // ── Load dishes ───────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadDishes() {
      setLoading(true);
      try {
        if (singleDishId) {
          const { data } = await supabase
            .from('dishes')
            .select('id, title_zh, title_en, image_url, cook_steps_json')
            .eq('id', singleDishId)
            .single();
          if (data) setDishes([data]);
        } else {
          const raw = localStorage.getItem('generatedMenu');
          if (raw) {
            const todayDishes: DishWithCook[] = JSON.parse(raw);
            const ids = todayDishes.map(d => d.id);
            const { data } = await supabase
              .from('dishes')
              .select('id, title_zh, title_en, image_url, cook_steps_json')
              .in('id', ids);
            if (data) {
              const map = new Map(data.map(d => [d.id, d]));
              setDishes(ids.map(id => map.get(id)).filter(Boolean) as DishWithCook[]);
            } else {
              setDishes(todayDishes);
            }
          }
        }
      } catch (e) {
        console.error('HelperCook load error:', e);
      }
      setLoading(false);
    }
    loadDishes();
  }, [singleDishId]);

  // ── Countdown tick ────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          const s = next[key];
          if (s.running && s.remaining > 0) {
            next[key] = { ...s, remaining: s.remaining - 1 };
            changed = true;
          } else if (s.running && s.remaining === 0) {
            next[key] = { ...s, running: false };
            if (activeTimerKey.current === key) activeTimerKey.current = null;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Flat step list helper ─────────────────────────────────────────────────────
  // Build once from dishes; used by voice navigation
  const flatSteps = dishes.flatMap(d =>
    (d.cook_steps_json ?? []).map((step, i) => ({
      key: `${d.id}-${i}`,
      dishId: d.id,
      stepIdx: i,
      durationMin: step.duration_min,
    }))
  );
  const totalSteps     = flatSteps.length;
  const completedCount = flatSteps.filter(s => completed.has(s.key)).length;
  const progressPct    = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const clampFlat = (n: number) => Math.max(0, Math.min(n, totalSteps - 1));

  const scrollToStep = useCallback((key: string) => {
    const el = stepRefs.current[key];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const showToast = useCallback((msg: string) => {
    setVoiceToast(msg);
    setTimeout(() => setVoiceToast(null), 2200);
  }, []);

  // ── Voice command handler ─────────────────────────────────────────────────────
  const handleVoiceCommand = useCallback((transcript: string) => {
    const cmd = matchVoiceCmd(transcript);
    if (!cmd) return;

    setFocusedFlat(prev => {
      let next = prev;

      if (cmd === 'next') {
        next = clampFlat(prev + 1);
        showToast(language === 'zh' ? '➡ 下一步' : '➡ Next step');
        scrollToStep(flatSteps[next]?.key ?? '');
      }

      if (cmd === 'prev') {
        next = clampFlat(prev - 1);
        showToast(language === 'zh' ? '⬅ 上一步' : '⬅ Previous step');
        scrollToStep(flatSteps[next]?.key ?? '');
      }

      if (cmd === 'done') {
        const currentKey = flatSteps[prev]?.key;
        if (currentKey) {
          setCompleted(c => { const s = new Set(c); s.add(currentKey); return s; });
          next = clampFlat(prev + 1);
          showToast(language === 'zh' ? '✓ 完成，进入下一步' : '✓ Done, next step');
          setTimeout(() => scrollToStep(flatSteps[next]?.key ?? ''), 100);
        }
      }

      if (cmd === 'start') {
        const step = flatSteps[prev];
        if (step && step.durationMin > 0) {
          const key = step.key;
          setTimers(t => {
            const existing = t[key];
            const pauseOthers: Record<string, TimerState> = {};
            for (const k of Object.keys(t)) {
              if (k !== key && t[k].running) pauseOthers[k] = { ...t[k], running: false };
            }
            const remaining = existing?.remaining ?? step.durationMin * 60;
            activeTimerKey.current = key;
            return { ...t, ...pauseOthers, [key]: { remaining: remaining > 0 ? remaining : step.durationMin * 60, running: true } };
          });
          showToast(language === 'zh' ? '⏱ 开始计时' : '⏱ Timer started');
        } else {
          showToast(language === 'zh' ? '这步不需要计时' : 'No timer for this step');
        }
      }

      if (cmd === 'pause') {
        if (activeTimerKey.current) {
          const k = activeTimerKey.current;
          setTimers(t => ({ ...t, [k]: { ...t[k], running: false } }));
          activeTimerKey.current = null;
          showToast(language === 'zh' ? '⏸ 计时暂停' : '⏸ Timer paused');
        } else {
          showToast(language === 'zh' ? '没有运行中的计时器' : 'No active timer');
        }
      }

      return next;
    });
  }, [flatSteps, language, scrollToStep, showToast]);

  // ── Voice recognition lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    if (!voiceOn || !SpeechRecognition) return;

    const r = new SpeechRecognition();
    recognitionRef.current = r;
    r.continuous = true;
    r.interimResults = false;
    // Accept both ZH + EN — use zh-CN as base; simple English keywords still fire
    r.lang = language === 'zh' ? 'zh-CN' : 'en-PH';
    r.maxAlternatives = 3;

    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        handleVoiceCommand(transcript);
      }
    };

    r.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        console.warn('Speech error:', e.error);
        setVoiceOn(false);
      }
    };

    r.onend = () => {
      // Auto-restart unless manually turned off
      if (recognitionRef.current === r) r.start();
    };

    r.start();

    return () => {
      recognitionRef.current = null;
      r.onend = null;
      r.stop();
    };
  }, [voiceOn, language, handleVoiceCommand]);

  const toggleVoice = () => {
    if (!voiceSupported) {
      alert(language === 'zh' ? '您的浏览器不支持语音识别，请使用 Chrome。' : 'Your browser doesn\'t support voice. Please use Chrome.');
      return;
    }
    setVoiceOn(v => !v);
    if (!voiceOn) showToast(language === 'zh' ? '🎤 声控已开启' : '🎤 Voice control ON');
  };

  // ── Step helpers ──────────────────────────────────────────────────────────────
  const stepKey = (dishId: string, idx: number) => `${dishId}-${idx}`;

  const toggleStep = (key: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleTimerClick = (dishId: string, stepIdx: number, durationMin: number) => {
    const key = stepKey(dishId, stepIdx);
    setTimers(prev => {
      const existing = prev[key];
      const isRunning = existing?.running ?? false;
      const next: Record<string, TimerState> = {};
      for (const k of Object.keys(prev)) {
        next[k] = (k !== key && prev[k].running) ? { ...prev[k], running: false } : prev[k];
      }
      if (!existing) {
        next[key] = { remaining: durationMin * 60, running: true };
        activeTimerKey.current = key;
      } else if (isRunning) {
        next[key] = { ...existing, running: false };
        activeTimerKey.current = null;
      } else {
        const remaining = existing.remaining > 0 ? existing.remaining : durationMin * 60;
        next[key] = { remaining, running: true };
        activeTimerKey.current = key;
      }
      return next;
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const durationLabel = (min: number) =>
    min < 1 ? `${Math.round(min * 60)} sec` : min === 1 ? `1 min` : `${min} min`;

  const prepPath = singleDishId ? `/prep?dish_id=${singleDishId}` : '/prep';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-background text-on-surface antialiased flex justify-center w-full min-h-screen">
      <div className="w-[390px] h-full relative flex flex-col no-scrollbar pb-44">

        {/* ── Voice toast ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {voiceToast && (
            <motion.div
              key="toast"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-full bg-[#1a1a1a]/90 backdrop-blur-md text-white text-[13px] font-bold shadow-xl"
            >
              {voiceToast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md px-4 py-6 space-y-4 border-b border-black/5">
          <div className="flex justify-between items-center">
            <span
              className="material-symbols-outlined text-on-surface cursor-pointer p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-95"
              onClick={() => navigate(-1)}
            >
              arrow_back
            </span>
            <h1 className="text-[20px] font-bold text-on-surface leading-tight text-center max-w-[200px] mx-auto tracking-tight">
              {t("Active Cooking", "正在烹饪")}
            </h1>
            <button
              onClick={toggleLanguage}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-on-surface font-bold text-[12px] active:scale-95 transition-transform"
            >
              {language === 'en' ? 'EN' : '中'}
            </button>
          </div>

          {/* Phase timeline */}
          <div className="flex items-center justify-between px-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-[14px] text-green-600">check</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-green-600 tracking-wider">Prep</span>
            </div>
            <div className="flex-1 h-[2px] bg-black/5 mx-2" />
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center relative bg-primary/5">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              </div>
              <span className="text-[10px] uppercase font-bold text-primary tracking-wider">COOKING</span>
            </div>
            <div className="flex-1 h-[2px] bg-black/5 mx-2" />
            <div className="flex flex-col items-center gap-1 opacity-40">
              <div className="w-6 h-6 rounded-full border-2 border-secondary bg-black/5" />
              <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Serve</span>
            </div>
          </div>

          {/* Overall progress bar */}
          {totalSteps > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">
                  {t("Progress", "进度")}
                </span>
                <span className="text-[11px] font-bold text-primary">
                  {completedCount}/{totalSteps} {t("steps", "步")}
                </span>
              </div>
              <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 20 }}
                />
              </div>
            </div>
          )}
        </header>

        {/* ── Voice command cheat-sheet (shown when voice is ON) ────────────── */}
        <AnimatePresence>
          {voiceOn && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mx-4 mt-3 bg-[#1a1a1a] rounded-2xl px-4 py-3 flex flex-wrap gap-2">
                <span className="w-full text-[11px] font-bold text-white/40 uppercase tracking-wider mb-0.5">
                  {t('Voice commands', '可用指令')}
                </span>
                {[
                  { zh: '"下一步"', en: '"next"' },
                  { zh: '"上一步"', en: '"back"' },
                  { zh: '"开始"', en: '"start"' },
                  { zh: '"好了"', en: '"done"' },
                  { zh: '"暂停"', en: '"pause"' },
                ].map(cmd => (
                  <span key={cmd.zh} className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[12px] font-bold">
                    {language === 'zh' ? cmd.zh : cmd.en}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main ──────────────────────────────────────────────────────────── */}
        <main className="flex-1 px-4 mt-4 space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-secondary text-[14px]">{t("Loading cooking guide…", "正在加载烹饪指南…")}</p>
            </div>
          ) : dishes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <span className="material-symbols-outlined text-[48px] text-secondary/40">restaurant</span>
              <p className="text-secondary text-[14px] text-center px-8">
                {t("No dishes found. Go back and select a menu.", "未找到菜品，请返回选择菜单。")}
              </p>
            </div>
          ) : (
            dishes.map(dish => {
              const steps = dish.cook_steps_json ?? [];
              const dishTitle = language === 'zh' ? dish.title_zh : (dish.title_en || dish.title_zh);

              return (
                <section key={dish.id} className="space-y-3">
                  {dishes.length > 1 && (
                    <div className="flex items-center gap-3">
                      {dish.image_url && (
                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-black/5 shadow-sm">
                          <img src={dish.image_url} alt={dishTitle} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <h2 className="font-bold text-[16px] text-on-surface tracking-tight">{dishTitle}</h2>
                    </div>
                  )}

                  {steps.length === 0 ? (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-[36px] text-secondary/40">hourglass_empty</span>
                      <p className="text-secondary text-[13px] text-center font-medium">
                        {t("Cooking guide generating, check back soon.", "烹饪步骤生成中，请稍后查看。")}
                      </p>
                    </div>
                  ) : (
                    steps.map((step, idx) => {
                      const key = stepKey(dish.id, idx);
                      const flatIdx = flatSteps.findIndex(s => s.key === key);
                      const isFocused = flatIdx === focusedFlat && voiceOn;
                      const isDone = completed.has(key);
                      const timerState = timers[key];
                      const timerRunning = timerState?.running ?? false;
                      const timerRemaining = timerState?.remaining ?? (step.duration_min * 60);
                      const timerDone = timerState ? timerState.remaining === 0 : false;
                      const actionText = language === 'zh' ? step.action_zh : step.action_en;
                      // Long wait steps (≥10 min) get a distinct waiting color
                      const isLongWait = step.duration_min >= 10 && timerRunning;

                      return (
                        <motion.div
                          key={key}
                          ref={el => { stepRefs.current[key] = el; }}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          onClick={() => {
                            toggleStep(key);
                            setFocusedFlat(flatIdx);
                          }}
                          className={`rounded-2xl p-4 shadow-sm border transition-all cursor-pointer active:scale-[0.98] ${
                            isDone
                              ? 'border-green-200 bg-green-50/60'
                              : isLongWait
                              ? 'border-amber-200 bg-amber-50/40'
                              : isFocused
                              ? 'border-primary bg-primary/5 shadow-md'
                              : 'border-black/5 bg-white'
                          }`}
                        >
                          {/* Voice focus indicator */}
                          {isFocused && (
                            <div className="flex items-center gap-1.5 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                                {t('Current step', '当前步骤')}
                              </span>
                            </div>
                          )}

                          <div className="flex items-start gap-3">
                            {/* Step number */}
                            <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[14px] font-bold border-2 transition-all ${
                              isDone
                                ? 'bg-green-500 border-green-500 text-white'
                                : isLongWait
                                ? 'bg-amber-100 border-amber-300 text-amber-700'
                                : isFocused
                                ? 'bg-primary border-primary text-white'
                                : 'bg-primary/5 border-primary/20 text-primary'
                            }`}>
                              {isDone ? (
                                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                              ) : (
                                step.step
                              )}
                            </div>

                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-[14px] font-medium leading-snug flex-1 transition-all ${
                                  isDone ? 'line-through text-secondary/60' : 'text-on-surface'
                                }`}>
                                  {actionText}
                                </p>
                                {step.duration_min > 0 && (
                                  <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                    isDone      ? 'bg-green-100 text-green-600' :
                                    isLongWait  ? 'bg-amber-100 text-amber-700' :
                                    'bg-primary/10 text-primary'
                                  }`}>
                                    {durationLabel(step.duration_min)}
                                  </span>
                                )}
                              </div>

                              {/* Long-wait parallel cooking hint */}
                              {isLongWait && !isDone && (
                                <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium">
                                  <span className="material-symbols-outlined text-[13px]">tips_and_updates</span>
                                  {t('Simmering — you can start another dish now', '等候中 — 可以开始另一道菜')}
                                </div>
                              )}

                              {/* Timer button */}
                              {step.duration_min > 0 && !isDone && (
                                <div
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleTimerClick(dish.id, idx, step.duration_min);
                                    setFocusedFlat(flatIdx);
                                  }}
                                >
                                  <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 ${
                                    timerDone    ? 'bg-green-100 text-green-700' :
                                    timerRunning ? 'bg-primary/10 text-primary' :
                                    'bg-black/5 text-secondary hover:bg-primary/10 hover:text-primary'
                                  }`}>
                                    <span className="material-symbols-outlined text-[15px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>
                                      {timerDone ? 'check_circle' : timerRunning ? 'pause' : 'play_arrow'}
                                    </span>
                                    <span className="font-mono tracking-tight">
                                      {timerDone
                                        ? t('Done!', '完成!')
                                        : timerState
                                        ? formatTime(timerRemaining)
                                        : formatTime(step.duration_min * 60)}
                                    </span>
                                    {timerRunning && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </section>
              );
            })
          )}
        </main>

        {/* ── Fixed footer ──────────────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[390px] px-4 pb-8 pointer-events-none z-[40]">
          <div className="flex flex-col items-center gap-4 pointer-events-auto">

            {/* Voice control button — replaces the navigate-to-ai-pilot FAB */}
            <div className="relative flex flex-col items-center">
              {!voiceOn && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 px-4 py-2 bg-black/5 backdrop-blur-md rounded-full border border-black/8"
                >
                  <p className="text-secondary font-medium text-[12px]">
                    {voiceSupported
                      ? t('Tap mic — go hands-free', '点麦克风解放双手')
                      : t('Voice not supported in this browser', '浏览器不支持声控')}
                  </p>
                </motion.div>
              )}
              {voiceOn && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-3 flex items-center gap-2 px-4 py-2 bg-primary/10 backdrop-blur-md rounded-full border border-primary/20"
                >
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <p className="text-primary font-bold text-[12px]">
                    {t('Listening… say "next", "done", "start"', '聆听中… 说"下一步""好了""开始"')}
                  </p>
                </motion.div>
              )}

              <button
                onClick={toggleVoice}
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all ${
                  voiceOn
                    ? 'bg-primary shadow-primary/40 ring-4 ring-primary/20'
                    : 'bg-gradient-to-tr from-[#FF5A1F] to-[#FF9054] shadow-primary/30'
                }`}
              >
                <span
                  className="material-symbols-outlined text-white text-[30px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {voiceOn ? 'mic' : 'mic'}
                </span>
              </button>
            </div>

            {/* Share to community button */}
            <button
              onClick={() => navigate('/community?action=post')}
              className="w-full h-14 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg, #f7971e, #ffd200)" }}
            >
              <span className="material-symbols-outlined text-white text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                photo_camera
              </span>
              <span className="text-[16px] font-bold text-white tracking-tight">
                {t("Share your dish to community 🏆", "打卡分享到社区 🏆")}
              </span>
            </button>
          </div>
        </div>

        <div className="fixed inset-0 -z-10 bg-background pointer-events-none w-[390px] ml-auto mr-auto max-w-md left-0 right-0" />
      </div>
    </div>
  );
}
