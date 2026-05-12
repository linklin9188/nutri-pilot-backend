/**
 * Home — Employer dashboard
 * States: Day 1 (no menu) vs Week 1+ (with health metrics)
 * Sections: Health Dashboard → Procurement → Helper Status → Today's Menu
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRecommendDishes, fetchSwapOptions, type SupabaseDish } from "../hooks/useSupabaseMenu";
import { useWeeklyMenu } from "../hooks/useWeeklyMenu";
import { analyzeFridgePhoto, fileToBase64, type FridgeDish } from "../lib/geminiVision";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";

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

// ── Health metrics ─────────────────────────────────────────────────────────────
function computeHealthMetrics(weeklyMenu: any) {
  if (!weeklyMenu?.days) return null;
  const days = weeklyMenu.days as any[];
  if (days.length === 0) return null;

  const vegDays = days.filter(d => (d.dishes ?? []).some((dish: any) => dish.type === "VEGGIE")).length;
  const soupDays = days.filter(d => (d.dishes ?? []).some((dish: any) => dish.type === "SOUP")).length;
  const allDishes: any[] = days.flatMap(d => d.dishes ?? []);
  const veganCount = allDishes.filter(d => d.is_vegan).length;
  const total = Math.max(allDishes.length, 1);

  const score = Math.min(
    Math.round(55 + (vegDays / 7) * 22 + (soupDays / 7) * 10 + (veganCount / total) * 13),
    97,
  );

  return {
    score,
    lowSalt: vegDays + Math.floor(soupDays * 0.6),
    lowSugar: Math.min(vegDays + 1, 7),
    lowPurine: Math.max(vegDays - 1, 2),
  };
}

export default function Home() {
  const navigate = useNavigate();
  const isLoggedIn = !!localStorage.getItem("isLoggedIn");

  // mealTime must be declared before useRecommendDishes
  const [mealTime, setMealTime] = useState<"早餐" | "午餐" | "晚餐">(() => {
    const h = new Date().getHours();
    return h < 10 ? "早餐" : h < 15 ? "午餐" : "晚餐";
  });
  const [todayAdults, setTodayAdults] = useState(3);
  const [todayKids, setTodayKids] = useState(2);
  const [veganOnly, setVeganOnly] = useState(false);

  const { recommendedDishes, loading: dishesLoading } = useRecommendDishes(
    mealTime, veganOnly, todayAdults, todayKids,
  );
  const { weeklyMenu } = useWeeklyMenu();

  const [menuSwaps, setMenuSwaps] = useState<Record<number, any>>({});
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [swappingDishIndex, setSwappingDishIndex] = useState<number | null>(null);
  const [swapOptions, setSwapOptions] = useState<SupabaseDish[]>([]);
  const [selectedSwap, setSelectedSwap] = useState("");
  const [isSwapLoading, setIsSwapLoading] = useState(false);

  // Fridge scan
  const fridgeInputRef = useRef<HTMLInputElement>(null);
  const [isFridgeScanOpen, setIsFridgeScanOpen] = useState(false);
  const [fridgeScanLoading, setFridgeScanLoading] = useState(false);
  const [fridgeIngredients, setFridgeIngredients] = useState<string[]>([]);
  const [fridgeDishes, setFridgeDishes] = useState<FridgeDish[]>([]);
  const [fridgeError, setFridgeError] = useState<string | null>(null);
  const [fridgePreview, setFridgePreview] = useState<string | null>(null);

  const [breakfastPool, setBreakfastPool] = useState<any[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [helperName, setHelperName] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (userId) {
      supabase
        .from("user_profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if ((data as any)?.display_name) setDisplayName((data as any).display_name);
        });

      // Load or create household for this employer
      supabase
        .from("households")
        .select("id, invite_code, household_members(helper_id, user_profiles(display_name))")
        .eq("employer_id", userId)
        .maybeSingle()
        .then(async ({ data }) => {
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

    // Fetch breakfast dishes pool
    supabase
      .from('dishes')
      .select('id, title_zh, title_en, image_url, description_zh, description_en, type')
      .eq('meal_type', 'breakfast')
      .limit(20)
      .then(({ data }) => { if (data && data.length > 0) setBreakfastPool(data); });

    // Fallback: helper name from localStorage (settings page)
    const savedHelper = localStorage.getItem("helperName");
    if (savedHelper) setHelperName(prev => prev || savedHelper);

    // Restore persisted headcount
    const adults = localStorage.getItem("nutri_adults");
    const kids = localStorage.getItem("nutri_kids");
    if (adults) setTodayAdults(Number(adults));
    if (kids) setTodayKids(Number(kids));
  }, []);

  // Today index (Mon=0…Sun=6)
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

  // Build display menu per meal tab
  const storedMenuRaw: any[] = (() => {
    try { return JSON.parse(localStorage.getItem("generatedMenu") || "[]"); } catch { return []; }
  })();

  const baseMenu: any[] = (() => {
    if (mealTime === "早餐") {
      if (breakfastPool.length === 0) return [];
      // Rotate breakfast by day of week for variety
      const start = (todayIdx * 2) % breakfastPool.length;
      return [breakfastPool[start], breakfastPool[(start + 1) % breakfastPool.length]].filter(Boolean);
    }
    if (mealTime === "午餐") {
      const lunch = weeklyMenu?.days[todayIdx]?.lunchDishes ?? [];
      return lunch.length > 0 ? lunch : [];
    }
    // 晚餐: live recommendations → weeklyMenu → localStorage fallback
    if (recommendedDishes.length > 0) return recommendedDishes;
    const dinner = weeklyMenu?.days[todayIdx]?.dishes ?? [];
    return dinner.length > 0 ? dinner : storedMenuRaw;
  })();

  const displayMenu: any[] = baseMenu.map((dish, idx) => menuSwaps[idx] || dish);
  const hasMenu = (weeklyMenu?.days[todayIdx]?.dishes.length ?? storedMenuRaw.length) > 0;

  const healthMetrics = computeHealthMetrics(weeklyMenu);
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
        // Track: employer swapped this dish → times_employer_swapped +1
        const swappedDish = displayMenu[swappingDishIndex];
        if (swappedDish?.id) {
          supabase
            .from("dishes")
            .update({ times_employer_swapped: (swappedDish.times_employer_swapped ?? 0) + 1 })
            .eq("id", swappedDish.id)
            .then(() => {});
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
      const result = await analyzeFridgePhoto(base64, mimeType);
      setFridgeIngredients(result.detected_ingredients);
      setFridgeDishes(result.dishes);
    } catch {
      setFridgeError("识别失败，请重试");
    } finally {
      setFridgeScanLoading(false);
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: "#f5f5f7", paddingBottom: 100 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-black/5"
        style={{ paddingTop: "env(safe-area-inset-top, 44px)" }}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex-1 min-w-0 pr-2">
            {/* Greeting + date */}
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.38)" }}>{greeting} · {dateLabel}</p>
            {/* Solar term + weather badges */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F' }}>
                {solarTerm.icon} {solarTerm.name}
              </span>
              {weather && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: 'rgba(0,0,0,0.05)', color: '#555' }}>
                  {weather.temp}°C · {weather.label} · 湿度{weather.humidity}%
                </span>
              )}
            </div>
            {/* Dynamic dietary tip */}
            <p className="mt-1 font-semibold leading-snug" style={{ fontSize: 13, color: '#1a1a1a' }}>
              {tip}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFridgeScanOpen(true)}
              className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "rgba(0,0,0,0.06)" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555" }}>kitchen</span>
            </button>
            <button
              onClick={() => navigate(isLoggedIn ? "/settings" : "/signin")}
              className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden active:scale-90 transition-transform"
              style={{ background: "linear-gradient(135deg, #FF5A1F, #FF9054)" }}
            >
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>person</span>
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pt-4 flex flex-col gap-4">

        {/* ── Anonymous strip ──────────────────────────────────── */}
        {!isLoggedIn && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(255,90,31,0.06)", border: "1.5px dashed rgba(255,90,31,0.3)" }}>
            <span style={{ fontSize: 18 }}>🎁</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ fontSize: 12, color: "#FF5A1F" }}>访客体验 · 3天免费</p>
              <p className="truncate" style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>登录解锁家庭健康档案与工人协作</p>
            </div>
            <button onClick={() => navigate("/signin")}
              className="px-3 py-1.5 rounded-full font-bold text-white shrink-0 active:scale-95"
              style={{ fontSize: 12, background: "#FF5A1F" }}>
              登录
            </button>
          </div>
        )}

        {/* ── Health Dashboard Hero ────────────────────────────── */}
        {healthMetrics ? (
          <div className="rounded-3xl overflow-hidden"
            style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)" }}>
            <div className="px-5 pt-5 pb-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em" }}>
                    本周家庭营养评分
                  </p>
                  <div className="flex items-end gap-2 mt-1">
                    <span className="font-black" style={{ fontSize: 52, color: "white", lineHeight: 1 }}>
                      {healthMetrics.score}
                    </span>
                    <span style={{ fontSize: 18, color: "rgba(255,255,255,0.35)", marginBottom: 7 }}>/100</span>
                    <span className="px-2 py-0.5 rounded-full font-bold ml-1"
                      style={{
                        fontSize: 11, marginBottom: 5,
                        background: healthMetrics.score >= 80
                          ? "rgba(52,211,153,0.22)"
                          : healthMetrics.score >= 65
                          ? "rgba(251,191,36,0.22)"
                          : "rgba(239,68,68,0.22)",
                        color: healthMetrics.score >= 80 ? "#34d399" : healthMetrics.score >= 65 ? "#fbbf24" : "#f87171",
                      }}>
                      {healthMetrics.score >= 80 ? "优秀" : healthMetrics.score >= 65 ? "良好" : "待改善"}
                    </span>
                  </div>
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)" }}>
                  <span className="material-symbols-outlined text-white"
                    style={{ fontSize: 30, fontVariationSettings: "'FILL' 1" }}>favorite</span>
                </div>
              </div>

              {/* Score bar */}
              <div className="h-1.5 rounded-full mb-4" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${healthMetrics.score}%`,
                    background: "linear-gradient(90deg, #34d399, #10b981)",
                  }} />
              </div>

              {/* Compliance pills */}
              <div className="flex gap-2">
                {[
                  { label: "低盐", days: healthMetrics.lowSalt, ok: healthMetrics.lowSalt >= 5 },
                  { label: "低糖", days: healthMetrics.lowSugar, ok: healthMetrics.lowSugar >= 5 },
                  { label: "低嘌呤", days: healthMetrics.lowPurine, ok: healthMetrics.lowPurine >= 5 },
                ].map(m => (
                  <div key={m.label} className="flex-1 rounded-2xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-1 mb-1">
                      <span style={{ fontSize: 10, color: m.ok ? "#34d399" : "#fbbf24" }}>{m.ok ? "✓" : "⚠"}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{m.label}</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-black" style={{ fontSize: 18, color: "white" }}>{m.days}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>/7天</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Day 1: Setup prompt */
          <div className="rounded-3xl p-5"
            style={{ background: "linear-gradient(135deg, #FF5A1F 0%, #FF8C54 100%)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
              开始您的家庭健康饮食计划
            </p>
            <h2 className="font-black text-white" style={{ fontSize: 22, lineHeight: 1.2, marginBottom: 8 }}>
              每天不再<br />烦恼"吃什么"
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.55, marginBottom: 18 }}>
              AI 根据家人健康状况，智能规划低盐低糖低嘌呤的一周菜单
            </p>
            <button
              onClick={() => navigate("/weekly")}
              className="w-full py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all"
              style={{ fontSize: 15, background: "white", color: "#FF5A1F" }}>
              生成本周菜单 →
            </button>
          </div>
        )}

        {/* ── Procurement Card ─────────────────────────────────── */}
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #FF5A1F, #FF9054)" }}>
                <span className="material-symbols-outlined text-white"
                  style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
              </div>
              <span className="font-bold" style={{ fontSize: 16, color: "#1a1a1a" }}>本周采购清单</span>
            </div>
            {hasMenu && (
              <span className="px-2 py-1 rounded-full font-semibold"
                style={{ fontSize: 10, background: "rgba(52,211,153,0.12)", color: "#059669" }}>
                菜单已生成
              </span>
            )}
          </div>

          {hasMenu ? (
            <>
              <p style={{ fontSize: 13, color: "rgba(0,0,0,0.42)", lineHeight: 1.55, marginBottom: 12 }}>
                查看本周所需食材。工人在应用内核对家里已有的，剩余才是需要采购的。
              </p>
              <button
                onClick={() => {
                  localStorage.setItem("generatedMenu", JSON.stringify(displayMenu));
                  localStorage.setItem("effectivePeople", JSON.stringify(todayAdults + todayKids * 0.5));
                  navigate("/verify");
                }}
                className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{
                  fontSize: 15,
                  background: "linear-gradient(135deg, #FF5A1F, #FF9054)",
                  boxShadow: "0 6px 20px rgba(255,90,31,0.28)",
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>receipt_long</span>
                查看采购清单
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "rgba(0,0,0,0.42)", lineHeight: 1.55, marginBottom: 12 }}>
                先生成本周菜单，AI 自动整理所有食材的采购清单，雇主决定买什么、从哪里买。
              </p>
              <button
                onClick={() => navigate("/weekly")}
                className="w-full py-3 rounded-2xl font-semibold active:scale-[0.98] transition-all"
                style={{
                  fontSize: 14, color: "#FF5A1F",
                  background: "rgba(255,90,31,0.06)",
                  border: "1.5px dashed rgba(255,90,31,0.3)",
                }}>
                先生成本周菜单 →
              </button>
            </>
          )}
        </div>

        {/* ── Helper Status Card ───────────────────────────────── */}
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(37,211,102,0.12)" }}>
                <span className="material-symbols-outlined"
                  style={{ fontSize: 18, color: "#25D366", fontVariationSettings: "'FILL' 1" }}>support_agent</span>
              </div>
              <span className="font-bold" style={{ fontSize: 16, color: "#1a1a1a" }}>工人状态</span>
            </div>
            <button
              onClick={() => navigate("/community?view=employer")}
              style={{ fontSize: 12, color: "#FF5A1F", fontWeight: 600 }}>
              查看社区 →
            </button>
          </div>

          {helperName ? (
            /* Helper linked — show progress */
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: "#f8f8f8" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, #25D366, #128C7E)", fontSize: 16 }}>
                  {helperName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ fontSize: 14, color: "#1a1a1a" }}>{helperName}</p>
                  <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)" }}>已连接 · 等待任务同步</p>
                </div>
                <button
                  onClick={() => navigate("/community?view=employer")}
                  className="px-3 py-1.5 rounded-full font-bold text-white shrink-0 active:scale-95"
                  style={{ fontSize: 11, background: "#FF5A1F" }}>
                  👑 点赞
                </button>
              </div>
            </div>
          ) : (
            /* No helper linked — show invite code */
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "#f8f8f8" }}>
                <span style={{ fontSize: 28 }}>👩</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold" style={{ fontSize: 14, color: "#1a1a1a" }}>还未绑定工人</p>
                  <p style={{ fontSize: 12, color: "rgba(0,0,0,0.42)" }}>工人输入邀请码即可加入</p>
                </div>
              </div>
              {inviteCode ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: "rgba(37,211,102,0.06)", border: "1.5px dashed rgba(37,211,102,0.3)" }}>
                  <div className="flex-1">
                    <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginBottom: 2 }}>工人邀请码</p>
                    <p className="font-black tracking-[0.18em]" style={{ fontSize: 24, color: "#128C7E", letterSpacing: "0.2em" }}>
                      {inviteCode}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteCode).then(() => {
                        setInviteCopied(true);
                        setTimeout(() => setInviteCopied(false), 2000);
                      });
                    }}
                    className="px-3 py-2 rounded-xl font-bold shrink-0 active:scale-95 transition-all"
                    style={{ fontSize: 12, background: inviteCopied ? "#25D366" : "#128C7E", color: "white" }}>
                    {inviteCopied ? "已复制 ✓" : "复制"}
                  </button>
                </div>
              ) : (
                <div className="h-12 rounded-2xl animate-pulse" style={{ background: "#f0f0f0" }} />
              )}
            </div>
          )}
        </div>

        {/* ── Today's Menu ─────────────────────────────────────── */}
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold" style={{ fontSize: 16, color: "#1a1a1a" }}>今日菜单</span>
              <div className="flex gap-1">
                {(["早餐", "午餐", "晚餐"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMealTime(m)}
                    className="px-2.5 py-1 rounded-lg font-semibold transition-all active:scale-95"
                    style={{
                      fontSize: 11,
                      background: mealTime === m ? "#FF5A1F" : "rgba(0,0,0,0.06)",
                      color: mealTime === m ? "white" : "rgba(0,0,0,0.45)",
                    }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => navigate("/weekly")}
              style={{ fontSize: 12, color: "#FF5A1F", fontWeight: 600, whiteSpace: "nowrap" }}>
              本周 →
            </button>
          </div>

          {dishesLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-14 h-14 rounded-2xl shrink-0" style={{ background: "rgba(0,0,0,0.05)" }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 rounded-full w-2/3" style={{ background: "rgba(0,0,0,0.05)" }} />
                    <div className="h-3 rounded-full w-1/2" style={{ background: "rgba(0,0,0,0.05)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : displayMenu.length > 0 ? (
            <div className="flex flex-col gap-3">
              {displayMenu.slice(0, 5).map((dish: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0"
                    style={{ background: "rgba(0,0,0,0.05)" }}>
                    <img
                      src={dish.img || dish.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&h=120&fit=crop"}
                      alt={dish.title || dish.title_zh}
                      className="w-full h-full object-cover"
                      onError={e => {
                        (e.target as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&h=120&fit=crop";
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ fontSize: 15, color: "#1a1a1a" }}>
                      {dish.title_zh || dish.title}
                    </p>
                    <p className="truncate" style={{ fontSize: 12, color: "rgba(0,0,0,0.38)" }}>
                      {dish.desc || dish.type || "家常菜"}
                    </p>
                  </div>
                  <button onClick={() => openSwapDrawer(idx)} className="active:scale-90 transition-transform shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: "rgba(0,0,0,0.18)" }}>
                      swap_horiz
                    </span>
                  </button>
                </div>
              ))}

              {/* Quick actions below menu */}
              <div className="flex gap-2 mt-1 pt-3 border-t border-black/5">
                <button
                  onClick={() => {
                    localStorage.setItem("generatedMenu", JSON.stringify(displayMenu));
                    navigate("/prep");
                  }}
                  className="flex-1 py-2.5 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  style={{ background: "rgba(108,92,231,0.08)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#6C5CE7" }}>menu_book</span>
                  <span className="font-semibold" style={{ fontSize: 12, color: "#6C5CE7" }}>备菜步骤</span>
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem("generatedMenu", JSON.stringify(displayMenu));
                    navigate("/cook");
                  }}
                  className="flex-1 py-2.5 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  style={{ background: "rgba(0,180,216,0.08)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#0077B6" }}>soup_kitchen</span>
                  <span className="font-semibold" style={{ fontSize: 12, color: "#0077B6" }}>开始烹饪</span>
                </button>
                <button
                  onClick={() => setIsFridgeScanOpen(true)}
                  className="flex-1 py-2.5 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  style={{ background: "rgba(16,185,129,0.08)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#059669" }}>kitchen</span>
                  <span className="font-semibold" style={{ fontSize: 12, color: "#059669" }}>扫冰箱</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center text-center gap-3">
              <span className="material-symbols-outlined" style={{ fontSize: 44, color: "rgba(0,0,0,0.12)" }}>
                restaurant
              </span>
              <p style={{ fontSize: 14, color: "rgba(0,0,0,0.38)", lineHeight: 1.5 }}>
                暂无今日菜单<br />前往生成本周菜单
              </p>
              <button
                onClick={() => navigate("/weekly")}
                className="px-5 py-2.5 rounded-full font-semibold text-white active:scale-95"
                style={{ fontSize: 13, background: "linear-gradient(135deg, #FF5A1F, #FF9054)" }}>
                生成菜单
              </button>
            </div>
          )}
        </div>

      </main>

      {/* ── Bottom Tab Bar ───────────────────────────────────────── */}
      <BottomTabBar />

      {/* ── FAB ──────────────────────────────────────────────────── */}
      <div className="fixed z-40" style={{ bottom: 76, right: 20 }}>
        <button
          onClick={fabAction}
          className="flex items-center gap-2 px-4 h-12 rounded-full font-bold text-white active:scale-95 transition-all"
          style={{
            fontSize: 13,
            background: "linear-gradient(135deg, #FF5A1F, #FF9054)",
            boxShadow: "0 8px 28px rgba(255,90,31,0.42)",
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>
            {fabIcon}
          </span>
          {fabLabel}
        </button>
      </div>

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
                    <p className="font-semibold" style={{ fontSize: 15 }}>{opt.title_zh || opt.title}</p>
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold" style={{ fontSize: 20 }}>冰箱扫一扫</h2>
              <button className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.06)" }} onClick={() => setIsFridgeScanOpen(false)}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
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
                <p style={{ fontSize: 11, color: "rgba(0,0,0,0.38)", letterSpacing: "0.08em" }} className="mb-3">
                  推荐做法（3种）
                </p>
                <div className="space-y-3 mb-6">
                  {fridgeDishes.map((dish, i) => (
                    <div key={i} className="p-4 rounded-2xl border shadow-sm bg-white"
                      style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-bold" style={{ fontSize: 15 }}>{dish.name_zh}</p>
                          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.38)" }}>{dish.name_en}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2 py-0.5 rounded-md font-semibold"
                            style={{ fontSize: 11, background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.45)" }}>
                            {dish.cook_method}
                          </span>
                          <span className="px-2 py-0.5 rounded-md font-semibold"
                            style={{
                              fontSize: 10,
                              background: dish.difficulty === "简单" ? "rgba(52,211,153,0.1)" : "rgba(251,191,36,0.1)",
                              color: dish.difficulty === "简单" ? "#059669" : "#d97706",
                            }}>
                            {dish.difficulty} · {dish.time_minutes}分钟
                          </span>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", lineHeight: 1.55 }} className="mt-2">
                        {dish.description}
                      </p>
                    </div>
                  ))}
                </div>
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
                  kitchen
                </span>
                <p style={{ fontSize: 14, color: "rgba(0,0,0,0.38)", textAlign: "center", lineHeight: 1.5 }}>
                  拍一张冰箱或食材照片<br />AI 帮你想三种做法
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
