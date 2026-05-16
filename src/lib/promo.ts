/**
 * promo.ts — launch-period business rules.
 *
 * Product decision (2026-05-16): the 拓客期 / launch promo was removed.
 * Pro features now require a paid Stripe subscription for everyone except
 * helpers — there's no free unlock window.
 *
 * One remaining free tier:
 *
 *   **Helpers (菲佣) — permanently free.** Domestic helpers
 *   (`localStorage.nutri_role === 'helper'`) never pay; they're invited
 *   by an employer and use the helper-side UI exclusively.
 *
 * Keep this file pure (no React imports) so it can be used from
 * non-React code paths too.
 */

// Promo constants kept exported (as 0 / no-op) so any straggling imports
// don't blow up at build time. Safe to delete once nothing imports them.
export const PROMO_START_AT = '2026-05-14T00:00:00+08:00';
export const PROMO_DAYS     = 0;

export function isPromoActive(_now: Date = new Date()): boolean {
  return false;            // promo permanently off
}

/** Always 0 now — kept so /pricing's old "X 天后期满" copy doesn't crash. */
export function promoDaysLeft(_now: Date = new Date()): number {
  return 0;
}

export function promoEndDate(): Date {
  return new Date(PROMO_START_AT);
}

/** Is the current device acting as a helper? Helpers are always free. */
export function isHelperRole(): boolean {
  return localStorage.getItem('nutri_role') === 'helper';
}

/**
 * "Why is this user effectively Pro?" — one of:
 *   - 'paid'   they actually paid via Stripe (or dev-activated)
 *   - 'helper' the device is on the helper side
 *   - 'none'   none of the above; show paywall
 *
 * 'promo' is deliberately no longer returned — the promo path was retired.
 * Callers that switch on ProReason still compile (the type still includes
 * 'promo' for backward compat with the membership card / pricing copy),
 * but effectiveProReason() will never return it.
 */
export type ProReason = 'paid' | 'promo' | 'helper' | 'none';

export function effectiveProReason(args: { paidIsPro: boolean }): ProReason {
  if (args.paidIsPro)   return 'paid';
  if (isHelperRole())   return 'helper';
  return 'none';
}
