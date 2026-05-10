/**
 * SignIn — in-app login page (clean, minimal)
 * Used when user taps a locked feature inside the app.
 * /login is the marketing landing page; /signin is this focused form.
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Step = "choose" | "phone" | "otp";

const COUNTRY_CODES = [
  { code: "+852", label: "香港", flag: "🇭🇰" },
  { code: "+86",  label: "中国大陆", flag: "🇨🇳" },
];

export default function SignIn() {
  const navigate = useNavigate();
  const [step, setStep]           = useState<Step>("choose");
  const [countryCode, setCountryCode] = useState("+852");
  const [phone, setPhone]         = useState("");
  const [otp, setOtp]             = useState(["", "", "", "", "", ""]);
  const [error, setError]         = useState("");
  const [sending, setSending]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) setError(error.message);
  };

  const handleSend = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) return;
    setSending(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: `${countryCode}${digits}`,
      });
      if (error) throw error;
      setStep("otp");
      setCountdown(60);
    } catch (e: any) {
      setError(e.message ?? "发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    const token = otp.join("");
    if (token.length < 6) return;
    setVerifying(true); setError("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: `${countryCode}${phone.replace(/\D/g, "")}`,
        token,
        type: "sms",
      });
      if (error) throw error;
      const userId = data.user?.id;
      if (!userId) throw new Error("No user");
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", userId);

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      // New user → quick setup; existing → back
      if (!profile && !localStorage.getItem("quickPrefs")) {
        navigate("/setup");
      } else {
        navigate(-1); // go back to where they came from
      }
    } catch (e: any) {
      setError(
        e.message === "Token has expired or is invalid"
          ? "验证码错误或已过期，请重新获取"
          : (e.message ?? "验证失败，请重试"),
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpChange = (idx: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...otp]; next[idx] = ch; setOtp(next);
    if (ch && idx < 5) otpRefs.current[idx + 1]?.focus();
  };
  const handleOtpKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0)
      otpRefs.current[idx - 1]?.focus();
  };

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: "#0a0a0a" }}
    >
      {/* Subtle glow */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.14) 0%, transparent 60%)" }} />

      {/* Back button */}
      <button
        onClick={() => step === "choose" ? navigate(-1) : setStep(step === "otp" ? "phone" : "choose")}
        className="relative z-10 mt-14 ml-5 w-9 h-9 flex items-center justify-center rounded-2xl transition-all active:scale-90"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
      </button>

      <AnimatePresence mode="wait">

        {/* ── STEP: choose method ───────────────────────────────────── */}
        {step === "choose" && (
          <motion.div key="choose"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 flex-1 flex flex-col px-6 pt-10 pb-12"
          >
            {/* Logo */}
            <div className="mb-10">
              <div className="flex items-baseline gap-3">
                <h1 className="font-serif font-black text-white" style={{ fontSize: 36 }}>爱吃</h1>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", letterSpacing: "0.20em", fontWeight: 400 }}>
                  AI EATS
                </span>
              </div>
              <div className="mt-2 rounded-full" style={{ width: 28, height: 2, background: "#FF5A1F" }} />
              <p className="mt-4 font-light" style={{ fontSize: 14, color: "rgba(255,255,255,0.40)" }}>
                登录解锁专属菜单 · Unlock your personal menu
              </p>
            </div>

            {/* Login options */}
            <div className="flex flex-col gap-3">
              {/* Apple */}
              <button
                onClick={handleApple}
                className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
                style={{ background: "rgba(255,255,255,0.95)", color: "#111", fontSize: 15 }}
              >
                <svg width="16" height="19" viewBox="0 0 14 17" fill="#111">
                  <path d="M13.1 12.6c-.3.7-.6 1.3-1 1.9-.5.8-1 1.2-1.4 1.2-.4 0-.9-.1-1.5-.4-.6-.3-1.1-.4-1.6-.4-.5 0-1 .1-1.6.4-.6.3-1 .4-1.4.4-.5 0-1-.4-1.5-1.3-.5-.8-.9-1.8-1.2-2.8C.6 10.5.4 9.3.4 8.2c0-1.2.3-2.3.8-3.1.4-.7 1-1.3 1.7-1.7.7-.4 1.5-.6 2.3-.6.5 0 1 .1 1.7.4.6.2 1 .4 1.2.4.1 0 .6-.2 1.3-.4.7-.3 1.3-.4 1.8-.3 1.4.1 2.4.7 3 1.8-1.2.7-1.8 1.8-1.8 3.1 0 1.1.4 2 1.2 2.7.3.4.7.6 1 .7l-.5.9zM9.8.5C9.8 1.3 9.5 2 9 2.6c-.6.7-1.3 1.1-2.1 1-.1-.8.2-1.6.7-2.2C8.1.8 8.8.4 9.7.3c.1.1.1.1.1.2z"/>
                </svg>
                使用 Apple 登录
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>或</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
              </div>

              {/* Phone */}
              <button
                onClick={() => setStep("phone")}
                className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                  boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
                  fontSize: 15, color: "white",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>smartphone</span>
                手机号登录
              </button>

              {/* WeChat (disabled) */}
              <button disabled
                className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 15, color: "rgba(255,255,255,0.25)" }}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <ellipse cx="7.5" cy="8.5" rx="6" ry="4.5" fill="#07C160" opacity="0.5"/>
                  <circle cx="5.5" cy="8.5" r="1" fill="white" opacity="0.7"/>
                  <circle cx="7.5" cy="8.5" r="1" fill="white" opacity="0.7"/>
                  <circle cx="9.5" cy="8.5" r="1" fill="white" opacity="0.7"/>
                  <ellipse cx="13" cy="12" rx="5.5" ry="4" fill="#07C160" opacity="0.5"/>
                  <circle cx="11.5" cy="12" r="0.9" fill="white" opacity="0.7"/>
                  <circle cx="13" cy="12" r="0.9" fill="white" opacity="0.7"/>
                  <circle cx="14.5" cy="12" r="0.9" fill="white" opacity="0.7"/>
                </svg>
                微信登录（即将上线）
              </button>
            </div>

            <p className="mt-auto pt-8 text-center text-white/20" style={{ fontSize: 11 }}>
              继续即同意服务条款与隐私政策
            </p>
          </motion.div>
        )}

        {/* ── STEP: phone input ─────────────────────────────────────── */}
        {step === "phone" && (
          <motion.div key="phone"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="relative z-10 flex-1 flex flex-col px-6 pt-8 pb-12 overflow-y-auto"
          >
            <h2 className="font-serif font-black text-white mb-2" style={{ fontSize: 28 }}>输入手机号</h2>
            <p className="text-white/40 mb-8" style={{ fontSize: 14 }}>我们将发送 6 位验证码</p>

            {/* Country selector */}
            <div className="flex rounded-2xl mb-3 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {COUNTRY_CODES.map(c => (
                <button key={c.code} onClick={() => setCountryCode(c.code)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 transition-all"
                  style={{
                    background: countryCode === c.code ? "rgba(255,90,31,0.22)" : "transparent",
                    color: countryCode === c.code ? "#FF8C54" : "rgba(255,255,255,0.45)",
                    fontSize: 13, fontWeight: 500,
                  }}>
                  <span>{c.flag}</span><span>{c.code}</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{c.label}</span>
                </button>
              ))}
            </div>

            <input
              type="tel"
              inputMode="numeric"
              placeholder={countryCode === "+852" ? "9XXX XXXX" : "138 0000 0000"}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              className="w-full h-[54px] rounded-2xl px-4 text-white placeholder-white/25 outline-none mb-3"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 18, letterSpacing: "0.08em",
              }}
            />

            {error && <p className="text-red-400 mb-3 text-[13px]">{error}</p>}

            <button
              onClick={handleSend}
              disabled={sending || phone.replace(/\D/g, "").length < 8}
              className="w-full h-[54px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{
                background: sending || phone.replace(/\D/g, "").length < 8
                  ? "rgba(255,90,31,0.35)"
                  : "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                boxShadow: sending || phone.replace(/\D/g, "").length < 8
                  ? "none"
                  : "0 8px 24px rgba(255,90,31,0.28)",
                fontSize: 15,
                color: sending || phone.replace(/\D/g, "").length < 8
                  ? "rgba(255,255,255,0.45)"
                  : "white",
                cursor: sending || phone.replace(/\D/g, "").length < 8 ? "not-allowed" : "pointer",
              }}
            >
              {sending
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <span>发送验证码</span>}
            </button>
          </motion.div>
        )}

        {/* ── STEP: OTP ────────────────────────────────────────────── */}
        {step === "otp" && (
          <motion.div key="otp"
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="relative z-10 flex-1 flex flex-col px-6 pt-8 pb-12"
          >
            <h2 className="font-serif font-black text-white mb-2" style={{ fontSize: 28 }}>输入验证码</h2>
            <p className="text-white/40 mb-8" style={{ fontSize: 14 }}>
              已发送至 {countryCode} {phone}
            </p>

            {/* 6-digit boxes */}
            <div className="flex gap-3 justify-between mb-4">
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
                  autoFocus={idx === 0}
                  className="flex-1 h-14 rounded-2xl text-center text-white text-[22px] font-bold outline-none transition-all"
                  style={{
                    background: digit ? "rgba(255,90,31,0.18)" : "rgba(255,255,255,0.08)",
                    border: digit ? "1.5px solid #FF5A1F" : "1.5px solid rgba(255,255,255,0.12)",
                    caretColor: "#FF5A1F",
                  }}
                />
              ))}
            </div>

            {error && <p className="text-red-400 mb-3 text-center text-[13px]">{error}</p>}

            <button onClick={handleVerify}
              disabled={verifying || otp.join("").length < 6}
              className="w-full h-[54px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-30 mb-4"
              style={{
                background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
                fontSize: 15, color: "white",
              }}>
              {verifying
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : "验证并登录"}
            </button>

            <div className="text-center">
              {countdown > 0
                ? <p className="text-white/30" style={{ fontSize: 13 }}>{countdown}s 后可重新发送</p>
                : <button onClick={handleSend} disabled={sending}
                    className="text-[#FF8C54] transition-colors" style={{ fontSize: 13 }}>
                    重新发送验证码
                  </button>}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
