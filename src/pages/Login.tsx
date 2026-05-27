import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useLanguage, type Language } from "../contexts/LanguageContext";
import { supabase } from "../lib/supabase";
import { markLogin } from "../lib/userLifecycle";
import { syncProfileFromDB } from "../lib/profileSync";
import { getUserId, setUserId } from "../lib/userId";
import LanguageSwitcher from "../components/LanguageSwitcher";

// TICKET-038 REVISED — about hero 合并 login (老板拍板漏斗 -1 页). 5 lang
// 全配 (zh/zh-Hant/en/tl/id). 不用 t() / t4() 因 zh-Hant 字形独立。
// TICKET-040 — eyebrow 简化为 "爱吃 Aieats" (原 "AIEATS · 妈妈们的智能菜单"
// 跟 H1 重复). H1 / sub 不动.
// TICKET-040 §A 强化 (08:30) — eyebrow 放大成 LOGO + 加 slogan "家人吃啥我来惦记～".
const LOGIN_HERO: Record<Language, { eyebrow: string; h1: string; sub: string; slogan: string }> = {
  "zh":      { eyebrow: "爱吃 Aieats", h1: "妈妈们的智能菜单",          sub: "按节气推应季菜 · 同步校园菜谱 · 给宝贝不重复的营养呵护",                                                       slogan: "家人吃啥我来惦记～" },
  "zh-Hant": { eyebrow: "愛吃 Aieats", h1: "媽媽們的智能菜單",          sub: "按節氣推應季菜 · 同步校園菜譜 · 給寶貝不重複的營養呵護",                                                       slogan: "家人吃啥我來惦記～" },
  "en":      { eyebrow: "Aieats",      h1: "Smart menu for moms",       sub: "Seasonal recipes by solar terms · aligned with school cafeteria · no-repeat nutrition for your baby.",         slogan: "Family meals, we keep them in mind~" },
  "tl":      { eyebrow: "Aieats",      h1: "Smart menu para sa nanay",  sub: "Mga seasonal na recipe · ka-aligned ng school cafeteria · walang-ulit na nutrisyon para sa anak mo.",          slogan: "Pagkain ng pamilya, kami ang nag-iisip~" },
  "id":      { eyebrow: "Aieats",      h1: "Menu pintar untuk mama",    sub: "Resep musiman · selaras dengan kafetaria sekolah · nutrisi tanpa pengulangan untuk si kecil.",                  slogan: "Hidangan keluarga, kami yang mengingat~" },
};

