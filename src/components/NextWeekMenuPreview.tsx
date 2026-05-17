/**
 * NextWeekMenuPreview — 周末 Home 顶部展示下周 5 天菜单 preview。
 *
 * 让用户周末就能看到下周计划，提前采购或下订单。每天卡片：日期 + 周几
 * 标签 + 午餐 / 晚餐缩略图列表。CTA 跳 /weekly 看完整菜单，跳 /verify
 * 看采购清单。
 *
 * 数据来源：useWeeklyMenu(weekOffset=1) — 接住下周一开始的 5 天菜单。
 */
import { useNavigate } from 'react-router-dom';
import { useWeeklyMenu } from '../hooks/useWeeklyMenu';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五'];

export default function NextWeekMenuPreview() {
  const navigate = useNavigate();
  const { weeklyMenu, loading } = useWeeklyMenu(1);   // 1 = next week

  // Only show Mon-Fri (algo already skips weekend; defensive filter)
  const days = (weeklyMenu?.days ?? []).filter(d => d.dayIndex <= 4);

  return (
    <section className="rounded-3xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #FFFAF5 0%, #FFF1E2 60%, #FFE3C7 100%)',
        boxShadow: '0 8px 24px rgba(255,140,80,0.10)',
      }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]"
          style={{ color: '#FF5A1F' }}>
          下周菜单 · Next week
        </p>
        <h2 className="font-serif font-black mt-1" style={{ fontSize: 22, color: '#1a1a1a', lineHeight: 1.2 }}>
          下周饭桌已经备好
        </h2>
        <p className="font-serif italic mt-2" style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.5)', lineHeight: 1.5 }}>
          这两天空出来，您可以慢慢采买，或者把清单发给店家提前下单。
        </p>
        {/* Decorative emoji */}
        <span className="absolute right-5 top-5 text-[44px] opacity-[0.18] select-none pointer-events-none">🗓️</span>
      </div>

      {/* Day cards */}
      <div className="px-3 pb-3 flex flex-col gap-2">
        {loading ? (
          <div className="px-5 py-8 text-center text-[12px]" style={{ color: 'rgba(0,0,0,0.4)' }}>
            正在为下周排菜…
          </div>
        ) : days.length === 0 ? (
          <div className="px-5 py-8 text-center" style={{ color: 'rgba(0,0,0,0.45)' }}>
            <span className="text-[28px] block mb-2">🌿</span>
            <p className="text-[12.5px]">下周菜单还在生成中。一会儿回来看看？</p>
          </div>
        ) : days.map(day => {
          const lunch = day.lunchDishes ?? [];
          const dinner = day.dishes ?? [];
          const dayLabel = WEEKDAY_LABELS[day.dayIndex] ?? day.dayLabel ?? '';
          const [, m, d] = day.date.split('-');
          return (
            <div key={day.dayIndex}
              className="rounded-2xl bg-white/95 px-4 py-3 flex items-center gap-3"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              {/* Date column */}
              <div className="shrink-0 text-center w-12">
                <p className="font-serif font-black" style={{ fontSize: 13, color: '#FF5A1F', letterSpacing: '0.04em' }}>
                  {dayLabel}
                </p>
                <p className="font-black tabular-nums" style={{ fontSize: 15, color: '#1a1a1a', marginTop: 1 }}>
                  {parseInt(m, 10)}/{parseInt(d, 10)}
                </p>
              </div>

              {/* Lunch + Dinner names */}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                {lunch.length > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-bold" style={{ color: '#FFA94D', letterSpacing: '0.06em' }}>午</span>
                    <p className="font-serif text-[12.5px] truncate" style={{ color: '#1a1a1a' }}>
                      {lunch.map(x => x.title_zh ?? x.title).filter(Boolean).join(' · ')}
                    </p>
                  </div>
                )}
                {dinner.length > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-bold" style={{ color: '#6C5CE7', letterSpacing: '0.06em' }}>晚</span>
                    <p className="font-serif text-[12.5px] truncate" style={{ color: '#1a1a1a' }}>
                      {dinner.map(x => x.title_zh ?? x.title).filter(Boolean).join(' · ')}
                    </p>
                  </div>
                )}
                {lunch.length === 0 && dinner.length === 0 && (
                  <p className="text-[12px]" style={{ color: 'rgba(0,0,0,0.35)' }}>这天还没排上。</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA row — 看详情 + 准备采购 */}
      <div className="px-3 pb-4 flex gap-2">
        <button
          onClick={() => navigate('/weekly')}
          className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-1.5 font-bold text-white active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF9054)', fontSize: 13, boxShadow: '0 6px 16px rgba(255,90,31,0.30)' }}>
          看完整菜单
          <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>arrow_forward_ios</span>
        </button>
        <button
          onClick={() => navigate('/verify?mode=week')}
          className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-1.5 font-bold active:scale-95 transition-transform"
          style={{ background: 'white', color: '#1a1a1a', fontSize: 13, border: '1px solid rgba(0,0,0,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#FF5A1F' }}>shopping_cart</span>
          准备采购
        </button>
      </div>
    </section>
  );
}
