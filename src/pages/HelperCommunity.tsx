/**
 * HelperCommunity — TICKET-044 §A + §B + §C + §D 菲佣社区 feed.
 *
 * 路由 /helper-community (RequireAuth helperRole 守, App.tsx). HelperHome
 * 的 "厨艺社区" tile route 改指此页. 不破老 Community.tsx (employer 端
 * community_posts 老路径仍在).
 *
 * 数据: migration 079 三张表 (helper_posts / helper_likes / helper_comments),
 * RLS anon FOR ALL USING (true), 应用层 .eq('liker_id', myUserId) 收口.
 * trigger 自维护 like_count / comment_count denormalized.
 *
 * 真实可用 (老板原话 §B):
 *  - 点 ❤️ 真触发 INSERT helper_likes (UNIQUE 防重), 第 2 次点 DELETE
 *  - 点 💬 展开评论列表 + 输入框 INSERT helper_comments (200 字限制)
 *  - 错误处理 toast, 不破 UI
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { useLanguage } from '../contexts/LanguageContext';

interface PostRow {
  id: string;
  helper_id: string;
  title: string | null;
  body: string;
  image_url: string | null;
  cooking_skill_level: number | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  user_profiles: { display_name: string | null; hometown_cuisine: string | null } | null;
}

interface CommentRow {
  id: string;
  post_id: string;
  commenter_id: string;
  body: string;
  created_at: string;
  user_profiles?: { display_name: string | null } | null;
}

const COMMENT_MAX = 200;

function timeAgo(iso: string, t3: (en: string, zh: string, tl: string) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)   return t3('just now', '刚刚',     'kakatapos lang');
  if (min < 60)  return `${min}${t3('m ago', '分钟前', ' min nakaraan')}`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr}${t3('h ago', '小时前', ' oras nakaraan')}`;
  const d = Math.floor(hr / 24);
  return `${d}${t3('d ago', '天前', ' araw nakaraan')}`;
}

function cuisineLabel(cuisine: string | null): string {
  if (!cuisine) return '';
  const MAP: Record<string, string> = {
    cantonese: '粤菜', sichuan: '川菜', jiangsu: '江浙', shandong: '鲁菜',
    hunan: '湘菜', fujian: '闽菜', anhui: '徽菜', zhejiang: '浙菜',
    northern: '北方菜', taiwanese: '台菜',
  };
  return MAP[cuisine] ?? cuisine;
}

export default function HelperCommunity() {
  const navigate = useNavigate();
  const { t3 } = useLanguage();
  const myUserId = getUserId() ?? '';

  const [posts, setPosts]               = useState<PostRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [myLikes, setMyLikes]           = useState<Set<string>>(new Set());
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentRow[]>>({});
  const [commentDraft, setCommentDraft] = useState('');
  const [toast, setToast]               = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // ── Initial load: 20 posts + my likes ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: postRows, error: postErr } = await supabase
        .from('helper_posts')
        .select('*, user_profiles(display_name, hometown_cuisine)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (postErr) {
        flash(t3('Failed to load feed', '加载失败', 'Hindi ma-load ang feed'));
        setLoading(false);
        return;
      }
      const rows = (postRows ?? []) as unknown as PostRow[];
      setPosts(rows);

      // Which of these posts have I liked?
      if (myUserId && rows.length > 0) {
        const ids = rows.map(r => r.id);
        const { data: likeRows } = await supabase
          .from('helper_likes')
          .select('post_id')
          .eq('liker_id', myUserId)
          .in('post_id', ids);
        if (!cancelled && likeRows) {
          setMyLikes(new Set(likeRows.map((r: any) => r.post_id)));
        }
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId]);

  // ── Like toggle (optimistic + INSERT/DELETE) ───────────────────────
  async function toggleLike(post: PostRow) {
    if (!myUserId) {
      flash(t3('Please sign in', '请先登录', 'Mag-sign in muna'));
      return;
    }
    const liked = myLikes.has(post.id);
    // optimistic flip
    setMyLikes(prev => {
      const next = new Set(prev);
      if (liked) next.delete(post.id); else next.add(post.id);
      return next;
    });
    setPosts(prev => prev.map(p =>
      p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count + (liked ? -1 : 1)) } : p
    ));

    if (liked) {
      const { error } = await supabase
        .from('helper_likes')
        .delete()
        .eq('post_id', post.id)
        .eq('liker_id', myUserId);
      if (error) {
        // rollback
        setMyLikes(prev => new Set(prev).add(post.id));
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, like_count: p.like_count + 1 } : p));
        flash(t3('Unlike failed', '取消点赞失败', 'Hindi nakansela'));
      }
    } else {
      const { error } = await supabase
        .from('helper_likes')
        .insert({ post_id: post.id, liker_id: myUserId });
      if (error) {
        // rollback (UNIQUE 冲突 = 重复点击, 也回滚 count 但 myLikes 已正确)
        setMyLikes(prev => { const n = new Set(prev); n.delete(post.id); return n; });
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count - 1) } : p));
        flash(t3('Like failed', '点赞失败', 'Hindi nakapag-like'));
      }
    }
  }

  // ── Comments: load on first expand, submit on Enter ────────────────
  async function toggleComments(post: PostRow) {
    if (expandedPostId === post.id) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(post.id);
    if (commentsByPost[post.id]) return; // already loaded
    const { data, error } = await supabase
      .from('helper_comments')
      .select('*, user_profiles(display_name)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    if (error) {
      flash(t3('Failed to load comments', '加载评论失败', 'Hindi ma-load ang komento'));
      return;
    }
    setCommentsByPost(prev => ({ ...prev, [post.id]: (data ?? []) as unknown as CommentRow[] }));
  }

  async function submitComment(post: PostRow) {
    const body = commentDraft.trim();
    if (!body) return;
    if (body.length > COMMENT_MAX) {
      flash(t3('Comment too long', '评论过长', 'Masyadong mahaba'));
      return;
    }
    if (!myUserId) {
      flash(t3('Please sign in', '请先登录', 'Mag-sign in muna'));
      return;
    }
    const { data, error } = await supabase
      .from('helper_comments')
      .insert({ post_id: post.id, commenter_id: myUserId, body })
      .select('*, user_profiles(display_name)')
      .single();
    if (error || !data) {
      flash(t3('Comment failed', '评论失败', 'Hindi nakomento'));
      return;
    }
    // optimistic: append + bump comment_count, clear draft
    setCommentsByPost(prev => ({
      ...prev,
      [post.id]: [...(prev[post.id] ?? []), data as unknown as CommentRow],
    }));
    setPosts(prev => prev.map(p =>
      p.id === post.id ? { ...p, comment_count: p.comment_count + 1 } : p
    ));
    setCommentDraft('');
  }

  return (
    <div className="min-h-screen max-w-md mx-auto pb-24"
      style={{ background: 'linear-gradient(180deg, #fff7ed 0%, #FAF6F0 100%)' }}>

      {/* Header */}
      <div className="sticky top-0 z-20 px-5 pt-5 pb-3 flex items-center gap-3"
        style={{ background: 'rgba(255,247,237,0.95)', backdropFilter: 'blur(8px)' }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: 'rgba(0,0,0,0.05)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#1a1a1a' }}>arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-serif font-black" style={{ fontSize: 22, color: '#1a1a1a', lineHeight: 1 }}>
            {t3('Cooking Community', '厨艺社区', 'Komunidad ng Pagluluto')}
          </h1>
          <p className="text-zinc-500 mt-1" style={{ fontSize: 11 }}>
            {t3('Helpers share their dishes & tips', '菲佣分享菜品与做菜心得', 'Mga helper na nagbabahagi')}
          </p>
        </div>
      </div>

      {/* Feed */}
      <div className="px-4 mt-3 flex flex-col gap-3">
        {loading && (
          <div className="text-center py-10 text-zinc-400" style={{ fontSize: 13 }}>
            {t3('Loading…', '加载中…', 'Naglo-load…')}
          </div>
        )}
        {!loading && posts.length === 0 && (
          <div className="text-center py-10 text-zinc-400" style={{ fontSize: 13 }}>
            {t3('No posts yet', '还没有帖子', 'Walang post pa')}
          </div>
        )}
        {posts.map(post => {
          const name = post.user_profiles?.display_name ?? t3('Helper', '菲佣', 'Helper');
          const initial = (name[0] ?? 'H').toUpperCase();
          const cuisine = cuisineLabel(post.user_profiles?.hometown_cuisine ?? null);
          const skill = post.cooking_skill_level ?? 3;
          const liked = myLikes.has(post.id);
          const expanded = expandedPostId === post.id;
          const comments = commentsByPost[post.id] ?? [];

          return (
            <div key={post.id} className="bg-white rounded-2xl p-4"
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              {/* Header: avatar + name + chip + ⭐ */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF8C54, #FF5A1F)', fontSize: 15 }}>
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold truncate" style={{ fontSize: 13, color: '#1a1a1a' }}>{name}</p>
                    {cuisine && (
                      <span className="px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F', fontSize: 10 }}>
                        {cuisine}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <span key={i} style={{ fontSize: 10, color: i <= skill ? '#FFB347' : 'rgba(0,0,0,0.10)' }}>★</span>
                    ))}
                    <span className="text-zinc-400 ml-1.5" style={{ fontSize: 10 }}>
                      {timeAgo(post.created_at, t3)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Title + body */}
              {post.title && (
                <p className="font-bold mt-3" style={{ fontSize: 16, color: '#1a1a1a', lineHeight: 1.35 }}>
                  {post.title}
                </p>
              )}
              <p className="text-zinc-700 mt-1.5 whitespace-pre-wrap" style={{ fontSize: 14, lineHeight: 1.55 }}>
                {post.body}
              </p>
              {post.image_url && (
                <img src={post.image_url} alt="" className="w-full mt-3 rounded-xl"
                  style={{ aspectRatio: '4/3', objectFit: 'cover' }} />
              )}

              {/* Footer: like + comment buttons */}
              <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button onClick={() => toggleLike(post)}
                  className="flex items-center gap-1.5 active:scale-95 transition-transform"
                  style={{ color: liked ? '#FF5A1F' : 'rgba(0,0,0,0.55)' }}>
                  <span style={{ fontSize: 18 }}>{liked ? '❤️' : '🤍'}</span>
                  <span className="font-semibold" style={{ fontSize: 13 }}>{post.like_count}</span>
                </button>
                <button onClick={() => toggleComments(post)}
                  className="flex items-center gap-1.5 active:scale-95 transition-transform text-zinc-600">
                  <span style={{ fontSize: 18 }}>💬</span>
                  <span className="font-semibold" style={{ fontSize: 13 }}>{post.comment_count}</span>
                </button>
              </div>

              {/* Comments expanded */}
              {expanded && (
                <div className="mt-3 pt-3 flex flex-col gap-2"
                  style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                  {comments.length === 0 && (
                    <p className="text-zinc-400" style={{ fontSize: 12 }}>
                      {t3('Be the first to comment', '抢沙发', 'Maging unang magkomento')}
                    </p>
                  )}
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                        style={{ background: '#FF8C54', fontSize: 10 }}>
                        {(c.user_profiles?.display_name ?? 'H')[0]?.toUpperCase() ?? 'H'}
                      </div>
                      <div className="flex-1">
                        <p style={{ fontSize: 11 }}>
                          <span className="font-bold text-zinc-700">{c.user_profiles?.display_name ?? t3('Helper', '菲佣', 'Helper')}</span>
                          <span className="text-zinc-400 ml-1.5">{timeAgo(c.created_at, t3)}</span>
                        </p>
                        <p className="text-zinc-700 mt-0.5" style={{ fontSize: 13, lineHeight: 1.5 }}>{c.body}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value.slice(0, COMMENT_MAX))}
                      onKeyDown={e => { if (e.key === 'Enter') submitComment(post); }}
                      placeholder={t3('Write a comment…', '写评论…', 'Magsulat ng komento…')}
                      maxLength={COMMENT_MAX}
                      className="flex-1 h-9 px-3 rounded-full outline-none"
                      style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', fontSize: 13 }}
                    />
                    <button onClick={() => submitComment(post)}
                      disabled={!commentDraft.trim()}
                      className="px-3 h-9 rounded-full font-semibold text-white active:scale-95 transition-transform disabled:opacity-40"
                      style={{ background: '#FF5A1F', fontSize: 12 }}>
                      {t3('Send', '发送', 'Ipadala')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white font-semibold z-50"
          style={{ bottom: 80, background: 'rgba(0,0,0,0.85)', fontSize: 12, boxShadow: '0 4px 18px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
