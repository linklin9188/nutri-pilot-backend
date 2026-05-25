import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { dishToIngredients, aggregateIngredients, type AggregatedIngredient } from "../lib/dishIngredients";
import * as XLSX from "xlsx";
import BottomTabBar from "../components/BottomTabBar";
import HelperBottomTabBar from "../components/HelperBottomTabBar";
import { useLanguage } from "../contexts/LanguageContext";
import { getHKAlias } from "../lib/hkNames";
import { ALGO_VERSION as WEEKLY_ALGO_VERSION, useWeeklyMenu } from "../hooks/useWeeklyMenu";
import { supabase } from "../lib/supabase";
import { useSubscription } from "../lib/subscription";
import { getUserId } from "../lib/userId";
import { loadActiveOrPreviewSuppliers, type SupplierWithBrand } from "../lib/suppliers";
import SupplierBrandModal from "../components/SupplierBrandModal";
// TICKET-080-A — 购物车 (Inalca 直供 SKU 加入购物车, 头部红点 + /cart 页)
import { addToCart, getCartCount } from "../lib/cart";
import {
  loadHomeInventory as loadHomeInventoryDb,
  inventoryToMap,
} from "../lib/homeInventory";
// TICKET-083 — 正确流程: 雇主只发清单不勾, 菲佣确认后雇主自动加车按 supplier 拆.
import {
  sendListToHelper,
  loadNotification,
  autoFillCartFromConfirmedList,
  markNotificationRead,
} from "../lib/purchaseFlow";

