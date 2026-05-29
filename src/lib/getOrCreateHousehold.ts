/**
 * getOrCreateHousehold.ts — TICKET-106 §B (老板 5/29 修 P1)
 *
 * Single source of truth for "find-or-create the employer's household".
 *
 * Replaces 2 copies of the same find-or-create logic in Settings.tsx:715 +
 * Home.tsx:840 that raced when both pages mounted simultaneously (each
 * SELECT empty before the other's INSERT committed → both INSERT → 2
 * households per user. 55/active employer hit this bug, 137 dup rows
 * cleaned by migration 105).
 *
 * Migration 105 added UNIQUE(employer_id) so concurrent INSERTs now fail
 * with Postgres error 23505 on the second. We catch it and re-SELECT.
 *
 * Returns { id, invite_code } or null if all paths fail (RLS / DB down).
 */
import { supabase } from './supabase';

export interface HouseholdRow {
  id: string;
  invite_code: string;
}

const PG_UNIQUE_VIOLATION = '23505';

export async function getOrCreateHousehold(employerUserId: string): Promise<HouseholdRow | null> {
  // 1. try SELECT
  const sel = async () => {
    const { data } = await supabase
      .from('households')
      .select('id, invite_code')
      .eq('employer_id', employerUserId)
      .maybeSingle();
    return data ? { id: data.id as string, invite_code: (data.invite_code as string) ?? '' } : null;
  };

  const existing = await sel();
  if (existing) return existing;

  // 2. INSERT; if UNIQUE violation, the other tab won — re-SELECT
  const { data: created, error } = await supabase
    .from('households')
    .insert({ employer_id: employerUserId })
    .select('id, invite_code')
    .single();

  if (!error && created) {
    return { id: created.id as string, invite_code: (created.invite_code as string) ?? '' };
  }

  // 3. UNIQUE violation → another tab inserted, re-SELECT to fetch theirs
  if (error && (error as any).code === PG_UNIQUE_VIOLATION) {
    return await sel();
  }

  console.error('[getOrCreateHousehold] insert failed', error);
  return null;
}
