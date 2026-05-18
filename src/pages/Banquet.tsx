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
import { useNavigate, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  CUISINES, AVOID_LABELS, SPECIAL_NEED_LABELS,
  planBanquet, swapBanquetDish, updateEvalOutcome,
  type CuisineStyle, type BanquetMenu, type BanquetCourse,
  type BanquetAvoidId, type BanquetSpecialNeed,
} from "../lib/banquet";
import { useSubscription } from "../lib/subscription";
import BottomTabBar from "../components/BottomTabBar";
import { HeartButton } from "../components/HeartButton";

type Step = "headcount" | "cuisine" | "result";

export default function Banquet() {
  const navigate = useNavigate();
  const { isPro, loading } = useSubscription();

  const [step, setStep]             = useState<Step>("headcount");
  const [adults, setAdults]         = useState(10);
  const [kids, setKids]             = useState(0);
  const [elders, setElders]         = useState(0);
  const [cuisine, setCuisine]       = useState<CuisineStyle>("chinese");
  const [avoidIds, setAvoidIds]     = useState<BanquetAvoidId[]>([]);
  const [specialIds, setSpecialIds] = useState<BanquetSpecialNeed[]>([]);

  const [generating, setGenerating] = useState(false);
  const [menu, setMenu]             = useState<BanquetMenu | null>(null);
  const [swapping, setSwapping]     = useState<string | null>(null);

  const toggleAvoid = (id: BanquetAvoidId) =>
    setAvoidIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleSpecial = (id: BanquetSpecialNeed) =>
    setSpecialIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // ── Pro gate ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#FF5A1F] rounded-full animate-spin" />
      </div>
    );
  }
  // Free users go to /pricing. Using <Navigate> avoids triggering a router
  // update during the Banquet render (React warns when setState fires inside
  // another component's render path).
  if (!isPro) return <Navigate to="/pricing" replace />;

  // ── Flow handlers ────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    try {
      // planBanquet has a Composer→local fallback chain, so a thrown error
      // here would mean both branches failed (which only happens on a hard
      // DB error). Log to console; no user-facing alert per Rule 8.4.
      const result = await planBanquet({
        adults, kids, elders, cuisineStyle: cuisine,
        extraAvoid:   avoidIds,
        specialNeeds: specialIds,
      });
      setMenu(result);
      setStep("result");
    } catch (e) {
      console.error("planBanquet failed (both Composer and local branch):", e);
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
      // Composer eval outcome: user swapped at least one dish.
      if (menu.eval_id) {
        void updateEvalOutcome(menu.eval_id, 'revised');
      }
    } finally {
      setSwapping(null);
    }
  }

  const totalGuests = adults + kids + elders;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f5f5f5]">
      <Header step={step} onBack={() => {
        if (step === "headcount") navigate(-1);
        else if (step === "cuisine")   setStep("headcount");
        else                            setStep("cuisine");
      }} />

      <main className="flex-1 px-5 py-5 pb-32 space-y-5">
        <AnimatePresence mode="wait">
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
              avoidIds={avoidIds} toggleAvoid={toggleAvoid}
              specialIds={specialIds} toggleSpecial={toggleSpecial}
              onGenerate={handleGenerate}
              generating={generating} />
          )}
          {step === "result" && menu && (
            <ResultStep key="res"
              menu={menu}
              swapping={swapping}
              onSwap={handleSwap}
              onRestart={() => {
                if (menu.eval_id) {
                  void updateEvalOutcome(menu.eval_id, 'rejected');
                }
                setMenu(null);
                setStep("headcount");
              }} />
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
    headcount: { title: "家宴菜单", sub: "1 / 2 · 餐桌人数" },
    cuisine:   { title: "家宴菜单", sub: "2 / 2 · 风格 · 忌口 · 特殊需求" },
    result:    { title: "家宴菜单", sub: "已为您安排好了" },
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
  value, onChange,
  avoidIds, toggleAvoid,
  specialIds, toggleSpecial,
  onGenerate, generating,
}: {
  value: CuisineStyle; onChange: (v: CuisineStyle) => void;
  avoidIds: BanquetAvoidId[];  toggleAvoid: (id: BanquetAvoidId) => void;
  specialIds: BanquetSpecialNeed[]; toggleSpecial: (id: BanquetSpecialNeed) => void;
  onGenerate: () => void; generating: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Cuisine */}
      <section className="space-y-3">
        <p className="text-[13px] text-gray-500 px-1 font-bold">菜系风格</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(CUISINES) as CuisineStyle[]).map(key => {
            const c = CUISINES[key];
            const active = value === key;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                className="rounded-2xl p-3 text-center transition-all active:scale-[0.97]"
                style={{
                  background: "white",
                  border: active ? "2px solid #FF5A1F" : "2px solid transparent",
                  boxShadow: active ? "0 6px 18px rgba(255,90,31,0.15)" : "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                <p className="text-[22px] mb-0.5">{c.emoji}</p>
                <p className="font-bold text-[11px]">{c.label}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Special needs */}
      <section className="space-y-2">
        <p className="text-[13px] text-gray-500 px-1 font-bold">特殊需求（可多选）</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SPECIAL_NEED_LABELS) as BanquetSpecialNeed[]).map(id => {
            const n = SPECIAL_NEED_LABELS[id];
            const active = specialIds.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleSpecial(id)}
                className="rounded-2xl px-3 py-2.5 text-left transition-all active:scale-[0.97]"
                style={{
                  background: active ? "rgba(255,90,31,0.10)" : "white",
                  border: active ? "1.5px solid #FF5A1F" : "1.5px solid transparent",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  minWidth: "calc(50% - 4px)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[20px]">{n.emoji}</span>
                  <p className="font-bold text-[13px]">{n.label}</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{n.sub}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Avoid */}
      <section className="space-y-2">
        <p className="text-[13px] text-gray-500 px-1 font-bold">忌口（可多选）</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(AVOID_LABELS) as BanquetAvoidId[]).map(id => {
            const a = AVOID_LABELS[id];
            const active = avoidIds.includes(id);
            return (
              <button
                key={id}
                onClick={() => toggleAvoid(id)}
                className="rounded-full px-3 py-1.5 transition-all active:scale-95 inline-flex items-center gap-1"
                style={{
                  background: active ? "#FF5A1F" : "white",
                  border: active ? "1px solid #FF5A1F" : "1px solid rgba(0,0,0,0.10)",
                  color: active ? "white" : "#444",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>{a.emoji}</span>
                {a.label}
              </button>
            );
          })}
        </div>
      </section>

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
          <>✨ 生成家宴菜单</>
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
  // Compose a one-line tag based on who's at the table, replacing the old
  // hard-coded occasion label.
  const tableLine = (() => {
    const { kids, elders, adults } = menu.options;
    if (kids > 0 && elders > 0) return "🏠 家宴 · 老少同席";
    if (kids > 0)                return "🎂 儿童在场，菜单偏温和";
    if (elders > 0)              return "🍵 长辈在场，菜单偏滋补";
    if (adults >= 8)             return "🥂 多人聚餐";
    return "👨‍👩‍👧‍👦 家宴";
  })();
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
        <p className="text-[12px] uppercase tracking-widest opacity-80">{tableLine}</p>
        <h2 className="font-serif font-black text-[26px] leading-tight mt-1">
          {menu.headcount} 人席 · {menu.totalDishes} 道菜
        </h2>
        <p className="mt-2 text-[12px] opacity-90">
          大人 {menu.options.adults} · 小朋友 {menu.options.kids} · 长辈 {menu.options.elders}
          {" · "}{CUISINES[menu.options.cuisineStyle].label}
        </p>
        {(menu.options.specialNeeds?.length || menu.options.extraAvoid?.length) ? (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {menu.options.specialNeeds?.map(id => (
              <span key={id}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: "rgba(255,255,255,0.20)", color: "white" }}>
                {SPECIAL_NEED_LABELS[id].emoji} {SPECIAL_NEED_LABELS[id].label}
              </span>
            ))}
            {menu.options.extraAvoid?.map(id => (
              <span key={id}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: "rgba(0,0,0,0.20)", color: "white" }}>
                忌 {AVOID_LABELS[id].label}
              </span>
            ))}
          </div>
        ) : null}
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
                <HeartButton dish={dish as any} sourceTag="家宴" size={18} />
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
          onClick={() => {
            // Persist the banquet menu so /verify can aggregate ingredients
            // sized for the actual headcount (not the weekly menu's family).
            // composer_run_id + eval_id ride along so a later /verify-side
            // outcome refinement (e.g. "user actually cooked from this") can
            // still find the menu_evals row.
            localStorage.setItem(
              "banquet_menu_current",
              JSON.stringify({
                adults: menu.options.adults,
                kids:   menu.options.kids,
                elders: menu.options.elders,
                cuisineStyle: menu.options.cuisineStyle,
                specialNeeds: menu.options.specialNeeds ?? [],
                extraAvoid:   menu.options.extraAvoid ?? [],
                dishes: menu.courses.flatMap(c => c.dishes),
                composer_run_id: menu.composer_run_id,
                eval_id:         menu.eval_id,
                createdAt: Date.now(),
              })
            );
            if (menu.eval_id) {
              void updateEvalOutcome(menu.eval_id, 'user_accepted');
            }
            window.location.href = "/verify?from=banquet";
          }}
          className="w-full h-12 rounded-2xl font-bold text-[14px] text-white flex items-center justify-center gap-2 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #16a34a, #22c55e)",
            boxShadow: "0 6px 18px rgba(22,163,74,0.25)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>shopping_cart</span>
          一键生成采购清单（按 {menu.headcount} 人）
        </button>
        <button
          onClick={onRestart}
          className="w-full h-11 rounded-2xl font-bold text-[13px] active:scale-95"
          style={{ background: "rgba(0,0,0,0.06)", color: "#555" }}
        >
          重新规划
        </button>
      </div>
    </motion.div>
  );
}
