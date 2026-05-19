/**
 * Home — Employer dashboard
 * States: Day 1 (no menu) vs Week 1+ (with health metrics)
 * Sections: Health Dashboard → Procurement → Helper Status → Today's Menu
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRecommendDishes, fetchSwapOptions, type SupabaseDish } from "../hooks/useSupabaseMenu";
import { useWeeklyMenu, isWeekend, todayDayIndex } from "../hooks/useWeeklyMenu";
import { isNewUserSession, isWithinTrial } from "../lib/userLifecycle";
import WeekendDiningReport from "../components/WeekendDiningReport";
import NextWeekMenuPreview from "../components/NextWeekMenuPreview";
import {
  analyzeFridgePhoto, fileToBase64,
  type ScanScene, type ScanLocale,
} from "../lib/geminiVision";
import {
  suggestDishesFromScan, normalizeIngredients,
  type MatchedDish,
} from "../lib/scanMatch";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";
import { useSubscription } from "../lib/subscription";
import { recordBatchSwap, recordSwap } from "../lib/swapFeedback";
import { useLanguage, LANGUAGE_LABEL, type Language } from "../contexts/LanguageContext";
import IntentRegenModal from "../components/IntentRegenModal";
import { loadIntentBias } from "../lib/intentBias";
import { getUserId } from "../lib/userId";
import { loadCuisineMode, type CuisineMode } from "../lib/cuisineFilter";
import { loadFamilyMembers } from "../lib/familyPrefs";
import { HeartButton } from "../components/HeartButton";
import DailyNutritionStrip from "../components/DailyNutritionStrip";
import { toggleEaten, getEatenToday } from "../lib/eatingDiary";
import { pickBreakfastCombo } from "../lib/breakfastCombos";
import { DISH_FIELDS } from "../lib/dishFields";

// ── Solar term (节气) calculator ─────────────────────────────────────────────

const SOLAR_TERMS: { name: string; month: number; day: number; tip: string; icon: string }[] = [
  { name: '小寒', month: 1,  day: 5,  tip: '最寒时节，温补御寒，羊肉萝卜汤暖胃驱寒', icon: '❄️' },
  { name: '大寒', month: 1,  day: 20, tip: '数九严寒，多食牛羊，温热汤粥固护阳气', icon: '🌨️' },
  { name: '立春', month: 2,  day: 3,  tip: '春日升发，多食韭菜葱蒜，少辛多酸护肝', icon: '🌱' },
  { name: '雨水', month: 2,  day: 18, tip: '春雨润物，健脾祛湿，薏米山药莲子粥', icon: '🌧️' },
  { name: '惊蛰', month: 3,  day: 5,  tip: '阳气渐盛，多食绿叶蔬菜，清肝养胃', icon: '🌿' },
  { name: '春分', month: 3,  day: 20, tip: '阴阳平衡，饮食宜清淡，少油少炸多蒸煮', icon: '☀️' },
  { name: '清明', month: 4,  day: 4,  tip: '春末湿气重，祛湿健脾，红豆薏米汤为佳', icon: '🌷' },
  { name: '谷雨', month: 4,  day: 20, tip: '湿气最盛，祛湿养胃，冬瓜扁豆汤去湿', icon: '🌦️' },
  { name: '立夏', month: 5,  day: 5,  tip: '夏热渐起，清淡为主，少炸多蒸，勿贪生冷', icon: '☀️' },
  { name: '小满', month: 5,  day: 21, tip: '湿热上升，清热祛湿，绿豆冬瓜苦瓜好时节', icon: '🌤️' },
  { name: '芒种', month: 6,  day: 6,  tip: '暑热渐盛，消暑去火，苦瓜绿豆汤消热', icon: '🔥' },
  { name: '夏至', month: 6,  day: 21, tip: '一年最热，清热养心，西瓜莲藕荷叶茶', icon: '🌞' },
  { name: '小暑', month: 7,  day: 7,  tip: '三伏将至，清热祛湿，薏米冬瓜汤为首选', icon: '🌡️' },
  { name: '大暑', month: 7,  day: 22, tip: '三伏最热，养阴补气，鸭汤绿豆汤消暑', icon: '🥵' },
  { name: '立秋', month: 8,  day: 7,  tip: '秋燥初至，润肺养阴，梨子银耳百合汤', icon: '🍂' },
  { name: '处暑', month: 8,  day: 23, tip: '暑气消退，滋阴润燥，芝麻蜂蜜梨汁养肺', icon: '🌬️' },
  { name: '白露', month: 9,  day: 7,  tip: '秋凉渐起，养肺防燥，白色食物润肺为佳', icon: '🌾' },
  { name: '秋分', month: 9,  day: 23, tip: '阴阳平分，滋阴补肺，山药百合粥养秋', icon: '🍁' },
  { name: '寒露', month: 10, day: 8,  tip: '秋末寒意，补肾养阴，板栗山药温补为宜', icon: '🌰' },
  { name: '霜降', month: 10, day: 23, tip: '初寒霜降，补脾益胃，牛肉萝卜汤暖身', icon: '🌫️' },
  { name: '立冬', month: 11, day: 7,  tip: '冬补开始，温阳补肾，羊肉当归温补汤', icon: '🍲' },
  { name: '小雪', month: 11, day: 22, tip: '天气转冷，益气补血，红枣桂圆暖宫汤', icon: '❄️' },
  { name: '大雪', month: 12, day: 7,  tip: '数九进补，温阳散寒，姜枣羊肉驱寒汤', icon: '🌨️' },
  { name: '冬至', month: 12, day: 22, tip: '一年最寒，进补最佳，饺子汤圆暖意浓', icon: '🥟' },
];

function getCurrentSolarTerm(): typeof SOLAR_TERMS[0] {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  // Find the most recent solar term that has passed
  let current = SOLAR_TERMS[SOLAR_TERMS.length - 1];
  for (let i = SOLAR_TERMS.length - 1; i >= 0; i--) {
    const st = SOLAR_TERMS[i];
    if (st.month < month || (st.month === month && st.day <= day)) {
      current = st;
      break;
    }
  }
  return current;
}

// 12 traditional Chinese 时辰 (each spans 2 modern hours, 子时 23-1)
const CHINESE_HOURS = ['子时','丑时','寅时','卯时','辰时','巳时','午时','未时','申时','酉时','戌时','亥时'];
function getChineseHour(): string {
  const h = new Date().getHours();
  return CHINESE_HOURS[Math.floor(((h + 1) % 24) / 2)];
}

// Estimate cooking minutes for a dish badge. Prefers DB-provided cook_time_min,
// falls back to (prep_steps + cook_steps) × ~3min, hides when nothing known.
function getPrepTimeMin(dish: any): number | null {
  if (typeof dish?.cook_time_min === 'number' && dish.cook_time_min > 0) return dish.cook_time_min;
  const steps = (dish?.prep_steps_json?.length ?? 0) + (dish?.cook_steps_json?.length ?? 0);
  if (steps > 0) return Math.max(5, steps * 3);
  return null;
}

// ── Weather tip overlay (weather code + humidity + temp → dietary nudge) ──────

const WEATHER_CODE_LABEL: Record<number, string> = {
  0: '晴朗', 1: '晴转多云', 2: '多云', 3: '阴天',
  45: '有雾', 48: '有雾',
  51: '毛毛雨', 53: '小雨', 55: '中雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  80: '阵雨', 81: '阵雨', 82: '暴雨',
  95: '雷雨', 96: '雷暴', 99: '暴风雨',
};

function getWeatherAdjustment(temp: number, humidity: number, code: number): string {
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

interface WeatherInfo {
  temp: number;
  humidity: number;
  code: number;
  label: string;
}

function useDailyTip() {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);

  useEffect(() => {
    // Default: Hong Kong coordinates; future: use geolocation
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=22.32&longitude=114.17&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FHong_Kong';
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const cur = data?.current;
        if (!cur) return;
        setWeather({
          temp: Math.round(cur.temperature_2m ?? 25),
          humidity: Math.round(cur.relative_humidity_2m ?? 70),
          code: cur.weather_code ?? 0,
          label: WEATHER_CODE_LABEL[cur.weather_code] ?? '晴朗',
        });
      })
      .catch(() => {/* non-critical */});
  }, []);

  const solarTerm = getCurrentSolarTerm();
  const weatherAdj = weather ? getWeatherAdjustment(weather.temp, weather.humidity, weather.code) : '';
  const tip = weatherAdj || solarTerm.tip;

  return { solarTerm, weather, tip };
}

/**
 * TrialExpiredCard — shown on Home when a non-member's 7-day trial has
 * elapsed (user direction 2026-05-17: "用户可以一直打开，一周后再次
 * 打开就需要付费"). Replaces the daily menu / weekend dining surface
 * with a clear upgrade card. Members and within-trial users never see
 * this; first-session new users are always within trial.
 */
