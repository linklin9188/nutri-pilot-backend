/**
 * chatPreferenceExtractor — TICKET-094 本地 keyword/regex 偏好提取
 *
 * 老板拍板 (2026-05-26 晚): chat 用户使用的所有数据都来自我的数据和我的算法,
 * 不接外部模型. 因为要控制 token 消耗.
 *
 * 设计:
 * - chat 主动弹"引导问题 + chip 选项"模式 (用户点 chip 直接写偏好)
 * - 用户打字时走本地 keyword 提取 (规则映射, 不调 LLM)
 * - 没命中 → 模板回复"好的我记下了" (不真懂, 不试图 LLM 翻译)
 *
 * 返回 ChatPreference 数组, 调用方 (chat UI) 自行 upsert 到
 * user_chat_preferences 表.
 */

import { getUserId } from './userId';

export type ChatPreferenceType =
  | 'breakfast_staple_subtype'   // 早餐主食偏好: 粥/面食/杂粮/薯芋/杂豆
  | 'cook_method'                // 烹饪法: 清蒸/红烧/爆炒/烤煎/凉拌
  | 'meat_part'                  // 部位: 牛排/牛腩、鸡腿/鸡翅
  | 'work_complexity'            // 工作日 vs 周末复杂度
  | 'season_pref'                // 节庆季节
  | 'dislike_keyword'            // 不喜欢的食材/做法
  | 'love_keyword'               // 喜欢的食材/做法
  | 'family_member_focus';       // 老人/小孩/孕妇侧重

