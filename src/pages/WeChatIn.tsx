/**
 * WeChatIn — 微信网页授权 redirect_uri bouncer.
 *
 * 微信网页授权强制要求 redirect_uri 的域名 = 后台白名单的域名。我们的
 * Supabase edge function 在 *.supabase.co 域，无法加入白名单（不能上传
 * MP_verify 到 supabase.co 根目录）。所以 OAuth redirect_uri 改成
 * `https://nothinkeats.com/auth/wechat/in`，这页拿到 ?code= + ?state= 后
 * 立刻 client-side replace 到 supabase 那个 edge function — edge function
 * 处理完 302 跳回 /auth/wechat/done#userId=xxx（已存在的 callback 页）。
 *
 * 用户视角只看到一闪而过的「正在登录…」，1-2 秒内回到首页。
 */
import { useEffect } from 'react';

export default function WeChatIn() {
  useEffect(() => {
    // TICKET-114 (5/30) — 所有"弹走"路径都改去 /login?wxin=<reason> 打标,
    // 不再静默 replace('/') (那会让失败看起来像"干净登录页")。这样登录页
    // 顶部红条会显示 wxin=nocode/dup/nosupa, 一眼定位前端中转哪步断的。
    const hasUserId = () =>
      !!(localStorage.getItem('nutri_user_id') || localStorage.getItem('userId'));

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) {
      // 微信没回 code (异常) —— 已登录则回首页, 否则打标回登录页。
      window.location.replace(hasUserId() ? '/' : '/login?wxin=nocode');
      return;
    }
    // Single-shot guard: WeChat OAuth codes are single-use. If the user
    // back-navigates to this bouncer or the WeChat X5 webview re-mounts the
    // page (bfcache / pageshow), a second forward of the same code triggers
    // errcode 40163 "code been used". Track the last processed code in
    // sessionStorage.
    //   · 若此时已有 userId → 第一次转发其实成功了, 回首页。
    //   · 若仍无 userId → 第一次转发失败/被打断, 打 wxin=dup 标回登录页
    //     (让我们知道 X5 重载了中转页), 不再静默回首页掩盖失败。
    const STORE_KEY = 'wechat_oauth_processed_code';
    if (sessionStorage.getItem(STORE_KEY) === code) {
      window.location.replace(hasUserId() ? '/' : '/login?wxin=dup');
      return;
    }
    sessionStorage.setItem(STORE_KEY, code);

    const supaUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
    if (!supaUrl) {
      window.location.replace('/login?wxin=nosupa');
      return;
    }
    const target = `${supaUrl}/functions/v1/wechat-mp-callback${window.location.search}`;
    window.location.replace(target);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
      <div className="text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-white/20 border-t-[#FF5A1F] animate-spin mb-3" />
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>正在登录…</p>
      </div>
    </div>
  );
}
