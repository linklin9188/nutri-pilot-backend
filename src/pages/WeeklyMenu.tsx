/**
 * WeeklyMenu — 7-day meal plan UI
 * Design: consistent with Home.tsx (dark bg, white cards, #FF5A1F orange accents)
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useWeeklyMenu, todayDayIndex, isFruitVeggieInSeason, getCurrentSolarTermZh, isWeekend, getWeekStartISO } from "../hooks/useWeeklyMenu";
// TICKET-043 — WeekendDiningReport import 删除 (老板拍板餐厅推荐转移到 /home).
import { type SupabaseDish } from "../hooks/useSupabaseMenu";
import { supabase } from "../lib/supabase";
import BottomTabBar from "../components/BottomTabBar";
import {
  loadFamilyMembers, loadHomeToday, saveHomeToday, dishAllergyFor,
  loadHomeByDay, saveHomeForDay,
  ALLERGY_INGREDIENTS, ALLERGY_TITLE_KEYWORDS,
  type FamilyMember,
} from "../lib/familyPrefs";
import { useSubscription } from "../lib/subscription";
import { TagBadgeRow, type TagBadge } from "../components/TagBadge";
import CandidateGrid from "../components/CandidateGrid";
import type { SlotPlan, SlotChoice } from "../hooks/useWeeklyMenu";
import { getEatenToday, markEaten } from "../lib/eatingDiary";
import { logMealEaten } from "../lib/mealLog";
import { getDishTitle } from "../lib/dishTitleI18n";
import { elevateDayToMichelin, type MichelinDish } from "../lib/michelinFromDb";
import ChefBookingModal from "../components/ChefBookingModal";
import { NutritionRadarCard } from "../components/NutritionRadar";
import IntentInputBox from "../components/IntentInputBox";
import ChatSwapModal from "../components/ChatSwapModal";
import { loadIntentBias, clearIntentBias, type IntentBias } from "../lib/intentBias";
import { useLanguage } from "../contexts/LanguageContext";
import { loadDailySchedule, setDailyMealTime, type DailyMealSchedule } from "../lib/dailyMealSchedule";
import { getUserId } from "../lib/userId";

// ── Day tabs ──────────────────────────────────────────────────────────────────

// UI 014 §C: 5 天工作日制 + 第 6 个 "周末" tab，点击展示 WeekendDiningReport。
// Algorithm 014 已 ship WORKDAYS_PER_WEEK=5 + ALGO_VERSION v50，weeklyMenu.days.length === 5。
// TICKET-043 — 删 "周末" tab (老板拍板"菜单里是下周的菜单. 推荐的餐厅在首页").
// 周一-五 5 个 tab, 周末默认显 day 0 (下周一菜单, useWeeklyMenu weekOffset=1 已切下周).
const DAYS_ZH = ["周一", "周二", "周三", "周四", "周五"];
const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// TICKET-030 §B — DAYS resolver used inside components; lang from useLanguage.
function dayLabel(i: number, isZh: boolean): string {
  return (isZh ? DAYS_ZH : DAYS_EN)[i] ?? '';
}
// Back-compat re-export for any external readers (none in tree at this time).
const DAYS = DAYS_ZH;
const WEEKEND_TAB_IDX = 5;
const MEALS_ZH = [
  { label: "早餐", icon: "☀️", color: "#FF9F43" },
  { label: "午餐", icon: "🌤️", color: "#FF5A1F" },
  { label: "晚餐", icon: "🌙", color: "#6C5CE7" },
];
const MEALS_EN = [
  { label: "Breakfast", icon: "☀️", color: "#FF9F43" },
  { label: "Lunch",     icon: "🌤️", color: "#FF5A1F" },
  { label: "Dinner",    icon: "🌙", color: "#6C5CE7" },
];
function mealMeta(idx: number, isZh: boolean) {
  return (isZh ? MEALS_ZH : MEALS_EN)[idx];
}
const MEALS = MEALS_ZH;

// Nutrition estimate per dish type (rough, for display only)
const NUTRITION_BY_TYPE: Record<string, { cal: number; pro: number; fat: number; carb: number }> = {
  MEAT:    { cal: 320, pro: 28, fat: 18, carb: 8  },
  SEAFOOD: { cal: 220, pro: 32, fat: 8,  carb: 4  },
  VEGGIE:  { cal: 120, pro: 6,  fat: 4,  carb: 18 },
  SOUP:    { cal: 80,  pro: 5,  fat: 2,  carb: 10 },
  DIMSUM:  { cal: 180, pro: 8,  fat: 6,  carb: 24 },
  MAIN:    { cal: 280, pro: 14, fat: 10, carb: 36 },
  DRINK:   { cal: 60,  pro: 1,  fat: 0,  carb: 14 },
};

function getDayNutrition(dishes: SupabaseDish[]) {
  return dishes.reduce(
    (acc, d) => {
      const n = NUTRITION_BY_TYPE[d.type ?? "MAIN"] ?? NUTRITION_BY_TYPE.MAIN;
      return {
        cal:  acc.cal  + n.cal,
        pro:  acc.pro  + n.pro,
        fat:  acc.fat  + n.fat,
        carb: acc.carb + n.carb,
      };
    },
    { cal: 0, pro: 0, fat: 0, carb: 0 }
  );
}

// Smell 1 阶段 2 (v40): pickBreakfastCombo / breakfast pool 已移入
// useWeeklyMenu.ts → generateWeekPlan，统一通过 weeklyMenu.days[i].breakfastDishes
// 读取。WeeklyMenu page 仅做渲染，不再独立 fetch + 调用 picker。

// ── DishCard ──────────────────────────────────────────────────────────────────

function DishCard({ dish, small = false, familyMembers = [], homeToday = [], michelin, onSwap, swapping = false, badges, onMarkEaten, eaten = false }: {
  dish: SupabaseDish; small?: boolean;
  familyMembers?: FamilyMember[];
  homeToday?: string[];
  michelin?: MichelinDish;
  onSwap?: () => void;
  swapping?: boolean;
  badges?: TagBadge[];
  /** TICKET-024 §A — "我吃了" button. Caller writes meal_logs + toggleEaten localStorage. */
  onMarkEaten?: () => void;
  /** If true, render checkmark instead of plate icon (already logged today). */
  eaten?: boolean;
}) {
  const { isChinese, language } = useLanguage();
  const activeMembers = familyMembers.filter(m => homeToday.includes(m.id));
  const cannotEat = activeMembers.length > 0 ? dishAllergyFor(dish as any, activeMembers) : [];
  // TICKET-029 — language-aware title via getDishTitle (zh / zh-Hant / en).
  // Backend 022 §C ship 给 924 dishes 灌 title_zh_hant + title_en, helper 自动 picks.
  const dishName = getDishTitle(dish as any, language);
  const dishDesc = isChinese
    ? ((dish as any).description_zh || (dish as any).description_en || '')
    : ((dish as any).description_en || (dish as any).description_zh || '');
  const typeColor: Record<string, string> = {
    MEAT:    "#FF5A1F",
    SEAFOOD: "#00B4D8",
    VEGGIE:  "#2ECC71",
    SOUP:    "#F39C12",
    DIMSUM:  "#9B59B6",
    MAIN:    "#3498DB",
    DRINK:   "#1ABC9C",
  };
  const typeLabel: Record<string, string> = {
    MEAT:    "荤",
    SEAFOOD: "海鲜",
    VEGGIE:  "素",
    SOUP:    "汤",
    DIMSUM:  "点心",
    MAIN:    "主食",
    DRINK:   "饮品",
  };
  // When a michelin overlay is active, the badge must reflect the OVERLAY,
  // not the original dish. Otherwise a base 素 (veggie_dish) overlaid with
  // 当红炸子鸡 (chicken, main_protein) keeps showing "素", confusing the
  // family about what they'll actually be eating.
  const SEAFOOD_INGS = new Set([
    'fish', 'shrimp', 'crab', 'scallop', 'clam', 'lobster', 'oyster',
    'squid', 'salmon', 'tuna', 'cod', 'hairtail', 'seabass', 'shellfish',
  ]);
  function typeFromMichelin(m: NonNullable<typeof michelin>): string {
    const ct  = m.course_type ?? '';
    const ing = (m.main_ingredient ?? '').toLowerCase();
    if (ct === 'soup')        return 'SOUP';
    if (ct === 'veggie_dish') return 'VEGGIE';
    if (ct === 'staple')      return 'MAIN';
    if (ct === 'dessert')     return 'DIMSUM';
    if (ct === 'main_protein') {
      return SEAFOOD_INGS.has(ing) ? 'SEAFOOD' : 'MEAT';
    }
    return SEAFOOD_INGS.has(ing) ? 'SEAFOOD' : 'MEAT';
  }
  const effectiveType = michelin ? typeFromMichelin(michelin) : (dish.type ?? 'MAIN');
  const tc = typeColor[effectiveType] ?? "#FF5A1F";
  const tl = typeLabel[effectiveType] ?? effectiveType;

  const imgSrc = dish.img || dish.image_url
    ? (dish.img || dish.image_url)
    : `https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=400&auto=format&fit=crop`;

  // 应季 chip — fruit / veggie_dish only, 当前节气有命中食材时显示
  const solarTermZh = getCurrentSolarTermZh();
  const { inSeason, matched } = isFruitVeggieInSeason(dish as any, solarTermZh);

  return (
    <div
      className={`relative flex-shrink-0 rounded-2xl overflow-hidden bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)] ${small ? "w-28" : "w-36"}`}
      style={{ aspectRatio: "3/4" }}
    >
      {/* Image */}
      <img
        src={imgSrc}
        alt={dishName}
        className="absolute inset-0 w-full h-full object-cover"
        onError={e => {
          (e.target as HTMLImageElement).src =
            "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=400&auto=format&fit=crop";
        }}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)"
      }} />
      {/* Type badge */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white font-semibold"
        style={{ background: tc, fontSize: 10, letterSpacing: "0.04em" }}>
        {tl}
      </div>
      {/* 应季 chip — fruit / veggie_dish 命中当前节气 时显示 */}
      {inSeason === true && (
        <div
          className="absolute left-2 rounded-lg font-semibold"
          style={{
            top: 26,
            background: "rgba(46,125,50,0.92)",
            color: "white",
            fontSize: 11,
            padding: "2px 6px",
            letterSpacing: "0.02em",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          }}
          title={matched.length > 0 ? (isChinese ? `应季食材：${matched.slice(0, 4).join('、')}` : `In-season: ${matched.slice(0, 4).join(', ')}`) : (isChinese ? '当季' : 'In season')}
        >
          {isChinese ? '🌱 应季' : '🌱 In season'}
        </div>
      )}
      {/* Michelin star / award badge — '⭐ 3 / Lung King Heen' style */}
      {michelin && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5"
          style={{
            background: "linear-gradient(135deg, #FFD700, #FFA500)",
            color: "#1a1a1a", fontSize: 9, letterSpacing: "0.04em",
            boxShadow: "0 2px 6px rgba(255,165,0,0.4)",
          }}>
          {michelin.award_type === 'michelin' ? '⭐' : '♦'} {michelin.award_level}
        </div>
      )}
      {/* 小美 chip — top-right when not occupied by Michelin overlay. Only
          rendered when the household has toggled "我有小美" on AND this
          dish is robot-doable, so a household without the robot never
          sees noise. */}
      {!michelin
        && localStorage.getItem('has_xiaomei_robot') === 'true'
        && (dish as any).xiaomei_compatible && (
        <div
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full font-bold"
          style={{
            background: "rgba(255,255,255,0.92)",
            color: "#FF5A1F", fontSize: 9, letterSpacing: "0.02em",
            boxShadow: "0 2px 6px rgba(0,0,0,0.20)",
          }}
          title={isChinese ? "小美料理机可以做这道菜" : "Xiaomei robot can cook this"}
        >
          🤖 小美
        </div>
      )}
      {/* Title */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-white font-semibold leading-tight" style={{ fontSize: small ? 11 : 12 }}>
          {michelin
            ? (isChinese ? michelin.name_zh : (michelin.name_en || michelin.name_zh))
            : dishName}
        </p>
        {michelin ? (
          <>
            <p className="mt-0.5 leading-tight" style={{ fontSize: 9, color: "#FFD700" }}>
              ⭐ {michelin.signature_technique}
            </p>
            <p className="mt-0.5 leading-tight truncate" style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>
              {isChinese ? michelin.restaurant_name_zh : (michelin.restaurant_name_en || michelin.restaurant_name_zh)}
            </p>
          </>
        ) : !small && dishDesc && (
          <p className="text-white/50 mt-0.5" style={{ fontSize: 10 }}>
            {dishDesc}
          </p>
        )}
        {/* TICKET-018 §C — 5-channel TagBadge row (top 2, optional, no-op when badges undefined) */}
        {badges && badges.length > 0 && <TagBadgeRow badges={badges} />}
        {/* Member badge: show who can't eat this dish */}
        {cannotEat.length > 0 && (
          <div className="flex items-center gap-0.5 mt-1 flex-wrap">
            <span style={{ fontSize: 9, color: 'rgba(255,180,0,0.85)', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '1px 4px' }}>
              🚫 {cannotEat.map(m => m.name).join('/')} 不吃
            </span>
          </div>
        )}
      </div>
      {/* TICKET-017 §C — 换一道按钮（degraded variant, dinner only via swapDish hook） */}
      {onSwap && (
        <button
          onClick={(e) => { e.stopPropagation(); if (!swapping) onSwap(); }}
          disabled={swapping}
          title={isChinese ? "换一道" : "Swap"}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-all disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#FF5A1F" }}>
            {swapping ? 'hourglass_top' : 'refresh'}
          </span>
        </button>
      )}
      {/* TICKET-024 §A — "我吃了" button. Top-right (clear of bottom swap btn),
          offsets vertically when michelin/小美 chip occupies top-right. Tinted
          green when eaten=true (already in today's meal_logs). */}
      {onMarkEaten && (
        <button
          onClick={(e) => { e.stopPropagation(); onMarkEaten(); }}
          title={eaten ? (isChinese ? '今日已记录' : 'Logged today') : (isChinese ? '我吃了' : 'I ate this')}
          className="absolute right-2 w-7 h-7 rounded-full flex items-center justify-center active:scale-90 transition-all"
          style={{
            top: (michelin || ((dish as any).xiaomei_compatible && localStorage.getItem('has_xiaomei_robot') === 'true')) ? 28 : 8,
            background: eaten ? "rgba(34,197,94,0.92)" : "rgba(255,255,255,0.92)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: eaten ? 'white' : "#15803D" }}>
            {eaten ? 'check_circle' : 'restaurant'}
          </span>
        </button>
      )}
    </div>
  );
}

// ── MealSection ───────────────────────────────────────────────────────────────

function MealSection({
  mealIdx, dishes, familyMembers = [], homeToday = [], michelinByDishId = {},
  onSwapSlot, swappingSlot = -1, slotsByDishId = {},
  expandedDishId, onToggleExpand, onPickCandidate,
  onMarkEaten, eatenSet,
}: {
  mealIdx: number; dishes: SupabaseDish[];
  familyMembers?: FamilyMember[]; homeToday?: string[];
  michelinByDishId?: Record<string, MichelinDish>;
  onSwapSlot?: (slotIdx: number) => void;
  swappingSlot?: number;
  /** TICKET-022 §A — slot lookup keyed by primary.dish.id for badge + candidate render. */
  slotsByDishId?: Record<string, SlotPlan>;
  /** Which dish has its candidate grid expanded (null = none). */
  expandedDishId?: string | null;
  /** Tap refresh on a dish card → toggle its candidate grid open/closed. */
  onToggleExpand?: (dishId: string) => void;
  /** User picks a candidate from the grid → swap into the menu. */
  onPickCandidate?: (slotIdx: number, pick: SlotChoice) => void;
  /** TICKET-024 §A — "我吃了" handler (mealType derived from mealIdx by caller). */
  onMarkEaten?: (dish: SupabaseDish) => void;
  /** Set of dish ids already logged today (drives green check state). */
  eatenSet?: Set<string>;
}) {
  // TICKET-030 §B — i18n meal label resolver (uses MealSection-scope useLanguage).
  const { isChinese: isZhMeal, t: tMeal } = useLanguage();
  const meal = mealMeta(mealIdx, isZhMeal);

  if (dishes.length === 0) {
    return (
      <div className="mb-4 px-5">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 16 }}>{meal.icon}</span>
          <span className="font-semibold text-white/70" style={{ fontSize: 13 }}>{meal.label}</span>
        </div>
        <div className="rounded-2xl flex items-center justify-center py-6"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.12)" }}>
          <span className="text-white/30" style={{ fontSize: 12 }}>{tMeal('No picks yet — AI is learning your taste', '暂无推荐，AI 正在学习您的口味')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5">
      {/* Meal label */}
      <div className="flex items-center gap-2 mb-3 px-5">
        <span style={{ fontSize: 16 }}>{meal.icon}</span>
        <span className="font-semibold text-white/80" style={{ fontSize: 13 }}>{meal.label}</span>
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        <span className="text-white/30" style={{ fontSize: 11 }}>{tMeal(`${dishes.length} dishes`, `${dishes.length} 道菜`)}</span>
      </div>
      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
        {dishes.map((dish, slotIdx) => {
          const slot = slotsByDishId[dish.id];
          const handleSwap = onToggleExpand
            ? () => onToggleExpand(dish.id)
            : (onSwapSlot ? () => onSwapSlot(slotIdx) : undefined);
          return (
            <DishCard key={dish.id} dish={dish}
              familyMembers={familyMembers} homeToday={homeToday}
              michelin={michelinByDishId[dish.id]}
              onSwap={handleSwap}
              swapping={swappingSlot === slotIdx}
              badges={slot?.primary?.tagBadges}
              onMarkEaten={onMarkEaten ? () => onMarkEaten(dish) : undefined}
              eaten={eatenSet?.has(dish.id) ?? false} />
          );
        })}
      </div>
      {/* TICKET-022 §A — Candidate grid expansion below the meal strip. Renders
          only when expandedDishId matches a dish in THIS section AND that dish
          has a SlotPlan with candidates[]. Picking a candidate fires onPickCandidate
          → swapDish → grid auto-closes. */}
      {expandedDishId && onPickCandidate && (() => {
        const expSlotIdx = dishes.findIndex(d => d.id === expandedDishId);
        if (expSlotIdx < 0) return null;
        const slot = slotsByDishId[expandedDishId];
        if (!slot || !slot.candidates || slot.candidates.length === 0) return null;
        return (
          <div className="mt-2 px-5">
            <p className="mb-2 font-bold text-white/70" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
              {tMeal(`${slot.candidates.length} candidates · tap to swap`, `${slot.candidates.length} 个候选 · 点选替换`)}
            </p>
            <CandidateGrid
              candidates={slot.candidates}
              pickedId={expandedDishId}
              onPick={(c) => onPickCandidate(expSlotIdx, c)}
              tone="dark"
            />
          </div>
        );
      })()}
    </div>
  );
}

