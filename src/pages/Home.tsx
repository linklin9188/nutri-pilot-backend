/**
 * Home — Employer dashboard
 * States: Day 1 (no menu) vs Week 1+ (with health metrics)
 * Sections: Health Dashboard → Procurement → Helper Status → Today's Menu
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSwapOptions, type SupabaseDish } from "../hooks/useSupabaseMenu";
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
import { TagBadgeRow, type TagBadge } from "../components/TagBadge";
import { getDishTitle } from "../lib/dishTitleI18n";
import ShareCard from "../components/ShareCard";
import DailyNutritionStrip from "../components/DailyNutritionStrip";
import { toggleEaten, getEatenToday } from "../lib/eatingDiary";
import { logMealEaten } from "../lib/mealLog";
import {
  Sun, CloudSun, Cloud, CloudFog,
  CloudRain, CloudRainWind, CloudLightning,
} from "lucide-react";
// pickBreakfastCombo / DISH_FIELDS 已在 Smell 1 阶段 2 (v40) 移到 useWeeklyMenu 内部

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

// ── §B (TICKET-027) Festival banner metadata ──────────────────────────────
// Maps the slug returned by Algorithm 025's getCurrentFestival(today) into a
// user-facing name + 3 recommended dish chips. Keep in sync with the slug
// list in src/hooks/useWeeklyMenu.ts FESTIVALS table. If a future Algorithm
// release adds a slug we don't recognize here, fallback to the slug itself.
const FESTIVAL_LABEL: Record<string, { name: string; icon: string; chips: string[] }> = {
  laba:      { name: '腊八节',    icon: '🥣', chips: ['腊八粥', '腊八蒜'] },
  chunjie:   { name: '春节',      icon: '🧧', chips: ['饺子', '年糕', '鱼'] },
  yuanxiao:  { name: '元宵',      icon: '🏮', chips: ['汤圆', '元宵'] },
  duanwu:    { name: '端午',      icon: '🎍', chips: ['粽子', '咸鸭蛋'] },
  qixi:      { name: '七夕',      icon: '🌌', chips: ['巧果'] },
  zhongqiu:  { name: '中秋',      icon: '🥮', chips: ['月饼', '螃蟹', '莲藕'] },
  chongyang: { name: '重阳',      icon: '🌼', chips: ['菊花酒', '糕点', '羊肉'] },
};

// Hook that dynamically imports getCurrentFestival from useWeeklyMenu and
// returns the active slug (±3 days window) — null when nothing matches OR
// when Algorithm 025 hasn't exported the helper yet (silent skip, per
// TICKET-027 §B fallback rule).
//
// Dev override (TICKET-030 §C): `?debug_festival=<slug>` on localhost or
// vite-dev forces the banner to render with that slug so all 7 banners can
// be visually QA'd without waiting for the calendar. Stripped on production
// nothinkeats.com (hostname check + import.meta.env.DEV gate).
function useActiveFestival(): string | null {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    // 1. Dev override first — exit early if a debug slug is in the URL and
    //    we're on a dev host. On production this branch is skipped entirely.
    if (typeof window !== 'undefined') {
      try {
        const url   = new URL(window.location.href);
        const debug = url.searchParams.get('debug_festival');
        const host  = window.location.hostname;
        const isDev = import.meta.env.DEV
          || host === 'localhost'
          || host === '127.0.0.1'
          || host.endsWith('.local');
        if (debug && isDev) {
          setSlug(debug);
          return; // dev fast-path; skip the dynamic-import probe below
        }
      } catch { /* malformed URL — fall through to production path */ }
    }

    // 2. Production path — dynamic import probe (per TICKET-027 §B).
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('../hooks/useWeeklyMenu');
        const fn = (mod as any).getCurrentFestival;
        if (typeof fn !== 'function') return; // not exported yet — silent skip
        const found = fn(new Date());
        if (!cancelled && typeof found === 'string') setSlug(found);
      } catch { /* dynamic import failed — silent skip per ticket */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return slug;
}

// Estimate cooking minutes for a dish badge. Prefers DB-provided cook_time_min,
// falls back to (prep_steps + cook_steps) × ~3min, hides when nothing known.
function getPrepTimeMin(dish: any): number | null {
  if (typeof dish?.cook_time_min === 'number' && dish.cook_time_min > 0) return dish.cook_time_min;
  const steps = (dish?.prep_steps_json?.length ?? 0) + (dish?.cook_steps_json?.length ?? 0);
  if (steps > 0) return Math.max(5, steps * 3);
  return null;
}

// Build a 1-line "为什么推荐" hint for a swap candidate vs the dish being
// replaced. Returns up to 2 axes that differ (cook method / oil-salt level /
// time / cuisine) so the user can pick on signal, not on the photo alone.
const COOK_METHOD_LABEL: Record<string, string> = {
  stir_fry: '炒', steam: '蒸', boil: '煮', stew: '炖', pan_fry: '煎',
  deep_fry: '炸', grill: '烤', roast: '烤', bake: '焗', mix_cold: '凉拌',
  raw: '生食', blanch: '焯', braise: '焖',
};
const LEVEL_RANK: Record<string, number> = { low: 0, mid: 1, high: 2 };
function getSwapReasonHint(rejected: any, candidate: any): string {
  const hints: string[] = [];
  // 1. Cook method differs — strong visual + health signal
  const rm = rejected?.cook_method;
  const cm = candidate?.cook_method;
  if (rm && cm && rm !== cm && COOK_METHOD_LABEL[cm]) {
    hints.push(`换成${COOK_METHOD_LABEL[cm]}的做法`);
  }
  // 2. Oil level downgrade (high → mid/low or mid → low) reads as healthier
  const ro = rejected?.oil_level;
  const co = candidate?.oil_level;
  if (ro && co && LEVEL_RANK[co] < LEVEL_RANK[ro]) {
    hints.push(co === 'low' ? '更少油' : '油量下降');
  } else {
    // 3. Salt downgrade — second-priority health signal
    const rs = rejected?.salt_level;
    const cs = candidate?.salt_level;
    if (rs && cs && LEVEL_RANK[cs] < LEVEL_RANK[rs]) {
      hints.push(cs === 'low' ? '更清淡' : '盐量下降');
    }
  }
  // 4. Time delta (>=10min)
  const rt = getPrepTimeMin(rejected);
  const ct = getPrepTimeMin(candidate);
  if (rt && ct && Math.abs(rt - ct) >= 10 && hints.length < 2) {
    hints.push(ct < rt ? `快 ${rt - ct}min` : `慢 ${ct - rt}min`);
  }
  // 5. Cuisine differs — last-resort axis if nothing else surfaced
  if (hints.length === 0 && rejected?.origin_cuisine && candidate?.origin_cuisine
      && rejected.origin_cuisine !== candidate.origin_cuisine) {
    hints.push('换个菜系试试');
  }
  return hints.slice(0, 2).join(' · ');
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

// open-meteo weather_code → lucide-react icon component. Mirrors the LABEL
// map's bucketing (晴/多云/雾/雨/阵雨/雷雨). All used icons confirmed present
// in lucide-react 0.546.x, so no runtime fallback branch is needed.
const WEATHER_CODE_ICON: Record<number, React.ComponentType<{ size?: number; className?: string }>> = {
  0:  Sun,
  1:  CloudSun,
  2:  Cloud,            3:  Cloud,
  45: CloudFog,         48: CloudFog,
  51: CloudRain,        53: CloudRain,        55: CloudRain,
  61: CloudRain,        63: CloudRain,        65: CloudRain,
  80: CloudRainWind,    81: CloudRainWind,    82: CloudRainWind,
  95: CloudLightning,   96: CloudLightning,   99: CloudLightning,
};

// Renders the lucide icon for a given weather_code. Falls back to Cloud
// (neutral) for any code we haven't mapped — keeps the layout intact.
function WeatherIcon({ code, size = 14 }: { code: number; size?: number }) {
  const Icon = WEATHER_CODE_ICON[code] ?? Cloud;
  return <Icon size={size} className="inline-block align-[-2px]" />;
}

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

// TICKET-044 §B — 营养小贴士动态化（3 源轮播）：节气 + dietary_goal + IntentTag
const GOAL_TIP_MAP: Record<string, string> = {
  muscle_gain:  '今日蛋白质目标 90g — 推荐高蛋白主菜',
  weight_loss:  '减脂期 — 推荐高纤维 / 低油菜品',
  growth:       '孩子长高期 — 推荐补钙 + 优质蛋白',
  pregnancy:    '备孕 / 孕期 — 推荐叶酸 + 红肉补血',
  postpartum:   '哺乳期 — 推荐温补汤水 + 高蛋白',
  elder_care:   '老人养生 — 推荐易消化 + 低盐少油',
  balanced:     '均衡营养 — 优先 5 蛋白 + 12 食材覆盖',
  health:       '健康调理 — 节气食材优先',
};

function useDailyTip() {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [tipIdx, setTipIdx] = useState(0);

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
  const seasonalTip = weatherAdj || solarTerm.tip;

  // TICKET-044 §B source 2 — dietary_goal → tip from GOAL_TIP_MAP. Falls
  // through to '' when no goal set OR mapping missing (rotation skips it).
  const goalTip = (() => {
    try {
      // TICKET-075 §H — quickPrefs.goal 可能是 string[] (多选)，取 primary [0]。
      const rawGoal = JSON.parse(localStorage.getItem('quickPrefs') || '{}')?.goal;
      const primaryGoal = Array.isArray(rawGoal) ? rawGoal[0] : rawGoal;
      const goal = localStorage.getItem('nutri_dietary_goal') ?? primaryGoal ?? '';
      return GOAL_TIP_MAP[goal] ?? '';
    } catch { return ''; }
  })();

  // TICKET-044 §B source 3 — IntentTag chips from parseIntent累积 偏好。
  const intentTip = (() => {
    try {
      const bias = loadIntentBias();
      if (bias?.chips && bias.chips.length > 0) {
        return `你最近偏好：${bias.chips.slice(0, 3).join(' · ')}`;
      }
    } catch { /* non-critical */ }
    return '';
  })();

  const tips: string[] = [seasonalTip, goalTip, intentTip].filter(Boolean);

  // Rotate every 5s when there are ≥ 2 sources. Single-source = no rotation
  // (saves a setInterval and matches Day-9 behavior for users with only
  // seasonal tip available).
  useEffect(() => {
    if (tips.length <= 1) return;
    const id = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 5000);
    return () => clearInterval(id);
  }, [tips.length]);

  const tip = tips.length > 0 ? tips[tipIdx % tips.length] : '';

  return { solarTerm, weather, tip, tipSources: tips.length };
}

