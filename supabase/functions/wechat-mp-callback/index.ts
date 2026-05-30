/**
 * wechat-mp-callback — 微信网页授权 OAuth 回调处理
 *
 * 调用路径:
 *   WeChatIn.tsx → /auth/wechat/in?code=XX → 转发到此函数
 *   此函数 → 302 → /auth/wechat/done#userId=XX&isNew=0|1
 *
 * snsapi_userinfo: 拿 code → 换 access_token + openid → 拿用户信息
 *                  → 查/建 user_profiles → redirect done
 * snsapi_base:     拿 code → 换 openid only → 查 user_profiles
 *                  → 找到 → redirect done; 找不到 → redirect /login
 *
 * Env vars (set via `supabase secrets set`):
 *   WECHAT_APPID       — 公众号 AppID (也可硬编码 wx60f6708a777dc896)
 *   WECHAT_APP_SECRET  — 公众号 AppSecret (必须，后台获取)
 *   APP_ORIGIN         — 前端域名, 默认 https://nothinkeats.com
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APPID   = Deno.env.get('WECHAT_APPID')      ?? 'wx60f6708a777dc896';
const SECRET  = Deno.env.get('WECHAT_APPSECRET')  ?? '';
const ORIGIN  = (Deno.env.get('APP_ORIGIN')        ?? 'https://nothinkeats.com').replace(/\/$/, '');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function redirectError(msg: string): Response {
  return redirect(`${ORIGIN}/login?wx_error=${encodeURIComponent(msg)}`);
}

Deno.serve(async (req) => {
  const url  = new URL(req.url);
  const code = url.searchParams.get('code');

  if (!code) return redirectError('missing_code');
  if (!SECRET) return redirectError('server_config_missing_secret');

  // ── 1. 换 access_token ────────────────────────────────────────────
  const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token`
    + `?appid=${APPID}&secret=${SECRET}&code=${code}&grant_type=authorization_code`;

  let tokenData: Record<string, string>;
  try {
    const res = await fetch(tokenUrl);
    tokenData = await res.json();
  } catch {
    return redirectError('token_fetch_failed');
  }

  if (tokenData.errcode) {
    // Show exact WeChat errcode so we can diagnose (40029=bad code, 40163=reused, 40001=bad secret)
    return redirectError(`wx_errcode_${tokenData.errcode}_${tokenData.errmsg ?? ''}`);
  }

  const { access_token, openid, scope, unionid } = tokenData;
  if (!openid) return redirectError('no_openid');

  // ── 2. 查现有用户 ─────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('wechat_openid', openid)
    .maybeSingle();

  if (existing) {
    // Use query params (not hash) — WeChat X5 WebView strips #fragment from 302 redirects.
    return redirect(`${ORIGIN}/auth/wechat/done?userId=${existing.id}&isNew=0`);
  }

  // ── 3. snsapi_base 且无记录 → 新用户需要完整授权，回登录页 ────────
  if (!scope?.includes('snsapi_userinfo')) {
    return redirectError(`scope_${scope}_no_user`);
  }

  // ── 4. snsapi_userinfo → 拿用户信息，建新账号 ────────────────────
  let nickname = '微信用户';
  let avatarUrl: string | null = null;

  try {
    const infoUrl = `https://api.weixin.qq.com/sns/userinfo`
      + `?access_token=${access_token}&openid=${openid}&lang=zh_CN`;
    const infoRes  = await fetch(infoUrl);
    const infoData = await infoRes.json();
    if (!infoData.errcode) {
      nickname  = infoData.nickname  ?? nickname;
      avatarUrl = infoData.headimgurl ?? null;
    }
  } catch { /* 静默 — 用户昵称可后续补 */ }

  // user_profiles.id 是 text 类型 (见 CLAUDE.md DB conventions)
  const newId = crypto.randomUUID();
  const { error: insertErr } = await supabase.from('user_profiles').insert({
    id:              newId,
    display_name:    nickname,
    wechat_openid:   openid,
    wechat_unionid:  unionid ?? null,
    // avatar_url 字段不存在于此 schema; headimgurl 暂不落库, 未来按需扩列
  });

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: race } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('wechat_openid', openid)
        .maybeSingle();
      if (race) return redirect(`${ORIGIN}/auth/wechat/done?userId=${race.id}&isNew=0`);
    }
    return redirectError('db_insert_failed');
  }

  // Query params, not hash — WeChat X5 WebView strips #fragment on 302 redirect.
  return redirect(`${ORIGIN}/auth/wechat/done?userId=${newId}&isNew=1`);
});
