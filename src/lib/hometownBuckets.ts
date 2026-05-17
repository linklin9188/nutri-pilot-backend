/**
 * hometownBuckets — 八大菜系 ID ↔ DB origin_cuisine bucket 的映射层。
 *
 * Onboarding 让用户从中国八大菜系里挑（粤川鲁苏闽浙湘徽），但 DB 现有的
 * origin_cuisine 字段只有 6 个 bucket（cantonese / sichuan / jiangnan /
 * northern / japanese_korean / southeast_asian / western），还没细化到八
 * 大菜系。这个映射层把新 ID 落到现有 bucket，让 scoreDish 的 hometown
 * 30% 加分 + breakfastCombos 的乡味早餐立刻生效，DB 细化 backfill 可以
 * 当成 Phase B 慢慢做。
 *
 * 映射原则：
 *   · 同地理 + 同家常调味 → 同 bucket
 *   · 闽菜暂归 cantonese（粤闽邻近，海产口味相近）
 *   · 湘菜暂归 sichuan（辣味相近，等 DB 真的有湘菜再独立）
 *   · 鲁菜归 northern（DB 的 northern 114 道里大半是鲁菜底子）
 *   · 苏/浙/徽归 jiangnan（淮扬 + 杭帮 + 徽州，都是江南体系）
 */

export type HometownId =
  | 'guangdong'   // 粤菜（广府 · 顺德 · 港式 · 客家 · 潮州）
  | 'sichuan'     // 川菜
  | 'shandong'    // 鲁菜
  | 'jiangsu'     // 苏菜（淮扬）
  | 'fujian'      // 闽菜
  | 'zhejiang'    // 浙菜
  | 'hunan'       // 湘菜
  | 'anhui'       // 徽菜
  | 'no_preference';

/** Onboarding ID → DB origin_cuisine bucket(s). */
export const HOMETOWN_TO_DB_BUCKETS: Record<HometownId, string[]> = {
  guangdong:     ['cantonese'],
  sichuan:       ['sichuan'],
  shandong:      ['northern'],
  jiangsu:       ['jiangnan'],
  fujian:        ['cantonese'],   // 闽粤邻近 fallback
  zhejiang:      ['jiangnan'],
  hunan:         ['sichuan'],     // 辣味 fallback
  anhui:         ['jiangnan'],
  no_preference: [],
};

/**
 * Returns true if a dish's origin_cuisine matches the user's hometown
 * preference (either exact match against the same ID, or matches the
 * fallback DB bucket). Used by scoreDish + breakfastCombos so users
 * who pick 鲁菜 still get a hometown bonus on DB rows tagged 'northern'.
 */
export function hometownMatches(userPref: string | null | undefined, dishOrigin: string | null | undefined): boolean {
  if (!userPref || !dishOrigin) return false;
  if (userPref === dishOrigin) return true;
  const bucket = HOMETOWN_TO_DB_BUCKETS[userPref as HometownId] ?? [];
  return bucket.includes(dishOrigin);
}

/**
 * Map a user-facing hometown ID to its primary DB origin_cuisine bucket.
 * Used by breakfastCombos to look up regional breakfast sets — 鲁菜 →
 * northern → 北方早餐 (饺子 / 油条 / 八宝粥 …).
 *
 * Returns null for 'no_preference' (no regional bias).
 */
export function hometownToDbBucket(userPref: string | null | undefined): string | null {
  if (!userPref) return null;
  const buckets = HOMETOWN_TO_DB_BUCKETS[userPref as HometownId];
  if (buckets && buckets.length > 0) return buckets[0];
  // Legacy values (cantonese / northern / jiangnan / sichuan) pass through
  // unchanged so saved profiles from before the 八大菜系 split still work.
  return userPref;
}
