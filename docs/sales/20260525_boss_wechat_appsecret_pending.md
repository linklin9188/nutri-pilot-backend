# 老板待办 — 微信分享卡修复 (TICKET-087 老板真测 #26)

> 工单 TELEPOT-20260525-087 P0. 老板真测: 微信内转发 nothinkeats.com → 只显示纯链接没卡片.
> CEO 已修代码层 (诊断日志强化, src/hooks/useWeChatShare.ts), 现在需要老板配 4 件 + 1 个真测姿势确认.

---

## 关键认知 (老板先看)

微信卡片 = **不是 OG meta 自动抓取** (那是 WhatsApp / FB 的做法). 微信只认 **JSSDK 主动注入** —
必须在用户**微信浏览器里打开网页 → 右上角"…"按钮 → 分享给朋友/朋友圈** 这一条路径
才会显示富卡片. 微信外复制链接粘贴到聊天框, 微信**永远只显示纯链接** (无解, 这是腾讯故意的).

**第一件事**: 请老板确认真测姿势:
- ✅ 正确: 在微信里点链接打开 nothinkeats.com → 右上角 ··· → 分享给朋友
- ❌ 错误: 复制 https://nothinkeats.com 粘贴到聊天框发送 (这种永远没卡片, 不是 bug)

如果老板真测 #26 是第二种姿势, 那不是 bug, 是微信机制. 下面 4 件可以做但不解决"复制粘贴显示卡片"
(那个无解, 只能靠"小程序卡"或"截图朋友圈"绕开 — 见 docs/WECHAT_OG_CARD.md §4).

如果老板真测姿势是第一种 (微信内 ··· 分享), 那继续下面 4 件待办.

---

## 待办 4 件 (按优先级排)

### 第 1 件 — 确认 Railway env vars (CEO 自己也要查, 老板配合)

server.js line 390-391 直接读 `process.env.WECHAT_APPID` + `process.env.WECHAT_APPSECRET`.
如果 Railway 上没配这两个, signature endpoint 直接报 errcode 5xx, 真测 DevTools console
会看到 `[wx-jssdk] signature endpoint failed 500 ...`.

**老板配合做**: 进 Railway dashboard → nutri-pilot 服务 → Variables tab → 找:
- `WECHAT_APPID` = `wx60f6708a777dc896` (公众号 AppID, 已知)
- `WECHAT_APPSECRET` = (32 位密码, 老板必须从公众号后台拿)

**如果 WECHAT_APPSECRET 没配** → 老板做下面这一步:

1. 浏览器开 https://mp.weixin.qq.com 登录公众号
2. 左侧菜单 → **设置与开发** → **基本配置**
3. 找 "AppSecret(应用密钥)" → 点 **重置** 按钮 (会发模板消息到老板手机微信确认)
4. 拿到 32 位字符串 (像 `feb4ff6088715f32af6b91df9429dfdc`) — **只显示一次, 截图保存**
5. 把这 32 位字符串发给 CEO, CEO 跑:
   ```
   railway variables set WECHAT_APPSECRET=<32位字符串> --service nutri-pilot
   railway up --service nutri-pilot
   ```
   或在 Railway dashboard 手动加 Variable → 重新部署

⚠️ **AppSecret 重置后旧的失效** — 公众号 IP 白名单 / Supabase secrets 里旧 AppSecret 同步要换.
   CEO 注意 Supabase 那条 (`supabase secrets set WECHAT_APPSECRET=新值`) 也要一起换, 否则
   两边不一致会乱.

---

### 第 2 件 — Railway 出口 IP 加进公众号 IP 白名单

`/api/wechat-jssdk-signature` 调用微信 `api.weixin.qq.com/cgi-bin/token` 拿 access_token,
微信要求源 IP 必须在公众号 IP 白名单里. 否则报 `errcode 40164 invalid ip`.

**老板做**:
1. CEO 跑 `curl https://nothinkeats.com/api/_egress-ip` 拿到当前 Railway 出口 IP (像 `52.xx.xx.xx`)
2. CEO 把 IP 发给老板
3. 老板进 mp.weixin.qq.com → **设置与开发** → **基本配置** → "IP 白名单" → 点 **修改** →
   加入这个 IP → 保存
