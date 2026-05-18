/**
 * composerClient.ts — thin wrapper around POST /functions/v1/composer.
 *
 * v1 scope: banquet scenario only. The function is invoked from
 * src/lib/banquet.ts:planBanquet as the "Composer branch" of step ④
 * (LLM-driven selection); on any failure the caller silently falls back
 * to the local scoreDish + weightedSample path — see .claude/skills/
 * menu-scoring-philosophy/SKILL.md Rule 8.4.
 */
import { getUserId } from './userId';
import type { SupabaseDish } from '../hooks/useSupabaseMenu';

export type BucketKey = 'cold' | 'main' | 'staple' | 'soup' | 'dessert';

export interface ComposerRequest {
  scenario: 'banquet';
  user_id:  string;
  user_context: {
    headcount:    { adults: number; kids: number; elders: number };
    cuisine_style: string;
    extra_avoid:  string[];
    special_needs: string[];
    global_prefs: {
      avoid_tags:        string[];
      avoid_ingredients: string[];
      vegetarian_only:   boolean;
    };
  };
  buckets:        Record<BucketKey, DishSummary[]>;
  bucket_targets: Record<BucketKey, number>;
  algo_version:   string;
}

export interface DishSummary {
  id:               string;
  title_zh:         string;
  origin_cuisine?:  string | null;
  main_ingredient?: string | null;
  flavor_tags?:     string[] | null;
  cook_method?:     string | null;
  cook_time_min?:   number | null;
  kid_acceptance_score?:  number | null;
  helper_friendly_score?: number | null;
  employer_crown_likes?:  number | null;
}

export interface ComposerResult {
  composer_version: string;                    // 'composer_v1.0'
  theme_narrative:  string;                    // ≤40 字中文
  selected_dishes:  Record<BucketKey, string[]>;
  tradeoffs:        string[];
  remaining:        number;                    // 今日剩余配额
}

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/composer`;

/**
 * Compact a full SupabaseDish into the 10-field summary the Composer prompt
 * actually reads. Keeps prompt token count predictable at scale.
 */
export function toSummary(d: SupabaseDish): DishSummary {
  const x = d as any;
  return {
    id:               x.id,
    title_zh:         x.title_zh,
    origin_cuisine:   x.origin_cuisine,
    main_ingredient:  x.main_ingredient,
    flavor_tags:      x.flavor_tags,
    cook_method:      x.cook_method,
    cook_time_min:    x.cook_time_min,
    kid_acceptance_score:  x.kid_acceptance_score,
    helper_friendly_score: x.helper_friendly_score,
    employer_crown_likes:  x.employer_crown_likes,
  };
}

/**
 * Call the composer edge function. Throws on any failure — the caller
 * (planBanquet) is responsible for catch → fallback → telemetry write.
 */
export async function callComposer(req: Omit<ComposerRequest, 'user_id'>): Promise<ComposerResult> {
  const userId = getUserId() ?? 'anonymous';
  const res = await fetch(URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ user_id: userId, ...req }),
  });
  const j = await res.json();
  if (res.status === 429) throw new Error(j.error || 'composer quota exceeded');
  if (!res.ok)            throw new Error(j.error || `composer http ${res.status}`);
  return j as ComposerResult;
}
