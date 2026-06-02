// Supabase Edge Function — GET/POST /functions/v1/host-sso
//
// 共享登录 (SSO) 验票端点 —— 把"主站"(另一个网页产品)的登录身份带进爱吃。
//
// 流程 (见 docs/INTEGRATION_host_sso.md):
//   主站点"爱吃"栏目 → 用共享密钥 HOST_SSO_SECRET 给当前用户签一张 JWT(HS256)
//   → 整页跳 aieats.<主站>.com/auth/host/in?token=<JWT>
//   → 接力页 fetch 本函数验票 → 拿回 { ok, userId } → setUserId → 进 /home-v2
//
// 本函数只做一件事: 验签 + 把主站 userId 映射成爱吃 userId(加 `h_` 命名空间
// 前缀, 避免与历史 uuid 身份撞号), upsert user_profiles 建档, 返回。
//
// 安全: 不信任明文 ?uid=, 只认密钥签名过的 JWT。密钥只在 edge(Supabase secret),
//       不进前端 bundle, 外人无法伪造。校验 exp(过期)防重放。
//
// Required env (supabase secrets set):
//   HOST_SSO_SECRET  — 与主站共享的签名密钥, server-side only
//
// Deploy: supabase functions deploy host-sso --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── base64url → bytes / string ──────────────────────────────────────────────
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

// ── HS256 JWT 验签 ───────────────────────────────────────────────────────────
// 返回 payload (验签 + exp 通过) 或抛错。零外部依赖, 用 Web Crypto。
async function verifyHs256(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed_token");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(b64urlToString(headerB64)) as { alg?: string; typ?: string };
  if (header.alg !== "HS256") throw new Error("unsupported_alg");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error("bad_signature");

  const payload = JSON.parse(b64urlToString(payloadB64)) as Record<string, unknown>;

  // exp(过期)与 nbf(尚未生效)校验 —— 防重放。容忍 60s 时钟偏移。
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now > payload.exp + 60) throw new Error("token_expired");
  if (typeof payload.nbf === "number" && now < payload.nbf - 60) throw new Error("token_not_yet_valid");

  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("HOST_SSO_SECRET") ?? "";
  if (!secret) return json({ ok: false, error: "server_misconfigured_no_secret" }, 500);

  // token 可来自 query(?token=) 或 POST body({ token })。
  let token = "";
  try {
    const url = new URL(req.url);
    token = url.searchParams.get("token") ?? "";
    if (!token && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = (body as { token?: string }).token ?? "";
    }
  } catch { /* ignore */ }

  if (!token) return json({ ok: false, error: "no_token" }, 400);

  let payload: Record<string, unknown>;
  try {
    payload = await verifyHs256(token, secret);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "verify_failed" }, 401);
  }

  // 主站用户 id: 优先 sub(JWT 标准主体声明), 退 uid。
  const hostUid = String(payload.sub ?? payload.uid ?? "").trim();
  if (!hostUid) return json({ ok: false, error: "no_subject" }, 400);

  // 映射成爱吃 userId —— 加 `h_` 命名空间前缀, 与历史 uuid 身份隔离。
  // 稳定可逆: 同一主站 uid 永远映射到同一爱吃 userId。
  const userId = `h_${hostUid}`;
  const displayName = String(payload.name ?? payload.display_name ?? "").trim() || null;

  // upsert 建档(第一次进来自动创建, 之后幂等)。
  let isNew = 0;
  try {
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    isNew = existing ? 0 : 1;
    await supabase
      .from("user_profiles")
      .upsert(
        displayName ? { id: userId, display_name: displayName } : { id: userId },
        { onConflict: "id" },
      );
  } catch {
    // 建档失败不阻断登录 —— userId 仍可用, 下游读到 NULL display_name 有兜底。
  }

  return json({ ok: true, userId, displayName, isNew });
});
