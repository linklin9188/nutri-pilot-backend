/**
 * proposalEngine — SPEC §6 3-候选 wrapper with semantic variants.
 *
 * Three variants per ticket TICKET-034 §A — each tagged so the user reads
 * "for what reason is this different" instead of "shuffled identically":
 *
 *   A — balanced     (均衡推荐): default deterministic shuffle. Axis weights 1.0.
 *   B — seasonal     (应季应景): rerank dishes with `seasonal_tag` set OR
 *                                 `festival_tags` non-empty to the front (+50–100%
 *                                 of original seasonal-axis weight).
 *   C — personalized (投你所好): rerank dishes with `health_benefit_tags`
 *                                 set (proxy for "intentionally tagged")
 *                                 to the front (+80% of the preference-axis
 *                                 weight). When prefScores is wired in a
 *                                 future ticket, the rerank can swap to a
 *                                 true user-aware score.
 *
 * The rerank is a post-process applied to the deterministic shuffle output —
 * generateWeekPlan in useWeeklyMenu.ts is NOT touched (per TICKET-034 §A
 * "做法：调用 generateWeekPlan 后对结果 dishes 做 post-process（按 axis 标签
 * rerank 一次），不要求 Algorithm 改 hook 签名").
 *
 * The shuffle is keyed on (seed + dayIndex) so every (proposal, day) pair
 * yields the same order across renders; the variant rerank then re-sorts
 * within each meal slot, so two days with the same variant always produce
 * the same dish ordering across re-renders.
 */
import type { WeeklyMenu, WeeklyDayMenu } from '../hooks/useWeeklyMenu';
import type { SupabaseDish } from '../hooks/useSupabaseMenu';
import type { WeekPlan } from '../hooks/useChatSession';

export type ProposalVariant = 'balanced' | 'seasonal' | 'personalized';

export interface VariantMeta {
  variant:     ProposalVariant;
  label:       string;        // 4-char chip label shown on MenuProposal tab
  description: string;        // 1-line subtitle shown in the card body
}

/** Display metadata for each variant — consumed by MenuProposal. */
export const VARIANT_META: Record<ProposalVariant, VariantMeta> = {
  balanced:     { variant: 'balanced',     label: '均衡推荐', description: '所有 axis 权重默认 1.0，中庸推荐' },
  seasonal:     { variant: 'seasonal',     label: '应季应景', description: '当季 + 节庆 axis 加权 50–100%' },
  personalized: { variant: 'personalized', label: '投你所好', description: '历史偏好 + flavor learn 加权 80%' },
};

/** Variant ↔ tab index (A / B / C). Parallel to generateThreeProposals output. */
export const PROPOSAL_VARIANTS: readonly ProposalVariant[] = ['balanced', 'seasonal', 'personalized'];

// ── Internal scoring weights per variant ────────────────────────────────────
// Higher = stronger rerank pull on that axis. balanced uses 1.0 = no rerank.
const VARIANT_AXIS: Record<ProposalVariant, { seasonal: number; festival: number; preference: number }> = {
  balanced:     { seasonal: 1.0, festival: 1.0, preference: 1.0 },
  seasonal:     { seasonal: 1.5, festival: 2.0, preference: 1.0 },
  personalized: { seasonal: 1.0, festival: 1.0, preference: 1.8 },
};

// ── Park-Miller LCG (unchanged from prior commit) ───────────────────────────
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

// ── Variant rerank: stable sort within an already-shuffled array ────────────
// score = (has_seasonal_tag ? 1 : 0)*W.seasonal + (has_festival_tags ? 1 : 0)*W.festival
//       + (has_health_benefit_tags ? 1 : 0)*W.preference
// balanced's all-1.0 weights collapse to no rerank (every dish gets same
// score 0 to 3 by tag-presence, but the LCG order is preserved on ties).
function variantRerank(dishes: SupabaseDish[], variant: ProposalVariant): SupabaseDish[] {
  if (variant === 'balanced' || dishes.length <= 1) return dishes;
  const w = VARIANT_AXIS[variant];
  // Decorate-sort-undecorate to keep stability on ties.
  const decorated = dishes.map((d, originalIdx) => {
    const hasSeasonal = !!(d as any).seasonal_tag;
    const hasFestival = Array.isArray((d as any).festival_tags) && (d as any).festival_tags.length > 0;
    const hasPref     = Array.isArray(d.health_benefit_tags) && d.health_benefit_tags.length > 0;
    const score =
      (hasSeasonal ? 1 : 0) * w.seasonal +
      (hasFestival ? 1 : 0) * w.festival +
      (hasPref     ? 1 : 0) * w.preference;
    return { d, score, originalIdx };
  });
  decorated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;       // higher score first
    return a.originalIdx - b.originalIdx;                     // stable: keep shuffle order on ties
  });
  return decorated.map(x => x.d);
}

function shuffleAndRerankDay(day: WeeklyDayMenu, seed: number, variant: ProposalVariant): WeeklyDayMenu {
  return {
    ...day,
    dishes:          variantRerank(lcgShuffle(day.dishes,          seed + day.dayIndex * 7),  variant),
    lunchDishes:     variantRerank(lcgShuffle(day.lunchDishes,     seed + day.dayIndex * 11), variant),
    breakfastDishes: variantRerank(lcgShuffle(day.breakfastDishes, seed + day.dayIndex * 13), variant),
  };
}

/**
 * Three deterministic + variant-aware variants of the input WeekPlan.
 * Returns [] for null/empty input. Output order is parallel to
 * PROPOSAL_VARIANTS (A=balanced, B=seasonal, C=personalized).
 */
export function generateThreeProposals(base: WeeklyMenu | null): WeekPlan[] {
  if (!base || !base.days || base.days.length === 0) return [];
  return PROPOSAL_VARIANTS.map((variant, seed) => ({
    ...base,
    days: base.days.map(day => shuffleAndRerankDay(day, seed, variant)),
  }));
}
