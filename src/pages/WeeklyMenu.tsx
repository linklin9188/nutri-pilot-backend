/**
 * WeeklyMenu — 7-day meal plan UI
 * Design: consistent with Home.tsx (dark bg, white cards, #FF5A1F orange accents)
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useWeeklyMenu } from "../hooks/useWeeklyMenu";
import { type SupabaseDish } from "../hooks/useSupabaseMenu";

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

// Split dishes into 3 meal slots (roughly equal for display)
function splitToMeals(dishes: SupabaseDish[]): [SupabaseDish[], SupabaseDish[], SupabaseDish[]] {
  const copy = [...dishes];
  // breakfast: 1-2, lunch: 2, dinner: rest
  const breakfast = copy.splice(0, Math.min(1, Math.ceil(copy.length / 4)));
  const lunch      = copy.splice(0, Math.min(2, Math.ceil(copy.length / 2)));
  const dinner     = copy;
  return [breakfast, lunch, dinner];
}

// ── DishCard ──────────────────────────────────────────────────────────────────

function DishCard({ dish, small = false }: { dish: SupabaseDish; small?: boolean }) {
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
      {/* Title */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-white font-semibold leading-tight" style={{ fontSize: small ? 11 : 12 }}>
          {dish.title || dish.title_zh}
        </p>
        {!small && dish.description_en && (
          <p className="text-white/50 mt-0.5" style={{ fontSize: 10 }}>
            {dish.description_en}
          </p>
        )}
      </div>
    </div>
  );
}

// ── MealSection ───────────────────────────────────────────────────────────────

function MealSection({
  mealIdx,
  dishes,
}: {
  mealIdx: number;
  dishes: SupabaseDish[];
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
          <DishCard key={dish.id} dish={dish} />
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

// ── Main component ────────────────────────────────────────────────────────────

export default function WeeklyMenu() {
  const navigate = useNavigate();
  const { weeklyMenu, loading } = useWeeklyMenu();
  const isLoggedIn = !!localStorage.getItem("isLoggedIn");

  // Default to today's day index (Mon=0…Sun=6)
  const todayIdx = (() => {
    const d = new Date().getDay(); // 0=Sun…6=Sat
    return d === 0 ? 6 : d - 1;   // → 0=Mon…6=Sun
  })();
  const [selectedDay, setSelectedDay] = useState(todayIdx);
  const [showShoppingToast, setShowShoppingToast] = useState(false);

  // Get dishes for selected day
  const dayMenu = weeklyMenu?.days[selectedDay];
  const dishes  = dayMenu?.dishes ?? [];
  const [breakfast, lunch, dinner] = splitToMeals(dishes);
  const nutrition = getDayNutrition(dishes);

  function handleShoppingList() {
    if (!isLoggedIn) {
      navigate("/login");
      return;
    }
    // Future: navigate to shopping list page
    setShowShoppingToast(true);
    setTimeout(() => setShowShoppingToast(false), 2500);
  }

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden"
      style={{ background: "#0a0a0a", paddingBottom: 100 }}
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
          onClick={() => navigate(-1)}
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
        {/* Premium badge */}
        <div
          className="flex items-center gap-1 px-3 py-1 rounded-full"
          style={{ background: "linear-gradient(135deg, rgba(255,90,31,0.2), rgba(255,140,84,0.15))", border: "1px solid rgba(255,90,31,0.3)" }}
        >
          <span style={{ fontSize: 12 }}>✨</span>
          <span className="text-white/80 font-semibold" style={{ fontSize: 11 }}>AI 规划</span>
        </div>
      </div>

      {/* ── Day Tabs ────────────────────────────────────────────── */}
      <div className="relative z-10 px-5 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {DAYS.map((day, i) => {
            const isToday = i === todayIdx;
            const isSelected = i === selectedDay;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(i)}
                className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all active:scale-95"
                style={
                  isSelected
                    ? { background: "#FF5A1F", boxShadow: "0 4px 16px rgba(255,90,31,0.35)" }
                    : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }
                }
              >
                <span
                  className="font-semibold"
                  style={{ fontSize: 13, color: isSelected ? "white" : "rgba(255,255,255,0.65)" }}
                >
                  {day}
                </span>
                {isToday && (
                  <span
                    className="rounded-full"
                    style={{
                      width: 4, height: 4,
                      background: isSelected ? "rgba(255,255,255,0.8)" : "#FF5A1F",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Nutrition summary ────────────────────────────────────── */}
      {!loading && dishes.length > 0 && (
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

      {/* ── Meal sections ────────────────────────────────────────── */}
      <div className="relative z-10 flex-1">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="skeleton"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SkeletonDay />
            </motion.div>
          ) : (
            <motion.div key={selectedDay}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22, ease: "easeOut" }}>

              {dishes.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <span className="text-5xl mb-4 block">🍽️</span>
                  <p className="text-white/50" style={{ fontSize: 14 }}>
                    本周菜单正在生成中…
                  </p>
                  <p className="text-white/30 mt-1" style={{ fontSize: 12 }}>
                    请确保已设置您的口味偏好
                  </p>
                </div>
              ) : (
                <>
                  <MealSection mealIdx={0} dishes={breakfast} />
                  <MealSection mealIdx={1} dishes={lunch} />
                  <MealSection mealIdx={2} dishes={dinner} />
                </>
              )}

              {/* ── Week overview mini strip ── */}
              {weeklyMenu && dishes.length > 0 && (
                <div className="mx-5 mt-2 mb-4 rounded-2xl p-4"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-white/40 mb-3" style={{ fontSize: 11, letterSpacing: "0.06em" }}>
                    全周一览
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {weeklyMenu.days.map((day, i) => {
                      const firstDish = day.dishes[0];
                      const isActive  = i === selectedDay;
                      return (
                        <button key={i} onClick={() => setSelectedDay(i)}
                          className="flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all active:scale-90"
                          style={isActive
                            ? { background: "rgba(255,90,31,0.18)", border: "1px solid rgba(255,90,31,0.4)" }
                            : { background: "transparent" }
                          }>
                          <span className="text-white/40" style={{ fontSize: 9 }}>{DAYS[i].replace("周", "")}</span>
                          {firstDish ? (
                            <div className="w-8 h-8 rounded-xl overflow-hidden">
                              <img
                                src={firstDish.img || firstDish.image_url ||
                                  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop"}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={e => {
                                  (e.target as HTMLImageElement).src =
                                    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80&auto=format&fit=crop";
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-xl"
                              style={{ background: "rgba(255,255,255,0.06)" }} />
                          )}
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

      {/* ── Bottom CTA ───────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20 px-5 pb-8 pt-4"
        style={{ background: "linear-gradient(to top, #0a0a0a 60%, transparent 100%)" }}>
        <button
          onClick={handleShoppingList}
          className="w-full h-[56px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
            boxShadow: "0 8px 28px rgba(255,90,31,0.35)",
            fontSize: 15, color: "white",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>shopping_cart</span>
          一键生成本周购物清单
        </button>
        {!isLoggedIn && (
          <p className="text-center text-white/30 mt-2" style={{ fontSize: 11 }}>
            登录后解锁购物清单 · 自动归类食材
          </p>
        )}
      </div>

      {/* ── Toast ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showShoppingToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-white font-semibold"
            style={{ background: "rgba(30,30,30,0.95)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, backdropFilter: "blur(12px)" }}
          >
            🛒 购物清单功能即将上线
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
