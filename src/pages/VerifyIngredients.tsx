import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { dishToIngredients, aggregateIngredients, type AggregatedIngredient } from "../lib/dishIngredients";
import * as XLSX from "xlsx";
import BottomTabBar from "../components/BottomTabBar";
import { useLanguage } from "../contexts/LanguageContext";
import { getHKAlias } from "../lib/hkNames";
import { ALGO_VERSION as WEEKLY_ALGO_VERSION } from "../hooks/useWeeklyMenu";
import { supabase } from "../lib/supabase";
import { useSubscription } from "../lib/subscription";
import { getUserId } from "../lib/userId";

// ── Hydrate dishes with prep_steps_json from DB ──────────────────────────
// Generated weekly menus persisted to localStorage often DON'T include the
// JSONB prep_steps payload (kept it lean). dishIngredients.ts now prefers
// prep_steps over the legacy main_ingredient heuristic, so the shopping
// list needs that data to surface secondary ingredients and substitutes.
// We do one batched fetch by id, then mutate the dishes in place.
async function hydratePrepSteps(dishes: any[]): Promise<any[]> {
  const idsNeeded = dishes
    .filter(d => d?.id && (!Array.isArray(d.prep_steps_json) || d.prep_steps_json.length === 0))
    .map(d => d.id);
  if (idsNeeded.length === 0) return dishes;
  try {
    const { data } = await supabase
      .from('dishes')
      .select('id, prep_steps_json')
      .in('id', [...new Set(idsNeeded)]);
    if (data) {
      const map = new Map(data.map((d: any) => [d.id, d.prep_steps_json]));
      for (const d of dishes) {
        if (d?.id && map.has(d.id)) d.prep_steps_json = map.get(d.id);
      }
    }
  } catch { /* network blip — fall back to heuristic */ }
  return dishes;
}

// ── Category grouping ─────────────────────────────────────────────────────────
const CATEGORY_GROUPS: { label: string; emoji: string; categories: string[] }[] = [
  { label: '肉禽蛋', emoji: '🥩', categories: ['pork', 'beef', 'poultry', 'egg'] },
  { label: '海鲜水产', emoji: '🐟', categories: ['seafood'] },
  { label: '蔬菜豆腐', emoji: '🥬', categories: ['veggie', 'tofu', 'other'] },
  { label: '主食调味', emoji: '🌾', categories: ['carb', 'condiment'] },
];

// Per-group store recommendations. Three picks each, ordered street → super → premium
// so the user has a value-vs-quality choice. IDs reference src/lib/suppliers.ts;
// keep them in sync if a supplier is renamed there.
interface ShopPick {
  name:   string;    // brand name shown on the chip
  emoji:  string;
  tier:   '街市' | '超市' | '高端' | '线上';
  blurb:  string;    // one-line value prop
  color:  string;    // tier accent color
}

