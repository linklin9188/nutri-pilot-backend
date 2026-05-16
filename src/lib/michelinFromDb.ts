/**
 * michelinFromDb.ts — replaces the realtime Gemini elevation with a
 * curated, DB-backed michelin overlay.
 *
 * Flow (replaces lib/geminiMichelin.ts):
 *   1. For each dish in a day's dinner, find the BEST matching michelin_dishes
 *      row by main_ingredient (primary) or course_type (fallback).
 *   2. Return the matches keyed by source dish id, in the same shape the
 *      WeeklyMenu UI expects so the overlay rendering stays unchanged.
 *
 * Picking strategy when multiple candidates match:
 *   - Highest award_level first (3-star > 2 > 1).
 *   - Prefer michelin over black_pearl when tied (slight bias).
 *   - Then randomized within the tier so each refresh feels fresh.
 *
 * No Gemini calls — instant, free, deterministic-ish.
 */

import { supabase } from './supabase';

export interface MichelinDish {
  source_id:           string;   // original dish.id this overlays
  name_zh:             string;
  name_en:             string;
  restaurant_name_zh:  string;
  restaurant_name_en:  string;
  award_type:          'michelin' | 'black_pearl';
  award_level:         number;
  city:                string;
  cuisine_style:       string;
  signature_technique: string;
  plating_note_zh:     string;
  blurb_zh:            string;
  image_url:           string | null;
  prep_minutes:        number;      // home_time_min
  difficulty:          '简单' | '中等' | '稍复杂';
  // chef-version metadata for the booking CTA
  michelin_dish_id:    string;
  chef_book_price_hkd: number | null;
}

export interface MichelinDayInput {
  date:    string;
  dayLabel: string;
  dishes: { id: string; title_zh: string; main_ingredient?: string; course_type?: string }[];
}

export interface MichelinDayOutput {
  date: string;
  dishes: MichelinDish[];
}

// Cached michelin pool — fetched once per session
let cachedPool: any[] | null = null;
async function loadPool(): Promise<any[]> {
  if (cachedPool) return cachedPool;
  const { data, error } = await supabase
    .from('michelin_dishes')
    .select('id, name_zh, name_en, restaurant_name_zh, restaurant_name_en, award_type, award_level, city, cuisine_style, course_type, main_ingredient, signature_technique, plating_note_zh, blurb_zh, image_url, home_time_min, home_difficulty, chef_book_price_hkd')
    .not('home_prep_steps_json', 'is', null);  // only show ones that have completed step-gen
  if (error) throw new Error(`Failed to load michelin pool: ${error.message}`);
  cachedPool = data ?? [];
  return cachedPool;
}

export function clearMichelinPoolCache(): void { cachedPool = null; }

function rankCandidates(candidates: any[]): any[] {
  return [...candidates].sort((a, b) => {
    if ((b.award_level ?? 0) !== (a.award_level ?? 0)) return (b.award_level ?? 0) - (a.award_level ?? 0);
    if (a.award_type !== b.award_type) return a.award_type === 'michelin' ? -1 : 1;
    return Math.random() - 0.5;
  });
}

function toOverlay(source_id: string, m: any): MichelinDish {
  return {
    source_id,
    name_zh:             m.name_zh,
    name_en:             m.name_en ?? '',
    restaurant_name_zh:  m.restaurant_name_zh,
    restaurant_name_en:  m.restaurant_name_en ?? '',
    award_type:          m.award_type,
    award_level:         m.award_level ?? 1,
    city:                m.city,
    cuisine_style:       m.cuisine_style,
    signature_technique: m.signature_technique,
    plating_note_zh:     m.plating_note_zh ?? '',
    blurb_zh:            m.blurb_zh ?? '',
    image_url:           m.image_url ?? null,
    prep_minutes:        m.home_time_min ?? 45,
    difficulty:          (m.home_difficulty ?? '中等') as '简单' | '中等' | '稍复杂',
    michelin_dish_id:    m.id,
    chef_book_price_hkd: m.chef_book_price_hkd ?? null,
  };
}

export async function elevateDayToMichelin(input: MichelinDayInput): Promise<MichelinDayOutput> {
  const pool = await loadPool();
  if (pool.length === 0) return { date: input.date, dishes: [] };

  const usedInThisDay = new Set<string>();
  const out: MichelinDish[] = [];

  for (const src of input.dishes) {
    const ing = (src.main_ingredient ?? '').toLowerCase();
    const ct  = src.course_type ?? '';

    // Strategy 1: same main_ingredient
    let candidates = pool.filter(m => (m.main_ingredient ?? '').toLowerCase() === ing && !usedInThisDay.has(m.id));
    // Strategy 2: same course_type (fallback)
    if (candidates.length === 0 && ct) {
      candidates = pool.filter(m => m.course_type === ct && !usedInThisDay.has(m.id));
    }
    // Strategy 3: anything not already used in this day
    if (candidates.length === 0) {
      candidates = pool.filter(m => !usedInThisDay.has(m.id));
    }
    if (candidates.length === 0) continue;  // pool exhausted within day

    const picked = rankCandidates(candidates)[0];
    usedInThisDay.add(picked.id);
    out.push(toOverlay(src.id, picked));
  }

  return { date: input.date, dishes: out };
}
