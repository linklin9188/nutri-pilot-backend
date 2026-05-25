/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import QuickSetup from './pages/QuickSetup';
import Onboarding from './pages/Onboarding';
import OnboardingV2 from './pages/OnboardingV2';
import HelperPrep from './pages/HelperPrep';
import HelperCook from './pages/HelperCook';
import HelperHome from './pages/HelperHome';
import HelperSettings from './pages/HelperSettings';
import LearnerHome from './pages/LearnerHome';
import Community from './pages/Community';
import HelperCommunity from './pages/HelperCommunity';
import VerifyIngredients from './pages/VerifyIngredients';
import DeliveryTracking from './pages/DeliveryTracking';
// TICKET-066 P0 — AIPilot import 保留无意义 (route 改 Navigate redirect),
// 删除以避免无用 bundle. 文件本身 src/pages/AIPilot.tsx 不删 (历史 mock 参考).
// import AIPilot from './pages/AIPilot';
import ChatAgent from './pages/ChatAgent';
import Settings from './pages/Settings';
import WeeklyMenu from './pages/WeeklyMenu';
import Pricing from './pages/Pricing';
import Banquet from './pages/Banquet';
import WeekendDining from './pages/WeekendDining';
import ProWellness from './pages/ProWellness';
import ProSchoolBalance from './pages/ProSchoolBalance';
import Favorites from './pages/Favorites';
import WeChatCallback from './pages/WeChatCallback';
import WeChatIn from './pages/WeChatIn';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import RequireAuth from './components/RequireAuth';
import NetworkBanner from './components/NetworkBanner';
import { syncFavoritesFromCloud } from './lib/favorites';
import { syncProfileFromDB } from './lib/profileSync';
import { getUserId } from './lib/userId';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { supabase } from './lib/supabase';
import { maybeAttemptSilent } from './lib/wechatSilentLogin';
import { useWeChatShare } from './hooks/useWeChatShare';

// TICKET-018 §D — DEV-only prototype routes (lazy + tree-shaken from prod bundle)
const CandidateGridProto = import.meta.env.DEV
  ? lazy(() => import('./pages/__protos__/CandidateGridProto'))
  : null;


