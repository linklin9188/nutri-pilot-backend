import { useEffect } from 'react';
import wx from 'weixin-js-sdk';

interface ShareConfig {
  title?: string;
  desc?: string;
  link?: string;
  imgUrl?: string;
}

const DEFAULT: Required<ShareConfig> = {
  title:  '妈妈们的智能菜单 · 爱吃 Aieats',
  desc:   '按节气推应季菜，学校吃过的今天不再上',
  link:   'https://nothinkeats.com/',
  imgUrl: 'https://nothinkeats.com/og-image.png',
};

export function useWeChatShare(config: ShareConfig = {}) {
  useEffect(() => {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (!isWeChat) return;

    const cfg = { ...DEFAULT, ...config };

    (async () => {
      try {
        const currentUrl = window.location.href.split('#')[0];
        const resp = await fetch('/api/wechat-jssdk-signature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: currentUrl }),
        });
        if (!resp.ok) {
          console.warn('[wx-jssdk] signature endpoint failed', resp.status);
          return;
        }
        const data = await resp.json();
        if (!data?.signature || data?.error) {
          console.warn('[wx-jssdk] invalid signature response', data);
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
            success: () => { /* tracked silently */ },
          });
          wx.updateTimelineShareData({
            title:  cfg.title,
            link:   cfg.link,
            imgUrl: cfg.imgUrl,
            success: () => { /* tracked silently */ },
          });
        });

        wx.error((err: any) => {
          console.warn('[wx-jssdk] config error', err);
        });
      } catch (e) {
        console.warn('[wx-jssdk] init failed', e);
      }
    })();
  }, [config.title, config.desc, config.link, config.imgUrl]);
}
