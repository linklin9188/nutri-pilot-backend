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
//
// Six dimensions aligned with 《中国居民膳食指南》/ 膳食宝塔. Each scored 0-100.
//
//   1. 蛋白    — 每日是否有优质蛋白（肉/鱼/蛋/豆）
//   2. 蔬果    — 蔬菜量是否充足
//   3. 谷薯    — 粗细搭配 / 主食多样化
//   4. 钙      — 高钙食材（豆腐/绿叶菜/小鱼干/奶）覆盖
//   5. 多样    — 食材多样性（不同 main_ingredient 数 / 总菜数）
//   6. 低油盐  — 清淡度（'light' tag 占比 - 'fried'/'spicy' 占比）
//
// The overall score is the average of the 6 axes — same metric a radar reader
// would mentally compute.

interface NutritionAxis {
  key:   'protein' | 'veggie' | 'grain' | 'calcium' | 'variety' | 'light';
  label: string;     // 2-char Chinese, shown on the radar vertex
  value: number;     // 0–100
  hint:  string;     // tooltip / detail text
}

const PROTEIN_INGS  = ['pork','beef','lamb','chicken','duck','turkey','fish','shrimp','crab','squid','scallop','clam','oyster','salmon','tuna','cod','seabass','hairtail','egg','tofu'];
const PLANT_INGS    = ['veggie','vegetable','mushroom','bean'];
const CALCIUM_KW    = /(豆腐|豆浆|芝士|奶酪|牛奶|沙丁鱼|小鱼干|芝麻|西兰花|菠菜|芥蓝|芥菜|油菜|上海青)/;
const STAPLE_TYPES_KW = /(米饭|面|粉|粥|饼|包|饺|馒头|薯|燕麦|杂粮)/;

function computeHealthMetrics(weeklyMenu: any) {
  if (!weeklyMenu?.days) return null;
  const days = weeklyMenu.days as any[];
  if (days.length === 0) return null;

  const allDinner: any[] = days.flatMap(d => d.dishes ?? []);
  const allLunch:  any[] = days.flatMap(d => d.lunchDishes ?? []);
  const all       = [...allDinner, ...allLunch];
  const totalDishes = Math.max(all.length, 1);

  // 1. 蛋白：每天 dinner 是否含至少一道优质蛋白
  const proteinDays = days.filter(d =>
    (d.dishes ?? []).some((x: any) => PROTEIN_INGS.includes((x.main_ingredient ?? '').toLowerCase()))
  ).length;
  const protein = Math.min(100, Math.round((proteinDays / 7) * 100));

  // 2. 蔬果：每天 dinner+lunch 累计 ≥2 道 plant
  const veggieDays = days.filter(d => {
    const todayPlant = [...(d.dishes ?? []), ...(d.lunchDishes ?? [])]
      .filter((x: any) => PLANT_INGS.some(p => (x.main_ingredient ?? '').includes(p)) || (x.course_type === 'veggie_dish'));
    return todayPlant.length >= 2;
  }).length;
  const veggie = Math.min(100, Math.round((veggieDays / 7) * 100));

  // 3. 谷薯：lunch 主食种类多样性（粥/面/饭/饼 不同类）
  const stapleKinds = new Set<string>();
  for (const dish of allLunch) {
    if ((dish.course_type ?? '') !== 'staple') continue;
    const m = (dish.title_zh ?? '').match(STAPLE_TYPES_KW);
    if (m) stapleKinds.add(m[0]);
  }
  // 7 staples; want ≥4 different kinds for full marks
  const grain = Math.min(100, Math.round((stapleKinds.size / 4) * 100));

  // 4. 钙：含钙食材覆盖天数
  const calciumDays = days.filter(d => {
    const today = [...(d.dishes ?? []), ...(d.lunchDishes ?? [])];
    return today.some((x: any) => CALCIUM_KW.test(x.title_zh ?? ''));
  }).length;
  const calcium = Math.min(100, Math.round((calciumDays / 7) * 100));

  // 5. 多样：unique main_ingredient 数 / 总菜数（理想 60%+）
  const uniqueIngs = new Set(all.map(d => (d.main_ingredient ?? 'other').toLowerCase()));
  const variety = Math.min(100, Math.round((uniqueIngs.size / Math.max(totalDishes * 0.6, 1)) * 100));

  // 6. 低油盐：'light' 比例 - 'fried'/'spicy' 比例
  const lightCount = all.filter(d => (d.flavor_tags ?? []).includes('light')).length;
  const heavyCount = all.filter(d => {
    const tags = d.flavor_tags ?? [];
    return tags.includes('fried') || tags.includes('spicy') || tags.includes('salty');
  }).length;
  const lightScore = Math.max(0, Math.min(100, Math.round(((lightCount - heavyCount) / totalDishes) * 100 + 60)));

  const axes: NutritionAxis[] = [
    { key: 'protein', label: '蛋白',   value: protein, hint: `${proteinDays}/7 天 有优质蛋白` },
    { key: 'veggie',  label: '蔬果',   value: veggie,  hint: `${veggieDays}/7 天 蔬果充足` },
    { key: 'grain',   label: '谷薯',   value: grain,   hint: `主食 ${stapleKinds.size} 种` },
    { key: 'calcium', label: '钙',     value: calcium, hint: `${calciumDays}/7 天 含钙食材` },
    { key: 'variety', label: '多样',   value: variety, hint: `${uniqueIngs.size} 种食材 / ${totalDishes} 道菜` },
    { key: 'light',   label: '低油盐', value: lightScore, hint: `清淡 ${lightCount} · 油盐重 ${heavyCount}` },
  ];

  const score = Math.round(axes.reduce((s, a) => s + a.value, 0) / 6);
  return { score, axes };
}

