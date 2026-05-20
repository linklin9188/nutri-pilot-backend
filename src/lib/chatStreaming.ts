/**
 * chatStreaming — SPEC §4 streaming consumer.
 *
 * Default export `streamChat` posts to /functions/v1/gemini-proxy with
 * endpoint='chat' and parses the SSE response. The Gemini API key stays
 * in the edge function (不变量 #2). The async-iterator shape matches the
 * legacy `streamChatMock` 1:1 so callers `for await (const tok of …)`
 * never need to know whether they're talking to mock or live.
 *
 * `streamChatMock` is kept exported for storybook / unit tests / dev
 * fallback; production code paths import `streamChat`.
 */
import type { ChatMessage } from '../hooks/useChatSession';
import { getUserId } from './userId';

interface StreamOptions {
  /** ms between tokens — 60 mirrors Gemini-2.5-flash live token cadence */
  tokenDelayMs?: number;
  /** Override the mock reply (testing) */
  overrideReply?: string;
}

const DEFAULT_REPLY = [
  '明白，我给你三套方案：',
  '方案 A — 偏中性，候选均匀分布；',
  '方案 B — 偏家乡 + 重口，集中安排；',
  '方案 C — 偏健康目标 + 轻口，平铺整周。',
  '选一个我直接给你存到这周菜单。',
].join('\n');

/**
 * Mock streaming generator (kept for dev / storybook / unit tests).
 */
export async function* streamChatMock(
  _userMessages: ChatMessage[],
  options: StreamOptions = {}
): AsyncGenerator<string, void, void> {
  const delay = options.tokenDelayMs ?? 60;
  const reply = options.overrideReply ?? DEFAULT_REPLY;
  for (const ch of reply) {
    yield ch;
    await new Promise<void>(resolve => setTimeout(resolve, delay));
  }
}

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`;
const ANON_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Extract Gemini SSE event payload `text`. Falls back to raw string. */
function extractText(payload: string): string {
  if (!payload || payload === '[DONE]') return '';
  try {
    const parsed: any = JSON.parse(payload);
    // Gemini v1beta shape: candidates[0].content.parts[0].text
    const t1 = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof t1 === 'string') return t1;
    // Custom edge-function shape: { text: '...' } or { token: '...' }
    if (typeof parsed?.text  === 'string') return parsed.text;
    if (typeof parsed?.token === 'string') return parsed.token;
    if (typeof parsed?.delta === 'string') return parsed.delta;
    return '';
  } catch {
    // Non-JSON data line — yield raw
    return payload;
  }
}

/**
 * Real SSE consumer hitting gemini-proxy/chat. Yields text deltas as they
 * arrive. Network / HTTP / parse errors are swallowed: instead the
 * generator yields a single Chinese error message and returns, so the
 * UI never sees an unhandled rejection.
 */
export async function* streamChatReal(
  messages:   ChatMessage[],
  intent?:    string,
  proposals?: unknown[],
  sessionMeta?: Record<string, unknown>,
): AsyncGenerator<string, void, void> {
  const userId = getUserId() ?? 'anonymous';
  let res: Response;
  try {
    res = await fetch(PROXY_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'text/event-stream',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        endpoint:     'chat',
        user_id:      userId,
        messages,
        intent,
        proposals,
        session_meta: sessionMeta,
      }),
    });
  } catch {
    yield '网络中断，请稍后重试。';
    return;
  }

  if (res.status === 429) {
    yield 'AI 额度已用完，明日再试。';
    return;
  }
  if (!res.ok) {
    yield 'AI 暂时无法回复，请稍后再试。';
    return;
  }

  // No body → nothing to stream (defensive; modern fetch always provides one).
  if (!res.body) {
    yield 'AI 响应为空，请重试。';
    return;
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE event delimiter is a blank line (\n\n). Anything after the last
      // delimiter stays in buffer until we see the next chunk.
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const ev of events) {
        // Each event is multiple lines; we care about `data: …` lines only.
        const dataLines = ev
          .split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).replace(/^ /, ''));
        if (dataLines.length === 0) continue;
        const payload = dataLines.join('\n');
        if (payload === '[DONE]') return;
        const text = extractText(payload);
        if (text) yield text;
      }
    }
    // Flush any tail event (no trailing \n\n).
    if (buffer.trim()) {
      const text = extractText(buffer.replace(/^data:\s*/, ''));
      if (text) yield text;
    }
  } catch {
    yield '\n[传输中断]';
    return;
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

/**
 * Production export — default to the real gemini-proxy stream. Dev/test
 * callers can import `streamChatMock` explicitly to opt out.
 */
export const streamChat = streamChatReal;
