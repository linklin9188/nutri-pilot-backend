/**
 * ChatAgent — Day 2 主线，SPEC_day2_chat_agent.md §2-§6
 *
 * 单页承担 4 类 intent（chat_menu / chat_support_shipping / chat_support_quality
 * / chat_support_other），UI 只发请求，Backend 按 intent 路由 prompt。
 *
 * 本轮（commit ①）是 skeleton：
 *   - URL `?mode=today|week|preference` 决定开场白（SPEC §5）
 *   - 用 useChatSession 维护 messages + localStorage 持久化
 *   - 渲染消息列表 + 输入框 + 发送按钮（内联 minimal 样式）
 *   - 不调任何外部 API：用户消息直接 append，AI 占位回 ack
 *   - ChatBubble / MenuProposal 组件 commit ② 引入，流式 / proposals commit ③ 引入
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useChatSession, type ChatMode, type ProposalChoice } from '../hooks/useChatSession';
import { useWeeklyMenu } from '../hooks/useWeeklyMenu';
import { streamChat } from '../lib/chatStreaming';
import { generateThreeProposals } from '../lib/proposalEngine';
import BottomTabBar from '../components/BottomTabBar';
import ChatBubble from '../components/ChatBubble';
import MenuProposal from '../components/MenuProposal';

function parseModeParam(raw: string | null): ChatMode {
  if (raw === 'week' || raw === 'preference' || raw === 'today') return raw;
  return 'today';
}

export default function ChatAgent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const mode      = parseModeParam(searchParams.get('mode'));
  const sessionId = searchParams.get('session') ?? undefined;

  const { session, appendMessage, appendStreamToken, chooseProposal } = useChatSession(mode, sessionId);
  const { weeklyMenu } = useWeeklyMenu(0);
  const [streaming, setStreaming] = useState(false);

  function handleAdopt(messageId: string, choice: ProposalChoice) {
    chooseProposal(messageId, choice);
    // Day 3 will upsert user_weekly_menus (algo_version + cache_key) here
    // once Algorithm Day 2 lands the real seed-based generateWeekPlan.
  }
  const [draft, setDraft] = useState('');
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message on every append.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session.messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || streaming) return;
    appendMessage({ role: 'user', content: text });
    setDraft('');

    // Only attach 3-候选 proposals on the user's FIRST message (SPEC §5);
    // mode=preference would gather 6 turns first, but skeleton path keeps it
    // simple — first-message attach matches today/week and is benign for
    // preference (the user can ignore the card).
    const userMsgCount = session.messages.filter(m => m.role === 'user').length;
    const isFirstUserMessage = userMsgCount === 0;
    const proposals = isFirstUserMessage ? generateThreeProposals(weeklyMenu) : undefined;

    // Append the AI bubble up-front (empty content + proposals meta) so the
    // proposal card renders immediately while tokens stream into the bubble.
    appendMessage({
      role:    'ai',
      content: '',
      meta:    proposals && proposals.length > 0 ? { proposals } : undefined,
    });

    setStreaming(true);
    try {
      // Real gemini-proxy SSE; key stays in edge function (invariant #2).
      const turnMessages = [
        ...session.messages,
        { id: 'tmp', role: 'user', content: text, timestamp: Date.now() } as const,
      ];
      for await (const tok of streamChat(turnMessages, undefined, proposals)) {
        appendStreamToken(tok);
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#FAF7F2' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 px-4 pt-12 pb-3 bg-white/90 backdrop-blur-xl border-b border-black/[0.06]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(0,0,0,0.05)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black truncate" style={{ fontSize: 17 }}>AI 营养小助手</h1>
            <p className="truncate" style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
              {mode === 'today' && '今天 · 三套候选'}
              {mode === 'week' && '本周 · 三套方案'}
              {mode === 'preference' && '风格定制'}
            </p>
          </div>
        </div>
      </header>

      {/* Message list */}
      <main className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto pb-24">
        {session.messages.map((msg, idx) => {
          const isLatest    = idx === session.messages.length - 1;
          const isStreaming = streaming && isLatest && msg.role === 'ai';
          return (
            <div key={msg.id} className="flex flex-col gap-2">
              <ChatBubble message={msg} streaming={isStreaming} />
              {/* Proposal card piggybacks on the AI message that carries
                  meta.proposals — populated by proposalEngine on first turn. */}
              {msg.role === 'ai' && msg.meta?.proposals && msg.meta.proposals.length > 0 && (
                <MenuProposal
                  proposals={msg.meta.proposals}
                  chosen={msg.meta.chosen}
                  onAdopt={choice => handleAdopt(msg.id, choice)}
                />
              )}
            </div>
          );
        })}
        <div ref={scrollAnchorRef} />
      </main>

      {/* Composer */}
      <div className="fixed bottom-[88px] left-0 right-0 px-4 z-20">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-black/[0.06] flex items-center gap-2 px-3 py-2">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={mode === 'preference' ? '聊聊你想吃啥风格…' : '比如：下周想吃辣的，孩子怕辣…'}
            className="flex-1 px-2 py-1.5 outline-none bg-transparent"
            style={{ fontSize: 14 }}
          />
          <button onClick={handleSend} disabled={!draft.trim()}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30"
            style={{ background: '#FF5A1F' }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>arrow_upward</span>
          </button>
        </div>
      </div>

      <BottomTabBar />
    </div>
  );
}

