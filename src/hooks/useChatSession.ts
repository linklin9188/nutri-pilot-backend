/**
 * useChatSession — Day 2/3 ChatAgent (SPEC §3 + §3.1)
 *
 * Single-session chat state. localStorage is the fast-path cache (every
 * mutation persists synchronously); `chat_sessions` table is the durable
 * store (upsert every 5 messages + on proposal-chosen events). Either
 * layer is sufficient on its own — if the DB table isn't ready yet the
 * hook degrades to localStorage-only without warning the user.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Persistence model — Option β (CEO 决断 2026-05-22, TICKET-018):
 *   - Front-end persists chat_sessions via `supabase.from('chat_sessions').upsert` directly
 *   - edge fn `chat-session-get` retained as fresh-mount hydration entry (§A.1 22b15f6)
 *   - edge fn `chat-session-append` / `chat-session-end` deprecated — DO NOT switch to invoke
 *   - Reason: front-end multi-session + mode routing + proposals.meta does not align with
 *     edge fn single-session-by-user_id model. Realigning would require migration 057 +
 *     edge fn rewrite (4-6 commits / 2 departments).
 *   - This file is the canonical chat persistence path. See docs/LESSONS.md "chat option β".
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getUserId } from '../lib/userId';
import { supabase } from '../lib/supabase';
import type { IntentTag } from '../lib/intentBias';
import type { WeeklyMenu } from './useWeeklyMenu';

// Internal alias — SPEC §3 calls this WeekPlan; the existing hook calls it
// WeeklyMenu. Reuse the established type so proposal-engine output drops in.
export type WeekPlan = WeeklyMenu;

export type ChatRole = 'user' | 'ai' | 'system';
export type ChatMode = 'today' | 'week' | 'preference';
export type ProposalChoice = 'A' | 'B' | 'C';

export interface ChatMessage {
  id:        string;
  role:      ChatRole;
  content:   string;
  timestamp: number;
  meta?: {
    intent?:    IntentTag;
    proposals?: WeekPlan[];
    chosen?:    ProposalChoice;
  };
}

export interface ChatSession {
  id:         string;
  user_id:    string;
  mode:       ChatMode;
  messages:   ChatMessage[];
  created_at: number;
  updated_at: number;
}

// Mode → opening line (SPEC §5). Plain Chinese; AI persona is set once on
// session creation so the user reads an intent-shaped prompt immediately.
const MODE_OPENERS: Record<ChatMode, string> = {
  today:      '今天想吃啥？我看了下你最近偏好，先列三套候选给你挑。',
  week:       '这周菜单 — 三套方案给你挑，A 中性 / B 偏家乡重口 / C 偏健康轻口。',
  preference: '跟我聊聊你最近想吃啥风格的，我帮你定制一份。',
};

function newId(): string {
  // crypto.randomUUID is available in all evergreen browsers; falls back to
  // a date-based pseudo-id when called from non-secure contexts.
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function storageKey(sessionId: string): string {
  return `chat_session_${sessionId}`;
}

function buildInitialSession(mode: ChatMode, sessionId: string): ChatSession {
  const now = Date.now();
  return {
    id:         sessionId,
    user_id:    getUserId() ?? 'anonymous',
    mode,
    messages:   [{
      id:        newId(),
      role:      'system',
      content:   MODE_OPENERS[mode],
      timestamp: now,
    }],
    created_at: now,
    updated_at: now,
  };
}

function loadSession(sessionId: string, mode: ChatMode): ChatSession {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    if (raw) return JSON.parse(raw) as ChatSession;
  } catch { /* corrupt — fall through to fresh */ }
  return buildInitialSession(mode, sessionId);
}

function persistSession(session: ChatSession): void {
  try { localStorage.setItem(storageKey(session.id), JSON.stringify(session)); }
  catch { /* quota — best-effort */ }
}

// ── DB persistence layer (Database 020 — chat_sessions table) ────────────────
// Forward-compatible: if the table / columns aren't there yet, every call
// silently returns false/null and the hook keeps using localStorage only.
// Caller never sees a thrown error or a console warning.

interface ChatSessionRow {
  id:                 string;
  user_id:            string;
  mode:               ChatMode;
  messages:           ChatMessage[];
  intent_history:     IntentTag[];
  proposals_snapshot: WeekPlan[] | null;
  chosen:             ProposalChoice | null;
  updated_at:         string;
}

function deriveIntentHistory(messages: ChatMessage[]): IntentTag[] {
  const out: IntentTag[] = [];
  for (const m of messages) if (m.meta?.intent) out.push(m.meta.intent);
  return out;
}

function deriveLatestProposals(messages: ChatMessage[]): WeekPlan[] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const p = messages[i].meta?.proposals;
    if (p && p.length > 0) return p;
  }
  return null;
}

