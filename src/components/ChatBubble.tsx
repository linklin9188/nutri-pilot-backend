/**
 * ChatBubble — single message bubble for the ChatAgent timeline.
 *
 * Renders user / ai / system messages with role-aware styling. A blinking
 * caret is appended when the AI message is the current streaming target
 * (commit ③ wires the streaming flag from chatStreaming.ts).
 */
import type { ChatMessage, ChatRole } from '../hooks/useChatSession';

interface Props {
  message:    ChatMessage;
  streaming?: boolean;
}

function styleForRole(role: ChatRole) {
  if (role === 'user') {
    return {
      background: '#FF5A1F',
      color:      'white',
      shadow:     'none',
    };
  }
  if (role === 'system') {
    return {
      background: 'rgba(0,0,0,0.05)',
      color:      '#1a1a1a',
      shadow:     'none',
    };
  }
  return {
    background: 'white',
    color:      '#1a1a1a',
    shadow:     '0 2px 8px rgba(0,0,0,0.04)',
  };
}

export default function ChatBubble({ message, streaming }: Props) {
  const isUser = message.role === 'user';
  const s = styleForRole(message.role);
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="rounded-2xl px-4 py-2.5 max-w-[80%]"
        style={{
          background: s.background,
          color:      s.color,
          fontSize:   14,
          lineHeight: 1.55,
          boxShadow:  s.shadow,
          whiteSpace: 'pre-wrap',
          wordBreak:  'break-word',
        }}
      >
        {message.content}
        {streaming && message.role === 'ai' && (
          <span
            className="inline-block ml-0.5 animate-pulse"
            style={{
              width: 6,
              height: 14,
              background: 'rgba(0,0,0,0.55)',
              verticalAlign: 'middle',
              borderRadius: 1,
            }}
            aria-label="streaming"
          />
        )}
      </div>
    </div>
  );
}
