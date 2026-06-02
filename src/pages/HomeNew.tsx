/**
 * HomeNew — 图1 首页 (Warm Hearth 大改版, 老板 5/31 "重新做一个新页, 不改旧页")
 *
 * 全新独立页, 挂 /home-v2。旧 Home.tsx 原封不动, 老板最后对比挑用哪个。
 * 参考旧 Home 视觉 + 复用现成引擎 (useWeeklyMenu 出菜 / DailyNutritionStrip 营养 /
 *   Gemini Vision 拍冰箱 / chefAddToToday 加菜), 但页面本身全新写, 不动旧页一行。
 *
 * 结构 (图1 信息密集):
 *   ① 节气 + 天气 + 一句今日饮食建议
 *   ② 今天 / 明天 segmented 切换
 *   ③ 📷拍冰箱 / 📝报菜名 并排大入口卡
 *   ④ 今日推荐 3 菜 (可做绿标 + 一句理由)
 *   ⑤ 今日营养构成卡 (复用 DailyNutritionStrip)
 *
 * 只读不改算法, 不 bump ALGO_VERSION。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getUserId } from '../lib/userId';
import { getDishTitle } from '../lib/dishTitleI18n';
import {
  useWeeklyMenu, todayDayIndex, isWeekend,
} from '../hooks/useWeeklyMenu';
import DailyNutritionStrip from '../components/DailyNutritionStrip';
import type { DayMeals } from '../lib/dailyNutrition';
import { addDishToTodayMenu } from '../lib/chefAddToToday';
import {
  analyzeFridgePhoto, fileToBase64,
  type ScanScene, type ScanLocale,
} from '../lib/geminiVision';
import {
  suggestDishesFromScan, normalizeIngredients,
  type MatchedDish,
} from '../lib/scanMatch';
import { loadCuisineMode } from '../lib/cuisineFilter';
import {
  Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudRainWind, CloudLightning,
} from 'lucide-react';

// ── Warm Hearth tokens (跟 app @theme 同族) ──────────────────────────────────
const CREAM = '#FCFBF8';
const BRAND = '#FF5A1F';
const GREEN = '#4CAF50';
const INK = '#1A1A1A';
const SUB = '#666666';
const ALT = '#F2F2ED';

// ── 节气 (24) — 自包含, 不依赖旧 Home ────────────────────────────────────────
const SOLAR_TERMS: { name: string; month: number; day: number; tip: string; icon: string }[] = [
  { name: '小寒', month: 1, day: 5, tip: '最寒时节，温补御寒', icon: '❄️' },
  { name: '大寒', month: 1, day: 20, tip: '数九严寒，温热汤粥固阳', icon: '🌨️' },
  { name: '立春', month: 2, day: 3, tip: '春日升发，少辛多酸护肝', icon: '🌱' },
  { name: '雨水', month: 2, day: 18, tip: '春雨润物，健脾祛湿', icon: '🌧️' },
  { name: '惊蛰', month: 3, day: 5, tip: '阳气渐盛，清肝养胃', icon: '🌿' },
  { name: '春分', month: 3, day: 20, tip: '阴阳平衡，清淡多蒸煮', icon: '☀️' },
  { name: '清明', month: 4, day: 4, tip: '春末湿重，祛湿健脾', icon: '🌷' },
  { name: '谷雨', month: 4, day: 20, tip: '湿气最盛，祛湿养胃', icon: '🌦️' },
  { name: '立夏', month: 5, day: 5, tip: '夏热渐起，清淡为主', icon: '☀️' },
  { name: '小满', month: 5, day: 21, tip: '湿热上升，清热祛湿', icon: '🌤️' },
  { name: '芒种', month: 6, day: 6, tip: '暑热渐盛，消暑去火', icon: '🔥' },
  { name: '夏至', month: 6, day: 21, tip: '一年最热，清热养心', icon: '🌞' },
  { name: '小暑', month: 7, day: 7, tip: '三伏将至，清热祛湿', icon: '🌡️' },
  { name: '大暑', month: 7, day: 22, tip: '三伏最热，养阴补气', icon: '🥵' },
  { name: '立秋', month: 8, day: 7, tip: '秋燥初至，润肺养阴', icon: '🍂' },
  { name: '处暑', month: 8, day: 23, tip: '暑气消退，滋阴润燥', icon: '🌬️' },
  { name: '白露', month: 9, day: 7, tip: '秋凉渐起，养肺防燥', icon: '🌾' },
  { name: '秋分', month: 9, day: 23, tip: '阴阳平分，滋阴补肺', icon: '🍁' },
  { name: '寒露', month: 10, day: 8, tip: '秋末寒意，补肾养阴', icon: '🌰' },
  { name: '霜降', month: 10, day: 23, tip: '初寒霜降，补脾益胃', icon: '🌫️' },
  { name: '立冬', month: 11, day: 7, tip: '冬补开始，温阳补肾', icon: '🍲' },
  { name: '小雪', month: 11, day: 22, tip: '天气转冷，益气补血', icon: '❄️' },
  { name: '大雪', month: 12, day: 7, tip: '数九进补，温阳散寒', icon: '🌨️' },
  { name: '冬至', month: 12, day: 22, tip: '一年最寒，进补最佳', icon: '🥟' },
];
function getCurrentSolarTerm(): typeof SOLAR_TERMS[0] {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  let current = SOLAR_TERMS[SOLAR_TERMS.length - 1];
  for (let i = SOLAR_TERMS.length - 1; i >= 0; i--) {
    const st = SOLAR_TERMS[i];
    if (st.month < month || (st.month === month && st.day <= day)) { current = st; break; }
  }
  return current;
}

// ── 天气 (open-meteo, 跟旧 Home 同源 HK 坐标) ────────────────────────────────
const WEATHER_LABEL: Record<number, string> = {
  0: '晴朗', 1: '晴转多云', 2: '多云', 3: '阴天', 45: '有雾', 48: '有雾',
  51: '毛毛雨', 53: '小雨', 55: '中雨', 61: '小雨', 63: '中雨', 65: '大雨',
  80: '阵雨', 81: '阵雨', 82: '暴雨', 95: '雷雨', 96: '雷暴', 99: '暴风雨',
};
const WEATHER_ICON: Record<number, React.ComponentType<{ size?: number; className?: string }>> = {
  0: Sun, 1: CloudSun, 2: Cloud, 3: Cloud, 45: CloudFog, 48: CloudFog,
  51: CloudRain, 53: CloudRain, 55: CloudRain, 61: CloudRain, 63: CloudRain, 65: CloudRain,
  80: CloudRainWind, 81: CloudRainWind, 82: CloudRainWind,
  95: CloudLightning, 96: CloudLightning, 99: CloudLightning,
};
function WeatherIcon({ code, size = 14 }: { code: number; size?: number }) {
  const Icon = WEATHER_ICON[code] ?? Cloud;
  return <Icon size={size} className="inline-block align-[-2px]" />;
}
function weatherTip(temp: number, humidity: number, code: number): string {
  if (code >= 80) return '雨天湿冷，暖胃为主';
  if (code >= 51) return '细雨绵绵，驱湿暖身';
  if (humidity >= 80) return '湿度高，宜祛湿健脾';
  if (humidity >= 65) return '湿气较重，清淡少油';
  if (temp >= 32) return '高温酷热，消暑清热';
  if (temp >= 28) return '天气炎热，宜清淡少炸';
  if (temp <= 12) return '天寒，温补为主';
  if (temp <= 18) return '天气凉爽，可适当温补';
  return '';
}
interface WeatherInfo { temp: number; humidity: number; code: number; label: string }

function useWeather(): WeatherInfo | null {
  const [w, setW] = useState<WeatherInfo | null>(null);
  useEffect(() => {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=22.32&longitude=114.17&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FHong_Kong';
    fetch(url).then(r => r.json()).then(data => {
      const cur = data?.current;
      if (!cur) return;
      setW({
        temp: Math.round(cur.temperature_2m ?? 25),
        humidity: Math.round(cur.relative_humidity_2m ?? 70),
        code: cur.weather_code ?? 0,
        label: WEATHER_LABEL[cur.weather_code] ?? '晴朗',
      });
    }).catch(() => {/* non-critical */});
  }, []);
  return w;
}