function TrialExpiredCard({ onUnlock }: { onUnlock: () => void }) {
  return (
    <section className="rounded-3xl p-6 text-center"
      style={{
        background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 60%, #FFB347 100%)",
        boxShadow: "0 12px 32px rgba(255,90,31,0.30)",
      }}>
      <div className="text-[44px] mb-2">⭐</div>
      <h2 className="font-serif font-black text-white" style={{ fontSize: 22, lineHeight: 1.3 }}>
        7 天免费试用结束啦
      </h2>
      <p className="mt-3 text-white/90" style={{ fontSize: 13, lineHeight: 1.6 }}>
        感谢您这一周用爱吃。<br />
        续上爱吃 Pro，继续每天给您安排专属菜单 —<br />
        整周菜单 · 一步采购 · 米其林菜单 · 学校营养 · 节气养生。
      </p>
      <button onClick={onUnlock}
        className="mt-5 px-7 h-11 rounded-2xl font-bold flex items-center gap-2 mx-auto active:scale-95 transition-transform"
        style={{ background: "white", color: "#FF5A1F", fontSize: 14, boxShadow: "0 6px 20px rgba(0,0,0,0.15)" }}>
        <span style={{ fontSize: 16 }}>👑</span>
        开通会员，解锁全部
      </button>
      <p className="mt-3 text-white/70" style={{ fontSize: 11 }}>
        早鸟价 HK$30/月，前 3 个月
      </p>
    </section>
  );
}


