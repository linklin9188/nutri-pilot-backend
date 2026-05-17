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
import { type DiningTag, resolveRestaurantImage } from '../lib/hkRestaurants';
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
      {/* Hero header — HK harbour-side restaurant vibe.
          Image: Victoria Harbour with waterfront dining ambience; chosen to
          set up "出门换换口味" as a clearly Hong-Kong experience. The dark
          gradient overlay keeps text legible while letting the harbour
          colors show through. */}
      <section
        className="rounded-3xl pt-5 pb-6 relative overflow-hidden"
        style={{ minHeight: 180 }}>
        {/* Background photo */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=1200&q=85&auto=format&fit=crop"
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center 35%' }}
          />
          {/* Dark gradient overlay so the cream text reads against any photo */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(160deg, rgba(20,30,50,0.55) 0%, rgba(20,30,50,0.25) 45%, rgba(255,160,80,0.15) 100%)',
          }} />
        </div>
        <div className="relative z-10 px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/90"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            周末好 · Weekend
          </p>
          <h2 className="font-serif font-black mt-1 text-white"
            style={{ fontSize: 26, lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}>
            出門換換口味吧
          </h2>
          <p className="font-serif italic mt-2 text-white/85"
            style={{ fontSize: 13, lineHeight: 1.5, textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
            週一到週五在家好好做了幾頓，今天放下鍋鏟。我把本週吃過的整理給您，再挑幾間香港的好館子。
          </p>
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

          {/* 外食建议 — real HK restaurants tied to this week's gaps.
              Each card: restaurant name + cuisine pill + area + 招牌菜 + the
              gap-reason that surfaced it + 预订 CTA. The 预订 button is a
              stub right now — opens OpenRice / homepage, copies the phone,
              or just shows 即將上線. Future: real booking integration with
              revenue share. */}
          <section className="rounded-3xl bg-white px-5 py-5"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] font-bold text-secondary/60 uppercase tracking-wider">
                今天的推薦
              </p>
              <p className="text-[10px] font-bold" style={{ color: '#FF5A1F', letterSpacing: '0.06em' }}>
                香港 · 米其林 / 必比登
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {suggestions.map((s, i) => (
                <RestaurantCard key={s.restaurant.id + i} suggestion={s} />
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

// Per-card render. Separate component so we can attach state for booking
// flow later (loading state, confirmation modal, etc.).
function RestaurantCard({ suggestion }: { suggestion: DiningSuggestion }) {
  const { restaurant: r, reason, tag } = suggestion;
  const [copied, setCopied] = useState(false);

  // 预订 stub: prefer external link → fallback to phone copy → fallback to alert.
  // Real booking flow lives in Phase 2 (餐厅合作 + 抽成).
  const handleBook = () => {
    if (r.link) {
      window.open(r.link, '_blank', 'noopener,noreferrer');
      return;
    }
    if (r.phone) {
      navigator.clipboard?.writeText(r.phone).catch(() => {/* offline-tolerant */});
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      return;
    }
    alert('預訂功能即將上線，敬請期待 🍴');
  };

  // Map tag → small icon for the card avatar
  const tagEmoji: Record<DiningTag, string> = {
    fish: '🐟', shellfish: '🦐', meat: '🥩', poultry: '🍗', egg: '🥚',
    dairy: '🥛', soy: '🌱', veggie: '🥗', fruit: '🍓', grain: '🌾',
    light: '🍵', banquet: '🌸',
  };

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
      style={{
        background: '#FFFDFB',
        border: '1px solid rgba(255,90,31,0.10)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}>
      {/* ── Hero photo (16:9-ish) with Michelin pill + price overlay ── */}
      <div className="relative w-full" style={{ aspectRatio: '16 / 9', background: '#f5f0eb' }}>
        <img
          src={resolveRestaurantImage(r)}
          alt={r.name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Bottom gradient so overlay text always reads */}
        <div className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.55))' }} />
        {/* Top-right: Michelin pill */}
        {r.michelin && (
          <span
            className="absolute top-2.5 right-2.5 px-2 py-1 rounded-md font-bold tabular-nums"
            style={{
              fontSize: 10, letterSpacing: '0.04em',
              background: r.michelin === 'Bib'
                ? 'linear-gradient(135deg, #FFF1C7, #FFE49A)'
                : 'linear-gradient(135deg, #B91C1C, #DC2626)',
              color: r.michelin === 'Bib' ? '#7A5800' : 'white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            }}>
            {r.michelin === 'Bib' ? 'BIB GOURMAND' : `MICHELIN ${r.michelin}`}
          </span>
        )}
        {/* Bottom-left: tag emoji + price tier */}
        <div className="absolute left-3 bottom-2.5 flex items-center gap-2">
          <span className="text-[20px]" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>
            {tagEmoji[tag] ?? '🍽'}
          </span>
          <span className="text-white font-bold tabular-nums" style={{ fontSize: 11, letterSpacing: '0.08em', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            {r.price_tier}
          </span>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3.5">
        {/* Name + cuisine·area */}
        <p className="font-serif font-black truncate" style={{ fontSize: 17, color: '#1a1a1a', letterSpacing: '-0.005em' }}>
          {r.name}
        </p>
        <p className="mt-0.5" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.55)' }}>
          {r.cuisine} <span style={{ color: 'rgba(0,0,0,0.25)' }}>·</span> {r.area}
        </p>

        {/* Signature dish */}
        <p className="mt-2 font-serif italic" style={{ fontSize: 12.5, color: '#FF5A1F' }}>
          招牌：{r.signature}
        </p>

        {/* Why-this-place reason (gap-driven) */}
        <p className="mt-1.5 leading-relaxed" style={{ fontSize: 12.5, color: 'rgba(0,0,0,0.6)' }}>
          {reason} <span className="text-secondary/60" style={{ fontWeight: 500 }}>{r.blurb}</span>
        </p>

        {/* Footer — 预订 CTA */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'rgba(0,0,0,0.32)', letterSpacing: '0.04em' }}>
            {copied ? '電話已複製 ✓' : (r.phone ?? '查 OpenRice')}
          </span>
          <button
            onClick={handleBook}
            className="px-4 py-1.5 rounded-full font-bold transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
              color: 'white', fontSize: 12.5, letterSpacing: '0.04em',
              boxShadow: '0 4px 12px rgba(255,90,31,0.28)',
            }}>
            預訂 →
          </button>
        </div>
      </div>
    </div>
  );
}