/**
 * TrialExpiredCard — shown on Home when a non-member's 30-day trial has
 * elapsed (TICKET-037: 老板 2026-05-23 拍板 trial 7→30 + 试用期全功能
 * 开放). Replaces the daily menu / weekend dining surface with a clear
 * upgrade card. Members and within-trial users never see this;
 * first-session new users are always within trial.
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
        30 天免费试用结束啦
      </h2>
      <p className="mt-3 text-white/90" style={{ fontSize: 13, lineHeight: 1.6 }}>
        感谢您这一个月用爱吃。<br />
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
  // Lightweight feedback when the user taps a cuisine pill — disables the
  // group for 200ms (anti double-tap) and shows a 500ms loading shimmer so
  // the transition reads as "switching" instead of an instant pop.
  const [cuisineSwitching, setCuisineSwitching] = useState(false);
  function handleCuisineSwitch(key: CuisineMode) {
    if (cuisineSwitching || key === cuisineMode) return;
    setCuisineSwitching(true);
    setCuisineMode(key);
    setTimeout(() => setCuisineSwitching(false), 500);
  }
  useEffect(() => {
    localStorage.setItem('home_cuisine_mode', cuisineMode);
    // Tell useWeeklyMenu to re-run with the new cuisine. The cache key
    // already changes, but the hook listens to this event to actually
    // re-read the cache and regenerate when needed.
    window.dispatchEvent(new Event('nutri-prefs-changed'));
  }, [cuisineMode]);

  // Smell 1 阶段 2 (v40): useRecommendDishes 链路已彻底删除；
  // useWeeklyMenu 是 Home 唯一菜单源（breakfast/lunch/dinner/fruit 全管）。
  // TICKET-040 §D — 周末访问自动取下周菜单 (老板真测周日 08:00 看到空白
  // 菜单+手动按钮反馈"今天是周日 应该是生成明天和下周的菜单"). 周菜单走
  // 5-day 工作日制 (周一-五), 周末家庭自由发挥, 所以周末看的应是"下周"计划.
  // 周一到周五 → weekOffset=0 (本周), 周末 → weekOffset=1 (下周).
  // getWeekStartISO(weekOffset) 已支持, useWeeklyMenu 接 weekOffset 参数.
  const { weeklyMenu, loading: weeklyLoading, regenerate: regenerateWeekly } = useWeeklyMenu(isWeekend() ? 1 : 0);
  // TICKET-022 §B — 5-channel TagBadge chip 上 production. Lookup keyed by
  // dish.id → SlotPlan from today's slots[]. Used to render badges on each
  // dish row in displayMenu so users see "为什么推这道" reasoning chips.
  const todaySlotsByDishId = useMemo(() => {
    const map: Record<string, { tagBadges: { kind: string; icon: string; label: string; reason?: string }[] }> = {};
    const today = weeklyMenu?.days?.[todayDayIndex() >= 5 ? 0 : todayDayIndex()];
    for (const sp of today?.slots ?? []) {
      if (sp.primary?.dish?.id) map[sp.primary.dish.id] = { tagBadges: sp.primary.tagBadges ?? [] };
    }
    return map;
    // weeklyMenu identity changes on regenerate / swap; that's the right cadence.
  }, [weeklyMenu]);

  // ── Language + cuisine prefs ─────────────────────────────────────
  const { language, cycleLanguage, isChinese, setLanguage, t, t4 } = useLanguage();
  // TICKET-037 §C — language picker overlay + post-switch toast. cycleLanguage
  // kept available as a fallback (we still wire the button to it on legacy
  // contexts that haven't migrated to the picker UX).
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  // TICKET-031 §B — 推广 share sheet (bottom drawer).
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [langSwitchToast, setLangSwitchToast] = useState<string | null>(null);
  function pickLanguage(target: Language) {
    setLangPickerOpen(false);
    if (target === language) return; // no-op selection
    setLanguage(target);
    // Toast text rendered in the NEW language so the user reads confirmation
    // in the script they just switched to.
    const TOAST: Record<Language, string> = {
      zh:        '已切换为简体中文',
      'zh-Hant': '已切換為繁體中文',
      en:        'Switched to English',
      tl:        'Lumipat sa Tagalog',
      id:        'Beralih ke Bahasa Indonesia',
    };
    setLangSwitchToast(TOAST[target] ?? `Switched to ${target}`);
    setTimeout(() => setLangSwitchToast(null), 2500);
  }

  // Single-language display: TICKET-029 upgraded to language-aware (zh / zh-Hant
  // / en / tl / id) via getDishTitle helper. zh-Hant now picks title_zh_hant
  // (Backend 022 §C ship). Old call signature stays (d: { title_zh?, title_en?,
  // title? }) so callers don't break — getDishTitle accepts the wider shape too.
  const dishTitle = (d: { title_zh?: string; title_zh_hant?: string; title_en?: string; title?: string }) =>
    getDishTitle(d, language);

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

    regenerateWeekly();
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

  // Dish ratings (1-tap 好吃 / 一般 / 不喜欢) — caches today's rated dish ids
  // in localStorage so the widget hides after the first tap per dish/day.
  // Backed by user_feedback_helper (Database migration 027). Errors swallowed.
  const ratingsTodayKey = `dish_rated_${getUserId() ?? 'anon'}_${new Date().toISOString().slice(0, 10)}`;
  const [ratedDishIds, setRatedDishIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(ratingsTodayKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  async function sendDishRating(dishId: string, rating: 'good' | 'okay' | 'bad') {
    setRatedDishIds(prev => {
      const next = new Set(prev); next.add(dishId);
      try { localStorage.setItem(ratingsTodayKey, JSON.stringify([...next])); } catch { /* quota — ignore */ }
      return next;
    });
    const payload = {
      user_id:       getUserId() ?? 'anonymous',
      dish_id:       dishId,
      feedback_type: rating === 'good' ? 'rating_good' : rating === 'okay' ? 'rating_okay' : 'rating_bad',
      locale:        language,
    };
    try {
      const { error } = await supabase.from('user_feedback_helper').insert(payload);
      if (error) await supabase.from('user_feedback_helper').insert(payload); // silent retry once
    } catch { /* silent fail — owner shouldn't see infra errors */ }
  }

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
  // TICKET-052 §A — "我做了" combo state. When the user marks a dinner /
  // lunch dish as eaten for the first time today, open a rating panel so
  // they can immediately tell us 😋/😐/😞. Dual write: toggleEaten +
  // (optional) sendDishRating — eatingDiary and user_feedback_helper
  // pipelines stay independent (per ticket "飞轮链路 100% 保留").
  const [ratingPanelDishId, setRatingPanelDishId] = useState<string | null>(null);
  // TICKET-056 §A — "为什么推荐这道菜" 抽屉 state. Stores the dish index (in
  // displayMenu.slice(0,5)) currently expanded; click same idx toggles closed.
  // Tolerant of missing dish.explanation — falls back to "暂无解释数据".
  const [expandedExplainIdx, setExpandedExplainIdx] = useState<number | null>(null);
  // TICKET-061 §B — β 反馈 banner (dismissable, localStorage 持久化)
  const [betaBannerShown, setBetaBannerShown] = useState<boolean>(
    () => localStorage.getItem('beta_banner_dismissed') !== 'true'
  );
  function dismissBetaBanner() {
    localStorage.setItem('beta_banner_dismissed', 'true');
    setBetaBannerShown(false);
  }

  // TICKET-063 §B — 节庆 in-app toast (mock, Day 17 接真 push API)
  // 检测 ±3 日节庆 → localStorage check 当年该节庆是否已 dismiss → 1s 后弹 toast。
  // Key 含年份 (festival_toast_<slug>_<year>) — 跨年同节庆自动重弹，无需 7 日清理逻辑。
  const [festivalToastSlug, setFestivalToastSlug] = useState<string | null>(null);
  const festivalSlugForToast = useActiveFestival();
  useEffect(() => {
    if (!festivalSlugForToast) return;
    const year = new Date().getFullYear();
    const dismissKey = `festival_toast_${festivalSlugForToast}_${year}`;
    if (localStorage.getItem(dismissKey) === 'true') return;
    const t = setTimeout(() => setFestivalToastSlug(festivalSlugForToast), 1000);
    return () => clearTimeout(t);
  }, [festivalSlugForToast]);
  function dismissFestivalToast() {
    if (festivalToastSlug) {
      const year = new Date().getFullYear();
      localStorage.setItem(`festival_toast_${festivalToastSlug}_${year}`, 'true');
    }
    setFestivalToastSlug(null);
  }
  // 节庆中心日距离今天的天数（用于"3 日后"文案；负数 = 已过、0 = 当日、正 = 将至）
  function getFestivalDaysOffset(slug: string): number {
    const map: Record<string, [number, number]> = {
      laba: [1, 17], chunjie: [2, 10], yuanxiao: [2, 24], duanwu: [6, 10],
      qixi: [8, 22], zhongqiu: [9, 29], chongyang: [10, 20],
    };
    const md = map[slug];
    if (!md) return 0;
    const now = new Date();
    const target = new Date(now.getFullYear(), md[0] - 1, md[1]);
    return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
  function handleToggleEaten(dishId: string) {
    const wasEaten = eatenSet.has(dishId);
    toggleEaten(dishId);
    // Open the rating panel only on the FIRST 我做了 tap, and only when
    // there's something to rate (午/晚 dishes; breakfast is excluded from
    // the rating flow per TICKET-008 design).
    if (!wasEaten && !ratedDishIds.has(dishId) && mealTime !== '早餐') {
      setRatingPanelDishId(dishId);
    }
    // TICKET-024 §B — DB meal_logs write on the FIRST eaten tap only (toggle
    // off does nothing — append-only table, "undo" requires explicit portion=0
    // insert which we don't surface in UI yet). Fire-and-forget; failure
    // silently swallowed (toggleEaten localStorage is the load-bearing path).
    if (!wasEaten) {
      logMealEaten({ dishId, mealType: mealTime }).catch(() => { /* silent */ });
    }
  }
  function handlePanelRate(dishId: string, rating: 'good' | 'okay' | 'bad') {
    sendDishRating(dishId, rating);
    setRatingPanelDishId(null);
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
        .select("id, invite_code, household_members(helper_id, user_profiles!helper_id(display_name))")
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
            // First time — create household. Surface insert errors instead of
            // silently dropping (B-2 §A2): RLS or constraint failures should
            // not be hidden — the user-facing helper-name / invite-code area
            // will stay blank but the error reaches devtools for triage.
            const { data: created, error } = await supabase
              .from("households")
              .insert({ employer_id: userId })
              .select("id, invite_code")
              .single();
            if (error) {
              console.error("households insert failed", error);
            } else if (created) {
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

  // ── Smell 1 阶段 2 (v40 phase 1 / v57 phase 2): breakfast / fruit / lunch /
  // dinner 全部来自 weeklyMenu.days[todayIdx]。v57 起 fruit / breakfast 优先
  // 走新 slots[] 接口 (TICKET-018) 让 UI 拿到 candidates + tagBadges；当 slots
  // undefined (loadFromDB 命中旧缓存场景) 时 fallback 旧字段保不破。
  // useRecommendDishes / pickBreakfastCombo 链路已彻底删除。
  const todayWeekly = weeklyMenu?.days[todayIdx];
  const breakfastFromSlots = todayWeekly?.slots
    ?.filter(s => s.slotType === 'breakfast')
    .map(s => s.primary.dish);
  const breakfastDishes = (breakfastFromSlots && breakfastFromSlots.length > 0)
    ? breakfastFromSlots
    : (todayWeekly?.breakfastDishes ?? []);
  const fruitFromSlots = todayWeekly?.slots?.find(s => s.slotType === 'fruit')?.primary?.dish;
  const fruitFromWeekly = fruitFromSlots ?? todayWeekly?.fruitDish;

  // §A (TICKET-020) lunch / dinner 也切 slots[].primary 投影. slots 命中 → 取
  // primary list (顺序按 generateWeekPlan 采样顺序), 缺失 fallback 旧字段 (loadFromDB
  // 命中旧 v57 缓存或 generateWeekPlan 未填 slots 时不破)。
  const lunchFromSlots = todayWeekly?.slots
    ?.filter(s => s.slotType === 'lunch_main' || s.slotType === 'lunch_side')
    .map(s => s.primary.dish);
  const lunchDishes = (lunchFromSlots && lunchFromSlots.length > 0)
    ? lunchFromSlots
    : (todayWeekly?.lunchDishes ?? []);
  const dinnerFromSlots = todayWeekly?.slots
    ?.filter(s =>
      s.slotType === 'dinner_main' ||
      s.slotType === 'dinner_side' ||
      s.slotType === 'dinner_kid'
    )
    .map(s => s.primary.dish);
  const dinnerDishes = (dinnerFromSlots && dinnerFromSlots.length > 0)
    ? dinnerFromSlots
    : (todayWeekly?.dishes ?? []);

  const baseMenu: any[] = (() => {
    if (mealTime === "早餐") {
      return breakfastDishes;
    }
    if (mealTime === "午餐") {
      if (lunchDishes.length === 0) return [];
      return fruitFromWeekly ? [...lunchDishes, fruitFromWeekly] : lunchDishes;
    }
    // 晚餐
    if (dinnerDishes.length === 0) return [];
    return fruitFromWeekly ? [...dinnerDishes, fruitFromWeekly] : dinnerDishes;
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
  const festivalSlug = useActiveFestival();
  const festivalInfo = festivalSlug
    ? (FESTIVAL_LABEL[festivalSlug] ?? { name: festivalSlug, icon: '🎉', chips: [] })
    : null;

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

  // TICKET-048 §A+§B — 撤 042 §A "整个 home 替换为餐厅页" (老板拍板 home 老 layout
  // 必须 100% 保留 + 周末只在顶部追加餐厅 section). 每卡加"查看 →"链接.
  const RESTAURANTS_048 = [
    { emoji: '🍱', name: '家附近茶餐厅', desc: '港式快靓正, 老少咸宜',    reason: '🍃 偏清淡, 这家清蒸好',    url: 'https://www.google.com/maps/search/茶餐厅', color: 'rgba(255,90,31,0.10)'  },
    { emoji: '🍜', name: '街角面馆',     desc: '汤鲜面爽, 一人 30 元搞定', reason: '🥩 本周已 4 道猪肉, 换换', url: 'https://www.google.com/maps/search/面馆',   color: 'rgba(34,197,94,0.10)'  },
    { emoji: '🍣', name: '日料居酒屋',   desc: '换换口味, 周末小确幸',     reason: '🐟 本周缺海鲜, 补一顿',    url: 'https://www.google.com/maps/search/日料',   color: 'rgba(59,130,246,0.10)' },
    { emoji: '🥘', name: '川菜小馆',     desc: '麻辣过瘾, 全家解馋',       reason: '🌶️ 因为爸爸爱辣',           url: 'https://www.google.com/maps/search/川菜',   color: 'rgba(236,72,153,0.10)' },
    { emoji: '🍕', name: '社区比萨店',   desc: '孩子最爱, 周末欢乐时光',   reason: '🎒 孩子学校缺主食日',      url: 'https://www.google.com/maps/search/比萨',   color: 'rgba(168,85,247,0.10)' },
  ];
  const weekendSection = isWeekend() ? (
    <div className="px-4 pt-4 pb-2">
      <p className="font-bold uppercase tracking-[0.20em]" style={{ fontSize: 11, color: '#FF8C54' }}>
        {t('Weekend', '周末')}
      </p>
      <h2 className="font-serif font-black mt-1 leading-tight" style={{ fontSize: 22, color: '#1a1a1a', letterSpacing: '-0.01em' }}>
        {t('Family time, eat out', '周末家庭自由发挥')}
      </h2>
      <p className="mt-1 text-zinc-500" style={{ fontSize: 12 }}>
        {t('Recommended spots · tap to view', '为您推荐这几家餐厅 · 点查看')}
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        {RESTAURANTS_048.map(r => (
          <div key={r.name} className="rounded-2xl px-3 py-2.5"
            style={{ background: r.color, border: '1px solid rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-2.5">
              <span style={{ fontSize: 26 }}>{r.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ fontSize: 13, color: '#1a1a1a' }}>{r.name}</p>
                <p className="text-zinc-500 truncate" style={{ fontSize: 11 }}>{r.desc}</p>
              </div>
              <a href={r.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-0.5 px-2.5 py-1 rounded-full active:scale-95 flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.7)', fontSize: 11, color: '#FF5A1F', fontWeight: 700 }}>
                {t('View', '查看')}
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
              </a>
            </div>
            <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.05)', fontSize: 10, color: '#555' }}>
              {r.reason}
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => navigate('/weekly')}
        className="mt-3 w-full py-2.5 rounded-xl font-bold text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1"
        style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 13, boxShadow: '0 4px 14px rgba(255,90,31,0.25)' }}>
        {t('Next week menu', '查看下周菜单')}
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
      </button>
    </div>
  ) : null;

  return (
    <div className="min-h-screen max-w-md mx-auto relative"
      style={{
        background: "linear-gradient(180deg, #FAF6F0 0%, #F4EEE3 100%)",
        paddingBottom: 100,
      }}>

      {/* TICKET-048 §B — 周末顶部追加餐厅推荐 section (老板拍板"home 老 layout 100%
          保留 + 周末追加"). 工作日不显此 section. 每卡含 "查看 →" 链接跳 Google Maps. */}
      {weekendSection}

      {/* TICKET-061 §B — β 反馈提示 banner (dismissable + localStorage 持久化)
          仅 β 阶段显示；关闭后 localStorage.beta_banner_dismissed=true 永久不再显示。 */}
      {betaBannerShown && (
        <div
          className="mx-3 mt-2 rounded-2xl px-3 py-2.5 flex items-start gap-2"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
            background: "linear-gradient(135deg, rgba(255,90,31,0.10), rgba(255,179,71,0.18))",
            border: "1px solid rgba(255,90,31,0.20)",
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>🧪</span>
          <p className="flex-1 leading-snug" style={{ fontSize: 12, color: "rgba(0,0,0,0.75)" }}>
            欢迎试用 <span className="font-bold" style={{ color: "#FF5A1F" }}>β 版</span>！碰到问题去
            <button
              onClick={() => navigate('/settings')}
              className="font-bold mx-0.5 underline underline-offset-2"
              style={{ color: "#FF5A1F" }}
            >
              设置 &gt; 联系客服
            </button>
            给我反馈。
          </p>
          <button
            onClick={dismissBetaBanner}
            className="active:scale-90 transition-transform"
            aria-label="关闭 β 反馈提示"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.45)" }}>
              close
            </span>
          </button>
        </div>
      )}

      {/* ── Editorial header — warm paper, serif greeting ─────────── */}
      <header style={{ paddingTop: betaBannerShown ? 0 : "env(safe-area-inset-top, 44px)" }}>
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
              {greeting}，<span style={{ color: "#FF5A1F" }}>{t4("let's eat", '开饭啦', 'kain na', "ayo makan")}</span>
            </h1>
            {/* Solar term + weather as a single inline row, no chip clutter */}
            <p className="mt-2 flex items-center gap-2 flex-wrap" style={{ fontSize: 11.5, color: "rgba(0,0,0,0.55)" }}>
              <span className="font-bold" style={{ color: "#FF5A1F" }}>{solarTerm.icon} {solarTerm.name}</span>
              {weather && (
                <>
                  <span style={{ color: "rgba(0,0,0,0.18)" }}>·</span>
                  <span className="inline-flex items-center gap-1">
                    {weather.temp}°C <WeatherIcon code={weather.code} size={14} /> {weather.label}
                  </span>
                </>
              )}
            </p>
            {tip && (
              <p className="mt-1" style={{ fontSize: 11.5, color: "rgba(0,0,0,0.42)", lineHeight: 1.55, fontStyle: "italic" }}>
                {tip}
              </p>
            )}
            {/* §B (TICKET-027) Festival banner — only renders when getCurrentFestival
                returns a slug (±3 days from one of the 7 festivals). Tap → /weekly
                so the user lands on this week's menu (where Algorithm 025 axis 27
                has already biased festival_tags +0.4 for matching dishes). */}
            {festivalInfo && (
              <button
                onClick={() => navigate('/weekly')}
                className="mt-2 w-full rounded-2xl px-3 py-2 flex items-center gap-2 active:scale-[0.99] transition-transform text-left"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,90,31,0.10), rgba(255,179,71,0.18))',
                  border: '1px solid rgba(255,90,31,0.20)',
                }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{festivalInfo.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate" style={{ fontSize: 12, color: '#1a1a1a' }}>
                    {t4(
                      `${festivalInfo.name} coming up`,
                      `${festivalInfo.name}将至`,
                      `Paparating ang ${festivalInfo.name}`,
                      `${festivalInfo.name} akan tiba`,
                    )}
                  </p>
                  {festivalInfo.chips.length > 0 && (
                    <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.55)', marginTop: 1 }}>
                      {t4('Recommended', '推荐', 'Inirerekomenda', 'Direkomendasikan')} {festivalInfo.chips.join(' · ')}
                    </p>
                  )}
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#FF5A1F' }}>
                  arrow_forward_ios
                </span>
              </button>
            )}
          </div>

          {/* Header action stack: language picker on top, QR scan below */}
          <div className="flex flex-col items-end gap-2 shrink-0 relative">
            {/* §C (TICKET-037) Language picker — tap opens 4-language grid
                popover instead of single-cycle. cycleLanguage kept available
                as ALT+click for power users / a11y. */}
            <button
              onClick={() => setLangPickerOpen(o => !o)}
              onAuxClick={cycleLanguage}
              className="px-3 h-8 rounded-full flex items-center justify-center gap-1 font-bold active:scale-95 transition-transform"
              style={{ background: "white", boxShadow: "0 4px 14px rgba(0,0,0,0.06)", fontSize: 11, color: "#1a1a1a", minWidth: 56 }}
              title="切换语言 / Switch language"
            >
              {LANGUAGE_LABEL[language]}
              <span className="material-symbols-outlined" style={{
                fontSize: 14, color: "rgba(0,0,0,0.4)",
                transition: "transform 0.2s",
                transform: langPickerOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}>expand_more</span>
            </button>
            {langPickerOpen && (
              <>
                {/* tap-outside backdrop */}
                <div className="fixed inset-0 z-30" onClick={() => setLangPickerOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 rounded-2xl p-2 grid grid-cols-3 gap-1.5"
                  style={{ background: 'white', boxShadow: '0 14px 38px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.06)', minWidth: 220 }}>
                  {/* TICKET-070 §A — 按 role 限制 3 种（雇主 简/繁/EN，菲佣 EN/tl/id） */}
                  {((): { key: 'zh' | 'zh-Hant' | 'en' | 'tl' | 'id'; label: string }[] => {
                    const r = localStorage.getItem('nutri_role');
                    if (r === 'helper') {
                      return [
                        { key: 'en', label: 'EN'      },
                        { key: 'tl', label: 'Tagalog' },
                        { key: 'id', label: 'Bahasa'  },
                      ];
                    }
                    return [
                      { key: 'zh',      label: '简体' },
                      { key: 'zh-Hant', label: '繁體' },
                      { key: 'en',      label: 'EN'   },
                    ];
                  })().map(({ key, label }) => {
                    const active = key === language;
                    return (
                      <button key={key} onClick={() => pickLanguage(key)}
                        className="px-3 py-2 rounded-xl font-bold active:scale-95 transition-all"
                        style={{
                          background: active ? '#FF5A1F' : 'rgba(0,0,0,0.04)',
                          color:      active ? 'white' : '#1a1a1a',
                          fontSize:   12,
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {/* TICKET-031 §B — 推广 share button (老板拓客起点).
                点击 toggle 底部 sheet (Sheet 内嵌 ShareCard). */}
            <button
              onClick={() => setShareSheetOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: 'white', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
              title={isChinese ? '推广 Aieats' : 'Share Aieats'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#FF5A1F' }}>ios_share</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-4 pt-2 pb-4 px-4">

        {/* Trial-expired gate (TICKET-037: 30-day trial). Non-members whose
            30-day 试用期 has elapsed see a paywall card in place of any
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
        <InviteFamilySheet />

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
                  {/* TICKET-030 §A — meal tab i18n: zh native, en simple labels */}
                  {isChinese
                    ? m
                    : (m === '早餐' ? 'Breakfast' : m === '午餐' ? 'Lunch' : 'Dinner')}
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
              ] as const).map(({ key, label }) => {
                const active = cuisineMode === key;
                const loading = cuisineSwitching && active;
                return (
                  <button key={key} onClick={() => handleCuisineSwitch(key)}
                    disabled={cuisineSwitching}
                    className="px-2.5 py-1 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-60 inline-flex items-center gap-1"
                    style={{
                      fontSize: 11.5,
                      background: active ? "white" : "transparent",
                      color: active ? "#1a1a1a" : "rgba(0,0,0,0.42)",
                      boxShadow: active ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                    }}>
                    {loading && (
                      <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {label}
                  </button>
                );
              })}
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
                Smell 1 阶段 2 (v40)：所有 meal tab 统一跟随 weeklyMenu
                loading（generateWeekPlan 一次性输出 breakfast/lunch/dinner/fruit）。
                id="today-menu-anchor" is the scroll target for TICKET-034 §B
                onboarding success banner ("✓ 完成！今天给你推荐的 5 道菜在下方 →"). */}
            <div id="today-menu-anchor" className="px-5 pt-2 pb-1">
              {weeklyLoading ? (
                <div className="flex flex-col gap-4 py-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex items-center gap-4 animate-pulse"
                      style={{ animationDelay: `${i * 100}ms` }}>
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
                        {/* TICKET-022 §B — 5-channel TagBadge chip row (max 2 per dish per Algorithm cap).
                            Sourced from todaySlotsByDishId (today's SlotPlan primary.tagBadges).
                            Renders nothing when dish has no slot entry — safe for fallback dishes. */}
                        {(() => {
                          const slotEntry = dish?.id ? todaySlotsByDishId[dish.id] : null;
                          const badges = slotEntry?.tagBadges as TagBadge[] | undefined;
                          return badges && badges.length > 0
                            ? <TagBadgeRow badges={badges} />
                            : null;
                        })()}
                        {/* TICKET-052 §A — 常驻 3-emoji rating bar removed.
                            Rating now lives inside the popup that opens when
                            the user taps "✅ 我做了" (check_circle) above. */}
                        {/* TICKET-056 §A — 为什么推荐这道菜 chip + breakdown.
                            Always-visible chip (tiny "为什么 ⓘ"); when expanded
                            shows the explanation.breakdown list inline. Tolerant
                            of missing explanation field (e.g. cached menu before
                            Algorithm 055 landed) — falls back to "暂无解释数据". */}
                        {(() => {
                          const isOpen = expandedExplainIdx === idx;
                          return (
                            <div className="mt-1.5">
                              <button
                                onClick={() => setExpandedExplainIdx(isOpen ? null : idx)}
                                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-bold active:scale-95 transition-all"
                                style={{
                                  fontSize: 10.5,
                                  background: isOpen ? 'rgba(255,90,31,0.12)' : 'rgba(0,0,0,0.04)',
                                  color:      isOpen ? '#FF5A1F' : 'rgba(0,0,0,0.50)',
                                }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>info</span>
                                为什么推荐
                                <span className="material-symbols-outlined"
                                  style={{ fontSize: 13, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                  expand_more
                                </span>
                              </button>
                              {isOpen && (() => {
                                const exp = (dish as any).explanation as
                                  { score?: number; breakdown?: { axis_icon?: string; reason?: string; score_delta?: number }[] } | undefined;
                                const breakdown = exp?.breakdown ?? [];
                                if (breakdown.length === 0) {
                                  return (
                                    <p className="mt-1.5 px-1" style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.40)', fontStyle: 'italic' }}>
                                      暂无解释数据（菜单可能在 Algorithm 升级前缓存，下次重新生成后生效）
                                    </p>
                                  );
                                }
                                return (
                                  <div className="mt-1.5 rounded-xl px-3 py-2 flex flex-col gap-1"
                                    style={{ background: 'rgba(255,90,31,0.04)', border: '1px solid rgba(255,90,31,0.12)' }}>
                                    {breakdown.map((hit, hi) => (
                                      <div key={hi} className="flex items-center gap-2" style={{ fontSize: 11 }}>
                                        <span style={{ fontSize: 13 }}>{hit.axis_icon ?? '•'}</span>
                                        <span className="flex-1 truncate" style={{ color: 'rgba(0,0,0,0.70)' }}>
                                          {hit.reason ?? '—'}
                                        </span>
                                        <span style={{
                                          color: (hit.score_delta ?? 0) >= 0 ? '#16A34A' : '#DC2626',
                                          fontWeight: 700,
                                        }}>
                                          {(hit.score_delta ?? 0) >= 0 ? '+' : ''}{(hit.score_delta ?? 0).toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                    {typeof exp?.score === 'number' && (
                                      <div className="flex items-center justify-between pt-1 mt-0.5 border-t border-black/[0.05]"
                                        style={{ fontSize: 10.5 }}>
                                        <span style={{ color: 'rgba(0,0,0,0.40)' }}>总分</span>
                                        <span style={{ color: '#FF5A1F', fontWeight: 700 }}>{exp.score.toFixed(2)}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </div>
                      {/* Top-right action cluster — hoisted out of the inline
                          flow so the title can use the full row width. Compact
                          14px icons in 24px hit-targets keep the cluster
                          unobtrusive at the corner. */}
                      <div className="absolute top-1.5 right-1 flex items-center gap-0 z-10">
                        <HeartButton dish={dish} sourceTag={mealTime} size={14} className="!p-1.5" />
                        {/* TICKET-052 §A — "✅ 我做了" combo: 1st tap toggles
                            eatingDiary AND opens the rating panel for first-time
                            午/晚 dishes. Repeat tap untoggles eaten (no panel).
                            Already-rated dishes show check + tooltip 今天已做
                            instead of re-opening the rating panel. */}
                        <button onClick={() => handleToggleEaten(dish.id)}
                          className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                          style={{
                            background: eatenSet.has(dish.id) ? 'rgba(22,163,74,0.15)' : 'transparent',
                          }}
                          title={
                            eatenSet.has(dish.id)
                              ? (ratedDishIds.has(dish.id) ? t('Done today', '今天已做') : t('Ate · tap to undo', '已吃 · 点击取消'))
                              : t('I made this (tap to rate after)', '我做了 (做完点这里评分)')
                          }>
                          <span className="material-symbols-outlined" style={{
                            fontSize: 14,
                            color: eatenSet.has(dish.id) ? '#16A34A' : 'rgba(0,0,0,0.40)',
                            fontVariationSettings: eatenSet.has(dish.id) ? "'FILL' 1" : "'FILL' 0",
                          }}>{eatenSet.has(dish.id) ? 'check_circle' : 'radio_button_unchecked'}</span>
                        </button>
                        <button onClick={() => openSwapDrawer(idx)}
                          className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                          title="换一道 / 直接不要">
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "rgba(0,0,0,0.40)" }}>sync_alt</span>
                        </button>
                        {/* TICKET-052 §0 — ✕ delete button removed. The "直接不要"
                            option now lives inside the swap drawer panel below,
                            consolidating "我不想吃这道" intents into one CTA. */}
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

        {/* TICKET-051 §0 hot-fix — removed duplicate seasonal/时辰/weather strip
            above the nutrition card. The same info already shows in the page
            header (solar term + WeatherIcon + label) — keeping both produced
            "立夏 · 申时 · 小雨" twice on screen. Header copy stays as the
            single source of truth. */}

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

        {/* TICKET-071 §A — Home 营养雷达卡已删除，统一放到 /weekly 单独看
            (避免 Home 重复 UI noise)。详情入口仍可点 "工作日导航 → 本周菜单"
            或 BottomTabBar 进 /weekly. */}

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

        {/* TICKET-074 §F — Home 内嵌 Pro 推广卡已删除（避免与 Settings
            MembershipCard 重复 CTA）。Home 顶部 TrialExpiredCard (line ~1138)
            仍保留作为 30 天试用过期的提示 banner — 它是 expected 终结提示，
            不是推广。 */}

        </>}  {/* end of weekday fragment — closes the isWeekend ternary */}

        </>)}  {/* end of trial-expired ternary wrap */}
      </main>

      <IntentRegenModal
        open={intentModalOpen}
        onClose={() => {
          setIntentModalOpen(false);
          // Refresh today's recommendations so newly saved intent takes effect
          regenerateWeekly();
        }}
      />

      {/* TICKET-063 §B — 节庆 in-app toast (mock; Day 17 接真 push API).
          ±3 日节庆窗口内 mount 1s 后弹；点击跳 /weekly；✕ 永久 dismiss 当年此节庆。 */}
      {festivalToastSlug && FESTIVAL_LABEL[festivalToastSlug] && (() => {
        const info = FESTIVAL_LABEL[festivalToastSlug];
        const offset = getFestivalDaysOffset(festivalToastSlug);
        const whenLabel = offset > 0 ? `${offset} 日后` : offset === 0 ? '今天' : `${-offset} 日前`;
        return (
          <div
            className="fixed left-3 right-3 z-[70] rounded-2xl shadow-2xl"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 16px) + 140px)',
              background: 'linear-gradient(135deg, #FFB347 0%, #FF8C54 60%, #FF5A1F 100%)',
              boxShadow: '0 12px 36px rgba(255,90,31,0.40)',
              maxWidth: 'calc(100vw - 24px)',
            }}
          >
            <button
              onClick={() => { dismissFestivalToast(); navigate('/weekly'); }}
              className="w-full text-left p-3.5 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 28, lineHeight: 1 }}>{info.icon}</span>
                <div className="flex-1 min-w-0 text-white">
                  <p className="font-bold text-[13.5px] leading-snug">
                    {info.name}{offset > 0 ? '将至' : offset === 0 ? '到了' : ''}（{whenLabel}）
                  </p>
                  <p className="text-[11.5px] opacity-95 mt-0.5">
                    我们为你备好了 {info.chips.length} 道节庆菜，去看 →
                  </p>
                </div>
              </div>
            </button>
            <button
              onClick={dismissFestivalToast}
              className="absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: 'rgba(255,255,255,0.20)' }}
              aria-label="关闭节庆提醒"
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>close</span>
            </button>
          </div>
        );
      })()}

      {/* Floating chat entry — sits above the bottom tab bar (z above the
          tab bar's z-50). Single tap opens /chat?mode=today (SPEC §5
          default). Hidden for helper role (the BottomTabBar already hides
          itself for helpers; mirror that here so the FAB doesn't dangle). */}
      {localStorage.getItem('nutri_role') !== 'helper' && (
        <button
          onClick={() => navigate('/chat?mode=today')}
          className="fixed z-[60] w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{
            right: 16,
            bottom: 'calc(env(safe-area-inset-bottom, 16px) + 72px)',
            background: '#FF5A1F',
            boxShadow: '0 8px 24px rgba(255,90,31,0.35)',
          }}
          title={t4('Chat with AI about menu', '跟 AI 聊菜单', 'Mag-chat sa AI tungkol sa menu', 'Ngobrol AI tentang menu')}
        >
          <span className="material-symbols-outlined text-white"
            style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>
            chat
          </span>
        </button>
      )}

      <BottomTabBar />

      {/* TICKET-031 §B — 推广 ShareCard bottom sheet (拓客起点). 点击 share icon
          → 弹底部 drawer; backdrop tap dismiss; ESC 留给系统. */}
      {shareSheetOpen && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setShareSheetOpen(false)}
            style={{ background: 'rgba(0,0,0,0.40)' }} />
          <div className="fixed left-0 right-0 bottom-0 z-[81] max-w-md mx-auto rounded-t-3xl shadow-2xl"
            style={{ background: 'white', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
            <div className="px-5 pt-4 pb-3 border-b border-black/[0.06] flex items-center justify-between">
              <p className="font-bold" style={{ fontSize: 15, color: '#1a1a1a' }}>
                {isChinese ? '推广 Aieats' : 'Share Aieats'}
              </p>
              <button onClick={() => setShareSheetOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                style={{ background: 'rgba(0,0,0,0.05)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>close</span>
              </button>
            </div>
            <div className="p-4">
              <ShareCard />
            </div>
          </div>
        </>
      )}

      {/* §C (TICKET-037) Language switch toast — floats above BottomTabBar.
          Auto-dismisses after 2.5s; one-line text rendered in the NEW language
          so the user reads confirmation in the script they just switched to. */}
      {langSwitchToast && (
        <div
          className="fixed left-1/2 z-[70] px-4 py-2.5 rounded-full font-bold pointer-events-none"
          style={{
            transform: 'translateX(-50%)',
            bottom: 'calc(env(safe-area-inset-bottom, 16px) + 140px)',
            background: 'rgba(0,0,0,0.85)',
            color: 'white',
            fontSize: 12.5,
            boxShadow: '0 8px 22px rgba(0,0,0,0.20)',
            maxWidth: '85%',
            textAlign: 'center',
          }}
        >
          {langSwitchToast}
        </div>
      )}

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
              ) : swapOptions.map(opt => {
                const rejected = swappingDishIndex !== null ? displayMenu[swappingDishIndex] : null;
                const reason = rejected ? getSwapReasonHint(rejected, opt) : '';
                return (
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
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ fontSize: 15 }}>{dishTitle(opt)}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="inline-block px-2 py-0.5 rounded-md font-bold"
                        style={{ fontSize: 10, background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.4)" }}>
                        {opt.type}
                      </span>
                      {reason && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md font-bold"
                          style={{ fontSize: 10, background: "rgba(255,90,31,0.10)", color: "#FF5A1F" }}
                          title="为什么推荐这道">
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>auto_awesome</span>
                          {reason}
                        </span>
                      )}
                    </div>
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
                );
              })}
            </div>
            <button
              className="w-full h-14 rounded-2xl font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-40"
              style={{ fontSize: 16, background: "#2D3748" }}
              onClick={handleSwapConfirm}
              disabled={isSwapLoading || !selectedSwap}>
              确认换菜
            </button>
            {/* TICKET-052 §0 — 3-option footer absorbs the deleted ✕ button. */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  if (swappingDishIndex !== null) {
                    const dish = displayMenu[swappingDishIndex];
                    if (dish?.id) hideDish(dish.id);
                  }
                  setIsSwapOpen(false);
                }}
                className="flex-1 h-11 rounded-2xl font-bold active:scale-[0.98]"
                style={{ background: 'rgba(220,38,38,0.10)', color: '#DC2626', fontSize: 13 }}>
                直接不要
              </button>
              <button
                onClick={() => setIsSwapOpen(false)}
                className="flex-1 h-11 rounded-2xl font-bold active:scale-[0.98]"
                style={{ background: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TICKET-052 §A — Rating panel popup triggered by "✅ 我做了". Tapping
          outside or "跳过" dismisses without rating (eaten state already
          persisted). 3 emoji buttons close the panel + POST user_feedback_helper.
          §B tooltip subtitle "告诉算法你的口味，下次更懂你" sits under title. */}
      {ratingPanelDishId && (
        <div className="fixed inset-0 z-[105] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setRatingPanelDishId(null)} />
          <div className="relative bg-white w-full max-w-md mx-auto rounded-t-[28px] pt-4 pb-8 px-6 shadow-2xl">
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(0,0,0,0.10)' }} />
            <p className="text-center font-bold" style={{ fontSize: 18 }}>做完啦！怎么样？</p>
            <p className="text-center" style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
              告诉算法你的口味，下次更懂你
            </p>
            <div className="flex justify-around mt-5 mb-3">
              {([
                { v: 'good' as const, e: '😋', t: '好吃' },
                { v: 'okay' as const, e: '😐', t: '一般' },
                { v: 'bad'  as const, e: '😞', t: '不喜欢' },
              ]).map(({ v, e, t }) => (
                <button key={v}
                  onClick={() => handlePanelRate(ratingPanelDishId, v)}
                  className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
                  style={{ minWidth: 64 }}>
                  <span style={{ fontSize: 44, lineHeight: 1 }}>{e}</span>
                  <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', fontWeight: 600 }}>{t}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setRatingPanelDishId(null)}
              className="w-full mt-2 py-2.5 rounded-2xl font-bold active:scale-[0.98]"
              style={{ background: 'rgba(0,0,0,0.04)', color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>
              跳过
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
                                  {getDishTitle(dish, language)}
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
// TICKET-044 §A — Invite-family share sheet. Collapsed by default to a small
// "+ 邀请家人加入" pill; expanded shows the invite_code, a copyable link,
// native Web Share (Android / iOS Safari → WhatsApp / Messages / etc), and
// a manual-copy fallback for WeChat 公众号 webview (no native share).
// Invite code is sourced from localStorage 'nutri_invite_code' if present,
// otherwise minted client-side (6-char Crockford-ish alphabet) and persisted.
// Real households.invite_code DB sync is Database 部门 backlog.
function InviteFamilySheet() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [inviteCode] = useState<string>(() => {
    try {
      const existing = localStorage.getItem('nutri_invite_code');
      if (existing && existing.length >= 4) return existing;
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
      const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      localStorage.setItem('nutri_invite_code', code);
      return code;
    } catch { return 'XXXXXX'; }
  });
  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join?code=${inviteCode}`
    : `/join?code=${inviteCode}`;
  const isWxMp = typeof window !== 'undefined' && localStorage.getItem('nutri_source') === 'wx_mp';
  const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';

  function copyTo(text: string, label: string) {
    try {
      navigator.clipboard?.writeText(text).then(() => {
        setToast(`${label}已复制`);
        setTimeout(() => setToast(null), 2000);
      }).catch(() => { setToast('复制失败，请长按手动选择'); setTimeout(() => setToast(null), 2500); });
    } catch { setToast('复制不可用'); setTimeout(() => setToast(null), 2000); }
  }

  async function nativeShare() {
    try {
      await (navigator as any).share({
        title: '一起加入爱吃家庭',
        text: `用我的邀请码 ${inviteCode} 加入家庭菜单`,
        url:   inviteUrl,
      });
    } catch { /* user cancelled / not available */ }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full rounded-2xl px-4 py-2.5 flex items-center gap-2 active:scale-[0.99] transition-transform"
        style={{
          background: 'linear-gradient(135deg, rgba(255,90,31,0.08), rgba(255,140,84,0.04))',
          border: '1px solid rgba(255,90,31,0.18)',
        }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#FF5A1F' }}>group_add</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a1a' }}>邀请家人 / 菲佣加入家庭</span>
        <span className="material-symbols-outlined ml-auto" style={{ fontSize: 16, color: 'rgba(0,0,0,0.30)' }}>expand_more</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'rgba(255,90,31,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>邀请新成员加入</p>
        <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: 'rgba(0,0,0,0.05)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
        </button>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {/* Code card — big readable code (kerned) + small URL preview */}
        <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(255,90,31,0.06)', border: '1px dashed rgba(255,90,31,0.20)' }}>
          <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.42)', letterSpacing: '0.16em' }}>邀请码</p>
          <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: 6, color: '#FF5A1F', lineHeight: 1.2, marginTop: 2 }}>
            {inviteCode}
          </p>
          <p className="truncate" style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>{inviteUrl}</p>
        </div>
        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => copyTo(inviteCode, '邀请码')}
            className="rounded-xl py-2 font-bold active:scale-95"
            style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F', fontSize: 12 }}>
            复制邀请码
          </button>
          <button onClick={() => copyTo(inviteUrl, '邀请链接')}
            className="rounded-xl py-2 font-bold active:scale-95"
            style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F', fontSize: 12 }}>
            复制邀请链接
          </button>
          {canShare && (
            <button onClick={nativeShare}
              className="rounded-xl py-2 font-bold text-white active:scale-95 col-span-2"
              style={{ background: '#25D366', fontSize: 12 }}>
              <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: 14 }}>share</span>
              分享 (WhatsApp / Messages / …)
            </button>
          )}
          {isWxMp && (
            <button onClick={() => copyTo(inviteUrl, '微信邀请链接')}
              className="rounded-xl py-2 font-bold text-white active:scale-95 col-span-2"
              style={{ background: '#07C160', fontSize: 12 }}>
              <span className="align-middle mr-1">💬</span>
              微信邀请（复制后粘贴给家人）
            </button>
          )}
        </div>
        <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.40)', textAlign: 'center', lineHeight: 1.5 }}>
          家人 / 菲佣打开链接或输入邀请码即可加入这个家庭菜单。
        </p>
      </div>
      {toast && (
        <div className="px-4 pb-2.5 text-center" style={{ fontSize: 11.5, color: '#15803D', fontWeight: 600 }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}

// TICKET-034 §B — Onboarding 3-step progress + success banner.
// Steps: 1) 家庭成员 (members filled) → 2) 饮食偏好 (dietary goal / quickPrefs set)
//        → 3) 完工享受推荐 (both prerequisites met)
// When all 3 steps complete the card flips to a one-time success banner that
// auto-scrolls to id="today-menu-anchor"; persisted via `onboarding_done`.
function FamilyMemberNudge() {
  const navigate = useNavigate();
  const [shouldShow, setShouldShow] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [stepDone, setStepDone] = useState({ family: false, diet: false });

  useEffect(() => {
    const kids = parseInt(localStorage.getItem("nutri_kids") ?? "0", 10) || 0;
    const adults = parseInt(localStorage.getItem("nutri_adults") ?? "0", 10) || 0;
    const expected = adults + kids;
    if (kids <= 0) return; // 没小孩，nudge 无意义（与旧逻辑一致）
    if (localStorage.getItem("nutri_family_nudge_v1") === "dismissed") return;
    if (localStorage.getItem("onboarding_done") === "1") return; // 已收尾，永不再显示

    const members = loadFamilyMembers();
    const familyDone = expected > 0 && members.length >= expected;
    const dietDone = !!(
      localStorage.getItem("nutri_dietary_goal") ||
      localStorage.getItem("quickPrefs") ||
      localStorage.getItem("taste_pref")
    );
    setStepDone({ family: familyDone, diet: dietDone });

    // 两步都完成 → 一次性 success banner，5 秒后自动隐藏 + 落 sentinel。
    if (familyDone && dietDone) {
      setShowSuccess(true);
      // 等下一帧让 #today-menu-anchor mount，再 scroll
      setTimeout(() => {
        document.getElementById('today-menu-anchor')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 600);
      try { localStorage.setItem("onboarding_done", "1"); } catch { /* quota */ }
      setTimeout(() => setShowSuccess(false), 5000);
      return;
    }
    setShouldShow(true);
  }, []);

  if (showSuccess) {
    return (
      <div
        className="rounded-2xl px-4 py-3 flex items-start gap-3 relative"
        style={{
          background: "linear-gradient(135deg, rgba(37,211,102,0.10), rgba(16,163,74,0.05))",
          border: "1px solid rgba(37,211,102,0.30)",
        }}>
        <span className="text-[22px] shrink-0">✓</span>
        <p className="flex-1" style={{ fontSize: 13, color: "#15803D", lineHeight: 1.5, fontWeight: 600 }}>
          完成！今天给你推荐的 5 道菜在下方 →
        </p>
      </div>
    );
  }

  if (!shouldShow) return null;

  const dismiss = () => {
    localStorage.setItem("nutri_family_nudge_v1", "dismissed");
    setShouldShow(false);
  };

  // Active step = the FIRST incomplete one (1 / 2 / 3). Step 3 only highlights
  // when both prereqs are done — but that case routes to the success banner
  // above, so practically the active step here is always 1 or 2.
  const activeStep: 1 | 2 | 3 = !stepDone.family ? 1 : !stepDone.diet ? 2 : 3;

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

        {/* 3-step progress bar — green for done, orange for active, gray for upcoming */}
        <div className="mt-2 flex items-center gap-1">
          {[
            { idx: 1, label: '家庭成员',     done: stepDone.family },
            { idx: 2, label: '饮食偏好',     done: stepDone.diet   },
            { idx: 3, label: '享受推荐', done: false          }, // 3 在 success banner 里激活
          ].map(({ idx, label, done }) => {
            const isActive = idx === activeStep;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full h-1 rounded-full" style={{
                  background: done
                    ? '#25D366'
                    : isActive ? '#FF5A1F' : 'rgba(0,0,0,0.08)',
                  transition: 'background 0.25s',
                }} />
                <span style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: done ? '#15803D' : isActive ? '#FF5A1F' : 'rgba(0,0,0,0.32)',
                }}>
                  {done ? '✓' : idx}. {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* 去填档案 → micro animation: hover-lift + active-press, plus a subtle
            shadow-pulse via Tailwind's group/animate-pulse classes. */}
        <button
          onClick={() => navigate("/settings")}
          className="mt-2.5 px-3 py-1 rounded-full font-bold transition-transform duration-150 hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
            color: "white", fontSize: 12, letterSpacing: "0.04em",
            boxShadow: "0 2px 8px rgba(255,90,31,0.25), 0 0 0 0 rgba(255,90,31,0.40)",
            animation: 'pulseRing 2.4s ease-in-out infinite',
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
      {/* Local keyframes for the CTA's pulsing halo. Scoped via <style> so we
          don't touch the global index.css (surgical). */}
      <style>{`
        @keyframes pulseRing {
          0%   { box-shadow: 0 2px 8px rgba(255,90,31,0.25), 0 0 0 0 rgba(255,90,31,0.40); }
          70%  { box-shadow: 0 2px 8px rgba(255,90,31,0.25), 0 0 0 8px rgba(255,90,31,0); }
          100% { box-shadow: 0 2px 8px rgba(255,90,31,0.25), 0 0 0 0 rgba(255,90,31,0); }
        }
      `}</style>
    </div>
  );
}
