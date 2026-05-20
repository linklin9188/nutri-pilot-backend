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

// SPA fallback — always serve fresh index.html
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Nutri-Pilot running on http://0.0.0.0:${PORT}`);
});