const SHOPS_BY_GROUP: Record<string, ShopPick[]> = {
  '肉禽蛋': [
    { name: '街市肉档',         emoji: '🥩', tier: '街市', blurb: '当日宰杀，砍切到位',     color: '#FF8C54' },
    { name: '百佳',             emoji: '🛒', tier: '超市', blurb: '门店密集，价格稳定',     color: '#3B82F6' },
    { name: "City'super 肉品",  emoji: '✨', tier: '高端', blurb: '和牛 / 安格斯精选',       color: '#FFB347' },
  ],
  '海鲜水产': [
    { name: '街市鱼档',         emoji: '🐟', tier: '街市', blurb: '活鲜捞起，老板代杀',     color: '#FF8C54' },
    { name: 'HKTVmall Premium', emoji: '🌊', tier: '线上', blurb: '冷链直送，到家不化',     color: '#16a34a' },
    { name: 'SOLE 海鲜',        emoji: '🦞', tier: '高端', blurb: '挪威三文鱼 / 法国生蚝',   color: '#FFB347' },
  ],
  '蔬菜豆腐': [
    { name: '街市菜档',         emoji: '🥬', tier: '街市', blurb: '本地农场当日采',         color: '#FF8C54' },
    { name: '惠康有机',         emoji: '🛒', tier: '超市', blurb: '有机认证，价格友好',     color: '#3B82F6' },
    { name: 'Pacific Organic',  emoji: '🌱', tier: '高端', blurb: '欧盟标准 / 日本时蔬',     color: '#FFB347' },
  ],
  '主食调味': [
    { name: '百佳粮油',         emoji: '🛒', tier: '超市', blurb: '米面油醋一站补齐',       color: '#3B82F6' },
    { name: '华润万家',         emoji: '🏬', tier: '超市', blurb: '内地粮油副食专区',       color: '#3B82F6' },
    { name: 'HKTVmall 粮油',    emoji: '📦', tier: '线上', blurb: '大件下单送到家',         color: '#16a34a' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
// Use local-time date strings so they match the values stored in weekly_menu
// (which is also generated in local time). toISOString() would shift the
// value to the previous day for users east of UTC.
function formatLocalDate(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getTodayLocal(): string {
  return formatLocalDate(new Date());
}

function getWeekStart(): string {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return formatLocalDate(monday);
}

// Single source of truth for "who's eating today" — the same selection the
// Home page uses for menu generation. Reads:
//   1. nutri_family_members + nutri_eating_today (today's table selection)
//      — what useWeeklyMenu and useRecommendDishes consume.
//   2. nutri_adults / nutri_kids fallback for users who haven't set up
//      family members yet (onboarding default).
// Without this consolidation the procurement list silently used the static
// onboarding numbers while the menu used the live selection — i.e. 6 dishes
// generated for 5 people but ingredients only enough for 3.
/**
 * Per-day variant of readHeadcount. Reads nutri_eating_by_day[dayIdx]
 * first, falling back to the live today selection, then onboarding
 * defaults. Used for weekly procurement scaling so 周三-only-couple
 * doesn't get the same ingredient quantity as 周日-全家.
 */
function readHeadcountForDay(dayIdx: number): { adults: number; kids: number } {
  try {
    const allMembers = JSON.parse(localStorage.getItem('nutri_family_members') || '[]') as Array<{ id: string; lifeStage?: string }>;
    if (allMembers.length > 0) {
      // 1) per-day override
      try {
        const raw = localStorage.getItem('nutri_eating_by_day');
        if (raw) {
          const byDay = JSON.parse(raw) as Record<string, string[]>;
          const ids = byDay[String(dayIdx)];
          if (Array.isArray(ids) && ids.length > 0) {
            const today = allMembers.filter(m => ids.includes(m.id));
            const kids = today.filter(m => m.lifeStage === '儿童').length;
            return { adults: today.length - kids, kids };
          }
        }
      } catch {}
      // 2) fall through to today's default
    }
  } catch {}
  return readHeadcount();
}

function readHeadcount(): { adults: number; kids: number } {
  try {
    const allMembers = JSON.parse(localStorage.getItem('nutri_family_members') || '[]') as Array<{ id: string; lifeStage?: string }>;
    if (allMembers.length > 0) {
      const eatingIds = (() => {
        try { return JSON.parse(localStorage.getItem('nutri_eating_today') || 'null') as string[] | null; }
        catch { return null; }
      })();
      const today = eatingIds && eatingIds.length > 0
        ? allMembers.filter(m => eatingIds.includes(m.id))
        : allMembers; // default: everyone
      const kids = today.filter(m => m.lifeStage === '儿童').length;
      const adults = today.length - kids;
      return { adults, kids };
    }
  } catch {}
  // Fallback: onboarding-set static counts.
  const adults = parseInt(localStorage.getItem('nutri_adults') ?? '2', 10);
  const kids   = parseInt(localStorage.getItem('nutri_kids')   ?? '0', 10);
  return { adults, kids };
}

// Banquet payload written by Banquet.tsx when the user taps "一键生成采购清单".
// We keep it loose-typed because the source of truth lives in lib/banquet.ts.
interface StoredBanquet {
  adults: number; kids: number; elders: number;
  dishes: any[];
  createdAt: number;
}

function loadBanquet(): StoredBanquet | null {
  try {
    const raw = localStorage.getItem('banquet_menu_current');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.dishes?.length) return null;
    // Stale guard: drop banquets older than 24h to avoid surprising the
    // user with a forgotten list the next day.
    if (Date.now() - (parsed.createdAt ?? 0) > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('banquet_menu_current');
      return null;
    }
    return parsed as StoredBanquet;
  } catch { return null; }
}

function clearBanquet() {
  localStorage.removeItem('banquet_menu_current');
}

function loadWeekMenu(): any | null {
  const weekStart = getWeekStart();
  const prefix = `weekly_menu_${WEEKLY_ALGO_VERSION}_${weekStart}`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { return JSON.parse(raw); } catch { /* ignore */ }
      }
    }
  }
  return null;
}

function getDishes(mode: 'today' | 'week'): any[] {
  const weekMenu = loadWeekMenu();
  if (!weekMenu) return [];

  const days: any[] = weekMenu.days ?? [];

  if (mode === 'week') {
    return days.flatMap((d: any) => [...(d.dishes ?? []), ...(d.lunchDishes ?? [])]);
  }

  // Today: find the entry matching today's date (local time)
  const today = getTodayLocal();
  const todayEntry = days.find((d: any) => d.date === today) ?? days[0];
  if (!todayEntry) return [];
  return [...(todayEntry.dishes ?? []), ...(todayEntry.lunchDishes ?? [])];
}

// Three weight units the shopping list can render in.
//   'metric' — kg / g  (default, matches mainland habit)
//   'hk_jin' — 港斤 (司马斤 = 600g) / 両 (37.5g) — wet-market default
//   'lb'     — 磅 (453.6g) / oz — premium-store / online supermarket default
type WeightUnit = 'metric' | 'hk_jin' | 'lb';

