/**
 * HelperCookNew — 做饭/当日烹饪页 (Warm Hearth 大改版, 老板 5/31 "重新做一个新页")
 *
 * 挂 /cook 与 /cook-v2。整条产品链的终点: 雇主选菜 → 菜单进系统 → 照这页把菜做出来。
 *
 * 语言策略 (老板 6/22 更新 — 做饭页是雇主/菲佣共用业务页):
 *   - 语言跟随当前用户: 雇主中文, 菲佣英文 / 她设定的语言 (Tagalog)。
 *   - 菲佣端语言永不是 zh (onboarding 设 en/tl/id), 所以"菲佣端运行时零中文"仍成立;
 *     代码里的 zh 文案只在雇主 (language=zh) 时出现。
 *   - dish 步骤数据三语齐全 (prep/cook_steps_json 各有 _zh/_en/_tl, 报菜名详情页同源)。
 *   - 印尼语 (id) 菲佣因 dish 数据无印尼字段, UI + 步骤回退英文。
 *
 * 角色边界 (老板拍板): 菲佣是"干活的人"。只告诉她今天做啥/什么顺序/每步怎么做/做到什么程度。
 *   不让她选菜, 不给偏好问卷, 越简单越好。永久免费, 绝不出现 trial / 试用。
 *
 * 数据: loadEmployerTodayMenu(uid, dayOffset) 读雇主当日菜单 (复用现成引擎, 不改算法)。
 * 形态: 今天菜单列表 → 点一道菜 → 全屏步骤模式 (Mise en place 备料卡 → 逐步做法)。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import { supabase } from '../lib/supabase';
import CantCookButton from '../components/CantCookButton';
import {
  loadEmployerTodayMenu, type EmployerMenuResult, type EmployerDishLite,
} from '../lib/helperEmployerMenu';

// ── Warm Hearth tokens ───────────────────────────────────────────────────────
const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

// 共用页三语: 雇主 zh / 菲佣 en / 菲佣设 Tagalog → tl。en 兜底 (含印尼语 id)。
type HLang = 'zh' | 'en' | 'tl';
function useHelperLang(): HLang {
  const { language } = useLanguage();
  if (language === 'zh' || language === 'zh-Hant') return 'zh';
  if (language === 'tl') return 'tl';
  return 'en';
}

// 托盘 ABCD 含义 (CLAUDE.md: A/B/C/D = 主料 / 配菜 / 配料 / 调料)
const TRAY_LABEL: Record<string, { zh: string; en: string; tl: string; color: string }> = {
  A: { zh: '主料', en: 'Main', tl: 'Pangunahin', color: '#FF5A1F' },
  B: { zh: '配菜', en: 'Veggies', tl: 'Gulay', color: '#4CAF50' },
  C: { zh: '配料', en: 'Aromatics', tl: 'Pampalasa', color: '#3B82F6' },
  D: { zh: '调料', en: 'Seasoning', tl: 'Rekado', color: '#A855F7' },
};

// ── JSON 解包 (DB jsonb 可能是 string 或已解析数组) ─────────────────────────
interface PrepStep {
  tray?: string; amount_g?: number;
  ingredient_zh?: string; ingredient_en?: string; ingredient_tl?: string;
  action_zh?: string; action_en?: string; action_tl?: string;
  substitutes_zh?: string[]; substitutes_en?: string[]; substitutes_tl?: string[];
}
interface CookStep {
  step?: number; duration_min?: number;
  action_zh?: string; action_en?: string; action_tl?: string;
  state_target_zh?: string; state_target_en?: string; state_target_tl?: string;
}
function unwrap<T>(raw: unknown): T[] {
  if (!raw) return [];
  let arr: any = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr.map((e: any) => (typeof e === 'string' ? (() => { try { return JSON.parse(e); } catch { return e; } })() : e));
}

// ── 火候解析 (基于英文 action 文本稳定识别, 显示走三语 label) ───────────────────
type HeatLevel = 'high' | 'medium' | 'low' | 'simmer' | 'temp';
function parseHeat(text: string): { level: HeatLevel | null; zh: string; en: string; tl: string } {
  const t = (text || '').toLowerCase();
  const tempMatch = t.match(/(\d{2,3})\s*(?:°c|℃|degrees?\b)/);
  if (tempMatch) { const c = parseInt(tempMatch[1]); return { level: 'temp', zh: `${c}°C`, en: `${c}°C`, tl: `${c}°C` }; }
  if (/simmer|braise|reduce to (a )?low|cover and (cook|wait)/.test(t)) return { level: 'simmer', zh: '小火慢煨', en: 'Simmer', tl: 'Pakuluan ng Mahina' };
  if (/high heat|on high|over high/.test(t))   return { level: 'high',   zh: '大火',   en: 'High Heat',   tl: 'Mataas na Apoy' };
  if (/medium heat|on medium|over medium|medium-low|medium-high/.test(t)) return { level: 'medium', zh: '中火', en: 'Medium Heat', tl: 'Katamtamang Apoy' };
  if (/low heat|on low|over low|gentle/.test(t)) return { level: 'low',  zh: '小火',   en: 'Low Heat',    tl: 'Mahinang Apoy' };
  return { level: null, zh: '', en: '', tl: '' };
}
const HEAT_CONFIG: Record<HeatLevel, { bg: string; light: string; border: string; icon: string }> = {
  high:   { bg: '#FF4500', light: 'rgba(255,69,0,0.12)',   border: 'rgba(255,69,0,0.3)',   icon: '🔥🔥🔥' },
  medium: { bg: '#FF8C00', light: 'rgba(255,140,0,0.12)',  border: 'rgba(255,140,0,0.3)',  icon: '🔥🔥' },
  low:    { bg: '#4DA6FF', light: 'rgba(77,166,255,0.12)', border: 'rgba(77,166,255,0.3)', icon: '🔥' },
  simmer: { bg: '#00B4A0', light: 'rgba(0,180,160,0.12)',  border: 'rgba(0,180,160,0.3)',  icon: '♨️' },
  temp:   { bg: '#9B59B6', light: 'rgba(155,89,182,0.12)', border: 'rgba(155,89,182,0.3)', icon: '🌡️' },
};
function formatTime(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const MEALS: { key: 'breakfast' | 'lunch' | 'dinner'; icon: string; zh: string; en: string; tl: string }[] = [
  { key: 'breakfast', icon: 'wb_sunny', zh: '早餐', en: 'Breakfast', tl: 'Almusal' },
  { key: 'lunch', icon: 'lunch_dining', zh: '午餐', en: 'Lunch', tl: 'Tanghalian' },
  { key: 'dinner', icon: 'dinner_dining', zh: '晚餐', en: 'Dinner', tl: 'Hapunan' },
];

export default function HelperCookNew() {
  const navigate = useNavigate();
  const lang = useHelperLang();
  const L = (zh: string, en: string, tl: string) => (lang === 'zh' ? zh : lang === 'tl' ? tl : en);

  const [searchParams] = useSearchParams();
  const singleDishId = searchParams.get('dish_id');

  const [menu, setMenu] = useState<EmployerMenuResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDish, setActiveDish] = useState<EmployerDishLite | null>(null);

  // dishes 选列 (与 helperEmployerMenu 对齐, 单菜直达复用)
  const DISH_FIELDS =
    'id, title_zh, title_en, image_url, main_ingredient, course_type, meal_type, ' +
    'prep_steps_json, cook_steps_json, video_url, video_lang, video_platform, cook_time_min, ' +
    'steps_verified, description_zh, description_en';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 单菜直达 (?dish_id= 从 HelperHome 等跳来): 直接拉那一道开步骤模式, 不依赖菜单绑定。
      if (singleDishId) {
        const { data } = await supabase.from('dishes').select(DISH_FIELDS).eq('id', singleDishId).maybeSingle();
        if (!cancelled) {
          if (data) setActiveDish(data as unknown as EmployerDishLite);
          setLoading(false);
        }
        return;
      }
      const uid = getUserId();
      const res = await loadEmployerTodayMenu(uid, 0);
      if (!cancelled) { setMenu(res); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [singleDishId]);

  const byMeal = menu?.byMeal ?? { breakfast: [], lunch: [], dinner: [] };
  const hasAny = (menu?.dishes?.length ?? 0) > 0;

  // 步骤模式: 选中一道菜 → 全屏
  if (activeDish) {
    return <CookStepsScreen dish={activeDish} lang={lang} onBack={() => setActiveDish(null)} />;
  }

  // 菜单列表模式
  return (
    <div className="min-h-screen max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: 40 }}>
      <header className="sticky top-0 z-20 px-5 pt-6 pb-3" style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)' }}>
        <p style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: SUB, fontWeight: 600 }}>
          {new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="font-black mt-1" style={{ fontSize: 26 }}>{L('今天做菜', "Today's Cooking", 'Lutuin Ngayon')}</h1>
        <p style={{ fontSize: 13, color: SUB, marginTop: 2 }}>
          {L('点一道菜看做法步骤', 'Tap a dish to see the steps', 'I-tap ang ulam para makita ang hakbang')}
        </p>
      </header>

      <main className="px-5 py-2 space-y-6">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl" style={{ height: 88, background: ALT, opacity: 0.6 }} />)}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center text-center pt-20 px-6">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#CFCFC8' }}>restaurant</span>
            <p className="font-bold mt-4" style={{ fontSize: 17 }}>{L('今天还没有菜单', 'No menu yet today', 'Wala pang menu ngayon')}</p>
            <p className="mt-1" style={{ fontSize: 14, color: SUB }}>
              {L('雇主还没安排今天的菜。', 'The employer has not set the menu yet.', 'Hindi pa naka-set ang menu ng amo.')}
            </p>
          </div>
        ) : (
          MEALS.map(m => {
            const list = byMeal[m.key];
            if (!list || list.length === 0) return null;
            return (
              <section key={m.key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined" style={{ color: BRAND, fontSize: 22 }}>{m.icon}</span>
                  <h2 className="font-bold" style={{ fontSize: 18 }}>{L(m.zh, m.en, m.tl)}</h2>
                </div>
                <div className="space-y-3">
                  {list.map(d => <DishCard key={`${m.key}-${d.id}`} d={d} lang={lang} onOpen={() => setActiveDish(d)} />)}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}

// 菜卡 (列表) — 标题随语言 (雇主中文 / 菲佣英文, 永不给菲佣中文) + 图 + 步数 + 时长
function DishCard({ d, lang, onOpen }: { d: EmployerDishLite; lang: HLang; onOpen: () => void }) {
  const L = (zh: string, en: string, tl: string) => (lang === 'zh' ? zh : lang === 'tl' ? tl : en);
  // 雇主 zh → 中文标题; 菲佣 (en/tl) → 英文标题, 永不 fallback 中文 (零中文硬规矩)
  const title = lang === 'zh' ? (d.title_zh || d.title_en || '菜品') : (d.title_en || L('', 'Dish', 'Ulam'));
  const cookSteps = unwrap<CookStep>(d.cook_steps_json);
  const prepSteps = unwrap<PrepStep>(d.prep_steps_json);
  return (
    <button onClick={onOpen}
      className="w-full flex items-stretch gap-3.5 rounded-2xl p-3 active:scale-[0.99] transition-transform text-left"
      style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="rounded-xl bg-cover bg-center shrink-0"
        style={{ width: 84, height: 84, background: ALT, backgroundImage: d.image_url ? `url("${d.image_url}")` : undefined }} />
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <p className="font-bold" style={{ fontSize: 16, lineHeight: 1.25 }}>{title}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {d.steps_verified && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(76,175,80,0.12)', color: GREEN, fontSize: 11.5, fontWeight: 500 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
              {L('可做', 'Ready', 'Handa')}
            </span>
          )}
          {prepSteps.length > 0 && <span style={{ fontSize: 11.5, color: SUB }}>🧺 {prepSteps.length} {L('备料', 'prep', 'paghahanda')}</span>}
          {cookSteps.length > 0 && <span style={{ fontSize: 11.5, color: SUB }}>🔥 {cookSteps.length} {L('步', 'steps', 'hakbang')}</span>}
          {typeof d.cook_time_min === 'number' && d.cook_time_min > 0 && (
            <span style={{ fontSize: 11.5, color: SUB }}>⏱ {d.cook_time_min}min</span>
          )}
        </div>
      </div>
      <div className="flex items-center">
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#CFCFC8' }}>chevron_right</span>
      </div>
    </button>
  );
}

// ── 全屏步骤模式 (合并版: 备料托盘 + 逐步聚焦做法 + 计时/火候/视频/求助/分享) ────
function CookStepsScreen({ dish, lang, onBack }: { dish: EmployerDishLite; lang: HLang; onBack: () => void }) {
  const L = (zh: string, en: string, tl: string) => (lang === 'zh' ? zh : lang === 'tl' ? tl : en);
  // dish 字段三语: 雇主 zh 取 _zh (缺则退英文); 菲佣 en/tl 永不取 _zh (零中文)
  const txt = (zh?: string, en?: string, tl?: string) =>
    lang === 'zh' ? (zh || en || '') : lang === 'tl' ? (tl || en || '') : (en || '');
  const navigate = useNavigate();
  const title = lang === 'zh' ? (dish.title_zh || dish.title_en || '菜品') : (dish.title_en || L('', 'Dish', 'Ulam'));
  const prep = useMemo(() => unwrap<PrepStep>(dish.prep_steps_json), [dish]);
  const cook = useMemo(() => unwrap<CookStep>(dish.cook_steps_json), [dish]);

  // phase: 'prep' (Mise en place 备料托盘) → 'cook' (逐步聚焦做法)
  const [phase, setPhase] = useState<'prep' | 'cook'>('prep');

  // ── 备料按托盘分组 ──
  const prepByTray = useMemo(() => {
    const groups: Record<string, PrepStep[]> = {};
    for (const p of prep) {
      const tray = (p.tray || 'A').toUpperCase();
      (groups[tray] ||= []).push(p);
    }
    return groups;
  }, [prep]);

  // ── cook 聚焦单步状态 (合并自旧 HelperCook) ──
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<Record<number, { remaining: number; running: boolean }>>({});
  const activeTimerRef = useRef<number | null>(null);
  const [feedbackAck, setFeedbackAck] = useState<Set<string>>(new Set());

  const step = cook[currentIdx];
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === cook.length - 1;
  const completedCount = completed.size;
  const allDone = completedCount >= cook.length && cook.length > 0;

  // 求助反馈 → user_feedback_helper (静默 + 一次重试, 菲佣永不见报错)
  async function sendStepFeedback(type: 'cant_understand' | 'too_hard' | 'missing_ingredient') {
    const ackKey = `${currentIdx}-${type}`;
    setFeedbackAck(prev => { const s = new Set(prev); s.add(ackKey); return s; });
    setTimeout(() => setFeedbackAck(prev => { const s = new Set(prev); s.delete(ackKey); return s; }), 3000);
    const payload = {
      user_id: getUserId() ?? 'anonymous',
      dish_id: dish.id,
      step_index: currentIdx,
      feedback_type: type,
      locale: lang,
    };
    const attempt = () => supabase.from('user_feedback_helper').insert(payload);
    try { const { error } = await attempt(); if (error) await attempt(); } catch { /* silent */ }
  }

  // 切到某步 → 自动起该步计时 (有时长才起)。仅 cook phase。
  useEffect(() => {
    if (phase !== 'cook' || !step || !(step.duration_min && step.duration_min > 0)) return;
    const idx = currentIdx;
    setTimers(prev => {
      if (prev[idx]) return prev; // 已有计时态, 不重置
      const next: Record<number, { remaining: number; running: boolean }> = {};
      for (const k of Object.keys(prev)) { const n = Number(k); next[n] = prev[n].running ? { ...prev[n], running: false } : prev[n]; }
      next[idx] = { remaining: Math.round((step.duration_min as number) * 60), running: true };
      activeTimerRef.current = idx;
      return next;
    });
  }, [currentIdx, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // 倒计时 tick
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const next = { ...prev }; let changed = false;
        for (const key of Object.keys(next)) {
          const k = Number(key); const s = next[k];
          if (s.running && s.remaining > 0) { next[k] = { ...s, remaining: s.remaining - 1 }; changed = true; }
          else if (s.running && s.remaining === 0) { next[k] = { ...s, running: false }; if (activeTimerRef.current === k) activeTimerRef.current = null; changed = true; }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleTimer() {
    if (!step || !(step.duration_min && step.duration_min > 0)) return;
    const idx = currentIdx;
    setTimers(prev => {
      const existing = prev[idx];
      const next = { ...prev };
      if (!existing || !existing.running) {
        for (const k of Object.keys(next)) { const n = Number(k); if (n !== idx && next[n].running) next[n] = { ...next[n], running: false }; }
        const rem = existing && existing.remaining > 0 ? existing.remaining : Math.round((step.duration_min as number) * 60);
        next[idx] = { remaining: rem, running: true };
        activeTimerRef.current = idx;
      } else {
        next[idx] = { ...existing, running: false };
        activeTimerRef.current = null;
      }
      return next;
    });
  }

  function markDoneAndNext() {
    setCompleted(prev => { const s = new Set(prev); s.add(currentIdx); return s; });
    if (!isLast) setCurrentIdx(i => i + 1);
  }

  // 火候: 基于英文 action 文本稳定识别 (中文文本正则匹配不到关键词), 显示走三语 label
  const heat = step ? parseHeat(step.action_en || '') : { level: null, zh: '', en: '', tl: '' };
  const heatCfg = heat.level ? HEAT_CONFIG[heat.level] : null;
  const timer = timers[currentIdx];
  const timerRunning = timer?.running ?? false;
  const durationSec = step?.duration_min ? Math.round(step.duration_min * 60) : 0;
  const hasTimer = durationSec > 0;
  const timerRemaining = timer?.remaining ?? durationSec;
  const timerDone = timer ? timer.remaining === 0 : false;

  return (
    <div className="min-h-screen max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: 120 }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 pt-5 pb-3"
        style={{ background: `${CREAM}e6`, backdropFilter: 'blur(8px)' }}>
        <button onClick={onBack} className="rounded-full flex items-center justify-center active:scale-95 shrink-0"
          style={{ width: 40, height: 40, background: ALT }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black truncate" style={{ fontSize: 19 }}>{title}</h1>
          {phase === 'cook' && cook.length > 0 ? (
            <p style={{ fontSize: 12, color: SUB }}>
              {L(`第 ${currentIdx + 1} / ${cook.length} 步 · 完成 ${completedCount}`,
                 `Step ${currentIdx + 1} of ${cook.length} · ${completedCount} done`,
                 `Hakbang ${currentIdx + 1} ng ${cook.length} · ${completedCount} tapos`)}
            </p>
          ) : (
            typeof dish.cook_time_min === 'number' && dish.cook_time_min > 0 && (
              <p style={{ fontSize: 12, color: SUB }}>⏱ {dish.cook_time_min} min</p>
            )
          )}
        </div>
      </header>

      {/* 菜品图 (做饭页配图 — 老板 6/22 "做饭界面无法显示图片") */}
      {dish.image_url && (
        <div className="px-4 pt-2">
          <div className="w-full rounded-2xl bg-cover bg-center"
            style={{ height: 156, backgroundColor: ALT, backgroundImage: `url("${dish.image_url}")`, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }} />
        </div>
      )}

      {/* phase 切换 tab */}
      <div className="px-4 pt-2">
        <div className="inline-flex p-1 rounded-2xl gap-0.5 w-full" style={{ background: 'rgba(0,0,0,0.05)' }}>
          {(['prep', 'cook'] as const).map(p => {
            const on = phase === p;
            return (
              <button key={p} onClick={() => setPhase(p)}
                className="flex-1 py-2 rounded-xl font-bold transition-all active:scale-95"
                style={{ fontSize: 13.5, background: on ? '#FFFFFF' : 'transparent', color: on ? INK : SUB, boxShadow: on ? '0 2px 8px rgba(0,0,0,0.08)' : 'none' }}>
                {p === 'prep'
                  ? `🧺 ${L('备料', 'Prep', 'Paghahanda')} (${prep.length})`
                  : `🔥 ${L('做菜', 'Cook', 'Pagluluto')} (${cook.length})`}
              </button>
            );
          })}
        </div>
      </div>

      <main className="px-4 py-4">
        {phase === 'prep' ? (
          <>
            <p className="mb-4" style={{ fontSize: 13, color: SUB }}>
              {L('先把所有材料备好, 按托盘分组:', 'Prepare everything first. Group by tray:', 'Ihanda muna lahat. Grupo ayon sa tray:')}
            </p>
            {prep.length === 0 ? (
              <p className="text-center py-10" style={{ fontSize: 14, color: SUB }}>{L('无需备料', 'No prep needed', 'Walang paghahanda')}</p>
            ) : (
              <div className="space-y-4">
                {(['A', 'B', 'C', 'D'] as const).map(tray => {
                  const items = prepByTray[tray];
                  if (!items || items.length === 0) return null;
                  const meta = TRAY_LABEL[tray];
                  return (
                    <div key={tray} className="rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: `${meta.color}14` }}>
                        <span className="flex items-center justify-center rounded-lg font-black text-white" style={{ width: 26, height: 26, background: meta.color, fontSize: 14 }}>{tray}</span>
                        <span className="font-bold" style={{ fontSize: 14, color: meta.color }}>{L(meta.zh, meta.en, meta.tl)}</span>
                      </div>
                      <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                        {items.map((p, i) => {
                          const subs = lang === 'zh' ? (p.substitutes_zh ?? p.substitutes_en ?? [])
                                     : lang === 'tl' ? (p.substitutes_tl ?? p.substitutes_en ?? [])
                                     : (p.substitutes_en ?? []);
                          return (
                            <div key={i} className="px-4 py-3">
                              <div className="flex items-baseline justify-between gap-3">
                                <p className="font-bold" style={{ fontSize: 15 }}>
                                  {txt(p.ingredient_zh, p.ingredient_en, p.ingredient_tl)}
                                </p>
                                {typeof p.amount_g === 'number' && p.amount_g > 0 && (
                                  <span className="shrink-0 tabular-nums" style={{ fontSize: 13, color: BRAND, fontWeight: 700 }}>{p.amount_g} g</span>
                                )}
                              </div>
                              {txt(p.action_zh, p.action_en, p.action_tl) && (
                                <p style={{ fontSize: 13, color: SUB, marginTop: 3, lineHeight: 1.5 }}>{txt(p.action_zh, p.action_en, p.action_tl)}</p>
                              )}
                              {subs.length > 0 && (
                                <p style={{ fontSize: 12, color: '#A855F7', marginTop: 4 }}>
                                  ↔ {L('或用', 'or use', 'o gamitin')}: {subs.join(', ')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : cook.length === 0 ? (
          <p className="text-center py-10" style={{ fontSize: 14, color: SUB }}>{L('暂无做法步骤', 'No steps available', 'Walang hakbang')}</p>
        ) : (
          <>
            {/* 进度条 + 步点 */}
            <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(0,0,0,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(completedCount / cook.length) * 100}%`, background: GREEN }} />
            </div>
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {cook.map((_, i) => (
                <button key={i} onClick={() => setCurrentIdx(i)} className="rounded-full transition-all active:scale-90"
                  style={{ width: i === currentIdx ? 24 : 8, height: 8, background: completed.has(i) ? GREEN : i === currentIdx ? BRAND : 'rgba(0,0,0,0.15)' }} />
              ))}
            </div>

            {/* 🆘 这道我没做过 (雇主中文 / 菲佣英文, 不给菲佣中文) */}
            <div className="mb-3">
              <CantCookButton dish={{ id: dish.id, title_zh: lang === 'zh' ? (dish.title_zh || dish.title_en || title) : (dish.title_en || title) }} />
            </div>

            {/* 视频教程 (有 video_url 才红色显示) */}
            {dish.video_url ? (
              <a href={dish.video_url} target="_blank" rel="noopener noreferrer"
                className="block py-3 px-5 rounded-2xl text-center font-bold active:scale-95 transition-transform mb-3"
                style={{ background: 'linear-gradient(135deg, #FF4757, #FF6B6B)', color: '#FFFFFF', fontSize: 15, boxShadow: '0 4px 16px rgba(255,71,87,0.3)' }}>
                🎬 {L('看视频教程', 'Watch tutorial', 'Manood ng tutorial')}
                {dish.video_lang && <span className="opacity-80 ml-1" style={{ fontSize: 12 }}> · {dish.video_lang.toUpperCase()}</span>}
              </a>
            ) : null}

            {/* 火候提示 */}
            {heatCfg && (
              <div className="rounded-2xl px-5 py-4 flex items-center gap-4 mb-3" style={{ background: heatCfg.light, border: `1.5px solid ${heatCfg.border}` }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-3xl" style={{ background: heatCfg.bg + '22' }}>{heatCfg.icon}</div>
                <p className="font-black" style={{ fontSize: 24, color: heatCfg.bg, lineHeight: 1 }}>{L(heat.zh, heat.en, heat.tl)}</p>
              </div>
            )}

            {/* 当前步骤卡 */}
            {step && (
              <div className="rounded-2xl px-5 py-5 mb-3" style={{ background: completed.has(currentIdx) ? 'rgba(76,175,80,0.10)' : '#FFFFFF', border: `1.5px solid ${completed.has(currentIdx) ? 'rgba(76,175,80,0.30)' : 'rgba(0,0,0,0.08)'}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white" style={{ background: completed.has(currentIdx) ? GREEN : BRAND, fontSize: 14 }}>
                    {completed.has(currentIdx) ? '✓' : (step.step ?? currentIdx + 1)}
                  </div>
                  <span style={{ fontSize: 12, color: SUB, fontWeight: 600 }}>
                    {completed.has(currentIdx) ? L('已完成 ✓', 'Done ✓', 'Tapos ✓') : L('当前步骤', 'Current step', 'Kasalukuyang hakbang')}
                  </span>
                </div>
                <p className="leading-relaxed" style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.6 }}>{txt(step.action_zh, step.action_en, step.action_tl)}</p>
                {txt(step.state_target_zh, step.state_target_en, step.state_target_tl) && (
                  <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-2xl" style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)' }}>
                    <span style={{ fontSize: 16 }}>🎯</span>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 10, color: GREEN, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>{L('做到这样', 'Done when', 'Tapos kapag')}</div>
                      <p style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.5 }}>{txt(step.state_target_zh, step.state_target_en, step.state_target_tl)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 求助按钮 ❓🥵🛒 */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { type: 'cant_understand' as const, emoji: '❓', zh: '看不懂', en: "Don't get it", tl: 'Hindi maintindihan' },
                { type: 'too_hard' as const, emoji: '🥵', zh: '太难了', en: 'Too hard', tl: 'Masyadong mahirap' },
                { type: 'missing_ingredient' as const, emoji: '🛒', zh: '缺材料', en: 'Missing item', tl: 'Walang sangkap' },
              ]).map(({ type, emoji, zh, en, tl }) => {
                const acked = feedbackAck.has(`${currentIdx}-${type}`);
                return (
                  <button key={type} onClick={() => sendStepFeedback(type)}
                    className="rounded-2xl py-2.5 px-2 flex flex-col items-center gap-1 active:scale-95 transition-transform"
                    style={{ background: acked ? 'rgba(76,175,80,0.16)' : '#FFFFFF', border: `1px solid ${acked ? 'rgba(76,175,80,0.35)' : 'rgba(0,0,0,0.08)'}` }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{acked ? '✓' : emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: acked ? GREEN : 'rgba(0,0,0,0.7)', lineHeight: 1.2, textAlign: 'center' }}>{L(zh, en, tl)}</span>
                  </button>
                );
              })}
            </div>

            {/* 计时器 */}
            {hasTimer && (
              <button onClick={handleTimer}
                className="w-full rounded-2xl py-5 flex flex-col items-center gap-2 active:scale-[0.97] transition-transform"
                style={{ background: timerDone ? 'rgba(76,175,80,0.12)' : timerRunning ? 'rgba(255,90,31,0.12)' : '#FFFFFF', border: `1.5px solid ${timerDone ? 'rgba(76,175,80,0.3)' : timerRunning ? 'rgba(255,90,31,0.3)' : 'rgba(0,0,0,0.08)'}` }}>
                <div className="font-black tabular-nums" style={{ fontSize: 48, letterSpacing: 2, color: timerDone ? GREEN : timerRunning ? BRAND : 'rgba(0,0,0,0.7)' }}>
                  {timerDone ? L('好了!', 'Done!', 'Tapos na!') : formatTime(timerRemaining)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: timerDone ? GREEN : timerRunning ? BRAND : SUB, fontVariationSettings: "'FILL' 1" }}>
                    {timerDone ? 'check_circle' : timerRunning ? 'pause_circle' : 'play_circle'}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: timerDone ? GREEN : timerRunning ? BRAND : SUB }}>
                    {timerDone ? L('计时结束 ✓', 'Timer done ✓', 'Tapos na ang oras ✓') : timerRunning ? L('点击暂停', 'Tap to pause', 'I-tap para i-pause') : L('点击继续', 'Tap to resume', 'I-tap para ituloy')}
                  </span>
                </div>
              </button>
            )}

            {allDone && (
              <div className="rounded-2xl p-5 text-center mt-3" style={{ background: 'rgba(76,175,80,0.14)', border: '1.5px solid rgba(76,175,80,0.35)' }}>
                <p className="text-3xl mb-1">🎉</p>
                <p className="font-black" style={{ fontSize: 17 }}>{title} {L('做好了!', 'done!', 'tapos na!')}</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* 底部: prep→cook 推进 / cook 逐步导航 / cook 完成→分享 */}
      <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20"
        style={{ background: `${CREAM}f0`, backdropFilter: 'blur(8px)', borderTop: '1px solid #E5E5E0' }}>
        <div className="px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
          {phase === 'prep' ? (
            <button onClick={() => setPhase('cook')}
              className="w-full flex items-center justify-center gap-2 rounded-full font-bold text-white active:scale-[0.98] transition-transform"
              style={{ height: 50, background: BRAND, fontSize: 15, boxShadow: '0 8px 30px rgba(255,90,31,0.22)' }}>
              {L('开始做菜', 'Start cooking', 'Simulan ang pagluluto')}
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>local_fire_department</span>
            </button>
          ) : allDone || cook.length === 0 ? (
            <div className="flex items-center gap-2.5">
              {/* Share → 菲佣社区 composer (compose=1 自动开 + dish 预选) */}
              <button onClick={() => navigate(`/helper-community?compose=1&dish=${dish.id}`)}
                className="shrink-0 flex items-center justify-center gap-1.5 rounded-full font-bold active:scale-[0.98] transition-transform"
                style={{ height: 50, paddingLeft: 18, paddingRight: 18, background: '#FFFFFF', color: BRAND, border: `1.5px solid ${BRAND}`, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>photo_camera</span>
                {L('晒一下', 'Share', 'Ibahagi')}
              </button>
              <button onClick={onBack}
                className="flex-1 flex items-center justify-center gap-2 rounded-full font-bold text-white active:scale-[0.98] transition-transform"
                style={{ height: 50, background: allDone ? GREEN : INK, fontSize: 15 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                {allDone ? L('完成! 回菜单', 'Done! Back to menu', 'Tapos! Bumalik sa menu') : L('回菜单', 'Back to menu', 'Bumalik sa menu')}
              </button>
            </div>
          ) : (
            <div className="flex gap-2.5">
              <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={isFirst}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full font-bold active:scale-95 transition-transform disabled:opacity-30"
                style={{ height: 50, background: ALT, fontSize: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back_ios</span>
                {L('上一步', 'Back', 'Bumalik')}
              </button>
              <button onClick={markDoneAndNext}
                className="flex-[2] flex items-center justify-center gap-2 rounded-full font-bold text-white active:scale-[0.98] transition-transform"
                style={{ height: 50, background: isLast ? GREEN : BRAND, fontSize: 15 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: isLast ? "'FILL' 1" : undefined }}>{isLast ? 'check_circle' : 'arrow_forward_ios'}</span>
                {isLast ? L('做好这道!', 'Finish this dish!', 'Tapusin ito!') : L('好了, 下一步', 'Done, next step', 'Tapos, susunod')}
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
