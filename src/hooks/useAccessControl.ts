/**
 * useAccessControl — centralized access control for all pages.
 *
 * Rules:
 *   - All users (including anonymous) can browse TODAY + next 2 days
 *   - Logged-in users get full 7-day access + curated suppliers
 *   - Premium members get everything + luxury suppliers
 *
 * Usage:
 *   const { canAccess, isLocked, daysAllowed, userTier } = useAccessControl();
 */

import { useState, useEffect } from "react";
import { getUserTier, UserTier } from "../lib/suppliers";

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
    isPremium,
    daysAllowed,
    todayIdx,
    isDayLocked,
    canCook: true,  // everyone can cook, but anon is limited to 3-day menu
    canShop: true,  // everyone can shop, but supplier tier differs
  };
}
