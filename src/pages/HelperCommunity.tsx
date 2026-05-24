/**
 * HelperCommunity — TICKET-044 §A + §B + §C + §D 菲佣社区 feed.
 * TICKET-037 P1 §3 小红书风升级: 双列瀑布流 + 标签 tab + 今日热门 section.
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
 *  - 点 💬 进入帖子详情 (modal) + 输入框 INSERT helper_comments (200 字限制)
 *  - 错误处理 toast, 不破 UI
 *
 * 小红书化 (037):
 *  - 双列瀑布流: grid-cols-2 gap-3, 卡片不等高
 *  - 顶部 chip tab: 全部 / 做菜技巧 / 美食 / 求助 / 闲聊
 *    分类来源: post.body 里的 #hashtag (client-side parse)
 *  - 今日热门: 当日 (今天) likes desc top 3, 独立 banner section
 *  - 卡片样式: 大图 (top) + title + 头像小行 + likes count
 *  - 详情 modal: 点卡片展开完整 body + 评论区 (替代原 inline expand)
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { useLanguage } from '../contexts/LanguageContext';
import HelperTabBar from '../components/HelperTabBar';

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

// ── Category 分类: 从 body #hashtag 解析 ─────────────────────────────
type CategoryId = 'all' | 'skill' | 'food' | 'help' | 'chat';

interface CategoryDef {
  id: CategoryId;
  en: string;
  zh: string;
  tl: string;
  // 命中关键词 (中/英任一即归类)
  hashtags: string[];
}

const CATEGORIES: CategoryDef[] = [
  { id: 'all',   en: 'All',     zh: '全部',     tl: 'Lahat',     hashtags: [] },
  { id: 'skill', en: 'Skills',  zh: '做菜技巧', tl: 'Mga Tip',   hashtags: ['技巧', '心得', 'tip', 'skill', '教程', '做法'] },
  { id: 'food',  en: 'Food',    zh: '美食',     tl: 'Pagkain',   hashtags: ['美食', '菜谱', 'food', 'recipe', '分享'] },
  { id: 'help',  en: 'Help',    zh: '求助',     tl: 'Tulong',    hashtags: ['求助', 'help', '问', 'question', '请教'] },
  { id: 'chat',  en: 'Chat',    zh: '闲聊',     tl: 'Chat',      hashtags: ['闲聊', '日常', 'chat', 'life', '生活'] },
];

/** parse hashtags out of body text; lowercased; returns set of raw tag strings */
function parseHashtags(body: string): string[] {
  const matches = body.match(/#([^\s#]+)/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/^#/, '').toLowerCase());
}

/** classify a post → category id (first hit wins, fallback 'chat') */
function classifyPost(post: PostRow): CategoryId {
  const tags = parseHashtags(post.body);
  if (tags.length === 0) return 'chat';
  for (const cat of CATEGORIES) {
    if (cat.id === 'all') continue;
    for (const tag of tags) {
      if (cat.hashtags.some(kw => tag.includes(kw.toLowerCase()))) {
        return cat.id;
      }
    }
  }
  return 'chat';
}

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

/** is the given ISO timestamp 'today' (local timezone)? */
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
}