export interface ChatPreference {
  user_id: string;
  household_id?: string | null;
  preference_type: ChatPreferenceType;
  preference_value: any;         // JSONB
  source: 'chat' | 'swap_inferred' | 'cook_done' | 'didnt_eat';
  confidence: number;            // chip 直接选 = 1.0, regex 推断 = 0.7
  source_session_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Keyword 池 — 跟现有算法 keyword 词典对齐, 避免学到不存在的偏好
// ─────────────────────────────────────────────────────────────────────────

const COOK_METHOD_KEYWORDS: Record<string, string[]> = {
  steam:    ['清蒸', '蒸', '汽蒸', '水蒸'],
  braise:   ['红烧', '炖', '焖', '烩', '卤'],
  stirfry:  ['爆炒', '炒', '快炒', '小炒'],
  bake:     ['烤', '烧烤', '炙烤', '烘烤', '焗'],
  cold:     ['凉拌', '凉拌', '拌'],
  boil:     ['煮', '汆', '焯', '白灼'],
};

const STAPLE_SUBTYPE_KEYWORDS: Record<string, string[]> = {
  rice:       ['粥', '米', '饭', '稀饭', '米线', '米粉'],
  wheat:      ['面', '馒头', '包子', '饺子', '饼', '吐司', '面包'],
  grain_misc: ['杂粮', '燕麦', '小米', '玉米', '糙米', '黑米', '荞麦', '藜麦'],
  tuber:      ['红薯', '紫薯', '土豆', '山药', '芋头', '番薯'],
  bean:       ['红豆', '绿豆', '八宝', '鹰嘴豆', '扁豆', '豆沙'],
};

const MEAT_KEYWORDS: Record<string, string[]> = {
  pork:    ['猪', '排骨', '五花', '蹄膀', '回锅', '东坡', '叉烧'],
  beef:    ['牛排', '牛肉', '牛腩', '牛筋', '肺片', '羊'],
  chicken: ['鸡', '鸭', '凤爪', '鸡腿', '鸡翅', '火鸡'],
  seafood: ['鱼', '虾', '蟹', '贝', '蛤', '海参', '鱿鱼', '墨鱼'],
};

const DISLIKE_PHRASES = ['不喜欢', '不爱吃', '不要', '别给我', '不想吃', '讨厌', '受不了'];
const LOVE_PHRASES    = ['喜欢', '爱吃', '想吃', '最爱', '中意', '常吃'];

// ─────────────────────────────────────────────────────────────────────────
// 主 extractor — 用户自由打字时调
// ─────────────────────────────────────────────────────────────────────────

/**
 * 从用户自由文本提取偏好. 没命中返空数组 (上层用模板回"好的我记下了").
 *
 * 例:
 *   "我家老人爱清蒸鱼"     → [cook_method=steam, meat=seafood, family_focus=elder]
 *   "工作日想吃快手菜"     → [work_complexity=weekday_quick]
 *   "不要面食"             → [dislike_keyword=wheat]
 */
export function extractFromText(text: string, householdId?: string | null): ChatPreference[] {
  const userId = getUserId();
  if (!userId || !text.trim()) return [];

  const out: ChatPreference[] = [];
  const t = text.toLowerCase();

  // 判断 dislike vs love 情绪 (后续 keyword 命中按此分类)
  const isDislike = DISLIKE_PHRASES.some(p => t.includes(p));
  const isLove    = LOVE_PHRASES.some(p => t.includes(p));

  // 烹饪法
  const hitMethods: string[] = [];
  for (const [method, kws] of Object.entries(COOK_METHOD_KEYWORDS)) {
    if (kws.some(kw => t.includes(kw))) hitMethods.push(method);
  }
  if (hitMethods.length > 0) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: 'cook_method',
      preference_value: { methods: hitMethods, sentiment: isDislike ? 'dislike' : 'love' },
      source: 'chat',
      confidence: 0.7,
    });
  }

  // 主食 subtype
  const hitSubtypes: string[] = [];
  for (const [sub, kws] of Object.entries(STAPLE_SUBTYPE_KEYWORDS)) {
    if (kws.some(kw => t.includes(kw))) hitSubtypes.push(sub);
  }
  if (hitSubtypes.length > 0) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: 'breakfast_staple_subtype',
      preference_value: { subtypes: hitSubtypes, sentiment: isDislike ? 'dislike' : 'love' },
      source: 'chat',
      confidence: 0.7,
    });
  }

  // 肉类
  const hitMeats: string[] = [];
  for (const [meat, kws] of Object.entries(MEAT_KEYWORDS)) {
    if (kws.some(kw => t.includes(kw))) hitMeats.push(meat);
  }
  if (hitMeats.length > 0) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: isDislike ? 'dislike_keyword' : 'love_keyword',
      preference_value: { meats: hitMeats },
      source: 'chat',
      confidence: 0.7,
    });
  }

  // 工作日/周末复杂度
  if (/工作日|平时|周中|上班/.test(t) && /快|简单|省时/.test(t)) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: 'work_complexity',
      preference_value: { weekday: 'quick', weekend: 'normal' },
      source: 'chat',
      confidence: 0.8,
    });
  }
  if (/周末|休息日|周六|周日/.test(t) && /复杂|讲究|大菜/.test(t)) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: 'work_complexity',
      preference_value: { weekday: 'normal', weekend: 'elaborate' },
      source: 'chat',
      confidence: 0.8,
    });
  }

  // 家庭成员侧重
  if (/老人|爸妈|爷爷|奶奶|父母/.test(t)) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: 'family_member_focus',
      preference_value: { focus: 'elder', context: text.slice(0, 100) },
      source: 'chat',
      confidence: 0.9,
    });
  }
  if (/小孩|孩子|宝宝|baby|kid/i.test(t)) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: 'family_member_focus',
      preference_value: { focus: 'child', context: text.slice(0, 100) },
      source: 'chat',
      confidence: 0.9,
    });
  }
  if (/孕|怀孕|备孕|pregnant/i.test(t)) {
    out.push({
      user_id: userId,
      household_id: householdId ?? null,
      preference_type: 'family_member_focus',
      preference_value: { focus: 'pregnant', context: text.slice(0, 100) },
      source: 'chat',
      confidence: 0.9,
    });
  }

  return out;
}

/**
 * 用户点 chip (引导式问题) → 直接构造 ChatPreference (confidence=1.0).
 * 不走 regex, 因为 chip value 是 hardcode 的精确值.
 */
