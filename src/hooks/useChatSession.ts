/**
 * useChatSession — Day 2 ChatAgent (SPEC §3)
 *
 * Single-session chat state with localStorage persistence. v1 keeps data
 * in localStorage only (DB persistence is Day 3 work, SPEC §3.1). Each
 * mode (`today` / `week` / `preference`) seeds its own first system message
 * via SPEC §5 so the user lands on intent.
 */
import { useState, useCallback, useRef } from 'react';
import { getUserId } from '../lib/userId';
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

export function useChatSession(mode: ChatMode = 'today', resumeId?: string) {
  // Stable session id (resume from URL or mint fresh). useRef keeps it
  // stable across renders without re-seeding on every render.
  const sessionIdRef = useRef<string>(resumeId ?? newId());

  const [session, setSession] = useState<ChatSession>(() =>
    loadSession(sessionIdRef.current, mode)
  );

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
  }, []);

  return { session, appendMessage, appendStreamToken, chooseProposal };
}
