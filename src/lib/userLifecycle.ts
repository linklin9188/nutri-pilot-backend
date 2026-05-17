/**
 * userLifecycle.ts — first-login bookkeeping + 7-day trial window.
 *
 * Drives the new-user vs returning-user split on Home (weekend dining is
 * only for returning users) and the 7-day free trial after which the daily
 * menu paywalls behind /pricing for non-members.
 *
 * Storage layout:
 *   localStorage.nutri_first_login_at      — ms epoch, written once per device
 *   sessionStorage.nutri_session_new       — 'true' iff THIS browser session
 *                                            is the one that just performed
 *                                            the first-ever login. Cleared
 *                                            when the tab closes — so the
 *                                            second time the user opens the
 *                                            app, they are already "returning"
 *                                            and the weekend-dining surface
 *                                            kicks in.
 */

const LS_FIRST_LOGIN_AT  = 'nutri_first_login_at';
const SS_SESSION_IS_NEW  = 'nutri_session_new';

const TRIAL_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/**
 * Call on every successful login. The first call per device records the
 * timestamp AND marks the current session as the "new user" session.
 * Subsequent calls are no-ops on localStorage but do not re-mark the
 * session — returning users stay returning users even if they re-login
 * (e.g. switched role and signed back in).
 */
export function markLogin(): void {
  if (!localStorage.getItem(LS_FIRST_LOGIN_AT)) {
    localStorage.setItem(LS_FIRST_LOGIN_AT, String(Date.now()));
    sessionStorage.setItem(SS_SESSION_IS_NEW, 'true');
  }
}

/** Read the first-login epoch ms, or null if never. */
export function getFirstLoginAt(): number | null {
  const raw = localStorage.getItem(LS_FIRST_LOGIN_AT);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * True only while the user is inside the very browser session that
 * performed the first-ever login. Closing the tab clears it; reopening
 * starts the "returning user" experience even if seconds later.
 *
 * Used by Home to keep new users on the daily-menu surface (no weekend
 * dining detour) so their first impression is the menu we sold them.
 */
export function isNewUserSession(): boolean {
  return sessionStorage.getItem(SS_SESSION_IS_NEW) === 'true';
}

/** Days elapsed since first login, floored. 0 on the day they signed up. */
export function daysIntoTrial(): number {
  const t = getFirstLoginAt();
  if (t == null) return 0;
  return Math.floor((Date.now() - t) / MS_PER_DAY);
}

/**
 * Free-tier window: 7 days from first login. Pro members ignore this —
 * callers should check isPro first and only fall through to isWithinTrial.
 * Returns true when no first_login_at recorded yet (anonymous / pre-login
 * users haven't started their trial).
 */
export function isWithinTrial(): boolean {
  const t = getFirstLoginAt();
  if (t == null) return true;
  return (Date.now() - t) < TRIAL_DAYS * MS_PER_DAY;
}

/** Whole days remaining on the trial. Clamped to [0, 7]. */
export function trialDaysRemaining(): number {
  const used = daysIntoTrial();
  return Math.max(0, TRIAL_DAYS - used);
}
