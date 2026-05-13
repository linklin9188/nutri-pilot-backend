/**
 * Banquet — Pro feature: plan a multi-course menu for 10–20 guests
 *
 * Flow: 1) choose occasion → 2) headcount (adults/kids/elders) →
 *       3) cuisine style → 4) generated menu (with per-dish swap).
 *
 * Free users hitting this route are redirected to /pricing by ProGate; the
 * Home entry card already shows the Pro badge so this is the second guard.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  OCCASIONS, CUISINES, planBanquet, swapBanquetDish,
  type BanquetOccasion, type CuisineStyle, type BanquetMenu, type BanquetCourse,
} from "../lib/banquet";
import { useSubscription } from "../lib/subscription";
import BottomTabBar from "../components/BottomTabBar";

type Step = "occasion" | "headcount" | "cuisine" | "result";

export default function Banquet() {
  const navigate = useNavigate();
  const { isPro, loading } = useSubscription();

  const [step, setStep]             = useState<Step>("occasion");
  const [occasion, setOccasion]     = useState<BanquetOccasion>("friends");
  const [adults, setAdults]         = useState(10);
  const [kids, setKids]             = useState(0);
  const [elders, setElders]         = useState(0);
  const [cuisine, setCuisine]       = useState<CuisineStyle>("chinese");

  const [generating, setGenerating] = useState(false);
  const [menu, setMenu]             = useState<BanquetMenu | null>(null);
  const [swapping, setSwapping]     = useState<string | null>(null);

  // ── Pro gate ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#FF5A1F] rounded-full animate-spin" />
      </div>
    );
  }
  if (!isPro) {
    // Redirect to pricing. Push state so back works.
    navigate("/pricing", { replace: true });
    return null;
  }

  // ── Flow handlers ────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await planBanquet({
        occasion, adults, kids, elders, cuisineStyle: cuisine,
      });
      setMenu(result);
      setStep("result");
    } catch (e) {
      console.error("planBanquet failed:", e);
      alert("生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSwap(courseKey: BanquetCourse["key"], dishId: string) {
    if (!menu) return;
    setSwapping(dishId);
    try {
      const replacement = await swapBanquetDish(menu, courseKey, dishId);
      if (!replacement) {
        alert("没有更多同类菜可换");
        return;
      }
      setMenu({
        ...menu,
        courses: menu.courses.map(c =>
          c.key !== courseKey ? c : {
            ...c,
            dishes: c.dishes.map(d => d.id === dishId ? replacement : d),
          }
        ),
      });
    } finally {
      setSwapping(null);
    }
  }

  const totalGuests = adults + kids + elders;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f5f5f5]">
      <Header step={step} onBack={() => {
        if (step === "occasion") navigate(-1);
        else if (step === "headcount") setStep("occasion");
        else if (step === "cuisine")   setStep("headcount");
        else                            setStep("cuisine");
      }} />

      <main className="flex-1 px-5 py-5 pb-32 space-y-5">
        <AnimatePresence mode="wait">
          {step === "occasion" && (
            <OccasionStep key="occ" value={occasion} onChange={v => { setOccasion(v); setStep("headcount"); }} />
          )}
          {step === "headcount" && (
            <HeadcountStep key="head"
              adults={adults} kids={kids} elders={elders}
              setAdults={setAdults} setKids={setKids} setElders={setElders}
              total={totalGuests}
              onNext={() => setStep("cuisine")} />
          )}
          {step === "cuisine" && (
            <CuisineStep key="cui"
              value={cuisine} onChange={setCuisine}
              onGenerate={handleGenerate}
              generating={generating} />
          )}
          {step === "result" && menu && (
            <ResultStep key="res"
              menu={menu}
              swapping={swapping}
              onSwap={handleSwap}
              onRestart={() => { setMenu(null); setStep("occasion"); }} />
          )}
        </AnimatePresence>
      </main>

      <BottomTabBar />
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ step, onBack }: { step: Step; onBack: () => void }) {
  const labels: Record<Step, { title: string; sub: string }> = {
    occasion:  { title: "宴请规划", sub: "1 / 3 · 选择场合" },
    headcount: { title: "宴请规划", sub: "2 / 3 · 人数与构成" },
    cuisine:   { title: "宴请规划", sub: "3 / 3 · 菜系风格" },
    result:    { title: "宴会菜单", sub: "已为你安排" },
  };
  const { title, sub } = labels[step];
  return (
    <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
      <button
        onClick={onBack}
        className="p-2 rounded-full bg-black/5 active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      </button>
      <div className="flex-1">
        <h1 className="text-[18px] font-bold">{title}</h1>
        <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
      </div>
      <span
        className="text-[10px] font-bold px-2 py-1 rounded-full"
        style={{
          background: "linear-gradient(135deg, #FFD700, #FFA500)",
          color: "white",
        }}
      >
        ⭐ Pro
      </span>
    </header>
  );
}

// ── Step 1: Occasion ──────────────────────────────────────────────────────────

function OccasionStep({
  value, onChange,
}: { value: BanquetOccasion; onChange: (v: BanquetOccasion) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <p className="text-[13px] text-gray-500 px-1">什么场合？AI 会根据场合调菜</p>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(OCCASIONS) as BanquetOccasion[]).map(key => {
          const o = OCCASIONS[key];
          const active = value === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="rounded-2xl p-4 text-left transition-all active:scale-[0.97]"
              style={{
                background: "white",
                border: active ? "2px solid #FF5A1F" : "2px solid transparent",
                boxShadow: active ? "0 8px 24px rgba(255,90,31,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <p className="text-[32px] mb-1">{o.emoji}</p>
              <p className="font-bold text-[14px]">{o.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{o.sub}</p>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Step 2: Headcount ─────────────────────────────────────────────────────────

function HeadcountStep({
  adults, kids, elders, setAdults, setKids, setElders, total, onNext,
}: {
  adults: number; kids: number; elders: number;
  setAdults: (n: number) => void; setKids: (n: number) => void; setElders: (n: number) => void;
  total: number; onNext: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <p className="text-[13px] text-gray-500 px-1">大概多少人？儿童 / 长辈分开填，菜会更贴心</p>

      <Stepper label="大人"    emoji="🧑" min={0} max={40} value={adults} onChange={setAdults} hint="每人约 1 道菜量" />
      <Stepper label="小朋友"  emoji="🧒" min={0} max={20} value={kids}   onChange={setKids}   hint="≥1 人会保留 2 道儿童友好菜" />
      <Stepper label="长辈"    emoji="👴" min={0} max={20} value={elders} onChange={setElders} hint="软糯/滋补类会更多" />

      <div className="rounded-2xl p-4 bg-white shadow-sm flex items-center justify-between">
        <div>
          <p className="font-bold text-[14px]">合计 {total} 人</p>
          <p className="text-[11px] text-gray-400">系统会按规模决定菜数</p>
        </div>
        <button
          onClick={onNext}
          disabled={total === 0}
          className="px-5 h-11 rounded-full font-bold text-white active:scale-95 disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
            boxShadow: "0 4px 12px rgba(255,90,31,0.25)",
            fontSize: 13,
          }}
        >
          下一步 →
        </button>
      </div>
    </motion.div>
  );
}

function Stepper({
  label, emoji, value, onChange, min, max, hint,
}: {
  label: string; emoji: string; value: number;
  // Accepts a number OR an updater function so rapid taps queue correctly
  // (matches React.Dispatch<SetStateAction<number>> shape).
  onChange: (next: number | ((prev: number) => number)) => void;
  min: number; max: number; hint?: string;
}) {
  return (
    <div className="rounded-2xl p-4 bg-white shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-[24px]">{emoji}</span>
        <div>
          <p className="font-bold text-[14px]">{label}</p>
          {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(prev => Math.max(min, prev - 1))}
          disabled={value <= min}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 disabled:opacity-30"
          style={{ background: "rgba(0,0,0,0.06)", fontSize: 18, fontWeight: 700 }}
        >−</button>
        <span className="font-serif font-black text-[20px] w-8 text-center">{value}</span>
        <button
          onClick={() => onChange(prev => Math.min(max, prev + 1))}
          disabled={value >= max}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90 disabled:opacity-30"
          style={{ background: "#FF5A1F", fontSize: 18, fontWeight: 700 }}
        >+</button>
      </div>
    </div>
  );
}

// ── Step 3: Cuisine ───────────────────────────────────────────────────────────

function CuisineStep({
  value, onChange, onGenerate, generating,
}: {
  value: CuisineStyle; onChange: (v: CuisineStyle) => void;
  onGenerate: () => void; generating: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <p className="text-[13px] text-gray-500 px-1">想吃什么风格？</p>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(CUISINES) as CuisineStyle[]).map(key => {
          const c = CUISINES[key];
          const active = value === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="rounded-2xl p-5 text-center transition-all active:scale-[0.97]"
              style={{
                background: "white",
                border: active ? "2px solid #FF5A1F" : "2px solid transparent",
                boxShadow: active ? "0 8px 24px rgba(255,90,31,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <p className="text-[32px] mb-2">{c.emoji}</p>
              <p className="font-bold text-[14px]">{c.label}</p>
            </button>
          );
        })}
      </div>

      <button
        onClick={onGenerate}
        disabled={generating}
        className="w-full h-[52px] rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
          boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
          fontSize: 15,
        }}
      >
        {generating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
            AI 编排中…
          </>
        ) : (
          <>✨ 生成宴会菜单</>
        )}
      </button>
    </motion.div>
  );
}

// ── Step 4: Result ────────────────────────────────────────────────────────────

function ResultStep({
  menu, swapping, onSwap, onRestart,
}: {
  menu: BanquetMenu;
  swapping: string | null;
  onSwap: (courseKey: BanquetCourse["key"], dishId: string) => void;
  onRestart: () => void;
}) {
  const occ = OCCASIONS[menu.options.occasion];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Summary card */}
      <section
        className="rounded-3xl p-5 text-white"
        style={{
          background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 70%, #FFB347 100%)",
          boxShadow: "0 12px 32px rgba(255,90,31,0.30)",
        }}
      >
        <p className="text-[12px] uppercase tracking-widest opacity-80">{occ.emoji} {occ.label}</p>
        <h2 className="font-serif font-black text-[26px] leading-tight mt-1">
          {menu.headcount} 人席 · {menu.totalDishes} 道菜
        </h2>
        <p className="mt-2 text-[12px] opacity-90">
          大人 {menu.options.adults} · 小朋友 {menu.options.kids} · 长辈 {menu.options.elders}
          {" · "}{CUISINES[menu.options.cuisineStyle].label}
        </p>
      </section>

      {/* Courses */}
      {menu.courses.map(course => (
        <section key={course.key} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="font-bold text-[14px] text-gray-700">
              {course.emoji} {course.label}
            </p>
            <span className="text-[11px] text-gray-400">{course.dishes.length} 道</span>
          </div>
          {course.dishes.length === 0 && (
            <div className="rounded-2xl bg-white p-4 text-[12px] text-gray-400">
              此类菜库存不足，待数据库扩充
            </div>
          )}
          <div className="space-y-2">
            {course.dishes.map(dish => (
              <div
                key={dish.id}
                className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm"
              >
                <div
                  className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0"
                  style={{ background: "rgba(0,0,0,0.05)" }}
                >
                  {(dish as any).image_url ? (
                    <img
                      src={(dish as any).image_url}
                      alt={(dish as any).title_zh}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[20px]">🍽️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-[14px] truncate">{(dish as any).title_zh}</p>
                    {dish.kidFriendly && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                        style={{ background: "rgba(34,197,94,0.12)", color: "#16a34a" }}
                      >
                        🧒 儿童
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">
                    {(dish as any).origin_cuisine ?? ""}{" · "}
                    {(dish as any).cook_time_min ? `${(dish as any).cook_time_min} 分钟` : "—"}
                  </p>
                </div>
                <button
                  onClick={() => onSwap(course.key, dish.id)}
                  disabled={swapping === dish.id}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-95 disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
                  style={{ background: "rgba(0,0,0,0.06)", color: "#555" }}
                  title="换一道"
                >
                  {swapping === dish.id ? (
                    <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>🔄</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Action footer */}
      <div className="space-y-2 pt-3">
        <button
          onClick={onRestart}
          className="w-full h-12 rounded-2xl font-bold text-[14px] active:scale-95"
          style={{ background: "rgba(0,0,0,0.06)", color: "#555" }}
        >
          重新规划
        </button>
        <p className="text-[10px] text-gray-400 text-center">
          小提示：长按菜品图标可加入「本周菜单」或「收藏」（后续上线）
        </p>
      </div>
    </motion.div>
  );
}
