/**
 * promo.ts — launch-period business rules.
 *
 * Two free tiers that bypass Stripe:
 *
 *   1. **Promo period (拓客期)** — for the first 90 days after launch,
 *      every employer gets all Pro features for free. The /pricing page
 *      shows a celebratory banner instead of price tiles. After the
 *      promo ends, employers fall back to the normal paywall.
 *
 *   2. **Helpers (菲佣) — permanently free.** Domestic helpers
 *      (`localStorage.nutri_role === 'helper'`) never pay; they're
 *      invited by an employer and use the helper-side UI exclusively.
 *
 * Keep this file pure (no React imports) so it can be used from
 * non-React code paths too.
 */

// Launch date — kept as a constant so we don't depend on when the user's
// device clock thinks 'now' is. Update this once at real launch. The end is
// computed as start + PROMO_DAYS so we always have a single source of truth.
//
// 2026-05-14 is the soft-launch date for the HK family beta.
export const PROMO_START_AT = '2026-05-14T00:00:00+08:00';
export const PROMO_DAYS     = 90;

const PROMO_END_AT_MS = (() => {
  const start = new Date(PROMO_START_AT).getTime();
  return start + PROMO_DAYS * 24 * 60 * 60 * 1000;
})();

export function isPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < PROMO_END_AT_MS;
}

/** Days remaining in the promo, rounded up to a whole day. 0 if expired. */
export function promoDaysLeft(now: Date = new Date()): number {
  const ms = PROMO_END_AT_MS - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function promoEndDate(): Date {
  return new Date(PROMO_END_AT_MS);
}

/** Is the current device acting as a helper? Helpers are always free. */
export function isHelperRole(): boolean {
  return localStorage.getItem('nutri_role') === 'helper';
}

/**
 * "Why is this user effectively Pro?" — one of:
 *   - 'paid'   they actually paid via Stripe (or dev-activated)
 *   - 'promo'  inside the launch promo window
 *   - 'helper' the device is on the helper side
 *   - 'none'   none of the above; show paywall
 */
export type ProReason = 'paid' | 'promo' | 'helper' | 'none';

export function effectiveProReason(args: { paidIsPro: boolean }): ProReason {
  if (args.paidIsPro)   return 'paid';
  if (isHelperRole())   return 'helper';
  if (isPromoActive())  return 'promo';
  return 'none';
}
