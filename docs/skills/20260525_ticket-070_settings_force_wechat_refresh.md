# TICKET-070 — Settings 加"重新获取微信资料"兜底按钮

## 问题

老板真测 #15: 前面三个 ticket (TICKET-057 callback redirect + TICKET-064 Login wx_refresh + TICKET-067 saveHelper 不污染) 一起想修复"老板 Home 顶部显示真微信昵称+头像", 但实际 Home 仍显 fallback "你好, 朋友" + 字母 U.

可能链路断点: callback `wechat-mp-callback/index.ts:172` 检测 `!existingAvatarUrl` 但老板 row 可能之前 OAuth 写过非空但失效值 / 微信 webview cache 没真跳 OAuth / 老板从历史记录进入没经过 callback. 自动链路 debug 慢, 老板等不了.

## 方法

Settings.tsx 头像卡 (line 974) 下方加一个独立的"🔄 重新获取微信头像和昵称"按钮:

- **显示条件**: `(!myDisplayName || !myAvatarUrl) && /MicroMessenger/i.test(navigator.userAgent)` — 已有完整资料的不打扰; 浏览器里没用
- **点击行为**: 不调 `launchWeChat()` (Login 内部 fn, 抽出来麻烦), 直接 inline 构造 OAuth URL (同 Login.tsx:83 模板, scope=snsapi_userinfo), `window.location.href` 跳转
- **绕开所有自动检测**: 用户手动按 → 强制走完整 OAuth → callback 用真 nickname + headimgurl 覆盖 user_profiles

位置: `src/pages/Settings.tsx:976-999` (头像卡 line 889-974 之下, 与"我的口味偏好"删除注释之上)

State 复用现有: `myDisplayName` (line 627) + `myAvatarUrl` (line 626) 已存在, 不用新加. t4 翻译沿用 `useLanguage()` 返回的 `t4(en, zh, tl, id)`.

## 标准

**今后所有"依赖自动检测"的功能都应配套"用户手动触发"兜底按钮.** 自动链路出 bug 时 (例: silent OAuth / 自动 refresh / 后台 sync), 用户无任何手段自救, 只能等开发者 debug. 配一个"再试一次"按钮:

1. 显示条件: 仅在"自动链路应该成功但结果空"时显示, 不打扰已成功用户
2. 行为: 绕开所有自动检测分支, 直接跑底层路径
3. 不动自动链路: 兜底是补丁不是替换, 自动还是要修, 但同步发兜底 ship 给用户

避免"等下个 release"的死循环 — 用户等不了, 但 dev 也 debug 需要时间, 兜底按钮是两边的缓冲层.
