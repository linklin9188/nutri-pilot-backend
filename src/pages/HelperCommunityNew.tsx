/**
 * HelperCommunityNew — 菲佣社区 (Warm Hearth 大改版, /helper-community)
 *
 * 产品链终点的"成就出口": 菲佣照 /cook-v2 把菜做出来 → 拍照打卡 → 发到社区,
 * 看别的菲佣做了什么、互相点赞。
 *
 * 角色边界 (老板拍板):
 *   - **全程 English + Tagalog, 一个中文字都不能有** (硬规矩, 中文注释除外)。
 *   - 永久免费, 绝不出现 trial / 试用。
 *
 * 形态:
 *   - Feed: helper_posts 最新 ~50 条, 卡片 (作者 / 图 / body / ❤️💬 / 相对时间)。
 *   - Composer: 右下角 "+" 悬浮按钮 → modal。拍照 + 一句话 body (必填) +
 *     可选关联今天雇主菜单里的一道菜。
 *   - URL ?compose=1 自动开 composer; ?dish=<id> 预选该菜 (从 /cook-v2 Share 按钮跳来)。
 *
 * 数据:
 *   - helper_posts 表 (helper_id NOT NULL / body NOT NULL / 其余可空)。RLS 匿名全 CRUD。
 *   - 图片公开桶 helper-posts (匿名 insert/read)。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getUserId } from '../lib/userId';
import { useLanguage } from '../contexts/LanguageContext';
import { loadEmployerTodayMenu, type EmployerDishLite } from '../lib/helperEmployerMenu';

// ── Warm Hearth tokens ───────────────────────────────────────────────────────
const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

// 菲佣端只有 EN / TL 两语, 永不显中文。'tl' → Tagalog, else → English。
type HLang = 'en' | 'tl';
function useHelperLang(): HLang {
  const { language } = useLanguage();
  return language === 'tl' ? 'tl' : 'en';
}

interface HelperPost {
  id: string;
  helper_id: string;
  title: string | null;
  body: string;
  image_url: string | null;
  dish_id: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
}

// 相对时间 (纯 EN/TL, 无中文)
function relTime(iso: string, lang: HLang): string {
  const L = (en: string, tl: string) => (lang === 'tl' ? tl : en);
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return L('just now', 'ngayon lang');
  const min = Math.floor(diffSec / 60);
  if (min < 60) return L(`${min}m ago`, `${min}m nakalipas`);
  const hr = Math.floor(min / 60);
  if (hr < 24) return L(`${hr}h ago`, `${hr}h nakalipas`);
  const day = Math.floor(hr / 24);
  if (day < 7) return L(`${day}d ago`, `${day}d nakalipas`);
  const wk = Math.floor(day / 7);
  return L(`${wk}w ago`, `${wk}w nakalipas`);
}

export default function HelperCommunityNew() {
  const navigate = useNavigate();
  const lang = useHelperLang();
  const L = (en: string, tl: string) => (lang === 'tl' ? tl : en);
  const [params] = useSearchParams();

  const [posts, setPosts] = useState<HelperPost[]>([]);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState<Set<string>>(new Set());

  // composer 态
  const [composeOpen, setComposeOpen] = useState(false);

  // 今天雇主菜单 (composer 关联菜用)
  const [todayDishes, setTodayDishes] = useState<EmployerDishLite[]>([]);

  // ── 拉 feed + 作者名 ─────────────────────────────────────────────────────
  async function loadFeed() {
    setLoading(true);
    const { data, error } = await supabase
      .from('helper_posts')
      .select('id, helper_id, title, body, image_url, dish_id, like_count, comment_count, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('[HelperCommunityNew] feed fetch error:', error);
      setPosts([]);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as HelperPost[];
    setPosts(rows);
    setLoading(false);

    // 作者名批量取 (helper_id::text = user_profiles.id)
    const ids = Array.from(new Set(rows.map(r => r.helper_id).filter(Boolean)));
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', ids);
      const map: Record<string, string> = {};
      for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) map[p.id] = p.display_name;
      }
      setAuthorNames(map);
    }
  }

  useEffect(() => {
    loadFeed();
    // composer 预加载今天雇主菜单 (关联菜下拉用)
    (async () => {
      const uid = getUserId();
      const res = await loadEmployerTodayMenu(uid, 0);
      setTodayDishes(res.dishes);
    })();
  }, []);

  // ?compose=1 自动开 composer
  useEffect(() => {
    if (params.get('compose') === '1') setComposeOpen(true);
  }, [params]);

  // ?dish=<id> 预选
  const preselectDishId = params.get('dish') || undefined;

  function authorLabel(p: HelperPost): string {
    return authorNames[p.helper_id] || L('Helper', 'Helper');
  }

  // 乐观点赞 (+1, update like_count)
  async function toggleLike(p: HelperPost) {
    if (liked.has(p.id)) return; // 一次性 +1, 不做取消 (简化)
    setLiked(prev => new Set(prev).add(p.id));
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, like_count: x.like_count + 1 } : x));
    const { error } = await supabase
      .from('helper_posts')
      .update({ like_count: p.like_count + 1 })
      .eq('id', p.id);
    if (error) {
      // 回滚
      console.warn('[HelperCommunityNew] like update error:', error);
      setLiked(prev => { const n = new Set(prev); n.delete(p.id); return n; });
      setPosts(prev => prev.map(x => x.id === p.id ? { ...x, like_count: Math.max(0, x.like_count - 1) } : x));
    }
  }

  // composer 提交成功 → 乐观 prepend
  function onPosted(newPost: HelperPost) {
    setPosts(prev => [newPost, ...prev]);
    setComposeOpen(false);
  }

  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: CREAM, color: INK, paddingBottom: 90 }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 pt-5 pb-3"
        style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)' }}>
        <button onClick={() => navigate(-1)}
          className="rounded-full flex items-center justify-center active:scale-95 shrink-0"
          style={{ width: 40, height: 40, background: ALT }}
          aria-label="Back">
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black truncate" style={{ fontSize: 20 }}>{L('Community', 'Komunidad')}</h1>
          <p style={{ fontSize: 12, color: SUB }}>{L('Share your cooking', 'Ibahagi ang iyong luto')}</p>
        </div>
      </header>

      <main className="px-4 py-3">
        {loading ? (
          <div className="space-y-4 pt-2">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl" style={{ height: 240, background: ALT, opacity: 0.6 }} />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center text-center pt-24 px-6">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#CFCFC8' }}>photo_camera</span>
            <p className="font-bold mt-4" style={{ fontSize: 17 }}>{L('No posts yet', 'Wala pang post')}</p>
            <p className="mt-1" style={{ fontSize: 14, color: SUB }}>
              {L('Be the first to share a dish!', 'Maging una sa pagbahagi ng ulam!')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(p => (
              <article key={p.id} className="rounded-2xl overflow-hidden"
                style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {/* author row */}
                <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
                  <div className="rounded-full flex items-center justify-center text-white font-black shrink-0"
                    style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#FF5A1F,#FF9054)', fontSize: 15 }}>
                    {(authorLabel(p) || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate" style={{ fontSize: 14 }}>{authorLabel(p)}</p>
                    <p style={{ fontSize: 11, color: SUB }}>{relTime(p.created_at, lang)}</p>
                  </div>
                </div>

                {/* image */}
                {p.image_url && (
                  <div className="w-full bg-cover bg-center" style={{ aspectRatio: '4 / 3', background: ALT, backgroundImage: `url("${p.image_url}")` }} />
                )}

                {/* body */}
                <div className="px-4 pt-3 pb-1">
                  {p.title && <p className="font-bold mb-1" style={{ fontSize: 15 }}>{p.title}</p>}
                  <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{p.body}</p>
                </div>

                {/* actions */}
                <div className="flex items-center gap-5 px-4 py-3">
                  <button onClick={() => toggleLike(p)}
                    className="flex items-center gap-1.5 active:scale-95 transition-transform"
                    aria-label="Like">
                    <span style={{ fontSize: 18, opacity: liked.has(p.id) ? 1 : 0.85 }}>
                      {liked.has(p.id) ? '❤️' : '🤍'}
                    </span>
                    <span style={{ fontSize: 13, color: SUB, fontWeight: 600 }}>{p.like_count}</span>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: 16 }}>💬</span>
                    <span style={{ fontSize: 13, color: SUB, fontWeight: 600 }}>{p.comment_count}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* 悬浮 "+" 按钮 */}
      <button onClick={() => setComposeOpen(true)}
        className="fixed bottom-6 right-1/2 z-30 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
        style={{ width: 56, height: 56, background: BRAND, boxShadow: '0 8px 24px rgba(255,90,31,0.4)', transform: 'translateX(min(50vw - 28px, 224px - 28px))' }}
        aria-label={L('Share your dish', 'Ibahagi ang iyong luto')}>
        <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add</span>
      </button>

      {/* Composer */}
      {composeOpen && (
        <Composer
          lang={lang}
          todayDishes={todayDishes}
          preselectDishId={preselectDishId}
          onClose={() => setComposeOpen(false)}
          onPosted={onPosted}
        />
      )}
    </div>
  );
}