function deriveChosen(messages: ChatMessage[]): ProposalChoice | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].meta?.chosen;
    if (c) return c;
  }
  return null;
}

async function dbUpsertSession(session: ChatSession): Promise<boolean> {
  try {
    const row: ChatSessionRow = {
      id:                 session.id,
      user_id:            session.user_id,
      mode:               session.mode,
      messages:           session.messages,
      intent_history:     deriveIntentHistory(session.messages),
      proposals_snapshot: deriveLatestProposals(session.messages),
      chosen:             deriveChosen(session.messages),
      updated_at:         new Date(session.updated_at).toISOString(),
    };
    const { error } = await supabase
      .from('chat_sessions')
      .upsert(row, { onConflict: 'id' });
    return !error;
  } catch {
    // Network / table-missing / column-missing — all silenced.
    return false;
  }
}

async function dbLoadSession(sessionId: string): Promise<ChatSession | null> {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, user_id, mode, messages, created_at, updated_at')
      .eq('id', sessionId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id:         (data as any).id,
      user_id:    (data as any).user_id,
      mode:       (data as any).mode as ChatMode,
      messages:   ((data as any).messages ?? []) as ChatMessage[],
      created_at: tsToMs((data as any).created_at),
      updated_at: tsToMs((data as any).updated_at),
    };
  } catch {
    return null;
  }
}

function tsToMs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Date.parse(v); return isFinite(n) ? n : Date.now(); }
  return Date.now();
}