const HK_JIN_G = 600;       // 1 司马斤 = 600g
const HK_LIANG_G = 37.5;    // 1 両 = 1/16 港斤
const LB_G = 453.59237;

function formatWeight(ing: AggregatedIngredient, unit: WeightUnit = 'metric'): string {
  if (ing.unit === 'piece') {
    const count = Math.round(ing.weightGrams / 60);
    return `×${count}个`;
  }
  const g = ing.weightGrams;
  if (unit === 'hk_jin') {
    // Prefer 港斤 when ≥ half a 港斤, otherwise 両.
    if (g >= HK_JIN_G / 2) return `${(g / HK_JIN_G).toFixed(1)}港斤`;
    return `${Math.round(g / HK_LIANG_G)}両`;
  }
  if (unit === 'lb') {
    if (g >= LB_G / 2) return `${(g / LB_G).toFixed(1)}磅`;
    return `${(g / (LB_G / 16)).toFixed(1)}oz`;
  }
  if (g >= 1000) return `${(g / 1000).toFixed(1)}kg`;
  return `${g}g`;
}

function buildShoppingText(grouped: { group: string; items: AggregatedIngredient[] }[], needToBuy: AggregatedIngredient[]): string {
  const lines = ['🛒 本周采购清单\n'];
  for (const { group, items } of grouped) {
    const needed = items.filter(i => needToBuy.some(n => n.nameZh === i.nameZh));
    if (needed.length === 0) continue;
    lines.push(group);
    for (const item of needed) {
      lines.push(`  • ${item.nameZh} ${formatWeight(item)}`);
    }
    lines.push('');
  }
  lines.push('— 由 NutriPilot 生成');
  return lines.join('\n');
}

// "🥩 肉禽蛋" → "肉禽蛋"
function extractGroupLabel(prefixed: string): string {
  return prefixed.replace(/^\S+\s*/, '');
}

// ── Shopping schedule (split weekly buy into 2-3 trips) ──────────────────────
// HK kitchens have small fridges and people typically shop 2-3 times a week
// (not all-at-once like a mainland weekend warehouse run). Plan:
//   • 肉禽蛋: one trip on Monday (freezer-friendly).
//   • 海鲜:   split across the week — once per "seafood day". A 海鲜 trip
//             buys for the next seafood day; we round-down to the trip-day
//             before it (Mon → 周一 trip; Thu → 周三 trip).
//   • 蔬菜豆腐: every 2 days for freshness — 周一 / 周三 / 周五.
//   • 主食调味: groups with the Monday trip (long shelf life).
//
// The output is a list of "shopping trips", each with a date label + the
// AggregatedIngredient[] to buy on that day.

const TRIP_DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

interface ShoppingTrip {
  dayIndex: number;          // 0=Mon..6=Sun
  label: string;             // '周一' / '周三'
  emoji: string;
  reason: string;            // 一句话解释为什么是这一天
  items: AggregatedIngredient[];
}

/**
 * Walk the weekly menu day-by-day to learn when each ingredient category is
 * actually used, then bucket ingredients into 2-3 shopping trips.
 */