// ── NutritionBar ─────────────────────────────────────────────────────────────

function NutritionBar({ label, value, max, color, unit = "g" }: {
  label: string; value: number; max: number; color: string; unit?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/40 w-6" style={{ fontSize: 10 }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="text-white/50 w-12 text-right" style={{ fontSize: 10 }}>{value}{unit}</span>
    </div>
  );
}

// ── SkeletonDay ───────────────────────────────────────────────────────────────

function SkeletonDay() {
  return (
    <div className="px-5 animate-pulse">
      {[0, 1, 2].map(i => (
        <div key={i} className="mb-5">
          <div className="h-4 w-20 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex gap-3">
            {[0, 1, 2].map(j => (
              <div key={j} className="rounded-2xl w-36 flex-shrink-0"
                style={{ aspectRatio: "3/4", background: "rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Free tier: how many days are unlocked without login ──────────────────────
const FREE_DAYS = 3; // today + next 2 days visible; rest locked

// ── Locked day overlay ────────────────────────────────────────────────────────
// Spec 2026-05-17: the 7-day weekly view is a member-only feature. Free
// users see today's column (as a tease) and an upgrade card for the rest
// of the week — the daily Home menu remains available without paying.
function LockedDayCard({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="mx-5 mt-2">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl overflow-hidden relative"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Blurred preview rows */}
        <div className="px-5 pt-5 pb-2" style={{ filter: "blur(5px)", pointerEvents: "none", userSelect: "none" }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-3 mb-4">
              {[0, 1, 2].map(j => (
                <div key={j} className="rounded-2xl flex-shrink-0"
                  style={{ width: 90, height: 120, background: `rgba(255,255,255,${0.06 + j * 0.02})` }} />
              ))}
            </div>
          ))}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "linear-gradient(to bottom, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0.85) 50%)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "rgba(255,90,31,0.15)", border: "1.5px solid rgba(255,90,31,0.35)" }}>
            <span className="material-symbols-outlined text-[#FF5A1F]" style={{ fontSize: 28 }}>workspace_premium</span>
          </div>
          <p className="text-white font-bold mb-1" style={{ fontSize: 16 }}>{t('Members unlock the full 5-day menu', '会员解锁完整 5 天菜单')}</p>
          <p className="text-white/40 mb-5" style={{ fontSize: 12 }}>{t('Daily menu is always free · 5-day plan + weekend dine-out + one-step shopping require membership', '每日菜单始终免费 · 5 天规划 + 周末外食 + 一步采购 需会员')}</p>
          <button onClick={onUnlock}
            className="px-8 h-11 rounded-2xl font-semibold flex items-center gap-2 transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
              boxShadow: "0 6px 20px rgba(255,90,31,0.35)",
              fontSize: 14, color: "white",
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_upward</span>
            {t('Upgrade', '升级会员')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WeeklyMenu() {
  const navigate = useNavigate();
  // TICKET-030 §B — lang-aware UI strings. isChinese 已在 DishCard 内 used,
  // 这里加 t / language 给顶层 toast / banner / hero.
  const { t, language } = useLanguage();
  // TICKET-042 §B — 周末访问默认显示下周菜单 (周末用户为下周做饭计划).
  // 周一-五访问 → 本周菜单 (weekOffset=0), 周六/日 → 下周菜单 (weekOffset=1).
  const isWk = isWeekend();
  const weekOffset = isWk ? 1 : 0;
  const { weeklyMenu, loading, swapDish } = useWeeklyMenu(weekOffset);
  const targetWeekStart = getWeekStartISO(weekOffset);
  // TICKET-069 P0 — ChatSwapModal state. 老板真测 #14 拍板 1+A.
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapIntent, setSwapIntent]       = useState('');
  // TICKET-017 §C — 换一道按钮 state（key="dayIdx:slotIdx" busy 标记 + 提示 toast）
  const [swapBusy, setSwapBusy] = useState<string | null>(null);
  const [swapToast, setSwapToast] = useState<string | null>(null);
  // TICKET-022 §A — 候选网格展开：key=`${dayIdx}:${dishId}` of dish whose grid is open.
  // null = no grid open. Tapping a dish's refresh button toggles its grid.
  const [expandedGridKey, setExpandedGridKey] = useState<string | null>(null);
  function handleToggleExpand(dayIdx: number, dishId: string) {
    const key = `${dayIdx}:${dishId}`;
    setExpandedGridKey(prev => prev === key ? null : key);
  }
  async function handlePickCandidate(dayIdx: number, slotIdx: number, pick: SlotChoice) {
    if (!weeklyMenu) return;
    await swapDish(dayIdx, slotIdx, pick.dish as SupabaseDish);
    setExpandedGridKey(null);
    setSwapToast(t('Swapped to "' + (getDishTitle(pick.dish as any, language) || 'this dish') + '"', '已换为「' + (getDishTitle(pick.dish as any, language) || '该菜') + '」'));
    setTimeout(() => setSwapToast(null), 2000);
  }
  // TICKET-024 §A — "我吃了" state. Read localStorage on mount + on 'nutri-eaten-changed'
  // bus event so checks stay in sync across components.
  const [eatenSet, setEatenSet] = useState<Set<string>>(() => getEatenToday());
  useEffect(() => {
    const sync = () => setEatenSet(getEatenToday());
    window.addEventListener('nutri-eaten-changed', sync);
    return () => window.removeEventListener('nutri-eaten-changed', sync);
  }, []);

  // TICKET-082 §Phase 5b — 每天独立 meal schedule (日级 chip).
  //   householdId 从 user → households 拉; 7 天每天一个 DailyMealSchedule.
  //   editMeal=null 关弹窗, 否则 {dayIdx, meal} 开 time picker bottom sheet.
  const [householdId, setHouseholdId] = useState<string>('');
  const [schedulesByDay, setSchedulesByDay] = useState<Record<number, DailyMealSchedule>>({});
  const [editMeal, setEditMeal] = useState<{ dayIdx: number; meal: 'lunch' | 'dinner' } | null>(null);
  const [editTimeInput, setEditTimeInput] = useState('19:00');
  const [editBusy, setEditBusy] = useState(false);

  // 一次拉 employer 的 household id
  useEffect(() => {
    const uid = getUserId();
    if (!uid) return;
    supabase.from('households')
      .select('id')
      .eq('employer_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const hh = (data?.[0] as any)?.id;
        if (hh) setHouseholdId(hh);
      });
  }, []);

  // 当 weeklyMenu 或 householdId 就位, 给 7 天每天拉 daily schedule.
  useEffect(() => {
    if (!householdId || !weeklyMenu?.weekStart) return;
    const uid = getUserId();
    const [y, m, d] = weeklyMenu.weekStart.split('-').map(Number);
    const daysCount = weeklyMenu.days?.length ?? 5;
    (async () => {
      const out: Record<number, DailyMealSchedule> = {};
      for (let i = 0; i < daysCount; i++) {
        const dt = new Date(y, m - 1, d + i);
        const iso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        try {
          out[i] = await loadDailySchedule(householdId, iso, uid);
        } catch (err) {
          console.warn('[WeeklyMenu] loadDailySchedule day', i, 'err:', err);
        }
      }
      setSchedulesByDay(out);
    })();
  }, [householdId, weeklyMenu?.weekStart, weeklyMenu?.days?.length]);

  function isoForDay(i: number): string {
    if (!weeklyMenu?.weekStart) return '';
    const [y, m, d] = weeklyMenu.weekStart.split('-').map(Number);
    const dt = new Date(y, m - 1, d + i);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  function openMealEditor(dayIdx: number, meal: 'lunch' | 'dinner') {
    const sch = schedulesByDay[dayIdx];
    const current = meal === 'lunch' ? (sch?.lunch_time ?? '12:00') : (sch?.dinner_time ?? '19:00');
    setEditTimeInput(current);
    setEditMeal({ dayIdx, meal });
  }
  async function saveMealEdit() {
    if (!editMeal || !householdId) return;
    setEditBusy(true);
    try {
      const iso = isoForDay(editMeal.dayIdx);
      await setDailyMealTime(householdId, iso, editMeal.meal, editTimeInput, 'employer');
      const uid = getUserId();
      const fresh = await loadDailySchedule(householdId, iso, uid);
      setSchedulesByDay(prev => ({ ...prev, [editMeal.dayIdx]: fresh }));
      setEditMeal(null);
    } catch (e) {
      console.warn('[WeeklyMenu] save meal time error:', e);
    } finally {
      setEditBusy(false);
    }
  }
  async function handleMarkEaten(dish: SupabaseDish, mealIdx: number) {
    const dishId = dish.id;
    if (!dishId) return;
    if (eatenSet.has(dishId)) {
      // Already logged today — no-op, append-only table. Tooltip already says 今日已记录.
      return;
    }
    // 1) localStorage immediate UI feedback (green check appears instantly).
    markEaten(dishId);
    setEatenSet(getEatenToday());
    // 2) DB meal_logs write (async, fire-and-forget). mealIdx 0=早 1=午 2=晚.
    const mealType = mealIdx === 0 ? 'breakfast' : mealIdx === 1 ? 'lunch' : 'dinner';
    const title = getDishTitle(dish as any, language) || '该菜';
    const res = await logMealEaten({ dishId, mealType });
    if (res.ok) {
      setSwapToast(t('Logged: ' + title, '已记录：' + title));
    } else {
      // DB write failed — localStorage state stays (better UX than rollback),
      // toast tells user logging didn't reach server.
      setSwapToast(t('Marked (not synced)', '已标记（云端未同步）'));
    }
    setTimeout(() => setSwapToast(null), 1800);
  }
  async function handleSwapDinner(dayIdx: number, slotIdx: number) {
    if (!weeklyMenu || swapBusy) return;
    const day = weeklyMenu.days[dayIdx];
    const current = day?.dishes[slotIdx];
    if (!current) return;
    const busyKey = `${dayIdx}:${slotIdx}`;
    setSwapBusy(busyKey);
    try {
      const excludeIds = day.dishes.map(d => d.id);
      const inList = `(${excludeIds.map(id => `"${id}"`).join(',')})`;
      let query = supabase.from('dishes').select('*').limit(20);
      if (current.type) query = query.eq('type', current.type);
      if (excludeIds.length > 0) query = query.not('id', 'in', inList);
      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        setSwapToast(t('No swap candidates', '暂无候选可换'));
        setTimeout(() => setSwapToast(null), 2200);
        return;
      }
      const pick = data[Math.floor(Math.random() * data.length)] as SupabaseDish;
      await swapDish(dayIdx, slotIdx, pick);
      setSwapToast(t('Swapped one dish', '已换一道菜'));
      setTimeout(() => setSwapToast(null), 2000);
    } catch {
      setSwapToast(t('Swap failed, retry later', '换菜失败，稍后重试'));
      setTimeout(() => setSwapToast(null), 2200);
    } finally {
      setSwapBusy(null);
    }
  }
  // TICKET-043 — 周末访问默认显 day 0 (下周一, useWeeklyMenu weekOffset=1 已切下周).
  // 周一-五 → 显当天 tab. 工作日 todayIdx 0-4, 周末 clamp 到 0.
  const realTodayIdx = todayDayIndex();
  const todayIdx = realTodayIdx >= 5 ? 0 : realTodayIdx;
  const defaultSelectedDay = todayIdx;
  const [selectedDay, setSelectedDay] = useState(defaultSelectedDay);

  // Michelin-mode toggle. The toggle exists for everyone, but only Pro users
  // can actually activate it; free users tapping it land on /pricing.
  const { isPro } = useSubscription();
  const [michelinMode, setMichelinMode] = useState(false);
  // Chef-at-home booking modal — opens when user taps "📞 预约大厨" while
  // michelin mode is on. We seed it with whichever dish the user clicked.
  const [chefBookingOpen, setChefBookingOpen] = useState(false);
  const [chefBookingDish, setChefBookingDish] = useState<MichelinDish | null>(null);

  // TICKET-066 P0 — intentOpen state 已删, 顶部 IntentInputBox 内部管 loading.
  // 保留 intentBias 用于显示 "本周偏好" chips 行.
  const [intentBias, setIntentBias] = useState<IntentBias | null>(() => loadIntentBias());
  useEffect(() => {
    const sync = () => setIntentBias(loadIntentBias());
    window.addEventListener('nutri-intent-bias-changed', sync);
    return () => window.removeEventListener('nutri-intent-bias-changed', sync);
  }, []);
  // Michelin overlay state, keyed by dish.id so we can map back per-card.
  const [michelinByDishId, setMichelinByDishId] = useState<Record<string, MichelinDish>>({});
  // Per-date load/error tracking so flipping days mid-load doesn't re-trigger.
  const [michelinLoadingDates, setMichelinLoadingDates] = useState<Set<string>>(new Set());
  const [michelinDoneDates,    setMichelinDoneDates]    = useState<Set<string>>(new Set());
  const [michelinErrorMsg,     setMichelinErrorMsg]     = useState<string | null>(null);

  // Family member state
  const [familyMembers] = useState<FamilyMember[]>(() => loadFamilyMembers());
  const [homeToday, setHomeToday] = useState<string[]>(() =>
    loadHomeToday(familyMembers)
  );
  // Per-day eating override. Empty entry for a day → use homeToday.
  const [homeByDay, setHomeByDay] = useState<Record<number, string[]>>(() => loadHomeByDay());
  const getEatingForDay = (i: number): string[] => homeByDay[i] ?? homeToday;
  function toggleMemberForDay(dayIdx: number, memberId: string) {
    setHomeByDay(prev => {
      const current = prev[dayIdx] ?? homeToday;
      const next = current.includes(memberId)
        ? current.filter(id => id !== memberId)
        : [...current, memberId];
      // Keep at least 1 member; otherwise revert to default.
      const safe = next.length === 0 ? homeToday : next;
      saveHomeForDay(dayIdx, safe.length === homeToday.length &&
        safe.every(id => homeToday.includes(id)) ? [] : safe);
      const out = { ...prev };
      if (safe.length === homeToday.length && safe.every(id => homeToday.includes(id))) {
        delete out[dayIdx];
      } else {
        out[dayIdx] = safe;
      }
      return out;
    });
  }

  // TICKET-074 §D — freemium day window：非 Pro 用户免费看「今天 + 明天」
  // 两天菜单，第 3-5 天（周内剩余天）显示 blur preview + 升级 CTA。今+明
  // 给「即时可用」的体验，3-5 天作为「提前采购备料」卖点引导升级。
  // UI 014 §C: WEEKEND_TAB_IDX(5) 不锁——周末 tab 显示 WeekendDiningReport，
  // 所有用户都能看（外食推荐是免费功能）。
  const isDayLocked = (i: number) => !isPro && i !== WEEKEND_TAB_IDX && i > todayIdx + 1;
  const effectiveDay = isDayLocked(selectedDay) ? todayIdx : selectedDay;

  const dayMenu  = weeklyMenu?.days[effectiveDay];
  const dinner   = dayMenu?.dishes ?? [];
  const lunch    = dayMenu?.lunchDishes ?? [];
  // Smell 1 阶段 2 (v40): breakfast 来自 generateWeekPlan 输出（hometown
  // 旋转 / pickBreakfastCombo 已经在 hook 层完成）。
  const breakfast = dayMenu?.breakfastDishes ?? [];
  const nutrition = getDayNutrition([...lunch, ...dinner]);

  // Avoid-ingredients union for the household (only members at home today).
  // We feed BOTH the English DB-ingredient list (for main_ingredient column
  // matches in the regular pool) AND the Chinese title-keyword list (because
  // the michelin pool's strings are all Chinese — 黄油 / 芝士 / 牛奶 / 奶油 etc
  // — so English 'dairy'/'butter' would never substring-match).
  const avoidIngredients = useMemo(() => {
    const active = familyMembers.filter(m => homeToday.includes(m.id));
    const set = new Set<string>();
    for (const m of active) {
      for (const a of m.allergies) {
        for (const ing of ALLERGY_INGREDIENTS[a] ?? []) set.add(ing);
        for (const kw  of ALLERGY_TITLE_KEYWORDS[a] ?? []) set.add(kw);
      }
    }
    return Array.from(set);
  }, [familyMembers, homeToday]);

  // Trigger Gemini Michelin elevation for the currently-viewed day when:
  //   • Pro user has toggled Michelin ON
  //   • this date hasn't been elevated yet and isn't currently loading
  //   • there's lunch / dinner data to elevate (skip if the day is empty)
  useEffect(() => {
    if (!michelinMode || !isPro) return;
    if (!dayMenu || !dayMenu.date) return;
    const date = dayMenu.date;
    if (michelinDoneDates.has(date) || michelinLoadingDates.has(date)) return;
    const dishes = [...lunch, ...dinner];
    if (dishes.length === 0) return;

    setMichelinErrorMsg(null);
    setMichelinLoadingDates(prev => { const n = new Set(prev); n.add(date); return n; });

    elevateDayToMichelin({
      date,
      dayLabel: dayMenu.dayLabel,
      avoidIngredients,
      dishes: dishes.map(d => ({
        id: d.id,
        title_zh: d.title_zh,
        main_ingredient: d.main_ingredient,
        course_type: d.course_type ?? d.type,
      })),
    })
      .then(result => {
        setMichelinByDishId(prev => {
          const next = { ...prev };
          for (const md of result.dishes) next[md.source_id] = md;
          return next;
        });
        setMichelinDoneDates(prev => { const n = new Set(prev); n.add(date); return n; });
      })
      .catch(err => {
        console.error('[Michelin] elevation failed', err);
        setMichelinErrorMsg(err?.message ?? '米其林生成失败');
      })
      .finally(() => {
        setMichelinLoadingDates(prev => { const n = new Set(prev); n.delete(date); return n; });
      });
  // We intentionally trigger off the elevated-day key, not the dish array
  // identity, so swapping homeToday doesn't blow away cached elevations.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [michelinMode, isPro, dayMenu?.date, lunch.length, dinner.length]);

  const currentDate = dayMenu?.date ?? '';
  const isElevating = michelinMode && isPro && michelinLoadingDates.has(currentDate);
  const overlayForDay = (michelinMode && isPro) ? michelinByDishId : {};

  function handleShoppingList() {
    // One-step shopping is member-only (spec 2026-05-17). Non-members
    // get bounced to /pricing instead of /login — login alone doesn't
    // unlock this anymore.
    if (!isPro) {
      navigate('/pricing');
      return;
    }
    // Write all weekly dishes to localStorage so VerifyIngredients can read them
    if (weeklyMenu) {
      const allDishes = weeklyMenu.days.flatMap(d => d.dishes);
      localStorage.setItem('generatedMenu', JSON.stringify(allDishes));
    }
    navigate('/verify');
  }

  function handleDayClick(i: number) {
    setSelectedDay(i); // still updates state (used for locked-day overlay)
    // UI 014 §C: WEEKEND_TAB_IDX 不滚动——content 区域整块替换为 WeekendDiningReport，
    // day-5 element 不存在。
    if (i === WEEKEND_TAB_IDX) return;
    // Smooth-scroll to that day's section in the all-week list
    const el = document.getElementById(`day-${i}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // UI 014 §C: 删除 isWeekend() 整页拦截。周末时默认 selectedDay=5 (周末 tab) →
  // content 区域条件渲染 WeekendDiningReport，但保留 header + DAYS tabs，让用户能
  // 切回工作日预览 (周一-周五 仍然渲染 weeklyMenu.days 上周菜单作为参考)。

  return (
    <div
      className="min-h-screen flex flex-col max-w-md mx-auto relative overflow-hidden"
      style={{ background: "#0a0a0a", paddingBottom: 140 }}
    >
      {/* TICKET-017 §C — swap toast (success / 暂无候选 / 换菜失败) */}
      {swapToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full font-bold"
          style={{ background: "rgba(255,90,31,0.95)", color: "white", fontSize: 13, boxShadow: "0 4px 16px rgba(255,90,31,0.40)" }}>
          {swapToast}
        </div>
      )}
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div style={{
          background: "radial-gradient(ellipse at 70% 0%, rgba(255,90,31,0.12) 0%, transparent 60%)",
          position: "absolute", inset: 0,
        }} />
        <div style={{
          background: "radial-gradient(ellipse at 30% 80%, rgba(108,92,231,0.08) 0%, transparent 60%)",
          position: "absolute", inset: 0,
        }} />
      </div>

      {/* ── Header: title row + action row (2 lines, never cramped) ─── */}
      <div className="relative z-10 px-5 pt-14 pb-2">
        {/* Back button + tiny date kicker */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-2xl flex items-center justify-center transition-all active:scale-90"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>arrow_back</span>
          </button>
          <p className="text-white/40" style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 600, textTransform: 'uppercase' }}>
            {weeklyMenu?.weekStart
              ? `${weeklyMenu.weekStart.slice(5).replace("-", "/")} – ${(() => {
                  const [y,m,d] = weeklyMenu.weekStart.split('-').map(Number);
                  const end = new Date(y, m - 1, d + 6);
                  return `${String(end.getMonth()+1).padStart(2,'0')}/${String(end.getDate()).padStart(2,'0')}`;
                })()}`
              : "Weekly Plan"}
          </p>
        </div>

        {/* Title — own line, full width.
            TICKET-042 §B — 周末访问标题改 "下周菜单" + 显示下周一日期, 让老板
            一眼明白当前看的是下周不是本周. */}
        <h1 className="font-serif font-black text-white mt-2" style={{ fontSize: 32, letterSpacing: "-0.01em", lineHeight: 1.05 }}>
          {isWk ? '下周菜单' : '本周菜单'}
        </h1>
        <p className="text-white/45 mt-1" style={{ fontSize: 12 }}>
          {isWk
            ? `周一 ${targetWeekStart.slice(5).replace('-', '/')} 开始 · AI 已规划好`
            : weeklyMenu
              ? `5 天家庭餐 + 周末外食 · ${weeklyMenu.days.reduce((n,d) => n + (d.dishes?.length ?? 0) + (d.lunchDishes?.length ?? 0), 0)} 道菜`
              : "AI 智能规划 · 每周更新"}
        </p>

        {/* Action buttons row — TICKET-066 P0: 原 "📝 重新生成" 按钮删除,
            下面 IntentInputBox 取代 (老板真测 #12 拍板 1 chat 入口统一). */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              if (!isPro) { navigate("/pricing"); return; }
              setMichelinMode(m => !m);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95"
            style={michelinMode && isPro
              ? { background: "linear-gradient(135deg, #FFD700, #FFA500)", border: "1px solid rgba(255,215,0,0.6)", boxShadow: "0 4px 14px rgba(255,165,0,0.30)" }
              : { background: "linear-gradient(135deg, rgba(255,90,31,0.2), rgba(255,140,84,0.15))", border: "1px solid rgba(255,90,31,0.3)" }
            }
          >
            <span style={{ fontSize: 13 }}>{michelinMode && isPro ? "⭐" : "✨"}</span>
            <span className="font-semibold" style={{ fontSize: 11, color: michelinMode && isPro ? "#1a1a1a" : "rgba(255,255,255,0.80)" }}>
              {michelinMode && isPro ? t("Michelin", "米其林") : isPro ? t("AI plan", "AI 规划") : t("Upgrade Michelin", "升级米其林")}
            </span>
          </button>

          {/* 收藏 — moved from Home header per UX consolidation (Home stays
              focused on today's loop; WeeklyMenu hosts the
              menu-management entry points). */}
          <button
            onClick={() => navigate('/favorites')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95"
            style={{ background: "rgba(255,90,31,0.18)", border: "1px solid rgba(255,90,31,0.30)" }}
            title={t('My favorites', '我的收藏')}
          >
            <span style={{ fontSize: 13 }}>❤️</span>
            <span className="font-semibold" style={{ fontSize: 11, color: "#FF8C54" }}>{t('Favorites', '收藏')}</span>
          </button>

          {/* 📞 预约大厨 — only appears when michelin mode is active. Opens a
              lead-capture modal; service is "敬请期待". */}
          {michelinMode && isPro && (
            <button
              onClick={() => {
                // Seed with the first michelin overlay we have today, if any
                const seed = Object.values(overlayForDay)[0] ?? null;
                setChefBookingDish(seed);
                setChefBookingOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #1a1a1a, #404040)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <span style={{ fontSize: 13 }}>📞</span>
              <span className="font-semibold text-white" style={{ fontSize: 11 }}>{t('Book a chef', '预约大厨')}</span>
            </button>
          )}
        </div>
      </div>

      {/* TICKET-066 P0 — chat 主入口统一. IntentInputBox 取代原 IntentRegenModal 弹窗.
          老板真测 #12 拍板 1: "说话换菜单" 是 chat 唯一 use case, 不藏起来. */}
      <div className="relative z-10 px-5 mb-3">
        <IntentInputBox
          variant="weekly"
          onTriggerSwap={(intent) => {
            setSwapIntent(intent);
            setSwapModalOpen(true);
          }}
        />
      </div>

      {/* ── Day Tabs ────────────────────────────────────────────── */}
      <div className="relative z-10 px-5 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {(language === 'zh' || language === 'zh-Hant' ? DAYS_ZH : DAYS_EN).map((day, i) => {
            const isWeekendTab = i === WEEKEND_TAB_IDX;
            const isToday      = isWeekendTab ? realTodayIdx >= 5 : i === todayIdx;
            const isSelected   = i === selectedDay;
            const locked       = isDayLocked(i);
            return (
              <button
                key={day}
                onClick={() => handleDayClick(i)}
                className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all active:scale-95"
                style={
                  locked
                    ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", opacity: 0.5 }
                    : isSelected
                      ? { background: isWeekendTab ? "#6C5CE7" : "#FF5A1F", boxShadow: `0 4px 16px ${isWeekendTab ? "rgba(108,92,231,0.35)" : "rgba(255,90,31,0.35)"}` }
                      : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.09)" }
                }
              >
                <span
                  className="font-semibold"
                  style={{ fontSize: 13, color: locked ? "rgba(255,255,255,0.35)" : isSelected ? "white" : "rgba(255,255,255,0.65)" }}
                >
                  {day}
                </span>
                {locked ? (
                  <span className="material-symbols-outlined" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>lock</span>
                ) : isToday ? (
                  <span className="rounded-full" style={{
                    width: 4, height: 4,
                    background: isSelected ? "rgba(255,255,255,0.8)" : (isWeekendTab ? "#6C5CE7" : "#FF5A1F"),
                  }} />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Free tier hint */}
        {!isPro && (
          <p className="mt-2 text-white/30" style={{ fontSize: 11, letterSpacing: "0.04em" }}>
            🔓 免费查看今天菜单 · 升级解锁完整 5 天 + 周末餐厅推荐
          </p>
        )}

        {/* Active intent-bias chips — let user see what biases are in effect, with an [x] to clear. */}
        {intentBias && intentBias.chips.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-white/40" style={{ fontSize: 10 }}>{t('This week preferences:', '本周偏好：')}</span>
            {intentBias.chips.map((c, i) => (
              <span key={i}
                className="px-2 py-0.5 rounded-full font-semibold"
                style={{
                  background: "rgba(255,215,0,0.12)",
                  border: "1px solid rgba(255,215,0,0.30)",
                  color: "#FFD700", fontSize: 10,
                }}>
                {c}
              </span>
            ))}
            <button
              onClick={() => {
                clearIntentBias();
                // Force regen by clearing cache
                Object.keys(localStorage).filter(k => k.startsWith('weekly_menu_')).forEach(k => localStorage.removeItem(k));
                window.dispatchEvent(new Event('nutri-prefs-changed'));
              }}
              className="ml-1 w-5 h-5 rounded-full flex items-center justify-center active:scale-90"
              style={{ background: "rgba(255,255,255,0.08)" }}
              title={t('Clear weekly preferences', '清除本周偏好')}
            >
              <span className="material-symbols-outlined text-white/50" style={{ fontSize: 12 }}>close</span>
            </button>
          </div>
        )}

        {/* Michelin elevation status — only when toggle is ON */}
        {michelinMode && isPro && isElevating && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(255,215,0,0.10)", border: "1px solid rgba(255,215,0,0.25)" }}>
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14, color: "#FFD700" }}>
              progress_activity
            </span>
            <span style={{ fontSize: 11, color: "#FFD700", letterSpacing: "0.04em" }}>
              米其林大厨正在重新设计这一天的菜品…
            </span>
          </div>
        )}
        {michelinMode && isPro && michelinErrorMsg && !isElevating && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.25)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#FF8C54" }}>
              error_outline
            </span>
            <span style={{ fontSize: 11, color: "#FF8C54", letterSpacing: "0.04em" }}>
              {michelinErrorMsg}
            </span>
          </div>
        )}
      </div>

      {/* ── 谁在家今天 ────────────────────────────────────────────── */}
      {familyMembers.length > 0 && (
        <div className="relative z-10 px-5 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/40" style={{ fontSize: 11 }}>{t('Home today:', '谁在家：')}</span>
            {familyMembers.map(m => {
              const isHome = homeToday.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    const next = isHome
                      ? homeToday.filter(id => id !== m.id)
                      : [...homeToday, m.id];
                    setHomeToday(next);
                    saveHomeToday(next);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full transition-all active:scale-95"
                  style={isHome
                    ? { background: "rgba(255,90,31,0.25)", border: "1px solid rgba(255,90,31,0.5)" }
                    : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }
                  }
                >
                  <span style={{ fontSize: 13 }}>{m.emoji}</span>
                  <span style={{ fontSize: 11, color: isHome ? "#FF8C54" : "rgba(255,255,255,0.45)" }}>
                    {m.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Nutrition radar (moved from Home — single source of truth) ──── */}
      {/* TICKET-074 §E — Pro gate：非 Pro 用户看到 RadarPreview placeholder，
          Pro 用户看到完整 6 维营养雷达图。点击 placeholder 跳 /pricing 升级。
          UI 014 §C: 周末 tab 不显示 weekday radar（外食推荐是独立主题）。 */}
      {selectedDay !== WEEKEND_TAB_IDX && weeklyMenu && !loading && (
        <div className="relative z-10 mx-5 mb-4">
          {isPro ? (
            <NutritionRadarCard weeklyMenu={weeklyMenu} dark />
          ) : (
            <button
              onClick={() => navigate('/pricing')}
              className="w-full rounded-2xl p-5 text-center transition-all active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, rgba(255,90,31,0.10), rgba(255,140,84,0.05))",
                border: "1px solid rgba(255,90,31,0.22)",
              }}
            >
              <div className="text-[28px] mb-1">🌟</div>
              <p className="font-bold text-white" style={{ fontSize: 14 }}>
                营养雷达 · Pro
              </p>
              <p className="text-white/55 mt-1 mb-3" style={{ fontSize: 11, lineHeight: 1.5 }}>
                你选的菜单 vs 营养均衡匹配度 — 缺什么周末出门吃可以补
              </p>
              <span
                className="inline-flex items-center gap-1 px-4 py-2 rounded-full font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #FF5A1F, #FF8C54)",
                  fontSize: 12,
                  boxShadow: "0 6px 18px rgba(255,90,31,0.30)",
                }}
              >
                升级解锁
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
              </span>
            </button>
          )}
        </div>
      )}

      {/* ── 本周食材多样性 ── 中国居民膳食指南 2022 要求每周 25+ 种食物
          (每日 12+)，避免一周吃来吃去就那 8 道菜
          UI 014 §C: 周末 tab 不显示工作日维度的食材多样性指标。 */}
      {selectedDay !== WEEKEND_TAB_IDX && weeklyMenu && !loading && (() => {
        const allDishes: any[] = [];
        for (const day of weeklyMenu.days ?? []) {
          for (const meal of ['breakfast','lunch','dinner'] as const) {
            for (const d of (day as any)[meal] ?? []) {
              allDishes.push(d);
            }
          }
        }
        // Count unique main_ingredient values — better proxy than dish
        // count (避免 "西红柿炒蛋" 和 "西红柿牛腩" 都算 2 种)
        const uniqueIngs = new Set(allDishes.map(d => d.main_ingredient).filter(Boolean));
        const n = uniqueIngs.size;
        const target = 25;
        const pct = Math.min(100, Math.round(n * 100 / target));
        const color = n >= target ? '#16A34A' : n >= target * 0.6 ? '#F59E0B' : '#DC2626';
        return (
          <div className="relative z-10 mx-5 mb-4 rounded-2xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 20 }}>🥗</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white" style={{ fontSize: 12 }}>
                本周食材 {n} / {target} 种
              </p>
              <div className="w-full h-1.5 rounded-full mt-1.5 overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.10)' }}>
                <div className="h-full transition-all"
                  style={{ width: `${pct}%`, background: color }} />
              </div>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                {n >= target
                  ? '✅ 达标！饮食多样性足够'
                  : `离每周 25 种还差 ${target - n} 种 — 试试新食材`}
              </p>
            </div>
          </div>
        );
      })()}

      {/* TICKET-074 §D — 删除"整页 LockedDayCard 切换"。改为 per-day 渲染：
          今+明 显示完整 meals，3-5 天 显示 ProGatePreview 占位卡。底部
          统一 LockedDayCard CTA 引导升级（line ~967）。
          TICKET-043 — 删 weekend tab + WeekendDiningReport 渲染分支
          (老板拍板餐厅推荐在 /home, 不在 /weekly). 三元简化为 单分支. */}
      {(
      <div className="relative z-10 flex-1">
        <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="skeleton"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SkeletonDay />
                </motion.div>
              ) : (
                <motion.div key="all-days"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}>

                  {dinner.length === 0 && lunch.length === 0 && breakfast.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <span className="text-5xl mb-4 block">🍽️</span>
                      <p className="text-white/50" style={{ fontSize: 14 }}>{t('Generating your weekly menu…', '本周菜单正在生成中…')}</p>
                      <p className="text-white/30 mt-1 mb-5" style={{ fontSize: 12 }}>{t('Make sure your taste preferences are set', '请确保已设置您的口味偏好')}</p>
                      {/* UI 051 §D2 — 空菜单页 CTA 引导用户去设置偏好 */}
                      <button
                        onClick={() => navigate('/settings')}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-white active:scale-95 transition-transform"
                        style={{ fontSize: 13, background: "linear-gradient(135deg, #FF5A1F, #FF8C54)", boxShadow: "0 6px 18px rgba(255,90,31,0.30)" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>tune</span>
                        {t('Set taste preferences', '去设置口味偏好')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {weeklyMenu?.days.map((day, i) => {
                        // §A (TICKET-020) slots[].primary 投影优先, 缺失 fallback 旧字段
                        // (loadFromDB 命中旧缓存场景或 generateWeekPlan 未填 slots 时不破)
                        const slotsBreakfast = day.slots
                          ?.filter(s => s.slotType === 'breakfast')
                          .map(s => s.primary.dish);
                        const dayBreakfast = (slotsBreakfast && slotsBreakfast.length > 0)
                          ? slotsBreakfast : (day.breakfastDishes ?? []);
                        const slotsLunch = day.slots
                          ?.filter(s => s.slotType === 'lunch_main' || s.slotType === 'lunch_side')
                          .map(s => s.primary.dish);
                        const dayLunch = (slotsLunch && slotsLunch.length > 0)
                          ? slotsLunch : (day.lunchDishes ?? []);
                        const slotsDinner = day.slots
                          ?.filter(s =>
                            s.slotType === 'dinner_main' ||
                            s.slotType === 'dinner_side' ||
                            s.slotType === 'dinner_kid'
                          )
                          .map(s => s.primary.dish);
                        const dayDinner = (slotsDinner && slotsDinner.length > 0)
                          ? slotsDinner : (day.dishes ?? []);
                        const locked = isDayLocked(i);
                        // 周末规则：周一-周五为本周菜单，今天之前的日子隐藏
                        // 避免用户星期三还看到周一周二的"昨日菜"。
                        if (day.dayIndex < todayIdx) return null;
                        if (day.dayIndex >= 5)       return null;  // safety: never show 周末
                        // TICKET-074 §D — 非 Pro 用户 day > today+1 时不显示完整菜单，
                        // 改渲染 mini ProGatePreview（日期 header + blur 占位行 +
                        // 「Pro 解锁」简短提示）。底部 LockedDayCard 大 CTA 仍保留。
                        if (locked) {
                          return (
                            <div key={i} id={`day-${i}`} className="mb-3">
                              <div className="px-5 flex items-baseline justify-between mb-2 opacity-60">
                                <p className="font-serif font-black text-white" style={{ fontSize: 18, letterSpacing: "-0.005em" }}>
                                  {dayLabel(i, language === 'zh' || language === 'zh-Hant')}
                                </p>
                                <p className="text-white/30" style={{ fontSize: 11, letterSpacing: "0.04em" }}>
                                  {(() => {
                                    if (!weeklyMenu) return '';
                                    const [y,m,d] = weeklyMenu.weekStart.split('-').map(Number);
                                    const dt = new Date(y, m-1, d + i);
                                    return `${dt.getMonth()+1}/${dt.getDate()}`;
                                  })()}
                                </p>
                              </div>
                              <div className="mx-5 rounded-2xl px-4 py-3 flex items-center gap-3"
                                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "rgba(255,90,31,0.70)" }}>lock</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-white/80" style={{ fontSize: 12 }}>
                                    🌟 升级 Pro 解锁本日菜单
                                  </p>
                                  <p className="text-white/40 mt-0.5" style={{ fontSize: 10 }}>
                                    提早 3-5 天看到全周排菜，从容采购备料
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={i} id={`day-${i}`} className="mb-5">
                            <div className="px-5 flex items-baseline justify-between mb-2">
                              <p className="font-serif font-black text-white" style={{ fontSize: 22, letterSpacing: "-0.005em" }}>
                                {dayLabel(i, language === 'zh' || language === 'zh-Hant')}
                              </p>
                              <p className="text-white/35" style={{ fontSize: 11, letterSpacing: "0.04em" }}>
                                {(() => {
                                  if (!weeklyMenu) return '';
                                  const [y,m,d] = weeklyMenu.weekStart.split('-').map(Number);
                                  const dt = new Date(y, m-1, d + i);
                                  return `${dt.getMonth()+1}/${dt.getDate()}`;
                                })()}
                              </p>
                            </div>
                            {/* TICKET-082 §Phase 5b — 当天开饭时间 chip (日级 schedule).
                                householdId 缺失 (未建 household) 隐藏. */}
                            {householdId && (() => {
                              const sch = schedulesByDay[i];
                              return (
                                <div className="px-5 flex items-center gap-2 mb-3 flex-wrap">
                                  <span className="font-serif italic shrink-0" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                                    {t('Eat at', '开饭')}
                                  </span>
                                  <button onClick={() => openMealEditor(i, 'lunch')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full active:scale-90 transition-transform shrink-0"
                                    style={{ background: "rgba(255,90,31,0.18)", border: "1px solid rgba(255,90,31,0.35)", fontSize: 11, color: "#FF8C54", fontWeight: 700 }}>
                                    <span>🍱</span>
                                    <span className="tabular-nums">{sch?.lunch_time ?? '--:--'}</span>
                                    <span className="material-symbols-outlined" style={{ fontSize: 11, color: "rgba(255,140,84,0.7)" }}>edit</span>
                                  </button>
                                  <button onClick={() => openMealEditor(i, 'dinner')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full active:scale-90 transition-transform shrink-0"
                                    style={{ background: "rgba(255,90,31,0.18)", border: "1px solid rgba(255,90,31,0.35)", fontSize: 11, color: "#FF8C54", fontWeight: 700 }}>
                                    <span>🍽</span>
                                    <span className="tabular-nums">{sch?.dinner_time ?? '--:--'}</span>
                                    <span className="material-symbols-outlined" style={{ fontSize: 11, color: "rgba(255,140,84,0.7)" }}>edit</span>
                                  </button>
                                </div>
                              );
                            })()}
                            {/* Per-day "谁在家吃" chip row — tap to toggle each
                                member for this day. Drives both dish count
                                (calcDishCount) and procurement quantity. */}
                            {familyMembers.length > 0 && (() => {
                              const dayEating = getEatingForDay(i);
                              const isCustom = !!homeByDay[i];
                              return (
                                <div className="px-5 flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3">
                                  <span className="font-serif italic shrink-0" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                                    在家
                                  </span>
                                  {familyMembers.map(m => {
                                    const sel = dayEating.includes(m.id);
                                    return (
                                      <button key={m.id}
                                        onClick={() => toggleMemberForDay(i, m.id)}
                                        className="px-2.5 py-1 rounded-full active:scale-90 transition-transform shrink-0"
                                        style={{
                                          fontSize: 11, fontWeight: 600,
                                          background: sel ? "rgba(255,90,31,0.20)" : "rgba(255,255,255,0.06)",
                                          color:      sel ? "#FF8C54"           : "rgba(255,255,255,0.45)",
                                          border:     sel ? "1px solid rgba(255,140,84,0.40)" : "1px solid rgba(255,255,255,0.10)",
                                        }}>
                                        {m.name?.slice(0, 1) || '·'} {dayEating.length === 0 ? '' : ''}
                                      </button>
                                    );
                                  })}
                                  <span className="shrink-0" style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>
                                    · {dayEating.length} 人{isCustom ? ' (本日)' : ''}
                                  </span>
                                </div>
                              );
                            })()}
                            {/* TICKET-022 §A — per-day slot lookup keyed by primary.dish.id;
                                feeds DishCard badges + CandidateGrid expansion. */}
                            {(() => {
                              const slotsByDishId: Record<string, SlotPlan> = {};
                              for (const sp of day.slots ?? []) {
                                if (sp.primary?.dish?.id) slotsByDishId[sp.primary.dish.id] = sp;
                              }
                              const expandedDishId = expandedGridKey?.startsWith(`${i}:`)
                                ? expandedGridKey.slice(`${i}:`.length)
                                : null;
                              // TICKET-024 §B — "我吃了" only active for TODAY's day (i === todayIdx).
                              // Future days can't log "ate" yet; past days hidden from render entirely.
                              const isToday = i === todayIdx;
                              return (<>
                                <MealSection mealIdx={0} dishes={dayBreakfast} familyMembers={familyMembers} homeToday={getEatingForDay(i)} michelinByDishId={overlayForDay}
                                  slotsByDishId={slotsByDishId}
                                  onMarkEaten={isToday ? (d) => handleMarkEaten(d, 0) : undefined}
                                  eatenSet={isToday ? eatenSet : undefined} />
                                <MealSection mealIdx={1} dishes={dayLunch}     familyMembers={familyMembers} homeToday={getEatingForDay(i)} michelinByDishId={overlayForDay}
                                  slotsByDishId={slotsByDishId}
                                  onMarkEaten={isToday ? (d) => handleMarkEaten(d, 1) : undefined}
                                  eatenSet={isToday ? eatenSet : undefined} />
                                <MealSection mealIdx={2} dishes={dayDinner}    familyMembers={familyMembers} homeToday={getEatingForDay(i)} michelinByDishId={overlayForDay}
                                  onSwapSlot={(slotIdx) => handleSwapDinner(i, slotIdx)}
                                  swappingSlot={swapBusy?.startsWith(`${i}:`) ? Number(swapBusy.split(':')[1]) : -1}
                                  slotsByDishId={slotsByDishId}
                                  expandedDishId={expandedDishId}
                                  onToggleExpand={(dishId) => handleToggleExpand(i, dishId)}
                                  onPickCandidate={(slotIdx, pick) => handlePickCandidate(i, slotIdx, pick)}
                                  onMarkEaten={isToday ? (d) => handleMarkEaten(d, 2) : undefined}
                                  eatenSet={isToday ? eatenSet : undefined} />
                              </>);
                            })()}
                          </div>
                        );
                      })}
                      {/* Free-tier locked days hint */}
                      {!isPro && (
                        <div className="mx-5 mt-2">
                          <LockedDayCard onUnlock={() => navigate('/pricing')} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Removed the bottom mini-strip: the whole week is already
                      rendered above; mini strip was a leftover from the old
                      single-day detail layout. */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* ── Bottom CTA ───────────────────────────────────────────── */}
      {/* ── Shopping list CTA (above tab bar) ─────────────────── */}
      {/* z-[60] 高于 BottomTabBar z-50, bottom 用 safe-area + tab bar 高度避免
          视觉/点击重叠 (TELEPOT-052 P0 fix: 老板真测点击无效 — 旧 z-20 +
          bottom:64 让 button 下半被 nav 覆盖 + click 被 z-50 nav 拦截). */}
      <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-[60] px-5 pt-3 pb-2"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 16px) + 64px)", background: "linear-gradient(to top, #0a0a0a 55%, transparent 100%)" }}>
        <button
          onClick={handleShoppingList}
          className="w-full h-[52px] rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: isPro
              ? "linear-gradient(135deg, #FF5A1F, #FF8C54)"
              : "rgba(255,255,255,0.08)",
            boxShadow: isPro ? "0 8px 28px rgba(255,90,31,0.35)" : "none",
            border: isPro ? "none" : "1px solid rgba(255,255,255,0.12)",
            fontSize: 15, color: isPro ? "white" : "rgba(255,255,255,0.45)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {isPro ? "shopping_cart" : "workspace_premium"}
          </span>
          {isPro ? t("Generate this week's shopping list", "一键生成本周购物清单") : t("Upgrade · One-step shopping", "升级会员 · 一步采购")}
        </button>
      </div>

      <BottomTabBar />

      {/* TICKET-066 P0 — IntentRegenModal 弹窗已删除, 顶部 IntentInputBox 取代. */}

      {/* TICKET-069 P0 — ChatSwapModal. 老板真测 #14 拍板 1+A. */}
      <ChatSwapModal
        open={swapModalOpen}
        userIntent={swapIntent}
        onClose={() => setSwapModalOpen(false)}
        swapDish={swapDish}
        weeklyMenu={weeklyMenu}
        todayIdx={todayIdx}
      />

      {/* Chef-at-home interest form (placeholder, no real booking yet) */}
      <ChefBookingModal
        open={chefBookingOpen}
        onClose={() => setChefBookingOpen(false)}
        dish={chefBookingDish}
      />

      {/* TICKET-082 §Phase 5b — 当天开饭时间 time picker bottom sheet (每日独立) */}
      {editMeal && (
        <>
          <div className="fixed inset-0 z-[120]" onClick={() => !editBusy && setEditMeal(null)}
            style={{ background: 'rgba(0,0,0,0.55)' }} />
          <div className="fixed left-0 right-0 bottom-0 z-[121] max-w-md mx-auto rounded-t-3xl shadow-2xl"
            style={{ background: '#1a1a1a', paddingBottom: 'env(safe-area-inset-bottom, 16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.08] flex items-center justify-between">
              <p className="font-bold text-white" style={{ fontSize: 15 }}>
                {editMeal.meal === 'lunch'
                  ? t('Set lunch time', '设午饭时间')
                  : t('Set dinner time', '设晚饭时间')}
                {' · '}
                <span className="text-white/55" style={{ fontSize: 12 }}>
                  {dayLabel(editMeal.dayIdx, language === 'zh' || language === 'zh-Hant')}
                </span>
              </p>
              <button onClick={() => !editBusy && setEditMeal(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                <span className="material-symbols-outlined text-white/70" style={{ fontSize: 17 }}>close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input
                type="time"
                value={editTimeInput}
                onChange={e => setEditTimeInput(e.target.value)}
                disabled={editBusy}
                className="w-full px-4 py-3 rounded-2xl text-center font-black tabular-nums bg-white/5 border-2 border-orange-500/40 text-[#FF8C54]"
                style={{ fontSize: 28 }}
              />
              <button onClick={saveMealEdit} disabled={editBusy}
                className="w-full py-3 rounded-2xl font-bold text-white active:scale-[0.98] transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #FF5A1F, #FF8C54)', fontSize: 14 }}>
                {editBusy ? '…' : t('Save', '保存')}
              </button>
              <p className="text-center text-white/45" style={{ fontSize: 11 }}>
                {t('Only changes this day. Default time is in Settings.', '只改这一天。默认时间在设置里。')}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
