/**
 * usePantry — 家庭食材库存读取层（TICKET-20260520-025 §B）
 *
 * 目标：把 axis 26 的 "homeInventoryItems: Set<string>" 来源从 localStorage
 * 升级到 DB 表 user_pantry_items，但 Database migration 031 还未落地。本轮
 * 提供 forward-compatible 读取入口 —— DB 上线后自动切真表，UI/Algorithm 调
 * 用方零改动。
 *
 * Strategy (参考 SKILLS.md):
 *   - db-table-not-ready-forward-compat: SELECT 报 42P01 (relation does not
 *     exist) → silent fallback 到 localStorage `home_inventory_<userId>_<date>`
 *   - cross-dept-shape-decouple-via-schema-check: 不假设 schema 字段；DB 落地
 *     时若列名/类型与预期不同，catch 后仍降级到 localStorage
 *
 * 与 useFeedbackEngine.consumeRatings 同模式：error 静默吞掉，主流程不报错。
 */

import { supabase } from '../lib/supabase';

/**
 * loadPantryItems — 返回当前用户的"家里有"食材集合（ingredient_zh names）。
 *
 * 优先级:
 *   1. Database user_pantry_items 表（未来 migration 031 落地后启用）
 *   2. localStorage `home_inventory_<userId>_<date>` 当日 truthy keys
 *
 * 任一来源失败 → 返回空 Set（不抛错；调用方按"无 inventory"语义处理）。
 *
 * 注意 userId 为 'anonymous' / 空 / null 时直接走 localStorage 路径（DB
 * 无意义，与 anon-first auth 一致）。
 */
export async function loadPantryItems(userId: string | null | undefined): Promise<Set<string>> {
  const uid = userId && userId !== 'anonymous' ? userId : null;
  const out = new Set<string>();

  // ── Step 1: try DB user_pantry_items ────────────────────────────────────
  if (uid) {
    try {
      const { data, error } = await supabase
        .from('user_pantry_items')
        .select('ingredient_zh')
        .eq('user_id', uid);

      // 42P01 = relation does not exist (PostgreSQL undefined_table)
      // 其他错误（PostgREST schema cache miss / RLS / network）也走 fallback
      if (!error && Array.isArray(data) && data.length > 0) {
        for (const row of data) {
          const ing = (row as any)?.ingredient_zh;
          if (typeof ing === 'string' && ing.length > 0) out.add(ing);
        }
        return out;
      }
    } catch {
      /* schema-check fail → fallback to localStorage */
    }
  }

  // ── Step 2: localStorage fallback (同 axis 26 当前 hook 内路径) ───────
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const key = `home_inventory_${uid ?? 'anon'}_${todayIso}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, boolean>;
      for (const [k, v] of Object.entries(map)) if (v) out.add(k);
    }
  } catch {
    /* corrupt JSON / private mode → 返回空 Set */
  }

  return out;
}
