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
import { useLanguage } from '../contexts/LanguageContext';
import { useChatSession, type ChatMode, type ProposalChoice } from '../hooks/useChatSession';
import { useWeeklyMenu, ALGO_VERSION, getCacheKey, type WeeklyMenu } from '../hooks/useWeeklyMenu';
import { streamChat } from '../lib/chatStreaming';
import { generateThreeProposals, PROPOSAL_VARIANTS } from '../lib/proposalEngine';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
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

  const { t4 } = useLanguage();

  const { session, appendMessage, appendStreamToken, chooseProposal, notFound } = useChatSession(mode, sessionId);

  // TICKET-044 §C — recent-sessions sidebar. Fetched on demand so the user's
  // first chat doesn't pay the DB roundtrip. Forward-compatible: silent skip
  // if chat_sessions table isn't there yet.
  interface SessionPreview {
    id: string;
    mode: ChatMode;
    preview: string;     // first user message, truncated to 20 chars
    updated_at: number;  // ms epoch
  }
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [recentSessions, setRecentSessions] = useState<SessionPreview[]>([]);
  const [recentLoading, setRecentLoading]   = useState(false);
  useEffect(() => {
    if (!sidebarOpen) return;
    let cancelled = false;
    setRecentLoading(true);
    (async () => {
      try {
        const uid = getUserId();
        if (!uid) return;
        const { data, error } = await supabase
          .from('chat_sessions')
          .select('id, mode, messages, updated_at')
          .eq('user_id', uid)
          .order('updated_at', { ascending: false })
          .limit(10);
        if (cancelled) return;
        if (error || !data) return;
        const items: SessionPreview[] = (data as any[]).map(row => {
          const msgs = (row.messages ?? []) as { role: string; content: string }[];
          const firstUser = msgs.find(m => m.role === 'user');
          const preview = (firstUser?.content ?? '(空对话)').slice(0, 20);
          const ts = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : Number(row.updated_at) || Date.now();
          return { id: row.id, mode: row.mode as ChatMode, preview, updated_at: ts };
        });
        setRecentSessions(items);
      } catch { /* silent — sidebar shows "暂无历史" */ }
      finally { if (!cancelled) setRecentLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sidebarOpen]);
  function relativeTime(ms: number): string {
    const diff = Math.max(0, Date.now() - ms);
    const m = Math.floor(diff / 60000);
    if (m < 1)   return '刚刚';
    if (m < 60)  return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h} 小时前`;
    const d = Math.floor(h / 24);
    if (d < 30)  return `${d} 天前`;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const { weeklyMenu } = useWeeklyMenu(0);
  const [streaming, setStreaming] = useState(false);

  // TICKET-017 §B — festival-now chip
  //   GET /functions/v1/festival-now → { festival, kind: 'lunar' | 'solar_term', tags, as_of }
  //   30 min sessionStorage TTL, fetch fail / empty → chip 不出。kind=lunar 用 🎉 / kind=solar_term 用 🌿。
  interface FestivalChip { label: string; kind: 'lunar' | 'solar_term' }
  const [festivalChip, setFestivalChip] = useState<FestivalChip | null>(null);
  useEffect(() => {
    const CACHE_KEY = 'festival_now_cache';
    const TTL_MS = 30 * 60 * 1000;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.at && Date.now() - parsed.at < TTL_MS && parsed.chip) {
          setFestivalChip(parsed.chip);
          return;
        }
      }
    } catch { /* corrupt cache — fall through to fetch */ }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('festival-now', { method: 'GET' });
        if (cancelled || error || !data) return;
        const festival = typeof data.festival === 'string' ? data.festival : '';
        const kind = data.kind === 'lunar' ? 'lunar' : 'solar_term';
        if (!festival) return;
        const chip: FestivalChip = { label: festival, kind };
        setFestivalChip(chip);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), chip })); }
        catch { /* quota — non-fatal */ }
      } catch { /* network fail — chip 不出, ChatAgent 正常 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // TICKET-040 §C — explicit intent class picker for the "客服合一入口".
  // Default 'chat_menu' matches SPEC §B; Backend chat endpoint routes prompt
  // + per-class throttle based on this. Sent via streamChat's sessionMeta arg.
  type IntentClass = 'chat_menu' | 'chat_support_shipping' | 'chat_support_quality' | 'chat_support_other';
  const [intentClass, setIntentClass] = useState<IntentClass>('chat_menu');
  // §B (TICKET-030) Inflight adoption — disables MenuProposal CTA on all
  // proposal cards so a second tap during the 3-second countdown is a no-op.
  const [adopting, setAdopting] = useState(false);
  // §B (TICKET-030) Toast — `kind` controls color. `null` hides the surface.
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; msg: string } | null>(null);

  // §B (TICKET-030) Dedup helper — read the per-week "已采用 X" sentinel so
  // a returning user (different chat session, same week) sees the proposal
  // card pre-marked as adopted instead of being able to re-tap and overwrite.
  function readWeekAdopted(weekStart: string | undefined): ProposalChoice | null {
    if (!weekStart) return null;
    try {
      const raw = localStorage.getItem(`chat_adopted_week_${weekStart}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const c = parsed?.choice;
      return c === 'A' || c === 'B' || c === 'C' ? c : null;
    } catch { return null; }
  }

  async function handleAdopt(messageId: string, choice: ProposalChoice) {
    // §B Debounce: in-flight adoption blocks subsequent taps.
    if (adopting) return;
    // Resolve the chosen proposal off the message's meta.
    const msg = session.messages.find(m => m.id === messageId);
    const proposals = msg?.meta?.proposals;
    if (!proposals || proposals.length === 0) return;
    const idx = (['A','B','C'] as const).indexOf(choice);
    const chosenPlan = proposals[Math.min(idx, proposals.length - 1)] as WeeklyMenu | undefined;
    if (!chosenPlan) return;

    setAdopting(true);

    // 1) Mark chosen on the ChatSession (also bumps chat_sessions key-node upsert).
    chooseProposal(messageId, choice);

    // 2) Compute the exact lsKey useWeeklyMenu will compare against on /weekly
    //    mount; this prevents the adopted menu from being judged stale.
    const userId = getUserId() ?? 'anonymous';
    const lsKey  = getCacheKey(chosenPlan.weekStart);

    // 3) Mirror saveToDB's row shape — dinner / lunch / breakfast / fruit
    //    per day, with algo_version + cache_key columns.
    const rows = chosenPlan.days.flatMap(day => [
      {
        user_id:      userId,
        week_start:   chosenPlan.weekStart,
        day_index:    day.dayIndex,
        meal_type:    'dinner',
        dish_ids:     day.dishes.map(d => d.id),
        algo_version: ALGO_VERSION,
        cache_key:    lsKey,
      },
      ...(day.lunchDishes.length > 0 ? [{
        user_id:      userId,
        week_start:   chosenPlan.weekStart,
        day_index:    day.dayIndex,
        meal_type:    'lunch',
        dish_ids:     day.lunchDishes.map(d => d.id),
        algo_version: ALGO_VERSION,
        cache_key:    lsKey,
      }] : []),
      ...(day.breakfastDishes && day.breakfastDishes.length > 0 ? [{
        user_id:      userId,
        week_start:   chosenPlan.weekStart,
        day_index:    day.dayIndex,
        meal_type:    'breakfast',
        dish_ids:     day.breakfastDishes.map(d => d.id),
        algo_version: ALGO_VERSION,
        cache_key:    lsKey,
      }] : []),
      ...(day.fruitDish ? [{
        user_id:      userId,
        week_start:   chosenPlan.weekStart,
        day_index:    day.dayIndex,
        meal_type:    'fruit',
        dish_ids:     [day.fruitDish.id],
        algo_version: ALGO_VERSION,
        cache_key:    lsKey,
      }] : []),
    ]);

    // §B Capture BOTH the supabase REST error AND any thrown network error.
    // supabase-js doesn't throw on REST 4xx/5xx — it returns { error } — so
    // we must read the response shape AND wrap in try/catch for network drop.
    let upsertFailed = false;
    try {
      const { error } = await supabase
        .from('user_weekly_menus')
        .upsert(rows, { onConflict: 'user_id,week_start,day_index,meal_type' });
      if (error) upsertFailed = true;
    } catch { upsertFailed = true; }

    if (upsertFailed) {
      // §B Retry path — toast + re-enable so the user can tap again.
      setToast({ kind: 'error', msg: '采纳失败，可重试' });
      setAdopting(false);
      setTimeout(() => setToast(null), 4000);
      return;
    }

    // 4) Mirror the adopted menu into localStorage so useWeeklyMenu's
    //    Step-2 cache hit also serves the chat-adopted plan even before
    //    the DB upsert has propagated to subsequent reads.
    try { localStorage.setItem(lsKey, JSON.stringify(chosenPlan)); }
    catch { /* quota — DB still wins on next mount */ }

    // 5) Per-week sentinel for the dedup readback below.
    try {
      localStorage.setItem(
        `chat_adopted_week_${chosenPlan.weekStart}`,
        JSON.stringify({ choice, sessionId: session.id, at: Date.now() }),
      );
    } catch { /* quota */ }

    // §B Success toast + 3-second delayed navigation so the user actually
    // reads the confirmation instead of being yanked instantly.
    setToast({ kind: 'info', msg: `✓ 已采用方案 ${choice} → 跳转菜单页 (3 秒)` });
    setTimeout(() => navigate('/weekly'), 3000);
  }
  const [draft, setDraft] = useState('');
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message on every append AND every streamed
  // token (TICKET-030 §D fix): appendStreamToken grows the last message in
  // place without changing messages.length, so a length-only dep missed
  // mid-stream growth and long replies fell out of view. Including
  // session.updated_at (bumps on every token) restores follow-along. 'auto'
  // behavior avoids queueing 60ms smooth-scroll animations.
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [session.messages.length, session.updated_at]);

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
      // TICKET-040 §C — pass user_intent_class to Backend via sessionMeta so
      // gemini-proxy/chat routes prompt + throttle per class.
      for await (const tok of streamChat(turnMessages, undefined, proposals, { user_intent_class: intentClass })) {
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
          {/* TICKET-044 §C — hamburger toggle for the recent-sessions sidebar */}
          <button onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'rgba(0,0,0,0.05)' }}
            title="历史会话">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>history</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-black truncate" style={{ fontSize: 17 }}>
              {t4('AI Nutrition Buddy', 'AI 营养小助手', 'AI Tagapayo sa Nutrisyon', 'AI Pakar Nutrisi')}
            </h1>
            <p className="truncate" style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
              {mode === 'today'      && t4('Today · 3 candidates',    '今天 · 三套候选', 'Ngayon · 3 piliin',  'Hari ini · 3 pilihan')}
              {mode === 'week'       && t4('This week · 3 plans',     '本周 · 三套方案', 'Linggo · 3 plano',   'Minggu · 3 rencana')}
              {mode === 'preference' && t4('Style customization',     '风格定制',         'Pasadyang istilo',    'Kustomisasi gaya')}
            </p>
          </div>
        </div>
        {/* TICKET-017 §B — 节庆 / 节气 chip (fetch /functions/v1/festival-now, 30min cache) */}
        {festivalChip && (
          <div className="mt-2 flex">
            <span className="rounded-full px-2 py-0.5 inline-flex items-center gap-1"
              style={{ background: 'rgba(255,165,0,0.12)', color: '#B45309', fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,165,0,0.25)' }}>
              <span>{festivalChip.kind === 'lunar' ? '🎉' : '🌿'}</span>
              <span>今天是 {festivalChip.label}</span>
            </span>
          </div>
        )}
      </header>

      {/* §B (TICKET-030) Adopt toast — info on success (3-sec countdown
          before navigate), error on upsert failure (4-sec auto-dismiss). */}
      {toast && (
        <div
          className="mx-4 mt-3 rounded-2xl px-3 py-2 flex items-start gap-2"
          style={{
            background: toast.kind === 'error'
              ? 'rgba(220,38,38,0.12)'
              : 'rgba(37,211,102,0.12)',
            border: toast.kind === 'error'
              ? '1px solid rgba(220,38,38,0.30)'
              : '1px solid rgba(37,211,102,0.30)',
          }}
        >
          <span
            className="material-symbols-outlined shrink-0"
            style={{
              fontSize: 18,
              color: toast.kind === 'error' ? '#B91C1C' : '#15803D',
              marginTop: 1,
              fontVariationSettings: "'FILL' 1",
            }}
          >
            {toast.kind === 'error' ? 'error' : 'check_circle'}
          </span>
          <p style={{
            fontSize: 12,
            color: toast.kind === 'error' ? '#7F1D1D' : '#14532D',
            lineHeight: 1.5,
            fontWeight: 600,
          }}>
            {toast.msg}
          </p>
        </div>
      )}

      {/* §C (TICKET-027) Resume-not-found notice — shows when the URL had
          ?session=<uuid> but neither localStorage nor chat_sessions had a
          row for it. The user falls into a fresh session under the same id;
          this banner explains why their history is empty instead of leaving
          them on a blank page. */}
      {notFound && (
        <div
          className="mx-4 mt-3 rounded-2xl px-3 py-2 flex items-start gap-2"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.30)' }}
        >
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, color: '#B45309', marginTop: 1 }}>
            info
          </span>
          <p style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
            {t4(
              'Session not found or expired. Start a new chat — the new session id is already in the URL.',
              '会话不存在或已过期。可以从这里开始新的对话，新会话 id 已自动写入网址。',
              'Hindi nakita ang sesyon o nag-expire. Magsimula ng bago — nasa URL na ang bagong session id.',
              'Sesi tidak ditemukan atau kedaluwarsa. Mulai obrolan baru — id sesi baru sudah ada di URL.',
            )}
          </p>
        </div>
      )}

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
                  // §B (TICKET-030) Dedup pre-fill: if THIS chat session
                  // already marked a choice → use it; otherwise read the
                  // per-week sentinel so a different chat session for the
                  // same week reflects the adoption too.
                  chosen={msg.meta.chosen ?? readWeekAdopted(msg.meta.proposals[0]?.weekStart) ?? undefined}
                  disabled={adopting}
                  onAdopt={choice => handleAdopt(msg.id, choice)}
                  // §A (TICKET-034) Tag each tab with its semantic variant
                  // so the user reads "均衡 / 应季 / 偏好放大" instead of
                  // three identical-looking shuffles.
                  variants={PROPOSAL_VARIANTS}
                />
              )}
            </div>
          );
        })}
        <div ref={scrollAnchorRef} />
      </main>

      {/* TICKET-040 §C — Intent chips bar (4 categories: menu / shipping /
          quality / other). Sits right above the composer, scrolls horizontally
          on small viewports. Backend routes prompt + throttle per class. */}
      <div className="fixed bottom-[136px] left-0 right-0 px-4 z-20 pointer-events-none">
        <div className="max-w-md mx-auto flex gap-1.5 overflow-x-auto pointer-events-auto"
          style={{ scrollbarWidth: 'none' }}>
          {([
            { id: 'chat_menu',             label: t4('Menu',     '菜单',     'Menu',          'Menu')              },
            { id: 'chat_support_shipping', label: t4('Shipping', '采购快递', 'Pagpapadala',    'Pengiriman')        },
            { id: 'chat_support_quality',  label: t4('Quality',  '质量问题', 'Kalidad',        'Kualitas')          },
            { id: 'chat_support_other',    label: t4('Other',    '其他',     'Iba pa',         'Lainnya')           },
          ] as { id: IntentClass; label: string }[]).map(({ id, label }) => {
            const active = id === intentClass;
            return (
              <button key={id} onClick={() => setIntentClass(id)}
                className="rounded-full px-3 py-1.5 font-bold active:scale-95 transition-all shrink-0"
                style={{
                  fontSize: 11.5,
                  background: active ? '#FF5A1F' : 'white',
                  color:      active ? 'white' : 'rgba(0,0,0,0.55)',
                  border:    `1px solid ${active ? '#FF5A1F' : 'rgba(0,0,0,0.10)'}`,
                  boxShadow:  active ? '0 4px 12px rgba(255,90,31,0.25)' : '0 2px 6px rgba(0,0,0,0.04)',
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      <div className="fixed bottom-[88px] left-0 right-0 px-4 z-20">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-black/[0.06] flex items-center gap-2 px-3 py-2">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={
              // TICKET-040 §C — placeholder follows the active intent chip
              // so the user reads the right prompt before typing.
              intentClass === 'chat_support_shipping'
                ? t4('e.g., my order was late by 2 days…', '比如：我下的单晚到了 2 天…', 'hal., naantala ng 2 araw ang order ko…', 'cth., pesanan terlambat 2 hari…')
                : intentClass === 'chat_support_quality'
                ? t4('e.g., the beef I bought last week turned brown…', '比如：上周买的牛肉变色了…', 'hal., nangitim ang baka na binili ko…', 'cth., daging sapi minggu lalu berubah warna…')
                : intentClass === 'chat_support_other'
                ? t4('Tell us what we can help with…', '聊聊你需要什么帮助…', 'Sabihin kung anong tulong…', 'Ceritakan butuh bantuan apa…')
                : mode === 'preference'
                ? t4("Tell me what style you'd like…", '聊聊你想吃啥风格…', 'Sabihin ang gusto mong istilo…', 'Ceritakan gaya yang kamu suka…')
                : t4('e.g., spicy next week but kid-friendly…', '比如：下周想吃辣的，孩子怕辣…', 'hal., maanghang ngunit bata-friendly…', 'cth., pedas tapi ramah anak…')
            }
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

      {/* TICKET-044 §C — Recent-sessions sidebar (left slide-in). Backdrop
          dismisses; row click navigates to that session id. "新对话" button
          mints a fresh session by stripping the ?session= URL param. */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setSidebarOpen(false)}
            style={{ background: 'rgba(0,0,0,0.40)' }} />
          <aside className="fixed top-0 bottom-0 left-0 z-[81] w-[80%] max-w-[320px] bg-white flex flex-col shadow-2xl"
            style={{ paddingTop: 'env(safe-area-inset-top, 24px)' }}>
            <div className="px-4 pt-4 pb-3 border-b border-black/[0.06] flex items-center justify-between">
              <p style={{ fontSize: 15, fontWeight: 700 }}>最近会话</p>
              <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                style={{ background: 'rgba(0,0,0,0.05)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close</span>
              </button>
            </div>
            {/* New chat */}
            <button onClick={() => {
                setSidebarOpen(false);
                // Strip ?session= so RootRedirect (or useChatSession 自动写) mints a fresh id.
                const url = new URL(window.location.href);
                url.searchParams.delete('session');
                window.location.href = url.toString();
              }}
              className="mx-3 mt-3 mb-1 rounded-2xl py-2.5 flex items-center justify-center gap-1.5 font-bold text-white active:scale-[0.98]"
              style={{ background: '#FF5A1F', fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_comment</span>
              新对话
            </button>
            {/* Sessions list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
              {recentLoading && (
                <p className="text-center py-6" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.40)' }}>加载中…</p>
              )}
              {!recentLoading && recentSessions.length === 0 && (
                <p className="text-center py-6" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.40)' }}>暂无历史会话</p>
              )}
              {recentSessions.map(s => {
                const active = s.id === session.id;
                const modeIcon = s.mode === 'week' ? 'calendar_month'
                              : s.mode === 'preference' ? 'tune'
                              : 'today';
                return (
                  <button key={s.id} onClick={() => {
                      setSidebarOpen(false);
                      navigate(`/chat?mode=${s.mode}&session=${encodeURIComponent(s.id)}`);
                    }}
                    className="rounded-xl px-3 py-2 flex items-start gap-2 text-left active:scale-[0.99] transition-all"
                    style={{
                      background: active ? 'rgba(255,90,31,0.08)' : 'transparent',
                      border:     active ? '1px solid rgba(255,90,31,0.20)' : '1px solid transparent',
                    }}>
                    <span className="material-symbols-outlined mt-0.5" style={{ fontSize: 16, color: active ? '#FF5A1F' : 'rgba(0,0,0,0.45)' }}>
                      {modeIcon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: '#1a1a1a' }}>
                        {s.preview || '(空对话)'}
                      </p>
                      <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.45)', marginTop: 1 }}>
                        {relativeTime(s.updated_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </>
      )}

      <BottomTabBar />
    </div>
  );
}

