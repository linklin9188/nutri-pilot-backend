/**
 * @deprecated 2026-05-22 — Cowork CEO Option β decision (TICKET-018 §D).
 * Front-end persists via supabase.from('chat_sessions').upsert directly.
 * chat-session-get retained as fresh-mount hydration entry only.
 * chat-session-append / chat-session-end retained for legacy compat,
 * not currently invoked by front-end. Do NOT extend schema/payload.
 */
// Supabase Edge Function — GET /functions/v1/chat-session-get?user_id=<id>
//
// TICKET-20260521-001 §B(1). Returns the most-recent chat session for the
// given user_id, ordered by last_at desc. Graceful degrade — if the
// chat_sessions table doesn't yet exist (Database P11 pending migration 057),
// return { messages: [] } with status 200 so the UI can render an empty
// state instead of a 500.
//
// Schema (per Architect HANDOFF §2):
//   chat_sessions (
//     id          uuid PK,
//     user_id     text,
//     started_at  timestamptz DEFAULT now(),
//     last_at     timestamptz,
//     messages    jsonb DEFAULT '[]'::jsonb,
//     intent_tag  text
//   )
//
// Deploy: supabase functions deploy chat-session-get --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ChatSessionRow {
  id:         string;
  user_id:    string;
  started_at: string;
  last_at:    string | null;
  messages:   unknown[] | null;
  intent_tag: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET")     return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) return json({ error: "user_id query param required" }, 400);

  try {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id, user_id, started_at, last_at, messages, intent_tag")
      .eq("user_id", userId)
      .order("last_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<ChatSessionRow>();

    if (error) {
      // PostgREST 404 / 42P01 (relation does not exist) → graceful empty state.
      // Also: column-not-exist (Architect HANDOFF §2 contract vs migration 028
      // schema mismatch — schema is "pending" in the contract-alignment sense).
      const msg = error.message ?? "";
      const isMissingTable  = /relation .* does not exist|42P01/i.test(msg);
      const isMissingColumn = /column .* does not exist|42703/i.test(msg);
      const isPostgrestSchemaMiss = /PGRST20[02]|schema cache/i.test(msg);
      if (isMissingTable || isMissingColumn || isPostgrestSchemaMiss) {
        return json({
          session:        null,
          messages:       [],
          schema_pending: true,
          note:           "chat_sessions schema mismatch — HANDOFF §2 contract (started_at/last_at/intent_tag) vs migration 028 actual (created_at/updated_at/intent_history). Awaiting Architect contract decision + Database migration 057.",
        });
      }
      console.warn("chat-session-get db error:", error.message);
      return json({ session: null, messages: [], error: error.message }, 200);
    }

    if (!data) {
      return json({ session: null, messages: [] });
    }

    return json({
      session: {
        id:         data.id,
        started_at: data.started_at,
        last_at:    data.last_at,
        intent_tag: data.intent_tag,
      },
      messages: Array.isArray(data.messages) ? data.messages : [],
    });
  } catch (e) {
    console.error("chat-session-get failed:", e);
    // Total failure → still degrade to empty (UI must keep working in beta).
    return json({ session: null, messages: [], error: (e as Error).message }, 200);
  }
});
