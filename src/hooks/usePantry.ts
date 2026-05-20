/**
 * usePantry — 家庭食材库存读写层
 *
 * 演进:
 *   - TICKET-20260520-025 §B: 起步 schema-check forward-compat 只读 hook
 *   - TICKET-20260520-039 §B: SPEC_pantry_v1.md 定稿 schema + 同步策略
 *   - TICKET-20260520-041 §A: 升级到完整双向 sync（loadPantryItems +
 *     addPantryItem + removePantryItem），按 SPEC §3 write-through LS +
 *     async DB upsert + last_seen_at 新者赢
 *
 * 表 `user_pantry_items` (Database migration 042 待落地，SPEC §2)：
 *   id / user_id text / ingredient_name text / qty / unit / in_pantry bool
 *   / last_seen_at timestamptz / meta jsonb
 *   UNIQUE (user_id, ingredient_name)
 *
 * Forward-compat 保留（SPEC §3.2 / 工单 §硬性约束）：DB 表未上线 / RLS /
 * 网络失败 → silent fallback 到 localStorage `home_inventory_<userId>_<date>`
 * (Record<string, boolean>)，与 VerifyIngredients.tsx haveIt toggle 同 key。
 *
 * 与 useFeedbackEngine.consumeRatings 同模式：error 静默吞掉，主流程不报错。
 */

import { supabase } from './supabase';

// ── localStorage key helper (与 VerifyIngredients.tsx haveIt 同模式) ──────
function inventoryLsKey(uid: string): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  return `home_inventory_${uid}_${todayIso}`;
}

function readInventoryLs(uid: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(inventoryLsKey(uid));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch { return {}; }
}

function writeInventoryLs(uid: string, map: Record<string, boolean>): void {
  // Only keep truthy entries — false / undefined are noise (同 VerifyIngredients persistHomeInventory)
  const pruned: Record<string, boolean> = {};
  for (const k of Object.keys(map)) if (map[k]) pruned[k] = true;
  try { localStorage.setItem(inventoryLsKey(uid), JSON.stringify(pruned)); }
  catch { /* quota / private mode — silent */ }
}

/**
 * loadPantryItems — 返回当前用户的"家里有"食材集合 (ingredient_name 集合)。
 *
 * 优先级 (按 SPEC §3 读策略):
 *   1. Database user_pantry_items SELECT WHERE in_pantry=true → merge 进 LS
 *      下次 fallback 也对；返回 Set
 *   2. 失败（DB 未上线 / 42P01 / 空数据）→ 返回 LS 集合
 *
 * 匿名 userId 直接走 LS（DB 无意义）。任一失败不抛错（anon-first 模式）。
 */
export async function loadPantryItems(userId: string | null | undefined): Promise<Set<string>> {
  const uid = userId && userId !== 'anonymous' ? userId : null;
  const out = new Set<string>();

  // ── Step 1: try DB user_pantry_items ─────────────────────────────────
  if (uid) {
    try {
      const { data, error } = await supabase
        .from('user_pantry_items')
        .select('ingredient_name')
        .eq('user_id', uid)
        .eq('in_pantry', true);

      if (!error && Array.isArray(data) && data.length > 0) {
        for (const row of data) {
          const ing = (row as any)?.ingredient_name;
          if (typeof ing === 'string' && ing.length > 0) out.add(ing);
        }
        // Merge 进 LS（让下次 DB unavailable 时 fallback 也有完整数据）
        const lsMap = readInventoryLs(uid);
        for (const ing of out) lsMap[ing] = true;
        writeInventoryLs(uid, lsMap);
        return out;
      }
    } catch {
      /* schema-check fail / RLS / network → fallback to LS */
    }
  }

  // ── Step 2: localStorage fallback ────────────────────────────────────
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const key = `home_inventory_${uid ?? 'anon'}_${todayIso}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, boolean>;
      for (const [k, v] of Object.entries(map)) if (v) out.add(k);
    }
  } catch { /* corrupt JSON / private mode → 返回空 Set */ }

  return out;
}

/**
 * addPantryItem — 标记 ingredient 在家有。
 *
 * write-through (SPEC §3): LS 先写（同步立即生效，不阻塞 UI），DB upsert
 * fire-and-forget。conflict 策略：UNIQUE (user_id, ingredient_name) +
 * onConflict 更新 in_pantry=true + last_seen_at=now() (新者赢)。
 */
export async function addPantryItem(
  userId: string | null | undefined,
  ingredient: string,
): Promise<void> {
  const uid = userId && userId !== 'anonymous' ? userId : null;
  if (!ingredient) return;

  // ── Step 1: LS write-through (anon 也写，本地 UI 立即生效) ──────────
  const lsUid = uid ?? 'anon';
  const lsMap = readInventoryLs(lsUid);
  lsMap[ingredient] = true;
  writeInventoryLs(lsUid, lsMap);

  // ── Step 2: DB fire-and-forget upsert ────────────────────────────────
  if (!uid) return;
  try {
    await supabase
      .from('user_pantry_items')
      .upsert(
        {
          user_id:         uid,
          ingredient_name: ingredient,
          in_pantry:       true,
          last_seen_at:    new Date().toISOString(),
        },
        { onConflict: 'user_id,ingredient_name' },
      )
      .then(() => {}, () => {});
  } catch { /* DB not ready → LS write 已生效，silent */ }
}

/**
 * removePantryItem — 标记 ingredient 已耗尽 / 移除。
 *
 * SPEC §4 反闭环：菲佣 missing_ingredient feedback 触发；雇主在 UI 取消
 * "我家有" toggle 也走这条。LS 删除 + DB UPDATE in_pantry=false（不删行，
 * 保留历史信号 — "这家曾经有过番茄"是 SPEC §2 设计意图）。
 */
export async function removePantryItem(
  userId: string | null | undefined,
  ingredient: string,
): Promise<void> {
  const uid = userId && userId !== 'anonymous' ? userId : null;
  if (!ingredient) return;

  // ── Step 1: LS delete-through ────────────────────────────────────────
  const lsUid = uid ?? 'anon';
  const lsMap = readInventoryLs(lsUid);
  if (lsMap[ingredient]) {
    delete lsMap[ingredient];
    writeInventoryLs(lsUid, lsMap);
  }

  // ── Step 2: DB fire-and-forget UPDATE in_pantry=false ────────────────
  if (!uid) return;
  try {
    await supabase
      .from('user_pantry_items')
      .upsert(
        {
          user_id:         uid,
          ingredient_name: ingredient,
          in_pantry:       false,
          last_seen_at:    new Date().toISOString(),
        },
        { onConflict: 'user_id,ingredient_name' },
      )
      .then(() => {}, () => {});
  } catch { /* DB not ready → LS delete 已生效，silent */ }
}
