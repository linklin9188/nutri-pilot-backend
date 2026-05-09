import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const { t, toggleLanguage, language } = useLanguage();
  const [step, setStep] = useState<"login" | "preferences">("login");
  
  // Preferences State
  const [taste, setTaste] = useState<string[]>([]);
  const [diet, setDiet] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [hometown, setHometown] = useState<string[]>([]);

  useEffect(() => {
    // If already logged in AND we are on login page, we could redirect,
    // but for demo purposes we allow viewing the login page.
  }, []);

  const handleLoginClick = () => {
    // Simulate login success and move to preferences step
    setStep("preferences");
  };

  const [isLoading, setIsLoading] = useState(false);

  const handleFinishSetup = async () => {
    setIsLoading(true);
    try {
      // Create a dummy user ID for demonstration (In production, use Supabase Auth user ID)
      const mockUserId = "00000000-0000-0000-0000-000000000001";
      
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", mockUserId);
      localStorage.setItem("userTaste", taste.join(","));
      localStorage.setItem("userDiet", diet.join(","));
      localStorage.setItem("userAvoid", avoid.join(","));
      localStorage.setItem("userAge", age);
      localStorage.setItem("userHometown", hometown.join(","));

      if (supabase) {
        // Upsert profile into Supabase
        const { error } = await supabase.from('user_profiles').upsert({
          id: mockUserId,
          display_name: 'Nutri-Pilot User',
          age_group: age,
          hometown: hometown,
          tastes: taste,
          diet_goals: diet,
          avoid_ingredients: avoid
        });

        if (error) {
          console.error("Error saving profile to Supabase:", error);
          // Non-blocking error for UI
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      navigate("/");
    }
  };

  return (
    <div className="font-sans min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden bg-[#1D1D1F] text-white shadow-2xl">
      {/* Background Image - High-end premium kitchen/ingredients */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556910103-1c02745a805c?q=80&w=1400&fit=crop')" }}
      ></div>
      {/* Dark Gradient Overlay & Vignette for frosted depth */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/30 via-black/40 to-[#121212] backdrop-blur-[2px]"></div>
      
      {/* Header (Language Toggle) */}
      <header className="flex justify-end p-6 z-10 relative">
        <button 
          onClick={toggleLanguage}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 hover:bg-white/20 text-white font-bold text-[13px] active:scale-95 transition-all outline-none"
        >
          {language === 'en' ? 'EN' : '中'}
        </button>
      </header>

      <AnimatePresence mode="wait">
        {step === "login" ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex-1 flex flex-col px-8 justify-end pb-16 z-10 relative"
          >
            <div className="mb-10">
               <h1 className="text-[54px] font-serif font-black text-white leading-tight mb-2 tracking-widest flex flex-col gap-1 drop-shadow-xl">
                 <span>悦小厨</span>
                 <span className="text-[24px] text-white/80 font-sans tracking-[0.2em] font-light uppercase">Nutri-Pilot</span>
               </h1>
               <div className="w-10 h-1 bg-primary mb-6 mt-4 rounded-full shadow-[0_0_15px_rgba(255,90,31,0.5)]"></div>
               <p className="text-[17px] text-white/80 leading-relaxed font-light tracking-widest">
                 {t("Only to understand your taste better", "只为更懂你的味")}
               </p>
            </div>

            <div className="w-full relative space-y-4">
                 {/* Glassmorphism Login Container */}
                 <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-[32px] p-6 flex flex-col gap-4 shadow-2xl relative overflow-hidden">
                   {/* Light reflection effect */}
                   <div className="absolute top-0 left-0 right-0 h-[100px] bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>

                   <button onClick={handleLoginClick} className="w-full h-14 flex items-center gap-4 px-6 rounded-[20px] bg-white text-black hover:bg-gray-100 transition-colors active:scale-[0.98] relative z-10 border border-transparent shadow-lg text-left">
                     <img src="https://upload.wikimedia.org/wikipedia/commons/1/14/WeChat_logo.svg" className="w-6 h-6 object-contain" alt="WeChat" />
                     <span className="text-[15px] font-bold tracking-wide flex-1 text-center pr-6">Continue with WeChat</span>
                   </button>
                   
                   <button onClick={handleLoginClick} className="w-full h-14 flex items-center gap-4 px-6 rounded-[20px] bg-[#25D366] text-white hover:brightness-110 transition-colors active:scale-[0.98] relative z-10 border border-transparent shadow-lg text-left">
                     <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/WhatsApp_icon.png" className="w-6 h-6 object-contain filter brightness-0 invert" alt="WhatsApp" />
                     <span className="text-[15px] font-bold tracking-wide flex-1 text-center pr-6">Continue with WhatsApp</span>
                   </button>
                   
                   <button onClick={handleLoginClick} className="w-full h-14 flex items-center gap-4 px-6 rounded-[20px] bg-black text-white hover:bg-black/80 transition-colors active:scale-[0.98] relative z-10 border border-white/10 shadow-lg text-left">
                     <span className="material-symbols-outlined text-[24px]">apple</span>
                     <span className="text-[15px] font-bold tracking-wide flex-1 text-center pr-6">Continue with Apple</span>
                   </button>
                   
                   <div className="h-[1px] w-full bg-white/10 my-1"></div>

                   <button onClick={handleLoginClick} className="w-full h-14 flex items-center justify-center gap-2 px-6 rounded-[20px] bg-transparent text-white border border-white/30 hover:bg-white/10 transition-colors active:scale-[0.98] relative z-10">
                     <span className="text-[14px] font-bold tracking-widest">{t("Use Phone Number", "使用手机号登录")}</span>
                   </button>
                 </div>
            </div>
            
            <p className="mt-8 text-center text-[11px] text-white/50 px-4 tracking-widest leading-relaxed">
              {t("By continuing, you agree to our Terms", "继续即代表您同意我们的 服务条款 与 隐私政策")}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="preferences"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col px-6 pt-4 pb-12 overflow-y-auto no-scrollbar z-10 relative"
          >
             <div className="mb-8">
               <h2 className="text-[28px] font-serif font-black text-white leading-tight mb-3 tracking-wide">
                 {t("Your Profile", "建立味觉档案")}
               </h2>
               <p className="text-[15px] text-white/80 font-light tracking-wide leading-relaxed">
                 {t("Let us know your taste so we can tailor the perfect menu for you.", "让我们更好地了解您的口味，为您定制专属菜单。")}
               </p>
             </div>

             <div className="space-y-8 flex-1">
               {/* Question 1 */}
               <div className="space-y-4">
                 <h3 className="text-[15px] font-bold flex items-center gap-2 text-white/90 tracking-wide">
                    <span className="material-symbols-outlined text-[20px] text-primary">restaurant</span>
                    {t("Favorite Taste?", "最喜欢的口味是？")}
                 </h3>
                 <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'light', labelEn: 'Light & Fresh', labelZh: '清淡鲜香' },
                      { id: 'spicy', labelEn: 'Spicy', labelZh: '无辣不欢' },
                      { id: 'savory', labelEn: 'Rich & Savory', labelZh: '浓油赤酱' },
                      { id: 'sweet', labelEn: 'Sweet', labelZh: '偏甜口' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setTaste(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}
                        className={`px-5 py-3 rounded-full border border-white/20 backdrop-blur-md ${
                          taste.includes(opt.id)
                            ? 'bg-primary text-white font-bold opacity-100 shadow-[0_0_20px_rgba(255,90,31,0.4)] border-primary' 
                            : 'bg-white/10 text-white/80 font-medium hover:bg-white/20'
                        } text-[14px] transition-all active:scale-95`}
                      >
                        {language === 'en' ? opt.labelEn : opt.labelZh}
                      </button>
                    ))}
                 </div>
               </div>

               {/* Question 2 */}
               <div className="space-y-4">
                 <h3 className="text-[15px] font-bold flex items-center gap-2 text-white/90 tracking-wide">
                    <span className="material-symbols-outlined text-[20px] text-primary">monitor_weight</span>
                    {t("Dietary Goal?", "目前的饮食目标？")}
                 </h3>
                 <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'balanced', labelEn: 'Balanced', labelZh: '营养均衡' },
                      { id: 'fatloss', labelEn: 'Fat-loss', labelZh: '减脂瘦身' },
                      { id: 'muscle', labelEn: 'Build Muscle', labelZh: '增肌高蛋白' },
                      { id: 'nourish', labelEn: 'Nourishing', labelZh: '养生滋补' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setDiet(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}
                        className={`px-5 py-3 rounded-full border border-white/20 backdrop-blur-md ${
                          diet.includes(opt.id)
                            ? 'bg-primary text-white font-bold opacity-100 shadow-[0_0_20px_rgba(255,90,31,0.4)] border-primary' 
                            : 'bg-white/10 text-white/80 font-medium hover:bg-white/20'
                        } text-[14px] transition-all active:scale-95`}
                      >
                        {language === 'en' ? opt.labelEn : opt.labelZh}
                      </button>
                    ))}
                 </div>
               </div>

               {/* Question 3 */}
               <div className="space-y-4">
                 <h3 className="text-[15px] font-bold flex items-center gap-2 text-white/90 tracking-wide">
                    <span className="material-symbols-outlined text-[20px] text-primary">block</span>
                    {t("Ingredients to avoid?", "有什么忌口吗？")}
                 </h3>
                 <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'none', labelEn: 'None', labelZh: '无忌口' },
                      { id: 'seafood', labelEn: 'No Seafood', labelZh: '忌海鲜' },
                      { id: 'cilantro', labelEn: 'No Cilantro', labelZh: '不吃香菜' },
                      { id: 'oniongarlic', labelEn: 'No Onion/Garlic', labelZh: '不吃葱蒜' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          if (opt.id === 'none') {
                            setAvoid(['none']);
                          } else {
                            setAvoid(prev => prev.includes('none') 
                              ? [opt.id] 
                              : prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id]
                            );
                          }
                        }}
                        className={`px-5 py-3 rounded-full border border-white/20 backdrop-blur-md ${
                          avoid.includes(opt.id)
                            ? 'bg-primary text-white font-bold opacity-100 shadow-[0_0_20px_rgba(255,90,31,0.4)] border-primary' 
                            : 'bg-white/10 text-white/80 font-medium hover:bg-white/20'
                        } text-[14px] transition-all active:scale-95`}
                      >
                        {language === 'en' ? opt.labelEn : opt.labelZh}
                      </button>
                    ))}
                 </div>
               </div>

               {/* Question 4 */}
               <div className="space-y-4">
                 <h3 className="text-[15px] font-bold flex items-center gap-2 text-white/90 tracking-wide">
                    <span className="material-symbols-outlined text-[20px] text-primary">cake</span>
                    {t("Age Group?", "您的年龄段？")}
                 </h3>
                 <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'genz', labelEn: 'Gen Z', labelZh: '00后' },
                      { id: 'millennial', labelEn: 'Millennial', labelZh: '90后' },
                      { id: 'genx', labelEn: 'Gen X', labelZh: '80后' },
                      { id: 'boomer', labelEn: 'Boomer+', labelZh: '70后及之前' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setAge(opt.id)}
                        className={`px-5 py-3 rounded-full border border-white/20 backdrop-blur-md ${
                          age === opt.id 
                            ? 'bg-primary text-white font-bold opacity-100 shadow-[0_0_20px_rgba(255,90,31,0.4)] border-primary' 
                            : 'bg-white/10 text-white/80 font-medium hover:bg-white/20'
                        } text-[14px] transition-all active:scale-95`}
                      >
                        {language === 'en' ? opt.labelEn : opt.labelZh}
                      </button>
                    ))}
                 </div>
               </div>

               {/* Question 5 */}
               <div className="space-y-4">
                 <h3 className="text-[15px] font-bold flex items-center gap-2 text-white/90 tracking-wide">
                    <span className="material-symbols-outlined text-[20px] text-primary">location_on</span>
                    {t("Hometown Cuisine?", "偏好哪个家乡菜系？")}
                 </h3>
                 <div className="flex flex-wrap gap-3">
                    {[
                      { id: 'sichuan', labelEn: 'Sichuan/Hunan', labelZh: '川湘菜' },
                      { id: 'cantonese', labelEn: 'Cantonese', labelZh: '粤菜' },
                      { id: 'jiangnan', labelEn: 'Jiangnan', labelZh: '江浙沪' },
                      { id: 'northern', labelEn: 'Northern', labelZh: '北方菜' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setHometown(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}
                        className={`px-5 py-3 rounded-full border border-white/20 backdrop-blur-md ${
                          hometown.includes(opt.id)
                            ? 'bg-primary text-white font-bold opacity-100 shadow-[0_0_20px_rgba(255,90,31,0.4)] border-primary' 
                            : 'bg-white/10 text-white/80 font-medium hover:bg-white/20'
                        } text-[14px] transition-all active:scale-95`}
                      >
                        {language === 'en' ? opt.labelEn : opt.labelZh}
                      </button>
                    ))}
                 </div>
               </div>
             </div>

             <div className="mt-12 pt-8">
                <button
                  disabled={taste.length === 0 && diet.length === 0 && avoid.length === 0 && !age && hometown.length === 0}
                  onClick={handleFinishSetup}
                  className="w-full bg-primary disabled:bg-white/10 disabled:text-white/30 text-white rounded-[24px] py-4 font-bold tracking-widest text-[16px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-[0_10px_30px_rgba(255,90,31,0.3)] disabled:shadow-none"
                >
                  <span className="uppercase">{t("Start Journey", "开启美食探索")}</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
                <div className="text-center mt-5">
                  <button onClick={handleFinishSetup} className="text-[14px] text-white/60 font-light tracking-wide hover:text-white transition-colors">
                    {t("Skip for now", "跳过，以后再设")}
                  </button>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

