/**
 * dishNameSearch.ts — TICKET-110 (老板 5/29 第一核心 "雇主想吃的精准推送")
 *
 * 断层 3 修复: 现有 intent 系统只做宏类别软加权 (categoryBoosts / cuisineBoosts /
 * tagBoosts), "我想吃椒盐鸡" 只会给所有 chicken 菜加分, 不会精准把"椒盐鸡"本身
 * 捞出来. 这个 helper 补 dish-name 级直接命中.
 *
 * 反向包含匹配 (reverse-contains): 菜名出现在雇主话里 → 精准命中.
 *   "我想吃椒盐鸡" → 池里有"椒盐鸡" / "椒盐鸡翼" → title 是 intent 的子串 → 命中.
 * 最长匹配优先 (椒盐鸡翼 > 椒盐鸡 > 鸡), 越长越具体.
 *
 * 为什么 client-side filter 而非 PostgREST: 反向包含 (intent LIKE '%'||title||'%')
 * PostgREST 表达不了, 全量拉 (id,title_zh,title_en) 是小 payload (982 行 × 3 短列),
 * 一次 chat 动作可接受.
 *
 * 防误命中:
 *   - zh title 长度 ≥ 2, en title 长度 ≥ 4 (避免"鸡"/"鱼"/"粥" 这种单字过度命中)
 *   - 最长匹配优先, slice top N
 */
import { supabase } from './supabase';

export interface DishNameMatch {
  id: string;
  title_zh: string | null;
  title_en: string | null;
  steps_verified: boolean | null;  // 真做法已校验 → 可做绿标
  matchLen: number;  // 命中的 title 长度, 越长越具体
}

export async function findDishesMentionedIn(
  intentText: string,
  opts?: { limit?: number },
): Promise<DishNameMatch[]> {
  const raw = (intentText ?? '').trim();
  if (raw.length < 2) return [];
  const intentLower = raw.toLowerCase();

  const { data, error } = await supabase.from('dishes').select('id, title_zh, title_en, steps_verified');
  if (error || !data) return [];

  const matches: DishNameMatch[] = [];
  for (const d of data as any[]) {
    const zh = (d.title_zh ?? '').trim();
    const en = (d.title_en ?? '').trim().toLowerCase();
    let matchLen = 0;
    // 反向包含: dish title 出现在雇主话里
    if (zh.length >= 2 && raw.includes(zh)) matchLen = Math.max(matchLen, zh.length);
    if (en.length >= 4 && intentLower.includes(en)) matchLen = Math.max(matchLen, en.length);
    if (matchLen > 0) {
      matches.push({ id: d.id, title_zh: d.title_zh, title_en: d.title_en, steps_verified: d.steps_verified ?? null, matchLen });
    }
  }
  matches.sort((a, b) => b.matchLen - a.matchLen);
  return matches.slice(0, opts?.limit ?? 5);
}
