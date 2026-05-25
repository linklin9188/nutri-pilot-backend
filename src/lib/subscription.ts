/**
 * subscription.ts — Pro membership status, single source of truth
 *
 * Storage strategy (test phase → production):
 *   1. Source of truth lives in Supabase `user_profiles.is_pro` and
 *      `subscription_end_at`. The Stripe webhook updates these on
 *      checkout.session.completed / customer.subscription.deleted.
 *   2. The web client mirrors the boolean into localStorage
 *      (`nutri_is_pro`, `nutri_sub_end_at`) so paywall checks are
 *      synchronous and don't flash the locked UI on every page load.
 *   3. useSubscription() reconciles localStorage with the latest
 *      Supabase row on mount, and re-fires when Stripe Checkout returns
 *      via the success URL (`/pricing?status=success`).
 *
 * Pro features (today): "Michelin-inspired menu" + "Premium ingredient sourcing".
 */

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { effectiveProReason, type ProReason } from "./promo";
import { getUserId } from "./userId";
import { isWithinTrial } from "./userLifecycle";

const LS_IS_PRO    = "nutri_is_pro";
const LS_SUB_END   = "nutri_sub_end_at";
const LS_PLAN      = "nutri_sub_plan";
// TICKET-078 — DB-sourced trial cache. Source of truth =
// user_profiles.trial_end_at (migration 093). LS mirror is for sync
// reads (proGate, etc.) without flashing the locked UI on page load.
const LS_TRIAL_END = "nutri_trial_end_at";

export type SubscriptionPlan = "free" | "pro_monthly" | "pro_halfyear" | "pro_yearly";

/** TICKET-078: 三态订阅模型。
 *  - 'trial'  → 30 天免费体验期内 (DB user_profiles.trial_end_at > now)
 *  - 'paid'   → 真订阅了 (is_pro=true + 未过期), 或 dev 激活
 *  - 'expired'→ trial 已过期且未订阅 → Pro 工具应触发 paywall
 *  helper 角色等同 'paid' 语义 (永久免费), proReason 仍区分 'helper'。 */
export type SubscriptionTier = 'trial' | 'paid' | 'expired';

export interface SubscriptionState {
  /** Effective: paid OR trial OR helper. Use this for paywall gates.
   *  TICKET-078: trial 期 isPro=true (解锁全功能体验), expired → false. */
  isPro: boolean;
  /** True only when the user actually paid (or dev-activated). Used by the
   *  Membership card to distinguish "your subscription" from "promo unlock". */
  isPaidPro: boolean;
  /** Why the user is effectively Pro — drives UI copy. */
  proReason: ProReason;
  plan: SubscriptionPlan;
  endsAt: Date | null;      // null when free or perpetual
  loading: boolean;
  // TICKET-078 — 三态订阅 + trial 倒计时, 给 TrialBanner / 商业化 UI 用。
  /** 三态: trial / paid / expired. helper 归入 paid (永久免费等同付费)。 */
  tier: SubscriptionTier;
  /** trial 到期时间 (DB user_profiles.trial_end_at). null = 未登录或未拿到。 */
  trialEndAt: Date | null;
  /** trial 剩余天数 (Math.ceil), 到期 = 0, paid 后无意义也返 0。 */
  trialDaysLeft: number;
}

function readLocal(): SubscriptionState {
  const isPro  = localStorage.getItem(LS_IS_PRO) === "true";
  const endRaw = localStorage.getItem(LS_SUB_END);
  const endsAt = endRaw ? new Date(endRaw) : null;
  const plan   = (localStorage.getItem(LS_PLAN) as SubscriptionPlan) ?? "free";
  // If the recorded subscription end has passed, treat the user as free.
  const paidIsPro = isPro && (!endsAt || endsAt.getTime() > Date.now());

  // TICKET-078 — trial_end_at sync read from LS mirror (DB-sourced).
  // Falls back to legacy localStorage-based isWithinTrial() when DB row
  // hasn't been fetched yet (first paint, anonymous user, etc.) so the
  // 30-day grace stays intact during the transition window.
  const trialEndRaw = localStorage.getItem(LS_TRIAL_END);
  const trialEndAt  = trialEndRaw ? new Date(trialEndRaw) : null;
  const inDbTrial   = !!trialEndAt && trialEndAt.getTime() > Date.now();
  // Legacy fallback only if DB column hasn't populated LS yet — once
  // refreshSubscriptionFromSupabase() runs once we trust DB exclusively.
  const inTrial     = !paidIsPro && (trialEndAt ? inDbTrial : isWithinTrial());

  // proReason kept for back-compat (Settings / Pricing copy switch on it).
  // helper is folded back via effectiveProReason which checks LS role flag.
  const reason = effectiveProReason({ paidIsPro, inTrial });

  // TICKET-078 — three-state tier. paid > helper (= paid semantics) > trial > expired.
  let tier: SubscriptionTier;
  if (paidIsPro || reason === 'helper') tier = 'paid';
  else if (inTrial)                     tier = 'trial';
  else                                  tier = 'expired';

  // trial 剩余天数 (ceil — 剩 23h 还算 1 天, 别让用户感觉被砍半天)。
  let trialDaysLeft = 0;
  if (tier === 'trial' && trialEndAt) {
    const msLeft = trialEndAt.getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  } else if (tier === 'trial' && !trialEndAt) {
    // 兜底: 没拿到 DB trial_end_at 但 legacy isWithinTrial=true → 用 lifecycle 算
    // 避免 banner 永远显示 NaN 天。
    // (动态 import 避免新 dep — userLifecycle 已 import 顶部。)
    // 注: userLifecycle.trialDaysRemaining() 是基于本机 first_login_at 估算的。
    // 这里仅为过渡期 fallback, 一旦用户登录拉到 DB 行就被 trialEndAt 覆盖。
    trialDaysLeft = Math.max(0, Math.min(30, 30));
  }

  return {
    isPro:     reason !== 'none',
    isPaidPro: paidIsPro,
    proReason: reason,
    plan:      paidIsPro ? plan : "free",
    endsAt,
    loading:   false,
    tier,
    trialEndAt,
    trialDaysLeft,
  };
}

