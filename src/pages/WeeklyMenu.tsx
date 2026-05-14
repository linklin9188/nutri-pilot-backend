/**
 * WeeklyMenu — 7-day meal plan UI
 * Design: consistent with Home.tsx (dark bg, white cards, #FF5A1F orange accents)
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useWeeklyMenu } from "../hooks/useWeeklyMenu";
import { type SupabaseDish } from "../hooks/useSupabaseMenu";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";
import {
  loadFamilyMembers, loadHomeToday, saveHomeToday, dishAllergyFor,
  ALLERGY_INGREDIENTS,
  type FamilyMember,
} from "../lib/familyPrefs";
import { useSubscription } from "../lib/subscription";
import { elevateDayToMichelin, type MichelinDish } from "../lib/geminiMichelin";

// ── Day tabs ──────────────────────────────────────────────────────────────────

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const MEALS = [
  { label: "早餐", icon: "☀️", color: "#FF9F43" },
  { label: "午餐", icon: "🌤️", color: "#FF5A1F" },
  { label: "晚餐", icon: "🌙", color: "#6C5CE7" },
];

// Nutrition estimate per dish type (rough, for display only)
const NUTRITION_BY_TYPE: Record<string, { cal: number; pro: number; fat: number; carb: number }> = {
  MEAT:    { cal: 320, pro: 28, fat: 18, carb: 8  },
  SEAFOOD: { cal: 220, pro: 32, fat: 8,  carb: 4  },
  VEGGIE:  { cal: 120, pro: 6,  fat: 4,  carb: 18 },
  SOUP:    { cal: 80,  pro: 5,  fat: 2,  carb: 10 },
  DIMSUM:  { cal: 180, pro: 8,  fat: 6,  carb: 24 },
  MAIN:    { cal: 280, pro: 14, fat: 10, carb: 36 },
  DRINK:   { cal: 60,  pro: 1,  fat: 0,  carb: 14 },
};

function getDayNutrition(dishes: SupabaseDish[]) {
  return dishes.reduce(
    (acc, d) => {
      const n = NUTRITION_BY_TYPE[d.type ?? "MAIN"] ?? NUTRITION_BY_TYPE.MAIN;
      return {
        cal:  acc.cal  + n.cal,
        pro:  acc.pro  + n.pro,
        fat:  acc.fat  + n.fat,
        carb: acc.carb + n.carb,
      };
    },
    { cal: 0, pro: 0, fat: 0, carb: 0 }
  );
}

// Pick breakfast dishes for a given day from the pool (deterministic rotation)
function pickBreakfast(pool: SupabaseDish[], dayIndex: number): SupabaseDish[] {
  if (pool.length === 0) return [];
  const count = 1;
  const start = (dayIndex * count) % pool.length;
  const result: SupabaseDish[] = [];
  for (let i = 0; i < count; i++) {
    result.push(pool[(start + i) % pool.length]);
  }
  return result;
}

// ── DishCard ──────────────────────────────────────────────────────────────────

function DishCard({ dish, small = false, familyMembers = [], homeToday = [], michelin }: {
  dish: SupabaseDish; small?: boolean;
  familyMembers?: FamilyMember[];
  homeToday?: string[];
  michelin?: MichelinDish;
}) {
  const activeMembers = familyMembers.filter(m => homeToday.includes(m.id));
  const cannotEat = activeMembers.length > 0 ? dishAllergyFor(dish as any, activeMembers) : [];
  const typeColor: Record<string, string> = {
    MEAT:    "#FF5A1F",
    SEAFOOD: "#00B4D8",
    VEGGIE:  "#2ECC71",
    SOUP:    "#F39C12",
    DIMSUM:  "#9B59B6",
    MAIN:    "#3498DB",
    DRINK:   "#1ABC9C",
  };
  const typeLabel: Record<string, string> = {
    MEAT:    "荤",
    SEAFOOD: "海鲜",
    VEGGIE:  "素",
    SOUP:    "汤",
    DIMSUM:  "点心",
    MAIN:    "主食",
    DRINK:   "饮品",
  };
  const tc = typeColor[dish.type ?? "MAIN"] ?? "#FF5A1F";
  const tl = typeLabel[dish.type ?? "MAIN"] ?? dish.type;

  const imgSrc = dish.img || dish.image_url
    ? (dish.img || dish.image_url)
    : `https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=400&auto=format&fit=crop`;

  return (
    <div
      className={`relative flex-shrink-0 rounded-2xl overflow-hidden bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)] ${small ? "w-28" : "w-36"}`}
      style={{ aspectRatio: "3/4" }}
    >
      {/* Image */}
      <img
        src={imgSrc}
        alt={dish.title || dish.title_zh}
        className="absolute inset-0 w-full h-full object-cover"
        onError={e => {
          (e.target as HTMLImageElement).src =
            "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=400&auto=format&fit=crop";
        }}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)"
      }} />
      {/* Type badge */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white font-semibold"
        style={{ background: tc, fontSize: 10, letterSpacing: "0.04em" }}>
        {tl}
      </div>
      {/* Michelin star badge */}
      {michelin && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full font-bold"
          style={{
            background: "linear-gradient(135deg, #FFD700, #FFA500)",
            color: "#1a1a1a", fontSize: 9, letterSpacing: "0.04em",
            boxShadow: "0 2px 6px rgba(255,165,0,0.4)",
          }}>
          ⭐ {michelin.prep_minutes}分
        </div>
      )}
      {/* Title */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-white font-semibold leading-tight" style={{ fontSize: small ? 11 : 12 }}>
          {michelin?.name_zh || dish.title || dish.title_zh}
        </p>
        {michelin ? (
          <p className="mt-0.5 leading-tight" style={{ fontSize: 9, color: "#FFD700" }}>
            ⭐ {michelin.technique}
          </p>
        ) : !small && dish.description_en && (
          <p className="text-white/50 mt-0.5" style={{ fontSize: 10 }}>
            {dish.description_en}
          </p>
        )}
        {/* Member badge: show who can't eat this dish */}
        {cannotEat.length > 0 && (
          <div className="flex items-center gap-0.5 mt-1 flex-wrap">
            <span style={{ fontSize: 9, color: 'rgba(255,180,0,0.85)', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '1px 4px' }}>
              🚫 {cannotEat.map(m => m.name).join('/')} 不吃
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MealSection ───────────────────────────────────────────────────────────────

function MealSection({
  mealIdx, dishes, familyMembers = [], homeToday = [], michelinByDishId = {},
}: {
  mealIdx: number; dishes: SupabaseDish[];
  familyMembers?: FamilyMember[]; homeToday?: string[];
  michelinByDishId?: Record<string, MichelinDish>;
}) {
  const meal = MEALS[mealIdx];

  if (dishes.length === 0) {
    return (
      <div className="mb-4 px-5">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 16 }}>{meal.icon}</span>
          <span className="font-semibold text-white/70" style={{ fontSize: 13 }}>{meal.label}</span>
        </div>
        <div className="rounded-2xl flex items-center justify-center py-6"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.12)" }}>
          <span className="text-white/30" style={{ fontSize: 12 }}>暂无推荐，AI 正在学习您的口味</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {/* Meal label */}
      <div className="flex items-center gap-2 mb-3 px-5">
        <span style={{ fontSize: 16 }}>{meal.icon}</span>
        <span className="font-semibold text-white/80" style={{ fontSize: 13 }}>{meal.label}</span>
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        <span className="text-white/30" style={{ fontSize: 11 }}>{dishes.length} 道菜</span>
      </div>
      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
        {dishes.map(dish => (
          <DishCard key={dish.id} dish={dish}
            familyMembers={familyMembers} homeToday={homeToday}
            michelin={michelinByDishId[dish.id]} />
        ))}
      </div>
    </div>
  );
}

// ── NutritionBar ─────────────────────────────────────────────────────────────

function NutritionBar({ label, value, max, color, unit = "g" }: {
  label: string; value: number; max: number; color: string; unit?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/40 w-6" style={{ fontSize: 10 }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="text-white/50 w-12 text-right" style={{ fontSize: 10 }}>{value}{unit}</span>
    </div>
  );
}

// ── SkeletonDay ───────────────────────────────────────────────────────────────

function SkeletonDay() {
  return (
    <div className="px-5 animate-pulse">
      {[0, 1, 2].map(i => (
        <div key={i} className="mb-5">
          <div className="h-4 w-20 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex gap-3">
            {[0, 1, 2].map(j => (
              <div key={j} className="rounded-2xl w-36 flex-shrink-0"
                style={{ aspectRatio: "3/4", background: "rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Free tier: how many days are unlocked without login ──────────────────────
const FREE_DAYS = 3; // today + next 2 days visible; rest locked

// ── Locked day overlay ────────────────────────────────────────────────────────
function LockedDayCard({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="mx-5 mt-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl overflow-hidden relative"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Blurred preview rows */}
        <div className="px-5 pt-5 pb-2" style={{ filter: "blur(5px)", pointerEvents: "none", userSelect: "none" }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-3 mb-4">
              {[0, 1, 2].map(j => (
                <div key={j} className="rounded-2xl flex-shrink-0"
                  style={{ width: 90, height: 120, background: `rgba(255,255,255,${0.06 + j * 0.02})` }} />
              ))}
            </div>
          ))}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "linear-gradient(to bottom, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0.85) 50%)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "rgba(255,90,31,0.15)", border: "1.5px solid rgba(255,90,31,0.35)" }}>
            <span className="material-symbols-outlined text-[#FF5A1F]" style={{ fontSize: 28 }}>lock</span>
          </div>
          <p className="text-white font-bold mb-1" style={{ fontSize: 16 }}>登录后查看完整周菜单</p>
          <p className="text-white/40 mb-5" style={{ fontSize: 12 }}>免费账号可解锁 7 天完整菜单</p>
          <button onClick={onUnlock}
            className="px-8 h-11 rounded-2xl font-semibold flex items-center gap-2 transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
              boxShadow: "0 6px 20px rgba(255,90,31,0.35)",
              fontSize: 14, color: "white",
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>login</span>
            立即登录
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WeeklyMenu() {
  const navigate = useNavigate();
  const { weeklyMenu, loading } = useWeeklyMenu();
  const isLoggedIn = !!localStorage.getItem("isLoggedIn");

  // Default to today's day index (Mon=0…Sun=6)
  const todayIdx = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();
  const [selectedDay, setSelectedDay] = useState(todayIdx);
  const [breakfastPool, setBreakfastPool] = useState<SupabaseDish[]>([]);

  // Michelin-mode toggle. The toggle exists for everyone, but only Pro users
  // can actually activate it; free users tapping it land on /pricing.
  const { isPro } = useSubscription();
  const [michelinMode, setMichelinMode] = useState(false);
  // Michelin overlay state, keyed by dish.id so we can map back per-card.
  const [michelinByDishId, setMichelinByDishId] = useState<Record<string, MichelinDish>>({});
  // Per-date load/error tracking so flipping days mid-load doesn't re-trigger.
  const [michelinLoadingDates, setMichelinLoadingDates] = useState<Set<string>>(new Set());
  const [michelinDoneDates,    setMichelinDoneDates]    = useState<Set<string>>(new Set());
  const [michelinErrorMsg,     setMichelinErrorMsg]     = useState<string | null>(null);

  // Family member state
  const [familyMembers] = useState<FamilyMember[]>(() => loadFamilyMembers());
  const [homeToday, setHomeToday] = useState<string[]>(() =>
    loadHomeToday(familyMembers)
  );

  // Fetch real breakfast dishes from DB once
  useEffect(() => {
    supabase
      .from('dishes')
      .select('*')
      .eq('meal_type', 'breakfast')
      .limit(30)
      .then(({ data }) => {
        if (data && data.length > 0) setBreakfastPool(data as SupabaseDish[]);
      });
  }, []);

  // Free users can only view days 0–2 (Mon/Tue/Wed)
  const isDayLocked = (i: number) =>
    !isLoggedIn && (i < todayIdx || i >= todayIdx + FREE_DAYS);
  const effectiveDay = isDayLocked(selectedDay) ? todayIdx : selectedDay;

  const dayMenu  = weeklyMenu?.days[effectiveDay];
  const dinner   = dayMenu?.dishes ?? [];
  const lunch    = dayMenu?.lunchDishes ?? [];
  const breakfast = pickBreakfast(breakfastPool, effectiveDay);
  const nutrition = getDayNutrition([...lunch, ...dinner]);

  // Avoid-ingredients union for the household (only members at home today).
  const avoidIngredients = useMemo(() => {
    const active = familyMembers.filter(m => homeToday.includes(m.id));
    const set = new Set<string>();
    for (const m of active) {
      for (const a of m.allergies) {
        for (const ing of ALLERGY_INGREDIENTS[a] ?? []) set.add(ing);
      }
    }
    return Array.from(set);
  }, [familyMembers, homeToday]);

  // Trigger Gemini Michelin elevation for the currently-viewed day when:
  //   • Pro user has toggled Michelin ON
  //   • this date hasn't been elevated yet and isn't currently loading
  //   • there's lunch / dinner data to elevate (skip if the day is empty)
  useEffect(() => {
    if (!michelinMode || !isPro) return;
    if (!dayMenu || !dayMenu.date) return;
    const date = dayMenu.date;
    if (michelinDoneDates.has(date) || michelinLoadingDates.has(date)) return;
    const dishes = [...lunch, ...dinner];
    if (dishes.length === 0) return;

    setMichelinErrorMsg(null);
    setMichelinLoadingDates(prev => { const n = new Set(prev); n.add(date); return n; });

    elevateDayToMichelin({
      date,
      dayLabel: dayMenu.dayLabel,
      avoidIngredients,
      dishes: dishes.map(d => ({
        id: d.id,
        title_zh: d.title_zh,
        main_ingredient: d.main_ingredient,
        course_type: d.course_type ?? d.type,
      })),
    })
      .then(result => {
        setMichelinByDishId(prev => {
          const next = { ...prev };
          for (const md of result.dishes) next[md.source_id] = md;
          return next;
        });
        setMichelinDoneDates(prev => { const n = new Set(prev); n.add(date); return n; });
      })
      .catch(err => {
        console.error('[Michelin] elevation failed', err);
        setMichelinErrorMsg(err?.message ?? '米其林生成失败');
      })
      .finally(() => {
        setMichelinLoadingDates(prev => { const n = new Set(prev); n.delete(date); return n; });
      });
  // We intentionally trigger off the elevated-day key, not the dish array
  // identity, so swapping homeToday doesn't blow away cached elevations.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [michelinMode, isPro, dayMenu?.date, lunch.length, dinner.length]);

  const currentDate = dayMenu?.date ?? '';
  const isElevating = michelinMode && isPro && michelinLoadingDates.has(currentDate);
  const overlayForDay = (michelinMode && isPro) ? michelinByDishId : {};

  function handleShoppingList() {
    if (!isLoggedIn) {
      navigate('/signin');
      return;
    }
    // Write all weekly dishes to localStorage so VerifyIngredients can read them
    if (weeklyMenu) {
      const allDishes = weeklyMenu.days.flatMap(d => d.dishes);
      localStorage.setItem('generatedMenu', JSON.stringify(allDishes));
    }
    navigate('/verify');
  }

  function handleDayClick(i: number) {
    if (isDayLocked(i)) {
      // Scroll to lock card (it's already visible below), just let tap show it
      setSelectedDay(i); // will show locked state
    } else {
      setSelectedDay(i);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden"
      style={{ background: "#0a0a0a", paddingBottom: 140 }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div style={{
          background: "radial-gradient(ellipse at 70% 0%, rgba(255,90,31,0.12) 0%, transparent 60%)",
          position: "absolute", inset: 0,
        }} />
        <div style={{
          background: "radial-gradient(ellipse at 30% 80%, rgba(108,92,231,0.08) 0%, transparent 60%)",
          position: "absolute", inset: 0,
        }} />
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center gap-4 px-5 pt-14 pb-4">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-2xl flex items-center justify-center transition-all active:scale-90"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-serif font-black text-white" style={{ fontSize: 22, letterSpacing: "0.01em" }}>
            本周菜单
          </h1>
          <p className="text-white/35" style={{ fontSize: 11, letterSpacing: "0.04em" }}>
            {weeklyMenu?.weekStart
              ? `本周从 ${weeklyMenu.weekStart.slice(5).replace("-", "/")} 开始`
              : "AI 智能规划 · 每周更新"}
          </p>
        </div>
        {/* Mode toggle: AI 规划 ↔ 米其林 (Pro) */}
        <button
          onClick={() => {
            if (!isPro) { navigate("/pricing"); return; }
            setMichelinMode(m => !m);
          }}
          className="flex items-center gap-1 px-3 py-1 rounded-full transition-all active:scale-95"
          style={michelinMode && isPro
            ? { background: "linear-gradient(135deg, #FFD700, #FFA500)", border: "1px solid rgba(255,215,0,0.6)", boxShadow: "0 4px 14px rgba(255,165,0,0.30)" }
            : { background: "linear-gradient(135deg, rgba(255,90,31,0.2), rgba(255,140,84,0.15))", border: "1px solid rgba(255,90,31,0.3)" }
          }
        >
          <span style={{ fontSize: 12 }}>{michelinMode && isPro ? "⭐" : "✨"}</span>
          <span className="font-semibold" style={{ fontSize: 11, color: michelinMode && isPro ? "#1a1a1a" : "rgba(255,255,255,0.80)" }}>
            {michelinMode && isPro ? "米其林" : isPro ? "AI 规划" : "升级米其林"}
          </span>
        </button>
      </div>

      {/* ── Day Tabs ────────────────────────────────────────────── */}
      <div className="relative z-10 px-5 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {DAYS.map((day, i) => {
            const isToday    = i === todayIdx;
            const isSelected = i === selectedDay;
            const locked     = isDayLocked(i);
            return (
              <button
                key={day}
                onClick={() => handleDayClick(i)}
                className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all active:scale-95"
                style={
                  locked
                    ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", opacity: 0.5 }
                    : isSelected
                      ? { background: "#FF5A1F", boxShadow: "0 4px 16px rgba(255,90,31,0.35)" }
                      : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }
                }
              >
                <span
                  className="font-semibold"
                  style={{ fontSize: 13, color: locked ? "rgba(255,255,255,0.35)" : isSelected ? "white" : "rgba(255,255,255,0.65)" }}
                >
                  {day}
                </span>
                {locked ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>lock</span>
                ) : isToday ? (
                  <span className="rounded-full" style={{
                    width: 4, height: 4,
                    background: isSelected ? "rgba(255,255,255,0.8)" : "#FF5A1F",
                  }} />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Free tier hint */}
        {!isLoggedIn && (
          <p className="mt-2 text-white/30" style={{ fontSize: 11, letterSpacing: "0.04em" }}>
            🔓 免费查看今天起 3 天 · 登录解锁完整 7 天
          </p>
        )}

        {/* Michelin elevation status — only when toggle is ON */}
        {michelinMode && isPro && isElevating && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(255,215,0,0.10)", border: "1px solid rgba(255,215,0,0.25)" }}>
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14, color: "#FFD700" }}>
              progress_activity
            </span>
            <span style={{ fontSize: 11, color: "#FFD700", letterSpacing: "0.04em" }}>
              米其林大厨正在重新设计这一天的菜品…
            </span>
          </div>
        )}
        {michelinMode && isPro && michelinErrorMsg && !isElevating && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.25)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#FF8C54" }}>
              error_outline
            </span>
            <span style={{ fontSize: 11, color: "#FF8C54", letterSpacing: "0.04em" }}>
              {michelinErrorMsg}
            </span>
          </div>
        )}
      </div>

      {/* ── 谁在家今天 ────────────────────────────────────────────── */}
      {familyMembers.length > 0 && (
        <div className="relative z-10 px-5 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/40" style={{ fontSize: 11 }}>谁在家：</span>
            {familyMembers.map(m => {
              const isHome = homeToday.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    const next = isHome
                      ? homeToday.filter(id => id !== m.id)
                      : [...homeToday, m.id];
                    setHomeToday(next);
                    saveHomeToday(next);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full transition-all active:scale-95"
                  style={isHome
                    ? { background: "rgba(255,90,31,0.25)", border: "1px solid rgba(255,90,31,0.5)" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }
                  }
                >
                  <span style={{ fontSize: 13 }}>{m.emoji}</span>
                  <span style={{ fontSize: 11, color: isHome ? "#FF8C54" : "rgba(255,255,255,0.45)" }}>
                    {m.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Content area: show meals OR lock card ─────────────────── */}
      {isDayLocked(selectedDay) ? (
        <div className="relative z-10 flex-1">
          <LockedDayCard onUnlock={() => navigate('/signin')} />
        </div>
      ) : (
        <>
          {/* ── Nutrition summary ────────────────────────────────── */}
          {!loading && dinner.length > 0 && (
            <div className="relative z-10 mx-5 mb-5 rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-white/80" style={{ fontSize: 13 }}>今日营养概览</span>
                <span className="font-black text-white" style={{ fontSize: 18 }}>
                  {nutrition.cal}
                  <span className="text-white/40 font-normal" style={{ fontSize: 11 }}> kcal</span>
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <NutritionBar label="蛋白" value={nutrition.pro} max={150} color="#FF5A1F" />
                <NutritionBar label="碳水" value={nutrition.carb} max={300} color="#F39C12" />
                <NutritionBar label="脂肪" value={nutrition.fat} max={80}  color="#6C5CE7" />
              </div>
            </div>
          )}

          {/* ── Meal sections ────────────────────────────────────── */}
          <div className="relative z-10 flex-1">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="skeleton"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SkeletonDay />
                </motion.div>
              ) : (
                <motion.div key={effectiveDay}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}>

                  {dinner.length === 0 && lunch.length === 0 && breakfast.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <span className="text-5xl mb-4 block">🍽️</span>
                      <p className="text-white/50" style={{ fontSize: 14 }}>本周菜单正在生成中…</p>
                      <p className="text-white/30 mt-1" style={{ fontSize: 12 }}>请确保已设置您的口味偏好</p>
                    </div>
                  ) : (
                    <>
                      <MealSection mealIdx={0} dishes={breakfast} familyMembers={familyMembers} homeToday={homeToday} michelinByDishId={overlayForDay} />
                      <MealSection mealIdx={1} dishes={lunch}     familyMembers={familyMembers} homeToday={homeToday} michelinByDishId={overlayForDay} />
                      <MealSection mealIdx={2} dishes={dinner}    familyMembers={familyMembers} homeToday={homeToday} michelinByDishId={overlayForDay} />
                    </>
                  )}

                  {/* ── Week overview mini strip ── */}
                  {weeklyMenu && dinner.length > 0 && (
                    <div className="mx-5 mt-2 mb-4 rounded-2xl p-4"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <p className="text-white/40 mb-3" style={{ fontSize: 11, letterSpacing: "0.06em" }}>全周一览</p>
                      <div className="grid grid-cols-7 gap-1">
                        {weeklyMenu.days.map((day, i) => {
                          const firstDish = day.dishes[0];
                          const isActive  = i === effectiveDay;
                          const locked    = isDayLocked(i);
                          return (
                            <button key={i} onClick={() => handleDayClick(i)}
                              className="flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all active:scale-90 relative"
                              style={isActive
                                ? { background: "rgba(255,90,31,0.18)", border: "1px solid rgba(255,90,31,0.4)" }
                                : { background: "transparent", opacity: locked ? 0.4 : 1 }
                              }>
                              <span className="text-white/40" style={{ fontSize: 9 }}>{DAYS[i].replace("周", "")}</span>
                              <div className="w-8 h-8 rounded-xl overflow-hidden relative">
                                {firstDish && !locked ? (
                                  <img
                                    src={firstDish.img || firstDish.image_url || "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop"}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop"; }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"
                                    style={{ background: "rgba(255,255,255,0.06)" }}>
                                    {locked && <span className="material-symbols-outlined text-white/30" style={{ fontSize: 12 }}>lock</span>}
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ── Bottom CTA ───────────────────────────────────────────── */}
      {/* ── Shopping list CTA (above tab bar) ─────────────────── */}
      <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-20 px-5 pt-3 pb-2"
        style={{ bottom: 64, background: "linear-gradient(to top, #0a0a0a 55%, transparent 100%)" }}>
        <button
          onClick={handleShoppingList}
          className="w-full h-[52px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: isLoggedIn
              ? "linear-gradient(135deg, #FF5A1F, #FF8C54)"
              : "rgba(255,255,255,0.08)",
            boxShadow: isLoggedIn ? "0 8px 28px rgba(255,90,31,0.35)" : "none",
            border: isLoggedIn ? "none" : "1px solid rgba(255,255,255,0.12)",
            fontSize: 15, color: isLoggedIn ? "white" : "rgba(255,255,255,0.45)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {isLoggedIn ? "shopping_cart" : "lock"}
          </span>
          {isLoggedIn ? "一键生成本周购物清单" : "登录后生成购物清单"}
        </button>
      </div>

      <BottomTabBar />
    </div>
  );
}