// ── Composer (发帖) ──────────────────────────────────────────────────────────
function Composer({
  lang, todayDishes, preselectDishId, onClose, onPosted,
}: {
  lang: HLang;
  todayDishes: EmployerDishLite[];
  preselectDishId?: string;
  onClose: () => void;
  onPosted: (p: HelperPost) => void;
}) {
  const L = (en: string, tl: string) => (lang === 'tl' ? tl : en);

  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dishId, setDishId] = useState<string | undefined>(preselectDishId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDish = useMemo(
    () => todayDishes.find(d => d.id === dishId),
    [todayDishes, dishId],
  );

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  async function submit() {
    const text = body.trim();
    if (!text) { setErr(L('Please write something first.', 'Magsulat muna ng isang bagay.')); return; }
    const uid = getUserId();
    if (!uid) { setErr(L('Please sign in first.', 'Mag-sign in muna.')); return; }

    setBusy(true);
    setErr('');

    // 1. 有图先 upload helper-posts 桶
    let imageUrl: string | null = null;
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${uid}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('helper-posts')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (upErr) {
        console.warn('[Composer] image upload error:', upErr);
        setErr(L('Photo upload failed. Try again.', 'Nabigo ang pag-upload ng litrato. Subukan ulit.'));
        setBusy(false);
        return;
      }
      imageUrl = supabase.storage.from('helper-posts').getPublicUrl(path).data.publicUrl;
    }

    // 没拍照但选了菜 → 用菜图兜底
    if (!imageUrl && selectedDish?.image_url) imageUrl = selectedDish.image_url;

    // 2. insert helper_posts
    const { data, error } = await supabase
      .from('helper_posts')
      .insert({
        helper_id: uid,
        body: text,
        title: null,
        dish_id: dishId ?? null,
        image_url: imageUrl,
        cooking_skill_level: null,
      })
      .select('id, helper_id, title, body, image_url, dish_id, like_count, comment_count, created_at')
      .single();

    if (error || !data) {
      console.warn('[Composer] insert error:', error);
      setErr(L('Could not post. Please try again.', 'Hindi ma-post. Pakisubukan ulit.'));
      setBusy(false);
      return;
    }

    setBusy(false);
    onPosted(data as HelperPost);
  }

  return (
    <>
      <div className="fixed inset-0 z-[120]" onClick={() => !busy && onClose()}
        style={{ background: 'rgba(0,0,0,0.45)' }} />
      <div className="fixed left-0 right-0 bottom-0 z-[121] max-w-md mx-auto rounded-t-3xl"
        style={{ background: '#FFFFFF', paddingBottom: 'env(safe-area-inset-bottom, 16px)', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* header */}
        <div className="sticky top-0 px-5 pt-4 pb-3 flex items-center justify-between"
          style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <button onClick={() => !busy && onClose()}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
            style={{ background: ALT }} aria-label="Close">
            <span className="material-symbols-outlined" style={{ fontSize: 19 }}>close</span>
          </button>
          <p className="font-black" style={{ fontSize: 16, color: INK }}>
            {L('Share your dish', 'Ibahagi ang iyong luto')}
          </p>
          <button onClick={submit} disabled={busy || !body.trim()}
            className="px-4 py-1.5 rounded-full font-bold text-white active:scale-95 transition-transform disabled:opacity-40"
            style={{ background: BRAND, fontSize: 14 }}>
            {busy ? '…' : L('Post', 'I-post')}
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 拍照 / 选图 */}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={onPickFile} />
          {previewUrl ? (
            <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '4 / 3', background: ALT }}>
              <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
              <button onClick={() => { setFile(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90"
                style={{ background: 'rgba(0,0,0,0.5)' }} aria-label="Remove photo">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl active:scale-[0.99] transition-transform"
              style={{ height: 150, background: ALT, border: '1.5px dashed #D5D5CE' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: SUB }}>add_a_photo</span>
              <span style={{ fontSize: 13, color: SUB, fontWeight: 600 }}>
                {L('Add a photo', 'Magdagdag ng litrato')}
              </span>
            </button>
          )}

          {/* body */}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={L('Say something…', 'Magkomento…')}
            rows={3}
            className="w-full px-4 py-3 rounded-2xl resize-none"
            style={{ background: ALT, fontSize: 15, color: INK, outline: 'none' }}
          />

          {/* 关联今天的菜 (可选) */}
          {todayDishes.length > 0 && (
            <div>
              <p style={{ fontSize: 12, color: SUB, fontWeight: 600, marginBottom: 8 }}>
                {L('Tag a dish (optional)', 'I-tag ang ulam (opsyonal)')}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {todayDishes.map(d => {
                  const on = d.id === dishId;
                  const title = d.title_en || L('Dish', 'Ulam');
                  return (
                    <button key={d.id}
                      onClick={() => setDishId(on ? undefined : d.id)}
                      className="shrink-0 px-3 py-2 rounded-full active:scale-95 transition-transform"
                      style={{
                        background: on ? BRAND : ALT,
                        color: on ? '#FFFFFF' : INK,
                        fontSize: 13, fontWeight: 600,
                        border: on ? 'none' : '1px solid rgba(0,0,0,0.08)',
                      }}>
                      {on ? '✓ ' : ''}{title}
                    </button>
                  );
                })}
              </div>
              {selectedDish && !file && selectedDish.image_url && (
                <p style={{ fontSize: 11, color: GREEN, marginTop: 6 }}>
                  {L("The dish photo will be used.", 'Gagamitin ang litrato ng ulam.')}
                </p>
              )}
            </div>
          )}

          {err && (
            <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{err}</p>
          )}
        </div>
      </div>
    </>
  );
}
