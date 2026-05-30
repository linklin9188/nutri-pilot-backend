/**
 * ChefAgent — TICKET-113 agent-first MVP "爱吃主厨" (老板 5/30)
 *
 * 老板 5/30 战略: "不再是 app 的时代了". 在不改原有任何东西的基础上, 共用同一套
 * 引擎/数据/lib, 新做一个 agent-first 产品先 MVP, 确认了再上线.
 *
 * 设计 — 对话脊柱 + 内联卡, 不是聊天气泡塞 grid:
 *   - 顶部: 主厨问候 (context-aware: 时段 + 今日在家人数)
 *   - 中部: 对话流 — 主厨消息 / 用户消息 / 内联菜卡 (BrowseDish 卡片)
 *   - 底部: 食材 chip 快捷入口 (牛肉/鱼/鸡…) + 自由输入框
 *
 * 复用 (不新建): ingredientBrowse / favorites / getDishTitle / dishFields /
 *   loadEmployerTodayMenu / user_chat_preferences (偏好沉淀) / supabase.
 *
 * 旧 app 零改动: 新路由 /chef, 旧 4-tab app 一行不动. 共用引擎换个壳。
 *
 * MVP 范围 (P0): 食材浏览 → 内联热门菜卡 → 看详情 (图/营养/味道) → 收藏 +
 *   加今日菜单 (菲佣可见). 营养本地展示, 0 LLM. 暂不接 chatStreaming (P1 再接
 *   自然语言), MVP 先用 chip + 规则应答证明交互模型。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import { getDishTitle } from '../lib/dishTitleI18n';
import { toggleFavorite, isFavorited } from '../lib/favorites';
import { INGREDIENT_GROUPS, browseByIngredient, type BrowseDish } from '../lib/ingredientBrowse';
import { supabase } from '../lib/supabase';
import { addDishToTodayMenu } from '../lib/chefAddToToday';

type Msg =
  | { kind: 'chef'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'dishes'; dishes: BrowseDish[]; ingredientZh: string };

function greeting(hour: number, t: (zh: string, en: string) => string): string {
  if (hour < 11) return t('早上好 ☀️ 今天想吃点什么？', 'Morning ☀️ What would you like today?');
  if (hour < 16) return t('中午好 🍽 今天想吃点什么？', 'Afternoon 🍽 What are you craving?');
  return t('晚上好 🌙 今晚想吃点什么？', 'Evening 🌙 What shall we cook tonight?');
}

export default function ChefAgent() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language !== 'en';
  const t = (z: string, e: string) => (zh ? z : e);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<BrowseDish | null>(null);
  const [todayAdded, setTodayAdded] = useState<Set<string>>(new Set());
  const [addingToday, setAddingToday] = useState(false);
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 开场 — context-aware 问候
  useEffect(() => {
    const h = new Date().getHours();
    setMsgs([{ kind: 'chef', text: greeting(h, t) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  async function pickIngredient(g: typeof INGREDIENT_GROUPS[number]) {
    if (busy) return;
    setBusy(true);
    setMsgs(m => [...m, { kind: 'user', text: `${g.emoji} ${zh ? g.zh : g.en}` }]);
    // 沉淀偏好 (主动选 = 高 confidence) — fire & forget
    const uid = getUserId();
    if (uid) {
      supabase.from('user_chat_preferences').insert({
        user_id: uid, signal_type: 'love_keyword', keyword: g.key,
        confidence: 0.9, source: 'chef_ingredient_pick',
      }).then(undefined, () => { /* tolerant: 表/列不符则忽略 */ });
    }
    const dishes = await browseByIngredient(g.key, { limit: 10 });
    setBusy(false);
    if (dishes.length === 0) {
      setMsgs(m => [...m, { kind: 'chef', text: t('暂时没找到这类做法，换个食材试试？', 'No dishes found for that — try another?') }]);
      return;
    }
    setMsgs(m => [...m,
      { kind: 'chef', text: t(`这是${g.zh}最受欢迎的做法 👇 点开看看`, `Here are the most popular ${g.en.toLowerCase()} dishes 👇`) },
      { kind: 'dishes', dishes, ingredientZh: zh ? g.zh : g.en },
    ]);
  }

  async function addToToday(d: BrowseDish) {
    // TICKET-113 P0 (老板 5/30): 真写当日菜单 (swapped_dish_ids 合并去重),
    // 采购清单 + 菲佣端当天可见。同时保留「主厨点单」收藏沉淀。
    if (addingToday) return;
    if (todayAdded.has(d.id)) return;
    setAddingToday(true);

    // 收藏沉淀 (保留原 UX: 加入今日同时仍收藏到「主厨点单」)。
    toggleFavorite({
      id: d.id, title_zh: d.title_zh, title_en: d.title_en ?? undefined,
      image_url: d.image_url ?? undefined, main_ingredient: d.main_ingredient ?? undefined,
      source_tag: '主厨点单',
    });

    const res = await addDishToTodayMenu(d.id);
    setAddingToday(false);

    if (!res.ok) {
      setToast({ kind: 'error', text: t('加入今日失败，可重试', 'Could not add — try again') });
      setTimeout(() => setToast(null), 3500);
      return;
    }

    setTodayAdded(s => new Set(s).add(d.id));
    const mealZh = res.mealType === 'lunch' ? '今日午餐' : '今晚';
    const mealEn = res.mealType === 'lunch' ? "today's lunch" : 'tonight';
    setToast({
      kind: 'info',
      text: res.alreadyPresent
        ? t(`已在${mealZh}菜单里`, `Already in ${mealEn}`)
        : t(`✓ 已加入${mealZh}菜单`, `✓ Added to ${mealEn}`),
    });
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 px-5 pt-12 pb-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(180deg, #0a0a0a 70%, transparent)' }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,90,31,0.18)' }}>
          <span style={{ fontSize: 18 }}>👨‍🍳</span>
        </div>
        <div className="flex-1">
          <h1 className="font-black text-white" style={{ fontSize: 17 }}>{t('爱吃主厨', 'Aieats Chef')}</h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{t('说一声想吃什么', 'Just tell me what you crave')}</p>
        </div>
        <button onClick={() => navigate('/')}
          className="text-white/40 active:scale-90 transition-transform"
          style={{ fontSize: 12 }}>
          {t('经典版', 'Classic')}
        </button>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        {msgs.map((m, i) => {
          if (m.kind === 'chef') return (
            <div key={i} className="flex items-start gap-2 max-w-[88%]">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,90,31,0.18)' }}>
                <span style={{ fontSize: 14 }}>👨‍🍳</span>
              </div>
              <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <p className="text-white/90" style={{ fontSize: 14, lineHeight: 1.5 }}>{m.text}</p>
              </div>
            </div>
          );
          if (m.kind === 'user') return (
            <div key={i} className="flex justify-end">
              <div className="rounded-2xl rounded-tr-sm px-3.5 py-2.5" style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}>
                <p className="text-white font-semibold" style={{ fontSize: 14 }}>{m.text}</p>
              </div>
            </div>
          );
          // dishes — 横滑内联卡
          return (
            <div key={i} className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {m.dishes.map(d => {
                const title = getDishTitle(d as any, language) || d.title_zh;
                return (
                  <button key={d.id} onClick={() => setDetail(d)}
                    className="flex-shrink-0 rounded-2xl overflow-hidden text-left active:scale-[0.97] transition-transform"
                    style={{ width: 156, background: '#161616', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="w-full relative" style={{ height: 104, background: 'rgba(255,255,255,0.05)' }}>
                      {d.image_url && <img src={d.image_url} alt={title} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                      {d.xiaomei_compatible && (
                        <span className="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5" style={{ background: 'rgba(255,90,31,0.92)', fontSize: 9, color: 'white', fontWeight: 700 }}>
                          {t('小美可做', 'Robot OK')}
                        </span>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="font-bold text-white leading-tight line-clamp-2" style={{ fontSize: 12.5, minHeight: 32 }}>{title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {d.cook_time_min != null && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>⏱ {d.cook_time_min}min</span>}
                        {d.nutrition_kcal_per_serving != null && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>🔥 {Math.round(d.nutrition_kcal_per_serving)}kcal</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 text-white/40 px-2">
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span>
            <span style={{ fontSize: 12 }}>{t('主厨在翻菜谱…', 'Chef is thinking…')}</span>
          </div>
        )}
      </div>

      {/* 食材 chip 快捷入口 */}
      <div className="shrink-0 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {INGREDIENT_GROUPS.map(g => (
            <button key={g.key} onClick={() => pickIngredient(g)} disabled={busy}
              className="shrink-0 px-3.5 py-2 rounded-full font-bold active:scale-95 transition-transform disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', fontSize: 13, color: 'white' }}>
              {g.emoji} {zh ? g.zh : g.en}
            </button>
          ))}
        </div>
      </div>

      {/* Toast — 加入今日 成功/失败 提示态 */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[130] px-4 py-2.5 rounded-full font-semibold pointer-events-none"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 12px) + 92px)',
            background: toast.kind === 'error' ? 'rgba(220,38,38,0.95)' : 'rgba(28,28,28,0.96)',
            border: toast.kind === 'error' ? '1px solid rgba(255,120,120,0.4)' : '1px solid rgba(255,140,84,0.4)',
            color: 'white', fontSize: 13, maxWidth: '90%',
          }}>
          {toast.text}
        </div>
      )}

      {/* 详情卡 — 图/营养/味道 */}
      {detail && (() => {
        const title = getDishTitle(detail as any, language) || detail.title_zh;
        const added = todayAdded.has(detail.id);
        const fav = isFavorited(detail.id);
        return (
          <div className="fixed inset-0 z-[120] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setDetail(null)}>
            <div className="w-full max-w-md rounded-t-3xl overflow-hidden" style={{ background: '#161616', maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
              <div className="w-full relative" style={{ height: 200, background: 'rgba(255,255,255,0.05)' }}>
                {detail.image_url && <img src={detail.image_url} alt={title} className="w-full h-full object-cover" />}
                <button onClick={() => setDetail(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(88vh - 200px)' }}>
                <h2 className="font-black text-white" style={{ fontSize: 19 }}>{title}</h2>
                {/* 味道 tags */}
                {detail.flavor_tags && detail.flavor_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {detail.flavor_tags.slice(0, 6).map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,90,31,0.15)', color: '#FF8C54', fontSize: 11 }}>{tag}</span>
                    ))}
                  </div>
                )}
                {detail.description_zh && zh && <p className="text-white/60 mt-3" style={{ fontSize: 13, lineHeight: 1.6 }}>{detail.description_zh}</p>}
                {/* 营养 — 本地展示 */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[
                    { label: t('热量', 'kcal'), val: detail.nutrition_kcal_per_serving, unit: '' },
                    { label: t('蛋白', 'Protein'), val: detail.protein_g, unit: 'g' },
                    { label: t('碳水', 'Carb'), val: detail.carb_g, unit: 'g' },
                    { label: t('脂肪', 'Fat'), val: detail.fat_g, unit: 'g' },
                  ].map((n, i) => (
                    <div key={i} className="rounded-xl py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <p className="font-black text-white" style={{ fontSize: 15 }}>{n.val != null ? Math.round(n.val) : '—'}<span style={{ fontSize: 10 }}>{n.unit}</span></p>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{n.label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-3 text-white/50" style={{ fontSize: 12 }}>
                  {detail.cook_time_min != null && <span>⏱ {detail.cook_time_min} min</span>}
                  {detail.xiaomei_compatible && <span style={{ color: '#FF8C54' }}>🤖 {t('小美一键做', 'Robot-ready')}</span>}
                </div>
                {/* 动作 */}
                <div className="flex gap-2.5 mt-5">
                  <button onClick={() => { toggleFavorite({ id: detail.id, title_zh: detail.title_zh, title_en: detail.title_en ?? undefined, image_url: detail.image_url ?? undefined }); setDetail({ ...detail }); }}
                    className="flex-1 py-3 rounded-2xl font-bold active:scale-[0.98] transition-transform"
                    style={{ background: fav ? 'rgba(255,90,31,0.15)' : 'rgba(255,255,255,0.08)', color: fav ? '#FF8C54' : 'white', fontSize: 13 }}>
                    {fav ? `★ ${t('已收藏', 'Saved')}` : `☆ ${t('收藏', 'Save')}`}
                  </button>
                  <button onClick={async () => { await addToToday(detail); setDetail(null); }}
                    disabled={added || addingToday}
                    className="flex-[1.5] py-3 rounded-2xl font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 13 }}>
                    {added ? `✓ ${t('已加入', 'Added')}` : addingToday ? t('加入中…', 'Adding…') : t('加入今日想吃', 'Add to today')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
