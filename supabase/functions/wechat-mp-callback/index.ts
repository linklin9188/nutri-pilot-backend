/**
 * wechat-mp-callback — 微信网页授权 OAuth 回调处理
 *
 * 调用路径 (TICKET-114 改为 fetch/JSON 模式):
 *   WeChatIn.tsx 在 /auth/wechat/in?code=XX 用 fetch(...&mode=json) 调本函数
 *   → 本函数交换 token / 建号 → 返回 JSON { ok, userId, isNew } (带 CORS)
 *   → 前端 setUserId 后 SPA 内导航回首页。
 *
 * 为什么不再用整页 302 跳转: 微信 X5 浏览器拦截从 nothinkeats.com 整页跳到
 * 非业务域名 (*.supabase.co), 导致中转页重载 + code 重复消费 (wxin=dup)。
 * 改成 fetch (XHR) 不受"业务域名"整页跳转限制, 只需后端放行 CORS。
 * 仍保留旧 302 模式 (无 mode=json 时) 作 backward compat。
 *
 * snsapi_userinfo: code → access_token + openid → 用户信息 → 查/建 user_profiles
 * snsapi_base:     code → openid only → 查 user_profiles → 找到给 userId; 没有回错
 *
 * Env vars (set via `supabase secrets set`):
 *   WECHAT_APPID       — 公众号 AppID (默认权威号 wx3c66070bbe747b92)
 *   WECHAT_APPSECRET   — 公众号 AppSecret (必须)
 *   APP_ORIGIN         — 前端域名, 默认 https://nothinkeats.com
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 老板 2026-05-30 拍板权威 AppID。前端/后台/server.js 必须同源。
const AUTHORITATIVE_APPID = 'wx3c66070bbe747b92';
const APPID   = Deno.env.get('WECHAT_APPID')      ?? AUTHORITATIVE_APPID;
const SECRET  = Deno.env.get('WECHAT_APPSECRET')  ?? '';
const ORIGIN  = (Deno.env.get('APP_ORIGIN')        ?? 'https://nothinkeats.com').replace(/\/$/, '');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// TICKET-114 — CORS 头, 供前端 fetch 跨域调用 (WeChatIn 不再整页跳转)。
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { ...CORS, Location: url } });
}
function jsonResp(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // fetch 跨域可能先发预检 OPTIONS — 直接放行。
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url       = new URL(req.url);
  const code      = url.searchParams.get('code');
  const wantsJson = url.searchParams.get('mode') === 'json';

  // 双模式输出: mode=json 给前端 fetch 读 JSON; 否则保留旧 302 行为。
  const ok = (userId: string, isNew: 0 | 1) =>
    wantsJson
      ? jsonResp({ ok: true, userId, isNew })
      : redirect(`${ORIGIN}/auth/wechat/done?userId=${userId}&isNew=${isNew}`);
  const fail = (error: string) =>
    wantsJson
      ? jsonResp({ ok: false, error })
      : redirect(`${ORIGIN}/login?wx_error=${encodeURIComponent(error)}`);

  // ── 自检端点 (?diag=1) — 验证 appid+secret, 永不暴露 secret 值 ──
  if (url.searchParams.get('diag') === '1') {
    let cgi: unknown = null;
    try {
      const r = await fetch(`https://api.weixin.qq.com/cgi-bin/token`
        + `?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`);
      const j = await r.json();
      cgi = j.access_token ? 'VALID_GOT_TOKEN' : j;
    } catch (e) { cgi = `fetch_failed: ${e}`; }
    return jsonResp({
      appid: APPID,
      appid_len: APPID.length,
      secret_present: !!SECRET,
      secret_len: SECRET.length,
      origin: ORIGIN,
      cgi_token_verdict: cgi,
    });
  }

  if (!code)   return fail('missing_code');
  if (!SECRET) return fail('server_config_missing_secret');

  // ── 1. 换 access_token ────────────────────────────────────────────
  const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token`
    + `?appid=${APPID}&secret=${SECRET}&code=${code}&grant_type=authorization_code`;

  let tokenData: Record<string, string>;
  try {
    const res = await fetch(tokenUrl);
    tokenData = await res.json();
  } catch {
    return fail('token_fetch_failed');
  }

  if (tokenData.errcode) {
    // errcode: 40029=bad code, 40163=reused, 40001=bad secret, 40164=IP not whitelisted
    return fail(`wx_errcode_${tokenData.errcode}_${tokenData.errmsg ?? ''}`);
  }

  const { access_token, openid, scope, unionid } = tokenData;
  if (!openid) return fail('no_openid');

  // ── 2. 查现有用户 ─────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('wechat_openid', openid)
    .maybeSingle();

  if (existing) return ok(existing.id, 0);

  // ── 3. snsapi_base 且无记录 → 新用户需完整授权 ────────────────────
  if (!scope?.includes('snsapi_userinfo')) {
    return fail(`scope_${scope}_no_user`);
  }

  // ── 4. snsapi_userinfo → 拿用户信息, 建新账号 ────────────────────
  let nickname = '微信用户';
  try {
    const infoRes  = await fetch(`https://api.weixin.qq.com/sns/userinfo`
      + `?access_token=${access_token}&openid=${openid}&lang=zh_CN`);
    const infoData = await infoRes.json();
    if (!infoData.errcode) nickname = infoData.nickname ?? nickname;
  } catch { /* 静默 — 昵称可后补 */ }

  // user_profiles.id 是 text 类型 (见 CLAUDE.md DB conventions)
  const newId = crypto.randomUUID();
  const { error: insertErr } = await supabase.from('user_profiles').insert({
    id:             newId,
    display_name:   nickname,
    wechat_openid:  openid,
    wechat_unionid: unionid ?? null,
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: race } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('wechat_openid', openid)
        .maybeSingle();
      if (race) return ok(race.id, 0);
    }
    return fail('db_insert_failed');
  }

  return ok(newId, 1);
});
