import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── WeChat JSSDK signature (Railway-hosted, fixed-IP) ──────────────────────
// Supabase Edge Function egress rotates IPs (54.x/18.x AWS pool), which is
// incompatible with WeChat MP's single-IP allowlist. Railway has a stable
// outbound IP, so the JSSDK signature endpoint lives here instead.

const APPID     = process.env.WECHAT_APPID     ?? '';
const APPSECRET = process.env.WECHAT_APPSECRET ?? '';

const wechatCache = {
  accessToken: null,
  accessExpiresAt: 0,
  jsapiTicket: null,
  ticketExpiresAt: 0,
};

async function getWxAccessToken() {
  if (wechatCache.accessToken && Date.now() < wechatCache.accessExpiresAt) {
    return wechatCache.accessToken;
  }
  const u = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`;
  const r = await fetch(u);
  const j = await r.json();
  if (j.errcode) throw new Error(`wx access_token errcode ${j.errcode}: ${j.errmsg}`);
  wechatCache.accessToken = j.access_token;
  wechatCache.accessExpiresAt = Date.now() + Math.max(60, j.expires_in - 300) * 1000;
  return j.access_token;
}

async function getWxJsapiTicket() {
  if (wechatCache.jsapiTicket && Date.now() < wechatCache.ticketExpiresAt) {
    return wechatCache.jsapiTicket;
  }
  const token = await getWxAccessToken();
  const u = `https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=${token}`;
  const r = await fetch(u);
  const j = await r.json();
  if (j.errcode !== 0) throw new Error(`wx jsapi_ticket errcode ${j.errcode}: ${j.errmsg}`);
  wechatCache.jsapiTicket = j.ticket;
  wechatCache.ticketExpiresAt = Date.now() + Math.max(60, j.expires_in - 300) * 1000;
  return j.ticket;
}

app.post('/api/wechat-jssdk-signature', express.json(), async (req, res) => {
  try {
    const { url } = req.body ?? {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'missing url' });
    }
    if (!url.startsWith('https://nothinkeats.com/')) {
      return res.status(400).json({ error: 'url whitelist: nothinkeats.com only' });
    }
    const ticket = await getWxJsapiTicket();
    const nonceStr = crypto.randomBytes(8).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = crypto.createHash('sha1').update(raw).digest('hex');
    res.json({ appId: APPID, timestamp, nonceStr, signature, url });
  } catch (e) {
    console.error('[wechat-jssdk-signature]', e);
    res.status(500).json({ error: e.message });
  }
});

// Debug helper — returns Railway's current egress IP so CEO can add it to
// WeChat MP IP whitelist. Safe to expose: no secrets, just shows what
// ifconfig.me sees.
app.get('/api/_egress-ip', async (_req, res) => {
  try {
    const r = await fetch('https://ifconfig.me/ip');
    const ip = (await r.text()).trim();
    res.json({ egress_ip: ip, note: 'Add to WeChat MP IP whitelist' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static assets with long cache (they are content-hashed by Vite)
app.use('/assets', express.static(path.join(__dirname, 'dist/assets'), {
  maxAge: '1y',
  immutable: true,
}));

// All other static files (favicon, manifest, etc.) — no cache
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: 0,
  etag: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// TICKET-035 §C — explicit MP_verify route as belt-and-suspenders defense.
// 微信 MP_verify files: 名 = MP_verify_<hash>.txt, 内容 = <hash> (no newline).
// 即便 dist/ 漏 copy (build cache stale / Railway deploy 滞后) 也能正确返回.
// 仅在 express.static 上方 dist/ 真有文件时此路由不触发 (static 优先匹配).
app.get('/MP_verify_:hash.txt', (req, res) => {
  res.type('text/plain').send(req.params.hash);
});
// 老板原话: 微信有时只回简化 hash.txt 无 MP_verify_ 前缀. 加 regex 防意外抢
// 其他真静态 .txt (公司 robots.txt 等), 仅匹配 8-32 char 字母数字 hash.
app.get('/:hash.txt', (req, res, next) => {
  const hash = req.params.hash;
  if (/^[a-zA-Z0-9]{8,32}$/.test(hash)) {
    return res.type('text/plain').send(hash);
  }
  next();
});

// TICKET-035 §B — SPA fallback with path-extension guard.
// 老板 22:50 报: 微信小程序后台点「校验」报"校验文件验证失败" — 实查 server
// catch-all `app.get('*')` 把所有未匹配 GET 都返回 index.html, 微信拿到 HTML
// 而非纯文本 hash → 校验 fail.
// 修复: URL 含文件扩展名 (e.g. .txt .xml .json) 且不是 /api/ → 404 (这些应该
// 由 express.static 已 serve, 走到这一步说明 dist/ 缺该文件; 404 比 HTML
// 错误内容好, 让客户端知道 file not found).
// SPA 路由 (/about /weekly /setup 等) 无扩展名 → 仍正常 sendFile index.html.
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (path.extname(req.path) && !req.path.startsWith('/api/')) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Nutri-Pilot running on http://0.0.0.0:${PORT}`);
});
