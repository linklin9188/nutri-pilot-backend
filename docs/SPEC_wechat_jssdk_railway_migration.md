# SPEC — 微信 JSSDK signature 迁移到 Railway server.js

> P1 计划（2026-05-21 上午执行）。Cowork CEO 已写入 memory
> `project_wechat_jssdk_railway_migration` 作为永久 backlog。

## 背景

- 2026-05-20 夜 Backend 066 交付 `wechat-jssdk-signature` Supabase edge function
- 跑出 errcode 40164 "invalid ip 18.144.156.191 not in whitelist"
- CEO 引导老板加 18.144.156.191 到公众号 IP 白名单 → 当晚通路打通
- 但 **Supabase edge function 出口 IP 池随机**，未来 IP 变化会再次触发 40164

## 目标

把微信 JSSDK signature 拉取逻辑搬到 Railway 长期运行的 server.js process，配合
Railway Reserved Static IP（付费 ~USD$5/mo）永久解决 IP 漂移。

## 实施

### Phase 1 — Backend 068（30-40 分钟）

1. `server.js` 加 Express endpoint：
   ```js
   const wechatTokenCache = { accessToken: null, jsapiTicket: null,
                              accessExpiresAt: 0, ticketExpiresAt: 0 };

   async function getAccessToken() {
     if (wechatTokenCache.accessToken && Date.now() < wechatTokenCache.accessExpiresAt)
       return wechatTokenCache.accessToken;
     const r = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`);
     const j = await r.json();
     if (j.errcode) throw new Error(`wx token errcode ${j.errcode}`);
     wechatTokenCache.accessToken = j.access_token;
     wechatTokenCache.accessExpiresAt = Date.now() + (j.expires_in - 300) * 1000;
     return j.access_token;
   }
   async function getJsapiTicket() { /* 类似，调 ticket/getticket */ }

   app.post('/api/wechat-jssdk-signature', express.json(), async (req, res) => {
     try {
       const { url } = req.body;
       if (!url || !url.startsWith('https://nothinkeats.com/')) return res.status(400).json({ error: 'invalid url' });
       const ticket = await getJsapiTicket();
       const nonceStr = crypto.randomBytes(8).toString('hex');
       const timestamp = Math.floor(Date.now() / 1000);
       const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
       const signature = crypto.createHash('sha1').update(raw).digest('hex');
       res.json({ appId: APPID, timestamp, nonceStr, signature, url });
     } catch (e) {
       res.status(500).json({ error: e.message });
     }
   });
   ```

2. 环境变量 `WECHAT_APPID` + `WECHAT_APPSECRET` 已在 Supabase secrets — 复制到 Railway env vars

3. 部署后 `curl https://nothinkeats.com/api/wechat-jssdk-signature -X POST ...` 验证

### Phase 2 — UI 074（10 分钟）

改 `src/hooks/useWeChatShare.ts`：
```ts
// 从 supabase.functions.invoke 改成同源 fetch
const r = await fetch('/api/wechat-jssdk-signature', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url }),
});
const data = await r.json();
```

优势：同源 fetch 无 CORS / 无 跨域延迟 / 不依赖 supabaseClient init。

### Phase 3 — Railway Reserved IP（5 分钟 + 付费）

1. Railway dashboard → Project Settings → Networking → Reserved IP（付费）
2. 拿到固定 IP（如 `52.xx.xx.xx`）
3. 微信公众号后台 IP 白名单 → 加入这个 IP
4. 18.144.156.191 仍保留（Supabase fallback）

### Phase 4 — 监控（β-readiness-check 扩 1 check）

`beta-readiness-check` edge function 加：
```ts
wechat_jssdk_signature_alive: {
  ok: <true if curl Railway endpoint returns valid signature>,
  ts: <timestamp of last successful sign>,
  errcode: <if any>
}
```

每日 cron 跑一次，errcode 非 0 自动 alert CEO（osascript 桌面通知）。

## 工单时机

- 今晚优先：让 Backend 067 + UI 073 跑通 Supabase 版本（已 ship）
- 明早第一棒：Backend 068 迁移到 Railway（30-40 分钟）+ UI 074（10 分钟）
- 中午前：Reserved IP 上线 + 监控

## 不动事项

- 不删 Supabase `wechat-jssdk-signature` edge function（fallback 保险）
- 不动 `wechat-mp/` 小程序（独立组件）
- 不动 `wechat-mp-callback` 网页授权 edge function
