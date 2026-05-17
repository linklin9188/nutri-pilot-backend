/**
 * NextWeekMenuPreview — 周末 Home 下方的"下周菜单"快捷入口。
 *
 * 不再展开 5 天预览（让位给周末外食推荐），改成一张简洁 nav card：
 * 一句话告诉用户下周饭桌已备好，主 CTA 直接跳 /weekly 看完整菜单。
 *
 * 数据从 useWeeklyMenu(weekOffset=1) 拿一下下周 menu，纯展示"X 道菜准备好"
 * 数字 — 让用户感觉到真实工作量。
 */
import { useNavigate } from 'react-router-dom';
import { useWeeklyMenu } from '../hooks/useWeeklyMenu';

export default function NextWeekMenuPreview() {
  const navigate = useNavigate();
  const { weeklyMenu, loading } = useWeeklyMenu(1);   // 1 = next week

  const totalDishes = (weeklyMenu?.days ?? [])
    .filter(d => d.dayIndex <= 4)
    .reduce((n, d) => n + (d.dishes?.length ?? 0) + (d.lunchDishes?.length ?? 0), 0);

  return (
    <button
      onClick={() => navigate('/weekly')}
      className="w-full rounded-3xl px-5 py-5 text-left active:scale-[0.99] transition-transform flex items-center gap-4"
      style={{
        background: 'linear-gradient(135deg, #FFFAF5 0%, #FFE9D2 100%)',
        boxShadow: '0 6px 18px rgba(255,140,80,0.10)',
        border: '1px solid rgba(255,140,80,0.15)',
      }}>
      {/* Icon block */}
      <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
        <span style={{ fontSize: 30 }}>🗓️</span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: '#FF5A1F' }}>
          下周菜单 · Next week
        </p>
        <p className="font-serif font-black mt-1" style={{ fontSize: 17, color: '#1a1a1a', lineHeight: 1.2 }}>
          下周饭桌已经备好
        </p>
        <p className="font-serif italic mt-1" style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)' }}>
          {loading ? '正在为下周排菜…'
            : totalDishes > 0 ? `周一到周五共 ${totalDishes} 道菜，慢慢采买。`
            : '点开看看本周计划。'}
        </p>
      </div>

      {/* Chevron */}
      <span className="material-symbols-outlined shrink-0" style={{ fontSize: 22, color: '#FF5A1F' }}>
        chevron_right
      </span>
    </button>
  );
}
