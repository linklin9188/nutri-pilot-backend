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
  // TICKET-037 §B — short success splash before navigate so the user
  // actually sees "微信登录成功，欢迎回来！" instead of a blank
  // "正在完成微信登录…" → instant page swap.
  const [phase, setPhase] = useState<'loading' | 'success'>('loading');
  const [isNewUser, setIsNewUser] = useState<boolean>(false);

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
    // TICKET-037 §B — explicit wechat_session cache. Auth source-of-truth
    // remains the localStorage userId (custom-auth invariant from CLAUDE.md);
    // this extra key is purely informational so future visits can detect
    // "this device previously completed WeChat OAuth" without re-running it.
    try {
      localStorage.setItem('wechat_session', JSON.stringify({ userId, at: Date.now() }));
    } catch { /* quota — non-critical */ }
    // Record first-login timestamp (idempotent — only writes the very
    // first time per device) and flag this session as "new user" so Home
    // skips the weekend-dining surface on first impression.
    markLogin();
    // Clear the WeChat oauth state (anti-CSRF cookie used by launchWeChat).
    sessionStorage.removeItem('wechat_oauth_state');
    // Tell any listening hooks that prefs / identity changed.
    window.dispatchEvent(new Event('nutri-prefs-changed'));

    // Show success splash for ~850ms before navigating. New users still go
    // to /setup, returning users to /. Helper role keeps its own landing.
    setIsNewUser(isNew);
    setPhase('success');
    const role = localStorage.getItem('nutri_role');
    const newUserDest = role === 'helper' ? '/helper' : '/setup';
    const dest = isNew ? newUserDest : '/';
    const t = setTimeout(() => navigate(dest, { replace: true }), 850);
    return () => clearTimeout(t);
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

  if (phase === 'success') {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0a', color: 'white',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          background: 'rgba(37,211,102,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 32, color: '#25D366', lineHeight: 1 }}>✓</span>
        </div>
        <p style={{ fontSize: 17, fontWeight: 600 }}>
          {isNewUser ? '微信登录成功，开始 2 分钟设置' : '微信登录成功，欢迎回来！'}
        </p>
        <p style={{ opacity: 0.55, fontSize: 12 }}>正在跳转…</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: 'white',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12,
    }}>
      <div className="inline-block w-7 h-7 rounded-full border-2 border-white/20 border-t-[#FF5A1F] animate-spin" />
      <p style={{ opacity: 0.7, fontSize: 14 }}>微信识别中…</p>
    </div>
  );
}
