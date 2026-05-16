// 爱吃 Aieats — WeChat MP web-view shell.
// The mini program is intentionally thin: a single page that hosts
// nothinkeats.com inside a <web-view>. All business logic lives in
// the existing React app — this just gives WeChat users a native
// entry point with sharing, login, and (later) WeChat Pay hooks.

App({
  onLaunch() {
    // Capture the openid so we can later identify the user in the web
    // app via URL parameter passing. Fire-and-forget — failure is
    // non-fatal (the user just won't be auto-recognized).
    wx.login({
      success: (res) => {
        if (res.code) {
          // Stash the code for the index page to read.
          // In production we'd POST this to a Supabase edge function
          // that exchanges code → openid via WeChat API. For the
          // web-view shell we forward the openid into the URL hash
          // so the React app's getUserId() can pick it up.
          this.globalData.wxCode = res.code;
        }
      },
      fail: (err) => {
        console.warn('wx.login failed:', err);
      },
    });

    // Surface system info so the React app inside the web-view can
    // detect it's running inside WeChat MP if it cares.
    try {
      const info = wx.getSystemInfoSync();
      this.globalData.systemInfo = info;
    } catch (e) {
      console.warn('getSystemInfoSync failed:', e);
    }
  },

  globalData: {
    wxCode: null,
    systemInfo: null,
  },
});
