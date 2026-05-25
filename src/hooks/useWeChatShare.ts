import { useEffect } from 'react';
import wx from 'weixin-js-sdk';

interface ShareConfig {
  title?: string;
  desc?: string;
  link?: string;
  imgUrl?: string;
}

const DEFAULT: Required<ShareConfig> = {
  title:  '爱吃 Aieats · 妈妈们的智能菜单',
  desc:   '每一餐，都是给家人的惦记～',
  link:   'https://nothinkeats.com/',
  imgUrl: 'https://nothinkeats.com/og-image.png',
};

export function useWeChatShare(config: ShareConfig = {}) {
  useEffect(() => {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (!isWeChat) return;

    const cfg = { ...DEFAULT, ...config };

    // TICKET-087: 老板真测 #26 "转发只链接没卡片". 把每一步 fail 都 console.error
    // 出来 (不是 silent warn), 让真测时打开 vConsole / DevTools 能定位:
    //   - signature endpoint 5xx → Railway env WECHAT_APPID/APPSECRET 没配
    //   - signature errcode 40164 → 公众号 IP 白名单缺 Railway 出口 IP
    //   - wx.error invalid signature → JS 接口安全域名未配 nothinkeats.com
    //   - 全成功但好友看到只链接 → 老板从微信外复制粘贴, JSSDK 不生效
    //     (微信只对 webview 内"…"分享走 JSSDK, 复制粘贴走 OG meta — 微信不抓)
    (async () => {
      try {
        const currentUrl = window.location.href.split('#')[0];
        const resp = await fetch('/api/wechat-jssdk-signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: currentUrl }),
        });
        if (!resp.ok) {
          const bodyText = await resp.text().catch(() => '');
          console.error('[wx-jssdk] signature endpoint failed', resp.status, bodyText);
          return;
        }
        const data = await resp.json();
        if (!data?.signature || data?.error) {
          console.error('[wx-jssdk] invalid signature response', data);
          return;
        }

        wx.config({
          debug: false,
          appId:     data.appId,
          timestamp: data.timestamp,
          nonceStr:  data.nonceStr,
          signature: data.signature,
          jsApiList: [
            'updateAppMessageShareData',
            'updateTimelineShareData',
          ],
        });

        wx.ready(() => {
          wx.updateAppMessageShareData({
            title:  cfg.title,
            desc:   cfg.desc,
            link:   cfg.link,
            imgUrl: cfg.imgUrl,
            success: () => { console.info('[wx-jssdk] app message share data set'); },
            fail:    (err: any) => { console.error('[wx-jssdk] updateAppMessageShareData fail', err); },
          });
          wx.updateTimelineShareData({
            title:  cfg.title,
            link:   cfg.link,
            imgUrl: cfg.imgUrl,
            success: () => { console.info('[wx-jssdk] timeline share data set'); },
            fail:    (err: any) => { console.error('[wx-jssdk] updateTimelineShareData fail', err); },
          });
        });

        wx.error((err: any) => {
          // 最常见: invalid signature → 公众号后台 JS 接口安全域名未配 nothinkeats.com
          // 或 url 编码不符 (microMessenger 拿 URL 含 # 后段, 必须 split 掉)
          console.error('[wx-jssdk] wx.config rejected', err);
        });
      } catch (e) {
        console.error('[wx-jssdk] init failed', e);
      }
    })();
  }, [config.title, config.desc, config.link, config.imgUrl]);
}
