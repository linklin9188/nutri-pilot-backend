/**
 * useAccessControl — centralized access control for all pages.
 *
 * Rules:
 *   - All users (including anonymous) can browse TODAY + next 2 days
 *   - Logged-in users get full 7-day menu view + curated suppliers
 *   - Premium members + within-30-day-trial users get everything + luxury suppliers
 *
 * TICKET-037 §C — within 30-day trial 视同 Pro (effectiveIsPremium = isPremium ||
 * (isLoggedIn && isWithinTrial())). raw isPremium localStorage flag 不动 (Stripe
 * webhook 仍 source of truth)。试用过期后回退到 free tier (FREE_DAYS = 3) 限制。
 *
 * Usage:
 *   const { canAccess, isLocked, daysAllowed, userTier } = useAccessControl();
 */

import { useState, useEffect } from "react";
import { getUserTier, UserTier } from "../lib/suppliers";
import { isWithinTrial } from "../lib/userLifecycle";

export const FREE_DAYS = 3; // anonymous users: today + 2 more

export interface AccessControl {
  userTier:   UserTier;
  isLoggedIn: boolean;
  isPremium:  boolean;
  /** Total days the user can see (3 for anon, 7 for logged-in/premium) */
  daysAllowed: number;
  /** Today's index in the 0=Mon…6=Sun week */
  todayIdx:   number;
  /** Whether day index i is locked for this user */
  isDayLocked: (i: number) => boolean;
  /** Whether cooking / prep features are accessible (with 3-day limit for anon) */
  canCook:    boolean;
  /** Whether shopping list is accessible (with supplier tier limit for anon) */
  canShop:    boolean;
}

export function useAccessControl(): AccessControl {
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => localStorage.getItem("isLoggedIn") === "true",
  );
  const [isPremium, setIsPremium] = useState(
    () => localStorage.getItem("isPremium") === "true",
  );

  useEffect(() => {
    const sync = () => {
      setIsLoggedIn(localStorage.getItem("isLoggedIn") === "true");
      setIsPremium(localStorage.getItem("isPremium") === "true");
    };
    window.addEventListener("nutri-prefs-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("nutri-prefs-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const userTier   = getUserTier();
  // TICKET-037 §C — effectiveIsPremium 合并 trial. raw isPremium 不动.
  const effectiveIsPremium = isPremium || (isLoggedIn && isWithinTrial());
  const daysAllowed = isLoggedIn ? 7 : FREE_DAYS;

  // Today's index: Mon=0 … Sun=6
  const todayIdx = (new Date().getDay() + 6) % 7;

  const isDayLocked = (i: number): boolean => {
    if (isLoggedIn) return false;
    return i < todayIdx || i >= todayIdx + FREE_DAYS;
  };

  return {
    userTier,
    isLoggedIn,
    isPremium: effectiveIsPremium,  // §C 合并 trial → 下游 UI 视同 Pro
    daysAllowed,
    todayIdx,
    isDayLocked,
    canCook: true,  // everyone can cook, but anon is limited to 3-day menu
    canShop: true,  // everyone can shop, but supplier tier differs
  };
}
