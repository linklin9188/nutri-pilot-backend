# TICKET-087 微信分享卡修复 — 技能沉淀

## 1. 问题

老板真测 #26: 微信内转发 nothinkeats.com 链接 → 只显示纯链接没卡片.

初判: `useWeChatShare.ts:28` 的 `fetch('/api/wechat-jssdk-signature')` 走相对路径,
怀疑 Railway 没 proxy `/api/*` 到 Supabase edge fn → 调用 404 → JSSDK config 永远不工作.

工单建议方向: 改成 `fetch(SUPABASE_URL/functions/v1/wechat-jssdk-signature)` 直接调 Supabase.

## 2. 方法

**先不动代码, 实查 5 件证据**:

1. `ls railway.toml + nixpacks.toml + vite.config.ts`: Railway startCommand = `node server.js`
2. `grep -rn "/api/" server.js`: server.js line 427 **本身就有** `app.post('/api/wechat-jssdk-signature', ...)`,
   不是 proxy 到 Supabase, 是 Railway 进程**自己**实现 signature endpoint (Express + crypto.sha1)
3. `supabase secrets list`: WECHAT_APPID + WECHAT_APPSECRET 在 Supabase 已配 ✅
4. `supabase functions list`: wechat-jssdk-signature edge fn 也已部署 v4 ACTIVE (做 fallback)
5. `docs/SPEC_wechat_jssdk_railway_migration.md`: 明确写"Supabase edge fn 出口 IP 池随机
   AWS 18.x/54.x, 不兼容微信 MP 单 IP 白名单, 所以迁到 Railway"

**真相反转**: 工单建议方向 (回 Supabase) 是错的, **不能这么改**. 当前 Railway 路径才是
正确实现, 改回 Supabase 会触发 IP 漂移老 bug.

**正确修法**:

- 不改 fetch URL (保留 Railway 路径)
- 把 useWeChatShare 所有 `console.warn` 改成 `console.error` + 补 `updateAppMessageShareData` /
  `updateTimelineShareData` 的 `fail` 回调日志, 让老板真测时打开 vConsole 能精准定位 fail 在哪步
- 把所有"老板/CEO 必须配的事"写进 docs/sales/20260525_boss_wechat_appsecret_pending.md:
  Railway env vars / Railway 出口 IP 白名单 / 公众号 3 域名 (业务+JS安全+网页授权) /
  公众号认证状态 / 真测姿势 (微信内 ··· 分享, 不是复制粘贴)

## 3. 标准

**微信分享卡 = 5 件全齐才工作**:

1. 公众号认证 (¥300/年)
2. AppID + AppSecret 在 server-side env (Railway / Supabase 任选, Railway IP 更稳)
3. Server IP 在公众号"IP 白名单" — Railway 免费版 IP 会漂移, 需 Reserved IP 长期稳
4. 公众号"JS 接口安全域名" + "业务域名" 都配 nothinkeats.com + 验证文件放 public/
5. 用户在**微信浏览器内**打开页面 → 右上角 ··· → 分享给朋友 (复制粘贴永远没卡片, 这是微信
   故意的, 不是 bug, 无解 — 唯一绕开是小程序卡 / 截图朋友圈)

**诊断顺序** (老板真测无卡片时 vConsole 看哪条 error):
- `signature endpoint failed 5xx` → Railway env WECHAT_APPID/APPSECRET 没配
- `errcode 40164 invalid ip` → 公众号 IP 白名单缺 Railway 出口 IP
- `wx.config rejected invalid signature` → JS 接口安全域名未配
- 全无报错但还纯链接 → 真测姿势错 (复制粘贴 ≠ ··· 分享)

**反 anti-pattern**:
- 不要看到 `/api/*` 相对路径就以为是 proxy bug — 先 `grep` server.js 看是不是 Railway
  进程自己实现的 endpoint
- 不要把 wechat-jssdk-signature 从 Railway 退回 Supabase, 即使 Supabase 看上去更"标准" —
  Supabase 边缘函数出口 IP 不稳定, 跟微信单 IP 白名单天然冲突