// Smart entry point for "/".
//
// TICKET-030 P0 (老板真测 2026-05-24) — 未登录用户必须先看 /login，不再直接
// 把匿名访客送到 /setup。原 anonymous-first 模型（QuickSetup 内部 crypto
// .randomUUID() 写 userId）让用户跳过 login 关口，老板要求恢复 login 第一
// 关。判定 "未登录" 用 getUserId()（custom auth invariant: userId 在
// localStorage，CLAUDE.md hard rule）。
//
// Flow:
//  • ?fresh=1                                  → /login (清登录态)
//  • ?ref=xxx                                  → /login?ref= (推广链接)
//  • 微信 silent re-auth pending               → 等候 page (auto redirect)
//  • 无 userId (getUserId() === null)          → /login  ← 新关口
//  • v3 升级路径 (老 prefs 没 v3 done)         → /setup
//  • role=helper                               → /helper
//  • 已登录 + 有 quickPrefs                    → Home
//  • 已登录 + 无 quickPrefs                    → /setup (onboarding)
function RootRedirect() {
  // TICKET-070 §C + UI 015 §M — ?fresh=1 强制 fresh restart（清登录态 + 偏好 +
  // onboarding 状态），用于 Chrome 自动化 20 profile QA 测试 + CEO 看 Login 页。
  // 用途：访问 /?fresh=1 后清空所有上次留下的 user state，跳 /login → 用户重做
  // 整个 onboarding 流程（v3 11 题图片驱动）。
  // 不清 appLanguage / nutri_audience / nutri_helper_mode / nutri_learner_* 等纯偏好 key。
  const [params] = useSearchParams();
  if (params.get('fresh') === '1') {
    [
      // 认证
      'nutri_user_id', 'userId', 'nutri_role', 'isLoggedIn',
      // legacy / v2 偏好
      'quickPrefs', 'familyPrefs',
      // onboarding 完成态标记（清掉强制重做）
      'onboarding_v3_done', 'onboarding_v2_done', 'needs_v3_onboarding',
      // v3 10 axes localStorage（按 finish() 写入顺序）
      'table_style', 'protein_main_class', 'staple_pref', 'protein_pref',
      'beef_style', 'wellness_goals', 'chicken_style', 'seafood_style',
      'veggie_method', 'oil_level', 'breakfast_cuisine',
      // Q0 派生 + UI 015 §A custom stepper
      'nutri_adults', 'nutri_kids', 'nutri_family_pattern', 'family_composition',
      // Q10 strict_avoid + UI 015 §B 各题 other 文本
      'strict_avoid', 'strict_avoid_other_text',
      // Legacy compat keys（finish 里写）
      'userTaste', 'userDiet', 'userSpice', 'userAvoid',
    ].forEach(k => localStorage.removeItem(k));
    // UI 015 §B — 各 axis 自填 'other:<text>' 拆出的 custom text 独立 key
    [
      'table_style', 'protein_main_class', 'staple_pref', 'protein_pref',
      'beef_style', 'wellness_goals', 'chicken_style', 'seafood_style',
      'veggie_method', 'oil_level', 'breakfast_cuisine',
    ].forEach(axis => localStorage.removeItem(`${axis}_custom_text`));
    return <Navigate to="/login" replace />;
  }

  // TICKET-038 REVISED — `?ref=<inviterId>` 朋友点开链接：始终跳 /login
  // (品牌介绍合并到 /login 漏斗 -1 页). 不读 localStorage role / userId,
  // 即便残留态也强制 login (覆盖 RootRedirect 后续 role=helper → /helper 路径,
  // 老板真测路径 §B-2: 任何状态访问 /?ref=xxx 都看 /login hero).
  const refParam = params.get('ref');
  if (refParam) {
    return <Navigate to={`/login?ref=${encodeURIComponent(refParam)}`} replace />;
  }

  // TICKET-005 §E — (RETIRED by TICKET-042 §C 2026-05-25) 原"β 老用户 v3 强制
  // 重做"分支已废弃。SPEC §0.2 老板拍板新 onboarding (3 组图 + 2 问) 后, 旧
  // quickPrefs 用户按 §C 第 3 条 "保兼容, 不强制走新 onboarding" 直接 /home,
  // 不再被拽回 /setup 重做. /setup 路由保留可访问 (旧用户主动重做 / 测试入口).

  // Silent re-auth for WeChat users who lost localStorage between sessions
  // (公众号 / 朋友圈 / 群聊 link clicks open in webview contexts whose
  // storage isn't always persisted). attemptSilent() redirects away, so
  // this branch never falls through to render.
  if (maybeAttemptSilent()) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="text-center">
          <div className="inline-block w-8 h-8 rounded-full border-2 border-white/20 border-t-[#FF5A1F] animate-spin mb-3" />
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>正在登录…</p>
        </div>
      </div>
    );
  }

  // TICKET-030 P0 (老板真测) — 未登录用户必须先过 /login 关口，不再直接
  // 进 onboarding (/setup)。getUserId() 是 custom-auth 登录态唯一判定
  // (CLAUDE.md hard rule: userId 在 localStorage)。微信 silent re-auth
  // 跑在这之前，所以微信用户不会被错误踢回 login。
  if (!getUserId()) {
    return <Navigate to="/login" replace />;
  }

  const role = localStorage.getItem("nutri_role");
  if (role === "helper") return <Navigate to="/helper" replace />;

  // TICKET-042 §C — 新 onboarding 流程 (SPEC §0.2 老板拍板 "3 组图 + 2 问"):
  //   - 有旧 quickPrefs → 走 /home (保兼容, 不强制旧用户重做新 onboarding)
  //   - 有 onboarding_v3_done / onboarding_v2_done 标记 → /home (新流程已完工)
  //   - 都没有 (纯新用户) → /onboarding-v2 (3 组图 + 2 问 ~ 20 秒)
  // 注: preference_vector 是 DB 字段, RootRedirect 同步组件不能 await DB query,
  // 用 localStorage onboarding_v3_done 作为权威信号 (OnboardingV2.finish() 写入).
  const hasQuickPrefs = !!localStorage.getItem("quickPrefs");
  const hasV3Done = localStorage.getItem("onboarding_v3_done") === "true";
  const hasV2Done = localStorage.getItem("onboarding_v2_done") === "true";
  if (hasQuickPrefs || hasV3Done || hasV2Done) {
    return <Home />;
  }
  return <Navigate to="/onboarding-v2" replace />;
}