// ── Supplier direct-shipping (TICKET-038 第 4 步 §3) ─────────────────────
// Phase 2 骨架: 页面加载时拉一次 active SKU 列表 (supplier.status='active' +
// sku.active=true), 每个食材按 ingredient_keywords 做 case-insensitive 命中
// 检测; 命中 → 拉库存 cache + 显示 "🛒 由 X 直供" chip; 点 "一键下单" 调
// supplier-order-track edge fn 拿 redirect_url 新窗口打开.
//
// 当前 seed 的 supplier status='pending', 所以 activeSkus 为空, 整个供应商
// UI 自动隐藏 (no-op). 等老板谈完真供货商 UPDATE suppliers SET status='active'
// 后此 UI 自动激活, 前端 0 改动.
interface ActiveSupplierSku {
  sku_id:              string;
  supplier_id:         string;
  sku_name:            string;
  order_url:           string;
  ingredient_keywords: string[];
  supplier_name:       string;
  supplier_status:     'active' | 'preview';   // TICKET-077: preview → Coming Soon 按钮
  // TICKET-080-A — price + unit (来自 supplier_skus.retail_price_hkd + unit, 094 加列).
  // 给 +加入购物车 按钮显示 "HKD 120 / 500g"; null = 老 SKU 还没填 retail price.
  retail_price_hkd:    number | null;
  unit:                string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Fetch active SKUs joined with their (status='active') supplier. Returns []
 * on any failure — supplier UI must never block the shopping list.
 */
async function fetchActiveSupplierSkus(): Promise<ActiveSupplierSku[]> {
  try {
    const { data, error } = await supabase
      .from('supplier_skus')
      .select(`
        id,
        supplier_id,
        sku_name,
        order_url,
        ingredient_keywords,
        active,
        retail_price_hkd,
        price_hkd,
        unit,
        suppliers!supplier_skus_supplier_id_fkey ( name, status )
      `)
      .eq('active', true);
    if (error || !data) return [];
    // TICKET-077: 接受 status='active' 或 'preview' — preview 状态用于谈中阶段
    // 显示品牌介绍 + Coming Soon (不真下单), active 才走真下单流程.
    return (data as any[])
      .filter(r => ['active', 'preview'].includes(r.suppliers?.status ?? ''))
      .map(r => ({
        sku_id:              r.id,
        supplier_id:         r.supplier_id,
        sku_name:            r.sku_name,
        order_url:           r.order_url,
        ingredient_keywords: Array.isArray(r.ingredient_keywords) ? r.ingredient_keywords : [],
        supplier_name:       r.suppliers?.name ?? '',
        supplier_status:     (r.suppliers?.status ?? 'active') as 'active' | 'preview',
        retail_price_hkd:    typeof r.retail_price_hkd === 'number'
                               ? r.retail_price_hkd
                               : (typeof r.price_hkd === 'number' ? r.price_hkd : null),
        unit:                r.unit ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * Case-insensitive keyword match. Empty keyword list → never matches.
 * Returns the first matching SKU or null.
 */
function matchSkuForIngredient(
  ingredientNameZh: string,
  skus: ActiveSupplierSku[],
): ActiveSupplierSku | null {
  const lname = ingredientNameZh.toLowerCase();
  for (const sku of skus) {
    for (const kw of sku.ingredient_keywords) {
      if (!kw) continue;
      const lkw = kw.toLowerCase();
      if (lname.includes(lkw) || lkw.includes(lname)) return sku;
    }
  }
  return null;
}

/** GET /functions/v1/supplier-inventory-check?sku_id=... — returns null on failure. */
async function fetchStockCount(skuId: string): Promise<number | null> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/supplier-inventory-check?sku_id=${encodeURIComponent(skuId)}`;
    const res = await fetch(url, {
      method:  'GET',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return null;
    const j = await res.json() as { stock_count?: number };
    return typeof j.stock_count === 'number' ? j.stock_count : null;
  } catch {
    return null;
  }
}

/** POST /functions/v1/supplier-order-track — returns redirect_url or null. */
async function trackOrderAndGetRedirect(
  skuId: string,
  sourceDishId: string | null,
): Promise<string | null> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/supplier-order-track`;
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        sku_id:         skuId,
        source_dish_id: sourceDishId,
        source_page:    'verify-ingredients',
        user_id:        getUserId() || null,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json() as { ok?: boolean; redirect_url?: string };
    if (!j.ok || !j.redirect_url) return null;
    return j.redirect_url;
  } catch {
    return null;
  }
}

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

// TICKET-077 P0: 删除 SHOPS_BY_GROUP / ShopPick / SupplierRow — 它们是 3 家
// mock 采购点 (街市/超市/高端) 硬编码假数据, 给用户造成"我们已经接好这些
// 渠道"的错觉. 真合作供应商通过 DB suppliers 表读 + SupplierBrandModal 介绍.

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

// TICKET-077 P0: SupplierRow 已删除. 真合作供应商在页面顶部统一显示一条
// "合作供应商 · N 家" strip + Modal, 不再按食材分类硬塞推荐 — 那样会再次
// 造成"全品类都有合作"的错觉.

type ShopMode = 'today' | 'week' | 'banquet';

// ── Main component ─────────────────────────────────────────────────────────────
export default function VerifyIngredients() {
  const navigate = useNavigate();
  const { t, t3 } = useLanguage();

  // TICKET-074 §C — 删除强制跳转。非 Pro 用户能进页面看清单，
  // 但「导出 Excel」等一键动作改用按钮级 paywall（onClick 触发 ProGate modal）。
  const { isPro } = useSubscription();
  const [proGateOpen, setProGateOpen] = useState(false);

  // TICKET-048 P0: 用 useWeeklyMenu hook 拿菜单, 替代单纯 loadWeekMenu()
  // localStorage 读. useWeeklyMenu 内部 DB-first 优先级 (loadFromDB → LS → 生成),
  // 确保用户走 BottomTabBar 直接打开 /verify 时也能从 DB 拉到菜单 — 之前只读
  // LS 会在用户没先打开过 Home tab / 换浏览器 / LS 被清空的情况下显示空清单
  // (老板 2026-05-25 真测发现).
  const { weeklyMenu: hookWeeklyMenu, loading: hookMenuLoading } = useWeeklyMenu(0);

  // If the user just arrived from /banquet, default to that view.
  const arrivedFromBanquet = typeof window !== 'undefined'
    && window.location.search.includes('from=banquet')
    && !!loadBanquet();

  const [mode, setMode] = useState<ShopMode>(arrivedFromBanquet ? 'banquet' : 'week');
  const [ingredients, setIngredients] = useState<AggregatedIngredient[]>([]);
  const [dishCount, setDishCount] = useState(0);
  const [banquetHeads, setBanquetHeads] = useState(0);

  // 我家有 toggle — TICKET-075 §2/§4a: DB 主存 + LS 副 cache.
  // DB: home_inventory(household_id, ingredient_name, for_date) — 雇主菲佣共享.
  // LS: home_inventory_<userId>_<YYYY-MM-DD> — fast read + 离线/未绑 household
  //     时的兜底; mount 时如果 DB 空但 LS 有, 一次性迁移上去.
  const todayLocalStr = (() => {
    const d = new Date();
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  })();
  const homeInventoryKey = `home_inventory_${getUserId() ?? 'anon'}_${todayLocalStr}`;
  const loadHomeInventoryLs = (): Record<string, boolean> => {
    try {
      const raw = localStorage.getItem(homeInventoryKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  };
  const persistHomeInventoryLs = (map: Record<string, boolean>) => {
    // Only keep truthy entries — false / undefined are noise.
    const pruned: Record<string, boolean> = {};
    for (const k of Object.keys(map)) if (map[k]) pruned[k] = true;
    try { localStorage.setItem(homeInventoryKey, JSON.stringify(pruned)); } catch { /* quota */ }
  };
  // true = "已有"，false = "需要买"
  const [haveIt, setHaveIt] = useState<Record<string, boolean>>(() => loadHomeInventoryLs());

  // TICKET-075 §4c — householdId state. mount 时拉雇主名下第一个 household;
  // 没绑就保持 null → DB 写跳过, LS 仍 work (单设备老路径). 后续 helper 加入
  // household 后, 雇主再开 /verify 自然拿到 id.
  const [householdId, setHouseholdId] = useState<string | null>(null);
  // TICKET-083 — 雇主流程 4 态机:
  //   idle           — 还没发过 (按钮显 "📤 发送清单给菲佣")
  //   sending        — 正在调 sendListToHelper (按钮 disabled)
  //   sent           — employer_sent 通知已写 + 菲佣还没确认 (按钮显"✓ 已发送 · 等菲佣")
  //   helper_confirmed — 菲佣确认完了 + 还要买 N 件 (按钮显"✅ 菲佣已确认 · 还要买 N 件 → 去购物车")
  const [purchaseState, setPurchaseState] = useState<'idle' | 'sending' | 'sent' | 'helper_confirmed'>('idle');
  const [toBeBoughtCount, setToBeBoughtCount] = useState(0);
  const [helperConfirmedNotifId, setHelperConfirmedNotifId] = useState<string | null>(null);
  const [autoFillingCart, setAutoFillingCart] = useState(false);
  const [copied, setCopied] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(() =>
    (localStorage.getItem('nutri_weight_unit') as WeightUnit) || 'metric'
  );
  // Persist the user's pick so the choice survives reloads.
  useEffect(() => { localStorage.setItem('nutri_weight_unit', weightUnit); }, [weightUnit]);

  // 'by-category' (existing) vs 'by-trip' (split into 2-3 shopping days).
  const [view, setView] = useState<'category' | 'trip'>('category');

  // TICKET-038 §3 — active 供应商 SKU 列表 + 库存 cache (按 sku_id 索引).
  // 加载一次, 整页共享. 失败保持 [] 让现有清单功能不受影响.
  const [activeSkus, setActiveSkus] = useState<ActiveSupplierSku[]>([]);
  const [stockBySkuId, setStockBySkuId] = useState<Record<string, number | null>>({});
  const [orderingSkuId, setOrderingSkuId] = useState<string | null>(null);

  // TICKET-077 P0 — DB 真合作供应商列表 (status='active' 或 'preview') +
  // 公司介绍 modal 状态 + Coming Soon 弹卡 (preview 状态下点"下单"显示).
  const [previewSuppliers, setPreviewSuppliers] = useState<SupplierWithBrand[]>([]);
  const [brandModalSupplier, setBrandModalSupplier] = useState<SupplierWithBrand | null>(null);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  // TICKET-080-A — 购物车数量 (红点) + 加车按钮 loading 状态 + 加成功 toast.
  const [cartCount, setCartCount] = useState(0);
  const [addingToCartSkuId, setAddingToCartSkuId] = useState<string | null>(null);
  const [cartToast, setCartToast] = useState<string | null>(null);
  // Cache the schedule per current ingredients/mode so we don't recompute on
  // every render (computing requires reading the weekly menu off localStorage).
  // TICKET-048 P0: hookWeeklyMenu 优先, fallback 到 LS (deep-link / 老缓存).
  const schedule = useMemo<ShoppingTrip[]>(() => {
    if (mode !== 'week') return [];
    const weekMenu = hookWeeklyMenu ?? loadWeekMenu();
    if (!weekMenu) return [];
    return buildShoppingSchedule(ingredients, weekMenu);
  }, [ingredients, mode, hookWeeklyMenu]);

  // Load active SKUs once on mount. status='pending' supplier → returns [],
  // chip / stock / 一键下单 全部自动隐藏. 老板切到 'active' 后此 UI 自动生效.
  useEffect(() => {
    let cancelled = false;
    fetchActiveSupplierSkus().then(skus => {
      if (cancelled) return;
      setActiveSkus(skus);
    });
    return () => { cancelled = true; };
  }, []);

  // TICKET-077 P0 — 拉真合作供应商列表 (status in active/preview).
  // 失败 → [], 顶部 strip 隐藏, 不影响清单功能.
  useEffect(() => {
    let cancelled = false;
    loadActiveOrPreviewSuppliers().then(list => {
      if (cancelled) return;
      setPreviewSuppliers(list);
    });
    return () => { cancelled = true; };
  }, []);

  // TICKET-080-A — 购物车数量同步: mount 时拉一次 + 监听 nutri-cart-changed 事件.
  // addToCart 内部 dispatch 此事件, 加完车头部红点立刻刷新.
  useEffect(() => {
    let cancelled = false;
    const uid = getUserId();
    if (!uid) return;
    const refresh = async () => {
      const n = await getCartCount(uid);
      if (!cancelled) setCartCount(n);
    };
    refresh();
    const handler = () => { refresh(); };
    window.addEventListener('nutri-cart-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('nutri-cart-changed', handler);
    };
  }, []);

  // TICKET-075 §4c — 拉雇主名下第一个 household, 拿到 id 后立刻 DB-load inventory.
  // 没有 household (用户没绑菲佣) → 留 null, 整页 fallback LS-only 路径 (旧行为).
  useEffect(() => {
    let cancelled = false;
    const uid = getUserId();
    if (!uid) return;
    (async () => {
      const { data } = await supabase
        .from('households')
        .select('id')
        .eq('employer_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const hid = (data as any)?.id as string | undefined;
      if (!hid) return;
      setHouseholdId(hid);

      // TICKET-083 — 雇主端纯只读: 拉 DB inventory 只为展示菲佣勾过哪些 (haveIt),
      // 不再 LS 双写, 也不允许雇主自己 toggle. 数据源头 = 菲佣.
      const items = await loadHomeInventoryDb(hid, todayLocalStr);
      if (cancelled) return;
      setHaveIt(inventoryToMap(items));

      // TICKET-083 — 加载今日通知状态 → 决定按钮显啥
      //   helper_confirmed 存在 → state=helper_confirmed (优先级最高)
      //   employer_sent 存在 → state=sent
      //   都不存在 → state=idle
      const helperConfirmed = await loadNotification(hid, 'helper_confirmed', todayLocalStr);
      if (cancelled) return;
      if (helperConfirmed) {
        setPurchaseState('helper_confirmed');
        setToBeBoughtCount(helperConfirmed.to_be_bought_count ?? 0);
        setHelperConfirmedNotifId(helperConfirmed.id);
        return;
      }
      const employerSent = await loadNotification(hid, 'employer_sent', todayLocalStr);
      if (cancelled) return;
      if (employerSent) setPurchaseState('sent');
    })().catch(e => console.warn('[verify] household/inventory fetch:', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 食材清单变化或 SKU 列表变化 → 对每个 (有命中 SKU 的) 食材拉一次库存.
  // 不阻塞主清单渲染; 库存返 null 时 chip 隐藏 "剩 N 件" 字样.
  useEffect(() => {
    if (activeSkus.length === 0 || ingredients.length === 0) return;
    let cancelled = false;
    const skuIdsToFetch = new Set<string>();
    for (const ing of ingredients) {
      const sku = matchSkuForIngredient(ing.nameZh, activeSkus);
      if (sku && !(sku.sku_id in stockBySkuId)) skuIdsToFetch.add(sku.sku_id);
    }
    if (skuIdsToFetch.size === 0) return;
    (async () => {
      const results = await Promise.all(
        [...skuIdsToFetch].map(async id => [id, await fetchStockCount(id)] as const),
      );
      if (cancelled) return;
      setStockBySkuId(prev => {
        const next = { ...prev };
        for (const [id, count] of results) next[id] = count;
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [activeSkus, ingredients]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setHaveIt(loadHomeInventoryLs());
        return;
      }

      if (mode === 'week') {
        // Per-day scaling: each day might have a different headcount (e.g.
        // weekend has guests, weekday only the couple). Group dishes by day
        // and scale each day's portions by that day's headcount, then
        // aggregate. Without this, the shopping list silently used a single
        // headcount for the whole week and over- or under-bought.
        // TICKET-048 P0: hookWeeklyMenu 优先 (DB-first), 回退 LS — 修「采购清单空」
        // 真因: DB 有菜单但 localStorage 没 → loadWeekMenu() 返 null → ingredients=[].
        const weekMenu = hookWeeklyMenu ?? loadWeekMenu();
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
        setHaveIt(loadHomeInventoryLs());
        return;
      }

      // mode === 'today': 复用 hookWeeklyMenu (DB-first), fallback LS.
      const { adults, kids } = readHeadcount();
      const todayMenu = hookWeeklyMenu ?? loadWeekMenu();
      let dishes: any[] = [];
      if (todayMenu) {
        const todayStr = getTodayLocal();
        const todayEntry = (todayMenu.days ?? []).find((d: any) => d.date === todayStr) ?? todayMenu.days?.[0];
        dishes = todayEntry ? [...(todayEntry.dishes ?? []), ...(todayEntry.lunchDishes ?? [])] : [];
      }
      setDishCount(dishes.length);

      await hydratePrepSteps(dishes);
      if (cancelled) return;
      const allRaw = dishes.flatMap(dish => dishToIngredients(dish, adults, kids));
      const aggregated = aggregateIngredients(allRaw);
      setIngredients(aggregated);
      setHaveIt(loadHomeInventoryLs()); // rehydrate per-day persisted checks
    }

    run();
    return () => { cancelled = true; };
    // hookWeeklyMenu changes when DB load completes or regen — pull deps in
    // so ingredients refresh once the hook resolves.
  }, [mode, hookWeeklyMenu]);

  // TICKET-083 §3b — 雇主"📤 发送清单给菲佣". 只写 employer_sent notification,
  // 不再 batch-commit haveIt (那是 075 老逻辑, 把流程做反了).
  // 数据源头 = 菲佣, 雇主只发清单.
  const handleSendListToHelper = async () => {
    if (purchaseState === 'sending') return;
    if (!householdId) {
      alert(t('Bind a helper first (Settings → Family)', '请先在「设置 → 家庭」绑定菲佣后再通知'));
      return;
    }
    setPurchaseState('sending');
    const ok = await sendListToHelper(householdId, todayLocalStr);
    setPurchaseState(ok ? 'sent' : 'idle');
  };

  // TICKET-083 §3c — 雇主收到"菲佣已确认"红卡后点 → 自动把"要买的"加进购物车
  // (按 supplier 分组). 加完跳 /cart 让用户结账.
  const handleAutoFillAndGoCart = async () => {
    if (autoFillingCart) return;
    if (!householdId) return;
    const uid = getUserId();
    if (!uid) { navigate('/login'); return; }
    setAutoFillingCart(true);
    try {
      const result = await autoFillCartFromConfirmedList(uid, householdId, todayLocalStr);
      // 标记 helper_confirmed 通知已读, 防 Home 红点持续弹
      if (helperConfirmedNotifId) {
        markNotificationRead(helperConfirmedNotifId).catch(() => {});
      }
      // 没匹配的 SKU 用 toast 友好提示; 不阻塞跳转 (匹配的已在车里)
      if (result.unmatchedCount > 0) {
        setCartToast(t3(
          `${result.totalItemsAdded} added · ${result.unmatchedCount} unmatched`,
          `已加 ${result.totalItemsAdded} 件 · ${result.unmatchedCount} 件无直供, 请自购`,
          `${result.totalItemsAdded} naidagdag · ${result.unmatchedCount} bilhin sa labas`,
        ));
        setTimeout(() => setCartToast(null), 2200);
      }
      navigate('/cart');
    } finally {
      setAutoFillingCart(false);
    }
  };

  // 一键下单: POST track 拿 redirect_url → 新窗口打开. 失败 silent (不弹 alert
  // 干扰清单流). orderingSkuId 用来 disable 按钮防双击.
  //
  // TICKET-077 P0 红线: status='preview' 的 supplier 走 Coming Soon 弹卡, 不走
  // mailto / tel — 销售联系方式是商业机密, 绝不能露给用户. preview 阶段也不要
  // 调真 supplier-order-track edge fn (那是 active supplier 的真下单流程).
  const handleSupplierOrder = async (sku: ActiveSupplierSku) => {
    if (sku.supplier_status === 'preview') {
      setComingSoonOpen(true);
      return;
    }
    if (orderingSkuId) return;
    setOrderingSkuId(sku.sku_id);
    try {
      const redirectUrl = await trackOrderAndGetRedirect(sku.sku_id, null);
      if (redirectUrl) {
        window.open(redirectUrl, '_blank');
      }
    } finally {
      setOrderingSkuId(null);
    }
  };

  // TICKET-080-A — 加入购物车. preview 状态 SKU 也允许加车 (反正 080-A 不接 Stripe
  // 真支付, 老板拍板"先让用户能看到购物流程"). 真支付 080-B 接通时如还在 preview
  // 阶段, 同一红线 (Coming Soon) 在 checkout 页拦.
  const handleAddToCart = async (skuId: string) => {
    if (addingToCartSkuId) return;
    const uid = getUserId();
    if (!uid) { navigate('/login'); return; }
    setAddingToCartSkuId(skuId);
    try {
      const ok = await addToCart(uid, skuId, 1);
      if (ok) {
        setCartToast(t3('Added', '已加入购物车', 'Naidagdag'));
        setTimeout(() => setCartToast(null), 1800);
      } else {
        setCartToast(t3('Failed, please retry', '加入失败, 请重试', 'Subukan ulit'));
        setTimeout(() => setCartToast(null), 1800);
      }
    } finally {
      setAddingToCartSkuId(null);
    }
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
  // UI 014 §L: helper 现在也有 page-level HelperBottomTabBar (~60px)，
  // footer CTA 上推 60px 给 tab bar 让位；employer 走 BottomTabBar (~60px) 同 offset。
  const footerBottomClass = 'bottom-[60px]';

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
        {/* TICKET-080-A — 购物车入口 icon + 红点数量. 点跳 /cart 查看 SKU 列表. */}
        <button
          onClick={() => navigate('/cart')}
          aria-label={t3('Cart', '购物车', 'Cart')}
          className="relative p-2 rounded-full bg-black/5 active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
          {cartCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold"
              style={{ background: '#ef4444' }}
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>
      </header>

      <main className={`flex-1 px-4 py-4 space-y-4 ${isHelper ? 'pb-36' : 'pb-52'}`}>
        {/* TICKET-077 P0: 真合作供应商 strip — DB suppliers (status active/preview).
            previewSuppliers 为空 (DB 没真供应商) → 不渲染, 整页清单功能不受影响.
            点卡片 → 弹 SupplierBrandModal (公司介绍 + 信任认证, 不露销售). */}
        {previewSuppliers.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
              {t3(
                `Trusted Suppliers · ${previewSuppliers.length}`,
                `合作供应商 · ${previewSuppliers.length} 家`,
                `Mga Suppliers · ${previewSuppliers.length}`,
              )}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {previewSuppliers.map(s => (
                <button
                  key={s.id}
                  onClick={() => setBrandModalSupplier(s)}
                  className="flex-shrink-0 bg-white rounded-2xl p-3 shadow-sm text-left active:scale-[0.98] transition-all"
                  style={{
                    minWidth: 220,
                    border: '1px solid rgba(255,90,31,0.18)',
                    borderLeft: '3px solid #FF5A1F',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {s.country_origin === 'IT' && <span style={{ fontSize: 16 }}>🇮🇹</span>}
                    <span className="font-bold text-[13px]" style={{ color: '#1a1a1a' }}>
                      {s.name}
                    </span>
                    {s.status === 'preview' && (
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                        style={{ background: 'rgba(255,90,31,0.12)', color: '#FF5A1F' }}
                      >
                        {t3('PREVIEW', '即将上线', 'PREVIEW')}
                      </span>
                    )}
                  </div>
                  {s.parent_brand && (
                    <p className="text-[10px] text-gray-500 truncate">{s.parent_brand}</p>
                  )}
                  <p className="text-[10px] font-bold mt-1" style={{ color: '#FF5A1F' }}>
                    ⓘ {t3('View details', '查看品牌介绍', 'Tingnan')}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

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

        {/* TICKET-048 P0: hookWeeklyMenu loading 状态 — 避免菜单还在 DB 加载时
            就闪过「还没有菜单」误导用户。 */}
        {ingredients.length === 0 && hookMenuLoading && mode !== 'banquet' && (
          <div className="text-center py-20 text-gray-400">
            <span className="material-symbols-outlined text-5xl mb-3 block animate-pulse">restaurant_menu</span>
            <p className="font-medium">菜单加载中…</p>
            <p className="text-sm mt-1 text-gray-300">正在从云端获取本周菜单</p>
          </div>
        )}

        {/* Empty state — message + CTA differ by role */}
        {ingredients.length === 0 && !hookMenuLoading && (
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
              {/* TICKET-083 — 雇主端只读清单 (不再勾"我家有"). 菲佣端 HelperPrep
                  才是数据源头, 雇主只看 + 等通知. 显"✓ 菲佣已确认"小字 (haveIt 来自
                  DB inventory.is_available=true 的行). */}
              {trip.items.map((item, i) => {
                const have = !!haveIt[item.nameZh];
                return (
                  <div
                    key={item.nameZh}
                    className={`w-full flex items-center gap-4 px-4 py-3 ${
                      i !== trip.items.length - 1 ? 'border-b border-black/[0.05]' : ''
                    }`}
                    style={{ background: have ? 'rgba(37,211,102,0.04)' : 'white' }}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: have ? '#16A34A' : 'rgba(0,0,0,0.08)' }}>
                      {have && (
                        <span className="material-symbols-outlined text-white"
                          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>check</span>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-[14px]"
                        style={{ color: have ? '#16A34A' : '#1a1a1a', textDecoration: have ? 'line-through' : 'none' }}>
                        {item.nameZh}
                      </p>
                      {item.variants && item.variants.length >= 2 && (
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                          ({item.variants.join(' + ')})
                        </p>
                      )}
                    </div>
                    {have && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(37,211,102,0.18)', color: '#16A34A' }}>
                        {t3('Helper has', '菲佣已有', 'Meron helper')}
                      </span>
                    )}
                    <span className="text-[13px] font-bold"
                      style={{ color: have ? '#16A34A' : '#1a1a1a', textDecoration: have ? 'line-through' : 'none' }}>
                      {formatWeight(item, weightUnit)}
                    </span>
                  </div>
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
                const matchedSku = activeSkus.length > 0
                  ? matchSkuForIngredient(item.nameZh, activeSkus)
                  : null;
                const stockCount = matchedSku ? stockBySkuId[matchedSku.sku_id] : undefined;
                const isOrdering = !!matchedSku && orderingSkuId === matchedSku.sku_id;
                return (
                  <div
                    key={item.nameZh}
                    className={i !== items.length - 1 ? 'border-b border-black/[0.05]' : ''}
                  >
                    {/* TICKET-083 — 雇主端只读 (button → div). 菲佣是数据源头. */}
                    <div
                      className="w-full flex items-center gap-4 px-4 py-3.5"
                      style={{ background: have ? 'rgba(37,211,102,0.04)' : 'white' }}
                    >
                      {/* Checkbox — 显示菲佣勾过的(绿勾), 雇主端不可点 */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: have ? '#16A34A' : 'rgba(0,0,0,0.08)' }}
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
                              color: have ? '#16A34A' : '#1a1a1a',
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
                        {/* TICKET-049 P1: 规范化合并后的原始变体名小字注释 —
                            例：canonical=葱 + variants=[葱段,葱丝] → 显示 "(葱段 + 葱丝)"
                            放在 dishes 上面、紧贴主名，让用户立刻看到合并原因 */}
                        {item.variants && item.variants.length >= 2 && (
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                            ({item.variants.join(' + ')})
                          </p>
                        )}
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
                            color: have ? '#16A34A' : '#1a1a1a',
                            textDecoration: have ? 'line-through' : 'none',
                          }}
                        >
                          {formatWeight(item, weightUnit)}
                        </span>
                        {/* TICKET-083 — 雇主端只读, 只在菲佣勾过的食材上显小绿章. */}
                        {have && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(37,211,102,0.18)', color: '#16A34A' }}>
                            {t3('✓ Helper has', '✓ 菲佣已有', '✓ Meron helper')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* TICKET-038 §3 — Supplier 直供 bar. 只在该食材命中 active
                        SKU 且非「已有」时显示. Placed BELOW the toggle button
                        on purpose: nested buttons are invalid HTML, and we
                        need 「一键下单」 to be its own clickable button
                        without bubbling toggle-have. */}
                    {matchedSku && !have && (
                      <div
                        className="flex flex-col gap-2 px-4 py-2"
                        style={{
                          background: 'linear-gradient(90deg, rgba(255,90,31,0.06), rgba(255,140,84,0.03))',
                          borderTop: '1px dashed rgba(255,90,31,0.18)',
                        }}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: 'rgba(255,90,31,0.12)', color: '#FF5A1F' }}
                          >
                            🛒 由 {matchedSku.supplier_name} 直供
                          </span>
                          {typeof stockCount === 'number' && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: stockCount > 10 ? 'rgba(37,211,102,0.12)' : 'rgba(239,68,68,0.10)',
                                color:      stockCount > 10 ? '#16A34A' : '#ef4444',
                              }}
                            >
                              剩 {stockCount} 件
                            </span>
                          )}
                          <button
                            onClick={() => handleSupplierOrder(matchedSku)}
                            disabled={isOrdering}
                            className="ml-auto px-3 py-1 rounded-full text-[11px] font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)' }}
                          >
                            {/* TICKET-077: preview 状态 → "即将开放" 不露销售; active → 真下单 */}
                            {isOrdering
                              ? t3('Loading…', '跳转中…', 'Loading…')
                              : matchedSku.supplier_status === 'preview'
                                ? t3('Coming Soon', '即将开放', 'Paparating')
                                : t3('Order →', '一键下单 →', 'Mag-order →')}
                          </button>
                        </div>

                        {/* TICKET-080-A — 价格 + 加入购物车 行. 只在 retail_price_hkd
                            存在时渲染 (老 SKU 无定价不显, 不阻塞旧流程). 加车按钮
                            走 /cart → /checkout, 不抢 "一键下单 → 跳供应商" 的位. */}
                        {typeof matchedSku.retail_price_hkd === 'number' && matchedSku.retail_price_hkd > 0 && (
                          <div className="flex items-center justify-between gap-2 bg-white/70 rounded-xl px-2.5 py-2">
                            <div className="flex flex-col">
                              <p className="text-[11px] font-bold" style={{ color: '#1a1a1a' }}>
                                {matchedSku.sku_name}
                              </p>
                              <p className="text-[12px] font-black" style={{ color: '#FF5A1F' }}>
                                HKD {matchedSku.retail_price_hkd.toFixed(2)}
                                {matchedSku.unit ? <span className="text-[10px] text-gray-500 font-normal"> / {matchedSku.unit}</span> : null}
                              </p>
                            </div>
                            <button
                              onClick={() => handleAddToCart(matchedSku.sku_id)}
                              disabled={addingToCartSkuId === matchedSku.sku_id}
                              className="px-3 py-1.5 rounded-lg font-bold text-[11px] text-white active:scale-95 transition-all disabled:opacity-60 flex items-center gap-1"
                              style={{ background: '#FF5A1F' }}
                            >
                              {addingToCartSkuId === matchedSku.sku_id ? (
                                t3('...', '加入中', '...')
                              ) : (
                                <>
                                  <span>+</span>
                                  <span>{t3('Add', '加入购物车', 'Idagdag')}</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* TICKET-077: 3 家硬编码 mock 推荐采购点已删除. 真合作供应商在
                页面顶部 "合作供应商" strip 统一显示 (loadActiveOrPreviewSuppliers). */}
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

          {/* TICKET-083 §3b/§3c — 雇主 3 态机:
                idle              → "📤 发送清单给菲佣"
                sending           → "通知中…" (disabled)
                sent              → "✓ 已发送 · 等菲佣确认" (disabled, 灰)
                helper_confirmed  → "✅ 菲佣已确认 · 还要买 N 件 → 去购物车" (橙→绿)
              数据源头 = 菲佣, 雇主不勾"我家有" (075 反向流程已修). */}
          {!isHelper && (
            <button
              onClick={
                purchaseState === 'helper_confirmed'
                  ? handleAutoFillAndGoCart
                  : handleSendListToHelper
              }
              disabled={
                purchaseState === 'sending' ||
                purchaseState === 'sent' ||
                autoFillingCart
              }
              className="w-full py-3 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
              style={{
                background: purchaseState === 'helper_confirmed'
                  ? 'linear-gradient(135deg, #25D366, #16A34A)'
                  : purchaseState === 'sent'
                    ? 'linear-gradient(135deg, #9ca3af, #6b7280)'
                    : 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
                color: 'white',
                boxShadow: '0 6px 16px rgba(255,90,31,0.20)',
              }}
            >
              <span className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 1" }}>
                {purchaseState === 'helper_confirmed'
                  ? 'shopping_cart'
                  : purchaseState === 'sent'
                    ? 'check_circle'
                    : 'send'}
              </span>
              {autoFillingCart
                ? t3('Adding to cart…', '加入购物车中…', 'Inilalagay sa cart…')
                : purchaseState === 'sending'
                  ? t3('Sending…', '通知中…', 'Pinapadala…')
                  : purchaseState === 'sent'
                    ? t3('Sent · Waiting for helper', '✓ 已发送 · 等菲佣确认', '✓ Naipadala · Hintay sa helper')
                    : purchaseState === 'helper_confirmed'
                      ? t3(
                          `Helper confirmed · ${toBeBoughtCount} to buy → Cart`,
                          `✅ 菲佣已确认 · 还要买 ${toBeBoughtCount} 件 → 去购物车`,
                          `Kumpirmado · ${toBeBoughtCount} bibilhin → Cart`,
                        )
                      : t3(
                          '📤 Send list to helper',
                          '📤 发送清单给菲佣',
                          '📤 Ipadala sa helper',
                        )}
            </button>
          )}
        </div>
      )}

      <BottomTabBar />
      <HelperBottomTabBar />

      {/* TICKET-080-A — 加入购物车 toast (短暂 1.8s 后自动消失). */}
      {cartToast && (
        <div
          className="fixed left-1/2 z-[110] px-4 py-2.5 rounded-full text-white font-bold text-[13px] shadow-lg pointer-events-none"
          style={{
            bottom: '120px',
            transform: 'translateX(-50%)',
            background: 'rgba(20,20,20,0.92)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.30)',
          }}
        >
          {cartToast}
        </div>
      )}

      {/* TICKET-077 P0 — 公司介绍 modal (合作供应商点卡片触发). 不渲染销售联系方式. */}
      <SupplierBrandModal
        open={!!brandModalSupplier}
        supplier={brandModalSupplier}
        onClose={() => setBrandModalSupplier(null)}
      />

      {/* TICKET-077 P0 — Coming Soon 弹卡 (preview 状态 supplier 点"即将开放"按钮触发).
          不能露 mailto / tel — 销售联系方式是商业机密. */}
      {comingSoonOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setComingSoonOpen(false)}
        >
          <div
            className="rounded-3xl p-6 max-w-sm w-full text-center"
            style={{
              background: 'linear-gradient(135deg, #fff 0%, #fff5ef 100%)',
              border: '1px solid rgba(255,90,31,0.18)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.30)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[40px] mb-2">🔗</div>
            <h3 className="font-bold text-[18px] mb-2" style={{ color: '#1a1a1a' }}>
              {t3('Online ordering coming soon', '即将开放在线下单', 'Online ordering coming soon')}
            </h3>
            <p className="text-[13px] text-gray-500 mb-5 leading-relaxed">
              {t3(
                "Thanks for your interest! We're integrating with the supplier's system. Once live, you'll be the first to know.",
                '感谢关注！我们正在为您接入供应商直采系统, 上线后第一时间通知您。',
                'Salamat sa interes! Inaayos namin ang sistema ng supplier. Ikaw ang unang malalaman pag live na.',
              )}
            </p>
            <button
              onClick={() => setComingSoonOpen(false)}
              className="w-full px-6 py-3 rounded-full font-bold text-white text-[14px] transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)',
                boxShadow: '0 8px 24px rgba(255,90,31,0.30)',
              }}
            >
              {t3('Got it', '知道了', 'Sige')}
            </button>
          </div>
        </div>
      )}

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
            {/* TICKET-077 P0: 删 "Excel 导出" 字眼 (Excel 已是免费版功能, 不再当
                Pro 卖点); 保留"高端食材采购源 · 一键直送供应商"作为 Pro 差异化. */}
            <p className="text-[13px] text-gray-500 mb-5">
              升级 Pro 解锁 高端食材采购源 · 一键直送合作供应商
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
