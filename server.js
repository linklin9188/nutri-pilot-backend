import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── TICKET-001 sprint 0 — admin auth state (in-memory) ─────────────────────
// Sprint 0 stores admin sessions in a Map keyed by random token. Persists
// across requests but resets on server restart (acceptable for sprint 0;
// JWT-signed tokens land in sprint 2).
//
// ADMIN_USERNAME / ADMIN_PASSWORD_HASH come from Railway env. The hash is
// sha256(password) hex-encoded so we never compare plaintext. Boss sets the
// password by running `node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASS').digest('hex'))"`
// and pasting the result into Railway env ADMIN_PASSWORD_HASH.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are reused from edge fn env if
// already on Railway; otherwise CEO sets them once during sprint 0 deploy.
const ADMIN_USERNAME      = process.env.ADMIN_USERNAME      ?? '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? '';
const SUPABASE_URL              = process.env.SUPABASE_URL              ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const adminSessions = new Map(); // token -> { username, createdAt }

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function requireAdmin(req, res, next) {
  const token = req.header('X-Admin-Token');
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.adminUsername = adminSessions.get(token).username;
  next();
}

app.post('/api/admin/login', express.json(), (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing username or password' });
  }
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    return res.status(503).json({
      error: 'admin not configured — set ADMIN_USERNAME + ADMIN_PASSWORD_HASH in Railway env',
    });
  }
  // Constant-time-ish comparison via crypto.timingSafeEqual on equal-length buffers.
  const userOk = Buffer.byteLength(username) === Buffer.byteLength(ADMIN_USERNAME)
    && crypto.timingSafeEqual(Buffer.from(username), Buffer.from(ADMIN_USERNAME));
  const passOk = (() => {
    const got = sha256Hex(password);
    if (got.length !== ADMIN_PASSWORD_HASH.length) return false;
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(ADMIN_PASSWORD_HASH));
  })();
  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { username, createdAt: Date.now() });
  res.json({ token, username });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ is_admin: true, username: req.adminUsername });
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      error: 'supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Railway env',
    });
  }
  try {
    const u = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/admin_users_view?select=is_premium,is_trial_active,created_at,last_active_at,menu_count`;
    const r = await fetch(u, {
      headers: {
        apikey:        SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => r.statusText);
      return res.status(502).json({ error: `supabase ${r.status}: ${t.slice(0, 200)}` });
    }
    const rows = await r.json();
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86_400_000;
    let total_users        = 0;
    let trial_active_users = 0;
    let premium_users      = 0;
    let new_users_7d       = 0;
    let active_users_7d    = 0;
    let total_menus        = 0;
    for (const row of rows) {
      total_users += 1;
      if (row.is_premium)      premium_users      += 1;
      if (row.is_trial_active) trial_active_users += 1;
      total_menus += typeof row.menu_count === 'number' ? row.menu_count : 0;
      const created = row.created_at ? new Date(row.created_at).getTime() : NaN;
      if (Number.isFinite(created) && created > sevenDaysAgo) new_users_7d += 1;
      const lastActive = row.last_active_at ? new Date(row.last_active_at).getTime() : NaN;
      if (Number.isFinite(lastActive) && lastActive > sevenDaysAgo) active_users_7d += 1;
    }
    res.json({
      total_users,
      trial_active_users,
      premium_users,
      new_users_7d,
      active_users_7d,
      total_menus,
    });
  } catch (e) {
    console.error('[/api/admin/stats]', e);
    res.status(500).json({ error: e.message });
  }
});

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

// TICKET-001 sprint 0 — admin app static assets + SPA fallback. Must come
// BEFORE the main SPA catch-all so /admin/* doesn't fall through to index.html
// of the main user-facing app. dist-admin/ is built by `npm run build:admin`
// and ignored from git (build artifact).
app.use('/admin', express.static(path.join(__dirname, 'dist-admin'), {
  maxAge: 0,
  etag: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist-admin', 'index.html'));
});
app.get('/admin/*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'dist-admin', 'index.html'));
});

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
