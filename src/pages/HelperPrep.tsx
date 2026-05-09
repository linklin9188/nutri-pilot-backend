import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

export default function HelperPrep() {
  const navigate = useNavigate();
  const { t, toggleLanguage, language } = useLanguage();

  const handleShare = () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: 'Aieats Prep',
        text: '今天的备菜清单和做饭指南 (Prep & Cooking Guide)',
        url: shareUrl,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('链接已复制，去WhatsApp发给姐姐吧！ (Link copied!)');
    }
  };

  // Mock data for prep tasks based on JSON schema concept
  const [tasks, setTasks] = useState([
    {
      id: "t1",
      title: "花胶 & 鸡肉",
      subTitle: "Fish Maw & Chicken",
      action: "花胶清洗切块，鸡肉焯水备用",
      actionEn: "Wash and slice fish maw, blanch chicken.",
      tray_slot: "放入 A格: 汤料",
      completed: false,
      img: "https://images.unsplash.com/photo-1604503468306-202f7bfc8171?auto=format&fit=crop&q=80&w=400&h=300"
    },
    {
      id: "t2",
      title: "菜心",
      subTitle: "Local Choy Sum",
      action: "洗净去根，切成5cm长",
      actionEn: "Wash, remove roots, cut into exact 5cm pieces.",
      tray_slot: "放入 B格: 蔬菜",
      completed: false,
      img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAcpqVNiYZ-AdqVBznUg3d2ENqyZcZNTLr8_iqrwrceIgWJXfUbbX1zieAnIwlccWIkZJzvQpO6FfdCVd1w3R_eAKYNOBJxqu2wZZd6T3sm4kw9xq2trjl_gKduY9_hNcWL8uRHBYsMjcp9KC65LiQC7ssdhJ167X0Cttw1_PhpqmUJD7yIDg0oreqEqWcPRnDqMJq2vsk3lniVNxfXeboshTaYE4afFZm88-mRlK_NxhDzOPNrke1haqJQPyqb-RjaJlrrDrsF2ktB"
    },
    {
      id: "t3",
      title: "炒菜心酱汁 (预调)",
      subTitle: "Pre-mix Sauce Bowl",
      action: "在小碗中混合：蒜末15g，生抽5ml，食盐1g，清水10ml，搅匀。",
      actionEn: "Mix in a small bowl: 15g minced garlic, 1 tsp Soy Sauce, 1/4 tsp Salt, 2 tsp Water. Stir well.",
      tray_slot: "放入 C格: 预调酱汁",
      completed: true,
      img: "https://images.unsplash.com/photo-1596647913344-934338006bdf?auto=format&fit=crop&q=80&w=400&h=300"
    }
  ]);

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed, tray_slot: !t.completed ? t.tray_slot.replace("放入", "已放入") : t.tray_slot.replace("已放入", "放入") } : t));
  };

  return (
    <div className="bg-background font-sans text-on-surface min-h-screen pb-32 flex flex-col max-w-md mx-auto relative">
      {/* TopAppBar */}
      <header className="bg-surface/80 backdrop-blur-xl docked full-width top-0 sticky z-50 border-b border-black/5 flex justify-between items-center w-full px-5 py-4">
        <div className="flex items-center gap-3">
          <button className="active:scale-95 transition-transform duration-200 bg-black/5 hover:bg-black/10 p-2 text-on-surface rounded-full flex items-center justify-center cursor-pointer" onClick={() => navigate('/')}>
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-[18px] font-bold tracking-tight leading-tight">{t("Aieats Prep", "备菜区 - 爱吃")}</span>
        </div>
        <button 
          onClick={toggleLanguage}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-on-surface font-bold text-[12px] active:scale-95 transition-all"
        >
          {language === 'en' ? 'EN' : '中'}
        </button>
      </header>

      {/* Phase Timeline */}
      <nav className="sticky top-16 z-40 bg-white/90 backdrop-blur-md px-6 py-4 flex justify-between items-center border-b border-black/5">
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              restaurant_menu
            </span>
          </div>
          <span className="text-[10px] font-bold text-primary tracking-wider uppercase">Prep</span>
        </div>
        <div className="h-[1px] flex-1 bg-black/5 mx-4"></div>
        <div className="flex flex-col items-center gap-1 opacity-40">
          <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-secondary">
            <span className="material-symbols-outlined text-[18px]">skillet</span>
          </div>
          <span className="text-[10px] font-bold text-secondary tracking-wider uppercase">Cook</span>
        </div>
        <div className="h-[1px] flex-1 bg-black/5 mx-4"></div>
        <div className="flex flex-col items-center gap-1 opacity-40">
          <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-secondary">
            <span className="material-symbols-outlined text-[18px]">room_service</span>
          </div>
          <span className="text-[10px] font-bold text-secondary tracking-wider uppercase">Serve</span>
        </div>
      </nav>

      <main className="px-5 pt-6 flex flex-col gap-6">
        {/* Guidance Card */}
        <section className="bg-primary/5 border-2 border-dashed border-primary/30 rounded-[24px] p-5">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary mt-0.5">tips_and_updates</span>
            <div>
              <h2 className="text-[16px] font-bold text-on-surface tracking-tight">{t("Preparation Tasks", "今日备菜汇总")}</h2>
              <p className="text-[12px] text-secondary mt-1">{t("Please prepare the ingredients according to instructions.", "请按指示准备食材，放在指定餐盒中。")}</p>
            </div>
          </div>
        </section>

        {/* Ingredient List */}
        <div className="flex flex-col gap-4">
          {tasks.map(task => (
             <motion.div
               layout
               key={task.id}
               onClick={() => toggleTask(task.id)}
               className={`rounded-[24px] p-4 flex items-center gap-4 transition-all duration-300 cursor-pointer ${
                 task.completed 
                 ? "bg-white/60 shadow-sm border border-emerald-100 opacity-60" 
                 : "bg-white shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-primary/40 ring-1 ring-primary/10"
               }`}
             >
                <div className={`w-16 h-16 rounded-2xl overflow-hidden shrink-0 ${task.completed ? "bg-black/5 grayscale-[0.5]" : "bg-black/5"}`}>
                   <img src={task.img} alt={task.subTitle} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className={`font-bold text-[15px] tracking-tight text-on-surface ${task.completed ? "opacity-50 line-through" : ""}`}>{t(task.subTitle, task.title)}</h3>
                  </div>
                  <div className="mt-1 space-y-1">
                    <p className={`text-[13px] leading-tight font-medium ${task.completed ? "text-secondary opacity-50 line-through" : "text-primary font-bold"}`}>
                      {t(task.actionEn, task.action)}
                    </p>
                  </div>
                  
                  {/* 
                  // Hidden for now, reserved for future cooking robot
                  {task.completed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600/50 bg-emerald-50 px-2 py-0.5 rounded-full mt-1 w-fit">
                      <span className="material-symbols-outlined text-[12px]">check_circle</span>
                      {task.tray_slot}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/5 px-2 py-0.5 rounded-full mt-1 w-fit">
                      <span className="material-symbols-outlined text-[12px]">location_on</span>
                      📍 {task.tray_slot}
                    </span>
                  )}
                  */}
                </div>

                {task.completed ? (
                   <div className="w-8 h-8 rounded-full bg-emerald-500 shrink-0 flex items-center justify-center shadow-sm">
                      <span className="material-symbols-outlined text-white text-[18px]">check</span>
                   </div>
                ) : (
                   <div className="w-8 h-8 rounded-full border-2 border-black/10 shrink-0 flex items-center justify-center transition-all active:scale-90"></div>
                )}
             </motion.div>
          ))}
        </div>
      </main>

      {/* AI Pilot Floating Action Button */}
      <div className="fixed bottom-28 right-6 flex flex-col items-end gap-2 z-[55] max-w-md w-full ml-auto" style={{maxWidth: 'calc(100% - 1.5rem)'}}>
        <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-primary/10 animate-bounce">
          <p className="text-[12px] font-bold text-on-surface">{t(`Need help? Call out "Aida".`, `需要翻译或解释菜谱？呼叫“Aida”`)}</p>
        </div>
        <button onClick={() => navigate('/ai-pilot')} className="w-14 h-14 bg-gradient-to-tr from-[#FF5A1F] to-[#FF9054] rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/30 active:scale-90 transition-transform">
          <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            mic
          </span>
        </button>
      </div>

      <footer className="fixed bottom-0 w-full max-w-md mx-auto z-50 p-6 bg-gradient-to-t from-background via-background/95 to-transparent flex flex-col gap-3">
        <button 
          onClick={handleShare}
          className="w-full h-14 bg-[#25D366] rounded-2xl flex items-center justify-center gap-2 text-white font-bold shadow-lg shadow-[#25D366]/20 active:scale-95 transition-transform duration-200"
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/WhatsApp_icon.png" alt="WhatsApp" className="w-5 h-5 object-contain filter brightness-0 invert" />
          <span className="text-[15px]">{t("Send to Helper", "一键发送工人姐姐")}</span>
        </button>

        <button onClick={() => navigate('/cook')} className="w-full h-14 bg-[#2D3748] rounded-2xl flex items-center justify-center gap-2 text-white font-bold shadow-lg shadow-black/10 active:scale-95 transition-transform duration-200">
          <span className="text-[15px]">{t("Start Cooking", "准备做饭")}</span>
          <span className="material-symbols-outlined text-[18px]">arrow_forward_ios</span>
        </button>
      </footer>
    </div>
  );
}
