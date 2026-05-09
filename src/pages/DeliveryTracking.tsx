import { useNavigate } from "react-router-dom";

export default function DeliveryTracking() {
  const navigate = useNavigate();

  return (
    <div className="bg-background font-sans text-on-surface min-h-screen pb-32 flex flex-col max-w-md mx-auto relative">
      <header className="bg-surface/80 backdrop-blur-xl docked full-width top-0 sticky z-50 border-b border-black/5 flex justify-between items-center w-full px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="active:scale-95 transition-transform duration-200 p-2 -ml-2 rounded-full hover:bg-black/5">
            <span className="material-symbols-outlined text-on-surface text-[20px]">arrow_back</span>
          </button>
          <h1 className="text-[18px] font-bold tracking-tight text-on-surface">Nutri-Pilot</h1>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden bg-black/5 active:scale-95 transition-transform duration-200 cursor-pointer" onClick={() => navigate('/settings')}>
          <img alt="User profile avatar" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAARkIy-iet9oY_FFoVcXUBSHTbaFWFj9w9NiVtBLM83yQmUF6iAqzHOPZ8gZTlMmzPP8yrytsYxhDm2FNUzQdjrJsuSPrvoXFGzfGNu8_R7chPdTtUIlWQFmQEIfv7tgUP0dv4Yb7xoj8AkktE8-06vEqwsAobIeTH2RBT2r6MbWRN9YgTr6176gVc3aZG6HAYDE-pBsmuPb-nPnKGrSU6ZyHMUBE_tJsxRcxfp2dH28RtaV9IK21CSmgdORtO3Nw-ymAp1V1DcXkM" />
        </div>
      </header>

      <main className="px-6 pt-8 pb-32">
        <section className="mb-8">
          <h2 className="text-[28px] leading-tight font-bold text-on-surface tracking-tight">今日食材配送</h2>
          <p className="text-[12px] text-secondary mt-1 uppercase tracking-wider">Ensuring premium ingredients are stored perfectly.</p>
        </section>

        <div className="space-y-6">
          <article className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-black/5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[16px] font-bold text-on-surface">Waves Pacific</h3>
                  <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">Elite Partner</span>
                </div>
                <div className="flex items-center text-emerald-600 gap-1 mt-1">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-[13px] font-bold">Delivered at 10:15 AM</span>
                </div>
              </div>
              <img alt="Meat Icon" className="w-14 h-14 rounded-2xl object-cover border border-black/5 shadow-sm" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC4Sxlh9EelgCuoBdIg9P8pybJrBN_Kib0D40HvuwQJiy_xUPlsl8oEjQDT7cWgzEa63D0vg-yKg3aDAYUgWzqr5QSbZ07K1TWVk-d_jkdtnbKOOmjwL3YB_sza8C1irU1kqhPf9DgrVjTs7oBAKaY8hGope1cIDoExRWpOLwP-6We_rx7Ga5e9xS1GQABBgl18BnuIh2NMp4pW9GOyf2zHXVidgftXmDBP2j8udtvuH5rvI5RHJ9y1dHmMbW2dXS7cjblWN-aUk1p-" />
            </div>
            <div className="bg-primary/5 border-l-[3px] border-primary p-4 rounded-r-2xl mt-4">
              <p className="text-[14px] text-on-surface leading-relaxed font-medium">
                <span className="font-bold text-primary">📍 Wagyu Ribeye:</span> DO NOT wash. Pat dry with paper towel, place in fridge zone B (0°C Fresh Compartment).<br />
                <span className="text-[12px] text-secondary mt-1 block">(和牛眼肉：严禁水洗，用纸巾吸干，放0度保鲜区)</span>
              </p>
              <div className="mt-4 flex justify-center py-2 bg-white/50 rounded-xl">
                <div className="relative w-full h-24 max-w-[120px]">
                  <img alt="Refrigerator Diagram" className="w-full h-full object-contain mix-blend-multiply" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTmWMmaKdBah2Di-DVgxPvPEl0dN2KHkvIbZCQjnw6wmZrPOV5o3YfvM2N596kDDKFq8ZoWXZujjE2wAczAtCkEXzf-CX-zpRrlkDspFcsqTUY4qZEyKrinE1hBWtJczm4wmmdsZ718W94qD_CnNsr2-TcfmMZS49RwIauTmfCIvYDU5XEP6N6TJ5WAlTr1HFieDy5hHk6T19FKHcBx4hNEfuumOvRAVX5oOmJdewZQ49kRQy3TbK1P9WtaHiPcTLFMfn803gfpTCc" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-1/3 bg-primary/10 border-y border-primary/30 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-primary">OPTIMAL ZONE</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-black/5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[16px] font-bold text-on-surface">Eat FRESH (Organic Garden)</h3>
                </div>
                <div className="flex items-center text-primary gap-1 mt-1">
                  <span className="material-symbols-outlined text-[14px] animate-pulse">schedule</span>
                  <span className="text-[13px] font-bold">Arriving in 15 mins (Est. 10:30 AM)</span>
                </div>
              </div>
              <img alt="Vegetable Icon" className="w-14 h-14 rounded-2xl object-cover shadow-sm border border-black/5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDVP7qZKmIHU3Hn2FRRBSnpWkTxk3QK9Jw7j3P5Eib17Iaz82i1oQt9kIrXAaGHFEjaIo7aOCXFFwHt00r6JVbU1yjxlaYomECzEaOGPsD4kWdKA-8P6GhE4N_HKRjyXr-Dn1g3wNKBnCiT90WyQQF3UJkLxncU78lnmk726fVRpkMuedQ7_rhX0gpGn8dDWI5eDtyLddWhOko1OnLO9uViIoj5gEsXUQ6XzLW9cNpAUSq3BWUdQrXdjGKkX8LL105BiwH-3TVUJApQ" />
            </div>
            <div className="bg-primary/5 border-l-[3px] border-primary p-4 rounded-r-2xl mt-4">
              <p className="text-[14px] text-on-surface leading-relaxed font-medium">
                <span className="font-bold text-primary">📍 Organic Choy Sum:</span> Keep inside paper wrap, place in bottom veggie drawer.<br />
                <span className="text-[12px] text-secondary mt-1 block">(蔬菜：保留纸包，放入最底层蔬菜抽屉)</span>
              </p>
            </div>
          </article>
        </div>

        <footer className="mt-10 space-y-6">
          <button onClick={() => navigate('/ai-pilot')} className="flex items-center justify-center gap-2 w-full text-secondary hover:text-on-surface transition-colors py-2 active:scale-95">
            <span className="material-symbols-outlined text-[#FF5A1F] text-lg">warning</span>
            <span className="text-sm font-bold">配送出现问题？联系AI助手</span>
          </button>
          <button onClick={() => navigate('/prep')} className="w-full bg-[#2D3748] text-white py-4 rounded-2xl font-bold text-[16px] active:scale-[0.98] transition-all shadow-lg shadow-black/10">
            进入任务看板
          </button>
        </footer>
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="bg-surface/90 backdrop-blur-2xl fixed bottom-0 w-full z-50 border-t border-black/5 flex justify-around items-center h-20 px-4 max-w-md mx-auto shadow-[0_-10px_30px_rgba(0,0,0,0.03)] right-0 left-0">
        <div className="flex flex-col items-center gap-1 group cursor-pointer" onClick={() => navigate('/')}>
          <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">home</span>
          <span className="text-[10px] uppercase tracking-widest text-secondary font-bold group-hover:text-primary">Home</span>
        </div>
        <div className="flex flex-col items-center gap-1 group cursor-pointer" onClick={() => navigate('/delivery')}>
          <span className="material-symbols-outlined text-primary scale-110">rebase_edit</span>
          <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Status</span>
        </div>
        <div className="flex flex-col items-center group -mt-8 cursor-pointer" onClick={() => navigate('/prep')}>
          <div className="w-14 h-14 bg-[#2D3748] rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 group cursor-pointer" onClick={() => navigate('/ai-pilot')}>
          <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">auto_awesome</span>
          <span className="text-[10px] uppercase tracking-widest text-secondary font-bold group-hover:text-primary">AI Pilot</span>
        </div>
        <div className="flex flex-col items-center gap-1 group cursor-pointer" onClick={() => navigate('/settings')}>
          <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">person</span>
          <span className="text-[10px] uppercase tracking-widest text-secondary font-bold group-hover:text-primary">Profile</span>
        </div>
      </nav>

      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
        <button onClick={() => navigate('/ai-pilot')} className="bg-white/80 backdrop-blur-md border border-black/5 px-6 py-2.5 rounded-full shadow-lg flex items-center gap-2 active:scale-95 transition-all text-on-surface">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span className="text-[13px] font-bold">AI Concierge Active</span>
        </button>
      </div>
    </div>
  );
}
