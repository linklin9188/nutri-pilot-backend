# WhatsApp 链接预览卡片 — OG meta 双语配置 (2026-05-26)

## 1. 问题

老板把 `nothinkeats.com` 链接发到 WhatsApp 给 Inalca 供应商 Irish，希望对方看到一张
带 logo + 双语描述的预览卡片。结果一开始：

- 只显示纯链接，没卡片（OG meta 缺失或 og:image 跨域抓不到）
- 落地页是菲佣登录界面（域名首页路由没分流，跨设备体验割裂）
- 卡片描述只有中文，国际 B2B 谈判客户看不懂

而且 WhatsApp 抓取规则比 Facebook 严：og:image 必须 HTTPS + 至少 300×200 + 内容类型必须是
`image/png|jpeg`，CDN 加速过的 URL 可能 cache miss。整张卡片显示与否 = WhatsApp 缓存
的快照，第一次抓失败后会 cache 失败状态 24-48h。

## 2. 方法

**`index.html` meta 改动**（已 ship commit `0acdd23`）：

```html
<meta property="og:type" content="website" />
<meta property="og:url" content="https://nothinkeats.com/login" />
<meta property="og:title" content="Aieats · 爱吃 — AI Family Nutrition · Hong Kong" />
<meta property="og:description" content="AI weekly menu + premium ingredient sourcing for HK families. Built for helpers + employers. 香港家庭智能菜单, 一键直采." />
<meta property="og:image" content="https://nothinkeats.com/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Aieats — AI Family Nutrition Platform for Hong Kong" />
<meta property="og:locale" content="zh_HK" />
<meta property="og:locale:alternate" content="en_HK" />
<meta property="og:site_name" content="Aieats" />
```

3 个关键决定：

1. **og:url 改成具体登陆页** `/login`（不是首页 `/`），点开直接落雇主登录界面，
   避免菲佣端默认（HelperLogin）让英文谈判客户困惑。
2. **og:title + og:description 双语 EN + 中**：英文打头给国际客户看，中文后缀给 HK 本地。
   一条 description 塞双语比维护两个 URL 简单。
3. **og:locale 主 `zh_HK` + alternate `en_HK`**：双语都告诉 WhatsApp / Facebook，
   让 LinkedIn 等也能正确分流地区。

**WhatsApp 卡片真显示要点**：
- og:image 必须 HTTPS 直链，不能 `data:image/...` base64
- 至少 1200x630，最少 300x200，最好 PNG（JPEG 会被 WhatsApp 压模糊）
- 文件大小 < 5MB
- index.html 改完 deploy 后**清 WhatsApp 缓存**：
  https://developers.facebook.com/tools/debug/ 输入 URL → "Scrape Again" 强刷
  WhatsApp 用的就是 Facebook 的爬虫

**销售文案的 WhatsApp 友好版本**（`docs/sales/20260525_whatsapp_inalca_pitch.md`）：
- ASCII art 卡片在 WhatsApp **必变形**（手机字体不等宽），改用 emoji 卡片
- `*粗体*` WhatsApp 原生支持，`**` 不行
- 一条消息 < 1024 char 比较稳，超长可能被 truncate
- 不要 markdown link `[text](url)`，WhatsApp 不渲染，直接贴裸 URL

## 3. 标准

**今后所有对外链接预览的不变量**：

1. **og:url 指向意图终点**：不是首页，是用户/客户最该看到的那一页（登录 / pricing / 落地）。
2. **B2B 用英文打头，本地市场中文后缀**：单 description 双语优于双 URL 维护。
3. **og:image 必须 HTTPS 直链 + 1200×630 PNG**：CDN 加速的临时 URL 不算。
4. **改完用 Facebook Debugger 强刷一次**：WhatsApp 复用 FB 爬虫缓存，不刷一辈子显示旧的。
5. **WhatsApp 卡片复制版禁用 ASCII art**：手机字体非等宽必变形，用 emoji + `*粗体*` 替代。
6. **og 改动可独立部署**：不要捆绑算法 / 业务逻辑改动，meta 只是 HTML 头标签。
