import { useNavigate } from "react-router-dom";

export default function AIPilot() {
  const navigate = useNavigate();

  return (
    <div className="bg-background text-on-surface font-sans min-h-screen pb-32 max-w-md mx-auto relative overflow-x-hidden">
      <header className="bg-surface/80 backdrop-blur-xl docked full-width top-0 sticky z-50 border-b border-black/5">
        <div className="flex items-center justify-between px-5 h-16 w-full">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="active:scale-95 transition-transform duration-200 p-2 -ml-2 rounded-full hover:bg-black/5">
              <span className="material-symbols-outlined text-on-surface text-[20px]">arrow_back</span>
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-[pulse_2s_infinite]"></span>
                <h1 className="font-bold text-[18px] text-on-surface tracking-tight leading-tight">智能沟通助手</h1>
              </div>
              <p className="text-[11px] font-bold text-secondary tracking-wider">AI Pilot Interpreter</p>
            </div>
          </div>
          <button className="hover:bg-black/5 p-2 rounded-full transition-colors active:scale-95 duration-200 cursor-pointer" onClick={() => navigate('/settings')}>
            <span className="material-symbols-outlined text-on-surface">account_circle</span>
          </button>
        </div>
      </header>

      <main className="px-5 mt-8">
        <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-primary/10 flex flex-col gap-6 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl"></div>

          <div className="flex flex-col gap-2 relative z-10">
            <div className="bg-[#f8f8f8] border border-black/5 rounded-2xl p-4 self-start max-w-[85%] shadow-sm">
              <p className="font-bold text-on-surface text-[14px] leading-relaxed">
                <span className="mr-1">🗣️</span> 雇主：'昨天的牛肉有点硬，今晚炒得嫩一点，另外少放辣。'
              </p>
            </div>
            <span className="text-[11px] font-medium text-secondary ml-2">Yesterday at 8:15 PM</span>
          </div>

          <div className="flex flex-col items-center justify-center py-4 relative z-10">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-px h-full bg-gradient-to-b from-transparent via-primary/30 to-transparent"></div>
            </div>
            <div className="z-10 bg-white px-4 py-2 flex flex-col items-center gap-1 rounded-xl shadow-sm border border-black/5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <span className="font-bold text-primary text-[13px]">AI Buffering & Standardizing...</span>
              </div>
              <p className="text-[10px] text-secondary font-medium">AI 正在进行指令规范化与情绪减震</p>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rounded-full shadow-[0_0_10px_rgba(255,90,31,0.5)]"></div>
          </div>

          <div className="flex justify-end relative z-10">
            <div className="inline-flex p-1 bg-[#f8f8f8] border border-black/5 rounded-full gap-1">
              <button className="px-4 py-1.5 rounded-full bg-white shadow-sm font-bold text-[13px] text-on-surface">English</button>
              <button className="px-4 py-1.5 rounded-full font-bold text-[13px] text-secondary hover:text-on-surface transition-colors">Tagalog</button>
            </div>
          </div>

          <div className="flex flex-col gap-2 items-end relative z-10">
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 self-end max-w-[90%] shadow-sm">
              <p className="text-on-surface leading-relaxed text-[14px]">
                <span className="font-bold text-primary block mb-1">To Helper (Ika):</span>
                "Please slice the Wagyu beef into 2mm uniform pieces and marinate with 1 tbsp starch and 1 tbsp water for 15 minutes before cooking. Reduce chili seeds to keep spice mild."
              </p>
              <div className="mt-3 pt-3 border-t border-primary/10">
                <p className="text-[13px] text-primary/70 italic font-medium">
                  Pakibabad ang Wagyu beef sa 1 tbsp starch at tubig nang 15 minuto...
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 mr-2 mt-1">
              <span className="material-symbols-outlined text-green-500 text-[14px]">check_circle</span>
              <span className="text-[11px] text-green-600 font-bold">Successfully synced to Ika's Prep Board</span>
            </div>
          </div>
        </div>

        <section className="mt-10 flex flex-col gap-4">
          <h3 className="font-bold text-[11px] text-secondary uppercase tracking-widest px-1">Smart Quick-Reply (快捷指令发送)</h3>
          <div className="flex overflow-x-auto pb-4 gap-3 no-scrollbar -mx-5 px-5">
            {["晚半小时开饭", "今晚有客人来", "海鲜多洗几遍", "餐后加份水果"].map((reply, i) => (
              <button key={i} className="whitespace-nowrap px-6 py-3 rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-black/5 hover:border-primary/20 active:scale-95 transition-all text-on-surface font-bold text-[14px]">
                {reply}
              </button>
            ))}
          </div>
        </section>

        <div className="fixed bottom-28 left-0 right-0 z-40 pointer-events-none">
          <div className="max-w-md mx-auto flex justify-center w-full">
            <button className="bg-white/90 backdrop-blur-md border border-black/5 shadow-xl px-6 py-3.5 rounded-full flex items-center gap-3 active:scale-95 transition-transform duration-300 pointer-events-auto">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
              <span className="font-bold text-[14px] text-on-surface">Hold to Command Pilot</span>
            </button>
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-8 pt-4 bg-surface/90 backdrop-blur-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.03)] border-t border-black/5 max-w-md mx-auto right-0">
         <button onClick={() => navigate('/')} className="flex flex-col items-center justify-center text-secondary hover:text-primary transition-colors active:scale-90 duration-300">
           <span className="material-symbols-outlined">home</span>
           <span className="text-[11px] font-bold mt-1">Home</span>
         </button>
         <button onClick={() => navigate('/ai-pilot')} className="flex flex-col items-center justify-center text-primary bg-primary/10 rounded-full px-5 py-1.5 active:scale-90 duration-300">
           <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
           <span className="text-[11px] font-bold mt-1">Concierge</span>
         </button>
         <button onClick={() => navigate('/settings')} className="flex flex-col items-center justify-center text-secondary hover:text-primary transition-colors active:scale-90 duration-300">
           <span className="material-symbols-outlined">person</span>
           <span className="text-[11px] font-bold mt-1">Profile</span>
         </button>
      </nav>
    </div>
  );
}
