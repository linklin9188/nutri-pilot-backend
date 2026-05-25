/**
 * Community — Instagram-style cooking feed for helpers
 * Light theme · English only · Dual-like system (peer ❤️ + employer 👑)
 * Points settle every Friday 18:00 HKT
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../lib/supabase";
import { getUserId } from "../lib/userId";
import exifr from "exifr";
import BottomTabBar from "../components/BottomTabBar";
import HelperBottomTabBar from "../components/HelperBottomTabBar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar: string;   // first letter fallback
  author_district: string;
  dish_name: string;
  caption: string;
  photo_url: string;
  employer_likes: number;
  peer_likes: number;
  comment_count: number;
  did_peer_like: boolean;
  did_employer_like: boolean;
  created_at: string;
  comments?: Comment[];
}

interface Comment {
  id: string;
  author: string;
  text: string;
  created_at: string;
}

// TICKET-074 P0 — StoryUser interface 删除 (原仅 MOCK_STORIES 用, 现 MOCK_STORIES 已删).

// ── Constants ─────────────────────────────────────────────────────────────────

const PTS_EMPLOYER = 10;
const PTS_PEER     = 2;
const PTS_REFERRAL = 50;

// Keyword blacklist — blocks meeting coordination & Tagalog social planning
const BLOCKED: RegExp[] = [
  /\b(victoria park|chater|statue square|jardine|central mtr)\b/i,
  /(\+852|852)[\s-]?[6789]\d{3}[\s-]?\d{4}/,
  /(https?:\/\/|www\.|wa\.me|t\.me|fb\.com|ig\.me)/i,
  /\b(kumain|magkita|pumunta|halika|saan tayo|kailan|bukas|mamaya|linggo|sabado)\b/i,
];

// Quick reply chips (English only)
const QUICK_REPLIES = [
  "Looks amazing! 🔥",
  "What's the recipe?",
  "How long did it take?",
  "My boss will love this!",
  "Which tray did you use?",
];

// TICKET-074 P0 — MOCK_STORIES / MOCK_POSTS 删除. /community 是 prod 路由
// (App.tsx:291 + HelperBottomTabBar.tsx:30 + LearnerHome.tsx:252), 雇主+菲佣+Learner
// 三类用户进去就看到 "Ana M./Joy R./Ika" 5 个不存在的菲佣 + 3 篇假 post + 假 likes/comments,
// 是产品业务逻辑硬错 (老板原话). 初始 state 改 [], DB 空时显空状态, 不冒充真数据.

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function filterContent(text: string): string | null {
  if (text.length > 80) return "Keep it under 80 characters";
  for (const re of BLOCKED) {
    if (re.test(text)) return "This content isn't allowed here";
  }
  return null;
}

// TICKET-074 P0 — nextFridayMs / fmtCountdown 删除 (原仅 PointsPill 用).

// ── Stories row ───────────────────────────────────────────────────────────────
// TICKET-074 P0 — 删 MOCK_STORIES 5 个假菲佣 ("Ana M./Joy R./Ika/Grace T./Rose A.")
// 当前只保留 helper 的 "Your story" 入口 (引导发帖); 雇主端不渲染 (StoriesRow 整段隐藏).
// 后续真 stories 功能 ship 后再从 DB hydrate.
function StoriesRow({ myRole }: { myRole: string }) {
  if (myRole !== "helper") return null;
  return (
    <div className="flex gap-4 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
        <div className="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center"
          style={{ borderColor: "#dbdbdb" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#262626" }}>add</span>
        </div>
        <span style={{ fontSize: 11, color: "#262626" }}>Your story</span>
      </div>
    </div>
  );
}

// TICKET-074 P0 — PointsPill 删除. 原传 pts=138 + weekPts=48 都是硬编码假数字,
// 真 user_pts 表 ship 后再重写并接 DB 真值. HelperHome:700 已用 "--" pattern 不显假数字.

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({
  post, myRole, onLike, onComment,
}: {
  post: Post;
  myRole: "employer" | "helper";
  onLike: (id: string, type: "peer" | "employer") => void;
  onComment: (id: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentError, setCommentError] = useState("");
  const [localComments, setLocalComments] = useState<Comment[]>(post.comments ?? []);

  // TICKET-074 P0 — async + insert().select().single() 拿真 comment.id.
  // 原 bug: id = Date.now().toString() 仅本地, supabase.insert(...).then() 不 select,
  // React key 重复风险 + 刷新页评论丢. 改: optimistic 加临时 id, DB insert 成功后替换真 id;
  // post.id 必须是真 DB id (依赖 handleNewPost 已修, 不再是 fake Date.now), 否则 post_comments
  // 的 FK 失败评论无法落库. 失败时回滚 optimistic + toast 让用户重试.
  async function submitComment() {
    const err = filterContent(commentInput);
    if (err) { setCommentError(err); return; }
    if (!commentInput.trim()) return;
    const text = commentInput;
    const tempId = `__pending_${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      author: "You",
      text,
      created_at: new Date().toISOString(),
    };
    setLocalComments(prev => [...prev, optimistic]);
    setCommentInput("");
    setCommentError("");

    const { data: inserted, error } = await supabase
      .from("post_comments")
      .insert({ post_id: post.id, text })
      .select("id, created_at")
      .single();

    if (error || !inserted) {
      console.error("post_comments insert failed", error);
      setLocalComments(prev => prev.filter(c => c.id !== tempId));
      setCommentError("Comment failed, please retry");
      return;
    }

    setLocalComments(prev => prev.map(c => c.id === tempId
      ? { ...c, id: (inserted as any).id as string, created_at: (inserted as any).created_at ?? c.created_at }
      : c));
  }

  return (
    <div className="mb-1 bg-white">
      {/* Post header */}
      <div className="flex items-center px-3 py-2.5 gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-[13px] flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #FF6B35, #F7C948)" }}>
          {post.author_avatar}
        </div>
        <div className="flex-1">
          <p className="font-semibold" style={{ fontSize: 13, color: "#262626" }}>{post.author_name}</p>
          <p style={{ fontSize: 11, color: "#737373" }}>{post.author_district}</p>
        </div>
        <span style={{ fontSize: 20, color: "#262626" }}>···</span>
      </div>

      {/* Photo — full width, 4:5, watermarked to deter stolen images */}
      <div style={{ aspectRatio: "4/5", background: "#f0f0f0", position: "relative", userSelect: "none" }}>
        <img src={post.photo_url} alt={post.dish_name}
          className="w-full h-full object-cover"
          draggable={false}
          onContextMenu={e => e.preventDefault()}
          onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600"; }} />
        {/* Watermark — visible enough to deter misuse, subtle enough not to ruin the photo */}
        <div className="absolute inset-0 pointer-events-none flex items-end justify-end pb-3 pr-3">
          <span style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            background: "rgba(0,0,0,0.25)",
            padding: "2px 7px",
            borderRadius: 20,
            fontWeight: 600,
            letterSpacing: "0.03em",
          }}>
            @{post.author_name.split(" ")[0].toLowerCase()} · Aieats
          </span>
        </div>
      </div>

      {/* Action row */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-3 mb-2">
          {/* Peer like — helpers and employers can both do this */}
          <button onClick={() => onLike(post.id, "peer")} className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill={post.did_peer_like ? "#ED4956" : "none"}
              stroke={post.did_peer_like ? "#ED4956" : "#262626"} strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>

          {/* Comment */}
          <button onClick={() => setShowComments(v => !v)} className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>

          {/* Share */}
          <button className="active:scale-90 transition-transform">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>

          {/* Employer like — gold crown, right side */}
          <div className="ml-auto flex items-center gap-1.5">
            {myRole === "employer" ? (
              <button
                onClick={() => !post.did_employer_like && onLike(post.id, "employer")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full transition-all active:scale-95"
                style={{
                  background: post.did_employer_like ? "#FFF8E1" : "#f5f5f5",
                  border: `1px solid ${post.did_employer_like ? "#F7C948" : "#e0e0e0"}`,
                }}>
                <span style={{ fontSize: 14 }}>👑</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: post.did_employer_like ? "#F7C948" : "#737373" }}>
                  {post.employer_likes}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: "#fff8e1", border: "1px solid #ffe0b2" }}>
                <span style={{ fontSize: 12 }}>👑</span>
                <span style={{ fontSize: 11, color: "#F7C948", fontWeight: 700 }}>{post.employer_likes}</span>
                <span style={{ fontSize: 10, color: "#bdbdbd" }}>×{PTS_EMPLOYER}pts</span>
              </div>
            )}
          </div>
        </div>

        {/* Likes count */}
        <p className="font-semibold mb-1" style={{ fontSize: 13, color: "#262626" }}>
          {post.peer_likes} {post.peer_likes === 1 ? "like" : "likes"}
        </p>

        {/* Caption */}
        <p style={{ fontSize: 13, color: "#262626", lineHeight: 1.4 }}>
          <span className="font-semibold">{post.author_name.split(" ")[0]} </span>
          <span className="font-semibold" style={{ color: "#FF6B35" }}>{post.dish_name} · </span>
          {post.caption}
        </p>

        {/* View comments */}
        {(post.comment_count > 0 || localComments.length > 0) && !showComments && (
          <button onClick={() => setShowComments(true)}
            className="mt-1" style={{ fontSize: 13, color: "#737373" }}>
            View all {post.comment_count || localComments.length} comments
          </button>
        )}

        {/* Time */}
        <p className="mt-1" style={{ fontSize: 10, color: "#c7c7c7", letterSpacing: "0.02em" }}>
          {timeAgo(post.created_at).toUpperCase()}
        </p>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 border-t"
            style={{ borderColor: "#f0f0f0" }}
          >
            {/* Existing comments */}
            <div className="pt-2 space-y-2 mb-2">
              {localComments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ fontSize: 10, background: "#bdbdbd" }}>
                    {c.author[0]}
                  </div>
                  <div>
                    <span className="font-semibold" style={{ fontSize: 12, color: "#262626" }}>{c.author} </span>
                    <span style={{ fontSize: 12, color: "#262626" }}>{c.text}</span>
                    <p style={{ fontSize: 10, color: "#c7c7c7" }}>{timeAgo(c.created_at)}</p>
                  </div>
                </div>
              ))}
              {localComments.length === 0 && (
                <p style={{ fontSize: 12, color: "#bdbdbd" }}>No comments yet. Be the first!</p>
              )}
            </div>

            {/* Quick replies — helpers only */}
            {myRole === "helper" && (
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                {QUICK_REPLIES.map(q => (
                  <button key={q} onClick={() => setCommentInput(q)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all active:scale-95"
                    style={{ background: "#f5f5f5", color: "#262626", border: "1px solid #e0e0e0", whiteSpace: "nowrap" }}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Comment input — helpers only */}
            {myRole === "helper" && (
              <div>
                {commentError && (
                  <p className="mb-1" style={{ fontSize: 11, color: "#ED4956" }}>{commentError}</p>
                )}
                <div className="flex gap-2 items-center">
                  <input
                    value={commentInput}
                    onChange={e => { setCommentInput(e.target.value); setCommentError(""); }}
                    onKeyDown={e => e.key === "Enter" && submitComment()}
                    placeholder="Add a comment in English..."
                    maxLength={80}
                    className="flex-1 rounded-full px-4 py-2 outline-none text-[13px]"
                    style={{ background: "#f5f5f5", border: "1px solid #e0e0e0", color: "#262626" }}
                  />
                  <button onClick={submitComment}
                    disabled={!commentInput.trim()}
                    className="font-bold transition-opacity disabled:opacity-30"
                    style={{ fontSize: 13, color: "#FF6B35" }}>Post</button>
                </div>
                <p className="mt-1 text-right" style={{ fontSize: 10, color: "#bdbdbd" }}>
                  {commentInput.length}/80
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────

function Leaderboard({ posts }: { posts: Post[] }) {
  const ranked = [...posts]
    .sort((a, b) =>
      (b.employer_likes * PTS_EMPLOYER + b.peer_likes * PTS_PEER) -
      (a.employer_likes * PTS_EMPLOYER + a.peer_likes * PTS_PEER)
    ).slice(0, 10);

  return (
    <div className="px-4 py-4 bg-white">
      <p className="font-bold mb-1" style={{ fontSize: 16, color: "#262626" }}>This Week's Top Cooks</p>
      <p className="mb-4" style={{ fontSize: 12, color: "#737373" }}>
        Top 20% earn HK$30 · Top 5% earn HK$100 · Top 1% earn HK$500
      </p>
      {ranked.map((p, i) => {
        const pts = p.employer_likes * PTS_EMPLOYER + p.peer_likes * PTS_PEER;
        const medal = ["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`;
        const isTop = i < 3;
        return (
          <div key={p.id} className="flex items-center gap-3 mb-3 p-3 rounded-2xl"
            style={{
              background: isTop ? "#fffbf0" : "#fafafa",
              border: `1px solid ${isTop ? "#ffe0b2" : "#f0f0f0"}`,
            }}>
            <span style={{ fontSize: isTop ? 22 : 14, minWidth: 28, textAlign: "center", color: "#737373", fontWeight: "bold" }}>
              {medal}
            </span>
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
              <img src={p.photo_url} alt="" className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=80"; }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate" style={{ fontSize: 13, color: "#262626" }}>{p.author_name}</p>
              <p style={{ fontSize: 11, color: "#737373" }}>{p.dish_name.split(" ")[0]} · {p.author_district}</p>
            </div>
            <div className="text-right">
              <p className="font-black" style={{ fontSize: 16, color: "#FF6B35" }}>{pts}</p>
              <p style={{ fontSize: 9, color: "#bdbdbd" }}>pts</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Create Post Modal (Instagram-style bottom sheet) ──────────────────────────

interface PhotoItem { url: string; starred: boolean; file: File; }

const MOOD_CHIPS = [
  "Cooked with love 💕",
  "Family approved! 👨‍👩‍👧",
  "Healthy & delicious 🥗",
  "Low salt recipe ✅",
  "First time making this! 🎉",
  "Hard work today 💪",
];

function CreatePost({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (p: Partial<Post>) => void;
}) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [mood, setMood] = useState("");
  const [captionExtra, setCaptionExtra] = useState("");
  const [captionError, setCaptionError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [posted, setPosted] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const todayDishes: string[] = (() => {
    try { return JSON.parse(localStorage.getItem("generatedMenu") ?? "[]").map((d: any) => d.title || d.title_zh).filter(Boolean); }
    catch { return []; }
  })();
  const [dishName, setDishName] = useState(todayDishes[0] ?? "");

  const hasPhotos = photos.length > 0;
  const coverPhoto = photos.find(p => p.starred) ?? photos[0];
  const caption = [mood, captionExtra].filter(Boolean).join(" · ");

  async function addFiles(files: FileList | null, isCamera = false) {
    if (!files) return;
    setPhotoError("");
    const incoming = Array.from(files).slice(0, 4 - photos.length);

    // EXIF timestamp check for gallery uploads (camera photos are always fresh)
    if (!isCamera) {
      for (const f of incoming) {
        try {
          const exif = await exifr.parse(f, ["DateTimeOriginal", "CreateDate"]);
          if (exif) {
            const taken: Date | undefined = exif.DateTimeOriginal ?? exif.CreateDate;
            if (taken) {
              const ageMinutes = (Date.now() - taken.getTime()) / 60000;
              if (ageMinutes > 90) {
                setPhotoError("Please use a photo taken today while cooking. Old photos are not allowed. 📸");
                return;
              }
            }
          }
        } catch { /* EXIF parse failed — allow, no data to reject on */ }
      }
    }

    const newPhotos = incoming.map(f => ({
      url: URL.createObjectURL(f),
      starred: false,
      file: f,
    }));
    setPhotos(prev => {
      const merged = [...prev, ...newPhotos];
      if (merged.length > 0 && !merged.some(p => p.starred)) merged[0].starred = true;
      return merged;
    });
  }

  function toggleStar(idx: number) {
    setPhotos(prev => prev.map((p, i) => ({ ...p, starred: i === idx })));
  }

  function removePhoto(idx: number) {
    setPhotos(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some(p => p.starred)) next[0].starred = true;
      return next;
    });
  }

  function handleSubmit() {
    const err = filterContent(caption);
    if (err) { setCaptionError(err); return; }
    onSubmit({ dish_name: dishName, caption, photo_url: coverPhoto?.url ?? "" });
    setPosted(true);
  }

  function handleShare() {
    const text = `I just cooked ${dishName} via Aieats! 🍳✨`;
    if (navigator.share) {
      navigator.share({ title: "Aieats Community", text, url: window.location.origin }).catch(() => {});
    }
  }

  /* ── Success screen ─────────────────────────────────────────── */
  if (posted) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ background: "rgba(0,0,0,0.55)" }}
      >
        <motion.div
          initial={{ y: "100%" }} animate={{ y: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          className="w-full max-w-md rounded-t-3xl bg-white pb-10"
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full" style={{ background: "#e0e0e0" }} />
          </div>

          {/* Cover photo with overlay */}
          {coverPhoto && (
            <div className="relative mx-4 mb-5 rounded-2xl overflow-hidden" style={{ aspectRatio: "4/3" }}>
              <img src={coverPhoto.url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)" }} />
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                <div>
                  <p className="font-bold text-white" style={{ fontSize: 16 }}>{dishName}</p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{mood}</p>
                </div>
                <p className="font-bold text-white" style={{ fontSize: 11, background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 20 }}>
                  via Aieats ✨
                </p>
              </div>
            </div>
          )}

          <div className="px-5 flex flex-col gap-3">
            {/* Points earned */}
            <div className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: "linear-gradient(135deg, #f7971e22, #ffd20022)", border: "1px solid #ffd20055" }}>
              <span style={{ fontSize: 28 }}>🎉</span>
              <div>
                <p className="font-bold" style={{ fontSize: 15, color: "#262626" }}>Posted! +15 pts earned</p>
                <p style={{ fontSize: 12, color: "#737373" }}>
                  Get <strong style={{ color: "#f7971e" }}>+{PTS_EMPLOYER} pts</strong> if your boss 👑 likes it · <strong style={{ color: "#ED4956" }}>+{PTS_PEER} pts</strong> per peer ❤️
                </p>
              </div>
            </div>

            {/* Share to spread */}
            <button onClick={handleShare}
              className="w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all text-white"
              style={{ background: "linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)", fontSize: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>share</span>
              Share to Instagram / Facebook
            </button>

            <button onClick={onClose}
              className="w-full h-12 rounded-2xl font-semibold active:scale-[0.98]"
              style={{ fontSize: 14, background: "#f5f5f5", color: "#262626" }}>
              See it in the feed →
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  /* ── Main sheet ─────────────────────────────────────────────── */
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="w-full max-w-md rounded-t-3xl bg-white overflow-y-auto"
        style={{ maxHeight: "92vh" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "#e0e0e0" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#f0f0f0" }}>
          <button onClick={onClose} style={{ fontSize: 14, color: "#737373" }}>Cancel</button>
          <p className="font-bold" style={{ fontSize: 15, color: "#262626" }}>Check-in & Share 🏆</p>
          <div style={{ width: 48 }} />
        </div>

        <div className="px-4 pt-4 pb-6 flex flex-col gap-5">

          {/* ── Photo section ──────────────────────────────── */}
          {photoError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: "#fff0f0", border: "1px solid #fecaca" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#ED4956", flexShrink: 0, marginTop: 1 }}>warning</span>
              <p style={{ fontSize: 13, color: "#ED4956", lineHeight: 1.4 }}>{photoError}</p>
            </div>
          )}
          {!hasPhotos ? (
            /* No photos yet — big camera prompt */
            <div>
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-full rounded-3xl flex flex-col items-center justify-center gap-3 active:scale-[0.98] transition-all"
                style={{ aspectRatio: "4/3", background: "#0a0a0a", border: "none" }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.12)" }}>
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 40, fontVariationSettings: "'FILL' 1" }}>photo_camera</span>
                </div>
                <p className="font-bold text-white" style={{ fontSize: 16 }}>Tap to take a photo</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Show off what you cooked today 🍳</p>
              </button>
              <button onClick={() => galleryRef.current?.click()}
                className="mt-3 w-full py-3 rounded-2xl font-semibold active:scale-[0.98]"
                style={{ fontSize: 14, background: "#f5f5f5", color: "#262626" }}>
                Choose from library
              </button>
            </div>
          ) : (
            /* Photos grid */
            <div>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {photos.map((p, i) => (
                  <div key={i} className="relative flex-shrink-0 rounded-2xl overflow-hidden"
                    style={{ width: 120, height: 120 }}>
                    <img src={p.url} alt="" className="w-full h-full object-cover" />

                    {/* Star button — marks best plating */}
                    <button
                      onClick={() => toggleStar(i)}
                      className="absolute top-1.5 left-1.5 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                      style={{ background: p.starred ? "#ffd200" : "rgba(0,0,0,0.45)" }}>
                      <span className="material-symbols-outlined"
                        style={{ fontSize: 18, color: p.starred ? "#1a1a1a" : "white", fontVariationSettings: p.starred ? "'FILL' 1" : "'FILL' 0" }}>
                        star
                      </span>
                    </button>

                    {/* Remove button */}
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.55)" }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 14 }}>close</span>
                    </button>

                    {/* Best plating label */}
                    {p.starred && (
                      <div className="absolute bottom-0 left-0 right-0 py-1 flex items-center justify-center gap-1"
                        style={{ background: "rgba(255,210,0,0.88)" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#1a1a1a" }}>⭐ Best plating</span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add more button (up to 4) */}
                {photos.length < 4 && (
                  <button onClick={() => galleryRef.current?.click()}
                    className="flex-shrink-0 rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95"
                    style={{ width: 120, height: 120, background: "#f5f5f5", border: "2px dashed #e0e0e0" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#bdbdbd" }}>add_photo_alternate</span>
                    <p style={{ fontSize: 11, color: "#bdbdbd" }}>Add more</p>
                  </button>
                )}
              </div>
              <p style={{ fontSize: 11, color: "#bdbdbd", marginTop: 6 }}>
                ⭐ Tap star on your best plating photo — bosses love a beautiful dish!
              </p>
            </div>
          )}

          {/* ── Dish selector ──────────────────────────────── */}
          {todayDishes.length > 0 && (
            <div>
              <p className="mb-2 font-semibold" style={{ fontSize: 12, color: "#737373", letterSpacing: "0.06em" }}>TODAY'S DISH</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {todayDishes.map(d => (
                  <button key={d} onClick={() => setDishName(d)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full font-medium transition-all active:scale-95"
                    style={{
                      fontSize: 13,
                      background: dishName === d ? "#262626" : "#f5f5f5",
                      color: dishName === d ? "white" : "#262626",
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Mood chips ─────────────────────────────────── */}
          <div>
            <p className="mb-2 font-semibold" style={{ fontSize: 12, color: "#737373", letterSpacing: "0.06em" }}>HOW DO YOU FEEL?</p>
            <div className="flex flex-wrap gap-2">
              {MOOD_CHIPS.map(chip => (
                <button key={chip} onClick={() => setMood(mood === chip ? "" : chip)}
                  className="px-3 py-1.5 rounded-full font-medium transition-all active:scale-95"
                  style={{
                    fontSize: 13,
                    background: mood === chip ? "#f7971e" : "#f5f5f5",
                    color: mood === chip ? "white" : "#262626",
                  }}>
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* ── Optional extra caption ─────────────────────── */}
          <div>
            <textarea
              value={captionExtra}
              onChange={e => { setCaptionExtra(e.target.value); setCaptionError(""); }}
              placeholder="Add more in English... (optional, max 60 chars)"
              maxLength={60}
              rows={2}
              className="w-full outline-none resize-none rounded-2xl px-4 py-3 text-[14px]"
              style={{ background: "#f5f5f5", color: "#262626" }}
            />
            {captionError && <p style={{ fontSize: 11, color: "#ED4956", marginTop: 4 }}>{captionError}</p>}
          </div>

          {/* ── Points preview ─────────────────────────────── */}
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: "#fff8f0", border: "1px solid #ffe0b2" }}>
            <span style={{ fontSize: 22 }}>💰</span>
            <div>
              <p className="font-bold" style={{ fontSize: 13, color: "#262626" }}>Post now → earn +15 pts</p>
              <p style={{ fontSize: 11, color: "#737373" }}>
                +{PTS_EMPLOYER} pts per boss 👑 · +{PTS_PEER} pts per peer ❤️ · paid every Friday
              </p>
            </div>
          </div>

          {/* ── Post button ────────────────────────────────── */}
          <button
            onClick={handleSubmit}
            disabled={!hasPhotos || !dishName}
            className="w-full h-14 rounded-2xl font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40"
            style={{ fontSize: 16, background: "linear-gradient(135deg, #f7971e, #ffd200)", boxShadow: "0 6px 20px rgba(247,151,30,0.4)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>
              photo_camera
            </span>
            Post & earn points 🏆
          </button>
        </div>

        {/* Hidden inputs */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          onChange={e => addFiles(e.target.files, true)} className="hidden" />
        <input ref={galleryRef} type="file" accept="image/*" multiple
          onChange={e => addFiles(e.target.files, false)} className="hidden" />
      </motion.div>
    </motion.div>
  );
}

// ── Bottom Tab Bar ────────────────────────────────────────────────────────────

type Tab = "feed" | "rankings" | "profile";

function CommunityTabBar({ tab, setTab, onPost, myRole }: {
  tab: Tab; setTab: (t: Tab) => void; onPost: () => void; myRole: string;
}) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-30 bg-white border-t flex items-center"
      style={{ borderColor: "#f0f0f0", bottom: 60 /* UI 014 §L: leave space for HelperBottomTabBar */ }}>

      <button onClick={() => setTab("feed")}
        className="flex-1 py-3 flex flex-col items-center gap-0.5">
        <svg width="24" height="24" viewBox="0 0 24 24"
          fill={tab === "feed" ? "#262626" : "none"}
          stroke={tab === "feed" ? "#262626" : "#737373"} strokeWidth="1.8">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </button>

      {/* Post — helper only */}
      {myRole === "helper" ? (
        <button onClick={onPost}
          className="flex-1 py-3 flex flex-col items-center">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "#262626" }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>add</span>
          </div>
        </button>
      ) : <div className="flex-1" />}

      <button onClick={() => setTab("rankings")}
        className="flex-1 py-3 flex flex-col items-center gap-0.5">
        <svg width="24" height="24" viewBox="0 0 24 24"
          fill={tab === "rankings" ? "#262626" : "none"}
          stroke={tab === "rankings" ? "#262626" : "#737373"} strokeWidth="1.8">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
          <polyline points="17 6 23 6 23 12"/>
        </svg>
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Community() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const myRole = (searchParams.get("view") === "employer" ? "employer"
    : localStorage.getItem("nutri_role") ?? "helper") as "employer" | "helper";
  const myUserId = getUserId() ?? "";

  const [tab, setTab] = useState<Tab>("feed");
  // TICKET-074 P0 — 删 MOCK_POSTS 初始 (3 篇假 post "清蒸鱼/红烧排骨/蒜蓉蒸虾"). 初始 [],
  // DB 空时显空状态 (见 feed render empty-state UI), 不冒充真社区数据.
  const [posts, setPosts] = useState<Post[]>([]);
  const [showCreate, setShowCreate] = useState(searchParams.get("action") === "post");
  // TICKET-074 P0 — 删硬编码 weekPts=48 (假积分) + PointsPill 调用. 真 user_pts 表 ship 后再 enable.

  useEffect(() => {
    async function loadPosts() {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*, user_profiles(display_name)")
        .order("created_at", { ascending: false })
        .limit(30);

      // TICKET-074 P0 — DB 空 → posts 保持 [] (上面初始值), 渲染层显 empty-state.
      // 旧路径 "return; // keep mock data" 让用户永远看到 3 篇 fake post — 已删.
      if (error || !data || data.length === 0) return;

      const mapped: Post[] = data.map((row: any) => ({
        id: row.id,
        user_id: row.helper_id,
        author_name: row.user_profiles?.display_name ?? "Helper",
        author_avatar: (row.user_profiles?.display_name ?? "H")[0].toUpperCase(),
        author_district: "Hong Kong",
        dish_name: row.dish_name,
        caption: row.caption ?? "",
        photo_url: row.photo_url,
        employer_likes: row.employer_likes ?? 0,
        peer_likes: row.peer_likes ?? 0,
        comment_count: 0,
        did_peer_like: false,
        did_employer_like: false,
        created_at: row.created_at,
        comments: [],
      }));
      setPosts(mapped);
    }
    loadPosts();
  }, []);

  function handleLike(postId: string, type: "peer" | "employer") {
    // Find the post for dish_name lookup
    const post = posts.find(p => p.id === postId);

    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      if (type === "employer") {
        if (p.did_employer_like) return p;
        return { ...p, employer_likes: p.employer_likes + 1, did_employer_like: true };
      }
      const on = !p.did_peer_like;
      return { ...p, peer_likes: p.peer_likes + (on ? 1 : -1), did_peer_like: on };
    }));

    // Persist post like count
    const col = type === "employer" ? "employer_likes" : "peer_likes";
    supabase.rpc("increment_post_likes", { post_id: postId, col_name: col }).then(() => {});

    // 👑 Employer crown → also increment dish.employer_crown_likes (atomic via rpc)
    if (type === "employer" && post && !post.did_employer_like) {
      supabase.rpc("increment_dish_crown", { p_dish_name_zh: post.dish_name }).then(() => {});
    }
  }

  // TICKET-074 P0 — async + 拿真 DB id.
  // 原 bug: id = Date.now().toString() 是 fake, supabase.insert(...).then() 不 select,
  // optimistic state 永远拿 fake id; 后续点赞 handleLike → rpc('increment_post_likes', {post_id: fakeId})
  // 找不到 row 默默失败, 雇主点 👑 helper 拿不到积分; 评论 submitComment 用 post.id (fake) 插
  // post_comments 也会因 FK 失败. insert(...).select().single() 拿真 uuid 后替换 optimistic 行,
  // 让下游 like/comment 都打到真 id.
  async function handleNewPost(partial: Partial<Post>) {
    // Optimistic UI update — 临时 id 仅本 component state 用做 React key, 拿到真 id 立刻替换
    const tempId = `__pending_${Date.now()}`;
    const optimistic: Post = {
      id: tempId, user_id: myUserId,
      author_name: "You", author_avatar: "Y",
      author_district: "Hong Kong",
      dish_name: partial.dish_name ?? "",
      caption: partial.caption ?? "",
      photo_url: partial.photo_url ?? "",
      employer_likes: 0, peer_likes: 0, comment_count: 0,
      did_peer_like: false, did_employer_like: false,
      created_at: new Date().toISOString(), comments: [],
    };
    setPosts(prev => [optimistic, ...prev]);

    // Insert + select 拿真 server-generated uuid
    const { data: inserted, error } = await supabase
      .from("community_posts")
      .insert({
        helper_id: myUserId,
        dish_name: partial.dish_name ?? "",
        caption: partial.caption ?? "",
        photo_url: partial.photo_url ?? "",
        pts_earned: 15,
      })
      .select("id, created_at")
      .single();

    if (error || !inserted) {
      // 回滚 optimistic + 控制台留迹 (沿 B-2 §A2 不吞错 pattern)
      console.error("community_posts insert failed", error);
      setPosts(prev => prev.filter(p => p.id !== tempId));
      return;
    }

    // 用真 DB id 替换 optimistic 行 — 后续 handleLike / submitComment 都拿真 id 打 RPC / FK
    setPosts(prev => prev.map(p => p.id === tempId
      ? { ...p, id: (inserted as any).id as string, created_at: (inserted as any).created_at ?? p.created_at }
      : p));

    // Signal #3: times_cooked +1 on the dish
    if (partial.dish_name) {
      supabase.rpc("increment_dish_cooked", { p_dish_name_zh: partial.dish_name }).then(() => {});
    }
  }

  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: "#fafafa", paddingBottom: myRole === 'helper' ? 140 : 80 }}>

      {/* Header — Instagram style */}
      <div className="sticky top-0 z-10 bg-white border-b flex items-center justify-between px-4 py-3"
        style={{ borderColor: "#f0f0f0" }}>
        <button onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#262626" }}>arrow_back</span>
        </button>
        <div className="text-center">
          <p className="font-black" style={{ fontSize: 16, color: "#262626", fontFamily: "serif" }}>
            Cooking Community
          </p>
          {myRole === "helper" && (
            <p style={{ fontSize: 10, color: "#FF6B35" }}>Earn rewards every Friday 🍳</p>
          )}
        </div>
        <button onClick={() => navigate(`/login?role=helper`)}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#262626" }}>person_add</span>
        </button>
      </div>

      {/* TICKET-074 P0 — PointsPill 隐藏 (原来传硬编码 pts=138 + weekPts=48 是假数字).
          真 user_pts 表 ship 后再 enable + 接 DB 真值. 当前与 HelperHome:700 "--" pattern
          一致 (不显假数字, 让用户清楚还没真积分系统). */}

      {/* Employer: top Feed/Rankings switcher */}
      {myRole === "employer" && (
        <div className="flex border-b bg-white" style={{ borderColor: "#f0f0f0" }}>
          {(["feed", "rankings"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-3 text-[13px] font-semibold transition-colors"
              style={{ color: tab === t ? "#262626" : "#737373", borderBottom: tab === t ? "2px solid #262626" : "2px solid transparent" }}>
              {t === "feed" ? "📸 菜品动态" : "🏆 工人排行"}
            </button>
          ))}
        </div>
      )}

      {/* Stories */}
      {tab === "feed" && (
        <div className="bg-white border-b mt-1" style={{ borderColor: "#f0f0f0" }}>
          <StoriesRow myRole={myRole} />
        </div>
      )}

      {/* Feed / Rankings */}
      <AnimatePresence mode="wait">
        {tab === "feed" ? (
          <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mt-1">
              {posts.length === 0 ? (
                // TICKET-074 P0 — DB 空 empty state (替原 MOCK_POSTS 3 篇假帖)
                <div className="px-6 py-16 text-center bg-white">
                  <p style={{ fontSize: 48, marginBottom: 12 }}>📸</p>
                  <p className="font-bold mb-1" style={{ fontSize: 14, color: "#262626" }}>
                    No posts yet
                  </p>
                  <p style={{ fontSize: 12, color: "#737373", lineHeight: 1.5 }}>
                    {myRole === "helper"
                      ? "Be the first to share what you cooked today!"
                      : "Helpers haven't posted any dishes yet."}
                  </p>
                </div>
              ) : (
                posts.map((post: Post) => (
                  <PostCard key={post.id} post={post} myRole={myRole}
                    onLike={handleLike} onComment={() => {}} />
                ))
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="rank" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mt-1">
              {posts.length === 0 ? (
                <div className="px-6 py-16 text-center bg-white">
                  <p style={{ fontSize: 48, marginBottom: 12 }}>🏆</p>
                  <p className="font-bold mb-1" style={{ fontSize: 14, color: "#262626" }}>
                    No ranking yet
                  </p>
                  <p style={{ fontSize: 12, color: "#737373", lineHeight: 1.5 }}>
                    Ranking opens after helpers post dishes this week.
                  </p>
                </div>
              ) : (
                <Leaderboard posts={posts} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper: bottom community tab bar with post button */}
      {myRole === "helper" && (
        <CommunityTabBar tab={tab} setTab={setTab} onPost={() => setShowCreate(true)} myRole={myRole} />
      )}

      {/* Employer: standard app bottom tab bar */}
      {myRole === "employer" && <BottomTabBar />}
      {/* Helper: page-level tab bar (UI 014 §L). CommunityTabBar 在它上方 60px。 */}
      <HelperBottomTabBar />

      {/* Create post */}
      <AnimatePresence>
        {showCreate && (
          <CreatePost onClose={() => setShowCreate(false)} onSubmit={handleNewPost} />
        )}
      </AnimatePresence>
    </div>
  );
}
