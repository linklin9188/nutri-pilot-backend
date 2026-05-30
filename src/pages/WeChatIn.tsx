/**
 * WeChatIn — 微信网页授权 redirect_uri 落地页 (TICKET-114 改 fetch 模式)。
 *
 * 微信 OAuth 的 redirect_uri 必须在网页授权域名白名单 (nothinkeats.com), 而
 * 换 token 的密钥只能在 supabase edge function (*.supabase.co)。原做法是本页
 * 整页 `window.location.replace` 跳到 edge —— 但微信 X5 浏览器拦截"跳出到非
 * 业务域名"的整页跳转, 导致跳转失败 + 中转页重载 + code 重复消费 (wxin=dup,
 * 老板 2026-05-30 真测命中)。
 *
 * 改法: 本页用 fetch(edge?...&mode=json) 调 edge (XHR 不受微信业务域名整页跳
 * 转限制, 只需 edge 放行 CORS), 拿回 { ok, userId } → setUserId → SPA 内
 * navigate 回首页。全程不离开 nothinkeats.com, 无跨域整页跳转, dup / X5 吞
 * #fragment 等坑一并消除。
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setUserId } from '../lib/userId';
import { markLogin } from '../lib/userLifecycle';

interface CallbackResult {
  ok?: boolean;
  userId?: string;
  isNew?: number;
  error?: string;
}

export default function WeChatIn() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      navigate('/login?wxin=nocode', { replace: true });
      return;
    }
    const supaUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
    if (!supaUrl) {
      navigate('/login?wxin=nosupa', { replace: true });
      return;
    }

    // 幂等守卫: 同一 code 只消费一次。防 React StrictMode (dev) effect 双触发,
    // 以及极端情况下 X5 重载本页 (fetch 模式下概率极低)。第二次进来不重复
    // fetch (避免 40163 code reused); 若首次已成功 setUserId 则回首页兜底,
    // 否则交给首次 fetch 自己完成跳转。
    const STORE_KEY = 'wechat_oauth_processed_code';
    if (sessionStorage.getItem(STORE_KEY) === code) {
      const uid = localStorage.getItem('nutri_user_id') || localStorage.getItem('userId');
      if (uid) navigate('/', { replace: true });
      return;
    }
    sessionStorage.setItem(STORE_KEY, code);

    fetch(`${supaUrl}/functions/v1/wechat-mp-callback${window.location.search}&mode=json`)
      .then((r) => r.json())
      .then((data: CallbackResult) => {
        if (data.ok && data.userId) {
          localStorage.setItem('isLoggedIn', 'true');
          setUserId(data.userId);
          try {
            localStorage.setItem(
              'wechat_session',
              JSON.stringify({ userId: data.userId, at: Date.now() }),
            );
          } catch { /* quota — non-critical */ }
          markLogin();
          sessionStorage.removeItem('wechat_oauth_state');
          window.dispatchEvent(new Event('nutri-prefs-changed'));
          const role = localStorage.getItem('nutri_role');
          navigate(role === 'helper' ? '/helper' : '/', { replace: true });
        } else {
          navigate(`/login?wx_error=${encodeURIComponent(data.error || 'unknown')}`, { replace: true });
        }
      })
      .catch(() => navigate('/login?wxin=fetchfail', { replace: true }));
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
      <div className="text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-white/20 border-t-[#FF5A1F] animate-spin mb-3" />
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>正在登录…</p>
      </div>
    </div>
  );
}
