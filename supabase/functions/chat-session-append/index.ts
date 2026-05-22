/**
 * @deprecated 2026-05-22 — Cowork CEO Option β decision (TICKET-018 §D).
 * Front-end persists via supabase.from('chat_sessions').upsert directly.
 * chat-session-get retained as fresh-mount hydration entry only.
 * chat-session-append / chat-session-end retained for legacy compat,
 * not currently invoked by front-end. Do NOT extend schema/payload.
 */
// Supabase Edge Function — POST /functions/v1/chat-session-append
//
// TICKET-20260521-001 §B(2). Appends a ChatMessage to the user's most-recent
// session. Rule: if the latest session's last_at is within 24h, append to it;
// otherwise start a new session row. Graceful degrade if Database migration
// 057 (chat_sessions) hasn't shipped yet — return 503 with schema_pending so
// the UI can buffer messages client-side.
//
// Body: { user_id: string, message: ChatMessage }
//   ChatMessage = { role: 'user' | 'assistant', text: string, ts?: number, ... }
//
// Deploy: supabase functions deploy chat-session-append --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

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

const SESSION_WINDOW_MS = 24 * 3600 * 1000;

interface ChatSessionRow {
  id:        string;
  last_at:   string | null;
  messages:  unknown[] | null;
}

interface ReqBody {
  user_id?: string;
  message?: unknown;
}

// Treat both "table missing" and "column missing" as schema_pending: the
// HANDOFF §2 contract names (started_at/last_at/intent_tag) don't match
// migration 028's actual columns (created_at/updated_at/intent_history),
// so a missing-column error here is the same kind of "schema not yet
// aligned with contract" signal as a missing-table error.
function isMissingTable(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  return /relation .* does not exist|42P01|column .* does not exist|42703|PGRST20[02]|schema cache/i.test(err.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  let body: ReqBody;
  try { body = await req.json() as ReqBody; }
  catch { return json({ error: "invalid JSON body" }, 400); }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!userId) return json({ error: "user_id required" }, 400);
  if (!body.message || typeof body.message !== "object") {
    return json({ error: "message required (object)" }, 400);
  }

  try {
    // 1. Look up the latest session for this user.
    const { data: latest, error: selErr } = await supabase
      .from("chat_sessions")
      .select("id, last_at, messages")
      .eq("user_id", userId)
      .order("last_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<ChatSessionRow>();

    if (selErr && isMissingTable(selErr)) {
      return json({
        appended:       false,
        schema_pending: true,
        note:           "chat_sessions table not yet provisioned (migration 057 pending) — buffer client-side",
      }, 503);
    }
    if (selErr) {
      console.warn("chat-session-append select error:", selErr.message);
      return json({ error: selErr.message }, 500);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 2. Decide append-to-latest vs start-new.
    let sessionId: string;
    let outMessages: unknown[];

    const lastAtMs = latest?.last_at ? new Date(latest.last_at).getTime() : 0;
    const withinWindow = latest && lastAtMs > 0 && (now.getTime() - lastAtMs) < SESSION_WINDOW_MS;

    if (withinWindow && latest) {
      // Append to existing.
      outMessages = [
        ...(Array.isArray(latest.messages) ? latest.messages : []),
        body.message,
      ];
      const { error: updErr } = await supabase
        .from("chat_sessions")
        .update({ messages: outMessages, last_at: nowIso })
        .eq("id", latest.id);
      if (updErr) {
        console.warn("chat-session-append update error:", updErr.message);
        return json({ error: updErr.message }, 500);
      }
      sessionId = latest.id;
    } else {
      // Start a new session.
      outMessages = [body.message];
      const { data: inserted, error: insErr } = await supabase
        .from("chat_sessions")
        .insert({
          user_id:    userId,
          started_at: nowIso,
          last_at:    nowIso,
          messages:   outMessages,
        })
        .select("id")
        .single();
      if (insErr) {
        // Race condition could surface as missing-table on insert too.
        if (isMissingTable(insErr)) {
          return json({
            appended:       false,
            schema_pending: true,
            note:           "chat_sessions table not yet provisioned (migration 057 pending) — buffer client-side",
          }, 503);
        }
        console.warn("chat-session-append insert error:", insErr.message);
        return json({ error: insErr.message }, 500);
      }
      sessionId = (inserted as { id: string }).id;
    }

    return json({
      appended:    true,
      session_id:  sessionId,
      message_count: outMessages.length,
      started_new: !withinWindow,
    });
  } catch (e) {
    console.error("chat-session-append failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
