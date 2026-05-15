/**
 * Home — Employer dashboard
 * States: Day 1 (no menu) vs Week 1+ (with health metrics)
 * Sections: Health Dashboard → Procurement → Helper Status → Today's Menu
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRecommendDishes, fetchSwapOptions, type SupabaseDish } from "../hooks/useSupabaseMenu";
import { useWeeklyMenu } from "../hooks/useWeeklyMenu";
import {
  analyzeFridgePhoto, fileToBase64,
  type ScannedDish, type ScanScene, type ScanLocale,
} from "../lib/geminiVision";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";
import { useSubscription } from "../lib/subscription";
import { recordBatchSwap, recordSwap } from "../lib/swapFeedback";

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

  const { recommendedDishes, loading: dishesLoading, refresh: refreshRecommended } = useRecommendDishes(
    mealTime, veganOnly, todayAdults, todayKids,
  );
  const { weeklyMenu } = useWeeklyMenu();

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

  // Fridge scan
  const fridgeInputRef = useRef<HTMLInputElement>(null);
  const [isFridgeScanOpen, setIsFridgeScanOpen] = useState(false);
  const [fridgeScanLoading, setFridgeScanLoading] = useState(false);
  const [fridgeIngredients, setFridgeIngredients] = useState<string[]>([]);
  const [fridgeDishes, setFridgeDishes] = useState<ScannedDish[]>([]);
  const [fridgeError, setFridgeError] = useState<string | null>(null);
  const [scanScene, setScanScene]   = useState<ScanScene>('fridge');     // 冰箱 vs 超市货架
  const [scanLocale, setScanLocale] = useState<ScanLocale>('zh');         // 简体 / 繁體 输出
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

    // Fetch breakfast dishes pool — use '*' to avoid silent failure when columns change.
    // Previously selected 'type' which doesn't exist in the dishes table (column is
    // 'course_type'); the bad query returned an error and left breakfastPool empty,
    // causing Home's breakfast tab to permanently show "暂无早餐菜单".
    supabase
      .from('dishes')
      .select('*')
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
  const displayMenu: any[] = baseMenu
    .map((dish, idx) => menuSwaps[idx] || dish)
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
      // Scene + locale picked in the drawer header drive the prompt:
      // - fridge → suggest dishes from visible ingredients
      // - market → suggest dishes to shop FOR based on shelf items
      // - locale → simplified vs traditional Chinese output
      const result = await analyzeFridgePhoto(base64, mimeType, scanScene, scanLocale);
      setFridgeIngredients(result.detected_ingredients);
      setFridgeDishes(result.dishes);
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

          {/* QR — round, paper-card, subtle */}
          <button onClick={() => setIsFridgeScanOpen(true)}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform"
            style={{ background: "white", boxShadow: "0 4px 14px rgba(0,0,0,0.06)" }}
            title="扫食材">
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#FF5A1F" }}>
              qr_code_scanner
            </span>
          </button>
        </div>
      </header>

      <main className="flex flex-col gap-4 pt-2 pb-4 px-4">

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
            <button onClick={() => navigate("/weekly")}
              className="inline-flex items-center gap-1 active:scale-95"
              style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", fontWeight: 600 }}>
              本周菜单
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
            </button>
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
                今日餐桌
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

            {/* Dish list — bigger photos, editorial typography */}
            <div className="px-5 pt-2 pb-1">
              {dishesLoading ? (
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
                    <div key={idx} className="flex items-center gap-4 py-3.5"
                      style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(0,0,0,0.04)' }}>
                      <div className="relative w-[78px] h-[78px] rounded-2xl overflow-hidden shrink-0"
                        style={{
                          background: "rgba(0,0,0,0.04)",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}>
                        <img
                          src={dish.img || dish.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=240&h=240&fit=crop"}
                          alt={dish.title_zh || dish.title}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=240&h=240&fit=crop"; }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Tiny editorial label number */}
                        <p style={{ fontSize: 9, letterSpacing: "0.18em", color: "rgba(0,0,0,0.30)", fontWeight: 700 }}>
                          NO. {String(idx + 1).padStart(2, '0')}
                        </p>
                        <p className="font-serif font-black truncate mt-0.5" style={{ fontSize: 18, color: "#1a1a1a", letterSpacing: "-0.005em" }}>
                          {dish.title_zh || dish.title}
                        </p>
                        <p className="truncate mt-0.5" style={{ fontSize: 11.5, color: "rgba(0,0,0,0.42)" }}>
                          {dish.origin_cuisine ? dish.origin_cuisine.replace('_',' ') : (dish.desc || dish.type || '家常菜')}
                        </p>
                      </div>
                      <button onClick={() => openSwapDrawer(idx)}
                        className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 shrink-0 transition-transform"
                        style={{ background: "rgba(0,0,0,0.04)" }}
                        title="换一道">
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(0,0,0,0.40)" }}>sync_alt</span>
                      </button>
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

        {/* 换菜 / 烹饪 — primary actions of the day. Just icon + label, no
            subtitle. Free = 1 swap/day, Pro = 5 swaps/day (= 5 套菜单).
            烹饪 routes to /prep (the prep page itself flows to /cook),
            so we save the separate 备菜 button. */}
        <div className="grid grid-cols-2 gap-3">
          {/* 换菜 */}
          <button
            onClick={handleSwapAll}
            disabled={dishesLoading}
            className="rounded-2xl bg-white px-4 py-3.5 flex items-center justify-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)" }}
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(108,92,231,0.10)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#6C5CE7", fontVariationSettings: "'FILL' 1" }}>
                refresh
              </span>
            </div>
            <p className="font-serif font-black" style={{ fontSize: 17, color: "#1a1a1a", letterSpacing: "-0.005em" }}>
              换菜
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
            <button onClick={() => navigate("/signin")}
              className="px-4 py-2 rounded-xl font-bold text-white shrink-0 active:scale-95"
              style={{ fontSize: 12, background: "#FF5A1F" }}>登录</button>
          </div>
        )}

      </main>

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
                {/* Group dishes by cuisine: 中式 first, 西式 below.
                    Older payloads without a 'cuisine' field default to chinese. */}
                {([
                  { key: 'chinese' as const, label: '中式推荐', emoji: '🥢' },
                  { key: 'western' as const, label: '西式推荐', emoji: '🍝' },
                ]).map(group => {
                  const items = fridgeDishes.filter(d => (d.cuisine ?? 'chinese') === group.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={group.key} className="mb-5">
                      <p className="mb-2" style={{ fontSize: 11, color: "rgba(0,0,0,0.50)", letterSpacing: "0.08em", fontWeight: 700 }}>
                        {group.emoji} {group.label}（{items.length} 道）
                      </p>
                      <div className="space-y-3">
                        {items.map((dish, i) => (
                          <div key={`${group.key}-${i}`} className="p-4 rounded-2xl border shadow-sm bg-white"
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
