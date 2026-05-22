/**
 * @deprecated 2026-05-22 — Cowork CEO Option β decision (TICKET-018 §D).
 * Front-end persists via supabase.from('chat_sessions').upsert directly.
 * chat-session-get retained as fresh-mount hydration entry only.
 * chat-session-append / chat-session-end retained for legacy compat,
 * not currently invoked by front-end. Do NOT extend schema/payload.
 */
// Supabase Edge Function — POST /functions/v1/chat-session-end
//
// TICKET-20260521-001 §B(3). Closes the current chat session by extracting
// an intent_tag from the concatenated session text. Looks up the user's most-
// recent session, joins the message texts, calls parse-intent (existing edge
// function), then UPDATEs the row's intent_tag with the primary axis.
//
// Body: { user_id: string }
//
// Graceful degrade if migration 057 missing OR parse-intent rate-limited /
// errors — return 200 with `intent_tag: null` so the UI doesn't fail-close.
//
// Deploy: supabase functions deploy chat-session-end --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ChatSessionRow {
  id:       string;
  messages: unknown[] | null;
}

interface ChatMessageLike { role?: string; text?: string }

interface ReqBody { user_id?: string }

// See chat-session-append/index.ts for rationale — missing-column is the
// same "schema not aligned with HANDOFF §2 contract" signal as missing-table.
function isMissingTable(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  return /relation .* does not exist|42P01|column .* does not exist|42703|PGRST20[02]|schema cache/i.test(err.message);
}

function joinMessages(msgs: unknown[]): string {
  return msgs
    .filter((m): m is ChatMessageLike => !!m && typeof m === "object")
    .map(m => (typeof m.text === "string" ? m.text.trim() : ""))
    .filter(Boolean)
    .join(" / ")
    .slice(0, 500);   // parse-intent enforces 500 char cap
}

// Pull the dominant axis out of parse-intent's structured bias object. Returns
// a short string like "category:seafood:+2" or "tag:blood_tonic:+2" — Algorithm
// can split this back on ':' if it needs more granularity later.
function dominantTag(bias: unknown): string | null {
  if (!bias || typeof bias !== "object") return null;
  const b = bias as Record<string, unknown>;
  type Cand = { kind: string; key: string; abs: number; signed: number };
  const candidates: Cand[] = [];
  const collect = (kind: string, obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number") candidates.push({ kind, key: k, abs: Math.abs(v), signed: v });
    }
  };
  collect("category", b.categoryBoosts);
  collect("tag",      b.tagBoosts);
  if (!candidates.length) return null;
  candidates.sort((x, y) => y.abs - x.abs);
  const top = candidates[0];
  const sign = top.signed >= 0 ? "+" : "";
  return `${top.kind}:${top.key}:${sign}${top.signed}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  let body: ReqBody;
  try { body = await req.json() as ReqBody; }
  catch { return json({ error: "invalid JSON body" }, 400); }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!userId) return json({ error: "user_id required" }, 400);

  try {
    // 1. Find the latest session.
    const { data: latest, error: selErr } = await supabase
      .from("chat_sessions")
      .select("id, messages")
      .eq("user_id", userId)
      .order("last_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<ChatSessionRow>();

    if (selErr && isMissingTable(selErr)) {
      return json({
        ended:          false,
        schema_pending: true,
        note:           "chat_sessions table not yet provisioned (migration 057 pending)",
      });
    }
    if (selErr) return json({ error: selErr.message }, 500);
    if (!latest) return json({ ended: false, note: "no session to end" });

    const msgs = Array.isArray(latest.messages) ? latest.messages : [];
    if (msgs.length === 0) {
      return json({ ended: true, session_id: latest.id, intent_tag: null, note: "empty session" });
    }

    // 2. Extract intent via existing parse-intent function.
    const joined = joinMessages(msgs);
    let intentTag: string | null = null;
    if (joined) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/parse-intent`, {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "apikey":        SERVICE_KEY,
          },
          body: JSON.stringify({ user_id: userId, text: joined }),
        });
        const j = await r.json();
        if (r.ok && j?.bias) {
          intentTag = dominantTag(j.bias);
        } else {
          console.warn("chat-session-end parse-intent non-ok:", r.status, j?.error);
        }
      } catch (e) {
        console.warn("chat-session-end parse-intent fetch failed:", (e as Error).message);
        // intent_tag stays null — non-fatal.
      }
    }

    // 3. Persist intent_tag.
    const { error: updErr } = await supabase
      .from("chat_sessions")
      .update({ intent_tag: intentTag })
      .eq("id", latest.id);
    if (updErr && !isMissingTable(updErr)) {
      console.warn("chat-session-end update error:", updErr.message);
    }

    return json({
      ended:      true,
      session_id: latest.id,
      intent_tag: intentTag,
    });
  } catch (e) {
    console.error("chat-session-end failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
