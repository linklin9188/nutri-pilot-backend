/**
 * profileSync — Smell 2 修复（profile 双存储同步层，TICKET-20260520-036 §A）
 *
 * 现状（CLAUDE.md "Smell 2"）：profile 在 localStorage（userHometown /
 * quickPrefs / userTaste / userDiet）和 DB user_profiles（hometown_cuisine /
 * dietary_goal / taste_pref / age_group）双存储；读时有 hometownToDbBucket
 * 映射，但**写时不对称传播** → UI 改 hometown 仅更新 localStorage / DB 任一
 * 端，另一端不动 → 推菜算法读到的 hometown 与 UI 显示的偶尔不一致。
 *
 * 本模块提供两个对称同步函数：
 *   - syncProfileToDB(userId)   localStorage → DB upsert
 *   - syncProfileFromDB(userId) DB → localStorage write
 *
 * 兼容性：DB 取不到 / 失败 → 沿用 localStorage 既有值，silent。匿名用户
 * (anonymous / null) 直接跳过 DB 操作。HOMETOWN_TO_DB_BUCKETS 映射只读，
 * 反向用 region 中第一个 bucket[0] 命中的 region 兜底（cantonese→south,
 * jiangnan→east, northern→north, sichuan→southwest）。
 */

import { supabase } from './supabase';
import { HOMETOWN_TO_DB_BUCKETS, hometownToDbBucket, type RegionId } from './hometownBuckets';

// ── localStorage key constants (与 userPrefs.ts / Login.tsx / Settings 一致) ──
const LS_HOMETOWN  = 'userHometown';
const LS_QUICKPREFS = 'quickPrefs';
const LS_USER_TASTE = 'userTaste';
const LS_USER_DIET  = 'userDiet';

// ── localStorage UI ↔ DB column mapping (与 userPrefs.ts GOAL_MAP 对称) ──
const GOAL_LS_TO_DB: Record<string, string> = {
  fatloss:   'lose_weight',
  muscle:    'muscle_gain',
  balanced:  'maintain',
  nourish:   'detox',
  pregnancy: 'pregnancy',
  growth:    'growth',
};
const GOAL_DB_TO_LS: Record<string, string> = Object.fromEntries(
  Object.entries(GOAL_LS_TO_DB).map(([ls, db]) => [db, ls]),
);

// Taste 双向通常一致（light/spicy/sweet/sour/salty/seafood/veggie），不需要 mapping。
// userTaste localStorage 历史值有 'default'（无偏好）→ 写 DB 时改成 null。
function tasteLsToDb(taste: string | null): string | null {
  if (!taste || taste === 'default') return null;
  return taste;
}

// 反向 hometown 映射：DB origin_cuisine bucket → region id
// 用 HOMETOWN_TO_DB_BUCKETS 反查，按 region 优先级（不含 legacy），bucket[0] 命中即取
const BUCKET_TO_REGION: Record<string, RegionId> = (() => {
  const out: Partial<Record<string, RegionId>> = {};
  const REGIONS: RegionId[] = ['south', 'east', 'north', 'northeast', 'northwest', 'southwest', 'central', 'hk_macau_tw'];
  for (const r of REGIONS) {
    const buckets = HOMETOWN_TO_DB_BUCKETS[r];
    if (buckets && buckets.length > 0 && !out[buckets[0]]) {
      out[buckets[0]] = r;
    }
  }
  return out as Record<string, RegionId>;
})();

