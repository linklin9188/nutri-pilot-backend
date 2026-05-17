/**
 * WeekendDiningReport — 周六周日 Home 的主内容。
 *
 * 用户在周末不需要"今天吃什么"的菜单（他们自己出去吃），需要的是：
 *   1. 本周吃过的营养小结（5 大蛋白 ✓/✗）
 *   2. 缺什么 — 出门时优先补这个
 *   3. 几张外食建议卡片（餐厅类型 + 为什么）
 *
 * 数据来自 weeklyDiarySummary.summarizeWeek()，把 eatingDiary + 本周菜单
 * 缓存合在一起 reduce。在家庭助理语气下温馨表达 — "今天出门换换口味吧"。
 */
import { useEffect, useState } from 'react';
import { summarizeWeek, buildDiningSuggestions, type WeeklySummary, type DiningSuggestion } from '../lib/weeklyDiarySummary';
import { DAILY } from '../lib/dailyNutrition';

const PROTEIN_LABEL: Record<string, { emoji: string; label: string }> = {
  fish:      { emoji: '🐟', label: '鱼' },
  shellfish: { emoji: '🦐', label: '虾蟹' },
  meat:      { emoji: '🥩', label: '红肉' },
  poultry:   { emoji: '🍗', label: '禽肉' },
  egg:       { emoji: '🥚', label: '蛋' },
  dairy:     { emoji: '🥛', label: '奶' },
  soy:       { emoji: '🌱', label: '豆' },
  tofu:      { emoji: '🌱', label: '豆腐' },
};

export default function WeekendDiningReport() {
  const [summary, setSummary]         = useState<WeeklySummary | null>(null);
  const [suggestions, setSuggestions] = useState<DiningSuggestion[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    let cancelled = false;
    summarizeWeek().then(s => {
      if (cancelled) return;
      setSummary(s);
      setSuggestions(buildDiningSuggestions(s));
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
      {/* Hero header */}
      <section
        className="rounded-3xl px-5 pt-5 pb-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #FFF7F2 0%, #FFE9DA 60%, #FFD9BF 100%)',
        }}>
        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#FF5A1F' }}>
            周末好
          </p>
          <h2 className="font-serif font-black mt-1" style={{ fontSize: 26, color: '#1a1a1a', lineHeight: 1.2 }}>
            出门换换口味吧
          </h2>
          <p className="font-serif italic mt-2" style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>
            周一到周五在家好好做了几顿，今天放下锅铲。我把本周吃过的整理给您。
          </p>
        </div>
        {/* Decorative emoji band */}
        <div className="absolute -right-2 -bottom-3 text-[88px] opacity-[0.18] select-none pointer-events-none">
          🍽
        </div>
      </section>

      {loading ? (
        <div className="rounded-3xl bg-white px-5 py-10 text-center"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <p className="text-[13px]" style={{ color: 'rgba(0,0,0,0.4)' }}>正在整理本周饭桌…</p>
        </div>
      ) : !summary || summary.totalDishes === 0 ? (
        <div className="rounded-3xl bg-white px-5 py-8 text-center"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <span className="text-[40px]">🍃</span>
          <p className="font-serif mt-2" style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)' }}>
            本周还没有菜单数据。今天先按心情挑家馆子吧。
          </p>
        </div>
      ) : (
        <>
          {/* 本周饭桌摘要 — 5 大蛋白 + 数据 */}
          <section className="rounded-3xl bg-white px-5 py-5"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <p className="text-[11px] font-bold text-secondary/60 uppercase tracking-wider mb-3">本周饭桌</p>

            {/* 5 protein checklist */}
            <p className="text-[13px] font-semibold text-on-surface mb-2">蛋白质轮值</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(DAILY.required_proteins as readonly string[]).map(p => {
                const meta = PROTEIN_LABEL[p] ?? { emoji: '🍽', label: p };
                const hit = summary.proteinsCovered.includes(p as any);
                return (
                  <div key={p}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{
                      background: hit ? 'rgba(37, 211, 102, 0.10)' : 'rgba(0,0,0,0.04)',
                      border: hit ? '1px solid rgba(37, 211, 102, 0.25)' : '1px solid rgba(0,0,0,0.06)',
                    }}>
                    <span style={{ fontSize: 14 }}>{meta.emoji}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: hit ? '#1e8449' : 'rgba(0,0,0,0.32)',
                      textDecoration: hit ? 'none' : 'line-through',
                    }}>
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-black/5">
              <Stat value={summary.totalDishes} label="道菜" />
              <Stat value={summary.distinctFoods} label="种食材" />
              <Stat value={summary.proteinsCovered.length} label="种蛋白" suffix={`/ ${DAILY.required_proteins.length}`} />
            </div>
          </section>

          {/* 缺什么 — 红色提醒 */}
          {(summary.proteinsMissing.length > 0 || summary.veggieGap || summary.fruitGap || !summary.wholeGrainPresent) && (
            <section className="rounded-3xl px-5 py-5"
              style={{
                background: 'linear-gradient(135deg, #FFF5F0 0%, #FFEEE6 100%)',
                border: '1px solid rgba(255,90,31,0.15)',
              }}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#FF5A1F' }}>
                这周还缺
              </p>
              <p className="font-serif text-[14px] leading-relaxed" style={{ color: '#1a1a1a' }}>
                {(() => {
                  const gaps: string[] = [];
                  if (summary.proteinsMissing.length > 0) {
                    const labels = summary.proteinsMissing.slice(0, 3).map(p => PROTEIN_LABEL[p]?.label ?? p);
                    gaps.push(labels.join('、'));
                  }
                  if (summary.veggieGap) gaps.push('蔬菜少了');
                  if (summary.fruitGap)  gaps.push('一份水果都没沾');
                  if (!summary.wholeGrainPresent) gaps.push('粗粮主食');
                  return gaps.length > 0
                    ? `这周饭桌上${gaps.join('，')}。今天出门吃，可以挑这些补一下。`
                    : '本周营养挺均衡，今天随心挑家馆子。';
                })()}
              </p>
            </section>
          )}

          {/* 外食建议 */}
          <section className="rounded-3xl bg-white px-5 py-5"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <p className="text-[11px] font-bold text-secondary/60 uppercase tracking-wider mb-3">今天的建议</p>
            <div className="flex flex-col gap-3">
              {suggestions.map((s, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-[24px]"
                    style={{ background: 'rgba(255,90,31,0.08)' }}>
                    {s.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-serif font-black text-[16px]" style={{ color: '#1a1a1a', letterSpacing: '-0.005em' }}>
                      {s.title}
                    </p>
                    <p className="text-[12.5px] mt-0.5 leading-relaxed" style={{ color: 'rgba(0,0,0,0.5)' }}>
                      {s.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Soft footer */}
          <p className="text-center font-serif italic px-6 pt-1"
            style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', lineHeight: 1.6 }}>
            周一回来，我又给您备好菜单。
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  return (
    <div className="text-center">
      <p className="font-black tabular-nums" style={{ fontSize: 22, color: '#1a1a1a' }}>
        {value}
        {suffix && <span className="font-normal ml-0.5" style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)' }}>{suffix}</span>}
      </p>
      <p className="mt-0.5" style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.04em', fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </p>
    </div>
  );
}
