/**
 * familyMembers.ts — DB CRUD wrapper for family_members table.
 *
 * TICKET TELEPOT-20260525-072 P0: 家人数据从 localStorage 升 DB.
 *
 * 设计:
 *   - DB 主存 (用户换设备 / 清缓存不丢)
 *   - localStorage 副 cache (`nutri_family_members`) 供算法 fast read,
 *     由 Settings.tsx persistMembers 双写保持同步.
 *   - 字段命名 avoid_tags (与 user_profiles 一致), 不用 allergens.
 *   - relation 默认 'self' (老板自己是第一个家人).
 *
 * 不动:
 *   - households / household_members schema (Smell 3 已修, 见 CLAUDE.md).
 *   - localStorage key `nutri_family_members` (familyPrefs.ts / useWeeklyMenu /
 *     Home.tsx / HelperPrep / VerifyIngredients 都直接读它, 双写保留兼容).
 */

import { supabase } from './supabase';

// ── 类型 ───────────────────────────────────────────────────────────────────

export interface FamilyMemberDB {
  id: string;                          // uuid
  household_id: string;                // uuid
  name: string;
  relation: string;                    // self / spouse / son / daughter / father / mother / etc
  gender: string | null;               // male / female / na
  age_years: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  dietary_goal: string | null;         // muscle_gain / fat_loss / pregnancy_prep / child_growth / elder_wellness / general
  avoid_tags: string[];                // ['seafood','peanut',...]
  chronic_diseases: string[];          // ['hypertension','diabetes',...]
  dietary_mode: string | null;         // omnivore / vegetarian / vegan / halal / kosher
  tcm_constitution: string | null;     // balanced / qi_deficient / yin_deficient / ...
  pregnancy_status: string | null;     // none / trying / early / mid / late / breastfeeding
  created_at?: string;
  updated_at?: string;
}

// ── DB CRUD ────────────────────────────────────────────────────────────────

export async function loadFamilyMembers(householdId: string): Promise<FamilyMemberDB[]> {
  if (!householdId) return [];
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[familyMembers] loadFamilyMembers failed', error);
    return [];
  }
  return (data ?? []).map(normalizeRow);
}

/**
 * INSERT 新行 (无 id) 或 UPDATE 已有行 (带 id). PostgREST upsert 行为统一.
 *
 * 接受 Partial 是因为 Settings 编辑抽屉常常只改部分字段, 后端 fill 默认值.
 * household_id 必须给, 其它都 optional / nullable.
 */
export async function upsertFamilyMember(
  m: Partial<FamilyMemberDB> & { household_id: string; name?: string }
): Promise<FamilyMemberDB | null> {
  if (!m.household_id) {
    console.warn('[familyMembers] upsertFamilyMember missing household_id');
    return null;
  }
  // 规范化 payload: 去掉 undefined (PostgREST 会写成 null 覆盖原值)
  const payload: Record<string, unknown> = {};
  if (m.id !== undefined)                payload.id                = m.id;
  payload.household_id                                              = m.household_id;
  if (m.name !== undefined)              payload.name              = m.name || '成员';
  if (m.relation !== undefined)          payload.relation          = m.relation || 'self';
  if (m.gender !== undefined)            payload.gender            = m.gender ?? null;
  if (m.age_years !== undefined)         payload.age_years         = m.age_years ?? null;
  if (m.height_cm !== undefined)         payload.height_cm         = m.height_cm ?? null;
  if (m.weight_kg !== undefined)         payload.weight_kg         = m.weight_kg ?? null;
  if (m.dietary_goal !== undefined)      payload.dietary_goal      = m.dietary_goal ?? null;
  if (m.avoid_tags !== undefined)        payload.avoid_tags        = m.avoid_tags ?? [];
  if (m.chronic_diseases !== undefined)  payload.chronic_diseases  = m.chronic_diseases ?? [];
  if (m.dietary_mode !== undefined)      payload.dietary_mode      = m.dietary_mode ?? null;
  if (m.tcm_constitution !== undefined)  payload.tcm_constitution  = m.tcm_constitution ?? null;
  if (m.pregnancy_status !== undefined)  payload.pregnancy_status  = m.pregnancy_status ?? null;

  // 没有 id → INSERT (DB DEFAULT gen_random_uuid())
  // 有 id → UPSERT (onConflict id, 更新现有行)
  if (!payload.id) {
    if (!payload.name)     payload.name     = '成员';
    if (!payload.relation) payload.relation = 'self';
    const { data, error } = await supabase
      .from('family_members')
      .insert(payload)
      .select('*')
      .single();
    if (error) {
      console.error('[familyMembers] insert failed', error, payload);
      return null;
    }
    return normalizeRow(data);
  } else {
    const { data, error } = await supabase
      .from('family_members')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) {
      console.error('[familyMembers] upsert failed', error, payload);
      return null;
    }
    return normalizeRow(data);
  }
}

export async function deleteFamilyMember(id: string): Promise<boolean> {
  if (!id) return false;
  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[familyMembers] delete failed', error);
    return false;
  }
  return true;
}

// ── 内部 helper ────────────────────────────────────────────────────────────

function normalizeRow(row: Record<string, unknown> | null | undefined): FamilyMemberDB {
  const r = row ?? {};
  return {
    id:                String((r as { id?: unknown }).id ?? ''),
    household_id:      String((r as { household_id?: unknown }).household_id ?? ''),
    name:              String((r as { name?: unknown }).name ?? ''),
    relation:          String((r as { relation?: unknown }).relation ?? 'self'),
    gender:            (r as { gender?: string | null }).gender ?? null,
    age_years:         numOrNull((r as { age_years?: unknown }).age_years),
    height_cm:         numOrNull((r as { height_cm?: unknown }).height_cm),
    weight_kg:         numOrNull((r as { weight_kg?: unknown }).weight_kg),
    dietary_goal:      (r as { dietary_goal?: string | null }).dietary_goal ?? null,
    avoid_tags:        Array.isArray((r as { avoid_tags?: unknown }).avoid_tags) ? (r as { avoid_tags: string[] }).avoid_tags : [],
    chronic_diseases:  Array.isArray((r as { chronic_diseases?: unknown }).chronic_diseases) ? (r as { chronic_diseases: string[] }).chronic_diseases : [],
    dietary_mode:      (r as { dietary_mode?: string | null }).dietary_mode ?? null,
    tcm_constitution:  (r as { tcm_constitution?: string | null }).tcm_constitution ?? null,
    pregnancy_status:  (r as { pregnancy_status?: string | null }).pregnancy_status ?? null,
    created_at:        (r as { created_at?: string }).created_at,
    updated_at:        (r as { updated_at?: string }).updated_at,
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
