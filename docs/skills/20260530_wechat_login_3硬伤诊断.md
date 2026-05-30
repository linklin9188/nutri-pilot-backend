# 微信登录连不上 — 三个独立硬伤完整诊断 (2026-05-30)

老板反馈"微信里点登录跳回登录页, Safari 能成功"。端到端挖到三个**独立**根因,
任何一个单独都能让登录失败。按严重度排序。

## 硬伤 1 — AppID 三处对不上号 (主因, 致命)

实测三个地方用了**三个不同的微信 AppID**:

| 位置 | AppID | 怎么测出来的 |
|---|---|---|
| 前端 bundle (用户 OAuth 实际用的) | `wx3c66070bbe747b92` | `curl 线上 /assets/index-*.js \| grep -oE 'wx[0-9a-f]{16}'` |
| Supabase secret `WECHAT_APPID` (后台换 token 用的) | `wx63839880f1595f07` | edge function `?diag=1` 回显 |
| CLAUDE.md / 旧 memory 记录 | `wx60f6708a777dc896` | 文档 |

**为什么这是致命的**: 微信 OAuth 流程是
1. 前端用 appid=`wx3c66...` 跳微信授权 → 微信发一个**只对 wx3c66 有效的 code**
2. 后台 edge function 拿这个 code + appid=`wx63...` + wx63 的 secret 去换 token
3. 微信发现"code 是发给 wx3c66 的, 你却用 wx63 来换" → errcode 40029/40163 → 失败

就像用 A 公司的钥匙开门, 系统拿 B 公司的锁芯验, 必然开不了。

**修法**: 前后端必须统一成**同一个**公众号 AppID。已知 `wx63839880f1595f07` 的
appid+secret 是有效配对 (cgi-bin 测返 40164 = 过了 appid/secret 校验只卡 IP),
所以**前端应对齐到 wx63839880f1595f07** (改 VITE_WECHAT_APPID 或硬编码)。
但前提是 wx63 这个号的"网页授权域名"配了 nothinkeats.com — **只有老板能在
mp.weixin.qq.com 确认**。

## 硬伤 2 — 微信 IP 白名单, 出口 IP 疯狂漂移

cgi-bin/token 测试连返 40164, **几秒内换了 3 个出口 IP**:
`18.219.192.23` → `3.143.249.171` → `3.138.118.93`。

Supabase edge function 出口 IP 池极大且每次调用都换, **靠"加 IP"永远追不上**
(比 5/26 记录的 Railway 漂移更夸张)。5/26 skill 说"Supabase Frankfurt 相对稳定"
**已被证伪** — 实测狂漂。

**治本**: 把微信 API 调用挪到**有固定出口 IP**的地方, 白名单加一次永久有效:
- Railway 静态出口 IP add-on ($5/月) ← 最省事, app 已在 Railway
- 或自建固定 IP 代理 (VPS / 云函数 reserved IP)

## 硬伤 3 — Railway 没在部署本会话的任何改动

本会话 6 次 push 后, 线上前端 bundle 仍是旧版 (appid 还是 wx3c66...,
`/api/wechat/diag` 这个我新加的 server.js 端点返回 HTML = 路由不存在)。
说明 **Railway 自动部署没生效** (可能: 自动部署断连 / 构建失败 / 欠费 / 盯错分支)。

**后果**: 今天所有前端修复 (query param 防微信吞 hash、错误码显示、UI 改动)
+ 新的 server.js 微信端点, **全都没上线**。这也解释了为什么老板测时
"屏幕没有任何错误文字" — 错误显示代码根本没部署。

**需要**: Railway dashboard 排查 (老板) 或 RAILWAY_TOKEN (我用 CLI 自查自部署)。

## 诊断工具 (已落地, 复用)

1. **Supabase edge 自检**: `curl '<supabase>/functions/v1/wechat-mp-callback?diag=1'`
   → 回 appid / secret 长度 / cgi-bin 裁决 (含真实出口 IP)
2. **Railway server 自检** (待部署): `curl 'https://nothinkeats.com/api/wechat/diag'`
   → 回 railway_egress_ip + env 齐不齐
3. **前端真实 appid**: `curl 线上 / | grep index-*.js`, 下载 bundle `grep -oE 'wx[0-9a-f]{16}'`

## 标准 (今后不变量)

1. 微信集成必须**前后端 appid 同源** — 改一处必同步另一处, 像 Stripe price ID 双写。
2. 任何"出口 IP 白名单"第三方, **不要部在浮动 IP 的 PaaS 函数上** — 要么静态 IP, 要么固定代理。
3. 排查微信问题**先验证部署是否真上线** (查 bundle hash / 自检端点), 别在没部署的代码上 debug。