interface ChannelChip {
  emoji: string;
  color: string;
  label: Record<Language, string>;
}
const LOGIN_CHANNELS: ChannelChip[] = [
  { emoji: '🌶️', color: 'rgba(255,90,31,0.15)',  label: { 'zh': '你爱吃',  'zh-Hant': '你愛吃',  'en': 'You love',   'tl': 'Gusto mo',       'id': 'Favoritmu'        } },
  { emoji: '🌿', color: 'rgba(34,197,94,0.15)',  label: { 'zh': '当令',    'zh-Hant': '當令',    'en': 'In season',  'tl': 'In season',      'id': 'Musimnya'         } },
  { emoji: '🎋', color: 'rgba(236,72,153,0.15)', label: { 'zh': '节气',    'zh-Hant': '節氣',    'en': 'Festival',   'tl': 'Pista',          'id': 'Perayaan'         } },
  { emoji: '🎒', color: 'rgba(59,130,246,0.15)', label: { 'zh': '孩子补',  'zh-Hant': '孩子補',  'en': 'Kid boost',  'tl': 'Para sa bata',   'id': 'Untuk anak'       } },
  { emoji: '💪', color: 'rgba(168,85,247,0.15)', label: { 'zh': '本周补',  'zh-Hant': '本週補',  'en': 'Week boost', 'tl': 'Linggo boost',   'id': 'Boost mingguan'   } },
];

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
  // TICKET-095 P0 hot-fix — 必须走 setUserId() 不能直接写 LS, 否则不写
  // SESSION_VERSION sentinel → App.tsx 启动 IIFE 检测 sentinel 不命中 → 清
  // userId → RequireAuth 又踢回 /login. 老板真测 (5/27): "点微信登录弹到
  // 还是这个登陆界面"的真因.
  setUserId(userId);
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

  // TICKET-064 §A — wx_refresh=avatar 自动触发 snsapi_userinfo 重授权。
  // 背景: wechat-mp-callback (TICKET-057, commit cb0ada1) 检测到老 row 缺
  // avatar_url → 302 跳 /login?wx_refresh=avatar 触发"补头像"流程, 但
  // Login 原本没读这个 query, 用户卡在登录页不知道要再点微信按钮,
  // 头像永远刷不上 (老板真测 #10)。
  //
  // 这里在 UA 为 MicroMessenger 时直接调 launchWeChat() —— 内部
  // window.location.href 立即跳走 OAuth 同意页, 授权回来后 callback
  // 会写 avatar_url, 下次 silent 检测就不会再 302 跳 wx_refresh, 不会
  // 无限循环。非微信 UA 不自动跳 (launchWeChat 会 return triggered:false),
  // 让用户手动选登录方式。
  const [wxRefreshing, setWxRefreshing] = useState(false);
  useEffect(() => {
    const refresh = searchParams.get("wx_refresh");
    if (refresh !== "avatar") return;
    if (!/MicroMessenger/i.test(navigator.userAgent)) return;
    setWxRefreshing(true);
    // launchWeChat 内部 window.location.href = url 会跳走, 不需要 await。
    // 3 秒兜底关掉 banner (理论上跳走后不会再渲染, 但 UA 边界 case 留底)。
    launchWeChat();
    const tm = setTimeout(() => setWxRefreshing(false), 3000);
    return () => clearTimeout(tm);
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

  // TICKET-043 §B — 中介推荐码 (选填). PDPO 合规: 不显示"你的中介是 X"
  // 避免泄露中介客户名单, 只内部 attribution 写 user_profiles.
  // ?ref=AIEATS_DEMO URL 自动预填 (中介自定义分享链可一键填码).
  const [agencyCode, setAgencyCode] = useState(() =>
    (searchParams.get("ref") ?? "").toUpperCase()
  );

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
    // TICKET-047 QA: 用 "/" 让 RootRedirect 根据三态 (quickPrefs / v3_done / v2_done)
    // 统一路由，避免老链路硬跳 /setup 绕开 TICKET-042 新 OnboardingV2 (3 组图 + 2 问)。
    // 老 quickPrefs 用户 → Home; 完成过 OnboardingV2 → Home; 纯新用户 → /onboarding-v2.
    navigate("/");
  };

  // TICKET-043 §B — 中介推荐码 attribution. 容错: 不命中只写 referred_by_code
  // 留 record (不报错). 命中写 referred_by_agency_id + referred_by_code.
  // PDPO 合规: 不暴露 agency.name / contact 给 UI, 只内部 attribution.
  const attributeReferralCode = async (userId: string, rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    try {
      const { data: agency } = await supabase
        .from('agencies')
        .select('id')
        .eq('referral_code', code)
        .eq('status', 'active')
        .maybeSingle();
      await supabase
        .from('user_profiles')
        .update({
          referred_by_agency_id: agency?.id ?? null,
          referred_by_code: code,
        })
        .eq('id', userId);
    } catch {
      // silent — attribution 失败不阻塞登录
    }
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

      // TICKET-043 §B — 推荐码 attribution (helper 路径). 在 user_profiles
      // upsert 之后跑, 否则 update 找不到 row.
      if (agencyCode.trim()) {
        await attributeReferralCode(helperId, agencyCode);
      }

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
    // TICKET-043 §B — 推荐码若有则缓存 localStorage, 给 WeChat OAuth 回调
    // 用 (edge function 落 userId 后, /auth/wechat/done 路由可读出并 attribute).
    // 当前 ship 真 OAuth 路径不处理 (需 edge fn 配套), 只 dev fallback 立即 attribute.
    if (agencyCode.trim()) {
      try { localStorage.setItem('nutri_pending_ref_code', agencyCode.trim().toUpperCase()); } catch {}
    }
    const res = launchWeChat();
    if (!res.triggered) {
      // Outside WeChat browser: keep the dev fallback so testing on
      // desktop still works. Real 大陆 users hit this from inside WeChat
      // and never see the fallback.
      if (!/MicroMessenger/i.test(navigator.userAgent)) {
        devTestLogin(role, "wechat");
        // TICKET-043 §B — dev fallback 路径立即 attribute.
        // 真 WeChat OAuth 路径在 WeChatCallback.tsx 消费 nutri_pending_ref_code
        // (TICKET-050 P0 已修).
        if (agencyCode.trim()) {
          const uid = getUserId();
          if (uid) {
            attributeReferralCode(uid, agencyCode).catch(() => {});
          }
        }
        goAfterLogin(role);
        return;
      }
      setError(res.reason ?? "微信登录失败");
    }
  };

  // UI 013 §B — Learner helper signup (no invite code). For 还没找到雇主
  // 的菲佣 / 学中国菜 path. Creates standalone user_profiles row, marks
  // nutri_helper_mode='learner' so HelperHome can branch to LearnerHome.
  const handleLearnerSignup = async () => {
    const nickname = window.prompt(t("Your name?", "你的名字？"));
    if (!nickname || !nickname.trim()) return;
    const langInput = window.prompt(t("Language: en / tl / id?", "语言: en / tl / id?"), "en");
    const lang = (langInput === "tl" || langInput === "id" || langInput === "en")
      ? langInput : "en";

    let helperId = getUserId();
    if (!helperId) {
      helperId = crypto.randomUUID();
      setUserId(helperId);
    }
    try {
      await supabase.from("user_profiles").upsert(
        { id: helperId, display_name: nickname.trim() },
        { onConflict: "id" },
      );
      // TICKET-043 §B — 推荐码 attribution (learner 路径)
      if (agencyCode.trim()) {
        await attributeReferralCode(helperId, agencyCode);
      }
    } catch {
      // upsert failure non-fatal — still persist locally so user can browse.
    }
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("nutri_role", "helper");
    localStorage.setItem("nutri_helper_mode", "learner");
    localStorage.setItem("appLanguage", lang);
    setLanguage(lang as Language);
    markLogin();
    window.dispatchEvent(new Event("nutri-prefs-changed"));
    navigate("/helper");
  };

  // TICKET-038 §C — 微信按钮下方 5-lang 小字 "（免费试用30天）"。zh-Hant 独立
  // 翻译（繁体"免費"不同字），所以不能复用 t() 的 zh fallback。
  const TRIAL_CAPTION: Record<Language, string> = {
    "zh":      "（免费试用30天）",
    "zh-Hant": "（免費試用30天）",
    "en":      "(Free 30-day trial)",
    "tl":      "(Libreng 30-araw trial)",
    "id":      "(Coba gratis 30 hari)",
  };

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

      {/* TICKET-064 §B — wx_refresh=avatar 自动重授权时顶部 banner 提示。
          老板真测 #10 关键: 让用户知道页面"正在干嘛", 避免以为卡死又退出。
          3 秒后自动消失 (此时 launchWeChat 已跳走 OAuth 同意页, 渲染不再发生)。 */}
      {wxRefreshing && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 py-2.5 px-4"
          style={{
            background: "rgba(7,193,96,0.92)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 2px 12px rgba(7,193,96,0.35)",
          }}
        >
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          <span>{t("Refreshing your WeChat avatar…", "正在重新获取微信头像...")}</span>
        </div>
      )}

      {/* TICKET-038 REVISED — 5-lang floating switcher (zh/zh-Hant/en/tl/id);
          替换原 4-lang inline chip (漏 zh-Hant). HK/TW 妈妈用繁体首选。 */}
      <LanguageSwitcher className="fixed top-4 right-4 z-50" />

      {/* 占位 header 保留垂直节奏 (原 4-lang header 高约 56px) */}
      <header className="relative z-10 h-14" />

      <AnimatePresence mode="wait">
        <motion.div key="login"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="flex-1 flex flex-col justify-end px-7 pb-10 z-10 relative">

          {/* TICKET-038 REVISED §B — about hero 合并到 login.
              TICKET-040 §A 强化 (08:30): eyebrow 放大成 LOGO + 加 slogan. */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.10, duration: 0.5, ease: "easeOut" }} className="mb-5">
            {/* eyebrow = 品牌 LOGO 位 (老板拍板比 H1 大一号, 去 uppercase/tracking, serif bold) */}
            <p className="font-serif font-bold mb-2"
              style={{ fontSize: 34, color: "#FF8C54", letterSpacing: "0.01em", lineHeight: 1 }}>
              {LOGIN_HERO[language].eyebrow}
            </p>
            <h1 className="font-serif font-black text-white leading-tight"
              style={{ fontSize: 28, letterSpacing: "-0.01em" }}>
              {LOGIN_HERO[language].h1}
            </h1>
            <div className="mt-3 mb-3 rounded-full"
              style={{ width: 36, height: 2, background: "#FF5A1F", boxShadow: "0 0 12px rgba(255,90,31,0.6)" }} />
            <p className="text-white/70 leading-relaxed" style={{ fontSize: 14 }}>
              {LOGIN_HERO[language].sub}
            </p>
            {/* TICKET-040 §A 强化 slogan — italic serif, 14, text-white/55 */}
            <p className="italic font-serif mt-3 text-white/55" style={{ fontSize: 14, letterSpacing: "0.02em" }}>
              {LOGIN_HERO[language].slogan}
            </p>
          </motion.div>

          {/* 5-channel chip 横排 — 与原 /about 对齐, 无标题无 desc, chip 自解释 */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.20, duration: 0.5 }}
            className="flex flex-wrap gap-2 mb-7">
            {LOGIN_CHANNELS.map((c, idx) => (
              <motion.span key={c.emoji}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.30, delay: 0.25 + idx * 0.05, ease: "easeOut" }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: c.color,
                  color: "white",
                  fontSize: 11,
                  border: `1px solid ${c.color.replace("0.15", "0.30")}`,
                }}>
                <span>{c.emoji}</span>
                <span>{c.label[language]}</span>
              </motion.span>
            ))}
          </motion.div>

          {/* TICKET-045 §C — picker + Switch role 按钮删除 (老板拍板"3 入口同时显示").
              role state 默认 employer (useState init), 用户进 /login 直接看 employer
              view (微信 + 30 天小字). 菲佣入口 via ?role=helper / ?invite=ABC URL 仍工作. */}
          {/* Login buttons */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease: "easeOut" }}
            className="flex flex-col gap-3">

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

            {/* TICKET-047 修订 (CEO 14:25 拨乱反正) — 删雇主独立卡, 改 role toggle.
                微信登录是唯一 OAuth 入口, 雇主/菲佣是任务角色切换 (非独立 OAuth). */}
            <div className="grid grid-cols-2 gap-2 mb-1">
              <button
                onClick={() => setRole("employer")}
                className="rounded-2xl py-3 font-bold transition-all active:scale-95"
                style={{
                  background: role === "employer" ? "rgba(255,90,31,0.18)" : "rgba(255,255,255,0.05)",
                  border: role === "employer" ? "1.5px solid rgba(255,90,31,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  color: role === "employer" ? "white" : "rgba(255,255,255,0.55)",
                  fontSize: 13,
                }}>
                🏠 {t("I'm an employer", "我是雇主")}
              </button>
              <button
                onClick={() => setRole("helper")}
                className="rounded-2xl py-3 font-bold transition-all active:scale-95"
                style={{
                  background: role === "helper" ? "rgba(37,211,102,0.18)" : "rgba(255,255,255,0.05)",
                  border: role === "helper" ? "1.5px solid rgba(37,211,102,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  color: role === "helper" ? "white" : "rgba(255,255,255,0.55)",
                  fontSize: 13,
                }}>
                👩‍🍳 {t("I'm a helper", "我是菲佣")}
              </button>
            </div>

            {/* TICKET-043 §B — 中介推荐码 (选填). PDPO 合规: 仅 input, 不显
                "你的中介是 X" 避免泄露中介客户名单. employer/helper 双角色都可填. */}
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              value={agencyCode}
              onChange={e => setAgencyCode(e.target.value.toUpperCase())}
              placeholder={t("Referral code (optional)", "中介推荐码（选填）")}
              className="w-full h-10 rounded-xl px-3 text-white outline-none mb-1"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px dashed rgba(255,255,255,0.18)",
                fontSize: 12, letterSpacing: "0.06em",
              }}
            />

            {/* TICKET-047 修订 — helper 角色才显邀请码 box, employer 直接看微信登录 */}
            {role === "helper" && (
            <>
              {/* TICKET-068 §B — 菲佣邀请码登录入口（跳过 OAuth 直接进 /helper） */}
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

            </>
            )}

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
            {/* TICKET-038 §C — 微信按钮下方 trial caption (老板 01:20 拍板:
                "在下面用小字体显示 （免费试用30天）"). 5-lang per TRIAL_CAPTION.
                TICKET-051 §C — 老板拍板"菲佣界面不要显示免费试用 本来就是免费的"，
                trial 文案仅雇主可见，helper 选中时隐藏。 */}
            {role === "employer" && (
              <p className="text-center text-white/45" style={{ fontSize: 11, marginTop: -4 }}>
                {TRIAL_CAPTION[language]}
              </p>
            )}

            </>

            {/* TICKET-047 §F — Learner signup 只 helper 选中时显 (老板 14:35 真测拍板
                "雇主不可能未就业"). employer 选中时不显此入口. */}
            {role === "helper" && (
              <button
                onClick={handleLearnerSignup}
                className="w-full h-[44px] mt-3 rounded-2xl flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px dashed rgba(255,255,255,0.20)",
                  fontSize: 12, color: "rgba(255,255,255,0.65)",
                }}>
                <span style={{ fontSize: 14 }}>🌱</span>
                {t("Not employed yet — Learn Chinese cooking", "我还没就职 — 先学中国菜")}
              </button>
            )}

            {error && (
              <p className="text-center" style={{ color: "#FF8C54", fontSize: 13 }}>
                {error}
              </p>
            )}
          </motion.div>

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