/** strip leading hashtags + trim, get first N chars as preview */
function previewText(body: string, n: number): string {
  const stripped = body.replace(/#[^\s#]+/g, '').trim();
  if (stripped.length <= n) return stripped;
  return stripped.slice(0, n) + '…';
}

export default function HelperCommunity() {
  const navigate = useNavigate();
  const { t3 } = useLanguage();
  const myUserId = getUserId() ?? '';

  const [posts, setPosts]               = useState<PostRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [myLikes, setMyLikes]           = useState<Set<string>>(new Set());
  const [activeCat, setActiveCat]       = useState<CategoryId>('all');
  const [openPostId, setOpenPostId]     = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentRow[]>>({});
  const [commentDraft, setCommentDraft] = useState('');
  const [toast, setToast]               = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // ── Initial load: 100 posts + my likes ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data: postRows, error: postErr } = await supabase
        .from('helper_posts')
        .select('*, user_profiles(display_name, hometown_cuisine)')
        .order('created_at', { ascending: false })
        .limit(100);
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

  // ── Derived: 今日热门 + 按 tab filter ─────────────────────────────
  const todayHot = useMemo<PostRow[]>(() => {
    return posts
      .filter(p => isToday(p.created_at))
      .slice()
      .sort((a, b) => b.like_count - a.like_count)
      .slice(0, 3);
  }, [posts]);

  const filteredPosts = useMemo<PostRow[]>(() => {
    if (activeCat === 'all') return posts;
    return posts.filter(p => classifyPost(p) === activeCat);
  }, [posts, activeCat]);

  const openPost = useMemo<PostRow | null>(
    () => posts.find(p => p.id === openPostId) ?? null,
    [posts, openPostId]
  );

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

  // ── Comments: load on open detail, submit on Enter ─────────────────
  async function openDetail(post: PostRow) {
    setOpenPostId(post.id);
    setCommentDraft('');
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

  function closeDetail() {
    setOpenPostId(null);
    setCommentDraft('');
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

  // ── Card component (双列瀑布流单卡) ──────────────────────────────
  function PostCard({ post, compact }: { post: PostRow; compact?: boolean }) {
    const name = post.user_profiles?.display_name ?? t3('Helper', '菲佣', 'Helper');
    const initial = (name[0] ?? 'H').toUpperCase();
    const liked = myLikes.has(post.id);
    const preview = previewText(post.body, compact ? 50 : 60);
    // 不等高: 用 image_url hash + skill 决定 aspect, 制造瀑布感
    const hashSeed = (post.id.charCodeAt(0) + post.id.charCodeAt(post.id.length - 1)) % 3;
    const imgAspect = hashSeed === 0 ? '3/4' : hashSeed === 1 ? '1/1' : '4/5';

    return (
      <div
        onClick={() => openDetail(post)}
        className="bg-white rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}
      >
        {post.image_url ? (
          <img
            src={post.image_url}
            alt=""
            className="w-full"
            style={{ aspectRatio: imgAspect, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          // 无图: 用渐变色块替代, 仍占位形成瀑布
          <div
            className="w-full flex items-center justify-center"
            style={{
              aspectRatio: imgAspect,
              background: hashSeed === 0
                ? 'linear-gradient(135deg, #FFE4D2, #FFB89A)'
                : hashSeed === 1
                ? 'linear-gradient(135deg, #FFD9C2, #FF8C54)'
                : 'linear-gradient(135deg, #FFF1E0, #FFC58A)',
            }}
          >
            <span style={{ fontSize: 36, opacity: 0.45 }}>🍳</span>
          </div>
        )}

        <div className="px-2.5 pt-2 pb-2.5">
          {/* Title or preview */}
          {post.title ? (
            <p className="font-bold text-zinc-800 line-clamp-2" style={{ fontSize: 13, lineHeight: 1.35 }}>
              {post.title}
            </p>
          ) : (
            <p className="text-zinc-700 line-clamp-2" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
              {preview}
            </p>
          )}

          {/* Helper row + like count */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #FF8C54, #FF5A1F)', fontSize: 9 }}
              >
                {initial}
              </div>
              <p className="text-zinc-500 truncate" style={{ fontSize: 10.5 }}>{name}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); toggleLike(post); }}
              className="flex items-center gap-0.5 active:scale-95 transition-transform flex-shrink-0 ml-1"
              style={{ color: liked ? '#FF5A1F' : 'rgba(0,0,0,0.45)' }}
            >
              <span style={{ fontSize: 13 }}>{liked ? '❤️' : '🤍'}</span>
              <span className="font-semibold" style={{ fontSize: 11 }}>{post.like_count}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 双列瀑布流分配 (奇偶分左右, 不强制等高) ────────────────────
  function splitTwoCols(arr: PostRow[]): [PostRow[], PostRow[]] {
    const left: PostRow[] = [];
    const right: PostRow[] = [];
    arr.forEach((p, i) => (i % 2 === 0 ? left : right).push(p));
    return [left, right];
  }
  const [colLeft, colRight] = splitTwoCols(filteredPosts);

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

      {/* Category tab chips */}
      <div className="px-4 mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => {
          const active = activeCat === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className="flex-shrink-0 px-3.5 h-8 rounded-full font-semibold active:scale-95 transition-all"
              style={{
                fontSize: 12,
                background: active ? '#FF5A1F' : 'rgba(255,255,255,0.85)',
                color: active ? '#fff' : 'rgba(0,0,0,0.65)',
                border: active ? '1px solid #FF5A1F' : '1px solid rgba(0,0,0,0.08)',
                boxShadow: active ? '0 2px 8px rgba(255,90,31,0.25)' : 'none',
              }}
            >
              {t3(cat.en, cat.zh, cat.tl)}
            </button>
          );
        })}
      </div>

      {/* 今日热门 (仅在 'all' tab 显示, 有数据才显示) */}
      {activeCat === 'all' && todayHot.length > 0 && (
        <div className="px-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 16 }}>🔥</span>
            <p className="font-bold" style={{ fontSize: 14, color: '#1a1a1a' }}>
              {t3("Today's Hot", '今日热门', 'Mainit Ngayon')}
            </p>
            <span className="text-zinc-400" style={{ fontSize: 10.5 }}>
              {t3('Top 3 today', '今日点赞 Top 3', 'Top 3 ngayon')}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {todayHot.map((post, idx) => {
              const name = post.user_profiles?.display_name ?? t3('Helper', '菲佣', 'Helper');
              const preview = previewText(post.body, 28);
              return (
                <div
                  key={post.id}
                  onClick={() => openDetail(post)}
                  className="flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.97] transition-transform"
                  style={{
                    width: 160,
                    background: '#fff',
                    boxShadow: '0 2px 10px rgba(255,90,31,0.10)',
                    border: '1px solid rgba(255,90,31,0.12)',
                  }}
                >
                  <div className="relative">
                    {post.image_url ? (
                      <img src={post.image_url} alt="" className="w-full"
                        style={{ height: 90, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div className="w-full flex items-center justify-center"
                        style={{
                          height: 90,
                          background: 'linear-gradient(135deg, #FFE4D2, #FF8C54)',
                        }}>
                        <span style={{ fontSize: 28, opacity: 0.5 }}>🍳</span>
                      </div>
                    )}
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full font-bold text-white"
                      style={{ background: 'rgba(0,0,0,0.55)', fontSize: 10 }}>
                      #{idx + 1}
                    </div>
                  </div>
                  <div className="px-2 pt-1.5 pb-2">
                    <p className="font-bold text-zinc-800 line-clamp-2" style={{ fontSize: 11.5, lineHeight: 1.3 }}>
                      {post.title ?? preview}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-zinc-500 truncate" style={{ fontSize: 9.5 }}>{name}</p>
                      <div className="flex items-center gap-0.5" style={{ color: '#FF5A1F' }}>
                        <span style={{ fontSize: 10 }}>❤️</span>
                        <span className="font-bold" style={{ fontSize: 10 }}>{post.like_count}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 双列瀑布流 */}
      <div className="px-3 mt-4">
        {loading && (
          <div className="text-center py-10 text-zinc-400" style={{ fontSize: 13 }}>
            {t3('Loading…', '加载中…', 'Naglo-load…')}
          </div>
        )}
        {!loading && filteredPosts.length === 0 && (
          <div className="text-center py-10 text-zinc-400" style={{ fontSize: 13 }}>
            {t3('No posts in this category', '该分类暂无帖子', 'Walang post sa kategoryang ito')}
          </div>
        )}
        {!loading && filteredPosts.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-3">
              {colLeft.map(p => <PostCard key={p.id} post={p} />)}
            </div>
            <div className="flex flex-col gap-3">
              {colRight.map(p => <PostCard key={p.id} post={p} />)}
            </div>
          </div>
        )}
      </div>

      {/* Detail modal — TICKET-041 §2: 升到 z-[60] 盖过新 5-tab HelperTabBar (z-50). */}
      {openPost && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={closeDetail}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            {openPost.image_url && (
              <img src={openPost.image_url} alt="" className="w-full"
                style={{ maxHeight: '40vh', objectFit: 'cover', display: 'block' }} />
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-2">
              {/* Helper header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF8C54, #FF5A1F)', fontSize: 15 }}>
                  {(openPost.user_profiles?.display_name?.[0] ?? 'H').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold truncate" style={{ fontSize: 13, color: '#1a1a1a' }}>
                      {openPost.user_profiles?.display_name ?? t3('Helper', '菲佣', 'Helper')}
                    </p>
                    {cuisineLabel(openPost.user_profiles?.hometown_cuisine ?? null) && (
                      <span className="px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F', fontSize: 10 }}>
                        {cuisineLabel(openPost.user_profiles?.hometown_cuisine ?? null)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {[1, 2, 3, 4, 5].map(i => {
                      const skill = openPost.cooking_skill_level ?? 3;
                      return (
                        <span key={i} style={{ fontSize: 10, color: i <= skill ? '#FFB347' : 'rgba(0,0,0,0.10)' }}>★</span>
                      );
                    })}
                    <span className="text-zinc-400 ml-1.5" style={{ fontSize: 10 }}>
                      {timeAgo(openPost.created_at, t3)}
                    </span>
                  </div>
                </div>
                <button onClick={closeDetail}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  style={{ background: 'rgba(0,0,0,0.05)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#1a1a1a' }}>close</span>
                </button>
              </div>

              {/* Title + body */}
              {openPost.title && (
                <p className="font-bold mt-3" style={{ fontSize: 17, color: '#1a1a1a', lineHeight: 1.35 }}>
                  {openPost.title}
                </p>
              )}
              <p className="text-zinc-700 mt-2 whitespace-pre-wrap" style={{ fontSize: 14, lineHeight: 1.6 }}>
                {openPost.body}
              </p>

              {/* Comments */}
              <div className="mt-4 pt-3 flex flex-col gap-2.5"
                style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <p className="font-bold text-zinc-700" style={{ fontSize: 12 }}>
                  {t3('Comments', '评论', 'Mga Komento')} ({openPost.comment_count})
                </p>
                {(commentsByPost[openPost.id] ?? []).length === 0 && (
                  <p className="text-zinc-400" style={{ fontSize: 12 }}>
                    {t3('Be the first to comment', '抢沙发', 'Maging unang magkomento')}
                  </p>
                )}
                {(commentsByPost[openPost.id] ?? []).map(c => (
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
              </div>
            </div>

            {/* Footer: like + comment input */}
            <div className="px-5 pt-3 pb-4 flex items-center gap-2"
              style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}>
              <button onClick={() => toggleLike(openPost)}
                className="flex items-center gap-1 px-3 h-9 rounded-full active:scale-95 transition-transform flex-shrink-0"
                style={{
                  background: myLikes.has(openPost.id) ? 'rgba(255,90,31,0.10)' : 'rgba(0,0,0,0.04)',
                  color: myLikes.has(openPost.id) ? '#FF5A1F' : 'rgba(0,0,0,0.55)',
                }}>
                <span style={{ fontSize: 15 }}>{myLikes.has(openPost.id) ? '❤️' : '🤍'}</span>
                <span className="font-semibold" style={{ fontSize: 12 }}>{openPost.like_count}</span>
              </button>
              <input
                type="text"
                value={commentDraft}
                onChange={e => setCommentDraft(e.target.value.slice(0, COMMENT_MAX))}
                onKeyDown={e => { if (e.key === 'Enter') submitComment(openPost); }}
                placeholder={t3('Write a comment…', '写评论…', 'Magsulat ng komento…')}
                maxLength={COMMENT_MAX}
                className="flex-1 h-9 px-3 rounded-full outline-none"
                style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', fontSize: 13 }}
              />
              <button onClick={() => submitComment(openPost)}
                disabled={!commentDraft.trim()}
                className="px-3 h-9 rounded-full font-semibold text-white active:scale-95 transition-transform disabled:opacity-40 flex-shrink-0"
                style={{ background: '#FF5A1F', fontSize: 12 }}>
                {t3('Send', '发送', 'Ipadala')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast — 上移到 TabBar 之上 (TabBar ~72px + safe-area). */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white font-semibold z-50"
          style={{ bottom: 96, background: 'rgba(0,0,0,0.85)', fontSize: 12, boxShadow: '0 4px 18px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      <HelperTabBar active="community" />
    </div>
  );
}