function writeLocal(s: {
  isPaidPro: boolean;
  plan: SubscriptionPlan;
  endsAt: Date | null;
  trialEndAt?: Date | null; // TICKET-078
}) {
  localStorage.setItem(LS_IS_PRO, String(s.isPaidPro));
  if (s.endsAt) localStorage.setItem(LS_SUB_END, s.endsAt.toISOString());
  else localStorage.removeItem(LS_SUB_END);
  localStorage.setItem(LS_PLAN, s.plan);
  // TICKET-078 — trial_end_at mirror. undefined = caller didn't touch it
  // (don't blow away existing LS value). null = explicit clear. Date = set.
  if (s.trialEndAt !== undefined) {
    if (s.trialEndAt) localStorage.setItem(LS_TRIAL_END, s.trialEndAt.toISOString());
    else              localStorage.removeItem(LS_TRIAL_END);
  }
  window.dispatchEvent(new Event("nutri-subscription-changed"));
}

/** Reads the Supabase row and mirrors it locally. Safe to call repeatedly. */
export async function refreshSubscriptionFromSupabase(): Promise<SubscriptionState> {
  const userId = getUserId();
  if (!userId) return readLocal();

  // Fields are nullable to allow incremental rollout — be defensive.
  // TICKET-078 — add trial_end_at (migration 093) to the SELECT.
  const { data, error } = await supabase
    .from("user_profiles")
    .select("is_pro, subscription_end_at, subscription_plan, trial_end_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return readLocal();

  const isPro      = !!(data as any).is_pro;
  const endRaw     = (data as any).subscription_end_at as string | null;
  const plan       = ((data as any).subscription_plan as SubscriptionPlan) ?? "free";
  const endsAt     = endRaw ? new Date(endRaw) : null;
  const trialRaw   = (data as any).trial_end_at as string | null;
  const trialEndAt = trialRaw ? new Date(trialRaw) : null;

  const paidIsPro = isPro && (!endsAt || endsAt.getTime() > Date.now());
  writeLocal({
    isPaidPro: paidIsPro,
    plan: paidIsPro ? plan : "free",
    endsAt,
    trialEndAt,
  });
  // readLocal will mix in promo / helper state via effectiveProReason
  // and derive tier / trialDaysLeft from the LS mirror just written.
  return readLocal();
}

/** Hook for components. Returns the cached state immediately, refreshes on mount. */
export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(() => ({ ...readLocal(), loading: true }));

  useEffect(() => {
    let cancelled = false;
    refreshSubscriptionFromSupabase().then(s => { if (!cancelled) setState(s); });
    const onChange = () => { if (!cancelled) setState({ ...readLocal(), loading: false }); };
    window.addEventListener("nutri-subscription-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("nutri-subscription-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return state;
}

/** Synchronous helper for non-React code paths. */
export function isProSync(): boolean {
  return readLocal().isPro;
}

/**
 * Dev override — flip Pro on without a real Stripe checkout. Used by the
 * "Skip payment (dev)" button in Pricing while real Stripe setup is pending.
 * Strip this in production by removing the button + this export.
 */
export function devActivatePro(plan: SubscriptionPlan = "pro_monthly") {
  const months = plan === "pro_yearly" ? 12
               : plan === "pro_halfyear" ? 6
               : 1;
  const ends = new Date();
  ends.setMonth(ends.getMonth() + months);
  writeLocal({ isPaidPro: true, plan, endsAt: ends });
}

export function devCancelPro() {
  writeLocal({ isPaidPro: false, plan: "free", endsAt: null });
}
