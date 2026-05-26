# SPEC — UI 073 wx-jssdk 集成

> 等 UI 072 完工 + Backend 066 完工后派给 UI 部门。
> 老板拍板 2026-05-21 01:05 HKT。

## 目标
让微信群 / 朋友圈分享 `nothinkeats.com` 显示 hero 卡片（标题 + 描述 + 缩略图），
跟 WhatsApp / Facebook 看到的 og 卡片等价。

## 派单内容

### §A. npm install
```
npm install weixin-js-sdk @types/weixin-js-sdk
```

### §B. 新 hook `src/hooks/useWeChatShare.ts`

```ts
import { useEffect } from 'react';
import wx from 'weixin-js-sdk';
import { supabase } from '@/lib/supabaseClient';

interface ShareConfig {
  title?: string;
  desc?: string;
  link?: string;
  imgUrl?: string;
}

const DEFAULT: Required<ShareConfig> = {
  title: '妈妈们的智能菜单 · 爱吃 Aieats',
  desc:  '按节气推应季菜，学校吃过的今天不再上',
  link:  'https://nothinkeats.com/',
  imgUrl: 'https://nothinkeats.com/og-image.png',
};

export function useWeChatShare(config: ShareConfig = {}) {
  useEffect(() => {
    // 仅在微信浏览器内执行（外面 wx-jssdk 无效）
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (!isWeChat) return;

    const cfg = { ...DEFAULT, ...config };

    (async () => {
      // 1. 拿 signature
      const url = window.location.href.split('#')[0];  // 微信要求 url 不含 hash
      const { data } = await supabase.functions.invoke('wechat-jssdk-signature', {
        body: { url },
      });
      if (!data?.signature) return;

      // 2. wx.config
      wx.config({
        debug: false,
        appId: data.appId,
        timestamp: data.timestamp,
        nonceStr: data.nonceStr,
        signature: data.signature,
        jsApiList: [
          'updateAppMessageShareData',   // 分享给好友
          'updateTimelineShareData',     // 分享到朋友圈
          'onMenuShareWeibo',
        ],
      });

      // 3. wx.ready
      wx.ready(() => {
        wx.updateAppMessageShareData({
          title: cfg.title,
          desc:  cfg.desc,
          link:  cfg.link,
          imgUrl: cfg.imgUrl,
          success: () => {/* tracked */},
        });
        wx.updateTimelineShareData({
          title: cfg.title,
          link:  cfg.link,
          imgUrl: cfg.imgUrl,
          success: () => {/* tracked */},
        });
      });

      wx.error((err: any) => {
        console.warn('[wx-jssdk] config error', err);
        // 不报错 — 微信外或网络问题，silent fallback
      });
    })();
  }, [config.title, config.desc, config.link, config.imgUrl]);
}
```

### §C. 在关键页面调用

在 `App.tsx` 或 `Home.tsx` 顶部：
```ts
import { useWeChatShare } from '@/hooks/useWeChatShare';
// ...
useWeChatShare();   // 用默认配置
```

页面级定制（如 WeeklyMenu / Pricing）可以传 config：
```ts
useWeChatShare({
  title: '本周菜单 · 妈妈们的智能选择',
  desc:  '看我家这周吃啥',
  link:  'https://nothinkeats.com/weekly',
});
```

### §D. 硬性约束
- 不动 supabase/functions / migrations
- 不动算法 / hooks 签名
- SURGICAL only — 仅新增 hook + App.tsx 一行 + 可选页面级 import

## 验证

1. 在微信里打开 `https://nothinkeats.com`
2. 右上角 ··· → 分享给朋友 → 看预览卡片：
   - 应有 hero 图（og-image.png 缩略）
   - 标题：妈妈们的智能菜单 · 爱吃 Aieats
   - 描述：按节气推应季菜，学校吃过的今天不再上

## 阻塞 — 老板公众号后台动作

UI 073 ship 后**仍需老板完成**：

### 步骤 1：登录 https://mp.weixin.qq.com（用你的公众号管理员账号）

### 步骤 2：左侧菜单 → **设置** → **公众号设置** → **功能设置** tab

### 步骤 3：3 个域名配置（每个都要做）

| 配置项 | 域名填什么 | 验证方式 |
|---|---|---|
| **JS 接口安全域名** | `nothinkeats.com`（不加 https://）| 下载 MP_verify_xxx.txt 文件，放到 nothinkeats.com 根目录（CEO 把它放进 public/ 让 Railway serve）|
| **业务域名** | `nothinkeats.com` | 同样下载验证文件 |
| **网页授权域名** | `nothinkeats.com` | 同样下载验证文件（如已配跳过）|

每个配置点 "**设置**" → 输入域名 → **下载验证文件** → 把文件给 CEO → CEO 派 UI 放进 public/ → 等 Railway redeploy → 回到微信后台点 "确定" → 微信扫确认。

### 步骤 4：等 24h 微信生效（有时即时，有时要 1 小时）

⚠️ 老板提前预告：每个验证文件大概 16 字符 + .txt 后缀。下载后告诉 CEO 即可，CEO 派 UI 1 棒就放好。
