# 爱吃 Aieats — WeChat Mini Program (web-view shell)

Tiny WeChat 小程序 that hosts `nothinkeats.com` inside a `<web-view>` so
WeChat users get a native entry without us rewriting the React app.

## 文件结构

```
wechat-mp/
├── app.js              app entry, captures wx.login code on launch
├── app.json            global pages + window config
├── app.wxss            app-wide CSS (dark background)
├── pages/index/        the only page — hosts the web-view
│   ├── index.wxml      <web-view src="..."></web-view>
│   ├── index.js        URL composition + share hooks
│   ├── index.wxss      page fills viewport
│   └── index.json      navigation style override
├── project.config.json AppID + build settings
├── sitemap.json        SEO rules (allow all)
└── README.md           this file
```

## 一次性后台配置（必做，否则 web-view 加载会 fail）

1. **登录** https://mp.weixin.qq.com（注册小程序时的微信号扫码）
2. **业务域名白名单**：左侧菜单 → 「设置」 → 「第三方设置」 →
   「业务域名」 → 「添加」
   - 添加：`nothinkeats.com`
   - 微信会让你下载一个 `MP_verify_xxxxxxxx.txt` 校验文件
   - 把文件放到 `nothinkeats.com/MP_verify_xxxxxxxx.txt` 让微信能访问
     (Railway 上可以放到 `public/` 目录)
   - 回到后台点「下载文件」按钮旁的「校验」
3. **服务器域名白名单**：同一页面的「服务器域名」section
   - request 合法域名：
     - `https://qoyuafqqkfyrqlthsvws.supabase.co`
     - `https://generativelanguage.googleapis.com`（如果以后需要小
       程序原生调 Gemini；当前 web-view 走 nothinkeats.com 后端不需要）
   - uploadFile：同上
   - downloadFile：同上 + `https://nothinkeats.com`（如果有附件下载）
4. **业务域名 + 服务器域名每月只能改 5 次** — 想好再改

## 本地开发 + 预览

1. 装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」→ 选 `wechat-mp/` 目录 → AppID 自动从 `project.config.json` 读到 `wx60f6708a777dc896`
3. 工具会自动打开 `pages/index/index` 预览
4. **iPhone 真机调试**：工具右上角「真机调试」按钮 → 扫码

⚠️ 真机调试模式下 web-view 才能访问外网（开发者工具模拟器里
受限）。

## 提审 + 上线

1. 在开发者工具右上角「上传」按钮，填版本号（e.g. `1.0.0`）+
   备注
2. 回 https://mp.weixin.qq.com → 「版本管理」 → 看到刚上传的体验版
3. 「提交审核」→ 填类目（餐饮 / 工具）+ 功能简介 + 测试账号
4. 审核 1-7 天。常见拒因：
   - web-view 加载的页面**必须明显是你的服务**（首页 logo +
     名字一致）
   - 不能含「Facebook / Google / Instagram 登录」按钮（境外服务
     在大陆小程序里被拒）
   - 必须有「服务介绍」「使用条款」「隐私协议」三个静态页（在
     nothinkeats.com 加 `/terms` `/privacy` 给审核员看）
5. 审核通过 → 同一页 → 「发布」 → 用户可在微信搜「爱吃」找到

## 后续可以做的（不阻塞当前上线）

- **微信支付**：等公众号 / 服务号认证完成后，在 web-view 里通过
  `wx.miniProgram.navigateTo` 跳一个原生支付页（小程序里 Stripe
  无效）
- **登录身份打通**：拿 `wx.login` 返回的 code → 后端换 openid →
  写入 user_profiles.wechat_openid → 用户在 web-view 内直接是登录
  状态。当前 web-view 已经在 URL 里带 `wx_code` 参数，等 Supabase
  edge function 那边补一个 `wechat-mp-callback`（已有，
  supabase/functions/wechat-mp-callback/index.ts），就能联动
- **分享卡片图**：onShareAppMessage 现在没指定 imageUrl，默认抓首屏
  截图。设计一张 5:4 的卡片图片，上传后填进 onShareAppMessage 的
  imageUrl 字段

## 上线最快路径

- D1：导入工具 + 预览 + 配业务域名白名单（30 分钟）
- D1：上传版本 + 提审（10 分钟）
- D2-D4：等微信审核
- D5：通过 → 发布 → 用户可搜索到
