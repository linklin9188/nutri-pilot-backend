import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";

type Step = "login" | "phone" | "otp" | "preferences";

const COUNTRY_CODES = [
  { code: "+852", label: "香港", flag: "🇭🇰" },
  { code: "+86",  label: "中国大陆", flag: "🇨🇳" },
];

export default function Login() {
  const navigate = useNavigate();
  const { t, toggleLanguage, isEnglishish } = useLanguage();
  const showEnglish = isEnglishish;

  // ── step flow ──────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("login");

  // ── phone OTP state ────────────────────────────────────────────────
  const [countryCode, setCountryCode] = useState("+852");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── preferences state ──────────────────────────────────────────────
  const [taste, setTaste] = useState<string[]>([]);
  const [diet, setDiet] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [hometown, setHometown] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ── countdown timer ────────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── send OTP ───────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (!digits || digits.length < 8) return;
    setSending(true);
    setOtpError("");
    try {
      const fullPhone = `${countryCode}${digits}`;
      const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
      if (error) throw error;
      setStep("otp");
      setCountdown(60);
    } catch (err: any) {
      setOtpError(err.message ?? "发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const handleAppleLogin = async () => {
    const hasPrefs = !!localStorage.getItem("quickPrefs");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        // New users → taste setup; existing users → home
        redirectTo: hasPrefs
          ? `${window.location.origin}/`
          : `${window.location.origin}/setup`,
      },
    });
    if (error) console.error(error);
  };

  // ── verify OTP ─────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const token = otp.join("");
    if (token.length < 6) return;
    setVerifying(true);
    setOtpError("");
    try {
      const fullPhone = `${countryCode}${phone.replace(/\D/g, "")}`;
      const { data, error } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token,
        type: "sms",
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("No user returned");

      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", userId);

      // Check if profile already exists
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (profile) {
        // Existing user with saved profile → go home
        navigate("/");
      } else {
        // New user → go to QuickSetup taste profile first
        navigate("/setup");
      }
    } catch (err: any) {
      setOtpError(err.message === "Token has expired or is invalid"
        ? "验证码错误或已过期，请重新获取"
        : (err.message ?? "验证失败，请重试"));
    } finally {
      setVerifying(false);
    }
  };

  // ── save preferences ───────────────────────────────────────────────
  const handleFinishSetup = async () => {
    setIsLoading(true);
    const userId = localStorage.getItem("userId") ?? "";
    try {
      await supabase.from("user_profiles").upsert({
        id: userId,
        display_name: "Aieats User",
        age_group: age,
        hometown,
        tastes: taste,
        diet_goals: diet,
        avoid_ingredients: avoid,
      });
      localStorage.setItem("userTaste", taste.join(","));
      localStorage.setItem("userDiet", diet.join(","));
      localStorage.setItem("userAvoid", avoid.join(","));
      localStorage.setItem("userAge", age);
      localStorage.setItem("userHometown", hometown.join(","));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      navigate("/");
    }
  };

  // ── OTP box helpers ────────────────────────────────────────────────
  const handleOtpChange = (idx: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = ch;
    setOtp(next);
    if (ch && idx < 5) otpRefs.current[idx + 1]?.focus();
  };
  const handleOtpKey = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  // ── time-based hero bg ─────────────────────────────────────────────
  // 7 days (Mon–Sun) × 3 meal slots (breakfast/lunch/dinner)
  // breakfast = bright sunny morning food
  // lunch     = warm coffee / café afternoon
  // dinner    = dark moody fine-dining
  const DAY_IMAGES = [
    { // Monday
      breakfast: "photo-1484723091739-30a097e8f929", // french toast warm sunlight
      lunch:     "photo-1495474472287-4d71bcdd2085", // coffee cup warm
      dinner:    "photo-1414235077428-338989a2e8c0", // fine dining dark
    },
    { // Tuesday
      breakfast: "photo-1567620905732-2d1ec7ab7445", // fluffy pancakes bright
      lunch:     "photo-1509042239860-f550ce710b93", // latte art warm
      dinner:    "photo-1559339352-11d035aa65de",    // steak moody
    },
    { // Wednesday
      breakfast: "photo-1533089860892-a7c6f0a88666", // avocado toast bright
      lunch:     "photo-1442512595331-e89e73853f31", // coffee cozy warm
      dinner:    "photo-1476224203421-9ac39bcb3327",  // plated dish dark
    },
    { // Thursday
      breakfast: "photo-1550547660-d9450f859349",    // eggs benedict sunny
      lunch:     "photo-1461023058943-07fcbe16d735", // coffee shop warm
      dinner:    "photo-1467003909585-2f8a72700288",  // dinner moody
    },
    { // Friday
      breakfast: "photo-1525351484163-7529414344d8", // oatmeal bright morning
      lunch:     "photo-1447933601403-0c6688de566e", // coffee beans warm
      dinner:    "photo-1432139509613-5c4255815697",  // grilled evening
    },
    { // Saturday
      breakfast: "photo-1490645935967-10de6ba17061", // granola bright
      lunch:     "photo-1541167760496-1628856ab772", // warm coffee mug
      dinner:    "photo-1565299624946-b28f40a0ae38",  // pizza evening
    },
    { // Sunday
      breakfast: "photo-1504674900247-0877df9cc836", // breakfast spread bright
      lunch:     "photo-1498804103079-a6351b050096", // café warm afternoon
      dinner:    "photo-1574484284002-952d92456975",  // chinese dish evening
    },
  ] as const;

  const getMealSlot = (h: number): "breakfast" | "lunch" | "dinner" =>
    h >= 5 && h < 11 ? "breakfast" : h >= 11 && h < 17 ? "lunch" : "dinner";

  // Always use Beijing time (UTC+8) regardless of user's device timezone
  const _now        = new Date();
  const _bjDate     = new Date(_now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const _dayIdx     = (_bjDate.getDay() + 6) % 7; // 0=Mon…6=Sun
  const _meal       = getMealSlot(_bjDate.getHours());
  // Morning: bright & airy; Afternoon: warm café; Evening: dark & moody
  const _brightness = _meal === "breakfast" ? 0.88 : _meal === "lunch" ? 0.78 : 0.62;
  const _photoId    = DAY_IMAGES[_dayIdx][_meal];
  const _heroSrc    = `https://images.unsplash.com/${_photoId}?w=1200&q=90`;

  const heroBg = (
    <div className="absolute inset-x-0 top-0 z-0" style={{ height: "62%" }}>
      <img
        src={_heroSrc}
        alt=""
        className="w-full h-full object-cover object-center"
        style={{ filter: `brightness(${_brightness})` }}
      />
      <div className="absolute inset-x-0 bottom-0" style={{
        height: "60%",
        background: "linear-gradient(to bottom, transparent 0%, #080808 100%)",
      }} />
      <div className="absolute inset-y-0 left-0 w-16" style={{ background: "linear-gradient(to right, rgba(8,8,8,0.5), transparent)" }} />
      <div className="absolute inset-y-0 right-0 w-16" style={{ background: "linear-gradient(to left, rgba(8,8,8,0.5), transparent)" }} />
    </div>
  );

  return (
    <div className="font-sans min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: "#080808" }}>
      {heroBg}

      {/* Language toggle */}
      <header className="relative z-10 flex justify-end p-6">
        <button onClick={toggleLanguage}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white/70 hover:text-white transition-colors"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {showEnglish ? "EN" : "中"}
        </button>
      </header>

      <AnimatePresence mode="wait">

        {/* ── STEP: landing ────────────────────────────────────────────── */}
        {step === "login" && (
          <motion.div key="login"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 flex flex-col justify-end px-7 pb-10 z-10 relative">

            {/* Brand block */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.7, ease: "easeOut" }} className="mb-8">

              <div className="flex items-center gap-3">
                <h1 className="font-serif font-black text-white leading-none whitespace-nowrap"
                  style={{ fontSize: 40, letterSpacing: "0.02em" }}>爱吃</h1>
                <span style={{ fontSize: 22, color: "#FF5A1F", fontWeight: 400, lineHeight: 1 }}>·</span>
                <span className="text-white/75 font-light uppercase"
                  style={{ fontSize: 20, letterSpacing: "0.20em" }}>Aieats</span>
              </div>

              <div className="mt-4 mb-5 rounded-full"
                style={{ width: 36, height: 2, background: "#FF5A1F", boxShadow: "0 0 12px rgba(255,90,31,0.6)" }} />

              <p className="text-white/65 font-light" style={{ fontSize: 15, letterSpacing: "0.08em" }}>
                {t("No more thinking about what to eat", "吃啥不用想，AI 替你想～")}
              </p>
            </motion.div>

            {/* ── Fun CTA button ─────────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
              className="flex flex-col items-center gap-3">

              {/* Floating food emojis */}
              <div className="relative w-full flex justify-center mb-1">
                {["🍜", "🥗", "🍱", "🍣", "🥘", "🍲"].map((em, i) => (
                  <motion.span
                    key={i}
                    style={{
                      position: "absolute",
                      fontSize: 20,
                      top: -28 + (i % 2 === 0 ? -8 : 6),
                      left: `${12 + i * 14}%`,
                    }}
                    animate={{
                      y: [0, -8, 0],
                      rotate: [-5, 5, -5],
                      opacity: [0.6, 1, 0.6],
                    }}
                    transition={{
                      duration: 2.4 + i * 0.3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.25,
                    }}
                  >
                    {em}
                  </motion.span>
                ))}
              </div>

              {/* Primary CTA — starts onboarding (no account needed) */}
              <motion.button
                onClick={() => navigate("/setup")}
                className="w-full h-[58px] rounded-[20px] font-black flex items-center justify-center gap-2.5 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 50%, #FFB347 100%)",
                  boxShadow: "0 10px 30px rgba(255,90,31,0.40), 0 0 0 1px rgba(255,150,80,0.3)",
                  fontSize: 17, color: "white", letterSpacing: "0.02em",
                }}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.01 }}
              >
                {/* Shimmer sweep */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)",
                    backgroundSize: "200% 100%",
                  }}
                  animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 0.8 }}
                />
                <span style={{ fontSize: 22 }}>✨</span>
                {t("Build my menu →", "生成我的专属菜单 →")}
              </motion.button>

              <p className="text-white/35" style={{ fontSize: 11, letterSpacing: "0.04em" }}>
                {t("No account needed · 30 seconds", "无需注册 · 30秒完成口味设置")}
              </p>

              {/* Divider */}
              <div className="flex items-center gap-3 w-full mt-1">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.09)" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em" }}>
                  {t("Already have an account?", "已有账号")}
                </span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.09)" }} />
              </div>

              {/* Secondary login row: WeChat + Instagram + Facebook
                  All three lead into /signin where the actual OAuth runs. */}
              <div className="flex items-center gap-3 w-full justify-center">
                {/* WeChat */}
                <button onClick={() => navigate("/signin")}
                  className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: "rgba(7,193,96,0.18)", border: "1px solid rgba(7,193,96,0.35)", fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#07C160">
                    <path d="M8.69 4C4.55 4 1.2 6.75 1.2 10.14c0 1.96 1.13 3.7 2.88 4.83l-.72 2.16 2.52-1.26c.9.18 1.8.36 2.74.36.27 0 .54 0 .81-.04A6.13 6.13 0 0 1 9 14.91c0-3.13 2.98-5.68 6.66-5.68.18 0 .36 0 .54.04C15.61 5.85 12.46 4 8.69 4z"/>
                  </svg>
                  微信
                </button>

                {/* Instagram */}
                <button onClick={() => navigate("/signin")}
                  className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, rgba(131,58,180,0.25), rgba(225,48,108,0.25))",
                    border: "1px solid rgba(225,48,108,0.40)",
                    fontSize: 13, color: "rgba(255,255,255,0.85)",
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{ opacity: 0.9 }}>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4z"/>
                  </svg>
                  IG
                </button>

                {/* Facebook */}
                <button onClick={() => navigate("/signin")}
                  className="flex-1 h-11 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: "rgba(24,119,242,0.18)", border: "1px solid rgba(24,119,242,0.40)", fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#4A8DF1">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  FB
                </button>
              </div>
            </motion.div>

            <p className="mt-5 text-center text-white/20" style={{ fontSize: 11, letterSpacing: "0.06em" }}>
              {t("By continuing you agree to our Terms & Privacy Policy", "继续即同意服务条款与隐私政策")}
            </p>
          </motion.div>
        )}

        {/* ── STEP: phone input ────────────────────────────────────────── */}
        {step === "phone" && (
          <motion.div key="phone"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col justify-end px-7 pb-12 z-10 relative">

            <button onClick={() => setStep("login")}
              className="absolute top-0 left-7 flex items-center gap-1 text-white/50 hover:text-white transition-colors"
              style={{ fontSize: 13 }}>
              <span className="material-symbols-outlined text-[18px]">arrow_back_ios</span>
              返回
            </button>

            <div className="mb-8">
              <h2 className="font-serif font-black text-white mb-2" style={{ fontSize: 32 }}>
                手机号登录
              </h2>
              <p className="text-white/40" style={{ fontSize: 14, letterSpacing: "0.04em" }}>
                我们将发送 6 位验证码到您的手机
              </p>
            </div>

            {/* Country code pill + phone input — always visible on mobile */}
            <div className="flex gap-2 mb-3">
              {/* Tappable country code pill — tap to toggle HK ↔ CN */}
              <button
                onClick={() => {
                  const codes = COUNTRY_CODES.map(c => c.code);
                  const next = codes[(codes.indexOf(countryCode) + 1) % codes.length];
                  setCountryCode(next);
                }}
                className="flex-shrink-0 flex items-center gap-1.5 h-[54px] px-4 rounded-2xl active:scale-95 transition-all"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1.5px solid rgba(255,255,255,0.20)",
                  minWidth: 90,
                }}
              >
                <span style={{ fontSize: 20 }}>
                  {COUNTRY_CODES.find(c => c.code === countryCode)?.flag}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "white", letterSpacing: "0.02em" }}>
                  {countryCode}
                </span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.45 }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <input
                type="tel"
                inputMode="numeric"
                placeholder={countryCode === "+852" ? "9XXX XXXX" : "138 0000 0000"}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                className="flex-1 h-[54px] rounded-2xl px-4 text-white placeholder-white/25 outline-none"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                  fontSize: 17,
                  letterSpacing: "0.06em",
                }}
              />
            </div>
            <p className="mb-4 pl-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
              {COUNTRY_CODES.find(c => c.code === countryCode)?.label} · 点击区号可切换
            </p>

            {otpError && (
              <p className="text-red-400 mb-3" style={{ fontSize: 13 }}>{otpError}</p>
            )}

            <button onClick={handleSendOtp}
              disabled={sending || phone.replace(/\D/g, "").length < 8}
              className="w-full h-[50px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30"
              style={{
                fontSize: 15, letterSpacing: "0.04em",
                background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
                color: "white",
              }}>
              {sending
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : "发送验证码"
              }
            </button>
          </motion.div>
        )}

        {/* ── STEP: OTP verification ───────────────────────────────────── */}
        {step === "otp" && (
          <motion.div key="otp"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col justify-end px-7 pb-12 z-10 relative">

            <button onClick={() => { setStep("phone"); setOtp(["","","","","",""]); setOtpError(""); }}
              className="absolute top-0 left-7 flex items-center gap-1 text-white/50 hover:text-white transition-colors"
              style={{ fontSize: 13 }}>
              <span className="material-symbols-outlined text-[18px]">arrow_back_ios</span>
              返回
            </button>

            <div className="mb-8">
              <h2 className="font-serif font-black text-white mb-2" style={{ fontSize: 32 }}>
                输入验证码
              </h2>
              <p className="text-white/40" style={{ fontSize: 14 }}>
                已发送至 {countryCode} {phone}
              </p>
            </div>

            {/* 6-digit OTP boxes */}
            <div className="flex gap-3 mb-4 justify-center">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={el => { otpRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(idx, e.target.value)}
                  onKeyDown={e => handleOtpKey(idx, e)}
                  className="w-12 h-14 rounded-2xl text-center text-white text-[22px] font-bold outline-none transition-all"
                  style={{
                    background: digit ? "rgba(255,90,31,0.2)" : "rgba(255,255,255,0.08)",
                    border: digit ? "1.5px solid #FF5A1F" : "1.5px solid rgba(255,255,255,0.12)",
                    caretColor: "#FF5A1F",
                  }}
                  autoFocus={idx === 0}
                />
              ))}
            </div>

            {otpError && (
              <p className="text-red-400 mb-3 text-center" style={{ fontSize: 13 }}>{otpError}</p>
            )}

            <button onClick={handleVerifyOtp}
              disabled={verifying || otp.join("").length < 6}
              className="w-full h-[50px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30 mb-4"
              style={{
                fontSize: 15, letterSpacing: "0.04em",
                background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
                color: "white",
              }}>
              {verifying
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : "验证并登录"
              }
            </button>

            {/* Resend */}
            <div className="text-center">
              {countdown > 0
                ? <p className="text-white/30" style={{ fontSize: 13 }}>
                    {countdown}s 后可重新发送
                  </p>
                : <button onClick={handleSendOtp} disabled={sending}
                    className="text-[#FF8C54] hover:text-[#FF5A1F] transition-colors" style={{ fontSize: 13 }}>
                    重新发送验证码
                  </button>
              }
            </div>
          </motion.div>
        )}

        {/* ── STEP: preferences ───────────────────────────────────────── */}
        {step === "preferences" && (
          <motion.div key="preferences"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col px-6 pt-4 pb-12 overflow-y-auto no-scrollbar z-10 relative">

            {/* Nutrition-themed background — fixed behind content */}
            <div className="fixed inset-0 z-0 pointer-events-none">
              <img
                src="https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=1200&q=85"
                alt=""
                className="w-full h-full object-cover object-center"
                style={{ filter: "brightness(0.28) saturate(1.2)" }}
              />
              {/* top fade: bridge from previous dark step */}
              <div className="absolute inset-x-0 top-0" style={{
                height: "35%",
                background: "linear-gradient(to bottom, #080808 0%, transparent 100%)",
              }} />
              {/* bottom fade: ensure readability near CTA */}
              <div className="absolute inset-x-0 bottom-0" style={{
                height: "30%",
                background: "linear-gradient(to top, #080808 0%, transparent 100%)",
              }} />
            </div>

            <div className="mb-8 relative z-10">
              {/* Nutrition pill badge */}
              <div className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full"
                style={{ background: "rgba(255,90,31,0.15)", border: "1px solid rgba(255,90,31,0.25)" }}>
                <span className="material-symbols-outlined text-[13px] text-[#FF8C54]">nutrition</span>
                <span style={{ fontSize: 11, color: "#FF8C54", letterSpacing: "0.10em", fontWeight: 600 }}>
                  AI 营养档案
                </span>
              </div>
              <h2 className="text-[28px] font-serif font-black text-white leading-tight mb-3 tracking-wide">
                {t("Your Profile", "建立味觉档案")}
              </h2>
              <p className="text-white/45 font-light leading-relaxed" style={{ fontSize: 14, letterSpacing: "0.04em" }}>
                {t("We tailor every meal to your nutrition needs.", "每一份菜单，都按你的营养需求精准定制。")}
              </p>
            </div>

            <div className="space-y-8 flex-1 relative z-10">
              {[
                {
                  icon: "restaurant", q: { en: "Favorite Taste?", zh: "最喜欢的口味是？" },
                  opts: [{ id: "light", en: "Light & Fresh", zh: "清淡鲜香" }, { id: "spicy", en: "Spicy", zh: "无辣不欢" }, { id: "savory", en: "Rich & Savory", zh: "浓油赤酱" }, { id: "sweet", en: "Sweet", zh: "偏甜口" }],
                  value: taste, toggle: (id: string) => setTaste(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id]),
                },
                {
                  icon: "monitor_weight", q: { en: "Dietary Goal?", zh: "目前的饮食目标？" },
                  opts: [{ id: "balanced", en: "Balanced", zh: "营养均衡" }, { id: "fatloss", en: "Fat-loss", zh: "减脂瘦身" }, { id: "muscle", en: "Build Muscle", zh: "增肌高蛋白" }, { id: "nourish", en: "Nourishing", zh: "养生滋补" }],
                  value: diet, toggle: (id: string) => setDiet(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id]),
                },
                {
                  icon: "block", q: { en: "Ingredients to avoid?", zh: "有什么忌口吗？" },
                  opts: [{ id: "none", en: "None", zh: "无忌口" }, { id: "seafood", en: "No Seafood", zh: "忌海鲜" }, { id: "cilantro", en: "No Cilantro", zh: "不吃香菜" }, { id: "oniongarlic", en: "No Onion/Garlic", zh: "不吃葱蒜" }],
                  value: avoid, toggle: (id: string) => {
                    if (id === "none") { setAvoid(["none"]); return; }
                    setAvoid(p => p.includes("none") ? [id] : p.includes(id) ? p.filter(i => i !== id) : [...p, id]);
                  },
                },
                {
                  icon: "cake", q: { en: "Age Group?", zh: "您的年龄段？" },
                  opts: [{ id: "genz", en: "Gen Z", zh: "00后" }, { id: "millennial", en: "Millennial", zh: "90后" }, { id: "genx", en: "Gen X", zh: "80后" }, { id: "boomer", en: "Boomer+", zh: "70后及之前" }],
                  value: age ? [age] : [], toggle: (id: string) => setAge(id),
                },
                {
                  icon: "location_on", q: { en: "Hometown Cuisine?", zh: "偏好哪个家乡菜系？" },
                  opts: [{ id: "sichuan", en: "Sichuan / Hunan", zh: "川湘菜" }, { id: "cantonese", en: "Cantonese", zh: "粤菜" }, { id: "jiangnan", en: "Jiangnan", zh: "江浙沪" }, { id: "northern", en: "Northern", zh: "北方菜" }],
                  value: hometown, toggle: (id: string) => setHometown(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id]),
                },
              ].map(section => (
                <div key={section.icon} className="space-y-4">
                  <h3 className="text-[14px] font-semibold flex items-center gap-2 text-white/80" style={{ letterSpacing: "0.04em" }}>
                    <span className="material-symbols-outlined text-[18px] text-[#FF5A1F]">{section.icon}</span>
                    {showEnglish ? section.q.en : section.q.zh}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {section.opts.map(opt => {
                      const active = section.value.includes(opt.id);
                      return (
                        <button key={opt.id} onClick={() => section.toggle(opt.id)}
                          className="px-4 py-2.5 rounded-xl text-[13px] transition-all active:scale-95"
                          style={active
                            ? { background: "#FF5A1F", color: "white", fontWeight: 600, boxShadow: "0 0 16px rgba(255,90,31,0.35)", border: "1px solid transparent" }
                            : { background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", color: "rgba(255,255,255,0.70)", backdropFilter: "blur(8px)" }
                          }>
                          {showEnglish ? opt.en : opt.zh}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 relative z-10">
              <button disabled={isLoading} onClick={handleFinishSetup}
                className="w-full h-[54px] rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 100%)",
                  boxShadow: "0 8px 24px rgba(255,90,31,0.30)",
                  letterSpacing: "0.06em", color: "white",
                }}>
                {isLoading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><span>{t("Start Journey", "开启美食探索")}</span><span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
                }
              </button>
              <div className="text-center mt-5">
                <button onClick={handleFinishSetup} className="text-white/30 hover:text-white/60 transition-colors" style={{ fontSize: 13, letterSpacing: "0.06em" }}>
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