4. 已加的 IP (像 `18.144.156.191` Supabase pool 旧值) 可以保留, 也可以删

⚠️ **Railway 出口 IP 漂移问题**: 免费版 Railway IP 不固定, 隔几天会换. 长期解需要
   Railway Reserved Static IP (付费 ~USD$5/月). 短期老板可以接受每 1-2 周换一次 IP 重配.

---

### 第 3 件 — 公众号 3 个域名白名单 (这步最容易卡)

JS 接口安全域名 / 业务域名 / 网页授权域名都要配 `nothinkeats.com`. 否则:
- JS 接口安全域名缺 → `wx.config` 直接报 `invalid signature` 或 `invalid url domain`
- 业务域名缺 → 微信浏览器打开 nothinkeats.com 会有"非业务域名"警告条
- 网页授权域名缺 → 老板已配 (登录用), 这条应该 OK

**老板做**:
1. 进 mp.weixin.qq.com → **设置与开发** → **公众号设置** → **功能设置** tab
2. 看 3 行: "业务域名" / "JS 接口安全域名" / "网页授权域名"
3. 每一行右边 "设置" 按钮 → 输入 `nothinkeats.com` (不加 https://, 不加 /)
4. 微信要求下载一个验证文件 (像 `MP_verify_jPyA3XK7xlP6zyMZ.txt`) →
   **public/ 目录里 CEO 已放过 2 个验证文件** (MP_verify_jPyA3XK7xlP6zyMZ.txt + MP_verify_v1wuq1cmNL.txt),
   如果微信要求新的, 老板把新文件名+内容发给 CEO, CEO 一棒派 UI 5 分钟放好 + redeploy
5. 等 redeploy 完, 回微信后台点 "**确定**" 让微信扫描确认 → 显示绿勾就成

---

### 第 4 件 — 公众号认证状态 (老板已确认 ✅)

公众号 wx60f6708a777dc896 老板已认证 (年费 ¥300, 一年一交). JSSDK 功能要求"已认证"
的服务号或订阅号. 老板已 ack 这条, 跳过.

---

## 真测验证流程 (4 件全配完后)

1. 老板用手机微信打开 https://nothinkeats.com (微信里点链接, 不是浏览器)
2. 右上角 "···" → "分享给朋友" → 选一个测试群 / 自己小号
3. 看预览卡: 应该有
   - 标题: "爱吃 Aieats · 妈妈们的智能菜单"
   - 副标: "每一餐，都是给家人的惦记～"
   - 缩略图: og-image.png (绿叶 hero)
4. 如果还是纯链接没卡片 → 在微信浏览器里启用 **vConsole** (微信开发者工具), 看 console 报错:
   - `signature endpoint failed 500` → 第 1 件没做
   - `errcode 40164 invalid ip` → 第 2 件没做
   - `wx.config rejected invalid signature` → 第 3 件 (JS 接口安全域名) 没做
   - 全无报错但还是没卡片 → 老板真测姿势是"复制粘贴"不是"··· 分享" (关键认知段)

---

## CEO 已修的代码层 (老板不用动, 仅记录)

- `src/hooks/useWeChatShare.ts`: 把所有 silent warn 改成 `console.error` + 补 fail 回调
  日志, 这样老板真测时 vConsole 能精准定位是哪一步炸的. 不动 fetch URL (保留 Railway
  路径, 因为 Supabase edge fn 出口 IP 漂移更严重, 不是优化方向).

---

## 不在本工单范围 (后续 backlog)

- Railway Reserved Static IP 上线 (~USD$5/月, 老板拍板付钱后做)
- beta-readiness-check edge fn 加 `wechat_jssdk_signature_alive` 监控 (cron 每日自动跑 1 次)
- 微信小程序 wechat-mp/ 上线 (替代 H5 路径, 用户直接小程序卡转发 — 比 JSSDK 更彻底)

---

最后更新: 2026-05-25 (CEO TICKET TELEPOT-20260525-087 P0 实查 + 修)
