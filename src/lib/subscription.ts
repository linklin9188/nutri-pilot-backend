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

const LS_IS_PRO    = "nutri_is_pro";
const LS_SUB_END   = "nutri_sub_end_at";
const LS_PLAN      = "nutri_sub_plan";

export type SubscriptionPlan = "free" | "pro_monthly" | "pro_halfyear" | "pro_yearly";

export interface SubscriptionState {
  /** Effective: paid OR promo OR helper. Use this for paywall gates. */
  isPro: boolean;
  /** True only when the user actually paid (or dev-activated). Used by the
   *  Membership card to distinguish "your subscription" from "promo unlock". */
  isPaidPro: boolean;
  /** Why the user is effectively Pro — drives UI copy. */
  proReason: ProReason;
  plan: SubscriptionPlan;
  endsAt: Date | null;      // null when free or perpetual
  loading: boolean;
}

function readLocal(): SubscriptionState {
  const isPro  = localStorage.getItem(LS_IS_PRO) === "true";
  const endRaw = localStorage.getItem(LS_SUB_END);
  const endsAt = endRaw ? new Date(endRaw) : null;
  const plan   = (localStorage.getItem(LS_PLAN) as SubscriptionPlan) ?? "free";
  // If the recorded subscription end has passed, treat the user as free.
  const paidIsPro = isPro && (!endsAt || endsAt.getTime() > Date.now());
  const reason = effectiveProReason({ paidIsPro });
  return {
    isPro:     reason !== 'none',
    isPaidPro: paidIsPro,
    proReason: reason,
    plan:      paidIsPro ? plan : "free",
    endsAt,
    loading:   false,
  };
}

function writeLocal(s: { isPaidPro: boolean; plan: SubscriptionPlan; endsAt: Date | null }) {
  localStorage.setItem(LS_IS_PRO, String(s.isPaidPro));
  if (s.endsAt) localStorage.setItem(LS_SUB_END, s.endsAt.toISOString());
  else localStorage.removeItem(LS_SUB_END);
  localStorage.setItem(LS_PLAN, s.plan);
  window.dispatchEvent(new Event("nutri-subscription-changed"));
}

/** Reads the Supabase row and mirrors it locally. Safe to call repeatedly. */
export async function refreshSubscriptionFromSupabase(): Promise<SubscriptionState> {
  const userId = getUserId();
  if (!userId) return readLocal();

  // Fields are nullable to allow incremental rollout — be defensive.
  const { data, error } = await supabase
    .from("user_profiles")
    .select("is_pro, subscription_end_at, subscription_plan")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return readLocal();

  const isPro  = !!(data as any).is_pro;
  const endRaw = (data as any).subscription_end_at as string | null;
  const plan   = ((data as any).subscription_plan as SubscriptionPlan) ?? "free";
  const endsAt = endRaw ? new Date(endRaw) : null;

  const paidIsPro = isPro && (!endsAt || endsAt.getTime() > Date.now());
  writeLocal({ isPaidPro: paidIsPro, plan: paidIsPro ? plan : "free", endsAt });
  // readLocal will mix in promo / helper state via effectiveProReason.
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
