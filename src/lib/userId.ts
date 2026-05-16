/**
 * Unified accessor for the current user's localStorage id.
 *
 * Historical state: Login.tsx wrote 'userId'; Onboarding.tsx wrote
 * 'nutri_user_id'. Different parts of the app read different keys, so a
 * user who came through Login would have a working Stripe/profile flow
 * but the recommend hook would read null and skip user_preference_scores
 * entirely (silently breaking the learned-preference signal).
 *
 * This helper reads 'userId' first, falls back to 'nutri_user_id', and
 * on first hit auto-migrates the legacy key into 'userId' so subsequent
 * reads are consistent. New writes should always target 'userId'.
 */

const PRIMARY = 'userId';
const LEGACY  = 'nutri_user_id';

export function getUserId(): string | null {
  const primary = localStorage.getItem(PRIMARY);
  if (primary) return primary;
  const legacy = localStorage.getItem(LEGACY);
  if (legacy) {
    localStorage.setItem(PRIMARY, legacy);
    return legacy;
  }
  return null;
}

export function setUserId(id: string): void {
  localStorage.setItem(PRIMARY, id);
  // Keep legacy in sync during transition so any not-yet-migrated read
  // site still works. Safe to delete this line once all reads use getUserId.
  localStorage.setItem(LEGACY, id);
}

export function clearUserId(): void {
  localStorage.removeItem(PRIMARY);
  localStorage.removeItem(LEGACY);
}
