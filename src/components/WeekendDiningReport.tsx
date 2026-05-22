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
import { summarizeWeek, buildDiningSuggestions, FOOD_GROUPS_ORDER, type WeeklySummary, type DiningSuggestion, type FoodGroup } from '../lib/weeklyDiarySummary';
import { RestaurantCard } from './RestaurantCard';
import { useLanguage } from '../contexts/LanguageContext';

// 10 类食材组 — 用户视角轮值（鱼/红肉/白肉/蛋/蔬菜/豆/菌/奶/主食/水果），
// 灰色 chip = 这周没沾，绿色 = 上桌过。
const FOOD_GROUP_META: Record<FoodGroup, { emoji: string }> = {
  fish:     { emoji: '🐟' },
  meat:     { emoji: '🥩' },
  poultry:  { emoji: '🍗' },
  egg:      { emoji: '🥚' },
  veggie:   { emoji: '🥬' },
  soy:      { emoji: '🌱' },
  mushroom: { emoji: '🍄' },
  dairy:    { emoji: '🥛' },
  grain:    { emoji: '🌾' },
  fruit:    { emoji: '🍎' },
};
// UI 025 §C i18n — food-group labels per language (was hardcoded zh in META).
function foodGroupLabel(g: FoodGroup, t: (en: string, zh: string) => string): string {
  switch (g) {
    case 'fish':     return t('Fish',     '鱼');
    case 'meat':     return t('Red meat', '红肉');
    case 'poultry':  return t('Poultry',  '白肉');
    case 'egg':      return t('Egg',      '蛋');
    case 'veggie':   return t('Veggies',  '蔬菜');
    case 'soy':      return t('Soy',      '豆');
    case 'mushroom': return t('Mushroom', '菌');
    case 'dairy':    return t('Dairy',    '奶');
    case 'grain':    return t('Grain',    '主食');
    case 'fruit':    return t('Fruit',    '水果');
  }
}

