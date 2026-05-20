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

  const { session, appendMessage, chooseProposal } = useChatSession(mode, sessionId);

  function handleAdopt(messageId: string, choice: ProposalChoice) {
    chooseProposal(messageId, choice);
    // commit ③ will upsert user_weekly_menus here when proposals are real.
  }
  const [draft, setDraft] = useState('');
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message on every append.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session.messages.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    appendMessage({ role: 'user', content: text });
    setDraft('');
    // Skeleton ack — commit ③ will wire real streaming via chatStreaming.ts.
    setTimeout(() => {
      appendMessage({
        role:    'ai',
        content: '收到。AI 流式响应将在 commit ③ 接入，本轮先记一条占位回复。',
      });
    }, 200);
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
        {session.messages.map(msg => (
          <div key={msg.id} className="flex flex-col gap-2">
            <ChatBubble message={msg} />
            {/* Proposal card piggybacks on the AI message that carries proposals
                in its meta. commit ③ will set meta.proposals from proposalEngine. */}
            {msg.role === 'ai' && msg.meta?.proposals && msg.meta.proposals.length > 0 && (
              <MenuProposal
                proposals={msg.meta.proposals}
                chosen={msg.meta.chosen}
                onAdopt={choice => handleAdopt(msg.id, choice)}
              />
            )}
          </div>
        ))}
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