function buildShoppingSchedule(
  ingredients: AggregatedIngredient[],
  weekMenu: any,
): ShoppingTrip[] {
  if (!weekMenu?.days?.length) return [];

  // Which day-indexes use 海鲜 / 蔬菜 / 肉?
  const seafoodDays: number[] = [];
  const veggieDays:  number[] = [];
  weekMenu.days.forEach((day: any, i: number) => {
    const dayDishes = [...(day.dishes ?? []), ...(day.lunchDishes ?? [])];
    for (const d of dayDishes) {
      const ing = (d.main_ingredient ?? '').toLowerCase();
      const ct  = (d.course_type ?? '');
      if (['seafood','fish','shrimp','crab','squid','scallop','clam',
           'salmon','tuna','cod','hairtail','seabass','oyster','lobster'].includes(ing)) {
        if (!seafoodDays.includes(i)) seafoodDays.push(i);
      }
      if (ct === 'veggie_dish' && !veggieDays.includes(i)) veggieDays.push(i);
    }
  });
  seafoodDays.sort((a,b) => a-b);
  veggieDays.sort((a,b) => a-b);

  // Pick the trip days: Monday always, then Wed/Fri based on what's used.
  // We map each seafood/veggie use day to a trip day on/before it.
  const tripDays = new Set<number>([0]);                          // 周一
  const usesVeggieAfterMid = veggieDays.some(d => d >= 3);        // 蔬菜 周四 / 周五 / 周末 → 周三 trip
  const usesVeggieLate = veggieDays.some(d => d >= 5);            // 蔬菜 周末 → 周五 trip
  if (veggieDays.length > 2 || usesVeggieAfterMid) tripDays.add(2);  // 周三
  if (usesVeggieLate)                              tripDays.add(4);  // 周五
  // Seafood: if there's a seafood day on Thursday onward, add a Wed restock.
  if (seafoodDays.some(d => d >= 3)) tripDays.add(2);

  // Map an ingredient → which trip day it goes on.
  const tripFor = (ing: AggregatedIngredient): number => {
    const cat = ing.category;
    // 肉禽蛋 + 主食 + 调味: 周一 一次买齐.
    if (['pork','beef','poultry','egg','carb','condiment'].includes(cat)) return 0;
    // 海鲜: 找下一个 seafood 用日，回退到 <= 当日的最近一个 trip.
    if (cat === 'seafood') {
      // First trip covers seafood for days 0-2; later trips cover days 3+.
      const firstLate = seafoodDays.find(d => d >= 3);
      if (firstLate != null && tripDays.has(2)) return 2;
      return 0;
    }
    // 蔬菜豆腐 / 其他: 三段分布. Items get distributed round-robin across
    // available trip days so each trip has fresh produce.
    const veggieIdx = ingredients
      .filter(x => ['veggie','tofu','other'].includes(x.category))
      .findIndex(x => x.nameZh === ing.nameZh);
    const trips = [...tripDays].sort((a,b) => a-b);
    return trips[Math.max(0, veggieIdx) % trips.length] ?? 0;
  };

  // Group.
  const groups = new Map<number, AggregatedIngredient[]>();
  for (const ing of ingredients) {
    const day = tripFor(ing);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(ing);
  }

  const reasons: Record<number, { emoji: string; reason: string }> = {
    0: { emoji: '📦', reason: '肉禽蛋 + 整周耐放食材一次买齐' },
    2: { emoji: '🥬', reason: '补充第二批蔬菜，海鲜（如有用）' },
    4: { emoji: '🌿', reason: '周末蔬菜补货' },
  };

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayIndex, items]) => ({
      dayIndex,
      label: TRIP_DAY_LABELS[dayIndex],
      emoji: reasons[dayIndex]?.emoji ?? '🛒',
      reason: reasons[dayIndex]?.reason ?? '采购日',
      items,
    }));
}

