/**
 * DailyNutritionStrip — a 3-section card on Home that turns today's 3
 * meals into a 中国营养主厨-shaped scorecard:
 *   - 能量条:   30/40/30 三餐能量分配进度
 *   - 必现:     鱼/肉/蛋/奶/豆 5 类蛋白覆盖
 *   - 上限:     油/盐/糖 g 估算 vs 30/5/25 g cap
 *
 * Designed to fit under the "今日餐桌" card on Home — collapsed by
 * default, taps to expand for the per-dish offender list (e.g.
 * "高盐: 京酱肉丝 · 三杯鸡").
 */
import { useEffect, useState } from 'react';
import { summarizeDay, capStatus, splitStatus, DAILY, type DayMeals, type DailySnapshot } from '../lib/dailyNutrition';
import { getEatenToday } from '../lib/eatingDiary';

const tint = (s: 'good' | 'warn' | 'over' | 'off') =>
  s === 'good' ? '#16A34A'
  : s === 'warn' ? '#F59E0B'
  : '#DC2626';

const tintBg = (s: 'good' | 'warn' | 'over' | 'off') =>
  s === 'good' ? 'rgba(22,163,74,0.10)'
  : s === 'warn' ? 'rgba(245,158,11,0.12)'
  : 'rgba(220,38,38,0.10)';

const PROTEIN_LABEL = {
  fish:  { emoji: '🐟', label: '鱼' },
  meat:  { emoji: '🥩', label: '肉' },
  egg:   { emoji: '🥚', label: '蛋' },
  dairy: { emoji: '🥛', label: '奶' },
  soy:   { emoji: '🫘', label: '豆' },
} as const;

interface Props {
  meals: DayMeals;
  kcalTarget?: number;
}

