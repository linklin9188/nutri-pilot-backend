# TICKET-064 — Login 检测 wx_refresh=avatar 自动触发授权

## 问题

老板真测 #10: "微信头像还是没拿到, 即使无痕窗口."

真因不在 backend, 也不在 wechat-mp-callback edge fn:

- TICKET-057 (commit cb0ada1) 已经给 wechat-mp-callback 加了"老 row 缺
  avatar_url → 302 跳 `/login?wx_refresh=avatar`"的兜底逻辑, edge fn 这一侧 OK.
- 但接收方 `src/pages/Login.tsx` **从来没读过 wx_refresh 这个 query 参数**
  (grep 全文件 0 次出现). 跳过来之后用户看到的就是普通登录页, 必须
  自己再手动点一次"微信登录"按钮才会真的触发 snsapi_userinfo OAuth.
- 老板不知道页面在等他再点, 以为页面坏了直接退掉 → 头像永远刷不上.

UX 在 "跳到 Login" 这一步彻底断了. Backend / edge fn / silent login
都没问题, 是前端 URL 参数 contract 没对齐.

## 方法

`src/pages/Login.tsx` 新增一个 `useEffect`, 在 mount 时:

1. 读 `searchParams.get("wx_refresh")`, 等于 `"avatar"` 才往下走.
2. 检查 `/MicroMessenger/i.test(navigator.userAgent)`, 不是微信 UA 就 return
   (PC 浏览器误进时 launchWeChat 会 return triggered:false, 自动跳没意义,
   反而把 banner 卡住).
3. setWxRefreshing(true) 顶部显绿色 banner "正在重新获取微信头像..." (三语
   t() 包装), 用户能感知页面"正在干嘛".
4. 直接调 `launchWeChat()` — 它内部 `window.location.href = url` 立即跳走 OAuth
   同意页, 不需要 await.
5. 3 秒兜底 `setTimeout` 关 banner (理论上跳走后页面不再渲染, 这是边界 case 兜底).

不会无限循环的根据: snsapi_userinfo 授权回来后 callback 会把 avatar_url
写进 user_profiles, 下次 silent login 检测到 avatar_url 不为 null 就不
会再 302 跳 wx_refresh. 链路自闭合.

不动:
- wechat-mp-callback/index.ts (cb0ada1 redirect 逻辑保留)
- wechatSilentLogin.ts
- launchWeChat 函数本身
- Login 其他流程 (helper 邀请码 / role pick / FB IG / wxRecognizing overlay)

体积: vite build 主 bundle 998.19 kB / gzip 309.27 kB, 与 ticket 前同量级.

## 标准

今后任何 edge function / backend 加 query 参数 redirect 到前端路由的逻辑,
必须 verify 接收页是否真的读这个 query:

1. PR 提交前 grep 接收页对该 query name 的引用 (零引用 = 隐性 bug).
2. 接收逻辑必须给用户 visible 反馈 (banner / overlay / toast), 不要假设
   "页面会自己跳", 因为前端如果没监听 query 就什么都不会发生.
3. 自动触发跳转类逻辑必须有 UA / 平台守卫, 避免 PC 浏览器误进时
   触发不可能完成的流程 (微信 OAuth 在非微信 UA 下必然失败).
4. "无限循环风险": redirect 链必须有明确的"成功后下次不再触发"的状态写入
   (本例: avatar_url 不为 null), 在 review 时显式注释清楚.
