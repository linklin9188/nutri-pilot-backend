import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";

export default function HelperCook() {
  const navigate = useNavigate();
  const { t, toggleLanguage, language } = useLanguage();
  const [timerA, setTimerA] = useState(34 * 60 + 12);
  const [timerB, setTimerB] = useState(1 * 60 + 45);
  const [isRunningA, setIsRunningA] = useState(false);
  const [isRunningB, setIsRunningB] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);

  useEffect(() => {
    const int = setInterval(() => {
      setTimerA((t) => (isRunningA && t > 0 ? t - 1 : t));
      setTimerB((t) => (isRunningB && t > 0 ? t - 1 : t));
    }, 1000);
    return () => clearInterval(int);
  }, [isRunningA, isRunningB]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const recipes: Record<string, any> = {
    soup: {
      title: t("Fish Maw Chicken Soup", "花胶鸡汤"),
      image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&q=80&w=400&h=300",
      dosage: t("Flavor profile: Light & Healthy. PRE-MIXED: The salt is already measured 3g.", "大众口味：少盐，清淡。用量：盐 3g，清水 800ml。"),
      steps: t([
        "1. Pour exactly 800ml of room temperature water into the pot.",
        "2. Put ALL ingredients from Tray A (Chicken & Fish Maw) into the cold water.",
        "3. Turn on Stove to HIGH HEAT (Level 9). Wait for water to boil aggressively (about 8-10 mins).",
        "4. Once boiling, reduce to LOW HEAT (Level 2). Set a timer for 120 minutes.",
        "5. After 120 minutes, turn off the stove completely.",
        "6. Add exactly 3g of salt (1 level teaspoon). Stir for 10 seconds. Done."
      ], [
        "1. 炖锅中加入刚好 800ml 清水。",
        "2. 将 A格（鸡肉、花胶）全部放入冷水中。",
        "3. 开大火（9档），等待水完全烧开沸腾（约8-10分钟）。",
        "4. 水开后转小火（2档），计时盖煮 2 小时。",
        "5. 120分钟后，关火。",
        "6. 加入刚好 3g 盐，搅拌约10秒，出锅。"
      ])
    },
    choysum: {
      title: t("Garlic Choy Sum", "蒜蓉菜心"),
      image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDDSa22jNkQhaysgaZxFoWhS_UOY55R41bAi07TTGKmitqtts9ngyWQ6ULERxkQlm_BUqyCeNxOUQOLYORz79i_4lIOXGsksTj8STlzjr9wLJk5Q_9MgGVM-y8VdrU303cEhECMkHVxL1FsjL7Lt7QLWmFk3E1Z1_AmNBOnqRWf6LaJhk_8eD4fMQVzMtnk90F93fOxvR6--BgMXXZf0DkrOLgzSPTtuq5UZ4Mx75sfZjQ0xqBWAsJ2GCbzBmA8EsB_QqqYKDIyR7Ie",
      dosage: t("Flavor profile: Garlicky & Crisp. REQUIRED: Have 'Pre-mixed Sauce Bowl C' ready beside stove.", "大众口味：蒜香浓郁，火候清脆。用量：使用已经调好的“C格酱汁”。"),
      steps: t([
        "1. Turn on Stove to HIGH HEAT (Level 9). Wait 1 minute for pan to get very hot.",
        "2. Add exactly 1 Tbsp of cooking oil.",
        "3. Wait 10 seconds, then dump ALL Choy Sum (Tray B) into the pan.",
        "4. Stir rapidly and constantly for exactly 45 seconds.",
        "5. Check status: Leaves should shrink and stems turn vibrant dark green.",
        "6. Pour ALL contents of 'Pre-mixed Sauce Bowl C' over the vegetables.",
        "7. Stir rapidly for 15 seconds. Turn OFF stove IMMEDIATELY and plate."
      ], [
        "1. 开大火（9档），热锅1分钟直到锅非常热。",
        "2. 加入刚好 1 汤匙 食用油。",
        "3. 约10秒后，将 B格所有菜心倒入锅中。",
        "4. 快速连续翻炒刚好 45 秒。",
        "5. 确认状态：叶片收缩，根茎变深绿色。",
        "6. 将 C格的“预调酱汁”全部倒入锅中蔬菜上。",
        "7. 再次快速翻炒 15 秒，立刻关火出锅装盘。"
      ])
    }
  };

  return (
    <div className="bg-background text-on-surface antialiased flex justify-center w-full min-h-screen">
      <div className="w-[390px] h-full relative flex flex-col no-scrollbar pb-40">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md px-margin-page py-6 space-y-4 border-b border-black/5">
          <div className="flex justify-between items-center">
            <span className="material-symbols-outlined text-on-surface cursor-pointer p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-95" onClick={() => navigate('/prep')}>
              arrow_back
            </span>
            <h1 className="text-[20px] font-bold text-on-surface leading-tight text-center max-w-[200px] mx-auto tracking-tight">
              {t("Active Cooking", "正在烹饪")}
            </h1>
            <button 
              onClick={toggleLanguage}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-on-surface font-bold text-[12px] active:scale-95 transition-transform"
            >
              {language === 'en' ? 'EN' : '中'}
            </button>
          </div>

          <div className="flex items-center justify-between px-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-[14px] text-green-600">check</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-green-600 tracking-wider">Prep</span>
            </div>
            <div className="flex-1 h-[2px] bg-black/5 mx-2"></div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center relative bg-primary/5">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              </div>
              <span className="text-[10px] uppercase font-bold text-primary tracking-wider">COOKING</span>
            </div>
            <div className="flex-1 h-[2px] bg-black/5 mx-2"></div>
            <div className="flex flex-col items-center gap-1 opacity-40">
              <div className="w-6 h-6 rounded-full border-2 border-secondary bg-black/5"></div>
              <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Serve</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 px-4 mt-6 space-y-6">
          {/* Robot-Link IoT Dashboard */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <span className="font-bold text-[14px] text-primary">{t("Smart Cooker B1", "智能炒菜机 B1")}</span>
              </div>
              <span className="material-symbols-outlined text-primary text-[20px]">
                precision_manufacturing
              </span>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-white shrink-0 border border-black/5 shadow-sm">
                <img
                  className="w-full h-full object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVhpl-8UfniuuixvOKtyPmlv_Ak0Cazwz28O45I8pfkJRnmATE0p45Fc5W6sx7ZaSTobt7gzcjpSmSDeYYeMUedka5CI4VqQsq2hSq2q3a19cVJrCi4TLCpDoixJwIkBUFWKTn3kbU0LEsAXW-eIFyKxM5EtU1N_i7XzUcS0uy-FnMdvb5pcMZmPQq7eou80TlvvNpKB1pZ79-fKeq7StMmoSU0bzjSptMi3I5fTbnzQS2X0l1yadnBlZdeIy5JtboVt3TMQehdeeV"
                  alt="Pork"
                />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-[13px] text-on-surface">{t("Recipe loaded. Ready for Tray A, Slot B.", "指令就绪，待倒入A格肉片")}</p>
                <p className="text-secondary text-[12px]">{t("Ready to dispense oil & heat up.", "机体内部已预热")}</p>
              </div>
            </div>
            <button className="w-full h-12 bg-gradient-to-r from-primary to-[#FF9054] rounded-xl font-bold text-[15px] text-white shadow-md shadow-primary/20 active:scale-95 transition-transform">
              {t("Send Instructions to Robot", "发送指令至炒菜机")}
            </button>
          </section>

          {/* Symphony Timer Board */}
          <section className="space-y-4 mt-6">
            {/* Stove A */}
            <div 
              className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-black/5 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => setSelectedRecipe('soup')}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-secondary uppercase tracking-widest text-[10px]">{t("Stove A (Left)", "Stove A (左灶)")}</h3>
                  <p className="font-bold text-on-surface text-[16px] mt-0.5">{t("Fish Maw Chicken Soup", "花胶鸡汤")}</p>
                </div>
                <span className="material-symbols-outlined text-primary text-[20px]">timer</span>
              </div>
              <div 
                className="flex items-center gap-2 my-1.5 cursor-pointer active:scale-[0.98] transition-transform origin-left select-none inline-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRunningA(!isRunningA);
                }}
              >
                <span className="text-[32px] font-bold text-primary font-mono tracking-tight leading-none">
                  {formatTime(timerA)}
                </span>
                {isRunningA ? (
                  <span className="font-bold text-[13px] text-primary animate-pulse ml-1">{t("Simmering...", "慢炖中...")}</span>
                ) : (
                  <span className="font-bold text-[12px] text-primary flex items-center gap-0.5 opacity-90 bg-primary/10 px-2 py-1 rounded-full ml-1">
                    <span className="material-symbols-outlined text-[14px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    {t("Start", "点击开始")}
                  </span>
                )}
              </div>
              <div className="p-3 bg-primary/5 rounded-xl border-l-2 border-primary mt-3">
                <p className="font-bold text-primary text-[13px]">{t("Status: Low Heat Simmering", "状态: 小火慢炖中")}</p>
                <p className="text-secondary text-[12px] mt-0.5">{t("Tip: At 00:00, turn off heat and add salt.", "提示：倒计时结束时，关火加盐。")}</p>
              </div>
            </div>

            {/* Stove B */}
            <div 
              className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-black/5 cursor-pointer active:scale-[0.98] transition-transform space-y-4"
              onClick={() => setSelectedRecipe('choysum')}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-secondary uppercase tracking-widest text-[10px]">{t("Stove B (Right)", "Stove B (右灶)")}</h3>
                  <p className="font-bold text-on-surface text-[16px] mt-0.5">{t("Garlic Choy Sum", "蒜蓉菜心")}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div 
                    className="flex items-center gap-1 cursor-pointer active:scale-95 transition-transform origin-right select-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRunningB(!isRunningB);
                    }}
                  >
                    {!isRunningB && (
                      <span className="font-bold text-[10px] text-primary flex items-center bg-primary/10 px-1.5 py-0.5 rounded-full mr-1">
                        <span className="material-symbols-outlined text-[12px] leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                        {t("Start", "开始")}
                      </span>
                    )}
                    <span className="text-[16px] font-bold text-primary font-mono leading-none">
                       {formatTime(timerB)}
                    </span>
                    {isRunningB && (
                      <span className="material-symbols-outlined text-primary text-[14px] animate-pulse ml-1">schedule</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 items-center bg-[#f8f8f8] p-3 rounded-xl border border-black/5">
                <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 shadow-sm border border-black/5">
                  <img
                    alt="Choy Sum"
                    className="w-full h-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDDSa22jNkQhaysgaZxFoWhS_UOY55R41bAi07TTGKmitqtts9ngyWQ6ULERxkQlm_BUqyCeNxOUQOLYORz79i_4lIOXGsksTj8STlzjr9wLJk5Q_9MgGVM-y8VdrU303cEhECMkHVxL1FsjL7Lt7QLWmFk3E1Z1_AmNBOnqRWf6LaJhk_8eD4fMQVzMtnk90F93fOxvR6--BgMXXZf0DkrOLgzSPTtuq5UZ4Mx75sfZjQ0xqBWAsJ2GCbzBmA8EsB_QqqYKDIyR7Ie"
                  />
                </div>
                <div>
                  <p className="font-bold text-[13px] text-primary">{t("Step 2 of 3: Add Choy Sum", "步骤 2/3：下菜心爆炒")}</p>
                  <p className="text-[12px] text-secondary mt-0.5">{t("Rapid fire stir-fry", "快速翻炒")}</p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[390px] px-margin-page pb-8 pointer-events-none z-[40]">
          <div className="flex flex-col items-center gap-6 pointer-events-auto">
            <div className="relative flex flex-col items-center">
              <div className="mb-4 px-4 py-2 bg-primary/10 backdrop-blur-md rounded-full border border-primary/20 text-primary">
                <p className="font-bold text-[12px]">{t(`"Is the fish done?"`, `"可以起锅了吗？"`)}</p>
              </div>
              <button onClick={() => navigate('/ai-pilot')} className="w-14 h-14 bg-gradient-to-tr from-[#FF5A1F] to-[#FF9054] rounded-full shadow-lg shadow-primary/30 flex items-center justify-center active:scale-90 transition-transform">
                <span className="material-symbols-outlined text-white text-3xl">mic</span>
              </button>
            </div>
            <button onClick={() => navigate('/')} className="w-full h-14 bg-[#2D3748] rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform">
              <span className="text-[16px] font-bold text-white tracking-tight">{t("Cooking complete, ready to serve", "全部做好，准备上菜")}</span>
            </button>
          </div>
        </div>

        <div className="fixed inset-0 -z-10 bg-background pointer-events-none w-[390px] ml-auto mr-auto max-w-md left-0 right-0"></div>

        {/* Detailed Recipe Modal */}
        <AnimatePresence>
          {selectedRecipe && recipes[selectedRecipe] && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] w-[390px] max-w-md mx-auto"
                onClick={() => setSelectedRecipe(null)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[390px] max-w-md bg-white rounded-t-3xl border-t border-black/5 p-6 z-[70] shadow-2xl flex flex-col max-h-[85vh]"
              >
                <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-6 shrink-0" />
                
                <div className="overflow-y-auto no-scrollbar flex-1 pb-8 space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-on-surface mb-2 leading-tight tracking-tight">
                      {recipes[selectedRecipe].title}
                    </h2>
                    <img 
                      src={recipes[selectedRecipe].image} 
                      alt={recipes[selectedRecipe].title}
                      className="w-full h-48 object-cover rounded-xl mt-4 bg-black/5 border border-black/5 shadow-sm"
                    />
                  </div>
                  
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-lg">restaurant</span>
                      <h3 className="font-bold text-primary text-[13px] tracking-wider">{t("Required Dosage & Profile", "用法用量标准")}</h3>
                    </div>
                    <p className="text-on-surface font-medium text-[14px] leading-relaxed">
                      {recipes[selectedRecipe].dosage}
                    </p>
                  </div>
                  
                  <div>
                    <h3 className="font-bold text-secondary text-[13px] tracking-wider mb-4 border-b border-black/5 pb-2">{t("Detailed Steps", "详细步骤教程")}</h3>
                    <ul className="space-y-4">
                      {recipes[selectedRecipe].steps.map((step: string, idx: number) => (
                        <li key={idx} className="flex gap-3">
                          <span className="text-primary font-mono font-bold mt-0.5 shrink-0">
                            {(idx + 1).toString().padStart(2, '0')}
                          </span>
                          <span className="text-on-surface font-medium text-[15px] leading-relaxed">
                            {step.substring(step.indexOf('.') + 1).trim()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 mt-auto border-t border-black/5 pb-8 shrink-0">
                  <button 
                    onClick={() => setSelectedRecipe(null)}
                    className="w-full py-4 rounded-xl bg-black/5 text-on-surface font-bold hover:bg-black/10 active:scale-95 transition-all text-[15px]"
                  >
                    {t("Close Recipe", "关闭菜谱")}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