export default function DailyNutritionStrip({ meals, kcalTarget }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Listen for both swap (nutri-prefs-changed) and eaten (nutri-eaten-changed)
  // so the strip re-renders the instant the user ticks a dish or 换菜.
  // Bumping `tick` invalidates getEatenToday / summarizeDay via the
  // dependency-free read below.
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener('nutri-eaten-changed', bump);
    window.addEventListener('nutri-prefs-changed', bump);
    return () => {
      window.removeEventListener('nutri-eaten-changed', bump);
      window.removeEventListener('nutri-prefs-changed', bump);
    };
  }, []);

  // Filter mode: if the user has ticked ANY dish today, switch to
  // "actual diary" mode and summarize only what they actually ate.
  // Otherwise stay in "planned forecast" mode showing the menu.
  const eaten = getEatenToday();
  const hasAnyEaten = eaten.size > 0;
  const filterMeals = (arr: any[]) =>
    hasAnyEaten ? arr.filter(d => d.id && eaten.has(d.id)) : arr;
  const mealsForSnap: DayMeals = {
    早餐: filterMeals(meals.早餐 ?? []),
    午餐: filterMeals(meals.午餐 ?? []),
    晚餐: filterMeals(meals.晚餐 ?? []),
  };
  const snap = summarizeDay(mealsForSnap, { kcalTarget });

  // Caps are household-scaled (per-person cap × servings) so a 4-person
  // family doesn't get red-flagged for normal household totals.
  const oilStat   = capStatus(snap.oilGramsEstimate,   snap.caps.oil);
  const saltStat  = capStatus(snap.saltGramsEstimate,  snap.caps.salt);
  const sugarStat = capStatus(snap.sugarGramsEstimate, snap.caps.sugar);

  const splitStat = {
    breakfast: splitStatus(snap.kcal.splitPct.breakfast, 30),
    lunch:     splitStatus(snap.kcal.splitPct.lunch,     40),
    dinner:    splitStatus(snap.kcal.splitPct.dinner,    30),
  };

  // Nothing to show if no meals exist yet AND nothing has been eaten —
  // we'd be a card displaying all zeros, which is noise.
  if (snap.kcal.total === 0 && !hasAnyEaten) return null;

  return (
    <div
      className="w-full bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 text-left active:scale-[0.99] transition-transform"
      >
        {/* ── Row 1 · 三餐能量条 ───────────────────────── */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', fontWeight: 700, letterSpacing: '0.08em' }}>
            今日营养
            <span className="rounded-full px-1.5 py-0.5 font-bold" style={{
              fontSize: 9, letterSpacing: '0.02em',
              background: hasAnyEaten ? 'rgba(22,163,74,0.10)' : 'rgba(0,0,0,0.05)',
              color:      hasAnyEaten ? '#16A34A' : 'rgba(0,0,0,0.45)',
            }}>
              {hasAnyEaten ? `✅ 实际 ${eaten.size}` : '📊 计划'}
            </span>
          </span>
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', fontWeight: 600 }}>
            {snap.kcal.total} / {snap.kcal.target} kcal
          </span>
        </div>
        {/* Visual energy bar split into 3 segments by meal */}
        <div className="flex h-2 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(0,0,0,0.06)' }}>
          {snap.kcal.total > 0 && (
            <>
              <div title={`早餐 ${snap.kcal.splitPct.breakfast}% (目标 30%)`}
                style={{ width: `${snap.kcal.splitPct.breakfast}%`, background: tint(splitStat.breakfast) }} />
              <div title={`午餐 ${snap.kcal.splitPct.lunch}% (目标 40%)`}
                style={{ width: `${snap.kcal.splitPct.lunch}%`,     background: tint(splitStat.lunch) }} />
              <div title={`晚餐 ${snap.kcal.splitPct.dinner}% (目标 30%)`}
                style={{ width: `${snap.kcal.splitPct.dinner}%`,    background: tint(splitStat.dinner) }} />
            </>
          )}
        </div>

        {/* ── Row 2 · 必现 5 蛋白 ──────────────────────── */}
        <div className="flex items-center gap-1.5 mb-2">
          {DAILY.required_proteins.map(p => {
            const got = snap.proteinsCovered.has(p);
            const meta = PROTEIN_LABEL[p];
            return (
              <span key={p}
                className="rounded-full px-2 py-0.5 font-bold inline-flex items-center gap-0.5"
                style={{
                  background: got ? 'rgba(22,163,74,0.10)' : 'rgba(0,0,0,0.04)',
                  color:      got ? '#16A34A' : 'rgba(0,0,0,0.30)',
                  fontSize: 10,
                }}>
                <span>{meta.emoji}</span>{meta.label}
              </span>
            );
          })}
          <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.42)', marginLeft: 'auto' }}>
            {snap.proteinsCovered.size}/5 必现
          </span>
        </div>

        {/* ── Row 3 · 油/盐/糖 上限 ─────────────────────── */}
        <div className="flex items-center gap-1.5">
          <Pill label="油" value={`${snap.oilGramsEstimate}g`}   cap={snap.caps.oil}   stat={oilStat} />
          <Pill label="盐" value={`${snap.saltGramsEstimate}g`}  cap={snap.caps.salt}  stat={saltStat} />
          <Pill label="糖" value={`${snap.sugarGramsEstimate}g`} cap={snap.caps.sugar} stat={sugarStat} />
          <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.42)', marginLeft: 'auto' }}>
            {snap.distinctFoods}/12 食材 · {snap.cookMethodCount} 烹饪法
          </span>
        </div>
      </button>

      {/* ── Expanded · 高油/盐/糖 offender list ─────────────────── */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-black/5 pt-2 space-y-1.5">
          {snap.proteinsMissing.length > 0 && (
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>
              <span style={{ color: '#DC2626' }}>⚠</span> 今日缺：
              {snap.proteinsMissing.map(p => (
                <span key={p} className="ml-1.5">
                  {PROTEIN_LABEL[p].emoji}{PROTEIN_LABEL[p].label}
                </span>
              ))}
            </p>
          )}
          {snap.highOilDishes.length > 0 && (
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>
              <span style={{ color: '#F59E0B' }}>💧</span> 高油 {snap.highOilDishes.length} 道：
              {snap.highOilDishes.map(d => d.title_zh).join(' · ')}
            </p>
          )}
          {snap.highSaltDishes.length > 0 && (
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>
              <span style={{ color: '#F59E0B' }}>🧂</span> 高盐 {snap.highSaltDishes.length} 道：
              {snap.highSaltDishes.map(d => d.title_zh).join(' · ')}
            </p>
          )}
          {snap.highSugarDishes.length > 0 && (
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>
              <span style={{ color: '#F59E0B' }}>🍬</span> 高糖 {snap.highSugarDishes.length} 道：
              {snap.highSugarDishes.map(d => d.title_zh).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, cap, stat }: { label: string; value: string; cap: number; stat: 'good' | 'warn' | 'over' }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-bold inline-flex items-center gap-1"
      style={{ background: tintBg(stat), color: tint(stat), fontSize: 10 }}
      title={`${label}：${value} / ≤${cap}g`}
    >
      <span>{label}</span><span>{value}</span>
    </span>
  );
}
