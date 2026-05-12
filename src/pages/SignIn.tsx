/**
 * SignIn — in-app login page (clean, minimal)
 * Used when user taps a locked feature inside the app.
 * /login is the marketing landing page; /signin is this focused form.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Step = "choose" | "phone";
type Role = "employer" | "helper";

const COUNTRY_CODES = [
  { code: "+852", label: "香港", flag: "🇭🇰" },
  { code: "+86",  label: "中国大陆", flag: "🇨🇳" },
  { code: "+63",  label: "菲律宾", flag: "🇵🇭" },
];

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Pre-select role from URL: /signin?role=helper&employer=HOUSEHOLD_ID
  const urlRole = searchParams.get("role") === "helper" ? "helper" : "employer";
  const inviteEmployerId = searchParams.get("employer") ?? null;

  const [role, setRole]           = useState<Role>(urlRole);
  const [step, setStep]           = useState<Step>("choose");
  const [countryCode, setCountryCode] = useState(role === "helper" ? "+63" : "+852");
  const [phone, setPhone]         = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  // Fixed password for all users during test phase
  const TEST_PASSWORD = "123456";

  const handleInstagram = async () => {
    localStorage.setItem("nutri_role", "helper");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: `${window.location.origin}/helper`, scopes: "instagram_basic,public_profile" },
    });
    if (error) setError(error.message);
  };

  const handleFacebook = async () => {
    localStorage.setItem("nutri_role", "helper");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: `${window.location.origin}/helper`, scopes: "public_profile" },
    });
    if (error) setError(error.message);
  };

  const handleApple = async () => {
    localStorage.setItem("nutri_role", role);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/${role === "helper" ? "helper" : ""}` },
    });
    if (error) setError(error.message);
  };

  /**
   * Phone login — uses email/password internally.
   * Email = <countryCode><digits>@nutri-pilot.app
   * Password = TEST_PASSWORD (123456) for all users during test phase.
   * Auto-creates account on first login.
   */
  const handleLogin = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) return;
    setLoading(true); setError("");

    const email = `${countryCode.replace("+", "")}${digits}@nutri-pilot.app`;

    try {
      // Try sign in first
      let { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: TEST_PASSWORD });

      // If user doesn't exist yet, sign up then sign in
      if (signInErr && signInErr.message.toLowerCase().includes("invalid")) {
        const { error: signUpErr } = await supabase.auth.signUp({ email, password: TEST_PASSWORD });
        if (signUpErr) throw signUpErr;
        const result = await supabase.auth.signInWithPassword({ email, password: TEST_PASSWORD });
        data = result.data;
        if (result.error) throw result.error;
      } else if (signInErr) {
        throw signInErr;
      }

      const userId = data?.user?.id;
      if (!userId) throw new Error("登录失败，请重试");

      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", userId);
      localStorage.setItem("nutri_user_id", userId);
      localStorage.setItem("nutri_role", role);

      if (role === "helper") {
        await supabase.from("user_profiles").upsert(
          { id: userId, role: "helper", ...(inviteEmployerId ? { employer_id: inviteEmployerId } : {}) },
          { onConflict: "id" }
        );
        navigate("/helper");
        return;
      }

      // Employer: go to setup if first time, else home
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      navigate(!profile && !localStorage.getItem("quickPrefs") ? "/setup" : "/");
    } catch (e: any) {
      setError(e.message ?? "登录失败，请重试");
    } finally {
      setLoading(false);
    }
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
            <div className="mb-8">
              <div className="flex items-baseline gap-2">
                <h1 className="font-serif font-black" style={{ fontSize: 36, color: "#FF5A1F" }}>爱吃</h1>
                <span className="font-sans font-bold" style={{ fontSize: 22, color: "rgba(255,255,255,0.88)" }}>
                  Aieats
                </span>
              </div>
              <div className="mt-2 rounded-full" style={{ width: 28, height: 2, background: "#FF5A1F" }} />
            </div>

            {/* Role toggle */}
            <div className="mb-8 p-1 rounded-2xl flex gap-1" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
              {([
                { key: "employer", zh: "我是雇主", en: "Employer", icon: "home" },
                { key: "helper",   zh: "我是工人", en: "Helper",   icon: "support_agent" },
              ] as { key: Role; zh: string; en: string; icon: string }[]).map(r => (
                <button
                  key={r.key}
                  onClick={() => {
                    setRole(r.key);
                    setCountryCode(r.key === "helper" ? "+63" : "+852");
                  }}
                  className="flex-1 py-3 rounded-xl flex flex-col items-center gap-0.5 transition-all"
                  style={role === r.key
                    ? { background: r.key === "helper" ? "#25D366" : "#FF5A1F", boxShadow: "0 4px 14px rgba(0,0,0,0.25)" }
                    : { background: "transparent" }
                  }
                >
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>{r.icon}</span>
                  <span className="font-bold text-white" style={{ fontSize: 13 }}>{r.zh}</span>
                  <span style={{ fontSize: 10, color: role === r.key ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)" }}>{r.en}</span>
                </button>
              ))}
            </div>

            {/* Invite hint for helpers */}
            {role === "helper" && inviteEmployerId && (
              <div className="mb-5 px-4 py-3 rounded-2xl flex items-center gap-3" style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)" }}>
                <span style={{ fontSize: 20 }}>🔗</span>
                <div>
                  <p className="font-semibold text-white" style={{ fontSize: 13 }}>You've been invited!</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>You'll be linked to your employer after login</p>
                </div>
              </div>
            )}

            {/* Dynamic subtitle */}
            <p className="mb-5 text-center" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
              {role === "helper"
                ? "Sign in to view today's shopping & cooking tasks"
                : "登录解锁完整菜单与智能采购"}
            </p>

            {/* Login options */}
            <div className="flex flex-col gap-3">
              {/* Apple — employer only (helpers unlikely to have Apple ID) */}
              {role === "employer" && <button
                onClick={handleApple}
                className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
                style={{ background: "rgba(255,255,255,0.95)", color: "#111", fontSize: 15 }}
              >
                <svg width="16" height="19" viewBox="0 0 14 17" fill="#111">
                  <path d="M13.1 12.6c-.3.7-.6 1.3-1 1.9-.5.8-1 1.2-1.4 1.2-.4 0-.9-.1-1.5-.4-.6-.3-1.1-.4-1.6-.4-.5 0-1 .1-1.6.4-.6.3-1 .4-1.4.4-.5 0-1-.4-1.5-1.3-.5-.8-.9-1.8-1.2-2.8C.6 10.5.4 9.3.4 8.2c0-1.2.3-2.3.8-3.1.4-.7 1-1.3 1.7-1.7.7-.4 1.5-.6 2.3-.6.5 0 1 .1 1.7.4.6.2 1 .4 1.2.4.1 0 .6-.2 1.3-.4.7-.3 1.3-.4 1.8-.3 1.4.1 2.4.7 3 1.8-1.2.7-1.8 1.8-1.8 3.1 0 1.1.4 2 1.2 2.7.3.4.7.6 1 .7l-.5.9zM9.8.5C9.8 1.3 9.5 2 9 2.6c-.6.7-1.3 1.1-2.1 1-.1-.8.2-1.6.7-2.2C8.1.8 8.8.4 9.7.3c.1.1.1.1.1.2z"/>
                </svg>
                使用 Apple 登录
              </button>

              }

              {/* Instagram — helper only (primary social login) */}
              {role === "helper" && (
                <button
                  onClick={handleInstagram}
                  className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #833AB4, #E1306C, #F77737)",
                    boxShadow: "0 8px 24px rgba(225,48,108,0.30)",
                    fontSize: 15, color: "white",
                  }}
                >
                  {/* Instagram icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  Continue with Instagram
                </button>
              )}

              {/* Facebook — helper only */}
              {role === "helper" && (
                <button
                  onClick={handleFacebook}
                  className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
                  style={{
                    background: "#1877F2",
                    boxShadow: "0 8px 24px rgba(24,119,242,0.28)",
                    fontSize: 15, color: "white",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Continue with Facebook
                </button>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)" }}>
                  {role === "helper" ? "or" : "或"}
                </span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
              </div>

              {/* Phone */}
              <button
                onClick={() => setStep("phone")}
                className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
                style={role === "helper"
                  ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", fontSize: 15, color: "rgba(255,255,255,0.7)" }
                  : { background: "linear-gradient(135deg, #FF5A1F, #FF8C54)", boxShadow: "0 8px 24px rgba(255,90,31,0.28)", fontSize: 15, color: "white" }
                }
              >
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>smartphone</span>
                {role === "helper" ? "Login with phone number" : "手机号登录"}
              </button>

              {/* WeChat — employer only */}
              {role === "employer" && (
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
              )}
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
            className="relative z-10 flex-1 flex flex-col px-6 pt-8 pb-12"
          >
            <h2 className="font-serif font-black text-white mb-1" style={{ fontSize: 28 }}>输入手机号</h2>
            <p className="text-white/40 mb-8" style={{ fontSize: 14 }}>输入手机号即可登录或注册</p>

            {/* Phone input row */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => {
                  const next = COUNTRY_CODES[(COUNTRY_CODES.findIndex(c => c.code === countryCode) + 1) % COUNTRY_CODES.length];
                  setCountryCode(next.code);
                }}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 h-[54px] rounded-2xl active:scale-95 transition-all"
                style={{ background: "rgba(255,255,255,0.10)", border: "1.5px solid rgba(255,255,255,0.18)", minWidth: 90 }}
              >
                <span style={{ fontSize: 20 }}>{COUNTRY_CODES.find(c => c.code === countryCode)?.flag}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "white", letterSpacing: "0.02em" }}>{countryCode}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.4, marginLeft: 1 }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <input
                type="tel"
                inputMode="numeric"
                placeholder={countryCode === "+852" ? "9XXX XXXX" : "138 0000 0000"}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                autoFocus
                className="flex-1 h-[54px] rounded-2xl px-4 text-white placeholder-white/25 outline-none"
                style={{ background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.14)", fontSize: 18, letterSpacing: "0.06em" }}
              />
            </div>

            <p className="mb-6 pl-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
              {COUNTRY_CODES.find(c => c.code === countryCode)?.label} · 点击区号可切换
            </p>

            {error && <p className="text-red-400 mb-3 text-[13px]">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading || phone.replace(/\D/g, "").length < 8}
              className="w-full h-[54px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
              style={{
                background: (loading || phone.replace(/\D/g, "").length < 8)
                  ? "rgba(255,90,31,0.30)"
                  : "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                boxShadow: (loading || phone.replace(/\D/g, "").length < 8) ? "none" : "0 8px 24px rgba(255,90,31,0.30)",
                fontSize: 15,
                color: (loading || phone.replace(/\D/g, "").length < 8) ? "rgba(255,255,255,0.40)" : "white",
                cursor: (loading || phone.replace(/\D/g, "").length < 8) ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                : "登录 / 注册"}
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
