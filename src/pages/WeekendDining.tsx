/**
 * WeekendDining — 独立路由 /weekend，让工作日的用户也能跳进来看周末
 * 出门外食推荐 + 本周营养回顾。
 *
 * Home 周末会直接 inline 渲染 WeekendDiningReport，所以这页主要是
 * 工作日的入口（"提前看本周末去哪吃"）。
 */
import { useNavigate } from 'react-router-dom';
import WeekendDiningReport from '../components/WeekendDiningReport';
import BottomTabBar from '../components/BottomTabBar';

export default function WeekendDining() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen max-w-md mx-auto relative pb-32" style={{ background: '#FEF7E5' }}>
      <header className="sticky top-0 z-50 bg-[#FEF7E5]/95 backdrop-blur-md px-5 py-4 flex items-center gap-3 border-b border-black/5">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(0,0,0,0.05)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <div>
          <p className="font-serif font-black text-[18px] leading-tight">本周末出门吃</p>
          <p className="text-[11px]" style={{ color: 'rgba(0,0,0,0.45)' }}>香港餐厅推荐 · 提前预订</p>
        </div>
      </header>
      <main className="pt-2">
        <WeekendDiningReport />
      </main>
      <BottomTabBar />
    </div>
  );
}
