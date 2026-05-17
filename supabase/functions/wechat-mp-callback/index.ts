// Supabase Edge Function — GET /functions/v1/wechat-mp-callback
//
// Handles the OAuth callback for 公众号网页授权 (Official Account Web Auth).
// Flow:
//   1. User opens link inside WeChat browser → tapped 微信登录 on Login page.
//   2. launchWeChat() redirects to open.weixin.qq.com/connect/oauth2/authorize
//      with redirect_uri = https://nothinkeats.com/auth/wechat/callback.
//   3. The /auth/wechat/callback React route POSTs the ?code= it received
//      to THIS function (or this function is called server-side, depending
//      on integration choice). We use the server-direct variant: WeChat is
//      configured to redirect straight here, and we end with a 302 back to
//      nothinkeats.com/auth/wechat/done#userId=...
//
// Required Supabase env vars (set via `supabase secrets set`):
//   WECHAT_APPID         — wx... from open.weixin.qq.com / mp.weixin.qq.com
//   WECHAT_APPSECRET     — 32 char hex
//   APP_ORIGIN           — https://nothinkeats.com (where to redirect when done)
//
// Deploy: supabase functions deploy wechat-mp-callback --no-verify-jwt
// (WeChat doesn't send a JWT.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const APPID     = Deno.env.get("WECHAT_APPID")     ?? "";
const APPSECRET = Deno.env.get("WECHAT_APPSECRET") ?? "";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN")      ?? "https://nothinkeats.com";

interface WeChatTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  openid?: string;
  scope?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

interface WeChatUserInfo {
  openid?: string;
  nickname?: string;
  sex?: number;
  province?: string;
  city?: string;
  country?: string;
  headimgurl?: string;
  privilege?: string[];
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

function htmlError(msg: string, status = 400): Response {
  return new Response(
    `<!doctype html><meta charset=utf-8><title>微信登录</title>
     <body style="font-family:sans-serif;padding:32px;max-width:480px;margin:auto;text-align:center">
       <h2 style="color:#FF5A1F">微信登录出错</h2>
       <p>${msg}</p>
       <a href="${APP_ORIGIN}/login" style="color:#FF5A1F">返回登录</a>
     </body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function redirectToDone(userId: string, isNew: boolean): Response {
  const url = `${APP_ORIGIN}/auth/wechat/done#userId=${encodeURIComponent(userId)}&isNew=${isNew ? 1 : 0}`;
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return htmlError("Method not allowed", 405);
  }
  if (!APPID || !APPSECRET) {
    return htmlError("微信登录未配置（管理员请检查 WECHAT_APPID / WECHAT_APPSECRET secrets）", 500);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // state is forwarded straight from launchWeChat — we don't validate against
  // sessionStorage here because the callback hits a different origin (Supabase
  // function). Front-end's /auth/wechat/done page can do CSRF check against
  // sessionStorage if needed.
  if (!code) return htmlError("缺少 code 参数");

  try {
    // 1. Exchange code → access_token + openid (+ unionid if bound)
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${APPID}&secret=${APPSECRET}&code=${code}&grant_type=authorization_code`;
    const tokenRes = await fetch(tokenUrl);
    const token: WeChatTokenResponse = await tokenRes.json();
    if (token.errcode || !token.openid) {
      console.error("WeChat token exchange failed:", token);
      return htmlError(`微信换取 token 失败 (${token.errcode ?? "?"}: ${token.errmsg ?? "unknown"})`);
    }
    const openid  = token.openid;
    const unionid = token.unionid ?? null;
    const scope   = token.scope ?? "";

    // 2. Fetch user info if scope includes snsapi_userinfo
    let nickname:    string | null = null;
    let headimgurl:  string | null = null;
    if (scope.includes("snsapi_userinfo") && token.access_token) {
      const infoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${token.access_token}&openid=${openid}&lang=zh_CN`;
      const infoRes = await fetch(infoUrl);
      const info: WeChatUserInfo = await infoRes.json();
      if (!info.errcode) {
        nickname   = info.nickname    ?? null;
        headimgurl = info.headimgurl  ?? null;
      } else {
        console.warn("WeChat userinfo fetch failed (continuing with openid only):", info);
      }
    }

    // 3. Match existing user by unionid first (cross-account), then openid.
    let userId: string | null = null;
    let isNew = false;

    if (unionid) {
      const { data } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("wechat_unionid", unionid)
        .maybeSingle();
      if (data) userId = (data as any).id;
    }
    if (!userId) {
      const { data } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("wechat_openid", openid)
        .maybeSingle();
      if (data) userId = (data as any).id;
    }

    // 4. Create new user_profiles row if first-time AND we have a nickname
    //    (snsapi_userinfo scope). On the silent path (snsapi_base scope) we
    //    only have an openid — no display_name, which the schema requires
    //    and many UIs assume non-null. So on silent-with-no-match we bounce
    //    the user to /login where they go through the regular consent flow.
    const isSilent = scope === "snsapi_base" || !scope.includes("snsapi_userinfo");
    if (!userId) {
      if (isSilent) {
        // First-time user came in via silent re-auth — we have no nickname,
        // so we can't satisfy the display_name NOT NULL constraint. Punt
        // to /login; the explicit 微信登录 button will request
        // snsapi_userinfo and create the profile properly.
        return new Response(null, {
          status: 302,
          headers: { Location: `${APP_ORIGIN}/login` },
        });
      }
      userId = crypto.randomUUID();
      isNew = true;
      const { error } = await supabase.from("user_profiles").insert({
        id:              userId,
        wechat_openid:   openid,
        wechat_unionid:  unionid,
        display_name:    nickname,
        updated_at:      new Date().toISOString(),
      });
      if (error) {
        console.error("Insert user_profiles failed:", error);
        return htmlError("创建用户失败");
      }
    } else {
      // Refresh display_name / unionid in case they were missing before.
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (nickname) patch.display_name = nickname;
      if (unionid)  patch.wechat_unionid = unionid;
      await supabase.from("user_profiles").update(patch).eq("id", userId);
    }

    // 5. Redirect back to front-end with userId in URL hash (server can't see it).
    return redirectToDone(userId, isNew);
  } catch (e) {
    console.error("wechat-mp-callback unexpected error:", e);
    return htmlError("登录失败，请稍后重试");
  }
});
