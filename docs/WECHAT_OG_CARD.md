# 微信卡片预览不显示问题 backlog

> 老板 2026-05-23 ~20:50 报：WhatsApp 能看到 OG 富卡片，微信看不到只显示链接。

---

## §1 问题现状

老板发推广卡截图：
- **WhatsApp**：✅ 链接预览富卡片 = OG meta 抓取成功，显示 hero "妈妈们的智能菜单" + 副标 + 绿叶图 + β·2026 立夏标签 + nothinkeats.com domain。
- **微信**：❌ 仅显示纯链接 `https://nothinkeats.com/about?ref=friend` 蓝色 + 一段绿色背景文案。**OG meta 没被微信抓取**。

---

## §2 根因

微信对 Open Graph (OG) meta 不友好（不像 Twitter/Facebook/WhatsApp 标准）。微信富卡片预览需要 **WeChat JSSDK** 集成 + `wx.config()` + `wx.updateAppMessageShareData()` 在用户**微信内分享**时调用。

老板的截图场景：**微信外（手机其他 app）复制链接 → 粘贴到微信聊天 → 发送** = 微信不抓 OG，只渲染纯链接。

要让微信显示富卡片，需要：
1. **方案 A**：用户在微信小程序 / 公众号 H5 内 webview 打开 → 调 wx.updateAppMessageShareData 设置分享标题/图/desc → 用户在微信内点"…"分享 → 富卡片
2. **方案 B**：用户直接复制纯链接发给微信好友 → 微信不抓 OG（**老板当前场景，无解**）

WhatsApp 卡片 ≠ 微信卡片机制本质不同：
- WhatsApp 走标准 OG → 任何 HTTPS 站点 OG meta 都能抓
- 微信走 JSSDK → 必须在微信 webview 内 + 配置 JSSDK signature

---

## §3 实施需要的事（涉及多部门 + 老板桌面）

### 前置：老板做 (1-2 工作日)
1. 微信公众号后台 → 加 JS 接口安全域名 `nothinkeats.com`
2. 微信公众号后台 → 拿 AppID + AppSecret 给 CEO
3. 微信公众号认证（如未认证）

### Backend Lead 做 (~2-3 小时)
1. Supabase edge function `wechat-signature` 或 Railway server.js endpoint
2. 实现 `wx.config` signature 算法（jsapi_ticket / nonceStr / timestamp / sha1）
3. 处理 access_token / jsapi_ticket 缓存（2h 有效期）
4. memory `project_wechat_jssdk_railway_migration` 已 flag — 出口 IP 漂移问题 → 迁 Railway Reserved IP

### UI Lead 做 (~1-2 小时)
1. wechat-mp/ 已 scaffold 完整（onShareAppMessage + onShareTimeline hook 已有）
2. About.tsx + Home.tsx 检测 `navigator.userAgent.includes('MicroMessenger')` → 加载 JSSDK
3. 调用 wx.updateAppMessageShareData / wx.updateTimelineShareData 注入真品牌 hero + 图 + desc

### 验证
1. 老板手机微信打开 nothinkeats.com/about?ref=demo
2. 右上角"..."→ 分享给朋友 / 朋友圈
3. 朋友看到富卡片：标题 "妈妈们的智能菜单" + Q0 真图 + desc "节气应季 / 校园菜谱 / 营养呵护"

---

## §4 短期 workaround（无 JSSDK 时如何让微信好友看到品牌）

CEO 推 4 方案：
1. **配图发送**：老板复制 §3 文案 + **手动附 q0_couple_2kids.jpg** 图（present_files 已下载到老板电脑/手机相册）→ 微信好友看到文+图。
2. **二维码图卡**：用第三方工具生成"小程序码" / "公众号二维码"图，扫码进 H5。
3. **截图朋友圈**：老板自己访问 https://nothinkeats.com/about → 截图 hero section → 发朋友圈 + 文案 + 链接（绕开 OG）。
4. **微信小程序上线**：wechat-mp/ scaffold 已写好，只缺老板做"业务域名 white-list + MP_verify_*.txt host + 服务器域名 white-list"3 步（详 wechat-mp/README.md）。上线后用户直接 wechat 小程序入口，老板分享小程序卡（微信原生富卡）— 比 H5 + JSSDK 更彻底。

短期推 **方案 1** 老板手动附图（5 分钟）+ 方案 3 截图朋友圈（10 分钟）。中期推 **方案 4** 小程序上线（老板桌面 3 步配置）。

---

## §5 派单顺序（老板拍板后）

老板任何时候回 "搞微信卡" → CEO 自决：
- **小活路径**：老板桌面跑 3 步配置 wechat-mp 上线 → 派 UI 035 wechat-mp share hook 验证
- **大活路径**：JSSDK 集成 → 派 Backend 025 wx.config signature + UI 036 检测微信 UA + JSSDK 加载

CEO 建议 **小活路径**（小程序上线门槛低 + 不需 JSSDK 复杂度），但要老板做 wechat-mp/ README §部署 那 3 步。

---

最后更新：2026-05-23 HKT ~21:00 (sandbox bash 实测)