// ── syncProfileToDB ──────────────────────────────────────────────────────
//
// localStorage 字段映射后 UPSERT user_profiles：
//   - userHometown (region id 或 legacy 八大菜系) → hometown_cuisine (DB bucket)
//   - quickPrefs.goal → dietary_goal
//   - userTaste → taste_pref
//
// 错误（包括 DB 未连接 / RLS / network）静默吞掉，主流程不报错。
export async function syncProfileToDB(userId: string | null | undefined): Promise<void> {
  if (!userId || userId === 'anonymous') return;

  try {
    const hometownRaw = (localStorage.getItem(LS_HOMETOWN) ?? '').split(',')[0] || null;
    const homeBucket = hometownRaw ? hometownToDbBucket(hometownRaw) : null;

    let goalLs: string | null = null;
    try {
      const qp = JSON.parse(localStorage.getItem(LS_QUICKPREFS) ?? '{}') as { goal?: string };
      goalLs = qp.goal ?? null;
    } catch { /* corrupt — fall through */ }
    if (!goalLs) goalLs = localStorage.getItem(LS_USER_DIET);
    const dietGoal = goalLs ? (GOAL_LS_TO_DB[goalLs] ?? goalLs) : null;

    const tasteLs = localStorage.getItem(LS_USER_TASTE);
    const tasteDb = tasteLsToDb(tasteLs);

    // 只 upsert 有值的字段（避免把 DB 已有值覆盖成 null）
    const update: Record<string, any> = { id: userId };
    if (homeBucket) update.hometown_cuisine = homeBucket;
    if (dietGoal)   update.dietary_goal     = dietGoal;
    if (tasteDb)    update.taste_pref       = tasteDb;
    if (Object.keys(update).length <= 1) return;

    await supabase
      .from('user_profiles')
      .upsert(update, { onConflict: 'id' })
      .then(() => {}, () => {});
  } catch { /* private mode / quota / corrupt JSON — silent */ }
}

// ── syncProfileFromDB ────────────────────────────────────────────────────
//
// SELECT user_profiles → 反向映射 → 写 localStorage：
//   - hometown_cuisine (DB bucket) → userHometown (region id via BUCKET_TO_REGION)
//   - dietary_goal → quickPrefs.goal（merge 不覆盖其他字段）
//   - taste_pref → userTaste
//
// 兼容：DB 取不到 → 不改 localStorage（保留 anon-first 行为）。
export async function syncProfileFromDB(userId: string | null | undefined): Promise<void> {
  if (!userId || userId === 'anonymous') return;

  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('hometown_cuisine, dietary_goal, taste_pref')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return;

    const profile = data as { hometown_cuisine?: string | null; dietary_goal?: string | null; taste_pref?: string | null };

    // hometown_cuisine → userHometown (region id；保留老用户已经是 region id 的情况)
    if (profile.hometown_cuisine) {
      const existing = localStorage.getItem(LS_HOMETOWN);
      // 老用户 localStorage 可能已经是 region id（east / south …），且 hometownToDbBucket
      // 反向映射后命中相同 bucket → 不强制覆盖，避免改变 legacy 八大菜系 id。
      const existingBucket = existing ? hometownToDbBucket(existing.split(',')[0]) : null;
      if (existingBucket !== profile.hometown_cuisine) {
        const region = BUCKET_TO_REGION[profile.hometown_cuisine] ?? profile.hometown_cuisine;
        localStorage.setItem(LS_HOMETOWN, region);
      }
    }

    // dietary_goal → quickPrefs.goal (merge)
    if (profile.dietary_goal) {
      const goalLs = GOAL_DB_TO_LS[profile.dietary_goal] ?? profile.dietary_goal;
      try {
        const qp = JSON.parse(localStorage.getItem(LS_QUICKPREFS) ?? '{}') as Record<string, any>;
        if (qp.goal !== goalLs) {
          qp.goal = goalLs;
          localStorage.setItem(LS_QUICKPREFS, JSON.stringify(qp));
        }
      } catch {
        // quickPrefs 损坏 → 写新对象
        localStorage.setItem(LS_QUICKPREFS, JSON.stringify({ goal: goalLs }));
      }
      // legacy userDiet 也同步（老 Login 路径仍读这个）
      if (localStorage.getItem(LS_USER_DIET) !== goalLs) {
        localStorage.setItem(LS_USER_DIET, goalLs);
      }
    }

    // taste_pref → userTaste
    if (profile.taste_pref) {
      if (localStorage.getItem(LS_USER_TASTE) !== profile.taste_pref) {
        localStorage.setItem(LS_USER_TASTE, profile.taste_pref);
      }
    }
  } catch { /* network / private mode — silent */ }
}