// 一句"为什么推这道"——从菜的真实字段轻量拼, 不命中就空。
const COOK_METHOD_LABEL: Record<string, string> = {
  stir_fry: '快手小炒', steam: '少油清蒸', boil: '清煮', stew: '慢炖暖身',
  pan_fry: '香煎', braise: '焖入味', blanch: '白灼清爽', mix_cold: '凉拌开胃',
};
function dishReason(d: any, solarTip: string): string {
  if (d?.course_type === 'fruit') return '餐后时令水果';
  const cm = d?.cook_method && COOK_METHOD_LABEL[d.cook_method];
  if (d?.oil_level === 'low' && cm) return `${cm} · 少油`;
  if (cm) return cm;
  if (d?.is_low_sodium) return '低盐清淡';
  if (solarTip) return solarTip;
  return '今日推荐';
}

export default function HomeNew() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language !== 'en';
  const t = (z: string, e: string) => (zh ? z : e);

  const solarTerm = getCurrentSolarTerm();
  const weather = useWeather();
  const adviceTip = (weather && weatherTip(weather.temp, weather.humidity, weather.code)) || solarTerm.tip;

  // 今天 / 明天 切换。明天 = 当周下一天 (周末走 weekOffset=1 同旧逻辑)。
  const [tab, setTab] = useState<'today' | 'tomorrow'>('today');
  const { weeklyMenu, loading } = useWeeklyMenu(isWeekend() ? 1 : 0);

  const todayIdx = todayDayIndex();
  const dayIdx = tab === 'today' ? todayIdx : Math.min(todayIdx + 1, 6);
  const day = weeklyMenu?.days?.[dayIdx];

  // slots[] 优先, 缺失 fallback 旧字段 (跟旧 Home 同口径)。
  const lunchDishes = useMemo(() => {
    const fromSlots = day?.slots
      ?.filter(s => s.slotType === 'lunch_main' || s.slotType === 'lunch_side')
      .map(s => s.primary.dish);
    return (fromSlots && fromSlots.length > 0) ? fromSlots : (day?.lunchDishes ?? []);
  }, [day]);
  const dinnerDishes = useMemo(() => {
    const fromSlots = day?.slots
      ?.filter(s => s.slotType === 'dinner_main' || s.slotType === 'dinner_side' || s.slotType === 'dinner_kid')
      .map(s => s.primary.dish);
    return (fromSlots && fromSlots.length > 0) ? fromSlots : (day?.dishes ?? []);
  }, [day]);
  const breakfastDishes = useMemo(() => {
    const fromSlots = day?.slots
      ?.filter(s => s.slotType === 'breakfast')
      .map(s => s.primary.dish);
    return (fromSlots && fromSlots.length > 0) ? fromSlots : (day?.breakfastDishes ?? []);
  }, [day]);
  const fruitDish = useMemo(() => {
    return day?.slots?.find(s => s.slotType === 'fruit')?.primary?.dish ?? day?.fruitDish;
  }, [day]);

  // 今日推荐 3 菜 = 晚餐主菜优先 (没有再退午餐)。
  const recommend3 = useMemo(() => {
    const pool = dinnerDishes.length > 0 ? dinnerDishes : lunchDishes;
    return pool.slice(0, 3);
  }, [dinnerDishes, lunchDishes]);

  // 营养卡用当天三餐 (跟旧 Home meals 拼法一致)。
  const meals: DayMeals = useMemo(() => {
    const dinnerArr = fruitDish ? [...dinnerDishes, fruitDish] : dinnerDishes;
    return {
      早餐: breakfastDishes,
      午餐: fruitDish ? [...lunchDishes, fruitDish] : lunchDishes,
      晚餐: dinnerArr,
    } as DayMeals;
  }, [breakfastDishes, lunchDishes, dinnerDishes, fruitDish]);

  const hasRec = recommend3.length > 0;

  // ── 拍冰箱 (复用 Gemini Vision + scanMatch, 跟旧 Home 同接口) ───────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanDishes, setScanDishes] = useState<MatchedDish[]>([]);
  const [scanIngredients, setScanIngredients] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanAddingId, setScanAddingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function handleScan(file: File) {
    setScanLoading(true);
    setScanError(null);
    setScanDishes([]);
    setScanIngredients([]);
    setScanPreview(URL.createObjectURL(file));
    setScanOpen(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const scene: ScanScene = 'fridge';
      const locale: ScanLocale = zh ? 'zh' : 'zh';
      const result = await analyzeFridgePhoto(base64, mimeType, scene, locale);
      setScanIngredients(result.detected_ingredients);
      const normalized = normalizeIngredients(result.detected_ingredients);
      const matches = await suggestDishesFromScan({
        ingredients: normalized,
        cuisineMode: loadCuisineMode(),
        scene,
        limit: 6,
      });
      setScanDishes(matches);
    } catch {
      setScanError(t('识别失败，请重试', 'Scan failed, retry'));
    } finally {
      setScanLoading(false);
    }
  }

  async function addScanDish(dishId: string) {
    if (scanAddingId) return;
    setScanAddingId(dishId);
    try {
      const r = await addDishToTodayMenu(dishId);
      setToast(r.alreadyPresent
        ? t('已在今天菜单里', 'Already in today')
        : t('已加入今天', 'Added to today'));
      setTimeout(() => setToast(null), 1400);
    } catch {
      setToast(t('加入失败', 'Failed'));
      setTimeout(() => setToast(null), 1400);
    } finally {
      setScanAddingId(null);
    }
  }

  function closeScan() {
    setScanOpen(false);
    setScanDishes([]);
    setScanIngredients([]);
    setScanPreview(null);
    setScanError(null);
  }

  return (
    <div className="min-h-screen max-w-md mx-auto" style={{ background: CREAM, color: INK, paddingBottom: 40 }}>
      {/* ── ① 节气 + 天气 + 饮食建议 ─────────────────────────── */}
      <header className="px-5 pt-6 pb-2">
        <p style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: SUB, fontWeight: 600 }}>
          {new Date().toLocaleDateString('zh-HK', { month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <h1 className="font-black mt-1" style={{ fontSize: 28, lineHeight: 1.1 }}>
          {t('今天吃什么', "What's for today")}
        </h1>
        <p className="mt-2 flex items-center gap-2 flex-wrap" style={{ fontSize: 12.5, color: SUB }}>
          <span className="font-bold" style={{ color: BRAND }}>{solarTerm.icon} {solarTerm.name}</span>
          {weather && (
            <>
              <span style={{ color: 'rgba(0,0,0,0.18)' }}>·</span>
              <span className="inline-flex items-center gap-1">
                {weather.temp}°C <WeatherIcon code={weather.code} size={14} /> {weather.label}
              </span>
            </>
          )}
        </p>
        {adviceTip && (
          <div className="mt-3 rounded-2xl px-3.5 py-2.5 flex items-start gap-2"
            style={{ background: 'linear-gradient(135deg, rgba(255,90,31,0.08), rgba(255,179,71,0.14))', border: '1px solid rgba(255,90,31,0.16)' }}>
            <span style={{ fontSize: 16, lineHeight: 1.2 }}>🍵</span>
            <p style={{ fontSize: 13, color: '#7a4a1f', lineHeight: 1.5 }}>
              {t('今日饮食建议', "Today's tip")}：{adviceTip}
            </p>
          </div>
        )}
      </header>

      {/* ── ② 今天 / 明天 ─────────────────────────────────────── */}
      <div className="px-5 pt-2">
        <div className="inline-flex p-1 rounded-2xl gap-0.5 w-full" style={{ background: 'rgba(0,0,0,0.05)' }}>
          {(['today', 'tomorrow'] as const).map(k => {
            const on = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                className="flex-1 py-2 rounded-xl font-bold transition-all active:scale-95"
                style={{
                  fontSize: 13.5,
                  background: on ? '#FFFFFF' : 'transparent',
                  color: on ? INK : SUB,
                  boxShadow: on ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                }}>
                {k === 'today' ? t('今天', 'Today') : t('明天', 'Tomorrow')}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ③ 拍冰箱 / 报菜名 并排入口 ──────────────────────────── */}
      <div className="px-5 pt-4 grid grid-cols-2 gap-3">
        <button onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-4 flex flex-col items-start active:scale-[0.98] transition-transform text-left"
          style={{ background: '#FFFFFF', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
          <span className="flex items-center justify-center rounded-full mb-2" style={{ width: 44, height: 44, background: 'rgba(255,90,31,0.10)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: BRAND }}>photo_camera</span>
          </span>
          <p className="font-bold" style={{ fontSize: 15 }}>{t('拍冰箱', 'Scan fridge')}</p>
          <p style={{ fontSize: 11.5, color: SUB, marginTop: 2 }}>{t('用现有食材出菜', 'Cook what you have')}</p>
        </button>
        <button onClick={() => navigate('/chef')}
          className="rounded-2xl p-4 flex flex-col items-start active:scale-[0.98] transition-transform text-left"
          style={{ background: '#FFFFFF', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
          <span className="flex items-center justify-center rounded-full mb-2" style={{ width: 44, height: 44, background: 'rgba(76,175,80,0.12)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: GREEN }}>edit_note</span>
          </span>
          <p className="font-bold" style={{ fontSize: 15 }}>{t('报菜名', 'Pick dishes')}</p>
          <p style={{ fontSize: 11.5, color: SUB, marginTop: 2 }}>{t('想吃啥直接说', 'Just tell us')}</p>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleScan(f); e.currentTarget.value = ''; }} />

      {/* ── ④ 今日推荐 3 菜 ──────────────────────────────────── */}
      <section className="px-5 pt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold" style={{ fontSize: 18 }}>
            {tab === 'today' ? t('今日推荐', 'Today picks') : t('明日推荐', 'Tomorrow picks')}
          </h2>
          <button onClick={() => navigate('/today')}
            className="flex items-center gap-0.5 font-bold active:scale-95" style={{ fontSize: 13, color: BRAND }}>
            {t('看全部', 'See all')}
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl" style={{ height: 88, background: ALT, opacity: 0.6 }} />)}
          </div>
        ) : hasRec ? (
          <div className="space-y-3">
            {recommend3.map((d: any, i: number) => (
              <button key={d?.id ?? i} onClick={() => navigate('/today')}
                className="w-full flex items-stretch gap-3.5 rounded-2xl p-3 active:scale-[0.99] transition-transform text-left"
                style={{ background: '#FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div className="rounded-xl bg-cover bg-center shrink-0"
                  style={{ width: 76, height: 76, background: ALT, backgroundImage: d?.image_url ? `url("${d.image_url}")` : undefined }} />
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <p className="font-bold truncate" style={{ fontSize: 15.5 }}>{getDishTitle(d, language) || d?.title_zh}</p>
                  <p className="truncate" style={{ fontSize: 12.5, color: SUB, marginTop: 2 }}>{dishReason(d, solarTerm.tip)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {d?.steps_verified && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(76,175,80,0.12)', color: GREEN, fontSize: 11.5, fontWeight: 500 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
                        {t('可做', 'Ready')}
                      </span>
                    )}
                    {typeof d?.cook_time_min === 'number' && d.cook_time_min > 0 && (
                      <span style={{ fontSize: 11.5, color: SUB }}>⏱ {d.cook_time_min}min</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-10 rounded-2xl" style={{ background: '#FFFFFF' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#CFCFC8' }}>restaurant_menu</span>
            <p className="font-bold mt-3" style={{ fontSize: 15 }}>
              {tab === 'today' ? t('今天还没排菜', 'No menu today') : t('明天还没排菜', 'No menu tomorrow')}
            </p>
            <p style={{ fontSize: 12.5, color: SUB, marginTop: 4 }}>{t('拍冰箱或报菜名挑几道', 'Scan or pick dishes')}</p>
          </div>
        )}
      </section>

      {/* ── ⑤ 今日营养构成 (复用 DailyNutritionStrip) ───────────── */}
      {hasRec && (
        <section className="px-5 pt-6">
          <h2 className="font-bold mb-3" style={{ fontSize: 18 }}>{t('今日营养构成', "Today's nutrition")}</h2>
          <DailyNutritionStrip meals={meals} />
        </section>
      )}

      {/* ── 拍冰箱结果弹窗 ───────────────────────────────────── */}
      {scanOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={closeScan}>
          <div className="w-full max-w-md rounded-t-3xl max-h-[85vh] overflow-y-auto" style={{ background: CREAM }}
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between px-5 py-3" style={{ background: CREAM, borderBottom: '1px solid #E5E5E0' }}>
              <h3 className="font-bold" style={{ fontSize: 17 }}>{t('冰箱里能做这些', 'You can cook')}</h3>
              <button onClick={closeScan} className="rounded-full flex items-center justify-center active:scale-95"
                style={{ width: 32, height: 32, background: ALT }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <div className="px-5 py-4">
              {scanPreview && (
                <div className="rounded-xl bg-cover bg-center mb-3" style={{ height: 120, backgroundImage: `url("${scanPreview}")` }} />
              )}
              {scanLoading ? (
                <div className="flex flex-col items-center py-8">
                  <span className="inline-block w-7 h-7 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: BRAND }} />
                  <p className="mt-3" style={{ fontSize: 13, color: SUB }}>{t('识别中…', 'Scanning…')}</p>
                </div>
              ) : scanError ? (
                <p className="text-center py-8" style={{ fontSize: 14, color: '#DC2626' }}>{scanError}</p>
              ) : (
                <>
                  {scanIngredients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {scanIngredients.slice(0, 12).map((ing, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full" style={{ background: ALT, fontSize: 11.5, color: SUB }}>{ing}</span>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2.5">
                    {scanDishes.map(d => (
                      <div key={d.id} className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: '#FFFFFF' }}>
                        <div className="rounded-lg bg-cover bg-center shrink-0"
                          style={{ width: 56, height: 56, background: ALT, backgroundImage: d.image_url ? `url("${d.image_url}")` : undefined }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate" style={{ fontSize: 14.5 }}>{getDishTitle(d as any, language) || d.title_zh}</p>
                          <p className="truncate" style={{ fontSize: 11.5, color: SUB }}>
                            {d.matched_count > 0 ? t(`用到 ${d.matched_count} 样你的食材`, `uses ${d.matched_count}`) : (d.description_zh ?? '')}
                          </p>
                        </div>
                        <button onClick={() => addScanDish(d.id)} disabled={scanAddingId === d.id}
                          className="px-3 py-1.5 rounded-full font-bold text-white shrink-0 active:scale-95 disabled:opacity-60"
                          style={{ background: BRAND, fontSize: 12.5 }}>
                          {scanAddingId === d.id ? '…' : t('加今天', 'Add')}
                        </button>
                      </div>
                    ))}
                    {scanDishes.length === 0 && (
                      <p className="text-center py-6" style={{ fontSize: 13, color: SUB }}>{t('没匹配到，换张照片试试', 'No match, try another photo')}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full text-white font-bold"
          style={{ bottom: 80, background: 'rgba(0,0,0,0.82)', fontSize: 13 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