export function fromChipSelection(
  type: ChatPreferenceType,
  value: any,
  householdId?: string | null,
): ChatPreference | null {
  const userId = getUserId();
  if (!userId) return null;
  return {
    user_id: userId,
    household_id: householdId ?? null,
    preference_type: type,
    preference_value: value,
    source: 'chat',
    confidence: 1.0,
  };
}

/**
 * Upsert preferences 到 user_chat_preferences 表.
 * 同 user+type 合并 (新偏好 overwrite 旧). 失败静默, 不阻塞 chat UI.
 */
export async function saveChatPreferences(
  prefs: ChatPreference[],
  supabase: any,
): Promise<{ ok: number; failed: number }> {
  if (prefs.length === 0) return { ok: 0, failed: 0 };
  let ok = 0, failed = 0;
  for (const p of prefs) {
    try {
      // 同 user + type 合并: 先 delete 旧 → insert 新
      // (用 upsert 需要 unique constraint, 暂用简单 delete+insert)
      await supabase.from('user_chat_preferences')
        .delete().eq('user_id', p.user_id).eq('preference_type', p.preference_type);
      const { error } = await supabase.from('user_chat_preferences').insert(p);
      if (error) failed++;
      else ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

/**
 * TICKET-094 — chat 偏好 → prefScores keyword 注入.
 *
 * 把 user_chat_preferences 表的 structured prefs 翻译成 prefScores 词典格式,
 * 让 scoreForWeek axis 4 (prefScores 学习曲线) 自动用上, 不动 scoreForWeek 接口.
 *
 * 权重: chat 主动告诉的 confidence × 1.5 (老板拍板"chat 1.5× > swap 隐式 1.0×").
 * sentiment='love' → 正; 'dislike' → 负.
 *
 * 注意: chat 词典 keyword 必须跟现有算法 keyword 池 (主要在 dishIngredients /
 * breakfastCombos / scoreForWeek 内置词典) 对齐, 否则注入了也不命中任何菜.
 */
const CHAT_PREF_KEYWORD_MAP: Record<string, Record<string, string[]>> = {
  // staple subtype → 早餐 staple 命中 keyword (跟 BREAKFAST_*_KEYWORDS 对齐)
  breakfast_staple_subtype: {
    rice:       ['粥', '米饭', '稀饭', '米线', '米粉'],
    wheat:      ['面', '馒头', '包子', '饺子', '面包', '吐司'],
    grain_misc: ['杂粮', '燕麦', '小米', '玉米', '糙米', '黑米', '荞麦', '藜麦'],
    tuber:      ['红薯', '紫薯', '土豆', '山药', '芋头'],
    bean:       ['红豆', '绿豆', '八宝', '鹰嘴豆', '扁豆'],
    processed:  ['汤圆', '粽子', '年糕', '凉皮', '糍粑'],
  },
  // 烹饪法 → 命中 dish title / cook_method 关键词
  cook_method: {
    steam:   ['蒸', '清蒸'],
    braise:  ['红烧', '炖', '焖', '烩', '卤'],
    stirfry: ['炒'],
    bake:    ['烤', '焗'],
    cold:    ['凉拌', '拌'],
    boil:    ['煮', '汆', '白灼'],
  },
  // 部位 → 命中 title 关键词
  meat_part: {
    beef_steak:   ['牛排'],
    beef_brisket: ['牛腩'],
    chicken_leg:  ['鸡腿'],
    chicken_wing: ['鸡翅'],
    pork_rib:     ['排骨'],
    fish_whole:   ['鱼'],
  },
};

export function injectChatPrefsIntoPrefScores(
  chatPrefs: Record<string, ChatPreference[]>,
  prefScores: Record<string, number>,
): Record<string, number> {
  const out = { ...prefScores };
  for (const [type, prefs] of Object.entries(chatPrefs)) {
    const map = CHAT_PREF_KEYWORD_MAP[type as ChatPreferenceType];
    if (!map) continue;
    for (const p of prefs) {
      const val = p.preference_value as any;
      const sentiment = (val?.sentiment as string) ?? 'love';
      const sign = sentiment === 'dislike' ? -1 : 1;
      const weight = sign * p.confidence * 1.5;
      // 提取选中的 keys (subtypes / methods / parts)
      const keys: string[] =
        val?.subtypes ?? val?.methods ?? val?.parts ?? [];
      for (const k of keys) {
        const kws = map[k] ?? [];
        for (const kw of kws) {
          // 累加 (不 overwrite, 避免多 chat 轮 + swap 学到的混合)
          out[kw] = (out[kw] ?? 0) + weight;
        }
      }
    }
  }
  return out;
}

/**
 * TICKET-094 — mealStyle 'light' / 'high_protein' / 'low_staple' 注入 prefScores.
 *
 * 老板拍板 (5/26): 用餐风格 4 选项 B 版本 — 标准家常 / 少主食 / 高蛋白增肌 / 清淡养胃.
 * 算法落地通过 prefScores keyword 注入 (跟 chat 偏好同路径), 不动 scoreForWeek 接口.
 *
 * - standard:      不注入, 走 default
 * - low_staple:    slot template 改动 (在 generateWeekPlan 里 dayIndex 限制), 此函数无操作
 * - high_protein:  等同 lowCarb=1 (已在 useWeeklyMenu hook 处理), 此函数无操作
 * - light:         注入清蒸/白灼/炖煮 prefer + 杂粮 prefer + 油炸/爆炒 negative
 */
export function applyMealStyleToPrefScores(
  mealStyle: string,
  prefScores: Record<string, number>,
): Record<string, number> {
  const out = { ...prefScores };
  if (mealStyle === 'light') {
    // 清淡养胃: 偏好清蒸 / 白灼 / 炖煮 + 杂粮 + 粥; 软扣油炸 / 爆炒
    out['蒸']     = (out['蒸']     ?? 0) + 2.0;
    out['清蒸']   = (out['清蒸']   ?? 0) + 2.0;
    out['白灼']   = (out['白灼']   ?? 0) + 1.5;
    out['炖']     = (out['炖']     ?? 0) + 1.5;
    out['焖']     = (out['焖']     ?? 0) + 1.2;
    out['杂粮']   = (out['杂粮']   ?? 0) + 1.5;
    out['燕麦']   = (out['燕麦']   ?? 0) + 1.0;
    out['小米']   = (out['小米']   ?? 0) + 1.0;
    out['粥']     = (out['粥']     ?? 0) + 1.0;
    out['山药']   = (out['山药']   ?? 0) + 1.0;
    out['百合']   = (out['百合']   ?? 0) + 0.8;
    out['炸']     = (out['炸']     ?? 0) - 1.5;
    out['油炸']   = (out['油炸']   ?? 0) - 2.0;
    out['爆炒']   = (out['爆炒']   ?? 0) - 1.0;
    out['麻辣']   = (out['麻辣']   ?? 0) - 0.8;
    out['红烧']   = (out['红烧']   ?? 0) - 0.5;
  }
  return out;
}

/**
 * 读取用户的 chat 偏好 (按 user_id + household_id 合并).
 * 算法侧 useWeeklyMenu / scoreForWeek 调用拿到 prefs 做加权.
 */
export async function loadChatPreferences(
  supabase: any,
  userId: string,
  householdId?: string | null,
): Promise<Record<ChatPreferenceType, ChatPreference[]>> {
  const result: Record<string, ChatPreference[]> = {};
  try {
    let query = supabase.from('user_chat_preferences').select('*');
    if (householdId) {
      // user_id OR household_id 任一命中 (household 维度让雇主菲佣共享)
      query = query.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
    } else {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error || !data) return result as any;
    for (const row of data) {
      const t = row.preference_type;
      if (!result[t]) result[t] = [];
      result[t].push(row);
    }
  } catch { /* offline-tolerant */ }
  return result as any;
}
