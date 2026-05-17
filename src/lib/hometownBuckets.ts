/**
 * hometownBuckets — 地域大区 ↔ DB origin_cuisine bucket 的映射层。
 *
 * 2026-05-17 重构：从「八大菜系」改成「地域大区」。
 *
 * 用户研究（产品决策 2026-05-17）：
 *   · 八大菜系覆盖率 ≈ 60% 大陆人口（北方人选不到自己）
 *   · 「徽菜」「闽菜」对 90 后用户认知模糊，UX 卡顿
 *   · 地域大区跟地理对应、跟 DB 4 bucket 天然 1:1，且每个用户都知道
 *     自己属于哪个大区
 *
 * 新方案（7 个大区 + 港澳台 + 没偏好）：
 *   华南 → cantonese      （粤 · 闽 · 桂 · 琼 · 港 · 澳）
 *   华东 → jiangnan       （沪 · 苏 · 浙 · 皖）
 *   华北 → northern       （京 · 津 · 冀 · 晋 · 蒙）
 *   东北 → northern       （辽 · 吉 · 黑）
 *   西北 → northern       （陕 · 甘 · 宁 · 青 · 新）
 *   西南 → sichuan        （川 · 渝 · 湘 · 黔 · 滇 — 辣味家族）
 *   华中 → jiangnan       （鄂 · 赣 · 豫 — 偏南、口味跟江南更近）
 *   港澳台 → cantonese    （独立选项，但映射到粤菜 bucket）
 *
 * Legacy 八大菜系 id (guangdong/sichuan/shandong/...) 也保留兼容，已经
 * 注册过家乡的老用户的 localStorage / DB 数据不会失效。
 */

// 地域大区 ID — 新 onboarding 使用
export type RegionId =
  | 'south'       // 华南
  | 'east'        // 华东
  | 'north'       // 华北
  | 'northeast'   // 东北
  | 'northwest'   // 西北
  | 'southwest'   // 西南
  | 'central'     // 华中
  | 'hk_macau_tw' // 港澳台
  | 'no_preference';

// Legacy 八大菜系 ID — 兼容老用户
export type LegacyHometownId =
  | 'guangdong' | 'sichuan' | 'shandong' | 'jiangsu'
  | 'fujian'    | 'zhejiang' | 'hunan'   | 'anhui';

export type HometownId = RegionId | LegacyHometownId;

/** Onboarding ID → DB origin_cuisine bucket(s). */
export const HOMETOWN_TO_DB_BUCKETS: Record<HometownId, string[]> = {
  // 新地域大区
  south:        ['cantonese'],
  east:         ['jiangnan'],
  north:        ['northern'],
  northeast:    ['northern'],
  northwest:    ['northern'],
  southwest:    ['sichuan'],
  central:      ['northern'],   // 鄂 / 赣 / 豫 — 豫占人口主导 (河南 9000 万)，
                                //  豫菜偏北方面食 + 咸鲜，落 northern 比 jiangnan 准
                                //  鄂菜虽偏南但靠近 sichuan，northern fallback 也可接受
  hk_macau_tw:  ['cantonese'],
  no_preference:[],

  // Legacy 八大菜系（保留兼容老用户）
  guangdong:    ['cantonese'],
  sichuan:      ['sichuan'],
  shandong:     ['northern'],
  jiangsu:      ['jiangnan'],
  fujian:       ['cantonese'],
  zhejiang:     ['jiangnan'],
  hunan:        ['sichuan'],
  anhui:        ['jiangnan'],
};

/**
 * Returns true if a dish's origin_cuisine matches the user's hometown
 * preference (exact match or via the fallback DB bucket). Used by
 * scoreDish + breakfastCombos so a 华北 user still gets a hometown
 * bonus on DB rows tagged 'northern'.
 */
export function hometownMatches(userPref: string | null | undefined, dishOrigin: string | null | undefined): boolean {
  if (!userPref || !dishOrigin) return false;
  if (userPref === dishOrigin) return true;
  const bucket = HOMETOWN_TO_DB_BUCKETS[userPref as HometownId] ?? [];
  return bucket.includes(dishOrigin);
}

/**
 * Map a user-facing hometown ID to its primary DB origin_cuisine bucket.
 * Used by breakfastCombos and the scorer's origin base function.
 *
 * Returns null for 'no_preference' (no regional bias).
 */
export function hometownToDbBucket(userPref: string | null | undefined): string | null {
  if (!userPref) return null;
  const buckets = HOMETOWN_TO_DB_BUCKETS[userPref as HometownId];
  if (buckets && buckets.length > 0) return buckets[0];
  // Bare DB-bucket values (cantonese / northern / jiangnan / sichuan) pass
  // through so anything written directly to user_profiles.hometown_cuisine
  // by an edge function still works.
  return userPref;
}
