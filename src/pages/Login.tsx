import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const { t, toggleLanguage, language } = useLanguage();
  const [step, setStep] = useState<"login" | "preferences">("login");
  const [taste, setTaste] = useState<string[]>([]);
  const [diet, setDiet] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [hometown, setHometown] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoginClick = () => setStep("preferences");

  const handleFinishSetup = async () => {
    setIsLoading(true);
    try {
      const mockUserId = "00000000-0000-0000-0000-000000000001";
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", mockUserId);
      localStorage.setItem("userTaste", taste.join(","));
      localStorage.setItem("userDiet", diet.join(","));
      localStorage.setItem("userAvoid", avoid.join(","));
      localStorage.setItem("userAge", age);
      localStorage.setItem("userHometown", hometown.join(","));
      if (supabase) {
        await supabase.from("user_profiles").upsert({
          id: mockUserId,
          display_name: "Nutri-Pilot User",
          age_group: age,
          hometown,
          tastes: taste,
          diet_goals: diet,
          avoid_ingredients: avoid,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      navigate("/");
    }
  };

  return (
    <div
      className="font-sans min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: "#080808" }}
    >
      {/* ── Hero photo: top 62% of screen, fades down into pure black ── */}
      <div className="absolute inset-x-0 top-0 z-0" style={{ height: "62%" }}>
        <img
          src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=90"
          alt=""
          className="w-full h-full object-cover object-center"
          style={{ filter: "brightness(0.72)" }}
        />
        {/* Smooth fade to black at bottom of photo */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: "60%",
            background:
              "linear-gradient(to bottom, transparent 0%, #080808 100%)",
          }}
        />
        {/* Subtle side vignettes */}
        <div
          className="absolute inset-y-0 left-0 w-16"
          style={{
            background: "linear-gradient(to right, rgba(8,8,8,0.5), transparent)",
          }}
        />
        <div
          className="absolute inset-y-0 right-0 w-16"
          style={{
            background: "linear-gradient(to left, rgba(8,8,8,0.5), transparent)",
          }}
        />
      </div>

      {/* ── Language toggle ───────────────────────────────────────────── */}
      <header className="relative z-10 flex justify-end p-6">
        <button
          onClick={toggleLanguage}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white/70 hover:text-white transition-colors"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          {language === "en" ? "EN" : "中"}
        </button>
      </header>

      <AnimatePresence mode="wait">
        {step === "login" ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 flex flex-col justify-end px-7 pb-10 z-10 relative"
          >
            {/* Brand block */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.7, ease: "easeOut" }}
              className="mb-7"
            >
              <h1
                className="font-serif font-black text-white leading-none tracking-widest"
                style={{ fontSize: 58, letterSpacing: "0.04em" }}
              >
                悦小厨
              </h1>
              {/* Brand accent line */}
              <div
                className="mt-4 mb-5 rounded-full"
                style={{
                  width: 36,
                  height: 2,
                  background: "#FF5A1F",
                  boxShadow: "0 0 12px rgba(255,90,31,0.6)",
                }}
              />
              <p
                className="text-white/50 font-light tracking-[0.28em] uppercase"
                style={{ fontSize: 13, letterSpacing: "0.26em" }}
              >
                Nutri · Pilot
              </p>
              <p
                className="mt-3 text-white/60 font-light"
                style={{ fontSize: 15, letterSpacing: "0.14em" }}
              >
                {t("Only to understand your taste better", "只为更懂你的味")}
              </p>
            </motion.div>

            {/* Login buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: "easeOut" }}
              className="flex flex-col items-center gap-2.5"
            >
              {/* WeChat — white pill, auto-width centered */}
              <div className="w-full text-center">
                <button
                  onClick={handleLoginClick}
                  className="inline-flex items-center gap-2 rounded-full bg-white text-black active:scale-[0.98] transition-transform"
                  style={{ fontSize: 13, fontWeight: 600, width: 192, height: 40, boxShadow: "0 4px 16px rgba(0,0,0,0.30)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <ellipse cx="7.5" cy="8.5" rx="6" ry="4.5" fill="#07C160"/>
                    <circle cx="5.5" cy="8.5" r="1" fill="white"/>
                    <circle cx="7.5" cy="8.5" r="1" fill="white"/>
                    <circle cx="9.5" cy="8.5" r="1" fill="white"/>
                    <ellipse cx="13" cy="12" rx="5.5" ry="4" fill="#07C160"/>
                    <circle cx="11.5" cy="12" r="0.9" fill="white"/>
                    <circle cx="13" cy="12" r="0.9" fill="white"/>
                    <circle cx="14.5" cy="12" r="0.9" fill="white"/>
                  </svg>
                  微信登录
                </button>
              </div>

              {/* WhatsApp — green pill, auto-width centered */}
              <div className="w-full text-center">
                <button
                  onClick={handleLoginClick}
                  className="inline-flex items-center gap-2 rounded-full text-white active:scale-[0.98] transition-transform"
                  style={{ fontSize: 13, fontWeight: 600, width: 192, height: 40, background: "#25D366", boxShadow: "0 4px 16px rgba(37,211,102,0.18)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2.5C5.86 2.5 2.5 5.86 2.5 10c0 1.32.35 2.56.96 3.64L2.5 17.5l3.86-.96A7.45 7.45 0 0010 17.5c4.14 0 7.5-3.36 7.5-7.5S14.14 2.5 10 2.5zm3.6 10.28c-.15.42-.88.81-1.21.86-.31.05-.69.07-1.12-.07-.26-.09-.59-.2-1.01-.38-1.77-.76-2.93-2.54-3.02-2.66-.09-.12-.73-.97-.73-1.85 0-.88.46-1.31.62-1.49.16-.18.35-.22.47-.22h.33c.11 0 .25-.04.39.3.15.35.5 1.22.55 1.31.05.09.08.2.01.32-.06.12-.1.19-.19.3-.09.1-.19.23-.27.31-.09.09-.19.19-.08.37.11.18.49.8 1.05 1.3.72.64 1.33.84 1.52.93.19.09.3.07.41-.04.12-.12.47-.54.6-.73.12-.18.24-.15.41-.09.17.06 1.1.52 1.28.62.18.09.3.13.35.2.04.08.04.46-.11.98z" fill="white"/>
                  </svg>
                  WhatsApp 登录
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 w-full mt-0.5">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", letterSpacing: "0.08em" }}>
                  其他方式登录
                </span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
              </div>

              {/* Other options — small text links */}
              <div className="flex items-center gap-5">
                {[
                  { icon: "smartphone", label: "手机号" },
                  { icon: "photo_camera", label: "Instagram" },
                  { icon: "mail", label: "邮箱" },
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={handleLoginClick}
                    className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17, color: "rgba(255,255,255,0.55)" }}>
                        {opt.icon}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="mt-8 text-center text-white/25"
              style={{ fontSize: 11, letterSpacing: "0.06em" }}
            >
              {t(
                "By continuing you agree to our Terms & Privacy Policy",
                "继续即同意服务条款与隐私政策"
              )}
            </motion.p>
          </motion.div>
        ) : (
          <motion.div
            key="preferences"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col px-6 pt-2 pb-12 overflow-y-auto no-scrollbar z-10 relative"
          >
            <div className="mb-8">
              <h2 className="text-[28px] font-serif font-black text-white leading-tight mb-3 tracking-wide">
                {t("Your Profile", "建立味觉档案")}
              </h2>
              <p className="text-[14px] text-white/50 font-light leading-relaxed" style={{ letterSpacing: "0.04em" }}>
                {t(
                  "Tell us your taste — we'll handle the rest.",
                  "告诉我们你的口味，其余的交给我们。"
                )}
              </p>
            </div>

            <div className="space-y-8 flex-1">
              {[
                {
                  icon: "restaurant",
                  q: { en: "Favorite Taste?", zh: "最喜欢的口味是？" },
                  opts: [
                    { id: "light", en: "Light & Fresh", zh: "清淡鲜香" },
                    { id: "spicy", en: "Spicy", zh: "无辣不欢" },
                    { id: "savory", en: "Rich & Savory", zh: "浓油赤酱" },
                    { id: "sweet", en: "Sweet", zh: "偏甜口" },
                  ],
                  value: taste,
                  toggle: (id: string) =>
                    setTaste((p) =>
                      p.includes(id) ? p.filter((i) => i !== id) : [...p, id]
                    ),
                },
                {
                  icon: "monitor_weight",
                  q: { en: "Dietary Goal?", zh: "目前的饮食目标？" },
                  opts: [
                    { id: "balanced", en: "Balanced", zh: "营养均衡" },
                    { id: "fatloss", en: "Fat-loss", zh: "减脂瘦身" },
                    { id: "muscle", en: "Build Muscle", zh: "增肌高蛋白" },
                    { id: "nourish", en: "Nourishing", zh: "养生滋补" },
                  ],
                  value: diet,
                  toggle: (id: string) =>
                    setDiet((p) =>
                      p.includes(id) ? p.filter((i) => i !== id) : [...p, id]
                    ),
                },
                {
                  icon: "block",
                  q: { en: "Ingredients to avoid?", zh: "有什么忌口吗？" },
                  opts: [
                    { id: "none", en: "None", zh: "无忌口" },
                    { id: "seafood", en: "No Seafood", zh: "忌海鲜" },
                    { id: "cilantro", en: "No Cilantro", zh: "不吃香菜" },
                    { id: "oniongarlic", en: "No Onion/Garlic", zh: "不吃葱蒜" },
                  ],
                  value: avoid,
                  toggle: (id: string) => {
                    if (id === "none") {
                      setAvoid(["none"]);
                      return;
                    }
                    setAvoid((p) =>
                      p.includes("none")
                        ? [id]
                        : p.includes(id)
                        ? p.filter((i) => i !== id)
                        : [...p, id]
                    );
                  },
                },
                {
                  icon: "cake",
                  q: { en: "Age Group?", zh: "您的年龄段？" },
                  opts: [
                    { id: "genz", en: "Gen Z", zh: "00后" },
                    { id: "millennial", en: "Millennial", zh: "90后" },
                    { id: "genx", en: "Gen X", zh: "80后" },
                    { id: "boomer", en: "Boomer+", zh: "70后及之前" },
                  ],
                  value: age ? [age] : [],
                  toggle: (id: string) => setAge(id),
                },
                {
                  icon: "location_on",
                  q: { en: "Hometown Cuisine?", zh: "偏好哪个家乡菜系？" },
                  opts: [
                    { id: "sichuan", en: "Sichuan / Hunan", zh: "川湘菜" },
                    { id: "cantonese", en: "Cantonese", zh: "粤菜" },
                    { id: "jiangnan", en: "Jiangnan", zh: "江浙沪" },
                    { id: "northern", en: "Northern", zh: "北方菜" },
                  ],
                  value: hometown,
                  toggle: (id: string) =>
                    setHometown((p) =>
                      p.includes(id) ? p.filter((i) => i !== id) : [...p, id]
                    ),
                },
              ].map((section) => (
                <div key={section.icon} className="space-y-4">
                  <h3 className="text-[14px] font-semibold flex items-center gap-2 text-white/80" style={{ letterSpacing: "0.04em" }}>
                    <span className="material-symbols-outlined text-[18px] text-[#FF5A1F]">
                      {section.icon}
                    </span>
                    {language === "en" ? section.q.en : section.q.zh}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {section.opts.map((opt) => {
                      const active = section.value.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => section.toggle(opt.id)}
                          className="px-4 py-2.5 rounded-xl text-[13px] transition-all active:scale-95"
                          style={
                            active
                              ? {
                                  background: "#FF5A1F",
                                  color: "white",
                                  fontWeight: 600,
                                  boxShadow: "0 0 16px rgba(255,90,31,0.30)",
                                }
                              : {
                                  background: "rgba(255,255,255,0.07)",
                                  border: "1px solid rgba(255,255,255,0.10)",
                                  color: "rgba(255,255,255,0.65)",
                                }
                          }
                        >
                          {language === "en" ? opt.en : opt.zh}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12">
              <button
                disabled={
                  taste.length === 0 &&
                  diet.length === 0 &&
                  avoid.length === 0 &&
                  !age &&
                  hometown.length === 0
                }
                onClick={handleFinishSetup}
                className="w-full h-[54px] rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-25"
                style={{
                  background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 100%)",
                  boxShadow: "0 8px 24px rgba(255,90,31,0.30)",
                  letterSpacing: "0.06em",
                }}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{t("Start Journey", "开启美食探索")}</span>
                    <span className="material-symbols-outlined text-[18px]">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
              <div className="text-center mt-5">
                <button
                  onClick={handleFinishSetup}
                  className="text-[13px] text-white/30 hover:text-white/60 transition-colors"
                  style={{ letterSpacing: "0.06em" }}
                >
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
