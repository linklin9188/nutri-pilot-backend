// Supabase Edge Function — POST /functions/v1/wechat-jssdk-signature
//
// TICKET-20260520-066. Issues the JSSDK config payload (appId / timestamp /
// nonceStr / signature) that the frontend feeds into `wx.config({...})` so
// WeChat-app sharing renders the hero card (title + description + thumb).
//
// WeChat does NOT honor OG meta tags — its share-card content has to come
// from `wx.updateAppMessageShareData` / `wx.updateTimelineShareData`, which
// can only be called inside `wx.ready` after a valid `wx.config({...})`.
// The config requires a SHA1 signature computed server-side because it needs
// the `jsapi_ticket` (derived from the APPSECRET — never expose to client).
//
// Required env (Supabase secrets):
//   WECHAT_APPID
//   WECHAT_APPSECRET
//   SUPABASE_URL                  — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY     — auto-injected (for wechat_token_cache RLS bypass)
//
// Deploy: supabase functions deploy wechat-jssdk-signature --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const APPID     = Deno.env.get("WECHAT_APPID")     ?? "";
const APPSECRET = Deno.env.get("WECHAT_APPSECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

// Only allow signatures for URLs hosted on nothinkeats.com (production) or
// localhost (dev). Refusing arbitrary URLs prevents the endpoint from being
// abused to mint signatures for third-party sites against our APPID.
const ALLOWED_URL_PREFIXES = [
  "https://nothinkeats.com",
  "https://www.nothinkeats.com",
  "http://localhost:3000",
  "http://localhost:5173",   // Vite default
];

// CORS — production frontend + local dev. Origin echo simplifies allowing both.
function corsHeaders(originHeader: string | null): Record<string, string> {
  const origin = originHeader ?? "";
  const allow = ALLOWED_URL_PREFIXES.some(p => origin.startsWith(p)) ? origin : "https://nothinkeats.com";
  return {
    "Access-Control-Allow-Origin":  allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Vary":                          "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── crypto helpers ──────────────────────────────────────────────────────────

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function nonceHex(bytes = 8): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── cache layer ─────────────────────────────────────────────────────────────

interface CacheRow { value: string; expires_at: string }

async function readCache(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("wechat_token_cache")
    .select("value, expires_at")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as CacheRow;
  // 60s safety margin so we don't hand out a token about to expire.
  const expiresMs = new Date(row.expires_at).getTime() - 60_000;
  if (expiresMs < Date.now()) return null;
  return row.value;
}

async function writeCache(key: string, value: string, expiresInSec: number): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  const { error } = await supabase
    .from("wechat_token_cache")
    .upsert({ key, value, expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.warn("wechat_token_cache upsert failed:", error.message);
}

// ── WeChat token + ticket fetch ─────────────────────────────────────────────

interface WxTokenResp { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }

async function getAccessToken(): Promise<string> {
  const cached = await readCache("access_token");
  if (cached) return cached;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`;
  const res = await fetch(url);
  const j = await res.json() as WxTokenResp;
  if (j.errcode || !j.access_token) {
    throw new Error(`WeChat token fetch failed: ${j.errcode ?? "?"} ${j.errmsg ?? "no access_token"}`);
  }
  await writeCache("access_token", j.access_token, j.expires_in ?? 7200);
  return j.access_token;
}

interface WxTicketResp { ticket?: string; expires_in?: number; errcode?: number; errmsg?: string }

async function getJsapiTicket(): Promise<string> {
  const cached = await readCache("jsapi_ticket");
  if (cached) return cached;
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=${accessToken}`;
  const res = await fetch(url);
  const j = await res.json() as WxTicketResp;
  if (j.errcode || !j.ticket) {
    throw new Error(`WeChat ticket fetch failed: ${j.errcode ?? "?"} ${j.errmsg ?? "no ticket"}`);
  }
  await writeCache("jsapi_ticket", j.ticket, j.expires_in ?? 7200);
  return j.ticket;
}

// ── entry ───────────────────────────────────────────────────────────────────

interface ReqBody { url?: string }

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("Origin"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405, cors);

  if (!APPID || !APPSECRET) {
    return json({ error: "WeChat credentials not configured (WECHAT_APPID / WECHAT_APPSECRET secrets)" }, 500, cors);
  }

  let body: ReqBody;
  try { body = await req.json() as ReqBody; }
  catch { return json({ error: "Invalid JSON body" }, 400, cors); }

  const url = body?.url;
  if (!url || typeof url !== "string") {
    return json({ error: "Missing required field 'url' (string)" }, 400, cors);
  }
  if (!ALLOWED_URL_PREFIXES.some(p => url.startsWith(p))) {
    return json({
      error: "URL must start with one of: " + ALLOWED_URL_PREFIXES.join(", "),
    }, 400, cors);
  }

  try {
    const ticket = await getJsapiTicket();
    const nonceStr = nonceHex(8);                    // 16 hex chars
    const timestamp = Math.floor(Date.now() / 1000);

    // WeChat signature spec: lower-case keys, alpha-sorted by key, &-joined.
    // The 4 keys (jsapi_ticket / noncestr / timestamp / url) happen to already
    // be in alpha order, so we can string-concat directly.
    const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = await sha1Hex(raw);

    return json({
      appId:     APPID,        // wx.config wants camelCase appId, not appid
      timestamp,
      nonceStr,
      signature,
      url,
    }, 200, cors);
  } catch (e) {
    console.error("wechat-jssdk-signature failed:", e);
    return json({ error: (e as Error).message }, 500, cors);
  }
});
