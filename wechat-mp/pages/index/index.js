const app = getApp();

// Base URL of the React web app. Must be on the 业务域名 whitelist in
// the mini program admin (mp.weixin.qq.com → 设置 → 业务域名). HTTPS
// only.
const BASE_URL = 'https://nothinkeats.com';

Page({
  data: {
    webUrl: BASE_URL,
  },

  onLoad(query) {
    // 1. Forward any scene/query parameters from the launch link into the
    //    web app — useful for promo / share links like
    //    pages/index/index?route=/weekly&ref=share-li.
    const route = query.route ? decodeURIComponent(query.route) : '';
    // 2. Append the WeChat login code so getUserId() on the React side
    //    can swap localStorage for the proper openid later (the React
    //    app reads ?wx_code= in the URL on boot).
    const wxCode = app.globalData.wxCode;
    const params = [];
    if (wxCode) params.push(`wx_code=${encodeURIComponent(wxCode)}`);
    params.push('source=wx_mp');
    const target = `${BASE_URL}${route}${route.includes('?') ? '&' : '?'}${params.join('&')}`;
    this.setData({ webUrl: target });
  },

  // <web-view> emits `bindmessage` only when the page is unloaded or
  // shared (WeChat's documented behavior, not real real-time). The
  // React app can call wx.miniProgram.postMessage from inside to drop
  // payloads here — we just log for now.
  onWebMessage(e) {
    console.log('web-view message:', e.detail);
  },

  onWebLoad(e) {
    console.log('web-view loaded:', e.detail);
  },

  onWebError(e) {
    console.error('web-view error:', e.detail);
    wx.showToast({
      title: '页面加载失败，请检查网络',
      icon: 'none',
      duration: 3000,
    });
  },

  // ── Sharing ────────────────────────────────────────────────────────
  // Per-page share message (friends + group chat).
  onShareAppMessage() {
    return {
      title: '爱吃 Aieats · 不用想，AI 帮你想今晚吃啥',
      path: '/pages/index/index',
      // imageUrl is optional; defaults to a screenshot of the current
      // page. Fill in a 5:4 share thumbnail once we have brand assets.
    };
  },

  // 朋友圈 / Moments share.
  onShareTimeline() {
    return {
      title: '爱吃 Aieats · 每周菜单 + 一键采购，HK 家庭厨房助手',
    };
  },
});
