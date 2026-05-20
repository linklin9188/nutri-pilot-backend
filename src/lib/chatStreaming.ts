/**
 * chatStreaming — SPEC §4 streaming consumer.
 *
 * v1 is a hardcoded mock: yields one Chinese character every ~60ms so the
 * UI can demo the streaming cursor without depending on Backend's chat
 * endpoint (TICKET-014). Replace `streamChatMock` with `streamChat` (real
 * SSE consumer below) once gemini-proxy chat endpoint ships.
 *
 * The mock keeps the same async-iterator shape as the real implementation
 * so the UI call site `for await (const tok of streamChat(...))` doesn't
 * change when wiring the real backend.
 */
import type { ChatMessage } from '../hooks/useChatSession';

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
 * Mock streaming generator. Yields one character at a time with `tokenDelayMs`
 * gap between each. Cancels gracefully if the consumer breaks out of the loop.
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

/**
 * Real SSE consumer — disabled in v1 (Backend chat endpoint not ready).
 * Kept as a typed stub so the integration path is obvious; commit ④/Day 3
 * will flip the UI call site from streamChatMock to streamChat.
 */
export async function* streamChat(
  _messages: ChatMessage[],
  _intent?: string,
  _proposals?: unknown[]
): AsyncGenerator<string, void, void> {
  throw new Error('streamChat: real backend not wired yet — use streamChatMock');
  // istanbul ignore next — type-only sentinel so the function returns AsyncGenerator
  yield '';
}
