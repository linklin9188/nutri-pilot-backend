// WeChat OAuth helper
// AppID 填入后即可使用，AppSecret 只在 Edge Function 里用（不暴露给前端）

const WECHAT_APP_ID = import.meta.env.VITE_WECHAT_APP_ID ?? "YOUR_WECHAT_APP_ID";
const REDIRECT_URI = encodeURIComponent(`${window.location.origin}/wechat-callback`);

/**
 * 跳转到微信网页授权页（扫码登录）
 */
export function redirectToWechatOAuth() {
  const state = crypto.randomUUID();
  sessionStorage.setItem("wechat_oauth_state", state);

  const url =
    `https://open.weixin.qq.com/connect/qrconnect` +
    `?appid=${WECHAT_APP_ID}` +
    `&redirect_uri=${REDIRECT_URI}` +
    `&response_type=code` +
    `&scope=snsapi_login` +
    `&state=${state}` +
    `#wechat_redirect`;

  window.location.href = url;
}
