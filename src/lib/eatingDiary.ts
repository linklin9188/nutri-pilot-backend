/**
 * eatingDiary.ts — track what the family actually ate today, separate
 * from what was PLANNED. Lets DailyNutritionStrip flip from "forecast"
 * (mid-day, no meals eaten yet) to "diary" (evening, dishes ticked off
 * as eaten).
 *
 * localStorage shape:
 *   eaten_2026-05-16 = ["dish-uuid-1", "dish-uuid-2", …]
 *
 * Date-scoped key, so yesterday's diary doesn't bleed into today and
 * we don't have to schedule a midnight clear. Old keys are pruned
 * lazily by pruneOldKeys() (anything older than 14 days is dropped on
 * any read).
 */

const KEY_PREFIX = 'eaten_';

function todayKey(): string {
  const d = new Date();
  return `${KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}

function writeSet(key: string, set: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

function pruneOldKeys() {
  const now = Date.now();
  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(KEY_PREFIX)) continue;
      const dateStr = k.slice(KEY_PREFIX.length);   // YYYY-MM-DD
      const parsed = Date.parse(dateStr);
      if (Number.isFinite(parsed) && now - parsed > FOURTEEN_DAYS) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* private mode etc — non-critical */ }
}

/** Today's set of eaten dish ids. */
export function getEatenToday(): Set<string> {
  pruneOldKeys();
  return readSet(todayKey());
}

/** Mark a single dish as eaten today. */
export function markEaten(dishId: string) {
  const k = todayKey();
  const s = readSet(k);
  s.add(dishId);
  writeSet(k, s);
  window.dispatchEvent(new Event('nutri-eaten-changed'));
}

/** Unmark (toggle off). */
export function unmarkEaten(dishId: string) {
  const k = todayKey();
  const s = readSet(k);
  s.delete(dishId);
  writeSet(k, s);
  window.dispatchEvent(new Event('nutri-eaten-changed'));
}

/** Toggle — convenience for checkbox-style UI. */
export function toggleEaten(dishId: string): boolean {
  const k = todayKey();
  const s = readSet(k);
  const wasEaten = s.has(dishId);
  if (wasEaten) s.delete(dishId); else s.add(dishId);
  writeSet(k, s);
  window.dispatchEvent(new Event('nutri-eaten-changed'));
  return !wasEaten;
}

/** Mark every dish in `ids` as eaten in one call (one-tap "整餐吃完"). */
export function markMealEaten(ids: string[]) {
  const k = todayKey();
  const s = readSet(k);
  for (const id of ids) s.add(id);
  writeSet(k, s);
  window.dispatchEvent(new Event('nutri-eaten-changed'));
}
