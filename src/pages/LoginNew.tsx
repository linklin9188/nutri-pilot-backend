/**
 * LoginNew — 登录首页 (Warm Hearth 大改版, 老板 6/1 "登录页不需要 onboarding 流程, 只保留登录首页")
 *
 * 全新独立页, 挂 /login-v2。旧 Login.tsx 原封不动, 老板最后挑用哪个。
 *
 * 跟旧 Login 的区别 (老板拍板):
 *   - **去掉 onboarding 流程**: 登录成功后直接进新首页 /home-v2, 不再跳 /onboarding-v2 问卷。
 *   - **只保留登录首页**: 一屏搞定 — 角色(雇主/菲佣) + 登录方式, 不做多步引导。
 *
 * 保留 (认证命门, 不能丢):
 *   - 自定义 auth: setUserId() 写 userId + SESSION sentinel (不能直接写 LS, 否则 App 启动 IIFE 清掉踢回登录)。
 *   - 微信登录 (公众号网页授权, AppID 硬钉 wx3c66070bbe747b92, 前后端同源)。
 *   - 菲佣邀请码登录 (households 查 → upsert user_profiles + household_members → /helper)。
 *   - 匿名"先看看" (HK 无微信用户 0 摩擦入口)。
 *   - markLogin() / syncProfileFromDB() / nutri-prefs-changed 事件。
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage, type Language } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabase';
import { markLogin } from '../lib/userLifecycle';
import { syncProfileFromDB } from '../lib/profileSync';
import { getUserId, setUserId } from '../lib/userId';

const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

type Role = 'employer' | 'helper';

// 微信公众号网页授权 — AppID 硬钉 (老板 5/30 拍板权威号, 前后端必须同源)。
const WECHAT_APPID = 'wx3c66070bbe747b92';
function launchWeChat(): { triggered: boolean; reason?: string } {
  const isWeChatBrowser = /MicroMessenger/i.test(navigator.userAgent);
  if (!isWeChatBrowser) return { triggered: false, reason: '请在微信里打开 nothinkeats.com 后再点「微信登录」。' };
  const redirect = encodeURIComponent(`${window.location.origin}/auth/wechat/in`);
  const state = crypto.randomUUID();
  sessionStorage.setItem('wechat_oauth_state', state);
  const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APPID}&redirect_uri=${redirect}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  window.location.href = url;
  return { triggered: true };
}

// 桌面/匿名 fallback 身份 — 走 setUserId() 写 SESSION sentinel, 否则启动被清。
function devTestLogin(role: Role, providerLabel: string) {
  const key = `nutri_uid_${role}_${providerLabel}`;
  let userId = localStorage.getItem(key);
  if (!userId) { userId = crypto.randomUUID(); localStorage.setItem(key, userId); }
  localStorage.setItem('isLoggedIn', 'true');
  setUserId(userId);
  localStorage.setItem('nutri_role', role);
  markLogin();
  syncProfileFromDB(userId).catch(() => {});
  window.dispatchEvent(new Event('nutri-prefs-changed'));
}

export default function LoginNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language, setLanguage } = useLanguage();

  // ?role=helper / ?invite=XXX → 预选菲佣
  const urlRole: Role = (searchParams.get('role') === 'helper' || searchParams.get('invite')) ? 'helper' : 'employer';
  const [role, setRole] = useState<Role>(() => {
    const saved = localStorage.getItem('nutri_role');
    return (saved === 'employer' || saved === 'helper') ? saved : urlRole;
  });

  const [inviteCode, setInviteCode] = useState(() => (searchParams.get('invite') ?? '').toUpperCase());
  const [inviteNick, setInviteNick] = useState('');
  const [inviteErr, setInviteErr] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [error, setError] = useState('');

  // ★ 去 onboarding: 雇主登录后直接进新首页, 不走问卷。菲佣进 /helper。
  const goAfterLogin = (r: Role) => {
    navigate(r === 'helper' ? '/helper' : '/home-v2');
  };

  const handleWeChat = () => {
    setError('');
    const res = launchWeChat();
    if (!res.triggered) {
      // 非微信浏览器 (桌面测试): 走 dev fallback 立即进首页。
      if (!/MicroMessenger/i.test(navigator.userAgent)) {
        devTestLogin(role, 'wechat');
        goAfterLogin(role);
        return;
      }
      setError(res.reason ?? '微信登录失败');
    }
  };

  const handleAnonymousPreview = () => {
    setError('');
    devTestLogin(role, 'anonymous_preview');
    try { localStorage.setItem('nutri_login_mode', 'anonymous_preview'); } catch {}
    goAfterLogin(role);
  };

  // 菲佣邀请码登录 — households 查 → upsert user_profiles + household_members → /helper。
  const submitInviteCode = async () => {
    setInviteErr('');
    const code = inviteCode.trim().toUpperCase();
    const nick = inviteNick.trim();
    if (!code) { setInviteErr(t('Please enter the invite code', '请输入邀请码')); return; }
    if (!nick) { setInviteErr(t('Please enter your name', '请填写你的名字')); return; }
    setInviteBusy(true);
    try {
      const { data: hh, error: hhErr } = await supabase
        .from('households').select('id, employer_id').eq('invite_code', code).maybeSingle();
      if (hhErr || !hh) {
        setInviteErr(t('Wrong invite code, ask your employer to resend.', '邀请码不对，请联系雇主重发'));
        setInviteBusy(false);
        return;
      }
      let helperId = getUserId();
      if (!helperId) { helperId = crypto.randomUUID(); setUserId(helperId); }
      await supabase.from('user_profiles').upsert({ id: helperId, display_name: nick }, { onConflict: 'id' });
      await supabase.from('household_members').upsert(
        { household_id: hh.id, helper_id: helperId, status: 'active' },
        { onConflict: 'household_id,helper_id' },
      );
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('nutri_role', 'helper');
      // 菲佣端默认英文 (UI 不显中文)
      try { localStorage.setItem('appLanguage', 'en'); } catch {}
      setLanguage('en' as Language);
      markLogin();
      window.dispatchEvent(new Event('nutri-prefs-changed'));
      navigate('/helper');
    } catch (e: any) {
      setInviteErr(e?.message ?? t('Submit failed, please retry', '提交失败，请重试'));
      setInviteBusy(false);
    }
  };

  const zh = language === 'zh' || language === 'zh-Hant';

  return (
    <div className="min-h-screen max-w-md mx-auto flex flex-col" style={{ background: CREAM, color: INK }}>
      {/* Hero */}
      <div className="px-6 pt-16 pb-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="flex items-center justify-center rounded-2xl" style={{ width: 48, height: 48, background: BRAND }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 28 }}>restaurant</span>
          </div>
          <div>
            <p className="font-black" style={{ fontSize: 20, lineHeight: 1 }}>{zh ? '爱吃' : 'Aieats'}</p>
            <p style={{ fontSize: 12, color: SUB, marginTop: 2 }}>nothinkeats.com</p>
          </div>
        </div>
        <h1 className="font-black" style={{ fontSize: 30, lineHeight: 1.15 }}>
          {role === 'employer'
            ? <>{t('家人吃啥，', 'Family meals,')}<br /><span style={{ color: BRAND }}>{t('我来惦记', 'we plan them')}</span></>
            : <>{t('Welcome,', 'Welcome,')}<br /><span style={{ color: BRAND }}>{t('let’s cook together', 'let’s cook together')}</span></>}
        </h1>
        <p className="mt-3" style={{ fontSize: 14, color: SUB, lineHeight: 1.6 }}>
          {role === 'employer'
            ? t('按节气推应季菜 · 真人验证做法 · 一步采购', 'Seasonal menus · verified recipes · one-tap shopping')
            : t('See today’s dishes and step-by-step cooking guides.', 'See today’s dishes and step-by-step cooking guides.')}
        </p>
      </div>

      {/* 角色切换 */}
      <div className="px-6 mb-6">
        <div className="inline-flex p-1 rounded-2xl gap-0.5 w-full" style={{ background: 'rgba(0,0,0,0.05)' }}>
          {([['employer', t('我是雇主', 'Employer')], ['helper', t('我是阿姨', 'Helper')]] as const).map(([k, label]) => {
            const on = role === k;
            return (
              <button key={k} onClick={() => { setRole(k as Role); localStorage.setItem('nutri_role', k); }}
                className="flex-1 py-2.5 rounded-xl font-bold transition-all active:scale-95"
                style={{ fontSize: 14, background: on ? '#FFFFFF' : 'transparent', color: on ? INK : SUB, boxShadow: on ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 登录方式 */}
      <div className="px-6 flex-1">
        {error && (
          <div className="mb-4 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
            <p style={{ fontSize: 13, color: '#DC2626' }}>{error}</p>
          </div>
        )}

        {role === 'employer' ? (
          <div className="space-y-3">
            {/* 微信登录 */}
            <button onClick={handleWeChat}
              className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-bold text-white active:scale-[0.98] transition-transform"
              style={{ height: 54, background: '#07C160', fontSize: 16 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>chat</span>
              {t('微信登录', 'WeChat Login')}
            </button>
            {/* 匿名先看看 */}
            <button onClick={handleAnonymousPreview}
              className="w-full flex items-center justify-center gap-2 rounded-2xl font-bold active:scale-[0.98] transition-transform"
              style={{ height: 54, background: '#FFFFFF', color: INK, fontSize: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: BRAND }}>visibility</span>
              {t('先看看（免登录）', 'Just browse')}
            </button>
            <p className="text-center" style={{ fontSize: 12, color: SUB, marginTop: 8 }}>
              {t('登录后直接进首页，无需填问卷', 'Straight to home, no questionnaire')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl p-4" style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <p className="font-bold mb-3" style={{ fontSize: 15 }}>{t('Enter your invite code', '输入邀请码')}</p>
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder={t('Invite code', '邀请码')}
                className="w-full rounded-xl px-3.5 mb-2.5 outline-none tracking-widest font-bold"
                style={{ height: 48, background: ALT, fontSize: 16, letterSpacing: '0.1em' }} />
              <input value={inviteNick} onChange={e => setInviteNick(e.target.value)}
                placeholder={t('Your name', '你的名字')}
                className="w-full rounded-xl px-3.5 outline-none"
                style={{ height: 48, background: ALT, fontSize: 15 }} />
              {inviteErr && <p className="mt-2" style={{ fontSize: 13, color: '#DC2626' }}>{inviteErr}</p>}
              <button onClick={submitInviteCode} disabled={inviteBusy}
                className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl font-bold text-white active:scale-[0.98] disabled:opacity-60"
                style={{ height: 50, background: BRAND, fontSize: 15 }}>
                {inviteBusy ? '…' : t('Join household', '加入家庭')}
              </button>
            </div>
            <p className="text-center" style={{ fontSize: 12.5, color: SUB }}>
              {t('Ask your employer for the invite code.', '问雇主要邀请码')}
            </p>
          </div>
        )}
      </div>

      {/* 底部 */}
      <div className="px-6 pb-8 pt-4">
        <p className="text-center" style={{ fontSize: 11, color: SUB }}>
          {role === 'helper'
            ? t('Free forever for helpers.', '阿姨永久免费')
            : t('登录即同意 用户协议 与 隐私政策', 'By continuing you agree to our Terms & Privacy')}
        </p>
      </div>
    </div>
  );
}