export default function Home() {
  const navigate = useNavigate();
  // Auth state — use the userId in storage as the single source of truth.
  // Historically we also checked the `isLoggedIn` flag, but multiple write
  // paths (QuickSetup, devTestLogin, WeChatCallback) didn't always set the
  // flag in lockstep with userId, causing the "登录解锁" banner to linger
  // for users who were in fact logged in. userId is the minimum the rest
  // of the app needs to attribute requests — matches RequireAuth.
  const isLoggedIn = !!getUserId();

  // mealTime must be declared before useRecommendDishes
  const [mealTime, setMealTime] = useState<"早餐" | "午餐" | "晚餐">(() => {
    const h = new Date().getHours();
    return h < 10 ? "早餐" : h < 15 ? "午餐" : "晚餐";
  });
  const [todayAdults, setTodayAdults] = useState(3);
  const [todayKids, setTodayKids] = useState(2);
  const [veganOnly, setVeganOnly] = useState(false);
  const [intentModalOpen, setIntentModalOpen] = useState(false);
  // Inline headcount popover — lets the user change "今天几位用餐" right
  // from Home without diving into Settings. Writes nutri_adults/kids and
  // triggers menu refresh via the existing useRecommendDishes hook.
  const [headcountOpen, setHeadcountOpen] = useState(false);

  // Cuisine filter: 中餐 (non-western asian) / 西餐 (western) / all.
  // Default '中' so users who type 中餐 mentally don't get pasta in their list.
  // Declared before useRecommendDishes so the hook receives the right mode.
  const [cuisineMode, setCuisineMode] = useState<CuisineMode>(() => loadCuisineMode());
  useEffect(() => {
    localStorage.setItem('home_cuisine_mode', cuisineMode);
    // Tell useWeeklyMenu to re-run with the new cuisine. The cache key
    // already changes, but the hook listens to this event to actually
    // re-read the cache and regenerate when needed.
    window.dispatchEvent(new Event('nutri-prefs-changed'));
  }, [cuisineMode]);

  const { recommendedDishes, loading: dishesLoading, refresh: refreshRecommended } = useRecommendDishes(
    mealTime, veganOnly, todayAdults, todayKids, cuisineMode,
  );
  const { weeklyMenu, loading: weeklyLoading } = useWeeklyMenu();

  // ── Language + cuisine prefs ─────────────────────────────────────
  const { language, cycleLanguage, isChinese } = useLanguage();

  // Single-language display: pick the right title field for a dish based on
  // the user's active language. zh / zh-Hant → title_zh; everything else
  // (en / tl / id) → title_en with title_zh as a safety fallback when the
  // English title wasn't seeded (legacy rows, AI-generated school suggestions
  // before backfill, etc.).
  const dishTitle = (d: { title_zh?: string; title_en?: string; title?: string }) =>
    isChinese
      ? (d.title_zh || d.title_en || d.title || '')
      : (d.title_en || d.title_zh || d.title || '');

  // Localize the raw origin_cuisine DB value (e.g. 'cantonese' / 'northern' /
  // 'japanese_korean') for the dish subtitle. Without this, Chinese users
  // see raw English slugs like "japanese korean" under the title — sloppy.
  const CUISINE_LABEL_ZH: Record<string, string> = {
    cantonese: '粤菜', sichuan: '川菜', hunan: '湘菜', huaiyang: '淮扬菜',
    northern: '北方菜', shandong: '鲁菜', anhui: '徽菜', fujian: '闽菜',
    zhejiang: '浙菜', shanxi: '陕西菜', yunnan_guizhou: '云贵菜',
    chaoshan: '潮汕菜', shunde: '顺德菜', taiwanese: '台菜',
    japanese_korean: '日韩菜', southeast_asian: '东南亚', western: '西餐',
  };
  const CUISINE_LABEL_EN: Record<string, string> = {
    cantonese: 'Cantonese', sichuan: 'Sichuan', hunan: 'Hunan', huaiyang: 'Huaiyang',
    northern: 'Northern', shandong: 'Shandong', anhui: 'Anhui', fujian: 'Fujian',
    zhejiang: 'Zhejiang', shanxi: 'Shaanxi', yunnan_guizhou: 'Yunnan/Guizhou',
    chaoshan: 'Chaoshan', shunde: 'Shunde', taiwanese: 'Taiwanese',
    japanese_korean: 'Japanese/Korean', southeast_asian: 'SE Asian', western: 'Western',
  };
  const cuisineLabel = (d: { origin_cuisine?: string; desc?: string; type?: string; course_type?: string }) => {
    // 水果 row 显示"餐后水果"小标签，让用户一眼区分它不是要做的菜。
    if (d.course_type === 'fruit') return isChinese ? '餐后水果 · 时令' : 'Dessert fruit';
    const c = d.origin_cuisine;
    if (!c) return d.desc || d.type || (isChinese ? '家常菜' : 'Home cooking');
    return (isChinese ? CUISINE_LABEL_ZH[c] : CUISINE_LABEL_EN[c]) ?? c.replace('_', ' ');
  };

  // 水果 row 暂时没图，用 emoji 当 placeholder 比 stock fallback 图更亲切。
  // Map keyed by title_zh — covers all 15 fruits seeded via scripts/seed-fruits.ts.
  const FRUIT_EMOJI: Record<string, string> = {
    '苹果': '🍎', '香蕉': '🍌', '火龙果': '🐉', '草莓': '🍓', '樱桃': '🍒',
    '西瓜': '🍉', '葡萄': '🍇', '蓝莓': '🫐', '桃子': '🍑', '芒果': '🥭',
    '哈密瓜': '🍈', '梨': '🍐', '柚子': '🍋', '猕猴桃': '🥝', '橙子': '🍊',
  };
  const fruitEmoji = (d: any): string | null => {
    if (d?.course_type !== 'fruit') return null;
    return FRUIT_EMOJI[d.title_zh] ?? '🍽';
  };

  // ── 换菜 quota: 1/day free, 5/day Pro (= 5 套菜单/天) ───────────────
  const { isPro } = useSubscription();
  const swapQuotaKey = (() => {
    const d = new Date();
    return `home_swap_count_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const [swapCount, setSwapCount] = useState<number>(() => {
    return parseInt(localStorage.getItem(swapQuotaKey) ?? '0', 10);
  });
  const FREE_SWAP_PER_DAY = 1;
  const PRO_SWAP_PER_DAY  = 5;
  const dailyLimit = isPro ? PRO_SWAP_PER_DAY : FREE_SWAP_PER_DAY;
  const swapsLeft  = Math.max(0, dailyLimit - swapCount);

  function handleSwapAll() {
    if (swapsLeft <= 0) {
      // Free user out of swaps → upsell; Pro out → just block silently
      if (!isPro) navigate('/pricing');
      return;
    }
    const next = swapCount + 1;
    setSwapCount(next);
    localStorage.setItem(swapQuotaKey, String(next));

    // Snapshot what's about to be replaced — strongest negative-preference
    // signal we get. Fire-and-forget, the radar doesn't wait on it.
    const rejected = displayMenu.slice();
    if (rejected.length > 0) {
      recordBatchSwap(rejected, [], mealTime).catch(() => {/* non-critical */});
    }

    refreshRecommended();
  }

  // ── Who's eating today ───────────────────────────────────────────────────────
  const [allMembers] = useState<{ id: string; name: string; lifeStage: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('nutri_family_members') || '[]'); } catch { return []; }
  });
  const [eatingIds, setEatingIds] = useState<string[]>(() => {
    const all: any[] = (() => { try { return JSON.parse(localStorage.getItem('nutri_family_members') || '[]'); } catch { return []; } })();
    try {
      const saved = JSON.parse(localStorage.getItem('nutri_eating_today') || 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return all.map((m: any) => m.id);
  });

  // Keep todayAdults / todayKids in sync with the eatingIds toggle. Without
  // this, the recommend hook gets stale headcount and 5-people dinners can
  // collapse to 1-2 dishes (or vice versa).
  useEffect(() => {
    const selected = allMembers.filter(m => eatingIds.includes(m.id));
    if (selected.length === 0) return;
    const kids   = selected.filter(m => m.lifeStage === '儿童').length;
    const adults = selected.length - kids;
    setTodayAdults(adults);
    setTodayKids(kids);
  }, [eatingIds, allMembers]);

  function toggleEatingMember(id: string) {
    setEatingIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length === 0) return prev; // at least 1 must be selected
      localStorage.setItem('nutri_eating_today', JSON.stringify(next));
      window.dispatchEvent(new Event('nutri-prefs-changed')); // re-triggers menu generation
      return next;
    });
  }

  const MEMBER_COLORS = ['bg-orange-400','bg-blue-400','bg-emerald-400','bg-violet-400','bg-rose-400','bg-amber-400'];

  const [menuSwaps, setMenuSwaps] = useState<Record<number, any>>({});
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [swappingDishIndex, setSwappingDishIndex] = useState<number | null>(null);
  const [swapOptions, setSwapOptions] = useState<SupabaseDish[]>([]);
  const [selectedSwap, setSelectedSwap] = useState("");
  const [isSwapLoading, setIsSwapLoading] = useState(false);

  // Manually-deleted dishes from today's menu. Keyed by (date + mealTime) so
  // tomorrow's regenerated menu starts fresh. Stored as id set.
  const hiddenKey = (() => {
    const d = new Date();
    return `home_hidden_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${mealTime}`;
  })();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
      return new Set(Array.isArray(raw) ? raw : []);
    } catch { return new Set(); }
  });
  // Re-read hidden ids when mealTime changes (key changes).
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
      setHiddenIds(new Set(Array.isArray(raw) ? raw : []));
    } catch { setHiddenIds(new Set()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealTime]);
  function hideDish(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev); next.add(id);
      localStorage.setItem(hiddenKey, JSON.stringify(Array.from(next)));
      return next;
    });
  }

  // "已吃" diary — refreshed via window event so toggling a dish's
  // ✓ button in any row re-renders this list AND the daily strip in
  // the same tick.
  const [eatenSet, setEatenSet] = useState<Set<string>>(() => getEatenToday());
  useEffect(() => {
    const handler = () => setEatenSet(getEatenToday());
    window.addEventListener('nutri-eaten-changed', handler);
    return () => window.removeEventListener('nutri-eaten-changed', handler);
  }, []);
  function handleToggleEaten(dishId: string) {
    toggleEaten(dishId);
    // toggleEaten dispatches the event; state catches up next render
  }

  // Fridge scan
  const fridgeInputRef = useRef<HTMLInputElement>(null);
  const [isFridgeScanOpen, setIsFridgeScanOpen] = useState(false);
  const [fridgeScanLoading, setFridgeScanLoading] = useState(false);
  const [fridgeIngredients, setFridgeIngredients] = useState<string[]>([]);
  const [fridgeDishes, setFridgeDishes] = useState<MatchedDish[]>([]);
  const [fridgeError, setFridgeError] = useState<string | null>(null);
  const [scanScene, setScanScene]   = useState<ScanScene>('fridge');     // 冰箱 vs 超市货架
  const [scanLocale, setScanLocale] = useState<ScanLocale>('zh');         // 简体 / 繁體 输出
  const [fridgePreview, setFridgePreview] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [helperName, setHelperName] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  useEffect(() => {
    const userId = getUserId();
    if (userId) {
      supabase
        .from("user_profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if ((data as any)?.display_name) setDisplayName((data as any).display_name);
        });

      // Load or create household for this employer. We use `order + limit(1)`
      // instead of `maybeSingle()` because employer_id has no UNIQUE
      // constraint — historical data has duplicates per employer, and
      // maybeSingle() throws PostgREST 400 when there's more than one row.
      // The newest household is the canonical one.
      supabase
        .from("households")
        .select("id, invite_code, household_members(helper_id, user_profiles(display_name))")
        .eq("employer_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(async ({ data: rows }) => {
          const data = rows?.[0];
          if (data) {
            setHouseholdId(data.id);
            setInviteCode(data.invite_code ?? "");
            const members: any[] = (data as any).household_members ?? [];
            const active = members.find((m: any) => m.user_profiles?.display_name);
            if (active) setHelperName(active.user_profiles.display_name);
          } else {
            // First time — create household
            const { data: created } = await supabase
              .from("households")
              .insert({ employer_id: userId })
              .select("id, invite_code")
              .single();
            if (created) {
              setHouseholdId(created.id);
              setInviteCode(created.invite_code ?? "");
            }
          }
        });
    }

    // Fallback: helper name from localStorage (settings page)
    const savedHelper = localStorage.getItem("helperName");
    if (savedHelper) setHelperName(prev => prev || savedHelper);

    // Restore persisted headcount
    const adults = localStorage.getItem("nutri_adults");
    const kids = localStorage.getItem("nutri_kids");
    if (adults) setTodayAdults(Number(adults));
    if (kids) setTodayKids(Number(kids));
  }, []);

  // Today index (Mon=0…Sun=6). Use the shared helper so 20:00 cutoff
  // (= "tonight starts tomorrow") stays consistent with isWeekend() and
  // daysFromTodayOnward().
  const todayIdx = todayDayIndex();

  // Weekday label for the main menu headline — product call 2026-05-17,
  // "today's menu" was too vague for users tracking weekly progression.
  // After 20:00 todayDayIndex already rolls to tomorrow, so the label
  // naturally previews the next day.
  const WEEKDAY_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
  const WEEKDAY_LABELS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
  const weekdayLabel = language === 'en'
    ? `${WEEKDAY_LABELS_EN[todayIdx]}'s menu`
    : `${WEEKDAY_LABELS_ZH[todayIdx]}菜单`;

  // Build display menu per meal tab
  const storedMenuRaw: any[] = (() => {
    try { return JSON.parse(localStorage.getItem("generatedMenu") || "[]"); } catch { return []; }
  })();

  // ── Breakfast pool + picker — mirrors WeeklyMenu page (src/pages/WeeklyMenu.tsx
  // line 70-88) so 早餐 on Home matches 早餐 on the weekly view exactly.
  // useRecommendDishes' breakfast branch goes through scoreDish + cuisineFilter
  // on a MIXED pool (breakfast+lunch+dinner+all), so its pickBreakfastCombo
  // resolves slot candidates against a different ordering than WeeklyMenu page's
  // dedicated breakfast pool. We bypass that here.
  const [breakfastPool, setBreakfastPool] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('dishes')
        .select(DISH_FIELDS)
        .eq('meal_type', 'breakfast');
      if (!cancelled && data) setBreakfastPool(data);
    })();
    return () => { cancelled = true; };
  }, []);
  const userHometownForBreakfast = (() => {
    try {
      const raw = localStorage.getItem('userHometown');
      return raw ? raw.split(',')[0] : null;
    } catch { return null; }
  })();
  const breakfastDishesFromCombo: any[] = (() => {
    if (mealTime !== '早餐' || breakfastPool.length === 0) return [];
    try {
      const result = pickBreakfastCombo({
        pool: breakfastPool as any,
        dayIndex: todayIdx,
        hometown: userHometownForBreakfast,
        avoidIngredients: [],
        avoidTags: [],
      });
      return result.dishes as any[];
    } catch { return []; }
  })();

  // The fruit-of-the-day slot lives in useRecommendDishes' output regardless
  // of which source we pick for the main menu. We append it to whatever
  // baseMenu we end up choosing so the "餐后水果·时令" row keeps showing.
  const fruitFromRecommend = recommendedDishes.find(d => (d as any).course_type === 'fruit');

  const baseMenu: any[] = (() => {
    if (mealTime === "早餐") {
      // Breakfast: use the same dedicated breakfast pool + pickBreakfastCombo
      // that WeeklyMenu page uses. This guarantees Home's 早餐 matches the
      // weekly view's 周一/周二/... 早餐 row dish-for-dish. Falls back to
      // useRecommendDishes only if the dedicated pool hasn't loaded yet.
      if (breakfastDishesFromCombo.length > 0) return breakfastDishesFromCombo;
      return recommendedDishes.length > 0 ? recommendedDishes : [];
    }
    // 午餐 / 晚餐 — Smell 1 阶段 1：永远从 weeklyMenu 读，不再回退到
    // useRecommendDishes。weeklyMenu loading / 未就绪 / 周末无行 → 返回
    // 空数组，由上层渲染 skeleton 或空态 CTA。
    if (mealTime === "午餐") {
      const lunch = weeklyMenu?.days[todayIdx]?.lunchDishes ?? [];
      if (lunch.length === 0) return [];
      return fruitFromRecommend ? [...lunch, fruitFromRecommend] : lunch;
    }
    // 晚餐
    const dinner = weeklyMenu?.days[todayIdx]?.dishes ?? [];
    if (dinner.length === 0) return [];
    return fruitFromRecommend ? [...dinner, fruitFromRecommend] : dinner;
  })();

  // Manual additions from /favorites "+ 菜单" — keyed by date + mealTime so
  // tomorrow / next meal-tab starts clean. Prepended so the user sees their
  // pick first.
  const manualKey = (() => {
    const d = new Date();
    return `home_manual_additions_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${mealTime}`;
  })();
  const manualAdditions: any[] = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(manualKey) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  })();
  const baseMenuWithManual = [
    ...manualAdditions,
    ...baseMenu.filter(d => !manualAdditions.some((m: any) => m.id === d?.id)),
  ];

  // Display order: 肉 → 海鲜 → 蔬菜 → 主食 → 汤 → 甜品.
  // Drives "what to cook first" reading flow on the home card.
  const SEAFOOD_INGREDIENTS = new Set([
    'seafood','fish','shrimp','crab','shellfish','squid','scallop','clam',
    'lobster','salmon','tuna','cod','hairtail','seabass','oyster',
  ]);
  const courseRank = (dish: any): number => {
    const ct  = (dish.course_type ?? '') as string;
    const ing = ((dish.main_ingredient ?? '') as string).toLowerCase();
    if (ct === 'main_protein' && SEAFOOD_INGREDIENTS.has(ing)) return 1; // 海鲜
    if (ct === 'main_protein') return 0;     // 肉/禽/蛋
    if (ct === 'veggie_dish')  return 2;     // 蔬菜
    if (ct === 'staple')       return 3;     // 主食
    if (ct === 'soup')         return 4;     // 汤
    if (ct === 'dessert')      return 5;     // 甜品
    return 6;                                // unknown last
  };
  // Cuisine filter is now enforced at the DB query level (useRecommendDishes
  // + useWeeklyMenu both call applyCuisineFilter), so we no longer need a
  // post-filter here that would otherwise collapse 3 candidates down to 1.
  const displayMenu: any[] = baseMenuWithManual
    .map((dish, idx) => menuSwaps[idx] || dish)
    .filter(d => d && !hiddenIds.has(d.id))
    .slice()
    .sort((a, b) => courseRank(a) - courseRank(b));
  const hasMenu = (weeklyMenu?.days[todayIdx]?.dishes.length ?? storedMenuRaw.length) > 0;

  const { solarTerm, weather, tip } = useDailyTip();

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "早安" : hour < 17 ? "下午好" : "晚上好";
  const dateLabel = now.toLocaleDateString("zh-HK", {
    month: "long", day: "numeric", weekday: "long",
  });

  // FAB: context-aware primary action
  const fabLabel = hasMenu ? "查看采购清单" : "生成本周菜单";
  const fabIcon = hasMenu ? "shopping_cart" : "auto_awesome";
  const fabAction = hasMenu
    ? () => {
        localStorage.setItem("generatedMenu", JSON.stringify(displayMenu));
        localStorage.setItem("effectivePeople", JSON.stringify(todayAdults + todayKids * 0.5));
        navigate("/verify");
      }
    : () => navigate("/weekly");

  const openSwapDrawer = async (idx: number) => {
    setSwappingDishIndex(idx);
    setSwapOptions([]);
    setSelectedSwap("");
    setIsSwapOpen(true);
    setIsSwapLoading(true);
    try {
      const options = await fetchSwapOptions(displayMenu[idx] as SupabaseDish, 3);
      setSwapOptions(options);
      if (options.length > 0) setSelectedSwap(options[0].id);
    } finally {
      setIsSwapLoading(false);
    }
  };

  const handleSwapConfirm = () => {
    if (swappingDishIndex !== null) {
      const opt = swapOptions.find(o => o.id === selectedSwap);
      if (opt) {
        setMenuSwaps(prev => ({ ...prev, [swappingDishIndex]: opt }));
        const swappedDish = displayMenu[swappingDishIndex];
        if (swappedDish?.id) {
          // Aggregate counter on the dishes table (legacy)
          supabase
            .from("dishes")
            .update({ times_employer_swapped: (swappedDish.times_employer_swapped ?? 0) + 1 })
            .eq("id", swappedDish.id)
            .then(() => {});
          // Per-user preference signal — strong "not this one + yes this one"
          recordSwap({
            rejected:    swappedDish,
            replacement: opt,
            mealType:    mealTime,
            source:      'home_per_dish',
          }).catch(() => {/* non-critical */});
        }
      }
    }
    setIsSwapOpen(false);
  };

  const handleFridgeScan = async (file: File) => {
    setFridgeScanLoading(true);
    setFridgeError(null);
    setFridgeDishes([]);
    setFridgeIngredients([]);
    setFridgePreview(URL.createObjectURL(file));
    setIsFridgeScanOpen(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      // Gemini Vision now ONLY returns the detected ingredient list
      // (cheap output). Actual dish suggestions come from the DB via
      // scanMatch — that way the user sees real dishes with image /
      // steps / nutrition / can-add-to-menu, not invented strings.
      const result = await analyzeFridgePhoto(base64, mimeType, scanScene, scanLocale);
      setFridgeIngredients(result.detected_ingredients);
      const normalized = normalizeIngredients(result.detected_ingredients);
      const matches = await suggestDishesFromScan({
        ingredients: normalized,
        cuisineMode,
        scene: scanScene,
        limit: 6,
      });
      setFridgeDishes(matches);
    } catch {
      setFridgeError("识别失败，请重试");
    } finally {
      setFridgeScanLoading(false);
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto relative"
      style={{
        background: "linear-gradient(180deg, #FAF6F0 0%, #F4EEE3 100%)",
        paddingBottom: 100,
      }}>

      {/* ── Editorial header — warm paper, serif greeting ─────────── */}
      <header style={{ paddingTop: "env(safe-area-inset-top, 44px)" }}>
        <div className="flex items-start justify-between px-5 pt-3 pb-1">
          <div className="flex-1 min-w-0 pr-3">
            {/* Date in tiny caps over the greeting — editorial feel */}
            <p style={{
              fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
              color: "rgba(0,0,0,0.42)", fontWeight: 600,
            }}>
              {dateLabel}
            </p>
            <h1 className="font-serif font-black mt-1" style={{
              fontSize: 30, color: "#1a1a1a", letterSpacing: "-0.01em", lineHeight: 1.05,
            }}>
              {greeting}，<span style={{ color: "#FF5A1F" }}>开饭啦</span>
            </h1>
            {/* Solar term + weather as a single inline row, no chip clutter */}
            <p className="mt-2 flex items-center gap-2 flex-wrap" style={{ fontSize: 11.5, color: "rgba(0,0,0,0.55)" }}>
              <span className="font-bold" style={{ color: "#FF5A1F" }}>{solarTerm.icon} {solarTerm.name}</span>
              {weather && (
                <>
                  <span style={{ color: "rgba(0,0,0,0.18)" }}>·</span>
                  <span>{weather.temp}°C {weather.label}</span>
                </>
              )}
            </p>
            {tip && (
              <p className="mt-1" style={{ fontSize: 11.5, color: "rgba(0,0,0,0.42)", lineHeight: 1.55, fontStyle: "italic" }}>
                {tip}
              </p>
            )}
          </div>

          {/* Header action stack: language toggle on top, QR scan below */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Language cycler — short label, cycles zh → 繁 → EN → tl → id.
                QR/fridge-scan was here too; moved to the bottom 扫冰箱 grid
                button so the header stays single-action and clean. */}
            <button onClick={cycleLanguage}
              className="px-3 h-8 rounded-full flex items-center justify-center font-bold active:scale-95 transition-transform"
              style={{ background: "white", boxShadow: "0 4px 14px rgba(0,0,0,0.06)", fontSize: 11, color: "#1a1a1a", minWidth: 56 }}
              title="切换语言 / Switch language">
              {LANGUAGE_LABEL[language]}
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-4 pt-2 pb-4 px-4">

        {/* Trial-expired gate (2026-05-17 product spec). Non-members whose
            7-day 试用期 has elapsed see a paywall card in place of any
            menu surface. Members and within-trial users see the regular
            flow below. */}
        {isLoggedIn && !isPro && !isWithinTrial() ? (
          <TrialExpiredCard onUnlock={() => navigate('/pricing')} />
        ) : (<>

        {/* Weekend (Sat/Sun) → swap menu surface (user-confirmed 2026-05-17):
            1) "出门换换口味" hero + 本周饭桌+缺什么合一框 + 5 家餐厅推荐
            2) 简化的"下周菜单"nav card 跳 /weekly
            Mon-Fri continues to render the full meal flow below.

            New-user gate (2026-05-17): first-ever session always sees the
            daily-menu surface regardless of weekday — restaurant recs are
            a "returning user" reward. Second login onward, the weekend
            branch kicks in. */}
        {(isWeekend() && !isNewUserSession()) ? <>
          <WeekendDiningReport />
          <NextWeekMenuPreview />
        </> : <>

        {/* 家庭成员补全 nudge — 仅对「家有小孩、家庭成员档案不全、未被
            dismiss」的雇主显示一次。点 CTA 跳 /settings；按 × 永久关闭。
            产品意图（user 2026-05-17）：onboarding 只采到家庭层偏好，
            富妈妈 + 2 孩子的场景下推荐立刻能翻倍准确度——只要她肯花
            2 分钟分别建档 (一个不吃鱼 + 一个长高需求等)。 */}
        <FamilyMemberNudge />

        {/* ① TODAY'S MENU — Editorial hero ────────────────────────
            Inspired by food magazine layouts: large dish photography on
            the left, generous typography on the right. No internal padding
            on the photo edge so dishes feel like the page itself. */}
        <section>
          {/* Meal selector + week-menu link — sits ON the cream bg */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="inline-flex p-1 rounded-2xl gap-0.5"
              style={{ background: "rgba(0,0,0,0.05)" }}>
              {(["早餐", "午餐", "晚餐"] as const).map(m => (
                <button key={m} onClick={() => setMealTime(m)}
                  className="px-3.5 py-1.5 rounded-xl font-bold transition-all active:scale-95"
                  style={{
                    fontSize: 13,
                    background: mealTime === m ? "white" : "transparent",
                    color: mealTime === m ? "#1a1a1a" : "rgba(0,0,0,0.42)",
                    boxShadow: mealTime === m ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                  }}>
                  {m}
                </button>
              ))}
            </div>
            {/* 本周菜单 + 收藏 quick links moved to the 菜单 tab so Home
                stays focused on today's recommendation. Bottom nav still
                covers both — 菜单 tab is /weekly, and the WeeklyMenu page
                now hosts the favorites shortcut. */}
          </div>

          {/* Cuisine filter + 今日用餐人数 chip — same row, two halves. */}
          <div className="relative flex items-center justify-between mb-3">
            <div className="inline-flex p-1 rounded-2xl gap-0.5"
              style={{ background: "rgba(0,0,0,0.05)" }}>
              {/* "全部" chip removed 2026-05-17 per product call —
                  always force a specific cuisine to keep menus culturally
                  coherent. If a user's last-chosen mode was 'all' (legacy),
                  the useState init / loadCuisineMode falls back to '中餐'. */}
              {([
                { key: 'chinese',  label: '中餐' },
                { key: 'hk-style', label: '港式' },
                { key: 'western',  label: '西餐' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setCuisineMode(key)}
                  className="px-2.5 py-1 rounded-xl font-bold transition-all active:scale-95"
                  style={{
                    fontSize: 11.5,
                    background: cuisineMode === key ? "white" : "transparent",
                    color: cuisineMode === key ? "#1a1a1a" : "rgba(0,0,0,0.42)",
                    boxShadow: cuisineMode === key ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* 今日用餐人数 chip — tap to expand the +/- stepper popover.
                Writes nutri_adults / nutri_kids; useRecommendDishes picks
                up the new count on the next refresh tick. */}
            <button
              onClick={() => setHeadcountOpen(o => !o)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold active:scale-95 transition-transform"
              style={{
                fontSize: 12,
                background: "white",
                color: "#1a1a1a",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
              title="今日几位用餐">
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#FF5A1F" }}>group</span>
              <span>{todayAdults} 大{todayKids > 0 ? ` + ${todayKids} 小` : ""}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", transition: "transform 0.2s", transform: headcountOpen ? "rotate(180deg)" : "rotate(0deg)" }}>expand_more</span>
            </button>

            {/* Stepper popover */}
            {headcountOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setHeadcountOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 rounded-2xl p-4 w-[260px]"
                  style={{
                    background: "white",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
                  }}>
                  <p className="text-[11px] font-bold text-secondary/60 uppercase tracking-wider mb-3">今日几位用餐</p>

                  {/* Adults stepper */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[13px] font-bold text-on-surface">大人</p>
                      <p className="text-[10px] text-secondary/60">每位算 1 人</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const n = Math.max(1, todayAdults - 1);
                          setTodayAdults(n);
                          localStorage.setItem("nutri_adults", String(n));
                          window.dispatchEvent(new Event("nutri-prefs-changed"));
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                        style={{ background: "rgba(0,0,0,0.06)" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#1a1a1a" }}>remove</span>
                      </button>
                      <span className="font-black tabular-nums text-center" style={{ fontSize: 20, minWidth: 28, color: "#1a1a1a" }}>{todayAdults}</span>
                      <button
                        onClick={() => {
                          const n = Math.min(12, todayAdults + 1);
                          setTodayAdults(n);
                          localStorage.setItem("nutri_adults", String(n));
                          window.dispatchEvent(new Event("nutri-prefs-changed"));
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                        style={{ background: "#FF5A1F" }}>
                        <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>add</span>
                      </button>
                    </div>
                  </div>

                  {/* Kids stepper */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[13px] font-bold text-on-surface">孩子</p>
                      <p className="text-[10px] text-secondary/60">每位算半人</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const n = Math.max(0, todayKids - 1);
                          setTodayKids(n);
                          localStorage.setItem("nutri_kids", String(n));
                          window.dispatchEvent(new Event("nutri-prefs-changed"));
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                        style={{ background: "rgba(0,0,0,0.06)" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#1a1a1a" }}>remove</span>
                      </button>
                      <span className="font-black tabular-nums text-center" style={{ fontSize: 20, minWidth: 28, color: "#1a1a1a" }}>{todayKids}</span>
                      <button
                        onClick={() => {
                          const n = Math.min(8, todayKids + 1);
                          setTodayKids(n);
                          localStorage.setItem("nutri_kids", String(n));
                          window.dispatchEvent(new Event("nutri-prefs-changed"));
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                        style={{ background: "#FF5A1F" }}>
                        <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>add</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-center text-[11px] text-secondary/70 pt-1 border-t border-black/5">
                    共 {todayAdults + todayKids} 人 · 等效 {(todayAdults + todayKids * 0.5).toFixed(1)} 人份
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Editorial menu card — paper background, generous padding */}
          <div className="rounded-3xl overflow-hidden"
            style={{
              background: "white",
              boxShadow: "0 8px 28px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)",
            }}>

            {/* Header strip: "在家用餐" + member dots, refined */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-2.5 overflow-x-auto no-scrollbar">
              <span className="font-serif" style={{ fontSize: 12, color: "rgba(0,0,0,0.42)", fontStyle: "italic", whiteSpace: 'nowrap' }}>
                {weekdayLabel}
              </span>
              <span style={{ color: "rgba(0,0,0,0.10)" }}>·</span>
              {allMembers.map((m, idx) => {
                const sel = eatingIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleEatingMember(m.id)}
                    title={m.name}
                    className={`rounded-full transition-all active:scale-95 shrink-0 ${sel ? '' : 'opacity-35'}`}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-black ${MEMBER_COLORS[idx % MEMBER_COLORS.length]}`}
                      style={{
                        fontSize: 12,
                        boxShadow: sel ? "0 0 0 2px white, 0 0 0 4px #FF5A1F" : "none",
                      }}>
                      {(m.name || '?')[0]}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={() => navigate('/settings')}
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 active:scale-95"
                style={{ background: "rgba(0,0,0,0.04)", color: "rgba(0,0,0,0.35)" }}
                title="管理家庭成员"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              </button>
            </div>

            {/* Thin divider — subtle, paper-like */}
            <div className="h-px mx-5" style={{ background: "rgba(0,0,0,0.05)" }} />

            {/* Dish list — bigger photos, editorial typography.
                Smell 1 阶段 1：午餐 / 晚餐区的 loading 跟随 weeklyMenu
                hook，早餐仍跟随 useRecommendDishes（早餐池独立加载）。 */}
            <div className="px-5 pt-2 pb-1">
              {(mealTime === '早餐' ? dishesLoading : weeklyLoading) ? (
                <div className="flex flex-col gap-4 py-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-4 animate-pulse">
                      <div className="w-[78px] h-[78px] rounded-2xl shrink-0" style={{ background: "rgba(0,0,0,0.05)" }} />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 rounded-full w-2/3" style={{ background: "rgba(0,0,0,0.05)" }} />
                        <div className="h-3 rounded-full w-1/3" style={{ background: "rgba(0,0,0,0.04)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : displayMenu.length > 0 ? (
                <div className="flex flex-col">
                  {displayMenu.slice(0, 5).map((dish: any, idx: number) => (
                    <div key={idx} className="relative flex items-center gap-4 py-3.5"
                      style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(0,0,0,0.04)' }}>
                      <div className="relative w-[78px] h-[78px] rounded-2xl overflow-hidden shrink-0 flex items-center justify-center"
                        style={{
                          background: fruitEmoji(dish) ? "linear-gradient(135deg, #FFF7F2, #FFE4D0)" : "rgba(0,0,0,0.04)",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}>
                        {fruitEmoji(dish) ? (
                          <span style={{ fontSize: 44, lineHeight: 1 }} aria-label={dishTitle(dish)}>
                            {fruitEmoji(dish)}
                          </span>
                        ) : (
                          <img
                            src={dish.img || dish.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=240&h=240&fit=crop"}
                            alt={dishTitle(dish)}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=240&h=240&fit=crop"; }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Tiny editorial label number. */}
                        <p style={{ fontSize: 9, letterSpacing: "0.18em", color: "rgba(0,0,0,0.30)", fontWeight: 700 }}>
                          NO. {String(idx + 1).padStart(2, '0')}
                        </p>
                        {/* Title row — wraps to up to 2 lines so long names
                            stay readable. First line clears the absolute
                            top-right action cluster via paddingRight; the
                            wrapped second line uses the same width (kept simple
                            — overflow into line 2 reads correctly). */}
                        <p className="font-serif font-black"
                          style={{
                            fontSize: 18,
                            color: "#1a1a1a",
                            letterSpacing: "-0.005em",
                            lineHeight: 1.2,
                            paddingRight: 96,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                          {dishTitle(dish)}
                          {/* 小美 chip — only when household has 小美 on AND
                              this dish is robot-doable. Inline trailer of the
                              title so it's read as a property of the dish. */}
                          {localStorage.getItem('has_xiaomei_robot') === 'true' && dish.xiaomei_compatible && (
                            <span
                              className="rounded-full px-1.5 py-0.5 font-bold leading-none ml-1.5 align-middle"
                              style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F', fontSize: 9, letterSpacing: '0.04em' }}
                              title="小美料理机可以做这道菜"
                            >
                              🤖 小美
                            </span>
                          )}
                        </p>
                        {/* Cuisine label + prep-time badge — full row width
                            since this row sits below the absolute action
                            cluster. Badge hides when neither cook_time_min nor
                            steps JSON give a usable estimate. */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="truncate" style={{ fontSize: 11.5, color: "rgba(0,0,0,0.42)" }}>
                            {cuisineLabel(dish)}
                          </span>
                          {(() => {
                            const t = getPrepTimeMin(dish);
                            return t ? (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold shrink-0"
                                style={{ fontSize: 9.5, background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.45)' }}
                                title="备餐预估时间"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>schedule</span>
                                {t}min
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      {/* Top-right action cluster — hoisted out of the inline
                          flow so the title can use the full row width. Compact
                          14px icons in 24px hit-targets keep the cluster
                          unobtrusive at the corner. */}
                      <div className="absolute top-1.5 right-1 flex items-center gap-0 z-10">
                        <HeartButton dish={dish} sourceTag={mealTime} size={14} className="!p-1.5" />
                        {/* ✓ 已吃 — toggle persists to localStorage via
                            eatingDiary; DailyNutritionStrip flips from
                            "计划" to "实际" mode the moment any dish is
                            ticked. */}
                        <button onClick={() => handleToggleEaten(dish.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                          style={{
                            background: eatenSet.has(dish.id) ? 'rgba(22,163,74,0.15)' : 'transparent',
                          }}
                          title={eatenSet.has(dish.id) ? '已吃 · 点击取消' : '标记为已吃'}>
                          <span className="material-symbols-outlined" style={{
                            fontSize: 14,
                            color: eatenSet.has(dish.id) ? '#16A34A' : 'rgba(0,0,0,0.40)',
                            fontVariationSettings: eatenSet.has(dish.id) ? "'FILL' 1" : "'FILL' 0",
                          }}>{eatenSet.has(dish.id) ? 'check_circle' : 'radio_button_unchecked'}</span>
                        </button>
                        <button onClick={() => openSwapDrawer(idx)}
                          className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                          title="换一道">
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "rgba(0,0,0,0.40)" }}>sync_alt</span>
                        </button>
                        <button onClick={() => hideDish(dish.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                          title="删除这道菜">
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "rgba(0,0,0,0.40)" }}>close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center gap-4">
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: "rgba(0,0,0,0.10)" }}>restaurant_menu</span>
                  <p className="font-serif italic" style={{ fontSize: 14, color: "rgba(0,0,0,0.40)", textAlign: 'center', lineHeight: 1.6 }}>
                    {mealTime}还没菜单
                  </p>
                  <button onClick={() => navigate("/weekly")}
                    className="px-6 py-2.5 rounded-full font-bold text-white active:scale-95"
                    style={{ fontSize: 13, background: "#FF5A1F", boxShadow: "0 6px 18px rgba(255,90,31,0.30)" }}>
                    生成本周菜单
                  </button>
                </div>
              )}
            </div>

          </div>
        </section>

        {/* Seasonal + 时辰 mini-label — sits above the nutrition card so the
            user reads "今日时令" first, then their actual nutrition state. */}
        <div className="flex items-center justify-center gap-1.5 mb-1"
          style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.45)', fontWeight: 600, letterSpacing: '0.04em' }}>
          <span style={{ color: '#FF5A1F' }}>{solarTerm.icon} {solarTerm.name}</span>
          <span style={{ color: 'rgba(0,0,0,0.18)' }}>·</span>
          <span>{getChineseHour()}</span>
          {weather && (<>
            <span style={{ color: 'rgba(0,0,0,0.18)' }}>·</span>
            <span>{weather.label}</span>
          </>)}
        </div>

        {/* 今日营养 strip — 中国营养主厨 daily scorecard.
            Pulls today's lunch+dinner from weeklyMenu, falls back to the
            current displayMenu for whichever meal is active so the user
            sees their nutrition state even before weekly is generated. */}
        {(() => {
          const todayIso = new Date().toISOString().slice(0,10);
          const todayMenu = (weeklyMenu?.days ?? []).find(d => d.date === todayIso);
          const meals = {
            '早餐': mealTime === '早餐' ? displayMenu as any : [],
            '午餐': (todayMenu?.lunchDishes ?? (mealTime === '午餐' ? displayMenu : [])) as any,
            '晚餐': (todayMenu?.dishes ?? (mealTime === '晚餐' ? displayMenu : [])) as any,
          };
          // No explicit kcalTarget — summarizeDay auto-scales by
          // householdServings so a 4-person family target = 7400 kcal
          // not 2000.
          return <DailyNutritionStrip meals={meals} />;
        })()}

        {/* 工作日导航入口 — "本周末出门吃"。让 Mon-Fri 用户提前看 / 预订
            周末的香港餐厅推荐。周六周日则不显示这个 nav (Home 上面已经
            inline 展示了 WeekendDiningReport)。 */}
        <button
          onClick={() => navigate('/weekend')}
          className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
          style={{
            background: 'linear-gradient(135deg, #FFFAF5 0%, #FFE9D2 100%)',
            border: '1px solid rgba(255,140,80,0.20)',
            boxShadow: '0 4px 14px rgba(255,140,80,0.10)',
          }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'white', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
            <span style={{ fontSize: 18 }}>🍽</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[13.5px]" style={{ color: '#1a1a1a' }}>本周末出门吃</p>
            <p className="text-[11px]" style={{ color: 'rgba(0,0,0,0.50)' }}>提前看 5 家香港好馆子 · 预订留位</p>
          </div>
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, color: '#FF5A1F' }}>chevron_right</span>
        </button>

        {/* Intent input — taps into IntentRegenModal. Shows the current
            saved intent (if any) so the user knows the algo is biased. */}
        {(() => {
          const bias = loadIntentBias();
          const hasBias = bias && (bias.userText?.trim() || (bias.chips?.length ?? 0) > 0);
          return (
            <button
              onClick={() => setIntentModalOpen(true)}
              className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
              style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)" }}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,90,31,0.10)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#FF5A1F" }}>
                  auto_awesome
                </span>
              </div>
              <div className="flex-1 min-w-0">
                {hasBias ? (
                  <>
                    <p className="font-serif font-black truncate" style={{ fontSize: 14, color: "#1a1a1a" }}>
                      {bias!.userText || bias!.chips.join(' · ')}
                    </p>
                    <p className="truncate mt-0.5" style={{ fontSize: 11, color: "rgba(0,0,0,0.42)" }}>
                      点击修改 · 算法已根据此偏好调整
                    </p>
                  </>
                ) : (
                  <p className="font-serif italic" style={{ fontSize: 14, color: "rgba(0,0,0,0.45)" }}>
                    今天还想吃……
                  </p>
                )}
              </div>
              <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, color: "rgba(0,0,0,0.30)" }}>
                chevron_right
              </span>
            </button>
          );
        })()}

        {/* 扫冰箱 / 烹饪 — primary actions of the day. Per-dish 换菜 is
            still on each menu row (sync_alt icon), so this bulk action
            became redundant; 扫冰箱 is the more useful first-click. */}
        <div className="grid grid-cols-2 gap-3">
          {/* 扫冰箱 — opens the camera picker, then geminiVision analyzes
              ingredients and suggests recipes from what's visible.
              GATED: anonymous users get bounced to /login first because
              this is a Gemini Vision call (real token cost — needs a
              real account to attribute usage and rate-limit). */}
          <button
            onClick={() => {
              if (!isLoggedIn) { navigate('/login', { state: { from: '/' } }); return; }
              fridgeInputRef.current?.click();
            }}
            className="rounded-2xl bg-white px-4 py-3.5 flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)" }}
            title={isLoggedIn ? '扫冰箱' : '请先登录后使用'}
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,180,216,0.12)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#00B4D8", fontVariationSettings: "'FILL' 1" }}>
                kitchen
              </span>
            </div>
            <p className="font-serif font-black" style={{ fontSize: 17, color: "#1a1a1a", letterSpacing: "-0.005em" }}>
              {isLoggedIn ? '扫冰箱' : '扫冰箱 🔒'}
            </p>
          </button>

          {/* 烹饪 — goes to /prep (which flows to /cook) */}
          <button
            onClick={() => { localStorage.setItem("generatedMenu", JSON.stringify(displayMenu)); navigate("/prep"); }}
            className="rounded-2xl px-4 py-3.5 flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
            style={{
              background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 100%)",
              boxShadow: "0 8px 22px rgba(255,90,31,0.28)",
            }}
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.22)" }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>
                skillet
              </span>
            </div>
            <p className="font-serif font-black text-white" style={{ fontSize: 17, letterSpacing: "-0.005em" }}>
              烹饪
            </p>
          </button>
        </div>

        {/* Pro entry cards (家宴 / 祛湿 / 学校营养) moved out of Home into
            Settings → 会员 Pro · 工具箱 — keeps the homepage focused on the
            day-to-day menu / cook / shop loop. The 采购清单 shortcut card
            was removed since it duplicated the bottom tab. */}

        {/* ③ HELPER STATUS — only rendered when bound. The invite-code flow
              for binding lives in Settings → 菲佣设置 to keep Home minimal. */}
        {helperName && (
          <div className="rounded-2xl bg-white px-4 py-3.5 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", fontSize: 16 }}>
              {helperName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate" style={{ fontSize: 14, color: "#1a1a1a" }}>{helperName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <p style={{ fontSize: 11, color: "rgba(0,0,0,0.38)" }}>已连接</p>
              </div>
            </div>
            <button onClick={() => navigate("/community?view=employer")}
              className="px-3 py-1.5 rounded-xl font-bold shrink-0 active:scale-95"
              style={{ fontSize: 12, background: "rgba(255,90,31,0.08)", color: "#FF5A1F" }}>
              点赞 👑
            </button>
          </div>
        )}

        {/* ④ 营养雷达 — moved to WeeklyMenu page to consolidate nutrition view.
            Home stays focused on today's loop (menu / 换菜 / 烹饪). */}

        {/* Day 1 CTA — only when no menu yet */}
        {!hasMenu && (
          <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #FF5A1F, #FF8C54)" }}>
            <h2 className="font-black text-white mb-1" style={{ fontSize: 20 }}>每天不再烦恼"吃什么"</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, marginBottom: 14 }}>
              AI 根据家人健康状况，智能规划一周菜单
            </p>
            <button onClick={() => navigate("/weekly")}
              className="w-full py-3 rounded-2xl font-bold active:scale-[0.98] transition-all"
              style={{ fontSize: 14, background: "white", color: "#FF5A1F" }}>
              生成本周菜单 →
            </button>
          </div>
        )}

        {/* Login CTA */}
        {!isLoggedIn && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(255,90,31,0.05)", border: "1.5px dashed rgba(255,90,31,0.25)" }}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ fontSize: 13, color: "#FF5A1F" }}>登录解锁完整功能</p>
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.38)" }}>家庭档案 · 工人协作 · 菜单同步</p>
            </div>
            <button onClick={() => navigate("/login")}
              className="px-4 py-2 rounded-xl font-bold text-white shrink-0 active:scale-95"
              style={{ fontSize: 12, background: "#FF5A1F" }}>登录</button>
          </div>
        )}

        {/* Pro upgrade nav — shown to logged-in non-members. Skipped on
            first-session new users so their initial impression isn't a
            paywall pitch. Tap → /pricing where the full benefits block
            + plans + Stripe checkout live. */}
        {isLoggedIn && !isPro && !isNewUserSession() && (
          <button onClick={() => navigate('/pricing')}
            className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
            style={{
              background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 60%, #FFB347 100%)",
              boxShadow: "0 8px 24px rgba(255,90,31,0.28)",
            }}>
            <span style={{ fontSize: 24 }}>⭐</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-bold text-white" style={{ fontSize: 14 }}>
                解锁爱吃 Pro 会员
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.4 }}>
                整周菜单 · 一键采购 · 米其林菜单 · 大厨上门 · 学校营养
              </p>
            </div>
            <span className="material-symbols-outlined text-white shrink-0" style={{ fontSize: 20 }}>
              chevron_right
            </span>
          </button>
        )}

        </>}  {/* end of weekday fragment — closes the isWeekend ternary */}

        </>)}  {/* end of trial-expired ternary wrap */}
      </main>

      <IntentRegenModal
        open={intentModalOpen}
        onClose={() => {
          setIntentModalOpen(false);
          // Refresh today's recommendations so newly saved intent takes effect
          refreshRecommended();
        }}
      />

      <BottomTabBar />

      {/* Hidden fridge input */}
      <input
        ref={fridgeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFridgeScan(f);
          e.target.value = "";
        }}
      />

      {/* ── Swap Drawer ──────────────────────────────────────────── */}
      {isSwapOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSwapOpen(false)} />
          <div className="relative bg-white w-full max-w-md mx-auto rounded-t-[32px] pt-4 pb-10 px-6 shadow-2xl">
            <div className="w-12 h-1.5 rounded-full mx-auto mb-6" style={{ background: "rgba(0,0,0,0.1)" }} />
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold" style={{ fontSize: 20 }}>更换菜品</h2>
              <button className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.06)" }} onClick={() => setIsSwapOpen(false)}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>
            <div className="space-y-3 mb-8">
              {isSwapLoading ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: "#FF5A1F", borderTopColor: "transparent" }} />
                  <p style={{ fontSize: 13, color: "rgba(0,0,0,0.38)" }}>搜索同食材菜品…</p>
                </div>
              ) : swapOptions.length === 0 ? (
                <p className="text-center py-6" style={{ fontSize: 13, color: "rgba(0,0,0,0.38)" }}>
                  暂无同食材菜品可换
                </p>
              ) : swapOptions.map(opt => (
                <label key={opt.id}
                  className="flex items-center p-3 rounded-2xl border-2 cursor-pointer transition-all"
                  style={{
                    borderColor: selectedSwap === opt.id ? "#FF5A1F" : "rgba(0,0,0,0.08)",
                    background: selectedSwap === opt.id ? "rgba(255,90,31,0.04)" : "white",
                  }}>
                  <div className="w-14 h-14 rounded-xl overflow-hidden mr-4 shrink-0"
                    style={{ background: "rgba(0,0,0,0.05)" }}>
                    <img className="w-full h-full object-cover" alt={opt.title} src={opt.img}
                      onError={e => {
                        (e.target as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&h=120&fit=crop";
                      }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold" style={{ fontSize: 15 }}>{dishTitle(opt)}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-md font-bold"
                      style={{ fontSize: 10, background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.4)" }}>
                      {opt.type}
                    </span>
                  </div>
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center ml-2 shrink-0"
                    style={{ borderColor: "#FF5A1F" }}>
                    {selectedSwap === opt.id && (
                      <div className="w-3 h-3 rounded-full" style={{ background: "#FF5A1F" }} />
                    )}
                  </div>
                  <input type="radio" name="swap" className="hidden"
                    checked={selectedSwap === opt.id} onChange={() => setSelectedSwap(opt.id)} />
                </label>
              ))}
            </div>
            <button
              className="w-full h-14 rounded-2xl font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-40"
              style={{ fontSize: 16, background: "#2D3748" }}
              onClick={handleSwapConfirm}
              disabled={isSwapLoading || !selectedSwap}>
              确认换菜
            </button>
          </div>
        </div>
      )}

      {/* ── Fridge Scan Drawer ───────────────────────────────────── */}
      {isFridgeScanOpen && (
        <div className="fixed inset-0 z-[110] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsFridgeScanOpen(false)} />
          <div className="relative bg-white w-full max-w-md mx-auto rounded-t-[32px] pt-4 pb-10 px-6 shadow-2xl">
            <div className="w-12 h-1.5 rounded-full mx-auto mb-4" style={{ background: "rgba(0,0,0,0.1)" }} />
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold" style={{ fontSize: 20 }}>📷 扫一扫</h2>
              <button className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.06)" }} onClick={() => setIsFridgeScanOpen(false)}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            {/* Scene picker + 简/繁 locale toggle — both are picked BEFORE
                shooting so the prompt sent to Gemini knows what to generate. */}
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-black/[0.04] p-0.5 rounded-full flex-1 flex gap-0.5">
                {([
                  { id: 'fridge', label: '冰箱 / 食材', emoji: '🧊' },
                  { id: 'market', label: '超市货架',   emoji: '🛒' },
                ] as { id: ScanScene; label: string; emoji: string }[]).map(s => (
                  <button key={s.id}
                    onClick={() => setScanScene(s.id)}
                    className={`flex-1 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                      scanScene === s.id ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                    }`}>
                    {s.emoji} {s.label}
                  </button>
                ))}
              </div>
              <div className="bg-black/[0.04] p-0.5 rounded-full flex gap-0.5">
                {([
                  { id: 'zh',      label: '简' },
                  { id: 'zh-Hant', label: '繁' },
                ] as { id: ScanLocale; label: string }[]).map(l => (
                  <button key={l.id}
                    onClick={() => setScanLocale(l.id)}
                    className={`px-2.5 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                      scanLocale === l.id ? 'bg-white shadow text-gray-900' : 'text-gray-500'
                    }`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {fridgePreview && (
              <div className="w-full h-44 rounded-2xl overflow-hidden mb-4" style={{ background: "rgba(0,0,0,0.05)" }}>
                <img src={fridgePreview} alt="冰箱" className="w-full h-full object-cover" />
              </div>
            )}

            {fridgeScanLoading && (
              <div className="flex flex-col items-center py-10 gap-3">
                <div className="w-9 h-9 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: "#FF5A1F", borderTopColor: "transparent" }} />
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.38)" }}>AI 识别食材，生成菜单…</p>
              </div>
            )}

            {fridgeError && (
              <div className="text-center py-6">
                <p style={{ fontSize: 14, color: "#ef4444" }} className="mb-4">{fridgeError}</p>
                <button className="px-5 py-2 rounded-full text-white font-semibold active:scale-95"
                  style={{ background: "#FF5A1F", fontSize: 13 }}
                  onClick={() => fridgeInputRef.current?.click()}>
                  重新拍照
                </button>
              </div>
            )}

            {!fridgeScanLoading && fridgeDishes.length > 0 && (
              <>
                {fridgeIngredients.length > 0 && (
                  <div className="mb-4">
                    <p style={{ fontSize: 11, color: "rgba(0,0,0,0.38)", letterSpacing: "0.08em" }} className="mb-2">
                      识别到的食材
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {fridgeIngredients.map(ing => (
                        <span key={ing} className="px-2.5 py-1 rounded-full font-medium"
                          style={{ fontSize: 12, background: "rgba(255,90,31,0.1)", color: "#FF5A1F" }}>
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Render real DB dishes (MatchedDish) — group by
                    origin_cuisine bucket (中式 vs 西式), then per-card
                    show image / kcal / 命中食材 / "看做法" CTA so the
                    user can act immediately. Old shape was an invented
                    string + description; new shape is a real `dishes`
                    row with id, image_url, prep_steps_json, kcal. */}
                {([
                  { key: 'chinese' as const, label: '中式推荐', emoji: '🥢' },
                  { key: 'western' as const, label: '西式推荐', emoji: '🍝' },
                ]).map(group => {
                  const items = fridgeDishes.filter(d => {
                    const isWestern = d.origin_cuisine === 'western';
                    return group.key === 'western' ? isWestern : !isWestern;
                  });
                  if (items.length === 0) return null;
                  return (
                    <div key={group.key} className="mb-5">
                      <p className="mb-2" style={{ fontSize: 11, color: "rgba(0,0,0,0.50)", letterSpacing: "0.08em", fontWeight: 700 }}>
                        {group.emoji} {group.label}（{items.length} 道）
                      </p>
                      <div className="space-y-3">
                        {items.map((dish) => (
                          <button key={dish.id}
                            onClick={() => {
                              localStorage.setItem("generatedMenu", JSON.stringify([{ id: dish.id, title_zh: dish.title_zh, image_url: dish.image_url }]));
                              navigate(`/prep?dish_id=${dish.id}`);
                            }}
                            className="w-full p-3 rounded-2xl border shadow-sm bg-white text-left active:scale-[0.99] transition-transform"
                            style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                            <div className="flex items-start gap-3">
                              {dish.image_url && (
                                <img src={dish.image_url} alt={dish.title_zh}
                                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-bold truncate" style={{ fontSize: 15 }}>
                                  {isChinese ? (dish.title_zh || dish.title_en) : (dish.title_en || dish.title_zh)}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {dish.cook_method && (
                                    <span className="px-1.5 py-0.5 rounded-md font-semibold"
                                      style={{ fontSize: 10, background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.45)" }}>
                                      {dish.cook_method}
                                    </span>
                                  )}
                                  {dish.nutrition_kcal_per_serving && (
                                    <span className="px-1.5 py-0.5 rounded-md font-semibold"
                                      style={{ fontSize: 10, background: "rgba(255,90,31,0.08)", color: "#FF5A1F" }}>
                                      {dish.nutrition_kcal_per_serving} kcal
                                    </span>
                                  )}
                                  {dish.xiaomei_compatible && localStorage.getItem('has_xiaomei_robot') === 'true' && (
                                    <span className="px-1.5 py-0.5 rounded-md font-semibold"
                                      style={{ fontSize: 10, background: "rgba(255,90,31,0.10)", color: "#FF5A1F" }}>
                                      🤖
                                    </span>
                                  )}
                                </div>
                                {dish.matched_count > 0 && (
                                  <p className="mt-1.5 truncate" style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>
                                    用到您的：{dish.matched_ingredients.join(' · ')}
                                  </p>
                                )}
                              </div>
                              <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: "rgba(0,0,0,0.30)" }}>
                                chevron_right
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <button className="w-full h-12 rounded-2xl font-semibold active:scale-95"
                  style={{ fontSize: 13, background: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.45)" }}
                  onClick={() => fridgeInputRef.current?.click()}>
                  重新拍照
                </button>
              </>
            )}

            {!fridgeScanLoading && !fridgeError && fridgeDishes.length === 0 && !fridgePreview && (
              <div className="flex flex-col items-center py-10 gap-4">
                <span className="material-symbols-outlined" style={{ fontSize: 56, color: "rgba(0,0,0,0.12)" }}>
                  {scanScene === 'market' ? 'storefront' : 'kitchen'}
                </span>
                <p style={{ fontSize: 14, color: "rgba(0,0,0,0.38)", textAlign: "center", lineHeight: 1.5 }}>
                  {scanScene === 'market'
                    ? '拍一张超市货架照片'
                    : '拍一张冰箱或食材照片'}<br />
                  AI 给你 <span style={{ color: '#FF5A1F', fontWeight: 700 }}>3 道中式 + 3 道西式</span>
                </p>
                <button
                  className="px-6 py-3 rounded-2xl font-semibold text-white flex items-center gap-2 active:scale-95"
                  style={{ fontSize: 14, background: "linear-gradient(135deg, #FF5A1F, #FF9054)" }}
                  onClick={() => fridgeInputRef.current?.click()}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>photo_camera</span>
                  拍照 / 选图
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 家庭成员补全 nudge ──────────────────────────────────────────────────
// 仅在以下三条都成立时显示：
//   · 家有小孩 (nutri_kids > 0)
//   · family_members 数量 < adults + kids (档案不全)
//   · 用户没按过 × (nutri_family_nudge_v1 != 'dismissed')
//
// 点 CTA → /settings；× → 永久 dismiss。这是 onboarding → daily use 中间
// 的一个"补全 hook"，目的是让她在第一次进 Home 时立刻意识到「分别建档
// = 推荐更懂每个孩子」。
function FamilyMemberNudge() {
  const navigate = useNavigate();
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const kids = parseInt(localStorage.getItem("nutri_kids") ?? "0", 10) || 0;
    const adults = parseInt(localStorage.getItem("nutri_adults") ?? "0", 10) || 0;
    const expected = adults + kids;
    if (kids <= 0) return; // 没小孩，nudge 无意义
    if (localStorage.getItem("nutri_family_nudge_v1") === "dismissed") return;
    const members = loadFamilyMembers();
    if (members.length >= expected) return; // 已建档全
    setShouldShow(true);
  }, []);

  if (!shouldShow) return null;

  const dismiss = () => {
    localStorage.setItem("nutri_family_nudge_v1", "dismissed");
    setShouldShow(false);
  };

  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-start gap-3 relative"
      style={{
        background: "linear-gradient(135deg, rgba(255,90,31,0.08), rgba(255,140,84,0.06))",
        border: "1px solid rgba(255,90,31,0.18)",
      }}>
      <span className="text-[24px] shrink-0" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}>👨‍👩‍👧‍👦</span>
      <div className="flex-1 min-w-0">
        <p className="font-serif font-black" style={{ fontSize: 14.5, color: "#1a1a1a" }}>
          给每位家人建个档案
        </p>
        <p className="mt-0.5 leading-relaxed" style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
          一个孩子不爱鱼、另一个长高需要奶——分别填上 2 分钟，推荐立刻懂他们。
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="mt-2 px-3 py-1 rounded-full font-bold active:scale-95 transition-all"
          style={{
            background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
            color: "white", fontSize: 12, letterSpacing: "0.04em",
            boxShadow: "0 2px 8px rgba(255,90,31,0.25)",
          }}>
          去填档案 →
        </button>
      </div>
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center active:scale-90"
        style={{ background: "rgba(0,0,0,0.05)" }}
        aria-label="dismiss">
        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.45)" }}>✕</span>
      </button>
    </div>
  );
}
