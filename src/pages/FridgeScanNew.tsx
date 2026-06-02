/**
 * FridgeScanNew — 拍冰箱结果页 (图2, Warm Hearth 大改版, 老板 5/31 "重新做新页")
 *
 * 全新独立页, 挂 /scan-v2。旧拍冰箱逻辑(Home.tsx 内嵌弹窗)原封不动, 老板最后挑。
 *
 * 动线 (老板拍板"今天"路径①拍冰箱): 拍照/选图 → Gemini Vision 识别食材 →
 *   scanMatch 从 DB 配真实可做的菜 → 用户多选 → addDishToTodayMenu 写当日菜单 → 跳 /today。
 *   今天路径优先匹配冰箱已有料 (复用现成 suggestDishesFromScan, 零改算法)。
 *
 * 雇主端页, 中文 OK。复用: geminiVision.analyzeFridgePhoto + scanMatch + chefAddToToday。
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getDishTitle } from '../lib/dishTitleI18n';
import {
  analyzeFridgePhoto, fileToBase64,
  type ScanScene, type ScanLocale,
} from '../lib/geminiVision';
import {
  suggestDishesFromScan, normalizeIngredients,
  type MatchedDish,
} from '../lib/scanMatch';
import { loadCuisineMode } from '../lib/cuisineFilter';
import { addDishToTodayMenu } from '../lib/chefAddToToday';

const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

type Phase = 'idle' | 'scanning' | 'result' | 'error';

export default function FridgeScanNew() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language !== 'en';
  const t = (z: string, e: string) => (zh ? z : e);

  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [dishes, setDishes] = useState<MatchedDish[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [scene, setScene] = useState<ScanScene>('fridge');

  async function handleFile(file: File) {
    setPhase('scanning');
    setPreview(URL.createObjectURL(file));
    setIngredients([]);
    setDishes([]);
    setSelected(new Set());
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const locale: ScanLocale = 'zh';
      const result = await analyzeFridgePhoto(base64, mimeType, scene, locale);
      setIngredients(result.detected_ingredients);
      const normalized = normalizeIngredients(result.detected_ingredients);
      const matches = await suggestDishesFromScan({
        ingredients: normalized,
        cuisineMode: loadCuisineMode(),
        scene,
        limit: 9,
      });
      setDishes(matches);
      setPhase('result');
    } catch {
      setPhase('error');
    }
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addSelectedAndGo() {
    if (adding || selected.size === 0) return;
    setAdding(true);
    try {
      const ids = [...selected];
      let added = 0;
      for (const id of ids) {
        const r = await addDishToTodayMenu(id);
        if (!r.alreadyPresent) added++;
      }
      setToast(t(`已加入 ${added || ids.length} 道，打开今日菜单…`, `Added ${added || ids.length}, opening…`));
      setTimeout(() => { setToast(null); navigate('/today'); }, 1100);
    } catch {
      setToast(t('加入失败，请重试', 'Failed, retry'));
      setTimeout(() => setToast(null), 1800);
      setAdding(false);
    }
  }

  function reset() {
    setPhase('idle');
    setPreview(null);
    setIngredients([]);
    setDishes([]);
    setSelected(new Set());
  }

  return (
    <div className="min-h-screen max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: phase === 'result' && selected.size > 0 ? 96 : 32 }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 pt-5 pb-3" style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)' }}>
        <button onClick={() => navigate(-1)} className="rounded-full flex items-center justify-center active:scale-95 shrink-0"
          style={{ width: 40, height: 40, background: ALT }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <h1 className="font-black flex-1" style={{ fontSize: 22 }}>{t('拍冰箱', 'Scan Fridge')}</h1>
        {phase === 'result' && (
          <button onClick={reset} className="px-3 py-1.5 rounded-full font-bold active:scale-95"
            style={{ background: ALT, color: INK, fontSize: 13 }}>{t('重拍', 'Retake')}</button>
        )}
      </header>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} />

      <main className="px-4 py-3">
        {/* idle: 引导拍照 */}
        {phase === 'idle' && (
          <div className="flex flex-col items-center text-center pt-10">
            {/* 场景切换: 冰箱 / 超市货架 */}
            <div className="inline-flex p-1 rounded-2xl gap-0.5 mb-8" style={{ background: 'rgba(0,0,0,0.05)' }}>
              {([['fridge', '冰箱', 'Fridge'], ['shelf', '货架', 'Shelf']] as const).map(([k, z, e]) => {
                const on = scene === k;
                return (
                  <button key={k} onClick={() => setScene(k as ScanScene)}
                    className="px-4 py-1.5 rounded-xl font-bold transition-all active:scale-95"
                    style={{ fontSize: 13, background: on ? '#FFFFFF' : 'transparent', color: on ? INK : SUB, boxShadow: on ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
                    {t(z, e)}
                  </button>
                );
              })}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-3xl active:scale-[0.98] transition-transform"
              style={{ width: 220, height: 220, background: '#FFFFFF', boxShadow: '0 8px 30px rgba(255,90,31,0.10)', border: '2px dashed rgba(255,90,31,0.3)' }}>
              <span className="flex items-center justify-center rounded-full mb-3" style={{ width: 72, height: 72, background: 'rgba(255,90,31,0.10)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: BRAND }}>photo_camera</span>
              </span>
              <p className="font-bold" style={{ fontSize: 16 }}>{t('拍一张照片', 'Take a photo')}</p>
              <p style={{ fontSize: 12.5, color: SUB, marginTop: 4 }}>{t(scene === 'fridge' ? '拍冰箱里有什么' : '拍超市货架', 'What you have')}</p>
            </button>
            <p className="mt-8 px-8" style={{ fontSize: 13, color: SUB, lineHeight: 1.6 }}>
              {t('用现有食材出菜 — 我们看图认料，配上今天能做的菜', 'We read your photo and match dishes you can cook now')}
            </p>
          </div>
        )}

        {/* scanning: loading */}
        {phase === 'scanning' && (
          <div className="flex flex-col items-center pt-6">
            {preview && <div className="rounded-2xl bg-cover bg-center w-full mb-6" style={{ height: 180, backgroundImage: `url("${preview}")` }} />}
            <span className="inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: BRAND }} />
            <p className="mt-4 font-bold" style={{ fontSize: 15 }}>{t('正在识别食材…', 'Reading ingredients…')}</p>
            <p style={{ fontSize: 12.5, color: SUB, marginTop: 4 }}>{t('几秒钟就好', 'Just a few seconds')}</p>
          </div>
        )}

        {/* error */}
        {phase === 'error' && (
          <div className="flex flex-col items-center text-center pt-16">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#DC2626' }}>error_outline</span>
            <p className="font-bold mt-4" style={{ fontSize: 16 }}>{t('识别失败', 'Scan failed')}</p>
            <p style={{ fontSize: 13, color: SUB, marginTop: 4 }}>{t('换张清楚点的照片再试', 'Try a clearer photo')}</p>
            <button onClick={() => fileRef.current?.click()}
              className="mt-6 px-7 py-3 rounded-full font-bold text-white active:scale-95" style={{ background: BRAND, fontSize: 15 }}>
              {t('重新拍', 'Retake')}
            </button>
          </div>
        )}

        {/* result */}
        {phase === 'result' && (
          <>
            {preview && <div className="rounded-2xl bg-cover bg-center w-full mb-4" style={{ height: 140, backgroundImage: `url("${preview}")` }} />}
            {/* 识别到的食材 */}
            {ingredients.length > 0 && (
              <div className="mb-5">
                <p className="font-bold mb-2" style={{ fontSize: 13, color: SUB }}>{t('识别到', 'Detected')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ingredients.slice(0, 16).map((ing, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full font-medium" style={{ background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', fontSize: 12.5 }}>{ing}</span>
                  ))}
                </div>
              </div>
            )}
            {/* 可做的菜 */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold" style={{ fontSize: 18 }}>{t('能做这些菜', 'You can cook')}</h2>
              <span style={{ fontSize: 13, color: SUB }}>{dishes.length} {t('道', '')}</span>
            </div>
            {dishes.length === 0 ? (
              <div className="flex flex-col items-center text-center py-12 rounded-2xl" style={{ background: '#FFFFFF' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#CFCFC8' }}>search_off</span>
                <p className="font-bold mt-3" style={{ fontSize: 15 }}>{t('没匹配到菜', 'No match')}</p>
                <p style={{ fontSize: 12.5, color: SUB, marginTop: 4 }}>{t('换张照片，或去报菜名直接挑', 'Try another photo, or pick dishes')}</p>
                <button onClick={() => navigate('/chef')} className="mt-5 px-6 py-2.5 rounded-full font-bold text-white active:scale-95" style={{ background: BRAND, fontSize: 14 }}>
                  {t('去报菜名', 'Pick dishes')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {dishes.map(d => {
                  const on = selected.has(d.id);
                  return (
                    <button key={d.id} onClick={() => toggle(d.id)}
                      className="relative rounded-2xl overflow-hidden active:scale-[0.98] transition-transform text-left"
                      style={{ background: '#FFFFFF', boxShadow: on ? `0 0 0 2.5px ${BRAND}` : '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div className="bg-cover bg-center w-full" style={{ height: 110, background: ALT, backgroundImage: d.image_url ? `url("${d.image_url}")` : undefined }} />
                      {on && (
                        <span className="absolute top-2 right-2 flex items-center justify-center rounded-full text-white" style={{ width: 26, height: 26, background: BRAND }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>check</span>
                        </span>
                      )}
                      <div className="p-2.5">
                        <p className="font-bold truncate" style={{ fontSize: 14 }}>{getDishTitle(d as any, language) || d.title_zh}</p>
                        {d.matched_count > 0 && (
                          <p className="truncate" style={{ fontSize: 11.5, color: GREEN, marginTop: 2 }}>
                            ✓ {t(`用到 ${d.matched_count} 样冰箱食材`, `uses ${d.matched_count}`)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* 底部确认栏 */}
      {phase === 'result' && selected.size > 0 && (
        <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20"
          style={{ background: `${CREAM}f0`, backdropFilter: 'blur(8px)', borderTop: '1px solid #E5E5E0' }}>
          <div className="flex items-center gap-3 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
            <div className="flex-1">
              <p className="font-bold" style={{ fontSize: 15 }}>{t(`已选 ${selected.size} 道`, `${selected.size} selected`)}</p>
            </div>
            <button onClick={addSelectedAndGo} disabled={adding}
              className="flex items-center justify-center gap-2 rounded-full font-bold text-white active:scale-[0.98] disabled:opacity-60"
              style={{ height: 48, padding: '0 24px', background: BRAND, fontSize: 15, boxShadow: '0 8px 30px rgba(255,90,31,0.22)' }}>
              {adding ? '…' : <>{t('加入今天', 'Add to today')}<span className="material-symbols-outlined" style={{ fontSize: 19 }}>arrow_forward</span></>}
            </button>
          </div>
        </footer>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full text-white font-bold"
          style={{ bottom: 90, background: 'rgba(0,0,0,0.82)', fontSize: 13 }}>{toast}</div>
      )}
    </div>
  );
}
