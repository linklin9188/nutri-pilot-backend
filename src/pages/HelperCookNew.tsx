/**
 * HelperCookNew — 菲佣做法步骤页 (Warm Hearth 大改版, 老板 5/31 "重新做一个新页")
 *
 * 全新独立页, 挂 /cook-v2。旧 HelperCook.tsx 原封不动, 老板最后挑用哪个。
 * 这是整条产品链的终点: 雇主选菜 → 菜单进系统 → 菲佣照这页把菜做出来。
 *
 * 角色边界 (老板拍板):
 *   - 菲佣是"干活的人", 不是决策的人。只告诉她: 今天做啥 / 什么顺序 / 每步怎么做 / 做到什么程度。
 *   - 不让她选菜, 不给偏好问卷。越简单越好。
 *   - **全程 English + Tagalog, 一个中文字都不能有** (硬规矩)。
 *   - 永久免费, 绝不出现 trial / 试用。
 *
 * 数据: loadEmployerTodayMenu(uid, dayOffset) 读雇主当日菜单 (复用现成引擎, 不改算法)。
 *   每道菜 prep_steps_json (托盘 ABCD 备料) + cook_steps_json (火上步骤 + 火候时长 + 状态目标)。
 *   只渲染 en/tl 字段, 永不渲染 *_zh。
 *
 * 形态: 今天菜单列表 → 点一道菜 → 全屏步骤模式 (Mise en place 备料卡 → 逐步做法)。
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import {
  loadEmployerTodayMenu, type EmployerMenuResult, type EmployerDishLite,
} from '../lib/helperEmployerMenu';

// ── Warm Hearth tokens ───────────────────────────────────────────────────────
const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

// 菲佣端只有 EN / TL 两语, 永不显中文。helperLang: 雇主把菲佣端语言设成 tl 时用 Tagalog,
// 其余 (含未设) 默认 English。读 localStorage nutri_lang, 'tl' → tl, else → en。
type HLang = 'en' | 'tl';
function useHelperLang(): HLang {
  const { language } = useLanguage();
  return language === 'tl' ? 'tl' : 'en';
}

// 托盘 ABCD 含义 (双语, 零中文)
const TRAY_LABEL: Record<string, { en: string; tl: string; color: string }> = {
  A: { en: 'Main', tl: 'Pangunahin', color: '#FF5A1F' },
  B: { en: 'Veggies', tl: 'Gulay', color: '#4CAF50' },
  C: { en: 'Aromatics', tl: 'Pampalasa', color: '#3B82F6' },
  D: { en: 'Seasoning', tl: 'Rekado', color: '#A855F7' },
};

// ── JSON 解包 (DB jsonb 可能是 string 或已解析数组) ─────────────────────────
interface PrepStep {
  tray?: string; amount_g?: number;
  ingredient_en?: string; ingredient_tl?: string;
  action_en?: string; action_tl?: string;
  substitutes_en?: string[]; substitutes_tl?: string[];
}
interface CookStep {
  step?: number; duration_min?: number;
  action_en?: string; action_tl?: string;
  state_target_en?: string; state_target_tl?: string;
}
function unwrap<T>(raw: unknown): T[] {
  if (!raw) return [];
  let arr: any = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr.map((e: any) => (typeof e === 'string' ? (() => { try { return JSON.parse(e); } catch { return e; } })() : e));
}

const MEALS: { key: 'breakfast' | 'lunch' | 'dinner'; icon: string; en: string; tl: string }[] = [
  { key: 'breakfast', icon: 'wb_sunny', en: 'Breakfast', tl: 'Almusal' },
  { key: 'lunch', icon: 'lunch_dining', en: 'Lunch', tl: 'Tanghalian' },
  { key: 'dinner', icon: 'dinner_dining', en: 'Dinner', tl: 'Hapunan' },
];

export default function HelperCookNew() {
  const navigate = useNavigate();
  const lang = useHelperLang();
  const L = (en: string, tl: string) => (lang === 'tl' ? tl : en);

  const [menu, setMenu] = useState<EmployerMenuResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDish, setActiveDish] = useState<EmployerDishLite | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const uid = getUserId();
      const res = await loadEmployerTodayMenu(uid, 0);
      if (!cancelled) { setMenu(res); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const byMeal = menu?.byMeal ?? { breakfast: [], lunch: [], dinner: [] };
  const hasAny = (menu?.dishes?.length ?? 0) > 0;

  // 步骤模式: 选中一道菜 → 全屏
  if (activeDish) {
    return <CookStepsScreen dish={activeDish} lang={lang} onBack={() => setActiveDish(null)} />;
  }

  // 菜单列表模式
  return (
    <div className="min-h-screen max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: 40 }}>
      <header className="sticky top-0 z-20 px-5 pt-6 pb-3" style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)' }}>
        <p style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: SUB, fontWeight: 600 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="font-black mt-1" style={{ fontSize: 26 }}>{L("Today's Cooking", 'Lutuin Ngayon')}</h1>
        <p style={{ fontSize: 13, color: SUB, marginTop: 2 }}>
          {L('Tap a dish to see the steps', 'I-tap ang ulam para makita ang hakbang')}
        </p>
      </header>

      <main className="px-5 py-2 space-y-6">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl" style={{ height: 88, background: ALT, opacity: 0.6 }} />)}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center text-center pt-20 px-6">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#CFCFC8' }}>restaurant</span>
            <p className="font-bold mt-4" style={{ fontSize: 17 }}>{L('No menu yet today', 'Wala pang menu ngayon')}</p>
            <p className="mt-1" style={{ fontSize: 14, color: SUB }}>
              {L('The employer has not set the menu yet.', 'Hindi pa naka-set ang menu ng amo.')}
            </p>
          </div>
        ) : (
          MEALS.map(m => {
            const list = byMeal[m.key];
            if (!list || list.length === 0) return null;
            return (
              <section key={m.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined" style={{ color: BRAND, fontSize: 22 }}>{m.icon}</span>
                  <h2 className="font-bold" style={{ fontSize: 18 }}>{L(m.en, m.tl)}</h2>
                </div>
                <div className="space-y-3">
                  {list.map(d => <DishCard key={`${m.key}-${d.id}`} d={d} lang={lang} onOpen={() => setActiveDish(d)} />)}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}

// 菜卡 (列表) — 只显 title_en (永不中文) + 图 + 步数 + 时长
function DishCard({ d, lang, onOpen }: { d: EmployerDishLite; lang: HLang; onOpen: () => void }) {
  const L = (en: string, tl: string) => (lang === 'tl' ? tl : en);
  const title = d.title_en || L('Dish', 'Ulam'); // 永不 fallback title_zh
  const cookSteps = unwrap<CookStep>(d.cook_steps_json);
  const prepSteps = unwrap<PrepStep>(d.prep_steps_json);
  return (
    <button onClick={onOpen}
      className="w-full flex items-stretch gap-3.5 rounded-2xl p-3 active:scale-[0.99] transition-transform text-left"
      style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="rounded-xl bg-cover bg-center shrink-0"
        style={{ width: 84, height: 84, background: ALT, backgroundImage: d.image_url ? `url("${d.image_url}")` : undefined }} />
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <p className="font-bold" style={{ fontSize: 16, lineHeight: 1.25 }}>{title}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {d.steps_verified && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(76,175,80,0.12)', color: GREEN, fontSize: 11.5, fontWeight: 500 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
              {L('Ready', 'Handa')}
            </span>
          )}
          {prepSteps.length > 0 && <span style={{ fontSize: 11.5, color: SUB }}>🧺 {prepSteps.length} {L('prep', 'paghahanda')}</span>}
          {cookSteps.length > 0 && <span style={{ fontSize: 11.5, color: SUB }}>🔥 {cookSteps.length} {L('steps', 'hakbang')}</span>}
          {typeof d.cook_time_min === 'number' && d.cook_time_min > 0 && (
            <span style={{ fontSize: 11.5, color: SUB }}>⏱ {d.cook_time_min}min</span>
          )}
        </div>
      </div>
      <div className="flex items-center">
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#CFCFC8' }}>chevron_right</span>
      </div>
    </button>
  );
}

// ── 全屏步骤模式 ─────────────────────────────────────────────────────────────
function CookStepsScreen({ dish, lang, onBack }: { dish: EmployerDishLite; lang: HLang; onBack: () => void }) {
  const L = (en: string, tl: string) => (lang === 'tl' ? tl : en);
  const navigate = useNavigate();
  const title = dish.title_en || L('Dish', 'Ulam');
  const prep = useMemo(() => unwrap<PrepStep>(dish.prep_steps_json), [dish]);
  const cook = useMemo(() => unwrap<CookStep>(dish.cook_steps_json), [dish]);

  // phase: 'prep' (Mise en place 备料) → 'cook' (逐步做法)
  const [phase, setPhase] = useState<'prep' | 'cook'>('prep');
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());

  // 备料按托盘分组
  const prepByTray = useMemo(() => {
    const groups: Record<string, PrepStep[]> = {};
    for (const p of prep) {
      const tray = (p.tray || 'A').toUpperCase();
      (groups[tray] ||= []).push(p);
    }
    return groups;
  }, [prep]);

  function toggleStep(i: number) {
    setDoneSteps(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const txt = (en?: string, tl?: string) => (lang === 'tl' ? (tl || en || '') : (en || ''));

  return (
    <div className="min-h-screen max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: 110 }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 pt-5 pb-3"
        style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)' }}>
        <button onClick={onBack} className="rounded-full flex items-center justify-center active:scale-95 shrink-0"
          style={{ width: 40, height: 40, background: ALT }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black truncate" style={{ fontSize: 19 }}>{title}</h1>
          {typeof dish.cook_time_min === 'number' && dish.cook_time_min > 0 && (
            <p style={{ fontSize: 12, color: SUB }}>⏱ {dish.cook_time_min} min</p>
          )}
        </div>
      </header>

      {/* phase 切换 tab */}
      <div className="px-4 pt-1">
        <div className="inline-flex p-1 rounded-2xl gap-0.5 w-full" style={{ background: 'rgba(0,0,0,0.05)' }}>
          {(['prep', 'cook'] as const).map(p => {
            const on = phase === p;
            return (
              <button key={p} onClick={() => setPhase(p)}
                className="flex-1 py-2 rounded-xl font-bold transition-all active:scale-95"
                style={{ fontSize: 13.5, background: on ? '#FFFFFF' : 'transparent', color: on ? INK : SUB, boxShadow: on ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
                {p === 'prep'
                  ? `🧺 ${L('Prep', 'Paghahanda')} (${prep.length})`
                  : `🔥 ${L('Cook', 'Pagluluto')} (${cook.length})`}
              </button>
            );
          })}
        </div>
      </div>

      <main className="px-4 py-4">
        {phase === 'prep' ? (
          <>
            <p className="mb-4" style={{ fontSize: 13, color: SUB }}>
              {L('Prepare everything first. Group by tray:', 'Ihanda muna lahat. Grupo ayon sa tray:')}
            </p>
            {prep.length === 0 ? (
              <p className="text-center py-10" style={{ fontSize: 14, color: SUB }}>{L('No prep needed', 'Walang paghahanda')}</p>
            ) : (
              <div className="space-y-4">
                {(['A', 'B', 'C', 'D'] as const).map(tray => {
                  const items = prepByTray[tray];
                  if (!items || items.length === 0) return null;
                  const meta = TRAY_LABEL[tray];
                  return (
                    <div key={tray} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: `${meta.color}14` }}>
                        <span className="flex items-center justify-center rounded-lg font-black text-white" style={{ width: 26, height: 26, background: meta.color, fontSize: 14 }}>{tray}</span>
                        <span className="font-bold" style={{ fontSize: 14, color: meta.color }}>{L(meta.en, meta.tl)}</span>
                      </div>
                      <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                        {items.map((p, i) => {
                          const subs = lang === 'tl' ? (p.substitutes_tl ?? []) : (p.substitutes_en ?? []);
                          return (
                            <div key={i} className="px-4 py-3">
                              <div className="flex items-baseline justify-between gap-3">
                                <p className="font-bold" style={{ fontSize: 15 }}>
                                  {txt(p.ingredient_en, p.ingredient_tl)}
                                </p>
                                {typeof p.amount_g === 'number' && p.amount_g > 0 && (
                                  <span className="shrink-0 tabular-nums" style={{ fontSize: 13, color: BRAND, fontWeight: 700 }}>{p.amount_g} g</span>
                                )}
                              </div>
                              {txt(p.action_en, p.action_tl) && (
                                <p style={{ fontSize: 13, color: SUB, marginTop: 3, lineHeight: 1.5 }}>{txt(p.action_en, p.action_tl)}</p>
                              )}
                              {subs.length > 0 && (
                                <p style={{ fontSize: 12, color: '#A855F7', marginTop: 4 }}>
                                  ↔ {L('or use', 'o gamitin')}: {subs.join(', ')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mb-4" style={{ fontSize: 13, color: SUB }}>
              {L('Follow each step. Tap when done.', 'Sundin ang bawat hakbang. I-tap kapag tapos.')}
            </p>
            {cook.length === 0 ? (
              <p className="text-center py-10" style={{ fontSize: 14, color: SUB }}>{L('No steps available', 'Walang hakbang')}</p>
            ) : (
              <div className="space-y-3">
                {cook.map((s, i) => {
                  const done = doneSteps.has(i);
                  return (
                    <button key={i} onClick={() => toggleStep(i)}
                      className="w-full flex gap-3 rounded-2xl p-4 active:scale-[0.99] transition-transform text-left"
                      style={{ background: done ? 'rgba(76,175,80,0.08)' : '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', opacity: done ? 0.7 : 1 }}>
                      <div className="shrink-0 flex items-center justify-center rounded-full font-black text-white"
                        style={{ width: 30, height: 30, background: done ? GREEN : BRAND, fontSize: 14 }}>
                        {done ? '✓' : (s.step ?? i + 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold" style={{ fontSize: 15, lineHeight: 1.4, textDecoration: done ? 'line-through' : 'none' }}>
                          {txt(s.action_en, s.action_tl)}
                        </p>
                        {txt(s.state_target_en, s.state_target_tl) && (
                          <p style={{ fontSize: 12.5, color: GREEN, marginTop: 4, lineHeight: 1.4 }}>
                            🎯 {txt(s.state_target_en, s.state_target_tl)}
                          </p>
                        )}
                      </div>
                      {typeof s.duration_min === 'number' && s.duration_min > 0 && (
                        <span className="shrink-0 self-start tabular-nums" style={{ fontSize: 12, color: SUB, fontWeight: 600 }}>{s.duration_min} min</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* 底部: prep→cook 推进 / cook 完成 */}
      <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20"
        style={{ background: `${CREAM}f0`, backdropFilter: 'blur(8px)', borderTop: '1px solid #E5E5E0' }}>
        <div className="px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
          {phase === 'prep' ? (
            <button onClick={() => setPhase('cook')}
              className="w-full flex items-center justify-center gap-2 rounded-full font-bold text-white active:scale-[0.98] transition-transform"
              style={{ height: 50, background: BRAND, fontSize: 15, boxShadow: '0 8px 30px rgba(255,90,31,0.22)' }}>
              {L('Start cooking', 'Simulan ang pagluluto')}
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>local_fire_department</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              {/* Share this dish → 菲佣社区 composer (compose=1 自动开 + dish 预选) */}
              <button onClick={() => navigate(`/helper-community?compose=1&dish=${dish.id}`)}
                className="shrink-0 flex items-center justify-center gap-1.5 rounded-full font-bold active:scale-[0.98] transition-transform"
                style={{ height: 50, paddingLeft: 18, paddingRight: 18, background: '#FFFFFF', color: BRAND, border: `1.5px solid ${BRAND}`, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>photo_camera</span>
                {L('Share', 'Ibahagi')}
              </button>
              <button onClick={onBack}
                className="flex-1 flex items-center justify-center gap-2 rounded-full font-bold text-white active:scale-[0.98] transition-transform"
                style={{ height: 50, background: doneSteps.size >= cook.length && cook.length > 0 ? GREEN : INK, fontSize: 15 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                {doneSteps.size >= cook.length && cook.length > 0
                  ? L('Done! Back to menu', 'Tapos! Bumalik sa menu')
                  : L('Back to menu', 'Bumalik sa menu')}
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
