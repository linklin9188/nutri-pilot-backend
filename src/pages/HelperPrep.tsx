import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage, LANGUAGE_LABEL } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { type PrepStep } from "../hooks/useSupabaseMenu";
import { useFeedbackEngine } from "../hooks/useFeedbackEngine";
import { formatIngredientQty } from "../lib/quantity";
import HelperTabBar from "../components/HelperTabBar";

// Tray labels per language. ABCD ordering is locked (kitchen physical
// trays are labeled), so only the human-readable name shifts with locale.
const TRAY_CONFIG: Record<string, { zh: string; en: string; tl: string; id: string; color: string; bg: string; icon: string }> = {
  A: { zh: '主料',  en: 'Main',   tl: 'Pangunahin',  id: 'Utama',     color: 'text-red-600',   bg: 'bg-red-50 border-red-200',     icon: 'restaurant' },
  B: { zh: '配菜',  en: 'Veg',    tl: 'Gulay',       id: 'Sayur',     color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: 'eco' },
  C: { zh: '配料',  en: 'Extras', tl: 'Dagdag',      id: 'Tambahan',  color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200',   icon: 'scatter_plot' },
  D: { zh: '调料',  en: 'Sauce',  tl: 'Sarsa',       id: 'Bumbu',     color: 'text-orange-600',bg: 'bg-orange-50 border-orange-200',icon: 'water_drop' },
  E: { zh: '其他',  en: 'Other',  tl: 'Iba pa',      id: 'Lainnya',   color: 'text-gray-600',  bg: 'bg-gray-50 border-gray-200',   icon: 'more_horiz' },
};

interface DishWithPrep {
  id: string;
  title_zh: string;
  title_en?: string;
  image_url?: string;
  prep_steps_json?: PrepStep[] | null;
  flavor_tags?: string[];
  health_benefit_tags?: string[];
  origin_cuisine?: string;
}

export default function HelperPrep() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, t3, t4, cycleLanguageForRole, language, isChinese } = useLanguage();
  // Treat 繁體 the same as 简体 for content selection; treat 'tl' (Tagalog,
  // helper only) the same as English until Tagalog strings exist.
  const useChineseContent = isChinese;

  const [dishes, setDishes]       = useState<DishWithPrep[]>([]);
  const [loading, setLoading]     = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [expandedDish, setExpandedDish] = useState<string | null>(null);
  const { recordEngagement } = useFeedbackEngine();

  const singleDishId = searchParams.get('dish_id');

  useEffect(() => {
    async function loadDishes() {
      setLoading(true);
      try {
        if (singleDishId) {
          const { data } = await supabase
            .from('dishes')
            .select('id, title_zh, title_en, image_url, prep_steps_json, flavor_tags, health_benefit_tags, origin_cuisine')
            .eq('id', singleDishId)
            .single();
          if (data) { setDishes([data]); recordEngagement(data); }
        } else {
          const raw = localStorage.getItem('generatedMenu');
          if (raw) {
            const todayDishes: DishWithPrep[] = JSON.parse(raw);
            const ids = todayDishes.map(d => d.id);
            const { data } = await supabase
              .from('dishes')
              .select('id, title_zh, title_en, image_url, prep_steps_json, flavor_tags, health_benefit_tags, origin_cuisine')
              .in('id', ids);
            if (data) {
              const map = new Map(data.map(d => [d.id, d]));
              const loaded = ids.map(id => map.get(id)).filter(Boolean) as DishWithPrep[];
              setDishes(loaded);
              loaded.forEach(dish => recordEngagement(dish));
            } else {
              setDishes(todayDishes);
              todayDishes.forEach(dish => recordEngagement(dish));
            }
          }
        }
      } catch (e) {
        console.error('HelperPrep load error:', e);
      }
      setLoading(false);
    }
    loadDishes();
  }, [singleDishId]);

  // Auto-expand first dish on load
  useEffect(() => {
    if (dishes.length > 0 && !expandedDish) {
      setExpandedDish(dishes[0].id);
    }
  }, [dishes]);

  const toggleStep = (key: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const getDishStepKeys = (dish: DishWithPrep) =>
    (dish.prep_steps_json ?? []).map((_, idx) => `${dish.id}-${idx}`);

  const isDishDone = (dish: DishWithPrep) => {
    const keys = getDishStepKeys(dish);
    return keys.length > 0 && keys.every(k => completed.has(k));
  };

  const dishDoneCount = (dish: DishWithPrep) =>
    getDishStepKeys(dish).filter(k => completed.has(k)).length;

  const totalSteps = dishes.reduce((n, d) => n + (d.prep_steps_json?.length ?? 0), 0);
  const doneSteps  = completed.size;
  const allDone    = totalSteps > 0 && doneSteps >= totalSteps;

  const goToCook = (dishId: string) => navigate(`/cook?dish_id=${dishId}`);

  return (
    <div className="bg-[#f4f4f6] font-sans text-on-surface min-h-screen pb-40 flex flex-col max-w-md mx-auto relative">

      {/* Header */}
      <header className="bg-white sticky top-0 z-50 border-b border-black/5 flex justify-between items-center w-full px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            className="active:scale-95 bg-black/5 hover:bg-black/10 p-2 text-on-surface rounded-full"
            onClick={() => navigate(localStorage.getItem('nutri_role') === 'helper' ? '/helper' : '/')}
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <span className="text-[18px] font-bold tracking-tight">
              {t4("Prep Guide", "备菜清单", "Gabay sa Paghahanda", "Panduan Persiapan")}
            </span>
            {totalSteps > 0 && (
              <p className="text-[12px] text-gray-400 mt-0.5">
                {doneSteps}/{totalSteps} {t4('done', '项完成', 'tapos', 'selesai')}
              </p>
            )}
          </div>
        </div>
        {/* Language pill — role-aware cycle:
              employer enters from /home  → zh → 繁 → en → tl → id
              helper enters from /helper  → en → tl → id (no Chinese)
            so the Filipino / Indonesian worker doesn't have to swipe past
            zh / 繁 to get back to their language. */}
        <button
          onClick={cycleLanguageForRole}
          className="px-3 py-1.5 rounded-full bg-black/5 text-[12px] font-bold text-gray-900 active:scale-95 transition-transform"
          title="Switch language"
        >
          {LANGUAGE_LABEL[language]}
        </button>
      </header>

      {/* Phase Timeline */}
      <nav className="sticky top-[69px] z-40 bg-white/95 backdrop-blur-md px-6 py-3 flex justify-between items-center border-b border-black/5">
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant_menu</span>
          </div>
          <span className="text-[10px] font-bold text-primary tracking-wider uppercase">Prep</span>
        </div>
        <div className="h-[1px] flex-1 bg-black/10 mx-3" />
        <div className="flex flex-col items-center gap-1 opacity-40">
          <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">skillet</span>
          </div>
          <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Cook</span>
        </div>
        <div className="h-[1px] flex-1 bg-black/10 mx-3" />
        <div className="flex flex-col items-center gap-1 opacity-40">
          <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">room_service</span>
          </div>
          <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Serve</span>
        </div>
      </nav>

      {/* Global progress bar */}
      {totalSteps > 0 && (
        <div className="bg-white px-5 py-3 border-b border-black/5">
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              animate={{ width: `${doneSteps / totalSteps * 100}%` }}
              transition={{ type: 'spring', stiffness: 200 }}
            />
          </div>
        </div>
      )}

      <main className="px-4 pt-4 flex flex-col gap-3">
        {loading && (
          <div className="text-center py-20 text-gray-400 text-[14px]">
            {t4("Loading prep guide...", "加载备菜清单中...", "Naglo-load ng gabay...", "Memuat panduan persiapan...")}
          </div>
        )}

        {!loading && dishes.length === 0 && (() => {
          // TICKET-010 §J — role-aware empty state. 雇主点 Home "烹饪" 按钮
          // 时如 displayMenu 为空 (算法 fail / β 用户首次未生成) → generatedMenu
          // 写 '[]' → 这里 ids=[] → 原文案 "请等雇主生成" 对雇主自己错位 +
          // 一行灰字看着像空白页。分流：
          //   employer (or anonymous) → "今日菜单为空" + 跳 /weekly 生成
          //   helper → 原文案 (等雇主)
          const role = localStorage.getItem('nutri_role');
          const isEmployer = role !== 'helper';
          return (
            <div className="flex flex-col items-center gap-4 py-16 px-6 text-center">
              <span style={{ fontSize: 48 }}>🍽️</span>
              <p className="text-gray-500 font-semibold" style={{ fontSize: 15 }}>
                {isEmployer
                  ? t4("No menu for today yet",
                       "今日还没有菜单",
                       "Wala pang menu para ngayon",
                       "Belum ada menu hari ini")
                  : t4("No menu yet. Ask the employer to generate today's menu first.",
                       "还没有菜单，请等雇主生成今日菜单。",
                       "Wala pang menu. Hintayin ang employer na gumawa ng menu ngayon.",
                       "Belum ada menu. Minta majikan membuat menu hari ini dulu.")}
              </p>
              {isEmployer && (
                <button onClick={() => navigate('/weekly')}
                  className="mt-2 px-6 py-2.5 rounded-full font-bold text-white active:scale-95"
                  style={{ fontSize: 13, background: "#FF5A1F", boxShadow: "0 6px 18px rgba(255,90,31,0.30)" }}>
                  {t4("Generate this week's menu", "生成本周菜单", "Gumawa ng menu sa linggo", "Buat menu minggu ini")}
                </button>
              )}
            </div>
          );
        })()}

        {dishes.map((dish, dishIndex) => {
          const steps = dish.prep_steps_json ?? [];
          const title = useChineseContent ? dish.title_zh : (dish.title_en ?? dish.title_zh);
          // Subtitle was the OTHER language — removed per i18n cleanup; we
          // now show a single language at a time based on the toggle.
          const subtitle = '';
          const done = isDishDone(dish);
          const doneCount = dishDoneCount(dish);
          const isOpen = expandedDish === dish.id;

          // Group steps by tray
          const byTray: Record<string, { step: PrepStep; idx: number }[]> = {};
          for (let i = 0; i < steps.length; i++) {
            const tkey = steps[i].tray ?? 'E';
            if (!byTray[tkey]) byTray[tkey] = [];
            byTray[tkey].push({ step: steps[i], idx: i });
          }
          const trayOrder = (['A', 'B', 'C', 'D', 'E'] as string[]).filter(t => byTray[t]?.length);

          return (
            <div
              key={dish.id}
              className={`rounded-3xl overflow-hidden shadow-sm transition-all duration-200 ${
                done ? 'opacity-75' : ''
              }`}
            >
              {/* Dish card header — always visible, tap to expand */}
              <button
                onClick={() => setExpandedDish(isOpen ? null : dish.id)}
                className="w-full text-left"
              >
                <div className={`flex items-center gap-3 p-4 ${done ? 'bg-emerald-50' : 'bg-white'}`}>
                  {/* Dish number badge */}
                  <div className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center font-black text-[16px] ${
                    done ? 'bg-emerald-500 text-white' : 'bg-[#FF5A1F]/10 text-[#FF5A1F]'
                  }`}>
                    {done
                      ? <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                      : dishIndex + 1
                    }
                  </div>

                  {/* Dish photo */}
                  {dish.image_url ? (
                    <img src={dish.image_url} alt={title} className="w-14 h-14 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-gray-400 text-[24px]">skillet</span>
                    </div>
                  )}

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <h2 className={`font-black text-[18px] tracking-tight leading-tight ${done ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {title}
                    </h2>
                    {subtitle && (
                      <p className="text-[14px] text-gray-400 mt-0.5 truncate">{subtitle}</p>
                    )}
                    {/* Per-dish progress */}
                    {steps.length > 0 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-[#FF5A1F]'}`}
                            style={{ width: `${steps.length > 0 ? doneCount / steps.length * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-gray-400 shrink-0">
                          {doneCount}/{steps.length}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Expand chevron */}
                  <span className={`material-symbols-outlined text-gray-300 text-[20px] transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </div>
              </button>

              {/* Expandable ingredient list */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="bg-white border-t border-black/5">
                      {steps.length === 0 ? (
                        <div className="p-6 text-center text-gray-400 text-[13px]">
                          {t4(
                            'Prep guide generating, check back soon.',
                            '备菜指南生成中，请稍后查看。',
                            'Ginagawa pa ang gabay sa paghahanda, balikan mamaya.',
                            'Panduan persiapan sedang dibuat, cek lagi nanti.',
                          )}
                        </div>
                      ) : (
                        <div className="p-4 flex flex-col gap-4">
                          {trayOrder.map(tray => {
                            const cfg = TRAY_CONFIG[tray] ?? TRAY_CONFIG['E'];
                            const trayItems = byTray[tray];

                            return (
                              <div key={tray}>
                                {/* Tray group label: "A 主料" / "B 配菜" — letter is the physical tray code */}
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border mb-2 ${cfg.bg}`}>
                                  <span className={`material-symbols-outlined text-[13px] ${cfg.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                                    {cfg.icon}
                                  </span>
                                  <span className={`font-black text-[12px] tracking-wider ${cfg.color}`}>
                                    {tray}
                                  </span>
                                  <span className={`font-bold text-[12px] ${cfg.color}`}>
                                    {t4(cfg.en, cfg.zh, cfg.tl, cfg.id)}
                                  </span>
                                </div>

                                <div className="flex flex-col gap-2">
                                  {trayItems.map(({ step, idx }, slotI) => {
                                    const key = `${dish.id}-${idx}`;
                                    const isDone = completed.has(key);
                                    const action = useChineseContent ? step.action_zh : (step.action_en ?? step.action_zh);
                                    const ingName = !useChineseContent
                                      ? (step.ingredient_en || step.ingredient_zh)
                                      : step.ingredient_zh;
                                    // Single-language per i18n cleanup — was
                                    // showing the other-language name stacked
                                    // underneath as a helper-shopping aid;
                                    // user prefers one language at a time so
                                    // they can toggle if they need the other.
                                    // Slot label like "A1" / "A2" — the physical tray slot a helper
                                    // can match against the labeled tray in the kitchen.
                                    const slotLabel = `${tray}${slotI + 1}`;
                                    // Friendly quantity — converts grams to pieces for eggs / garlic /
                                    // scallion / ginger (see lib/quantity.ts).
                                    const qtyLabel = formatIngredientQty(step.ingredient_zh, step.amount_g);

                                    return (
                                      <motion.button
                                        key={key}
                                        layout
                                        onClick={() => toggleStep(key)}
                                        className={`w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-all duration-150 active:scale-[0.98] ${
                                          isDone
                                            ? 'bg-emerald-50 border border-emerald-100'
                                            : 'bg-gray-50 border border-gray-100'
                                        }`}
                                      >
                                        {/* Slot pill (A1 / A2 …) — flips to ✓ when the helper checks it off. */}
                                        <div className={`shrink-0 min-w-[40px] h-9 px-2 rounded-2xl flex items-center justify-center font-black text-[13px] transition-all ${
                                          isDone
                                            ? 'bg-emerald-500 text-white shadow-sm'
                                            : `${cfg.bg} ${cfg.color} border`
                                        }`}>
                                          {isDone
                                            ? <span className="material-symbols-outlined text-white text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                                            : slotLabel
                                          }
                                        </div>

                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className={`font-black text-[17px] leading-tight ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                              {ingName}
                                            </span>
                                            {qtyLabel && (
                                              <span className={`text-[14px] font-bold px-2 py-0.5 rounded-lg ${
                                                isDone ? 'text-gray-300 bg-gray-100' : 'text-gray-700 bg-white border border-gray-200'
                                              }`}>
                                                {qtyLabel}
                                              </span>
                                            )}
                                          </div>
                                          {action && (
                                            <p className={`text-[14px] mt-1 leading-snug ${isDone ? 'line-through text-gray-300' : 'text-gray-500'}`}>
                                              {action}
                                            </p>
                                          )}
                                          {/* Suzie's Twist substitutes (Simply Chinese Feasts 4D framework).
                                              Shows pantry-friendly swaps so the helper doesn't have to skip
                                              the dish when the primary ingredient is missing. */}
                                          {(() => {
                                            const subs = useChineseContent
                                              ? (step.substitutes_zh ?? [])
                                              : (step.substitutes_en ?? step.substitutes_zh ?? []);
                                            if (!subs || subs.length === 0) return null;
                                            return (
                                              <div className={`mt-2 flex items-start gap-1.5 text-[12px] ${isDone ? 'opacity-40' : ''}`}>
                                                <span className={`material-symbols-outlined text-[14px] mt-[1px] ${isDone ? 'text-gray-300' : 'text-amber-600'}`}>
                                                  swap_horiz
                                                </span>
                                                <div className={`leading-snug ${isDone ? 'text-gray-300' : 'text-amber-700'}`}>
                                                  <span className="font-bold">
                                                    {t4('Can swap:', '可替换：', 'Pwedeng palit:', 'Bisa ganti:')}{' '}
                                                  </span>
                                                  {subs.slice(0, 3).join(' / ')}
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </motion.button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Per-dish cook button */}
                          <button
                            onClick={() => goToCook(dish.id)}
                            className={`w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-[14px] active:scale-95 transition-all mt-1 ${
                              done
                                ? 'bg-emerald-500 text-white'
                                : 'bg-[#2D3748] text-white'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                              {done ? 'check_circle' : 'skillet'}
                            </span>
                            {done
                              ? t4('Cook this dish', '开始烹饪', 'Lutuin ito', 'Mulai memasak')
                              : t4('Start Cooking', '开始烹饪', 'Magsimulang magluto', 'Mulai memasak')}
                            <span className="material-symbols-outlined text-[16px]">arrow_forward_ios</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </main>

      {/* AI Pilot FAB */}
      <div className="fixed bottom-32 right-6 z-[55]">
        <button onClick={() => navigate('/ai-pilot')} className="w-14 h-14 bg-gradient-to-tr from-[#FF5A1F] to-[#FF9054] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
        </button>
      </div>

      {/* Footer — global cook button. TICKET-041 §2: shift up so the new
          5-tab HelperTabBar can sit on the 0 row. */}
      <footer className="fixed bottom-[72px] w-full max-w-md mx-auto z-40 p-5 bg-gradient-to-t from-[#f4f4f6] via-[#f4f4f6]/95 to-transparent">
        {dishes.length > 0 && (
          <button
            onClick={() => goToCook(singleDishId ?? dishes[0].id)}
            className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-white font-bold shadow-lg active:scale-95 transition-all ${
              allDone ? 'bg-emerald-500' : 'bg-[#FF5A1F]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {allDone ? 'check_circle' : 'skillet'}
            </span>
            <span className="text-[15px]">
              {allDone
                ? t4("All Done — Start Cooking!",
                     "备菜完成 — 开始烹饪！",
                     "Tapos na — Simulan ang Pagluluto!",
                     "Persiapan selesai — Mulai memasak!")
                : t4("Start Cooking", "开始烹饪", "Simulan ang Pagluluto", "Mulai memasak")}
            </span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward_ios</span>
          </button>
        )}
      </footer>

      <HelperTabBar active="prep" />
    </div>
  );
}