function SupplierRow({ groupLabel }: { groupLabel: string }) {
  const shops = SHOPS_BY_GROUP[groupLabel];
  if (!shops || shops.length === 0) return null;

  return (
    <div className="mt-2.5 mx-1">
      <p className="text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
        推荐采购点 · 3 家
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {shops.map((s, i) => (
          <div
            key={i}
            className="flex-shrink-0 bg-white rounded-2xl p-3 shadow-sm"
            style={{ width: 150, borderLeft: `3px solid ${s.color}` }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[18px]">{s.emoji}</span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${s.color}1A`, color: s.color }}
              >
                {s.tier}
              </span>
            </div>
            <p className="font-bold text-[12px] leading-tight">{s.name}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{s.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type ShopMode = 'today' | 'week' | 'banquet';

// ── Main component ─────────────────────────────────────────────────────────────
export default function VerifyIngredients() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  // TICKET-074 §C — 删除强制跳转。非 Pro 用户能进页面看清单，
  // 但「导出 Excel」等一键动作改用按钮级 paywall（onClick 触发 ProGate modal）。
  const { isPro } = useSubscription();
  const [proGateOpen, setProGateOpen] = useState(false);

  // If the user just arrived from /banquet, default to that view.
  const arrivedFromBanquet = typeof window !== 'undefined'
    && window.location.search.includes('from=banquet')
    && !!loadBanquet();

  const [mode, setMode] = useState<ShopMode>(arrivedFromBanquet ? 'banquet' : 'week');
  const [ingredients, setIngredients] = useState<AggregatedIngredient[]>([]);
  const [dishCount, setDishCount] = useState(0);
  const [banquetHeads, setBanquetHeads] = useState(0);

  // 我家有 toggle is persisted per-user per-day so the user doesn't lose
  // checks when they navigate away (e.g. open Home, come back). Key is
  // home_inventory_<userId>_<YYYY-MM-DD>; map values are bool — true = 已有.
  const homeInventoryKey = `home_inventory_${getUserId() ?? 'anon'}_${new Date().toISOString().slice(0, 10)}`;
  const loadHomeInventory = (): Record<string, boolean> => {
    try {
      const raw = localStorage.getItem(homeInventoryKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  };
  const persistHomeInventory = (map: Record<string, boolean>) => {
    // Only keep truthy entries — false / undefined are noise.
    const pruned: Record<string, boolean> = {};
    for (const k of Object.keys(map)) if (map[k]) pruned[k] = true;
    try { localStorage.setItem(homeInventoryKey, JSON.stringify(pruned)); } catch { /* quota */ }
  };
  // true = "已有"，false = "需要买"
  const [haveIt, setHaveIt] = useState<Record<string, boolean>>(() => loadHomeInventory());
  const [copied, setCopied] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(() =>
    (localStorage.getItem('nutri_weight_unit') as WeightUnit) || 'metric'
  );
  // Persist the user's pick so the choice survives reloads.
  useEffect(() => { localStorage.setItem('nutri_weight_unit', weightUnit); }, [weightUnit]);

  // 'by-category' (existing) vs 'by-trip' (split into 2-3 shopping days).
  const [view, setView] = useState<'category' | 'trip'>('category');
  // Cache the schedule per current ingredients/mode so we don't recompute on
  // every render (computing requires reading the weekly menu off localStorage).
  const schedule = useMemo<ShoppingTrip[]>(() => {
    if (mode !== 'week') return [];
    const weekMenu = loadWeekMenu();
    if (!weekMenu) return [];
    return buildShoppingSchedule(ingredients, weekMenu);
  }, [ingredients, mode]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (mode === 'banquet') {
        const banquet = loadBanquet();
        if (!banquet) {
          // Banquet expired or never set — fall back gracefully.
          setMode('week');
          return;
        }
        // Kids 0.5 + elders 0.8 mirrors the banquet algorithm dish-load math.
        // We bias slightly higher than dishToIngredients's default (kids*0.5)
        // because banquet portions tend to run larger than weekday family meals.
        const banquetAdultEquivalent = Math.ceil(
          banquet.adults + banquet.elders * 0.9 + banquet.kids * 0.5
        );
        setBanquetHeads(banquet.adults + banquet.kids + banquet.elders);
        setDishCount(banquet.dishes.length);

        await hydratePrepSteps(banquet.dishes);
        if (cancelled) return;
        const allRaw = banquet.dishes.flatMap(dish =>
          dishToIngredients(dish, banquetAdultEquivalent, 0)
        );
        setIngredients(aggregateIngredients(allRaw));
        setHaveIt(loadHomeInventory());
        return;
      }

      if (mode === 'week') {
        // Per-day scaling: each day might have a different headcount (e.g.
        // weekend has guests, weekday only the couple). Group dishes by day
        // and scale each day's portions by that day's headcount, then
        // aggregate. Without this, the shopping list silently used a single
        // headcount for the whole week and over- or under-bought.
        const weekMenu = loadWeekMenu();
        const days: any[] = weekMenu?.days ?? [];
        const allDishes = days.flatMap((d: any) => [...(d.dishes ?? []), ...(d.lunchDishes ?? [])]);
        await hydratePrepSteps(allDishes);
        if (cancelled) return;

        const allRaw: any[] = [];
        let total = 0;
        for (let i = 0; i < days.length; i++) {
          const d = days[i];
          const dayDishes = [...(d.dishes ?? []), ...(d.lunchDishes ?? [])];
          total += dayDishes.length;
          const { adults, kids } = readHeadcountForDay(i);
          for (const dish of dayDishes) {
            allRaw.push(...dishToIngredients(dish, adults, kids));
          }
        }
        setDishCount(total);
        setIngredients(aggregateIngredients(allRaw));
        setHaveIt(loadHomeInventory());
        return;
      }

      const { adults, kids } = readHeadcount();
      const dishes = getDishes(mode);
      setDishCount(dishes.length);

      await hydratePrepSteps(dishes);
      if (cancelled) return;
      const allRaw = dishes.flatMap(dish => dishToIngredients(dish, adults, kids));
      const aggregated = aggregateIngredients(allRaw);
      setIngredients(aggregated);
      setHaveIt(loadHomeInventory()); // rehydrate per-day persisted checks
    }

    run();
    return () => { cancelled = true; };
  }, [mode]);

  const toggleHave = (nameZh: string) => {
    setHaveIt(prev => {
      const next = { ...prev, [nameZh]: !prev[nameZh] };
      persistHomeInventory(next);
      return next;
    });
  };

  // Group by category
  const grouped = CATEGORY_GROUPS.map(g => ({
    group: `${g.emoji} ${g.label}`,
    emoji: g.emoji,
    label: g.label,
    items: ingredients.filter(i => g.categories.includes(i.category)),
  })).filter(g => g.items.length > 0);

  const needToBuy = ingredients.filter(i => !haveIt[i.nameZh]);
  const haveCount = ingredients.filter(i => haveIt[i.nameZh]).length;

  const handleExportExcel = () => {
    const today = new Date().toISOString().slice(0, 10);
    const title = mode === 'week' ? '本周采购清单' : '今日采购清单';

    // Sheet 1: 待购清单
    const buyRows = needToBuy.map(i => ({
      '类别': grouped.find(g => g.items.some(it => it.nameZh === i.nameZh))?.group ?? '',
      '食材': i.nameZh,
      '用量': formatWeight(i),
      '用于菜品': i.dishes.join('、'),
      '状态': '待购',
    }));

    // Sheet 2: 已有清单
    const haveRows = ingredients.filter(i => haveIt[i.nameZh]).map(i => ({
      '类别': grouped.find(g => g.items.some(it => it.nameZh === i.nameZh))?.group ?? '',
      '食材': i.nameZh,
      '用量': formatWeight(i),
      '用于菜品': i.dishes.join('、'),
      '状态': '已有',
    }));

    const wb = XLSX.utils.book_new();

    const wsBuy = XLSX.utils.json_to_sheet(buyRows.length > 0 ? buyRows : [{ '类别': '', '食材': '（无待购食材）', '用量': '', '用于菜品': '', '状态': '' }]);
    wsBuy['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsBuy, '待购清单');

    if (haveRows.length > 0) {
      const wsHave = XLSX.utils.json_to_sheet(haveRows);
      wsHave['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, wsHave, '家中已有');
    }

    XLSX.writeFile(wb, `${title}_${today}.xlsx`);
  };

  const handleCopy = async () => {
    const text = buildShoppingText(grouped, needToBuy);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: share via WhatsApp
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const isHelper = localStorage.getItem("nutri_role") === "helper";
  // Employer view shows the bottom tab bar; lift the footer above it.
  const footerBottomClass = isHelper ? 'bottom-0' : 'bottom-[60px]';

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-[#f5f5f5]">
      {/* Header */}
      <header className="bg-white sticky top-0 z-50 flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full bg-black/5 active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold">{t('Shopping List', '采购清单')}</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {mode === 'banquet'
              ? `家宴 ${banquetHeads} 人 · ${dishCount} 道菜 · ${ingredients.length} 种食材`
              : t(
                  `${mode === 'week' ? 'This week' : 'Today'} · ${dishCount} dishes · ${ingredients.length} items`,
                  `${mode === 'week' ? '本周' : '今日'} · ${dishCount} 道菜 · ${ingredients.length} 种食材`
                )}
          </p>
        </div>
        <div
          className="px-3 py-1.5 rounded-full text-[12px] font-bold"
          style={{
            background: haveCount === ingredients.length && ingredients.length > 0
              ? 'rgba(37,211,102,0.12)' : 'rgba(255,90,31,0.10)',
            color: haveCount === ingredients.length && ingredients.length > 0 ? '#25D366' : '#FF5A1F',
          }}
        >
          {haveCount}/{ingredients.length} {t('have', '已有')}
        </div>
      </header>

      <main className={`flex-1 px-4 py-4 space-y-4 ${isHelper ? 'pb-36' : 'pb-52'}`}>
        {/* Mode toggle — banquet appears only when a banquet payload exists */}
        <div className="bg-white rounded-2xl p-1.5 flex gap-1 shadow-sm">
          {(['today', 'week', ...(loadBanquet() ? ['banquet'] : [])] as ShopMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
                mode === m ? 'bg-[#FF5A1F] text-white shadow' : 'text-gray-400'
              }`}
            >
              {m === 'today'   ? t("Today's menu", '今日菜单')
               : m === 'week'  ? t("This week's menu", '本周菜单')
               :                 `🎉 ${t('Banquet', '家宴')}`}
            </button>
          ))}
        </div>

        {/* Weight unit toggle — defaults to metric. 港斤 covers wet-market shopping,
            磅 covers premium-store / online supermarket pricing. */}
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-gray-400 mr-1">单位</span>
          {([
            { id: 'metric', label: '克 / kg' },
            { id: 'hk_jin', label: '港斤 · 両' },
            { id: 'lb',     label: '磅 · oz' },
          ] as { id: WeightUnit; label: string }[]).map(u => (
            <button
              key={u.id}
              onClick={() => setWeightUnit(u.id)}
              className={`px-2 py-1 rounded-full font-bold transition-all ${
                weightUnit === u.id ? 'bg-[#FF5A1F] text-white' : 'bg-white text-gray-500 border border-black/10'
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>

        {/* By-category vs by-trip view toggle — only useful in 本周菜单 mode.
            By-trip splits the weekly buy into 2-3 trips (Mon / Wed / Fri)
            to match HK small-fridge shopping habits. */}
        {mode === 'week' && schedule.length > 1 && (
          <div className="bg-white rounded-2xl p-1.5 flex gap-1 shadow-sm">
            {([
              { id: 'category', label: '按类别' },
              { id: 'trip',     label: `按采购日 · ${schedule.length} 次` },
            ] as { id: typeof view; label: string }[]).map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`flex-1 py-2 rounded-xl text-[12px] font-bold transition-all ${
                  view === v.id ? 'bg-[#FF5A1F] text-white' : 'text-gray-400'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* Banquet mode banner with discard option */}
        {mode === 'banquet' && (
          <div className="rounded-2xl p-3 flex items-center gap-2"
            style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(255,165,0,0.06))",
              border: "1px solid rgba(255,165,0,0.30)",
            }}>
            <span className="text-[18px]">🎉</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[12px]" style={{ color: "#7a4d00" }}>
                家宴采购清单 · 按 {banquetHeads} 人席份量
              </p>
              <p className="text-[10px] text-gray-500">数量已按宴会规模放大</p>
            </div>
            <button
              onClick={() => { clearBanquet(); setMode('week'); }}
              className="text-[11px] font-bold px-2 py-1 rounded-full"
              style={{ background: "rgba(0,0,0,0.06)", color: "#666" }}
            >
              清空
            </button>
          </div>
        )}

        {/* Empty state — message + CTA differ by role */}
        {ingredients.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <span className="material-symbols-outlined text-5xl mb-3 block">shopping_basket</span>
            {isHelper ? (
              <>
                <p className="font-medium">{t('No menu yet', '还没有菜单')}</p>
                <p className="text-sm mt-1">
                  {t('Ask the employer to generate the menu first',
                     '请等雇主在首页生成菜单')}
                </p>
                <button
                  onClick={() => navigate('/helper')}
                  className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
                >
                  {t('Back to tasks', '返回任务')}
                </button>
              </>
            ) : (
              <>
                <p className="font-medium">还没有菜单</p>
                <p className="text-sm mt-1">
                  请先在首页生成{mode === 'week' ? '本周' : '今日'}菜单
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-5 py-2.5 rounded-full text-[13px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
                >
                  去生成菜单
                </button>
              </>
            )}
          </div>
        )}

        {/* By-trip schedule: render shopping-day cards instead of category groups */}
        {view === 'trip' && mode === 'week' && schedule.map(trip => (
          <section key={trip.dayIndex}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[20px]">{trip.emoji}</span>
              <div className="flex-1">
                <p className="font-bold text-[14px]">{trip.label} · {trip.items.length} 项</p>
                <p className="text-[10px] text-gray-400">{trip.reason}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {trip.items.map((item, i) => {
                const have = !!haveIt[item.nameZh];
                return (
                  <button
                    key={item.nameZh}
                    onClick={() => toggleHave(item.nameZh)}
                    className={`w-full flex items-center gap-4 px-4 py-3 transition-all active:scale-[0.99] ${
                      i !== trip.items.length - 1 ? 'border-b border-black/[0.05]' : ''
                    }`}
                    style={{ background: have ? 'rgba(37,211,102,0.04)' : 'white' }}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: have ? '#ef4444' : 'rgba(0,0,0,0.08)' }}>
                      {have && (
                        <span className="material-symbols-outlined text-white"
                          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>check</span>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-[14px]"
                        style={{ color: have ? '#ef4444' : '#1a1a1a', textDecoration: have ? 'line-through' : 'none' }}>
                        {item.nameZh}
                      </p>
                    </div>
                    {/* 我家有 chip — visual toggle on the row right side. Not
                        an independent button (the whole row is already a
                        button; nested buttons are invalid HTML). Clicks
                        anywhere on the row, including this chip, bubble to
                        the parent onClick and call toggleHave. */}
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors"
                      style={{
                        background: have ? 'rgba(37,211,102,0.18)' : 'rgba(0,0,0,0.06)',
                        color:      have ? '#16A34A' : 'rgba(0,0,0,0.45)',
                      }}>
                      {have ? '✓ 我家有' : '我家有？'}
                    </span>
                    <span className="text-[13px] font-bold"
                      style={{ color: have ? '#ef4444' : '#1a1a1a', textDecoration: have ? 'line-through' : 'none' }}>
                      {formatWeight(item, weightUnit)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* Category groups (default view) */}
        {view === 'category' && grouped.map(({ group, items }) => (
          <section key={group}>
            <p className="text-[13px] font-bold text-gray-500 mb-2 px-1">{group}</p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {items.map((item, i) => {
                const have = !!haveIt[item.nameZh];
                return (
                  <button
                    key={item.nameZh}
                    onClick={() => toggleHave(item.nameZh)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 transition-all active:scale-[0.99] ${
                      i !== items.length - 1 ? 'border-b border-black/[0.05]' : ''
                    }`}
                    style={{ background: have ? 'rgba(37,211,102,0.04)' : 'white' }}
                  >
                    {/* Checkbox */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: have ? '#ef4444' : 'rgba(0,0,0,0.08)' }}
                    >
                      {have && (
                        <span
                          className="material-symbols-outlined text-white"
                          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
                        >
                          check
                        </span>
                      )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p
                          className="font-semibold text-[15px]"
                          style={{
                            color: have ? '#ef4444' : '#1a1a1a',
                            textDecoration: have ? 'line-through' : 'none',
                          }}
                        >
                          {item.nameZh}
                        </p>
                        {(() => {
                          // Show Cantonese / Hong Kong-style name when different
                          // from the Mandarin one — saves wet-market confusion
                          // for mainlanders just arrived in HK.
                          const alias = getHKAlias(item.nameZh);
                          if (!alias?.yue || alias.yue === item.nameZh) return null;
                          return (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                              style={{ background: 'rgba(255,90,31,0.10)', color: '#FF5A1F' }}
                              title={alias.note ?? ''}
                            >
                              港: {alias.yue.split(' / ')[0]}
                            </span>
                          );
                        })()}
                      </div>
                      {item.dishes.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                          {item.dishes.slice(0, 2).join(' · ')}
                          {item.dishes.length > 2 ? ` +${item.dishes.length - 2}` : ''}
                        </p>
                      )}
                      {/* Suzie's Twist substitutes — when the primary item is
                          sold out the shopper knows what to grab instead.
                          Source: prep_steps_json.substitutes_zh, surfaced
                          through aggregateIngredients. */}
                      {item.substitutes && item.substitutes.length > 0 && (
                        <p className="text-[10px] mt-0.5 line-clamp-1"
                          style={{ color: have ? 'rgba(0,0,0,0.25)' : '#B45309' }}>
                          {t('Swap: ', '或买：')}{item.substitutes.slice(0, 3).join(' / ')}
                        </p>
                      )}
                    </div>

                    {/* Weight + status */}
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[14px] font-bold"
                        style={{
                          color: have ? '#ef4444' : '#1a1a1a',
                          textDecoration: have ? 'line-through' : 'none',
                        }}
                      >
                        {formatWeight(item, weightUnit)}
                      </span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors"
                        style={{
                          background: have ? 'rgba(37,211,102,0.18)' : 'rgba(0,0,0,0.06)',
                          color:      have ? '#16A34A' : 'rgba(0,0,0,0.45)',
                        }}>
                        {have ? '✓ 我家有' : '我家有？'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Supplier recommendations for this group — 3 picks (街市/超市/高端) */}
            <SupplierRow groupLabel={items.length > 0 ? extractGroupLabel(group) : ''} />
          </section>
        ))}
      </main>

      {/* Footer */}
      {ingredients.length > 0 && (
        <div className={`fixed ${footerBottomClass} left-0 right-0 max-w-md mx-auto bg-white border-t border-black/5 px-5 py-4 space-y-3`}>
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[15px]">
                {needToBuy.length > 0 ? `还需购买 ${needToBuy.length} 种食材` : '食材准备完毕 🎉'}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {haveCount > 0 ? `${haveCount} 种已有 · ` : ''}{needToBuy.length} 种待购
              </p>
            </div>
            <div className="flex items-center gap-2">
              {needToBuy.length > 0 && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-2.5 rounded-full text-[12px] font-bold transition-all active:scale-95"
                  style={{
                    background: copied ? 'rgba(37,211,102,0.1)' : 'rgba(0,0,0,0.06)',
                    color: copied ? '#25D366' : '#555',
                  }}
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  {copied ? '已复制' : '复制'}
                </button>
              )}
              <button
                onClick={() => {
                  if (!isPro) { setProGateOpen(true); return; }
                  handleExportExcel();
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-bold text-white transition-all active:scale-95 relative"
                style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)' }}
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                导出 Excel
                {!isPro && (
                  <span
                    className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black"
                    style={{
                      background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
                      color: 'white',
                      boxShadow: '0 2px 6px rgba(255,90,31,0.35)',
                    }}
                  >
                    🌟 Pro
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* WhatsApp send for helpers */}
          {isHelper && needToBuy.length > 0 && (
            <button
              onClick={() => {
                const text = buildShoppingText(grouped, needToBuy);
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="w-full py-3 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: 'white' }}
            >
              <span style={{ fontSize: 18 }}>📲</span>
              发送至 WhatsApp
            </button>
          )}
        </div>
      )}

      <BottomTabBar />

      {/* TICKET-074 §C — ProGate modal（复用 ProGate.tsx 设计语言：
          橙色渐变 emoji + 标题 + 副标题 + 升级 CTA）。点遮罩或「稍后再说」关闭。 */}
      {proGateOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setProGateOpen(false)}
        >
          <div
            className="rounded-3xl p-6 max-w-sm w-full text-center"
            style={{
              background: 'linear-gradient(135deg, #fff 0%, #fff5ef 100%)',
              border: '1px solid rgba(255,90,31,0.18)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[40px] mb-2">🛒</div>
            <h3 className="font-serif font-black text-[20px] mb-1" style={{ color: '#1a1a1a' }}>
              一键导出采购清单
            </h3>
            <p className="text-[13px] text-gray-500 mb-5">
              升级 Pro 解锁 Excel 导出 · 高端食材采购源 · 一键直送供应商
            </p>
            <button
              onClick={() => { setProGateOpen(false); navigate('/pricing'); }}
              className="w-full px-6 py-3 rounded-full font-bold text-white text-[14px] transition-all active:scale-95 mb-2"
              style={{
                background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
                boxShadow: '0 8px 24px rgba(255,90,31,0.30)',
              }}
            >
              升级解锁 →
            </button>
            <button
              onClick={() => setProGateOpen(false)}
              className="w-full py-2 rounded-full text-[12px] font-bold"
              style={{ color: 'rgba(0,0,0,0.45)' }}
            >
              稍后再说
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
