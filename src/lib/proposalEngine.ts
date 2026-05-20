/**
 * proposalEngine — SPEC §6 3-候选 wrapper.
 *
 * generateWeekPlan in useWeeklyMenu.ts has no `seed` parameter yet (Algorithm
 * Day 2 / TICKET-015 will add it and bump ALGO_VERSION v40 → v41). Until then
 * this wrapper takes the current cached WeeklyMenu as input and produces
 * three deterministic shuffled variants — same dishes, different
 * day-by-day permutations — so the UI can demo the A/B/C UX without
 * touching useWeeklyMenu's signature.
 *
 * The shuffle is keyed on (seed + dayIndex) so every (proposal, day) pair
 * yields the same order across renders. When Algorithm Day 2 lands, swap
 * the body of `generateThreeProposals` to call generateWeekPlan(seed=N)
 * three times in parallel and the call site stays the same.
 */
import type { WeeklyMenu, WeeklyDayMenu } from '../hooks/useWeeklyMenu';
import type { WeekPlan } from '../hooks/useChatSession';

const PROPOSAL_SEEDS = [0, 1, 2] as const;

/**
 * Linear-congruential PRNG (Park-Miller). Deterministic, fast, no allocations
 * in the inner loop — good enough for UI shuffling.
 */
function lcgShuffle<T>(arr: readonly T[], seed: number): T[] {
  if (arr.length <= 1) return [...arr];
  const out = [...arr];
  let s = Math.max(1, (seed * 2654435761) % 0x7fffffff);
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffleDay(day: WeeklyDayMenu, seed: number): WeeklyDayMenu {
  return {
    ...day,
    dishes:          lcgShuffle(day.dishes,          seed + day.dayIndex * 7),
    lunchDishes:     lcgShuffle(day.lunchDishes,     seed + day.dayIndex * 11),
    breakfastDishes: lcgShuffle(day.breakfastDishes, seed + day.dayIndex * 13),
  };
}

/**
 * Three deterministic variants of the input WeekPlan. Returns [] when the
 * input is null/empty — caller decides whether to fall back to a system
 * "menu not ready" bubble.
 */
export function generateThreeProposals(base: WeeklyMenu | null): WeekPlan[] {
  if (!base || !base.days || base.days.length === 0) return [];
  return PROPOSAL_SEEDS.map(seed => ({
    ...base,
    days: base.days.map(day => shuffleDay(day, seed)),
  }));
}
