/**
 * ChefAgent — 报菜名 (Warm Hearth 大改版, 老板 5/31 照 Stitch 图3 落地)
 *
 * 动线 (Stitch _3): 大标题"你想做什么菜？" → 自由搜索框 (命中真菜名, 可做绿标)
 *   → 快速选分类方块 (食材) → 菜卡横滑多选 (勾选叠层) → 底部"已选 N 道 / 生成做法"。
 *
 * "生成做法" = 把多选的菜一次性真写进当日菜单 (addDishToTodayMenu, 按餐次写
 *   dish_ids/swapped_dish_ids), 采购清单 + 菲佣端当天可见 → 跳今日菜单。
 *
 * 复用 (不新建): ingredientBrowse / dishNameSearch / chefAddToToday /
 *   getDishTitle / favorites 沉淀 / user_chat_preferences。
 * 视觉沿用 App @theme (cream #FCFBF8 + brand #FF5A1F); 可做绿标 = steps_verified。
 * 旧 4-tab app 一行不动, 共用引擎换壳。
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import { getDishTitle } from '../lib/dishTitleI18n';
import { INGREDIENT_GROUPS, browseByIngredient, type BrowseDish } from '../lib/ingredientBrowse';
import { findDishesMentionedIn, type DishNameMatch } from '../lib/dishNameSearch';
import { addDishToTodayMenu } from '../lib/chefAddToToday';
import { supabase } from '../lib/supabase';

// 选中项的最小载荷 (搜索结果 / 食材菜卡共用)
interface SelDish {
  id: string;
  title_zh: string | null;
  title_en: string | null;
  steps_verified: boolean | null;
}

// 菜谱详情 (点菜卡打开抽屉 — 下厨房核心: 用料 + 做法步骤 + 视频)
interface DetailDish {
  id: string;
  title_zh: string | null;
  title_en: string | null;
  image_url: string | null;
  cook_time_min: number | null;
  steps_verified: boolean | null;
  video_url: string | null;
  prep_steps_json: any;
  cook_steps_json: any;
}

// jsonb 有时被双重包成 string (见 useWeeklyMenu v57 unwrap) — 统一成数组
function asArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

export default function ChefAgent() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language !== 'en';
  const t = (z: string, e: string) => (zh ? z : e);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DishNameMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [catDishes, setCatDishes] = useState<BrowseDish[]>([]);
  const [loadingCat, setLoadingCat] = useState(false);

  const [selected, setSelected] = useState<Map<string, SelDish>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  // 菜谱详情抽屉
  const [detail, setDetail] = useState<DetailDish | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 点菜卡 → 拉详情 (cook_steps/prep_steps/video — BrowseDish/DishNameMatch 不含这些)
  async function openDetail(seed: SelDish & { image_url?: string | null; cook_time_min?: number | null }) {
    setDetailLoading(true);
    setDetail({
      id: seed.id, title_zh: seed.title_zh, title_en: seed.title_en,
      image_url: seed.image_url ?? null, cook_time_min: seed.cook_time_min ?? null,
      steps_verified: seed.steps_verified, video_url: null,
      prep_steps_json: [], cook_steps_json: [],
    });
    const { data } = await supabase
      .from('dishes')
      .select('id,title_zh,title_en,image_url,cook_time_min,steps_verified,video_url,prep_steps_json,cook_steps_json')
      .eq('id', seed.id)
      .maybeSingle();
    if (data) setDetail(data as DetailDish);
    setDetailLoading(false);
  }

  // 自由搜索 — 防抖命中真菜名
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debRef.current = setTimeout(async () => {
      const m = await findDishesMentionedIn(q, { limit: 8 });
      // findDishesMentionedIn 是反向包含; 短词补一个前缀兜底 (title 含 query)
      setResults(m);
      setSearching(false);
    }, 320);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query]);

  async function pickCat(g: typeof INGREDIENT_GROUPS[number]) {
    if (loadingCat) return;
    setActiveCat(g.key);
    setLoadingCat(true);
    // 主动选食材 = 高 confidence 偏好沉淀 (fire & forget)
    const uid = getUserId();
    if (uid) {
      supabase.from('user_chat_preferences').insert({
        user_id: uid, signal_type: 'love_keyword', keyword: g.key,
        confidence: 0.9, source: 'chef_ingredient_pick',
      }).then(undefined, () => { /* tolerant */ });
    }
    const dishes = await browseByIngredient(g.key, { limit: 12 });
    setCatDishes(dishes);
    setLoadingCat(false);
  }

  function toggle(d: SelDish) {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(d.id)) next.delete(d.id);
      else next.set(d.id, d);
      return next;
    });
  }

  async function generate() {
    if (generating || selected.size === 0) return;
    setGenerating(true);
    const items = [...selected.values()];
    let okCount = 0;
    let lastMeal: 'lunch' | 'dinner' = 'dinner';
    for (const d of items) {
      const res = await addDishToTodayMenu(d.id);
      if (res.ok) { okCount++; lastMeal = res.mealType; }
    }
    setGenerating(false);
    if (okCount === 0) {
      setToast({ kind: 'error', text: t('加入失败，请重试', 'Could not add — try again') });
      setTimeout(() => setToast(null), 3500);
      return;
    }
    const mealZh = lastMeal === 'lunch' ? '今日午餐' : '今晚';
    const mealEn = lastMeal === 'lunch' ? "today's lunch" : 'tonight';
    setToast({ kind: 'info', text: t(`✓ ${okCount} 道已加入${mealZh}`, `✓ Added ${okCount} to ${mealEn}`) });
    setTimeout(() => { setToast(null); navigate('/today'); }, 1100);
  }

  const count = selected.size;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: count > 0 ? 132 : 24 }}>
      {/* TopAppBar */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 h-16"
        style={{ background: CREAM }}>
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ color: BRAND }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="font-bold" style={{ fontSize: 18, color: BRAND }}>{t('报菜名', 'Report a Dish')}</div>
        <div className="w-10 h-10" />
      </header>

      {/* Main */}
      <main className="flex-1 px-5 pt-2">
        <h1 className="font-black mb-5" style={{ fontSize: 28, lineHeight: '34px', letterSpacing: '-0.5px' }}>
          {t('你想做什么菜？', 'What shall we cook?')}
        </h1>

        {/* 搜索框 */}
        <div className="rounded-2xl flex items-center px-4 py-3.5 mb-2"
          style={{ background: ALT, border: '1px solid transparent' }}>
          <span className="material-symbols-outlined mr-2.5" style={{ color: SUB, fontSize: 22 }}>search</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('输入菜名，如：番茄炒蛋、红烧肉…', 'Type a dish name…')}
            className="bg-transparent border-none outline-none w-full"
            style={{ fontSize: 16, color: INK }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="ml-2" style={{ color: SUB }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>
          )}
        </div>

        {/* 搜索结果行 */}
        {(searching || results.length > 0) && (
          <div className="mb-6 space-y-2">
            {searching && (
              <div className="flex items-center gap-2 py-2" style={{ color: SUB, fontSize: 13 }}>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span>
                {t('搜索中…', 'Searching…')}
              </div>
            )}
            {results.map(r => {
              const on = selected.has(r.id);
              const sel: SelDish = { id: r.id, title_zh: r.title_zh, title_en: r.title_en, steps_verified: r.steps_verified };
              const title = getDishTitle(r as any, language) || r.title_zh || '';
              return (
                <div key={r.id}
                  onClick={() => openDetail(sel)}
                  className="w-full rounded-2xl p-4 flex justify-between items-center active:scale-[0.98] transition-transform cursor-pointer"
                  style={{
                    background: '#FFFFFF',
                    border: on ? `2px solid ${BRAND}` : '1px solid #E5E5E0',
                    boxShadow: '0px 4px 20px rgba(0,0,0,0.04)',
                  }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={e => { e.stopPropagation(); toggle(sel); }}
                      className="shrink-0 active:scale-90 transition-transform"
                      aria-label={t('选中', 'select')}>
                      <span className="material-symbols-outlined" style={{ color: on ? BRAND : SUB, fontSize: 22 }}>
                        {on ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                    </button>
                    <span className="font-semibold truncate" style={{ fontSize: 16 }}>{title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.steps_verified && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(76,175,80,0.12)', color: GREEN, fontSize: 12, fontWeight: 600 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                        {t('可做', 'Ready')}
                      </span>
                    )}
                    <span className="material-symbols-outlined" style={{ color: SUB, fontSize: 20 }}>chevron_right</span>
                  </div>
                </div>
              );
            })}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="py-2" style={{ color: SUB, fontSize: 13 }}>
                {t('没找到这道菜，换个说法或从下面快速选', 'Not found — try the quick picks below')}
              </p>
            )}
          </div>
        )}

        {/* 快速选 — 食材方块 */}
        <h2 className="font-bold mb-3" style={{ fontSize: 20 }}>{t('快速选', 'Quick pick')}</h2>
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {INGREDIENT_GROUPS.map(g => {
            const on = activeCat === g.key;
            return (
              <button key={g.key} onClick={() => pickCat(g)}
                className="shrink-0 flex flex-col items-center justify-center rounded-[20px] active:scale-95 transition-all"
                style={{
                  width: 76, height: 76,
                  background: on ? '#E8E8E6' : '#F4F4F2',
                  border: on ? `2px solid ${BRAND}` : '2px solid transparent',
                }}>
                <span style={{ fontSize: 24, marginBottom: 2 }}>{g.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: on ? INK : SUB }}>{zh ? g.zh : g.en}</span>
              </button>
            );
          })}
        </div>

        {/* 菜卡横滑多选 */}
        {activeCat && (
          <div className="mt-4">
            {loadingCat ? (
              <div className="flex items-center gap-2 py-6" style={{ color: SUB, fontSize: 13 }}>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span>
                {t('在翻菜谱…', 'Finding dishes…')}
              </div>
            ) : catDishes.length === 0 ? (
              <p className="py-6" style={{ color: SUB, fontSize: 13 }}>{t('这类暂时没有，换个食材', 'None yet — try another')}</p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
                {catDishes.map(d => {
                  const on = selected.has(d.id);
                  const sel: SelDish = { id: d.id, title_zh: d.title_zh, title_en: d.title_en ?? null, steps_verified: d.steps_verified };
                  const title = getDishTitle(d as any, language) || d.title_zh;
                  return (
                    <div key={d.id}
                      onClick={() => openDetail({ ...sel, image_url: d.image_url, cook_time_min: d.cook_time_min })}
                      className="shrink-0 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left cursor-pointer"
                      style={{ width: 140 }}>
                      <div className="w-full relative rounded-[24px] overflow-hidden"
                        style={{ aspectRatio: '1', background: ALT, boxShadow: '0px 4px 20px rgba(0,0,0,0.04)' }}>
                        {d.image_url && (
                          <img src={d.image_url} alt={title} className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        {/* 右上勾选圈 — 独立 toggle, 不触发详情 */}
                        <button
                          onClick={e => { e.stopPropagation(); toggle(sel); }}
                          className="absolute top-2 right-2 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                          style={{ width: 28, height: 28, background: on ? BRAND : 'rgba(255,255,255,0.92)', border: `2px solid ${CREAM}` }}
                          aria-label={t('选中', 'select')}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: on ? '#FFFFFF' : SUB }}>
                            {on ? 'check' : 'add'}
                          </span>
                        </button>
                        {d.steps_verified && (
                          <span className="absolute bottom-2 left-2 flex items-center gap-0.5 px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.92)', color: GREEN, fontSize: 11, fontWeight: 600 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
                            {t('可做', 'Ready')}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold truncate px-1" style={{ fontSize: 15 }}>{title}</span>
                      {d.cook_time_min != null && (
                        <span className="px-1" style={{ fontSize: 12, color: SUB, marginTop: -4 }}>⏱ {d.cook_time_min}min</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 底部固定动作栏 */}
      {count > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 px-5 pt-3"
          style={{
            background: CREAM, boxShadow: '0px -4px 20px rgba(0,0,0,0.05)',
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)',
          }}>
          <div className="flex justify-between items-center mb-3 px-1">
            <span style={{ fontSize: 16 }}>
              {t('已选', 'Selected')} <strong style={{ color: BRAND }}>{count}</strong> {t('道', '')}
            </span>
            <button onClick={() => setSelected(new Map())} style={{ fontSize: 14, color: SUB, fontWeight: 500 }}>
              {t('清空', 'Clear')}
            </button>
          </div>
          <button onClick={generate} disabled={generating}
            className="w-full py-4 rounded-full font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ background: BRAND, fontSize: 18, boxShadow: '0px 8px 30px rgba(255,90,31,0.22)' }}>
            <span className="material-symbols-outlined">auto_awesome</span>
            {generating ? t('加入中…', 'Adding…') : t('生成做法', 'Generate')}
          </button>
        </div>
      )}

      {/* 菜谱详情抽屉 — 下厨房核心: 用料 + 做法步骤 + 视频 */}
      {detail && (() => {
        const dTitle = getDishTitle(detail as any, language) || detail.title_zh || '';
        const prep = asArr(detail.prep_steps_json);
        const cook = asArr(detail.cook_steps_json);
        const on = selected.has(detail.id);
        const pick = (z: any, e: any) => (zh ? (z ?? e) : (e ?? z)) as string;
        return (
          <div className="fixed inset-0 z-[120] flex flex-col justify-end" onClick={() => setDetail(null)}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
            <div onClick={e => e.stopPropagation()}
              className="relative w-full max-w-md mx-auto flex flex-col"
              style={{ background: CREAM, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88vh' }}>
              {/* drag handle + close */}
              <div className="flex items-center justify-between px-5 pt-3 pb-1">
                <div className="w-9" />
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
                <button onClick={() => setDetail(null)} className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90" style={{ color: SUB }}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="overflow-y-auto px-5 pb-3" style={{ scrollbarWidth: 'none' }}>
                {/* 头图 */}
                {detail.image_url && (
                  <div className="w-full rounded-[20px] overflow-hidden mb-3" style={{ aspectRatio: '16/10', background: ALT }}>
                    <img src={detail.image_url} alt={dTitle} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <h2 className="font-black" style={{ fontSize: 22 }}>{dTitle}</h2>
                  {detail.cook_time_min != null && (
                    <span style={{ fontSize: 13, color: SUB }}>⏱ {detail.cook_time_min}min</span>
                  )}
                  {detail.steps_verified && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(76,175,80,0.12)', color: GREEN, fontSize: 12, fontWeight: 600 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
                      {t('可做', 'Ready')}
                    </span>
                  )}
                </div>

                {/* 视频教程 */}
                {detail.video_url && (
                  <a href={detail.video_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 mb-4 active:scale-[0.98] transition-transform"
                    style={{ background: 'rgba(255,0,0,0.08)', color: '#D00' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>smart_display</span>
                    <span className="font-semibold" style={{ fontSize: 14 }}>{t('看视频教程', 'Watch video')}</span>
                  </a>
                )}

                {detailLoading && (
                  <div className="flex items-center gap-2 py-6" style={{ color: SUB, fontSize: 13 }}>
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span>
                    {t('在翻菜谱…', 'Loading recipe…')}
                  </div>
                )}

                {/* 用料 */}
                {!detailLoading && prep.length > 0 && (
                  <div className="mb-5">
                    <h3 className="font-bold mb-2 flex items-center gap-1.5" style={{ fontSize: 16 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: BRAND }}>shopping_basket</span>
                      {t('用料', 'Ingredients')}
                    </h3>
                    <div className="rounded-2xl px-4 py-1" style={{ background: '#FFFFFF', border: '1px solid #E5E5E0' }}>
                      {prep.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-2.5"
                          style={{ borderBottom: i < prep.length - 1 ? '1px solid #F0F0EC' : 'none' }}>
                          <span style={{ fontSize: 15 }}>{pick(p.ingredient_zh, p.ingredient_en)}</span>
                          {p.amount_g != null && <span style={{ fontSize: 14, color: SUB }}>{p.amount_g}g</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 做法步骤 */}
                {!detailLoading && cook.length > 0 && (
                  <div className="mb-2">
                    <h3 className="font-bold mb-2 flex items-center gap-1.5" style={{ fontSize: 16 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: BRAND }}>skillet</span>
                      {t('做法', 'Steps')}
                    </h3>
                    <div className="space-y-3">
                      {cook.map((s: any, i: number) => (
                        <div key={i} className="flex gap-3">
                          <div className="shrink-0 rounded-full flex items-center justify-center font-bold text-white"
                            style={{ width: 26, height: 26, background: BRAND, fontSize: 13 }}>
                            {s.step ?? i + 1}
                          </div>
                          <div className="flex-1 pb-1">
                            <p style={{ fontSize: 15, lineHeight: 1.55 }}>{pick(s.action_zh, s.action_en)}</p>
                            <div className="flex items-center gap-3 mt-1">
                              {s.duration_min != null && (
                                <span style={{ fontSize: 12, color: SUB }}>⏱ {s.duration_min}min</span>
                              )}
                              {pick(s.state_target_zh, s.state_target_en) && (
                                <span style={{ fontSize: 12, color: GREEN }}>✓ {pick(s.state_target_zh, s.state_target_en)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!detailLoading && prep.length === 0 && cook.length === 0 && (
                  <p className="py-6 text-center" style={{ color: SUB, fontSize: 13 }}>
                    {t('这道菜的详细做法还在补充中', 'Recipe details coming soon')}
                  </p>
                )}
              </div>

              {/* 底部加入按钮 */}
              <div className="px-5 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button
                  onClick={() => { toggle({ id: detail.id, title_zh: detail.title_zh, title_en: detail.title_en, steps_verified: detail.steps_verified }); setDetail(null); }}
                  className="w-full py-3.5 rounded-full font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ background: on ? ALT : BRAND, color: on ? INK : '#FFFFFF', fontSize: 16, marginTop: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{on ? 'remove_circle' : 'add_circle'}</span>
                  {on ? t('已选 · 点击移出', 'Selected · tap to remove') : t('加入今日菜单', 'Add to today')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[130] px-4 py-2.5 rounded-full font-semibold pointer-events-none"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 12px) + 96px)',
            background: toast.kind === 'error' ? 'rgba(220,38,38,0.96)' : 'rgba(28,28,28,0.96)',
            color: 'white', fontSize: 14, maxWidth: '90%',
          }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
