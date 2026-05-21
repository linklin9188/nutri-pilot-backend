import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useLanguage, type Language } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { markLogin } from "../lib/userLifecycle";
import { syncProfileFromDB } from "../lib/profileSync";
import { getUserId, setUserId } from "../lib/userId";

type Role = "employer" | "helper";

// Local fallback identity so the rest of the app stays usable when WeChat
// OAuth isn't reachable (e.g. desktop dev). Stable per (role, provider)
// so re-logging in on the same device returns the same anonymous userId.
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
  // Idempotent: writes first-login epoch + flags this browser session as
  // the new-user session iff this is the very first login on this device.
  markLogin();
  // §A (TICKET-039 Smell 2 阶段 2) — 登录成功后拉远端 profile 覆盖本地，
  // 让跨设备登录的用户能看到上次设备保存的 hometown / goal / taste。
  // fire-and-forget；匿名 / 网络失败 silent。
  syncProfileFromDB(userId).catch(() => {});
  // LanguageProvider listens for this to re-derive default language
  // (helper → en, employer → zh).
  window.dispatchEvent(new Event("nutri-prefs-changed"));
}

// WeChat 公众号 网页授权 (snsapi_userinfo). Only works inside the WeChat
// in-app browser — no 网站应用 yet so qrconnect from desktop browsers is
// not available. redirect_uri must live on the whitelisted domain
// (nothinkeats.com), so we bounce through /auth/wechat/in which forwards
// to the Supabase edge function. Edge fn exchanges code, upserts
// user_profiles, then 302s back to /auth/wechat/done with userId in hash.
function launchWeChat(): { triggered: boolean; reason?: string } {
  const appid = import.meta.env.VITE_WECHAT_APPID;
  const isWeChatBrowser = /MicroMessenger/i.test(navigator.userAgent);
  if (!isWeChatBrowser) {
    return { triggered: false, reason: "请在微信里打开 nothinkeats.com 后再点「微信登录」。" };
  }
  if (!appid) {
    return { triggered: false, reason: "微信登录即将上线，请稍后再试。" };
  }
  const redirect = encodeURIComponent(`${window.location.origin}/auth/wechat/in`);
  const state = crypto.randomUUID();
  sessionStorage.setItem("wechat_oauth_state", state);
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${redirect}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  window.location.href = url;
  return { triggered: true };
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language, setLanguage } = useLanguage();

  // ── source detection ──────────────────────────────────────────────
  // The WeChat 小程序 web-view shell appends `?source=wx_mp`; raw 微信分享
  // links (公众号 / 朋友圈 / 群) come through with UA MicroMessenger and may
  // carry `?source=wx`. Persist to localStorage so navigation around the
  // site keeps the flag.
  useEffect(() => {
    const src = searchParams.get("source");
    if (src === "wx_mp") localStorage.setItem("nutri_source", "wx_mp");
    if (src === "wx")    localStorage.setItem("nutri_source", "wx");
  }, [searchParams]);

  // WeChat-flow detection — covers all 大陆 entry paths. When true we
  // run the wxRecognizing overlay so first-time WeChat browser visitors
  // see a "微信识别中…" splash before falling through to manual login.
  // (Login UI itself is now WeChat-only for employers + invite-code for
  //  helpers, no IG/FB regardless of this flag — see TICKET-068 §C.)
  const isWxFlow = searchParams.get("source") === "wx_mp"
                || localStorage.getItem("nutri_source") === "wx_mp"
                || searchParams.get("source") === "wx"
                || localStorage.getItem("nutri_source") === "wx"
                || /MicroMessenger/i.test(navigator.userAgent);

  // ── role pick ─────────────────────────────────────────────────────
  // ?role=helper in URL pre-selects helper (used by Settings invite link
  // sent to 阿姨). Otherwise default to employer — most landings are the
  // 家庭 owner. Persisted to localStorage immediately on pick so OAuth
  // redirect chains see the right role even after window.location.href.
  // TICKET-068 §B+ — ?invite=ABC123 链接也自动切 helper tab + 预填邀请码
  // (一键 WhatsApp 闭环：雇主分享 → 菲佣点 link → 不用手输直接进 InviteCodeBox)
  const urlRole: Role = (searchParams.get("role") === "helper" || searchParams.get("invite"))
    ? "helper" : "employer";
  const [role, setRole] = useState<Role>(() => {
    const saved = localStorage.getItem("nutri_role");
    if (saved === "employer" || saved === "helper") return saved;
    return urlRole;
  });
  useEffect(() => {
    localStorage.setItem("nutri_role", role);
  }, [role]);

  // TICKET-010 §H — role 选择强化：默认无预选 → 2 大卡片优先（"先选 role 再
  // 走对应路径"老板补充反馈）。三种情况已确认无需手选：
  //   1. URL 带 ?role=helper / ?invite=XXX (Settings 分享链接 / 一键 WhatsApp)
  //   2. localStorage 已存 nutri_role (老用户回头登录)
  // 其余情况（首次匿名访客 / fresh=1 清登录态）→ 用户必须先在 2 大卡片 grid
  // 选一次才进入登录方式 UI。
  const [roleConfirmed, setRoleConfirmed] = useState<boolean>(() => {
    if (searchParams.get("role") === "helper" || searchParams.get("invite")) return true;
    const saved = localStorage.getItem("nutri_role");
    return saved === "employer" || saved === "helper";
  });

  const [error, setError] = useState("");

  // TICKET-068 §B — 菲佣邀请码登录 state
  // §B+ URL ?invite=ABC 自动预填（一键 WhatsApp 闭环菲佣点 link 不用手输）
  const [inviteCode, setInviteCode] = useState(() =>
    (searchParams.get("invite") ?? "").toUpperCase()
  );
  const [inviteNick, setInviteNick] = useState("");
  const [inviteErr, setInviteErr] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  // TICKET-037 §B — WeChat 自动登录路径的进度条 + 手动降级。
  // 当用户从微信里第一次进入 /login（isWxFlow=true）且没有缓存的
  // wechat_session 时，先显示一个"微信识别中…"覆盖层，4 秒后自动落到
  // 手动登录视图（用户也可立即点"手动登录"跳过等待）。
  const [wxRecognizing, setWxRecognizing] = useState<boolean>(() => {
    if (!isWxFlow) return false;
    // 已有 wechat_session 缓存 = 老用户重复进入，不再 stall — 直接显示
    // 手动登录界面（点微信按钮即可走 OAuth）。
    try {
      const cached = localStorage.getItem("wechat_session");
      if (cached) {
        const parsed = JSON.parse(cached) as { at?: number };
        // 24 小时内有缓存就跳过等待
        if (parsed.at && Date.now() - parsed.at < 24 * 3600 * 1000) return false;
      }
    } catch { /* corrupt cache — fall through to recognizing */ }
    return true;
  });
  useEffect(() => {
    if (!wxRecognizing) return;
    const t = setTimeout(() => setWxRecognizing(false), 4000);
    return () => clearTimeout(t);
  }, [wxRecognizing]);

  const goAfterLogin = (r: Role) => {
    if (r === "helper") { navigate("/helper"); return; }
    navigate(localStorage.getItem("quickPrefs") ? "/" : "/setup");
  };

  // TICKET-068 §B — 邀请码提交：households 查 → upsert user_profiles +
  // household_members → 持久化 helper role + navigate /helper. 跳过 OAuth,
  // 菲佣不需要 FB/IG/微信账号即可进入。
  const submitInviteCode = async () => {
    setInviteErr("");
    const code = inviteCode.trim().toUpperCase();
    const nick = inviteNick.trim();
    if (!code) { setInviteErr(t("Please enter the invite code", "请输入邀请码")); return; }
    if (!nick) { setInviteErr(t("Please enter your name", "请填写你的名字")); return; }
    setInviteBusy(true);
    try {
      const { data: hh, error: hhErr } = await supabase
        .from('households')
        .select('id, employer_id')
        .eq('invite_code', code)
        .maybeSingle();
      if (hhErr || !hh) {
        setInviteErr(t("Wrong invite code, ask your employer to resend.", "邀请码不对，请联系雇主重发"));
        setInviteBusy(false);
        return;
      }

      let helperId = getUserId();
      if (!helperId) {
        helperId = crypto.randomUUID();
        setUserId(helperId);
      }

      await supabase.from('user_profiles').upsert(
        { id: helperId, display_name: nick },
        { onConflict: 'id' }
      );

      await supabase.from('household_members').upsert(
        { household_id: hh.id, helper_id: helperId, status: 'active' },
        { onConflict: 'household_id,helper_id' }
      );

      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('nutri_role', 'helper');
      markLogin();
      window.dispatchEvent(new Event('nutri-prefs-changed'));
      navigate('/helper');
    } catch (e: any) {
      setInviteErr(e?.message ?? t("Submit failed, please retry", "提交失败，请重试"));
      setInviteBusy(false);
    }
  };

  const handleWeChat = () => {
    setError("");
    const res = launchWeChat();
    if (!res.triggered) {
      // Outside WeChat browser: keep the dev fallback so testing on
      // desktop still works. Real 大陆 users hit this from inside WeChat
      // and never see the fallback.
      if (!/MicroMessenger/i.test(navigator.userAgent)) {
        devTestLogin(role, "wechat");
        goAfterLogin(role);
        return;
      }
      setError(res.reason ?? "微信登录失败");
    }
  };

  // ── 4-language switcher ──────────────────────────────────────────
  // Always 4-way (zh / en / tl / id) regardless of role — helpers may pick
  // their language before tapping a button, employers can keep zh.
  const LANGS: { key: Language; label: string }[] = [
    { key: "zh", label: "中文" },
    { key: "en", label: "EN" },
    { key: "tl", label: "Tagalog" },
    { key: "id", label: "Bahasa" },
  ];

  // ── time-based hero bg ───────────────────────────────────────────
  // 7 days (Mon–Sun) × 3 meal slots (breakfast/lunch/dinner)
  const DAY_IMAGES = [
    { breakfast: "photo-1484723091739-30a097e8f929", lunch: "photo-1495474472287-4d71bcdd2085", dinner: "photo-1414235077428-338989a2e8c0" },
    { breakfast: "photo-1567620905732-2d1ec7ab7445", lunch: "photo-1509042239860-f550ce710b93", dinner: "photo-1559339352-11d035aa65de" },
    { breakfast: "photo-1533089860892-a7c6f0a88666", lunch: "photo-1442512595331-e89e73853f31", dinner: "photo-1476224203421-9ac39bcb3327" },
    { breakfast: "photo-1550547660-d9450f859349",    lunch: "photo-1461023058943-07fcbe16d735", dinner: "photo-1467003909585-2f8a72700288" },
    { breakfast: "photo-1525351484163-7529414344d8", lunch: "photo-1447933601403-0c6688de566e", dinner: "photo-1432139509613-5c4255815697" },
    { breakfast: "photo-1490645935967-10de6ba17061", lunch: "photo-1541167760496-1628856ab772", dinner: "photo-1565299624946-b28f40a0ae38" },
    { breakfast: "photo-1504674900247-0877df9cc836", lunch: "photo-1498804103079-a6351b050096", dinner: "photo-1574484284002-952d92456975" },
  ] as const;
  const getMealSlot = (h: number): "breakfast" | "lunch" | "dinner" =>
    h >= 5 && h < 11 ? "breakfast" : h >= 11 && h < 17 ? "lunch" : "dinner";
  // Always use Beijing time (UTC+8) regardless of user's device timezone
  const _now        = new Date();
  const _bjDate     = new Date(_now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const _dayIdx     = (_bjDate.getDay() + 6) % 7; // 0=Mon…6=Sun
  const _meal       = getMealSlot(_bjDate.getHours());
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

  const roleHint = role === "helper"
    ? t("Sign in to view today's shopping & cooking tasks", "登录后即可查看今天的采买与烹饪任务")
    : t("Sign in to unlock your menu & smart shopping", "登录解锁完整菜单与智能采购");

  // TICKET-037 §B — WeChat auto-recognition overlay. Renders before the
  // regular login UI so the user lands on "微信识别中…" first when the silent
  // OAuth is in flight (and falls through to the manual login after 4 s
  // OR a tap on "手动登录").
  if (wxRecognizing) {
    return (
      <div className="font-sans min-h-screen flex flex-col items-center justify-center max-w-md mx-auto px-8 text-white"
        style={{ background: "#080808" }}>
        <div className="inline-block w-9 h-9 rounded-full border-2 border-white/15 border-t-[#25D366] animate-spin mb-4" />
        <p style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>微信识别中…</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", textAlign: 'center', lineHeight: 1.6 }}>
          已识别您来自微信，正在尝试自动登录<br />
          {/* If the user already has an account on this device, RootRedirect's
              maybeAttemptSilent path will have left them logged in — this page
              is the fallback when localStorage was wiped or it's a fresh device. */}
          稍候片刻或点下方手动登录
        </p>
        <button
          onClick={() => setWxRecognizing(false)}
          className="mt-5 px-5 py-2 rounded-full font-bold active:scale-95 transition-transform"
          style={{ background: "rgba(255,255,255,0.10)", color: "white", fontSize: 13 }}>
          手动登录 →
        </button>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden text-white"
      style={{ background: "#080808" }}>
      {heroBg}

      {/* Top bar — 4-language switcher */}
      <header className="relative z-10 flex justify-end p-5">
        <div className="inline-flex p-1 rounded-2xl gap-0.5"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {LANGS.map(({ key, label }) => (
            <button key={key}
              onClick={() => setLanguage(key)}
              className="px-2.5 py-1 rounded-xl font-bold transition-all active:scale-95"
              style={{
                fontSize: 11,
                background: language === key ? "#FF5A1F" : "transparent",
                color:      language === key ? "white"   : "rgba(255,255,255,0.55)",
              }}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div key="login"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="flex-1 flex flex-col justify-end px-7 pb-10 z-10 relative">

          {/* Brand block */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: "easeOut" }} className="mb-7">

            <div className="flex items-center gap-3">
              <h1 className="font-serif font-black text-white leading-none whitespace-nowrap"
                style={{ fontSize: 40, letterSpacing: "0.02em" }}>爱吃</h1>
              <span style={{ fontSize: 22, color: "#FF5A1F", fontWeight: 400, lineHeight: 1 }}>·</span>
              <span className="text-white/75 font-light uppercase"
                style={{ fontSize: 20, letterSpacing: "0.20em" }}>Aieats</span>
            </div>

            <div className="mt-4 mb-5 rounded-full"
              style={{ width: 36, height: 2, background: "#FF5A1F", boxShadow: "0 0 12px rgba(255,90,31,0.6)" }} />

            <p className="text-white/85 font-light" style={{ fontSize: 18, letterSpacing: "0.06em", lineHeight: 1.5 }}>
              {t("No more thinking about what to eat", "今天吃啥，交给我惦记")}
            </p>
          </motion.div>

          {/* TICKET-010 §H — role 选择优先：未确认 → 2 大卡片 grid（雇主 +
              工人）取代登录方式 UI；确认 → 原 login buttons block + 顶部
              "← 重新选择" 按钮让用户回到 picker。一键 WhatsApp / 老用户路径
              roleConfirmed 直接为 true（见 useState initializer），不打扰。 */}
          {!roleConfirmed ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: "easeOut" }}
              className="flex flex-col gap-4">
              <p className="text-center text-white/65" style={{ fontSize: 14, letterSpacing: "0.04em" }}>
                {t("Tell us who you are first", "先告诉我们您的身份")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { setRole("employer"); setRoleConfirmed(true); }}
                  className="flex flex-col items-center justify-center rounded-2xl py-7 px-3 gap-2 active:scale-[0.97] transition-all"
                  style={{
                    background: "rgba(255,90,31,0.10)",
                    border: "1.5px solid rgba(255,90,31,0.45)",
                    boxShadow: "0 6px 22px rgba(255,90,31,0.18)",
                  }}>
                  <span style={{ fontSize: 36, lineHeight: 1 }}>🏠</span>
                  <span className="font-bold text-white" style={{ fontSize: 15 }}>
                    {t("I'm an employer", "我是雇主")}
                  </span>
                  <span className="text-white/55 text-center" style={{ fontSize: 11, lineHeight: 1.4 }}>
                    {t("Plan weekly menus for family", "为家人安排每周菜单")}
                  </span>
                </button>
                <button
                  onClick={() => { setRole("helper"); setRoleConfirmed(true); }}
                  className="flex flex-col items-center justify-center rounded-2xl py-7 px-3 gap-2 active:scale-[0.97] transition-all"
                  style={{
                    background: "rgba(37,211,102,0.10)",
                    border: "1.5px solid rgba(37,211,102,0.45)",
                    boxShadow: "0 6px 22px rgba(37,211,102,0.18)",
                  }}>
                  <span style={{ fontSize: 36, lineHeight: 1 }}>👩‍🍳</span>
                  <span className="font-bold text-white" style={{ fontSize: 15 }}>
                    {t("I'm a helper", "我是工人")}
                  </span>
                  <span className="text-white/55 text-center" style={{ fontSize: 11, lineHeight: 1.4 }}>
                    {t("Enter with employer's invite code", "用雇主给的邀请码进入")}
                  </span>
                </button>
              </div>
            </motion.div>
          ) : (
          /* Login buttons */
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease: "easeOut" }}
            className="flex flex-col gap-3">

            <button
              onClick={() => setRoleConfirmed(false)}
              className="self-start flex items-center gap-1 px-3 py-1.5 rounded-full active:scale-95 transition-transform mb-1"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <span className="material-symbols-outlined text-white/65" style={{ fontSize: 14 }}>arrow_back</span>
              <span className="text-white/65 font-semibold" style={{ fontSize: 11 }}>
                {t("Switch role", "重新选择")}
              </span>
            </button>

            {/* Floating food emojis */}
            <div className="relative w-full flex justify-center mb-2 h-[8px]">
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

            <p className="text-center text-white/55" style={{ fontSize: 13, letterSpacing: "0.04em" }}>
              {roleHint}
            </p>

            {role === "helper" ? (
              /* TICKET-068 §B — 菲佣邀请码登录入口（跳过 OAuth 直接进 /helper） */
              <div className="flex flex-col gap-3 rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <p className="text-white font-semibold text-center" style={{ fontSize: 14 }}>
                  {t("I'm a helper", "我是工人")}
                </p>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder={t("Invite code (6 chars)", "邀请码（6 位）")}
                  className="w-full h-11 rounded-xl px-3 text-white outline-none"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontSize: 14, letterSpacing: "0.08em",
                  }}
                />
                <input
                  type="text"
                  value={inviteNick}
                  onChange={e => setInviteNick(e.target.value)}
                  placeholder={t("Your nickname", "你的名字")}
                  className="w-full h-11 rounded-xl px-3 text-white outline-none"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontSize: 14,
                  }}
                />
                <button
                  onClick={submitInviteCode}
                  disabled={inviteBusy}
                  className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{
                    background: "#25D366",
                    boxShadow: "0 8px 24px rgba(37,211,102,0.28)",
                    fontSize: 15, color: "white",
                  }}
                >
                  {inviteBusy
                    ? t("Submitting…", "提交中…")
                    : t("Enter with code", "用邀请码进入")}
                </button>
                {inviteErr && (
                  <p className="text-center" style={{ color: "#FF8C54", fontSize: 13 }}>
                    {inviteErr}
                  </p>
                )}
              </div>
            ) : (
            <>
            {/* WeChat — always shown */}
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
              {t("Continue with WeChat", "微信登录")}
            </button>

            </>
            )}

            {error && (
              <p className="text-center" style={{ color: "#FF8C54", fontSize: 13 }}>
                {error}
              </p>
            )}
          </motion.div>
          )}

          <p className="mt-5 text-center text-white/45" style={{ fontSize: 12, letterSpacing: "0.04em", lineHeight: 1.5 }}>
            {t("By continuing you agree to our ", "继续即同意")}
            <Link to="/terms" className="underline hover:text-white/75">
              {t("Terms", "服务条款")}
            </Link>
            {t(" & ", " 与 ")}
            <Link to="/privacy" className="underline hover:text-white/75">
              {t("Privacy Policy", "隐私政策")}
            </Link>
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