// TICKET-038 REVISED — /about 路由被废，但老推广链接仍带 ?ref=<inviterId>
// 透传到 /login (老板拍板 about 合并 login 漏斗减一页).
function AboutRedirect() {
  const [params] = useSearchParams();
  const ref = params.get('ref');
  const target = ref ? `/login?ref=${encodeURIComponent(ref)}` : '/login';
  return <Navigate to={target} replace />;
}

// AppShell bootstraps cross-cutting side effects (favorites sync, Supabase
// session sync FOR THE REAL-OAUTH PATH ONLY).
//
// Custom-auth invariant (CLAUDE.md): the source of truth for "who is logged
// in" is localStorage `userId` / `nutri_user_id` / `isLoggedIn`, written
// by WeChatCallback (real 网页授权) or Login dev fallback. We must NEVER
// blow these keys away on a stray Supabase SIGNED_OUT event — Supabase
// has no session of its own for these users, and a SIGNED_OUT fires
// routinely when token refresh fails or storage events propagate across
// tabs. The previous implementation cleared these keys on SIGNED_OUT and
// dumped freshly-logged-in 微信 users straight back to /login on the
// next tab click.
function AppShell() {
  useWeChatShare();  // 全局默认分享配置（微信群分享显示 hero 卡）
  const { language, setLanguage } = useLanguage();

  // TICKET-040 §B (老板 10:30 HKT 二次拍板) — "用户打开后默认简体中文,
  // 不是英文 所有文字 包括菜单". 全局 session-once reset: 雇主用户若 sticky
  // 在 en/tl/id (常因测试 LanguageSwitcher 切过) 进 app 第一次自动 reset 到
  // zh 简体. session 内用户主动切回 EN 不会被反复覆盖 (sentinel 防抖).
  // helper role 不动 (Tagalog/Indonesian 是菲佣/印佣母语). zh-Hant 不动
  // (HK 妈妈自选繁体)的.
  useEffect(() => {
    try {
      // TICKET-047 — bump sentinel key 让 045 (zh-Hant) session 重 reset 一次回 zh 简体
      if (sessionStorage.getItem('nutri_lang_reset_done_v047') === '1') return;
      const role = localStorage.getItem('nutri_role');
      if (role === 'helper') return;
      // TICKET-047 默认 reset 到 zh 简体 (老板 14:11 第 4 次 flip 锁定简体).
      // 045 自动 sticky 到 zh-Hant 的用户也 catch — 045 ship 短窗口没人手动选繁体,
      // 大概率是 defaultForRole 自动给的 zh-Hant. HK 用户后续在 LanguageSwitcher 主
      // 动选 zh-Hant 仍可 (047 reset 1 次后 sentinel _v047 锁定).
      if (language === 'en' || language === 'tl' || language === 'id' || language === 'zh-Hant') {
        setLanguage('zh');
      }
      sessionStorage.setItem('nutri_lang_reset_done_v047', '1');
    } catch { /* private mode — non-critical */ }
    // mount-once: 用户在 session 内切回 EN 不被反复覆盖.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Pull cloud-saved favorites into the local cache on boot. Anonymous
    // users (no userId yet) get a no-op; once they finish QuickSetup the
    // anon userId triggers a sync on the next event tick.
    syncFavoritesFromCloud().catch(() => {/* offline-tolerant */});

    // §A (TICKET-036 Smell 2) — DB → localStorage profile 同步：跨设备登录
    // 时把 user_profiles 的 hometown_cuisine / dietary_goal / taste_pref 拉
    // 进 localStorage，让 UI 显示与算法读到的 profile 一致。anon / network
    // 失败静默吞掉，不阻塞启动。
    syncProfileFromDB(getUserId()).catch(() => {/* offline-tolerant */});

    // Only sync IN — i.e. if a real Supabase OAuth session ever materializes
    // (currently none; Facebook/Google/Apple all run through Login's dev
    // fallback path). We do not clear localStorage on SIGNED_OUT because
    // for custom-auth users that key is the only handle on identity.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userId', session.user.id);
        localStorage.setItem('nutri_user_id', session.user.id);
        if (event === 'SIGNED_IN') {
          window.dispatchEvent(new Event('nutri-prefs-changed'));
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
    {/* TICKET-047 §B — global offline strip; only renders when device is offline. */}
    <NetworkBanner />
    <Routes>
      {/* ── Public — no login needed ──────────────────────────────
          / 是匿名访客唯一能看到的页面（只读，无 AI 成本）。Auth 入口
          (/login /setup /onboarding) 当然也必须公开。WeChat OAuth
          callback 公开是因为这正是把用户从匿名升到 authed 的关键 step。
          /login 兼任原 /signin —— 角色（雇主/工人）通过 ?role=helper
          预选，登录按钮包含 微信 / Instagram / Facebook 三个 provider。 */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/setup" element={<QuickSetup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      {/* TICKET-042 §B — 新 onboarding (3 组图 + 2 问) SPEC §0.2 老板拍板.
          RequireAuth 防匿名访客直进; 新用户先过 /login → RootRedirect 路由到
          /onboarding-v2 (无 preference_vector + 无 quickPrefs). */}
      <Route path="/onboarding-v2" element={<RequireAuth><OnboardingV2 /></RequireAuth>} />
      <Route path="/auth/wechat/in"   element={<WeChatIn />} />
      <Route path="/auth/wechat/done" element={<WeChatCallback />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      {/* TICKET-038 REVISED — /about retired, content merged into /login.
          Redirect透传 ?ref= 给推广老链接 backward compat. */}
      <Route path="/about" element={<AboutRedirect />} />

      {/* ── Auth-gated — 所有消耗 AI token 或修改状态的功能 ──────
          匿名用户访问会被弹回 /login (helper 路径弹回 /login?role=helper)。
          这是防恶意 token 消耗的核心闸门 — Gemini Vision (扫冰箱) /
          Claude (周菜单 / 米其林 / 学校营养) / 任何 mutation 都在这一层
          之后。 */}
      <Route path="/verify"   element={<RequireAuth><VerifyIngredients /></RequireAuth>} />
      <Route path="/delivery" element={<RequireAuth><DeliveryTracking /></RequireAuth>} />
      <Route path="/prep"     element={<RequireAuth helperRole><HelperPrep /></RequireAuth>} />
      <Route path="/cook"     element={<RequireAuth helperRole><HelperCook /></RequireAuth>} />
      {/* TICKET-066 P0 — /ai-pilot 原是 mock demo (AIPilot.tsx 33-79 行硬编码假对话),
          老板拍板废弃: chat 主入口统一到 Home/Weekly 顶部 IntentInputBox.
          route 保留 backward compat (老用户 bookmark 不 404), redirect 到首页. */}
      <Route path="/ai-pilot" element={<Navigate to="/" replace />} />
      <Route path="/chat"     element={<RequireAuth><ChatAgent /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="/weekly"   element={<RequireAuth><WeeklyMenu /></RequireAuth>} />
      {/* UI 013 §C — Learner mode shows LearnerHome (cuisine browser); affiliated helpers see HelperHome (employer-linked tasks) */}
      <Route path="/helper"   element={
        <RequireAuth helperRole>
          {localStorage.getItem("nutri_helper_mode") === "learner" ? <LearnerHome /> : <HelperHome />}
        </RequireAuth>
      } />
      <Route path="/community" element={<RequireAuth><Community /></RequireAuth>} />
      {/* TICKET-044 — 菲佣社区 feed (migration 079 helper_posts/likes/comments) */}
      <Route path="/helper-community" element={<RequireAuth helperRole><HelperCommunity /></RequireAuth>} />
      {/* TICKET-036 §1 — helper settings hub (头像/国籍/口味/邀请/切换/登出) */}
      <Route path="/helper-settings" element={<RequireAuth helperRole><HelperSettings /></RequireAuth>} />
      <Route path="/banquet"  element={<RequireAuth><Banquet /></RequireAuth>} />
      <Route path="/weekend"  element={<RequireAuth><WeekendDining /></RequireAuth>} />
      <Route path="/pro/wellness"       element={<RequireAuth><ProWellness /></RequireAuth>} />
      <Route path="/pro/school-balance" element={<RequireAuth><ProSchoolBalance /></RequireAuth>} />
      <Route path="/favorites" element={<RequireAuth><Favorites /></RequireAuth>} />

      {/* TICKET-018 §D — DEV-only candidate-grid prototype. Prod build's
          import.meta.env.DEV is false → CandidateGridProto is null →
          Route is not registered, dynamic import chunk is tree-shaken. */}
      {import.meta.env.DEV && CandidateGridProto && (
        <Route path="/__proto__/candidate-grid" element={
          <Suspense fallback={<div className="p-12 text-center text-sm opacity-50">Loading proto…</div>}>
            <CandidateGridProto />
          </Suspense>
        } />
      )}
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Router>
        <AppShell />
      </Router>
    </LanguageProvider>
  );
}
