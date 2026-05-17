/**
 * SignIn — in-app login page
 * Single-step social login: WeChat (employer only) + Instagram + Facebook.
 * Phone/Apple flows were removed at the user's request.
 */

import { useState } from "react";
import { motion } from "motion/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useLanguage, type Language } from "../contexts/LanguageContext";

type Role = "employer" | "helper";

// Real Supabase OAuth call. Falls back to a local test login if the provider
// hasn't been wired up yet, so the rest of the app stays usable while we
// finish OAuth setup.
async function tryOAuth(
  provider: "facebook" | "wechat",
  redirectPath: string,
  scopes?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as any,
      options: {
        redirectTo: `${window.location.origin}${redirectPath}`,
        ...(scopes ? { scopes } : {}),
      },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "OAuth failed" };
  }
}

function devTestLogin(role: Role, providerLabel: string) {
  const key = `nutri_uid_${role}_${providerLabel}`;
  let userId = localStorage.getItem(key);
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(key, userId);
  }
  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("userId", userId);
  localStorage.setItem("nutri_user_id", userId);
  localStorage.setItem("nutri_role", role);
  // Let LanguageProvider re-derive the default language (helper → en, employer → zh).
  window.dispatchEvent(new Event("nutri-prefs-changed"));
}

export default function SignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlRole = searchParams.get("role") === "helper" ? "helper" : "employer";
  const inviteEmployerId = searchParams.get("employer") ?? null;
  const { language, setLanguage } = useLanguage();

  const [role, setRole] = useState<Role>(urlRole);
  const [error, setError] = useState("");

  const goAfterLogin = (r: Role) => {
    if (r === "helper") { navigate("/helper"); return; }
    navigate(!localStorage.getItem("quickPrefs") ? "/setup" : "/");
  };

  // Calls Supabase OAuth and, if the browser hasn't redirected within ~1.5s,
  // falls back to the dev test login so the rest of the flow remains usable
  // before real provider config is in place. Once OAuth is fully wired, the
  // redirect will fire well within the timeout and the fallback never runs.
  const startSocialLogin = async (provider: "instagram" | "facebook") => {
    setError("");
    const redirectPath = role === "helper" ? "/helper" : "/";
    const scopes = provider === "instagram"
      ? "instagram_basic,public_profile"
      : "public_profile";
    const res = await tryOAuth("facebook", redirectPath, scopes);
    if (!res.ok) {
      devTestLogin(role, provider);
      goAfterLogin(role);
      return;
    }
    // OAuth call accepted but no redirect happened — provider likely unconfigured.
    setTimeout(() => {
      if (window.location.pathname === "/signin") {
        devTestLogin(role, provider);
        goAfterLogin(role);
      }
    }, 1500);
  };

  const handleInstagram = () => startSocialLogin("instagram");
  const handleFacebook  = () => startSocialLogin("facebook");

  const handleWeChat = async () => {
    setError("");
    // 微信网页授权 (snsapi_userinfo). Only works inside the WeChat in-app
    // browser. supabase/functions/wechat-mp-callback exchanges the code
    // for openid, upserts user_profiles, and 302s back to
    // /auth/wechat/done with the userId in the URL hash.
    const appid = import.meta.env.VITE_WECHAT_APPID;
    if (!appid) {
      setError("微信登录尚未配置");
      return;
    }
    const isWeChatBrowser = /MicroMessenger/i.test(navigator.userAgent);
    if (!isWeChatBrowser) {
      // Outside WeChat browser, fall back to dev test login so the rest of
      // the flow stays usable (we can't trigger 网页授权 without the WeChat
      // shell). Once 网站应用 (open.weixin.qq.com qrconnect) is wired up
      // we can add a QR fallback here.
      devTestLogin("employer", "wechat");
      goAfterLogin("employer");
      return;
    }
    // redirect_uri MUST be on a whitelisted domain (网页授权域名).
    // *.supabase.co isn't ours and can't host MP_verify, so we use
    // nothinkeats.com/auth/wechat/in as a thin bouncer that immediately
    // forwards to the Supabase edge function with the same query params.
    // See src/pages/WeChatIn.tsx + OAUTH_SETUP.md for the full chain.
    const redirect = encodeURIComponent(`${window.location.origin}/auth/wechat/in`);
    const state    = crypto.randomUUID();
    sessionStorage.setItem("wechat_oauth_state", state);
    const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${redirect}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
    window.location.href = url;
  };

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: "#0a0a0a" }}
    >
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,90,31,0.14) 0%, transparent 60%)" }} />

      {/* Top bar: back button + 4-language switcher. The helper sign-in flow
          relies on this — Filipino / Indonesian helpers pick their language
          before tapping any button. */}
      <div className="relative z-10 mt-14 mx-5 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-2xl transition-all active:scale-90"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <div className="inline-flex p-1 rounded-2xl gap-0.5"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {([
            { key: 'zh' as Language, label: '中文' },
            { key: 'en' as Language, label: 'EN' },
            { key: 'tl' as Language, label: 'Tagalog' },
            { key: 'id' as Language, label: 'Bahasa' },
          ]).map(({ key, label }) => (
            <button key={key}
              onClick={() => setLanguage(key)}
              className="px-2.5 py-1 rounded-xl font-bold transition-all active:scale-95"
              style={{
                fontSize: 11,
                background: language === key ? '#FF5A1F' : 'transparent',
                color:      language === key ? 'white'   : 'rgba(255,255,255,0.55)',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
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

        {/* Role toggle — single language per active locale */}
        <div className="mb-8 p-1 rounded-2xl flex gap-1" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }}>
          {([
            { key: "employer", labels: { zh: '我是雇主', en: 'Employer', tl: 'Ako ay employer',  id: 'Saya majikan' }, icon: "home" },
            { key: "helper",   labels: { zh: '我是工人', en: 'Helper',   tl: 'Ako ay katulong',   id: 'Saya pekerja' }, icon: "support_agent" },
          ] as { key: Role; labels: Record<string, string>; icon: string }[]).map(r => {
            const label = r.labels[language] ?? r.labels.en;
            return (
              <button
                key={r.key}
                onClick={() => setRole(r.key)}
                className="flex-1 py-3 rounded-xl flex flex-col items-center gap-1 transition-all"
                style={role === r.key
                  ? { background: r.key === "helper" ? "#25D366" : "#FF5A1F", boxShadow: "0 4px 14px rgba(0,0,0,0.25)" }
                  : { background: "transparent" }
                }
              >
                <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>{r.icon}</span>
                <span className="font-bold text-white" style={{ fontSize: 14 }}>{label}</span>
              </button>
            );
          })}
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

        <p className="mb-5 text-center" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          {role === "helper"
            ? "Sign in to view today's shopping & cooking tasks"
            : "登录解锁完整菜单与智能采购"}
        </p>

        <div className="flex flex-col gap-3">
          {/* WeChat — employer only */}
          {role === "employer" && (
            <button
              onClick={handleWeChat}
              className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
              style={{
                background: "#07C160",
                boxShadow: "0 8px 24px rgba(7,193,96,0.28)",
                fontSize: 15, color: "white",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M8.69 4C4.55 4 1.2 6.75 1.2 10.14c0 1.96 1.13 3.7 2.88 4.83l-.72 2.16 2.52-1.26c.9.18 1.8.36 2.74.36.27 0 .54 0 .81-.04A6.13 6.13 0 0 1 9 14.91c0-3.13 2.98-5.68 6.66-5.68.18 0 .36 0 .54.04C15.61 5.85 12.46 4 8.69 4zm-2.7 3.06a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm5.4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.39 3.06c-3.51 0-6.3 2.43-6.3 5.4 0 2.97 2.79 5.4 6.3 5.4.72 0 1.44-.12 2.16-.3l1.98.99-.54-1.66c1.57-.96 2.7-2.43 2.7-4.43 0-2.97-2.79-5.4-6.3-5.4zm-2.16 2.43a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44zm4.5 0a.72.72 0 1 1 0 1.44.72.72 0 0 1 0-1.44z"/>
              </svg>
              微信登录
            </button>
          )}

          {/* Instagram */}
          <button
            onClick={handleInstagram}
            className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #833AB4, #E1306C, #F77737)",
              boxShadow: "0 8px 24px rgba(225,48,108,0.30)",
              fontSize: 15, color: "white",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            {role === "helper" ? "Continue with Instagram" : "使用 Instagram 登录"}
          </button>

          {/* Facebook */}
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
            {role === "helper" ? "Continue with Facebook" : "使用 Facebook 登录"}
          </button>
        </div>

        {error && <p className="text-red-400 mt-3 text-[13px]">{error}</p>}

        <p className="mt-auto pt-8 text-center text-white/20" style={{ fontSize: 11 }}>
          {role === "helper"
            ? "By continuing you agree to our Terms & Privacy Policy"
            : "继续即同意服务条款与隐私政策"}
        </p>
      </motion.div>
    </div>
  );
}
