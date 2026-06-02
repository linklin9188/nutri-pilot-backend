/**
 * TodayMenu — 今日菜单 (Warm Hearth 大改版, 老板 5/31 照 Stitch 图4 落地)
 *
 * 结构 (Stitch _4): 顶部"今日菜单"+今天/明天 tab → 早/午/晚分段 (各带图标)
 *   → 每道菜横卡 (左 标题+一句话+可做绿标, 右 96×96 图) → 底部"换一批 + 开始做饭"。
 *
 * 数据: loadEmployerTodayMenu(uid, dayOffset) 读 user_weekly_menus 已持久化菜单
 *   (报菜名/排菜单写入), byMeal 分桶, 跟 /chef 报菜名闭环。只读不改算法, 不 bump。
 *   雇主自己用时走 fallback (无 household_members 行 → 当 employer 自己读)。
 *   v1: 可做=steps_verified 真值; 缺N样 待 v2 (需库存真数据 + 单菜短缺计算)。
 *   换一批 → /weekly (原位重排留 v2); 开始做饭 → /cook-v2 (新做饭页: 列表→选菜→先备菜🧺→再做饭🔥)。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import { getDishTitle } from '../lib/dishTitleI18n';
import { loadEmployerTodayMenu, type EmployerMenuResult, type EmployerDishLite } from '../lib/helperEmployerMenu';

const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

type MealKey = 'breakfast' | 'lunch' | 'dinner';
const MEALS: { key: MealKey; icon: string; zh: string; en: string }[] = [
  { key: 'breakfast', icon: 'wb_sunny', zh: '早餐', en: 'Breakfast' },
  { key: 'lunch', icon: 'lunch_dining', zh: '午餐', en: 'Lunch' },
  { key: 'dinner', icon: 'dinner_dining', zh: '晚餐', en: 'Dinner' },
];

export default function TodayMenu() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language !== 'en';
  const t = (z: string, e: string) => (zh ? z : e);

  const [tab, setTab] = useState<'today' | 'tomorrow'>('today');
  const [today, setToday] = useState<EmployerMenuResult | null>(null);
  const [tomorrow, setTomorrow] = useState<EmployerMenuResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const uid = getUserId();
      const [td, tmr] = await Promise.all([
        loadEmployerTodayMenu(uid, 0),
        loadEmployerTodayMenu(uid, 1),
      ]);
      if (!cancelled) { setToday(td); setTomorrow(tmr); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const menu = tab === 'today' ? today : tomorrow;
  const byMeal = menu?.byMeal ?? { breakfast: [], lunch: [], dinner: [] };
  const hasAny = (menu?.dishes?.length ?? 0) > 0;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: hasAny ? 96 : 24 }}>
      {/* Header */}
      <header className="sticky top-0 z-20" style={{ background: `${CREAM}cc`, backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h1 className="font-black" style={{ fontSize: 24 }}>{t('今日菜单', "Today's Menu")}</h1>
          <button onClick={() => navigate('/weekly')}
            className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
            style={{ width: 40, height: 40, background: ALT }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>tune</span>
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-6 px-4" style={{ borderBottom: '1px solid #E5E5E0' }}>
          {(['today', 'tomorrow'] as const).map(k => {
            const on = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                className="pb-2 pt-1 font-bold"
                style={{
                  fontSize: 14, color: on ? INK : SUB,
                  borderBottom: `2px solid ${on ? BRAND : 'transparent'}`,
                }}>
                {k === 'today' ? t('今天', 'Today') : t('明天', 'Tomorrow')}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 px-4 py-4 space-y-6">
        {loading ? (
          <div className="space-y-3 pt-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-xl" style={{ height: 96, background: ALT, opacity: 0.6 }} />
            ))}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center text-center pt-16 px-6">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#CFCFC8' }}>restaurant_menu</span>
            <p className="font-bold mt-4" style={{ fontSize: 17 }}>
              {tab === 'today' ? t('今天还没排菜', 'No menu yet for today') : t('明天还没排菜', 'No menu yet for tomorrow')}
            </p>
            <p className="mt-1" style={{ fontSize: 14, color: SUB }}>
              {t('去报菜名挑几道，或一键排菜单', 'Pick a few dishes, or auto-plan')}
            </p>
            <div className="flex gap-3 mt-6 w-full">
              <button onClick={() => navigate('/chef')}
                className="flex-1 py-3 rounded-full font-bold text-white active:scale-[0.98] transition-transform"
                style={{ background: BRAND, fontSize: 15 }}>
                {t('报菜名', 'Report a dish')}
              </button>
              <button onClick={() => navigate('/weekly')}
                className="flex-1 py-3 rounded-full font-bold active:scale-[0.98] transition-transform"
                style={{ background: ALT, color: INK, fontSize: 15 }}>
                {t('一键排菜单', 'Auto-plan')}
              </button>
            </div>
          </div>
        ) : (
          MEALS.map(m => {
            const list = byMeal[m.key];
            if (!list || list.length === 0) return null;
            return (
              <section key={m.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined" style={{ color: BRAND, fontSize: 22 }}>{m.icon}</span>
                  <h2 className="font-bold" style={{ fontSize: 18 }}>{zh ? m.zh : m.en}</h2>
                </div>
                <div className="space-y-3">
                  {list.map(d => <DishRow key={`${m.key}-${d.id}`} d={d} zh={zh} language={language} t={t} />)}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* Footer */}
      {hasAny && (
        <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20"
          style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)', borderTop: '1px solid #E5E5E0' }}>
          <div className="flex gap-3 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
            <button onClick={() => navigate('/weekly')}
              className="flex-1 flex items-center justify-center gap-2 rounded-full font-bold active:scale-[0.98] transition-transform"
              style={{ height: 48, background: ALT, color: INK, fontSize: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>shuffle</span>
              {t('换一批', 'Reshuffle')}
            </button>
            <button onClick={() => navigate('/cook-v2')}
              className="flex-[2] flex items-center justify-center gap-2 rounded-full font-bold text-white active:scale-[0.98] transition-transform"
              style={{ height: 48, background: BRAND, fontSize: 14, boxShadow: '0px 8px 30px rgba(255,90,31,0.20)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>restaurant_menu</span>
              {t('开始做饭', 'Start cooking')}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function DishRow({ d, zh, language, t }: {
  d: EmployerDishLite; zh: boolean;
  language: string; t: (z: string, e: string) => string;
}) {
  const title = getDishTitle(d as any, language) || d.title_zh;
  const desc = zh ? d.description_zh : (d.description_en || d.description_zh);
  return (
    <div className="flex items-stretch justify-between gap-4 rounded-xl p-3"
      style={{ background: '#FFFFFF', boxShadow: '0px 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="flex-1 flex flex-col min-w-0">
        <p className="font-bold truncate" style={{ fontSize: 16 }}>{title}</p>
        {desc && <p className="mt-1 flex-1 line-clamp-2" style={{ fontSize: 14, color: SUB }}>{desc}</p>}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {d.steps_verified && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(76,175,80,0.12)', color: GREEN, fontSize: 12, fontWeight: 500 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
              {t('可做', 'Ready')}
            </span>
          )}
          {d.cook_time_min != null && (
            <span style={{ fontSize: 12, color: SUB }}>⏱ {d.cook_time_min}min</span>
          )}
        </div>
      </div>
      <div className="rounded-lg bg-cover bg-center shrink-0"
        style={{
          width: 96, height: 96, background: ALT,
          backgroundImage: d.image_url ? `url("${d.image_url}")` : undefined,
        }} />
    </div>
  );
}