export default function WeekendDiningReport() {
  const { t } = useLanguage();
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
      {/* Hero header — 暖光餐厅内景，纯氛围图，无任何政治 / 国旗元素
          (用户 2026-05-17 明确禁止)。后续可以换海边餐厅的图，但任何
          带国家符号 / 政治画面的都不允许。*/}
      <section
        className="rounded-3xl pt-5 pb-6 relative overflow-hidden"
        style={{ minHeight: 180 }}>
        {/* Background photo — restaurant interior, warm pendant lights. */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=85&auto=format&fit=crop"
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center 45%' }}
            onError={e => {
              // Fallback to a different restaurant-interior photo if the
              // primary URL fails; both are well-known Unsplash assets.
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=85&auto=format&fit=crop';
            }}
          />
          {/* Warm gradient overlay so the cream text reads against any photo */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(160deg, rgba(40,25,15,0.55) 0%, rgba(60,35,20,0.30) 50%, rgba(255,140,60,0.20) 100%)',
          }} />
        </div>
        <div className="relative z-10 px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/90"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            {t('Weekend', '周末好 · Weekend')}
          </p>
          <h2 className="font-serif font-black mt-1 text-white"
            style={{ fontSize: 26, lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}>
            {t('Eat out for a change', '出门换换口味吧')}
          </h2>
          <p className="font-serif italic mt-2 text-white/85"
            style={{ fontSize: 13, lineHeight: 1.5, textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
            {t(
              'You cooked at home Mon-Fri — put the spatula down today. Here\'s what you ate this week, and a few restaurant picks.',
              '周一到周五在家好好做了几顿，今天放下锅铲。我把本周吃过的整理给您，再挑几家好馆子。',
            )}
          </p>
        </div>
      </section>

      {loading ? (
        <div className="rounded-3xl bg-white px-5 py-10 text-center"
          style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <p className="text-[13px]" style={{ color: 'rgba(0,0,0,0.4)' }}>{t('Reading your week…', '正在整理本周饭桌…')}</p>
        </div>
      ) : (
        <>
          {/* "本周饭桌" only renders when there IS something to summarize.
              When the user opens 周日 on a fresh device with no cached
              weekly menu, we skip this block and go straight to restaurant
              suggestions — buildDiningSuggestions has a fallback path that
              always returns 10 picks (5 HK + 5 SZ) so the user never lands
              on an empty page. */}
          {summary && summary.totalDishes > 0 && (<>
          {/* 本周饭桌 — 10 类食材轮值 grid + 一句话提示。
              用户 2026-05-17：分类好（鱼/红肉/白肉/蛋/蔬菜/豆/菌/奶/主食/水果），
              灰色 chip = 缺，色彩 chip = 上桌过；文字描述跟 grid 放一起。*/}
          <section className="rounded-3xl bg-white px-5 py-5"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] font-bold text-secondary/60 uppercase tracking-wider">{t('Your table this week', '本周饭桌')}</p>
              <p className="text-[10px] font-bold" style={{ color: 'rgba(0,0,0,0.40)', letterSpacing: '0.04em' }}>
                {summary.groupsCovered.size} / {FOOD_GROUPS_ORDER.length} {t('groups', '类')}
              </p>
            </div>

            {/* 10-chip grid — 灰色就是这周缺的 */}
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {FOOD_GROUPS_ORDER.map(g => {
                const hit = summary.groupsCovered.has(g);
                const meta = FOOD_GROUP_META[g];
                return (
                  <div key={g}
                    className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl"
                    style={{
                      background: hit ? 'rgba(37, 211, 102, 0.10)' : 'rgba(0,0,0,0.04)',
                      border: hit ? '1px solid rgba(37, 211, 102, 0.22)' : '1px solid rgba(0,0,0,0.06)',
                    }}>
                    <span style={{ fontSize: 22, opacity: hit ? 1 : 0.30, filter: hit ? 'none' : 'grayscale(1)' }}>
                      {meta.emoji}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: hit ? '#1e8449' : 'rgba(0,0,0,0.35)',
                    }}>
                      {foodGroupLabel(g, t)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 一句话 caption + 数据 */}
            <p className="font-serif text-[13px] leading-relaxed mb-3" style={{ color: '#1a1a1a' }}>
              {summary.groupsMissing.length === 0
                ? t(
                    'Your table this week is balanced — pick any restaurant today.',
                    '本周饭桌挺均衡，今天随心挑家馆子。',
                  )
                : t(
                    `Missing ${summary.groupsMissing.map(g => foodGroupLabel(g, t)).join(', ')} this week — eating out today can fill the gap.`,
                    `这周缺 ${summary.groupsMissing.map(g => foodGroupLabel(g, t)).join('、')}，今天出门吃可以补一下。`,
                  )}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-black/5">
              <Stat value={summary.totalDishes} label={t('dishes', '道菜')} />
              <Stat value={summary.distinctFoods} label={t('foods', '种食材')} />
            </div>
          </section>
          </>)}

          {/* 外食建议 — real HK restaurants tied to this week's gaps.
              Each card: restaurant name + cuisine pill + area + 招牌菜 + the
              gap-reason that surfaced it + 预订 CTA. The 预订 button is a
              stub right now — opens OpenRice / homepage, copies the phone,
              or just shows 即將上線. Future: real booking integration with
              revenue share. */}
          {/* 香港 + 深圳 分组 — buildDiningSuggestions 保证前 5 = 港、
              后 5 = 深，省得在 render 里再次过滤。两组用 section header
              分开，10 张卡片一眼看穿是「先看香港有什么、再看深圳有什么」。 */}
          {(() => {
            const hk = suggestions.filter(s => s.restaurant.city === 'HK');
            const sz = suggestions.filter(s => s.restaurant.city === 'SZ');
            const today = new Date().getDay() === 0 ? t('Sunday', '周日') : t('Saturday', '周六');
            return (
              <>
                {hk.length > 0 && (
                  <section className="rounded-3xl bg-white px-5 py-5"
                    style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <div className="flex items-baseline justify-between mb-3">
                      <p className="font-serif font-black" style={{ fontSize: 17, color: '#1a1a1a', letterSpacing: '-0.005em' }}>
                        {t('Hong Kong', '香港')} <span className="font-sans" style={{ fontSize: 12, color: '#FF5A1F', fontWeight: 700, marginLeft: 4 }}>{today}{t(` · ${hk.length} picks`, `${hk.length}选`)}</span>
                      </p>
                      <p className="text-[10px] font-bold" style={{ color: 'rgba(0,0,0,0.4)', letterSpacing: '0.06em' }}>
                        {t('Michelin / Bib / classics', '米其林 / 必比登 / 老字号')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {hk.map((s, i) => (
                        <RestaurantCard key={s.restaurant.id + i} suggestion={s} />
                      ))}
                    </div>
                  </section>
                )}

                {sz.length > 0 && (
                  <section className="rounded-3xl bg-white px-5 py-5"
                    style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <div className="flex items-baseline justify-between mb-3">
                      <p className="font-serif font-black" style={{ fontSize: 17, color: '#1a1a1a', letterSpacing: '-0.005em' }}>
                        {t('Shenzhen', '深圳')} <span className="font-sans" style={{ fontSize: 12, color: '#1b7e3f', fontWeight: 700, marginLeft: 4 }}>{today}{t(` · ${sz.length} picks`, `${sz.length}选`)}</span>
                      </p>
                      <p className="text-[10px] font-bold" style={{ color: 'rgba(0,0,0,0.4)', letterSpacing: '0.06em' }}>
                        {t('Michelin / line-up / classics', '米其林 / 排队店 / 老字号')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {sz.map((s, i) => (
                        <RestaurantCard key={s.restaurant.id + i} suggestion={s} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            );
          })()}

          {/* Soft footer */}
          <p className="text-center font-serif italic px-6 pt-1"
            style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', lineHeight: 1.6 }}>
            {t('See you Monday — your menu will be ready.', '周一回来，我又给您备好菜单。')}
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

// RestaurantCard extracted to ./RestaurantCard.tsx — the compact version
// with tap-to-detail modal + 3 booking channels (WhatsApp / OpenRice / tel).
