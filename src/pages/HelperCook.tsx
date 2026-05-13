import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-5 pt-12 pb-4" style={{ background: '#0a0a0a' }}>
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate(localStorage.getItem('nutri_role') === 'helper' ? '/helper' : '/')}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <div>
            <h1 className="text-white font-black" style={{ fontSize: 22 }}>Today's Cooking</h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>Choose a dish to start · 今日菜单</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 pb-10 flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : dishes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-5xl">🍽</span>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' }}>
              No menu yet.{'\n'}Ask the employer to generate today's menu first.
            </p>
          </div>
        ) : (
          dishes.map((dish, i) => {
            const steps = dish.cook_steps_json ?? [];
            const mins = Math.round(totalCookMin(steps));
            const hasSteps = steps.length > 0;
            return (
              <button key={dish.id} onClick={() => onSelect(dish)}
                className="w-full rounded-3xl overflow-hidden active:scale-[0.97] transition-transform text-left"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {/* Dish image */}
                <div className="relative w-full" style={{ height: 140 }}>
                  {dish.image_url ? (
                    <img src={dish.image_url} alt={dish.title_zh}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 40 }}>🍳</span>
                    </div>
                  )}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }} />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                    <h2 className="text-white font-bold" style={{ fontSize: 18 }}>{dish.title_zh}</h2>
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
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: hasSteps ? '#25D366' : 'rgba(255,255,255,0.3)' }}>
                      {hasSteps ? 'check_circle' : 'hourglass_empty'}
                    </span>
                    <span style={{ fontSize: 12, color: hasSteps ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>
                      {hasSteps ? `${steps.length} steps` : 'Steps generating…'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ background: hasSteps ? 'rgba(255,90,31,0.2)' : 'rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: hasSteps ? '#FF5A1F' : 'rgba(255,255,255,0.25)' }}>
                      {hasSteps ? 'Start cooking ›' : 'Not ready'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </main>
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
  const steps = dish.cook_steps_json ?? [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<Record<number, TimerState>>({});
  const activeTimerRef = useRef<number | null>(null);

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

  if (!step) return null;

  const durationSec = Math.round(step.duration_min * 60);
  const hasTimer = durationSec > 0;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#0a0a0a' }}>

      {/* Header */}
      <header className="sticky top-0 z-50 px-5 pt-12 pb-4" style={{ background: '#0a0a0a' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-black leading-tight" style={{ fontSize: 17 }}>
              {dish.title_en || dish.title_zh}
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
              Step {currentIdx + 1} of {steps.length} · {completedCount} done
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
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
                background: completed.has(i) ? '#25D366' : i === currentIdx ? '#FF5A1F' : 'rgba(255,255,255,0.15)',
              }} />
          ))}
        </div>
      </header>

      <main className="flex-1 px-5 pb-6 flex flex-col gap-4">

        {/* Heat level indicator */}
        {heatCfg && (
          <div className="rounded-3xl px-5 py-4 flex items-center gap-4"
            style={{ background: heatCfg.light, border: `1.5px solid ${heatCfg.border}` }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-3xl"
              style={{ background: heatCfg.bg + '22' }}>
              {heatCfg.icon}
            </div>
            <div>
              <p className="font-black" style={{ fontSize: 26, color: heatCfg.bg, lineHeight: 1 }}>
                {heat.label}
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                {heat.sublabel}
              </p>
            </div>
          </div>
        )}

        {/* Step action text */}
        <div className="rounded-3xl px-5 py-5 flex-1"
          style={{ background: isDone ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${isDone ? 'rgba(37,211,102,0.25)' : 'rgba(255,255,255,0.1)'}` }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-[14px]"
              style={{ background: isDone ? '#25D366' : '#FF5A1F' }}>
              {isDone ? '✓' : step.step}
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
              {isDone ? 'Done ✓' : 'Current step'}
            </span>
          </div>
          <p className="text-white leading-relaxed" style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.6 }}>
            {step.action_en || step.action_zh}
          </p>
          {step.action_en && step.action_zh && (
            <p className="mt-3" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
              {step.action_zh}
            </p>
          )}
        </div>

        {/* Timer */}
        {hasTimer && (
          <button onClick={handleTimer}
            className="w-full rounded-3xl py-5 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
            style={{
              background: timerDone ? 'rgba(37,211,102,0.12)' : timerRunning ? 'rgba(255,90,31,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1.5px solid ${timerDone ? 'rgba(37,211,102,0.3)' : timerRunning ? 'rgba(255,90,31,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}>
            <div className="font-black tabular-nums" style={{
              fontSize: 52,
              letterSpacing: 2,
              color: timerDone ? '#25D366' : timerRunning ? '#FF5A1F' : 'rgba(255,255,255,0.6)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {timerDone ? 'Done!' : formatTime(timerRemaining)}
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined" style={{
                fontSize: 18,
                color: timerDone ? '#25D366' : timerRunning ? '#FF5A1F' : 'rgba(255,255,255,0.4)',
                fontVariationSettings: "'FILL' 1",
              }}>
                {timerDone ? 'check_circle' : timerRunning ? 'pause_circle' : 'play_circle'}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: timerDone ? '#25D366' : timerRunning ? '#FF5A1F' : 'rgba(255,255,255,0.4)',
              }}>
                {timerDone ? 'Timer done ✓' : timerRunning ? `Tap to pause` : `Tap to resume`}
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
            style={{ background: 'rgba(37,211,102,0.12)', border: '1.5px solid rgba(37,211,102,0.3)' }}>
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-black text-white" style={{ fontSize: 18 }}>{dish.title_zh} 完成！</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
              {dishIndex + 1} / {dishes.length} 道菜
            </p>
          </div>
          {nextDish ? (
            <button onClick={() => onNextDish(nextDish)}
              className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF9054)', fontSize: 15, boxShadow: '0 8px 24px rgba(255,90,31,0.35)' }}>
              开始下一道：{nextDish.title_zh}
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_forward_ios</span>
            </button>
          ) : (
            <div className="rounded-2xl p-4 text-center"
              style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)' }}>
              <p className="font-black text-white" style={{ fontSize: 16 }}>全部完成！今日菜肴上桌 🍽️</p>
            </div>
          )}
          <button onClick={onBack}
            className="w-full h-12 rounded-2xl flex items-center justify-center font-semibold"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            返回菜单列表
          </button>
        </div>
      ) : (
        <div className="px-5 pb-10 flex gap-3">
          <button onClick={() => goTo(currentIdx - 1)} disabled={isFirst}
            className="flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back_ios</span>
            <span className="text-white font-bold" style={{ fontSize: 14 }}>Back</span>
          </button>

          {isLast ? (
            <button onClick={markDoneAndNext}
              className="flex-[2] h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', fontSize: 15 }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              完成这道菜！
            </button>
          ) : (
            <button onClick={markDoneAndNext}
              className="flex-[2] h-14 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF9054)', fontSize: 15 }}>
              Done, next step
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const raw = localStorage.getItem('generatedMenu');
        if (!raw) { setLoading(false); return; }
        const todayDishes: any[] = JSON.parse(raw);
        const ids = todayDishes.map((d: any) => d.id).filter(Boolean);
        if (ids.length === 0) { setDishes(todayDishes); setLoading(false); return; }

        const { data } = await supabase
          .from('dishes')
          .select('id, title_zh, title_en, image_url, cook_steps_json')
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
  }, []);

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
