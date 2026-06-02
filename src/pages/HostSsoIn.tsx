/**
 * HostSsoIn — 共享登录 (SSO) 接力页, 挂 /auth/host/in。
 *
 * 主站(另一个网页产品)点"爱吃"栏目时, 用共享密钥给当前用户签一张 JWT,
 * 整页跳到 aieats.<主站>.com/auth/host/in?token=<JWT>[&return=<主站URL>]。
 * 本页 fetch host-sso edge function 验票 → 拿回 { ok, userId } → setUserId
 * → 进 /home-v2。全程不离开爱吃域名。
 *
 * 跟微信接力页 (WeChatIn) 同款: XHR 验票(不做跨域整页跳转) + 幂等守卫 +
 * setUserId 走 SESSION sentinel + SPA 内 navigate。命门(自定义 auth)不破,
 * 只是多一条"认人入口", 与微信/匿名登录并存。
 *
 * 见 docs/INTEGRATION_host_sso.md (主站对接说明)。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUserId } from '../lib/userId';
import { markLogin } from '../lib/userLifecycle';
import { syncProfileFromDB } from '../lib/profileSync';

interface SsoResult {
  ok?: boolean;
  userId?: string;
  displayName?: string | null;
  isNew?: number;
  error?: string;
}

export default function HostSsoIn() {
  const navigate = useNavigate();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    // 主站回跳地址(可选) —— 存下来供"返回主站"用。
    const ret = params.get('return');
    if (ret) { try { localStorage.setItem('nutri_host_return', ret); } catch { /* quota */ } }

    if (!token) { setErrMsg('缺少身份票 (token)'); return; }

    const supaUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
    if (!supaUrl) { setErrMsg('配置缺失 (supabase url)'); return; }

    // 幂等守卫: 同一 token 只验一次(防 StrictMode dev 双触发 / 极端重载)。
    const STORE_KEY = 'host_sso_processed_token';
    if (sessionStorage.getItem(STORE_KEY) === token) {
      const uid = localStorage.getItem('userId') || localStorage.getItem('nutri_user_id');
      if (uid) { navigate('/home-v2', { replace: true }); return; }
    }
    sessionStorage.setItem(STORE_KEY, token);

    fetch(`${supaUrl}/functions/v1/host-sso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then((data: SsoResult) => {
        if (data.ok && data.userId) {
          localStorage.setItem('isLoggedIn', 'true');
          setUserId(data.userId);
          try { localStorage.setItem('nutri_login_mode', 'host_sso'); } catch { /* quota */ }
          markLogin();
          syncProfileFromDB(data.userId).catch(() => {/* offline-tolerant */});
          window.dispatchEvent(new Event('nutri-prefs-changed'));
          navigate('/home-v2', { replace: true });
        } else {
          setErrMsg(`登录失败: ${data.error || 'unknown'}`);
          sessionStorage.removeItem(STORE_KEY);
        }
      })
      .catch(() => {
        setErrMsg('网络错误, 请重试');
        sessionStorage.removeItem(STORE_KEY);
      });
  }, [navigate]);

  if (errMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center px-8" style={{ background: '#FCFBF8' }}>
        <div className="text-center">
          <p className="font-bold mb-2" style={{ fontSize: 16, color: '#DC2626' }}>⚠️ {errMsg}</p>
          <p style={{ fontSize: 13, color: '#666' }}>请从主站重新进入爱吃。</p>
          <button onClick={() => navigate('/login-v2', { replace: true })}
            className="mt-5 px-5 py-2.5 rounded-xl font-bold text-white"
            style={{ background: '#FF5A1F', fontSize: 14 }}>
            去登录页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#FCFBF8' }}>
      <div className="text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-black/10 border-t-[#FF5A1F] animate-spin mb-3" />
        <p style={{ fontSize: 14, color: '#666' }}>正在登录…</p>
      </div>
    </div>
  );
}
