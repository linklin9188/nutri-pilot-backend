/**
 * WeChatCallback — receives the redirect from wechat-mp-callback edge fn.
 *
 * URL shape: /auth/wechat/done#userId=<uuid>&isNew=<0|1>
 * Hash is used (not query) so userId never leaks into server logs.
 *
 * On mount: read hash → setUserId + isLoggedIn → navigate to /setup (new)
 * or / (returning).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUserId } from '../lib/userId';
import { markLogin } from '../lib/userLifecycle';

export default function WeChatCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const userId = params.get('userId');
    const isNew  = params.get('isNew') === '1';

    if (!userId) {
      setError('登录回调缺少用户标识，请回到登录页重试。');
      return;
    }

    localStorage.setItem('isLoggedIn', 'true');
    setUserId(userId);
    // Record first-login timestamp (idempotent — only writes the very
    // first time per device) and flag this session as "new user" so Home
    // skips the weekend-dining surface on first impression.
    markLogin();
    // Clear the WeChat oauth state (anti-CSRF cookie used by launchWeChat).
    sessionStorage.removeItem('wechat_oauth_state');
    // Tell any listening hooks that prefs / identity changed.
    window.dispatchEvent(new Event('nutri-prefs-changed'));

    // New user → onboarding entry depends on role. Helper has its own
    // task-card landing (/helper) and skips the QuickSetup taste profile
    // (those questions are for the family, not the 阿姨). Returning users
    // always go /, then RootRedirect routes helpers to /helper.
    const role = localStorage.getItem('nutri_role');
    const newUserDest = role === 'helper' ? '/helper' : '/setup';
    navigate(isNew ? newUserDest : '/', { replace: true });
  }, [navigate]);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0a', color: 'white',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 32, textAlign: 'center',
      }}>
        <p style={{ fontSize: 18, color: '#FF5A1F', marginBottom: 12 }}>登录失败</p>
        <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 14 }}>{error}</p>
        <button onClick={() => navigate('/login', { replace: true })}
          style={{
            background: '#FF5A1F', color: 'white', padding: '10px 24px',
            borderRadius: 12, fontSize: 14, border: 'none',
          }}>返回登录</button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <p style={{ opacity: 0.7, fontSize: 14 }}>正在完成微信登录…</p>
    </div>
  );
}