// ── Boost suggestion: per-axis hint to lift the score toward 90 ─────────────
const BOOST_HINTS: Record<NutritionAxis['key'], string> = {
  protein: '加一道蛋类菜或豆腐鱼蛋',
  veggie:  '多加一道绿叶蔬菜',
  grain:   '换成杂粮饭 / 多换主食种类',
  calcium: '加豆腐 / 菠菜 / 紫菜',
  variety: '换掉重复的主蛋白（如猪肉换鱼）',
  light:   '少炒多蒸/煮，加一道清淡汤',
};

function buildBoostSuggestion(axes: NutritionAxis[], score: number): string | null {
  if (score >= 90) return null;
  // Find the 1-2 lowest-scoring axes; give one suggestion focused on the weakest
  const sorted = [...axes].sort((a, b) => a.value - b.value).filter(a => a.value < 90);
  if (sorted.length === 0) return null;
  const weakest = sorted[0];
  return `${weakest.label} 弱：${BOOST_HINTS[weakest.key]}`;
}

// ── NutritionHexagon — 6-axis radar SVG, inline (no chart lib) ──────────────
function NutritionHexagon({ axes }: { axes: NutritionAxis[] }) {
  if (axes.length !== 6) return null;

  const size       = 220;   // overall SVG size
  const cx         = size / 2;
  const cy         = size / 2;
  const radius     = 64;    // outer radius (max=100)
  const labelOff   = 22;    // label distance beyond outer radius

  // Vertex angles in radians — top first, clockwise
  // index 0 = top, 1 = top-right, 2 = bottom-right, 3 = bottom, 4 = bottom-left, 5 = top-left
  const angles = [-90, -30, 30, 90, 150, 210].map(a => (a * Math.PI) / 180);

  const point = (val: number, i: number) => {
    const r = radius * (val / 100);
    return { x: cx + r * Math.cos(angles[i]), y: cy + r * Math.sin(angles[i]) };
  };
  const labelPoint = (i: number) => {
    const r = radius + labelOff;
    return { x: cx + r * Math.cos(angles[i]), y: cy + r * Math.sin(angles[i]) };
  };

  const polyStr = (vals: number[]) => vals.map((v, i) => {
    const p = point(v, i); return `${p.x},${p.y}`;
  }).join(' ');

  // Background ring polygons (25/50/75/100)
  const rings = [25, 50, 75, 100].map(v => Array(6).fill(v));
  // 90-reference polygon (dashed): the target users aim for
  const targetVals  = Array(6).fill(90);
  const currentVals = axes.map(a => a.value);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 280, margin: '0 auto', display: 'block' }}>
      {/* Background grid rings */}
      {rings.map((vs, ringI) => (
        <polygon key={ringI}
          points={polyStr(vs)}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={1}
        />
      ))}
      {/* Axis lines (center to outer vertex) */}
      {angles.map((_, i) => {
        const outer = point(100, i);
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y}
          stroke="rgba(0,0,0,0.05)" strokeWidth={1} />;
      })}
      {/* 90-reference dashed polygon */}
      <polygon
        points={polyStr(targetVals)}
        fill="none"
        stroke="rgba(255,90,31,0.35)"
        strokeWidth={1.2}
        strokeDasharray="3 3"
      />
      {/* Current values filled polygon */}
      <polygon
        points={polyStr(currentVals)}
        fill="rgba(16,185,129,0.18)"
        stroke="#10b981"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Vertex dots */}
      {currentVals.map((v, i) => {
        const p = point(v, i);
        return <circle key={i} cx={p.x} cy={p.y} r={3} fill="#10b981" />;
      })}
      {/* Axis labels */}
      {axes.map((a, i) => {
        const lp = labelPoint(i);
        const anchor = i === 0 ? 'middle' : i === 3 ? 'middle' : (i === 1 || i === 2) ? 'start' : 'end';
        return (
          <g key={a.key}>
            <text
              x={lp.x} y={lp.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              style={{ fontSize: 11, fontWeight: 700, fill: '#1a1a1a' }}
            >
              {a.label}
            </text>
            <text
              x={lp.x} y={lp.y + 12}
              textAnchor={anchor}
              dominantBaseline="middle"
              style={{ fontSize: 9, fill: 'rgba(0,0,0,0.45)' }}
            >
              {Math.round(a.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: "#f5f5f7", paddingBottom: 100 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/5"
        style={{ paddingTop: "env(safe-area-inset-top, 44px)" }}>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex-1 min-w-0 pr-2">
            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.35)" }}>{greeting} · {dateLabel}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F' }}>
                {solarTerm.icon} {solarTerm.name}
              </span>
              {weather && (
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>
                  {weather.temp}°C · {weather.label}
                </span>
              )}
            </div>
            <p className="mt-0.5 font-semibold leading-tight" style={{ fontSize: 12, color: '#555' }}>{tip}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Single 扫一扫 entry — duplicates removed (action row + avatar to settings).
                Settings now lives only in the bottom tab bar. */}
            <button onClick={() => setIsFridgeScanOpen(true)}
              className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "linear-gradient(135deg, #FF5A1F, #FF9054)" }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>
                qr_code_scanner
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-3 pt-3 pb-4 px-4">

        {/* ① TODAY'S MENU — Hero ──────────────────────────────── */}
        <div className="rounded-3xl bg-white overflow-hidden shadow-sm">

          {/* Meal tab bar */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex gap-1.5">
              {(["早餐", "午餐", "晚餐"] as const).map(m => (
                <button key={m} onClick={() => setMealTime(m)}
                  className="px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 text-[13px]"
                  style={{
                    background: mealTime === m ? "#FF5A1F" : "rgba(0,0,0,0.05)",
                    color: mealTime === m ? "white" : "rgba(0,0,0,0.4)",
                  }}>
                  {m}
                </button>
              ))}
            </div>
            <button onClick={() => navigate("/weekly")}
              style={{ fontSize: 12, color: "#FF5A1F", fontWeight: 700 }}>
              本周菜单 →
            </button>
          </div>

          {/* Who's eating today — always visible */}
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', fontWeight: 600, whiteSpace: 'nowrap' }}>今天谁在家</span>
            {allMembers.map((m, idx) => {
              const sel = eatingIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleEatingMember(m.id)}
                  title={m.name}
                  className={`p-0.5 rounded-full border-2 transition-all active:scale-95 shrink-0 ${
                    sel ? 'border-[#FF5A1F]' : 'border-transparent opacity-50'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-black ${MEMBER_COLORS[idx % MEMBER_COLORS.length]}`}
                    style={{ fontSize: 12 }}>
                    {(m.name || '?')[0]}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-bold border-2 border-dashed border-black/10 shrink-0 active:scale-95 transition-all"
              style={{ color: 'rgba(0,0,0,0.28)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span>
              {allMembers.length <= 1 ? '添加家人' : '管理'}
            </button>
          </div>

          {/* Dish list */}
          <div className="px-4 pb-2">
            {dishesLoading ? (
              <div className="flex flex-col gap-3 py-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-16 h-16 rounded-2xl shrink-0" style={{ background: "rgba(0,0,0,0.05)" }} />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 rounded-full w-2/3" style={{ background: "rgba(0,0,0,0.05)" }} />
                      <div className="h-3 rounded-full w-1/3" style={{ background: "rgba(0,0,0,0.05)" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayMenu.length > 0 ? (
              <div className="flex flex-col divide-y divide-black/[0.04]">
                {displayMenu.slice(0, 5).map((dish: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 py-3">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0"
                      style={{ background: "rgba(0,0,0,0.05)" }}>
                      <img
                        src={dish.img || dish.image_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop"}
                        alt={dish.title_zh || dish.title}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop"; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate" style={{ fontSize: 16, color: "#1a1a1a" }}>
                        {dish.title_zh || dish.title}
                      </p>
                      <p className="truncate mt-0.5" style={{ fontSize: 12, color: "rgba(0,0,0,0.35)" }}>
                        {dish.origin_cuisine ? dish.origin_cuisine.replace('_',' ') : (dish.desc || dish.type || '家常菜')}
                      </p>
                    </div>
                    <button onClick={() => openSwapDrawer(idx)}
                      className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 shrink-0"
                      style={{ background: "rgba(0,0,0,0.05)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17, color: "rgba(0,0,0,0.35)" }}>sync_alt</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 flex flex-col items-center gap-3">
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: "rgba(0,0,0,0.1)" }}>restaurant</span>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", textAlign: 'center', lineHeight: 1.6 }}>
                  暂无{mealTime}菜单<br />先生成本周菜单
                </p>
                <button onClick={() => navigate("/weekly")}
                  className="px-5 py-2 rounded-full font-bold text-white active:scale-95"
                  style={{ fontSize: 13, background: "#FF5A1F" }}>
                  生成菜单
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Action row — 备菜 / 烹饪. Minimal: icon + single label, nothing else. */}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            {
              label: "备菜", icon: "menu_book",
              accent: "#6C5CE7", accentBg: "rgba(108,92,231,0.10)",
              action: () => { localStorage.setItem("generatedMenu", JSON.stringify(displayMenu)); navigate("/prep"); },
            },
            {
              label: "烹饪", icon: "skillet",
              accent: "#FF5A1F", accentBg: "rgba(255,90,31,0.10)",
              action: () => { localStorage.setItem("generatedMenu", JSON.stringify(displayMenu)); navigate("/cook"); },
            },
          ].map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className="rounded-2xl bg-white p-3.5 flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.98] transition-transform"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: item.accentBg }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: item.accent, fontVariationSettings: "'FILL' 1" }}>
                  {item.icon}
                </span>
              </div>
              <p className="font-bold" style={{ fontSize: 15, color: "#1a1a1a" }}>
                {item.label}
              </p>
            </button>
          ))}
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

        {/* ④ NUTRITION HEXAGON — 6 dimensions from 中国居民膳食指南 ───── */}
        {healthMetrics && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold" style={{ fontSize: 13, color: "#1a1a1a" }}>本周营养雷达</span>
              <div className="flex items-baseline gap-1">
                <span className="font-black" style={{ fontSize: 22, color: "#1a1a1a", lineHeight: 1 }}>
                  {healthMetrics.score}
                </span>
                <span style={{ fontSize: 11, color: "rgba(0,0,0,0.3)" }}>/100</span>
                <span className="ml-1 px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    fontSize: 10,
                    background: healthMetrics.score >= 80 ? "rgba(52,211,153,0.15)" : healthMetrics.score >= 65 ? "rgba(251,191,36,0.15)" : "rgba(248,113,113,0.15)",
                    color:      healthMetrics.score >= 80 ? "#059669" : healthMetrics.score >= 65 ? "#d97706" : "#dc2626",
                  }}>
                  {healthMetrics.score >= 80 ? "优秀" : healthMetrics.score >= 65 ? "良好" : "待改善"}
                </span>
              </div>
            </div>
            <NutritionHexagon axes={healthMetrics.axes} />
            {/* Boost suggestion — show the single weakest axis with a one-line action.
                Dashed orange polygon on the radar marks the 90-score target. */}
            {(() => {
              const boost = buildBoostSuggestion(healthMetrics.axes, healthMetrics.score);
              return boost ? (
                <div className="mt-2 rounded-xl px-3 py-2 flex items-center gap-2"
                  style={{ background: "rgba(255,90,31,0.06)", border: "1px solid rgba(255,90,31,0.20)" }}>
                  <span style={{ fontSize: 14 }}>💡</span>
                  <p className="flex-1" style={{ fontSize: 11.5, color: "#7a3000", lineHeight: 1.4 }}>
                    差 {90 - healthMetrics.score} 分到 90 · <span className="font-bold">{boost}</span>
                  </p>
                </div>
              ) : (
                <div className="mt-2 rounded-xl px-3 py-2 flex items-center gap-2"
                  style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.20)" }}>
                  <span style={{ fontSize: 14 }}>🎉</span>
                  <p style={{ fontSize: 11.5, color: "#047857", lineHeight: 1.4 }}>
                    本周营养已达 <span className="font-bold">优秀</span> 标准
                  </p>
                </div>
              );
            })()}
            <p className="mt-2 text-center" style={{ fontSize: 10, color: "rgba(0,0,0,0.35)" }}>
              ●&nbsp;本周 &nbsp;&nbsp; ┄ 90 分参考 &nbsp;&nbsp; · 依据《中国居民膳食指南》
            </p>
          </div>
        )}

        {/* Day 1 CTA — only when no menu and no metrics */}
        {!healthMetrics && !hasMenu && (
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