export function useChatSession(mode: ChatMode = 'today', resumeId?: string) {
  // Stable session id (resume from URL or mint fresh). useRef keeps it
  // stable across renders without re-seeding on every render.
  const sessionIdRef = useRef<string>(resumeId ?? newId());

  const [session, setSession] = useState<ChatSession>(() =>
    loadSession(sessionIdRef.current, mode)
  );

  // §C (TICKET-027) End-to-end resume validation. notFound flips true when
  // the caller passed a resumeId, neither localStorage nor DB had any row
  // for it, and the hook fell back to a fresh session. ChatAgent reads
  // this to show a friendly "会话不存在或已过期" notice instead of stranding
  // the user on a blank page.
  const [notFound, setNotFound] = useState<boolean>(false);

  // §C (TICKET-027) On first mount, if the caller did NOT pass a resumeId
  // (= fresh session minted client-side), push session_id into the URL via
  // history.replaceState so the user can copy-paste / share the link to
  // restore the same conversation from another device. We only do this
  // when location.search has no `session=` param so we don't churn URLs
  // every render.
  useEffect(() => {
    if (resumeId) return; // resume path — URL already carries the id
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('session')) return; // already present, no-op
      url.searchParams.set('session', sessionIdRef.current);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch { /* SSR / sandboxed iframes — silent */ }
    // resumeId is sourced from useRef at first render; safe to ignore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appendMessage = useCallback((msg: Partial<ChatMessage> & { role: ChatRole; content: string }) => {
    setSession(prev => {
      const next: ChatSession = {
        ...prev,
        messages:   [...prev.messages, {
          id:        msg.id        ?? newId(),
          role:      msg.role,
          content:   msg.content,
          timestamp: msg.timestamp ?? Date.now(),
          meta:      msg.meta,
        }],
        updated_at: Date.now(),
      };
      persistSession(next);
      return next;
    });
  }, []);

  // Append in-place token to the last AI message (streaming UX).
  const appendStreamToken = useCallback((token: string) => {
    setSession(prev => {
      if (prev.messages.length === 0) return prev;
      const last = prev.messages[prev.messages.length - 1];
      if (last.role !== 'ai') return prev;
      const updatedLast: ChatMessage = { ...last, content: last.content + token };
      const next: ChatSession = {
        ...prev,
        messages:   [...prev.messages.slice(0, -1), updatedLast],
        updated_at: Date.now(),
      };
      persistSession(next);
      return next;
    });
  }, []);

  // Bumped on every choose so the DB-upsert effect runs at that "key node"
  // even when the messages-count threshold (5) hasn't been crossed yet.
  const [chooseTick, setChooseTick] = useState(0);
  const chooseProposal = useCallback((messageId: string, choice: ProposalChoice) => {
    setSession(prev => {
      const next: ChatSession = {
        ...prev,
        messages: prev.messages.map(m =>
          m.id === messageId
            ? { ...m, meta: { ...(m.meta ?? {}), chosen: choice } }
            : m
        ),
        updated_at: Date.now(),
      };
      persistSession(next);
      return next;
    });
    setChooseTick(t => t + 1);
  }, []);

  // ── DB upsert effect: every 5 messages OR on chooseProposal key node ───
  const lastUpsertCountRef = useRef<number>(session.messages.length);
  useEffect(() => {
    const count = session.messages.length;
    const delta = count - lastUpsertCountRef.current;
    if (delta >= 5 || chooseTick > 0) {
      lastUpsertCountRef.current = count;
      // Fire-and-forget — never blocks the UI; silent on failure.
      dbUpsertSession(session).catch(() => {});
    }
    // chooseTick included so the effect re-runs on adoption even when
    // messages.length didn't cross the 5-message threshold.
  }, [session.messages.length, chooseTick, session]);

  // ── DB restore on mount: only when caller passed an explicit resumeId
  //    AND localStorage didn't already have that session cached. The hook
  //    silently degrades if chat_sessions table isn't there.
  useEffect(() => {
    if (!resumeId) return;
    const cached = localStorage.getItem(storageKey(resumeId));
    if (cached) return; // localStorage wins as fast-path
    let cancelled = false;
    (async () => {
      const fromDb = await dbLoadSession(resumeId);
      if (cancelled) return;
      if (!fromDb) {
        // §C (TICKET-027) Resume requested but nothing on disk OR in DB:
        // mark notFound so the UI can show a friendly notice. The fallback
        // session (already in state from buildInitialSession) stays so the
        // user can still chat — they just start fresh under the same id.
        setNotFound(true);
        return;
      }
      setSession(fromDb);
      persistSession(fromDb);
    })();
    return () => { cancelled = true; };
    // resumeId is sourced from useRef so the dep is stable; lint is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  // ── TICKET-017 §A.1 — chat-session-get edge function hydration
  //    Fresh mount path (no resumeId): try GET /functions/v1/chat-session-get
  //    to fetch the user's most-recent server-side session. If returned
  //    messages[] is non-empty AND localStorage didn't already have content
  //    for the current sessionId, hydrate the in-memory session with those
  //    messages so the user resumes their last conversation.
  //
  //    Why this is best-effort only: edge function schema is HANDOFF §2
  //    (started_at/last_at/intent_tag) but migration 028 actual schema is
  //    created_at/updated_at/intent_history — edge fn already detects this
  //    and returns { schema_pending: true, messages: [] }. We hydrate when
  //    we get real messages and silently no-op otherwise.
  //
  //    Important: this does NOT replace the existing supabase.from(...).upsert
  //    persistence layer above — that one writes directly via PostgREST and
  //    has been working since TICKET-027/044. This adds a thin edge-fn READ
  //    pass on first mount, that's it. §A.2 (chat-session-append) and §A.3
  //    (chat-session-end) edge fns have incompatible payload shapes vs the
  //    current frontend model (no session_id / mode / proposals / chosen
  //    parameters), so they remain blocked until Architect aligns contracts.
  useEffect(() => {
    if (resumeId) return; // resume path handled above
    const sid = sessionIdRef.current;
    const cached = localStorage.getItem(storageKey(sid));
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as ChatSession;
        if (parsed.messages?.some(m => m.role !== 'system')) return; // already has real content
      } catch { /* fall through to fetch */ }
    }
    const uid = getUserId();
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('chat-session-get', {
          method: 'GET',
        } as any);
        if (cancelled || error || !data) return;
        const msgs = Array.isArray((data as any).messages) ? (data as any).messages : [];
        if (msgs.length === 0) return; // empty or schema_pending — no-op
        // Hydrate: keep the current session id (URL is already set to it),
        // graft server messages in. Server messages use {role, text} or
        // {role, content} shape — normalize to ChatMessage.
        setSession(prev => {
          const normalized: ChatMessage[] = msgs.map((m: any, idx: number) => ({
            id:        typeof m.id === 'string' ? m.id : `srv_${idx}_${Date.now()}`,
            role:      (m.role === 'user' || m.role === 'ai' || m.role === 'system' || m.role === 'assistant')
                         ? (m.role === 'assistant' ? 'ai' : m.role) as ChatRole
                         : 'ai',
            content:   typeof m.content === 'string' ? m.content
                       : typeof m.text === 'string' ? m.text : '',
            timestamp: typeof m.ts === 'number' ? m.ts
                       : typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
          }));
          // Skip if server returned no real content after normalization.
          if (!normalized.some(m => m.content.trim().length > 0)) return prev;
          const next: ChatSession = {
            ...prev,
            messages:   [...prev.messages, ...normalized],
            updated_at: Date.now(),
          };
          persistSession(next);
          return next;
        });
      } catch { /* network / edge-fn down — silent, in-memory session still works */ }
    })();
    return () => { cancelled = true; };
    // sessionIdRef stable across renders; resumeId path returns early above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { session, appendMessage, appendStreamToken, chooseProposal, notFound };
}
