import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { type PrepStep } from "../hooks/useSupabaseMenu";
import { useFeedbackEngine } from "../hooks/useFeedbackEngine";

// ── Tray config ────────────────────────────────────────────────────────────────
// A = 主菜食材 (main dish protein / key ingredient)
// B = 配菜     (side vegetables)
// C = 配料     (supplementary ingredients / garnish)
// D = 调料     (seasonings, sauces, aromatics)
// E = 其他     (other)
const TRAY_CONFIG: Record<string, { zh: string; en: string; color: string; icon: string }> = {
  A: { zh: '主菜',  en: 'Main',     color: 'bg-red-50 text-red-600 border-red-200',     icon: 'restaurant' },
  B: { zh: '配菜',  en: 'Side Veg', color: 'bg-green-50 text-green-700 border-green-200', icon: 'eco' },
  C: { zh: '配料',  en: 'Extras',   color: 'bg-blue-50 text-blue-600 border-blue-200',   icon: 'scatter_plot' },
  D: { zh: '调料',  en: 'Sauce',    color: 'bg-orange-50 text-orange-600 border-orange-200', icon: 'water_drop' },
  E: { zh: '其他',  en: 'Other',    color: 'bg-gray-50 text-gray-600 border-gray-200',   icon: 'more_horiz' },
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
  const { t, toggleLanguage, language } = useLanguage();

  const [dishes, setDishes]       = useState<DishWithPrep[]>([]);
  const [loading, setLoading]     = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const { recordEngagement } = useFeedbackEngine();

  // dish_id param → single dish mode (from WeeklyMenu detail)
  // no param      → today's full menu mode (from Home)
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
          if (data) {
            setDishes([data]);
            // Record engagement for the dish being prepped
            recordEngagement(data);
          }
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
              // Record engagement for each dish being prepped
              loaded.forEach(dish => recordEngagement(dish));
            } else {
              setDishes(todayDishes);
              // Record engagement for each dish being prepped
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

  const toggleStep = (key: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const totalSteps = dishes.reduce((n, d) => n + (d.prep_steps_json?.length ?? 0), 0);
  const doneSteps  = completed.size;
  const allDone    = totalSteps > 0 && doneSteps >= totalSteps;

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: '备菜清单', text: '今日备菜清单', url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      alert('链接已复制');
    }
  };

  const goToCook = (dishId: string) => navigate(`/cook?dish_id=${dishId}`);

  // ── Tray badge label: single dish → "A格" ; multi-dish → "A1格" / "A2格" ──
  const getTrayLabel = (tray: string, dishIndex: number, isSingleDish: boolean) => {
    const cfg = TRAY_CONFIG[tray] ?? TRAY_CONFIG['E'];
    if (isSingleDish || tray !== 'A') {
      return language === 'zh' ? `${tray}格 · ${cfg.zh}` : `Tray ${tray} · ${cfg.en}`;
    }
    // Multi-dish: A1, A2, A3...
    const num = dishIndex + 1;
    return language === 'zh' ? `A${num}格 · 主菜` : `Tray A${num} · Main`;
  };

  const getTrayShortLabel = (tray: string, dishIndex: number, isSingleDish: boolean) => {
    if (isSingleDish || tray !== 'A') return tray;
    return `A${dishIndex + 1}`;
  };

  const isSingleDish = dishes.length <= 1;

  return (
    <div className="bg-background font-sans text-on-surface min-h-screen pb-40 flex flex-col max-w-md mx-auto relative">

      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 z-50 border-b border-black/5 flex justify-between items-center w-full px-5 py-4">
        <div className="flex items-center gap-3">
          <button className="active:scale-95 bg-black/5 hover:bg-black/10 p-2 text-on-surface rounded-full" onClick={() => navigate(localStorage.getItem('nutri_role') === 'helper' ? '/helper' : '/')}>
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-[18px] font-bold tracking-tight">{t("Prep Guide", "备菜清单")}</span>
        </div>
        <button onClick={toggleLanguage} className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 font-bold text-[12px] active:scale-95">
          {language === 'en' ? 'EN' : '中'}
        </button>
      </header>

      {/* Phase Timeline */}
      <nav className="sticky top-16 z-40 bg-white/90 backdrop-blur-md px-6 py-3 flex justify-between items-center border-b border-black/5">
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
          <span className="text-[10px] font-bold text-secondary tracking-wider uppercase">Cook</span>
        </div>
        <div className="h-[1px] flex-1 bg-black/10 mx-3" />
        <div className="flex flex-col items-center gap-1 opacity-40">
          <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">room_service</span>
          </div>
          <span className="text-[10px] font-bold text-secondary tracking-wider uppercase">Serve</span>
        </div>
      </nav>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="px-5 pt-4">
          <div className="flex justify-between text-[12px] text-secondary mb-1">
            <span>{t(`${doneSteps} / ${totalSteps} done`, `已完成 ${doneSteps} / ${totalSteps} 项`)}</span>
            <span>{Math.round(doneSteps / totalSteps * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${doneSteps / totalSteps * 100}%` }}
              transition={{ type: 'spring', stiffness: 200 }}
            />
          </div>
        </div>
      )}

      {/* Tray legend (multi-dish only) */}
      {!isSingleDish && dishes.length > 0 && (
        <div className="px-5 pt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex flex-wrap gap-2">
            {dishes.map((dish, idx) => {
              const title = language === 'zh' ? dish.title_zh : (dish.title_en ?? dish.title_zh);
              return (
                <span key={dish.id} className="flex items-center gap-1.5 text-[12px] font-bold text-amber-800">
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-bold border border-red-200">
                    A{idx + 1}
                  </span>
                  {title}
                </span>
              );
            })}
            <p className="w-full text-[11px] text-amber-700 mt-0.5">{t('A1/A2/A3 = main ingredient of each dish', 'A1/A2/A3 分别对应各道菜的主料')}</p>
          </div>
        </div>
      )}

      <main className="px-5 pt-5 flex flex-col gap-8">
        {loading && (
          <div className="text-center py-20 text-secondary text-[14px]">
            {t("Loading prep guide...", "加载备菜清单中...")}
          </div>
        )}

        {!loading && dishes.length === 0 && (
          <div className="text-center py-20 text-secondary text-[14px]">
            {t("No menu found. Go back and generate today's menu first.", "没有找到菜单，请先返回生成今日菜单。")}
          </div>
        )}

        {dishes.map((dish, dishIndex) => {
          const steps = dish.prep_steps_json ?? [];
          const title = language === 'zh' ? dish.title_zh : (dish.title_en ?? dish.title_zh);

          // Group steps by tray for this dish
          const byTray: Record<string, PrepStep[]> = {};
          for (const step of steps) {
            const tkey = step.tray ?? 'E';
            if (!byTray[tkey]) byTray[tkey] = [];
            byTray[tkey].push(step);
          }
          const trayOrder = (['A', 'B', 'C', 'D', 'E'] as string[]).filter(t => byTray[t]?.length);

          return (
            <section key={dish.id}>
              {/* Dish header */}
              <div className="flex items-center gap-3 mb-4">
                {dish.image_url ? (
                  <img src={dish.image_url} alt={title} className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-secondary text-[22px]">skillet</span>
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="font-bold text-[16px] tracking-tight">{title}</h2>
                  <p className="text-[12px] text-secondary">{steps.length} {t('prep tasks', '项备菜步骤')}</p>
                </div>
                <button
                  onClick={() => goToCook(dish.id)}
                  className="flex items-center gap-1 bg-black/5 hover:bg-black/10 px-3 py-1.5 rounded-full text-[12px] font-bold active:scale-95"
                >
                  {t('Cook', '烹饪')}
                  <span className="material-symbols-outlined text-[14px]">arrow_forward_ios</span>
                </button>
              </div>

              {steps.length === 0 ? (
                <div className="bg-black/3 rounded-2xl p-4 text-center text-secondary text-[13px]">
                  {t('Prep guide generating, check back soon.', '备菜指南生成中，请稍后查看。')}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {trayOrder.map(tray => {
                    const traySteps = byTray[tray];
                    const cfg = TRAY_CONFIG[tray] ?? TRAY_CONFIG['E'];

                    return (
                      <div key={tray}>
                        {/* Tray section header */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border mb-2 ${cfg.color}`}>
                          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {cfg.icon}
                          </span>
                          <span className="font-bold text-[13px]">
                            {getTrayLabel(tray, dishIndex, isSingleDish)}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2">
                          {traySteps.map((step, idx) => {
                            const key = `${dish.id}-${tray}-${idx}`;
                            const done = completed.has(key);
                            const action = language === 'zh' ? step.action_zh : (step.action_en ?? step.action_zh);

                            return (
                              <motion.div
                                key={key}
                                layout
                                onClick={() => toggleStep(key)}
                                className={`rounded-2xl p-4 flex items-start gap-3 cursor-pointer transition-all duration-200 ${
                                  done
                                    ? 'bg-emerald-50/60 border border-emerald-100 opacity-60'
                                    : 'bg-white shadow-sm border border-black/8'
                                }`}
                              >
                                {/* Tray badge */}
                                <div className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-[12px] ${cfg.color}`}>
                                  {getTrayShortLabel(tray, dishIndex, isSingleDish)}
                                </div>

                                <div className="flex-1 min-w-0">
                                  {/* Ingredient + weight — primary/secondary based on language */}
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className={`font-bold text-[15px] ${done ? 'line-through opacity-50' : ''}`}>
                                      {language === 'en' ? (step.ingredient_en || step.ingredient_zh) : step.ingredient_zh}
                                    </span>
                                    {step.amount_g > 0 && (
                                      <span className={`text-[13px] font-bold px-2 py-0.5 rounded-lg ${done ? 'opacity-40 text-secondary' : 'bg-black/5 text-on-surface'}`}>
                                        {step.amount_g}g
                                      </span>
                                    )}
                                    <span className="text-[11px] text-secondary">
                                      {language === 'en' ? step.ingredient_zh : step.ingredient_en}
                                    </span>
                                  </div>
                                  {/* Action */}
                                  <p className={`text-[13px] leading-snug mt-1 ${done ? 'line-through opacity-40 text-secondary' : 'text-on-surface/80'}`}>
                                    {action}
                                  </p>
                                </div>

                                {done ? (
                                  <div className="w-7 h-7 rounded-full bg-emerald-500 shrink-0 flex items-center justify-center shadow-sm">
                                    <span className="material-symbols-outlined text-white text-[16px]">check</span>
                                  </div>
                                ) : (
                                  <div className="w-7 h-7 rounded-full border-2 border-black/15 shrink-0" />
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </main>

      {/* AI Pilot FAB */}
      <div className="fixed bottom-32 right-6 z-[55]">
        <button onClick={() => navigate('/ai-pilot')} className="w-14 h-14 bg-gradient-to-tr from-[#FF5A1F] to-[#FF9054] rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full max-w-md mx-auto z-50 p-5 bg-gradient-to-t from-background via-background/95 to-transparent flex flex-col gap-3">
        {dishes.length > 0 && (
          <button
            onClick={() => goToCook(singleDishId ?? dishes[0].id)}
            className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 text-white font-bold shadow-lg active:scale-95 transition-all ${allDone ? 'bg-primary' : 'bg-[#2D3748]'}`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {allDone ? 'check_circle' : 'skillet'}
            </span>
            <span className="text-[15px]">{allDone ? t("All Done — Start Cooking!", "备菜完成 — 开始烹饪！") : t("Start Cooking", "开始烹饪")}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward_ios</span>
          </button>
        )}
      </footer>
    </div>
  );
}
