# WeChat X5 浏览器已知 Bug 手册

**问题**: 做微信相关功能时踩了多个 WeChat X5 内置浏览器特有的坑

## 坑 1 — 302 redirect 丢掉 #fragment

**现象**: edge function 302 redirect 到 `/auth/wechat/done#userId=xxx`，WeChat 浏览器收到的 URL 变成 `/auth/wechat/done`（hash 部分被截断），导致回调页读不到 userId → 跳回登录页。Safari/Chrome 正常。

**根因**: WeChat X5 WebView 处理服务器端 302 redirect 时，不传递 Location header 里的 URL fragment。这是已知行为，不是 bug，是 Tencent 的实现选择。

**标准做法**: 凡是需要把数据从服务端 redirect 传给前端的场景，一律用 query param (`?userId=xxx`)，不用 hash (`#userId=xxx`)。前端同时读两个做兼容：
```typescript
const searchParams = new URLSearchParams(window.location.search);
const hashParams   = new URLSearchParams(window.location.hash.slice(1));
const userId = searchParams.get('userId') ?? hashParams.get('userId');
```

## 坑 2 — sessionStorage 在页面被微信缓存后可能消失

**现象**: WeChat X5 会把上一个页面缓存（特别是用户从第三方页面返回时），React 组件重新 mount，sessionStorage flag 可能消失 → 导致 double-mount guard 失效。

**标准做法**: 单次 OAuth code 消费的 guard 除了 sessionStorage，在 DB 或 localStorage 也留一道（OAuth code 本身是 single-use，WeChat server 会拒绝第二次使用，errcode 40163）。

## 坑 3 — localStorage 跨场景不共享

**现象**: 用户在 Safari 登录后（localStorage 有 userId），从微信打开同一个 URL，WeChat X5 的 localStorage 是独立的 → 没有 userId → 触发 silent auth → 失败 → 弹登录页。

**标准做法**: 这是预期行为，不是 bug。WeChat 浏览器 = 独立登录态，需要做微信 OAuth 绑定。

## 检查清单（每次做微信相关功能前过一遍）

- [ ] redirect 传数据 → 用 query param 不用 hash
- [ ] 注意页面 lifecycle：WeChat 可能缓存/恢复页面，不能假设 sessionStorage 必在
- [ ] WeChat 域名白名单：`open.weixin.qq.com/connect/oauth2/authorize` 的 redirect_uri 域名必须在公众号后台"网页授权域名"里
- [ ] AppID/AppSecret 已在 Supabase secrets：`WECHAT_APPID` + `WECHAT_APPSECRET`，直接用不要问老板
