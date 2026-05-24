/**
 * ingredientNormalization.ts — TICKET TELEPOT-20260525-049 P1
 *
 * 食材规范化字典 + 规范化函数。
 *
 * 老板真测发现采购清单出现 "葱段" 和 "葱丝" 两行（实际是同一根葱不同切法），
 * "猪前腿" 和 "猪后腿" 也分开（买的时候只说"猪肉"）。本模块按 CEO 拍板的
 * 静态字典方案 把切法 / 部位变体规范化到一个 canonical 名上，给
 * dishIngredients.aggregateIngredients 用作聚合 key 的前置变换。
 *
 * 规范化原则（老板 spec）：
 *   1. 同一种食材不同切法 → 合并（葱段 / 葱丝 / 葱花 → 葱）
 *   2. 同一动物不同部位 → 合并（猪前腿 / 猪后腿 / 五花 → 猪肉）
 *      例外：排骨保留（骨头+肉跟纯肉不同）
 *   3. 不同动物之间绝不合并（猪 ≠ 牛 ≠ 鸡 ≠ 鱼）
 *   4. 不同鱼种保留分类（鲈鱼 / 鲫鱼 / 鲷鱼 是不同鱼）
 *   5. 鸡保留分类：鸡胸 vs 鸡腿 vs 全鸡 不合并，但去切法（鸡胸肉→鸡胸）
 */

// 规范化字典：原始食材名 → 规范名
export const INGREDIENT_NORMALIZATION_MAP: Record<string, string> = {
  // 葱
  '葱段': '葱', '葱丝': '葱', '葱花': '葱', '青葱': '葱', '大葱': '葱', '小葱': '葱', '香葱': '葱',
  // 蒜
  '蒜瓣': '蒜', '蒜末': '蒜', '蒜泥': '蒜', '蒜片': '蒜', '蒜蓉': '蒜', '大蒜': '蒜',
  // 姜
  '姜片': '姜', '姜末': '姜', '姜丝': '姜', '生姜': '姜', '老姜': '姜', '嫩姜': '姜',
  // 猪肉（老板 explicit 合并）
  '猪前腿': '猪肉', '猪后腿': '猪肉', '猪里脊': '猪肉', '猪五花': '猪肉', '猪肉碎': '猪肉',
  '猪肉丝': '猪肉', '猪肉片': '猪肉', '猪肉丁': '猪肉', '猪肉块': '猪肉',
  '五花肉': '猪肉', '里脊肉': '猪肉',
  // 牛肉
  '牛腩': '牛肉', '牛腱': '牛肉', '牛肉碎': '牛肉', '牛肉丝': '牛肉', '牛肉片': '牛肉',
  '牛肉丁': '牛肉', '牛肉块': '牛肉',
  // 鸡（CEO 保留分类：鸡胸 vs 鸡腿 vs 全鸡 不合并；但去切法）
  '鸡胸肉': '鸡胸', '鸡腿肉': '鸡腿', '鸡肉碎': '鸡肉', '鸡肉丝': '鸡肉',
  '鸡肉片': '鸡肉', '鸡肉丁': '鸡肉',
  // 鱼（不合并具体鱼种：鲈鱼/鲫鱼/鲷鱼 是不同鱼）
  '鱼片': '鱼', '鱼块': '鱼', '鱼丝': '鱼',
  // 虾
  '虾仁': '虾', '虾米': '虾', '虾段': '虾', '大虾': '虾', '河虾': '虾',
  // 蔬菜
  '黄瓜片': '黄瓜', '黄瓜丝': '黄瓜', '黄瓜段': '黄瓜', '黄瓜丁': '黄瓜',
  '西兰花朵': '西兰花',
  '番茄块': '番茄', '番茄丁': '番茄', '番茄片': '番茄', '西红柿': '番茄',
  '土豆丝': '土豆', '土豆块': '土豆', '土豆片': '土豆', '土豆丁': '土豆',
  '胡萝卜丝': '胡萝卜', '胡萝卜片': '胡萝卜', '胡萝卜块': '胡萝卜', '胡萝卜丁': '胡萝卜',
  '青椒丝': '青椒', '青椒块': '青椒', '青椒片': '青椒', '青椒丁': '青椒',
  '辣椒段': '辣椒', '辣椒丝': '辣椒', '辣椒末': '辣椒',
  '小米椒': '辣椒', '红辣椒': '辣椒', '青辣椒': '辣椒',
  // 不合并 (CEO 保留分类):
  // '排骨' 保留（骨头+肉跟纯肉不同）
  // 不同动物：猪 ≠ 牛 ≠ 鸡 ≠ 鱼
};

/**
 * 把一个原始食材名规范化到 canonical 名。
 *
 * 匹配优先级：
 *   1. 精确命中字典 key → 直接返回 value
 *   2. 包含某个字典 key → 返回该 key 的 value（处理 "猪肉 200g" 这种带量的情况）
 *   3. 都不命中 → 返回原名（trim 后）
 */
export function normalizeIngredientName(rawName: string): string {
  const trimmed = (rawName ?? '').trim();
  if (!trimmed) return trimmed;
  // 1. 精确匹配
  if (INGREDIENT_NORMALIZATION_MAP[trimmed]) return INGREDIENT_NORMALIZATION_MAP[trimmed];
  // 2. 包含匹配（e.g. "猪肉 200g" → 找 "猪肉"）
  for (const [pattern, canonical] of Object.entries(INGREDIENT_NORMALIZATION_MAP)) {
    if (trimmed.includes(pattern)) return canonical;
  }
  // 3. fallback 原名
  return trimmed;
}

// ── 通用聚合接口（CEO spec 形态）──────────────────────────────────────
// VerifyIngredients 实际走的是 dishIngredients.aggregateIngredients（基于
// ShoppingIngredient），那条路径里已通过 normalizeIngredientName 改造。
// 下面这一份独立 API 留给 node / 脚本 / 真测用，签名与 CEO spec 对齐。

export interface IngredientVariant {
  originalName:     string;
  quantity:         number;
  unit?:            string;
  sourceDishTitle?: string;
}

export interface AggregatedIngredient {
  canonicalName: string;
  totalQuantity: number;
  unit:          string;
  variants:      IngredientVariant[];
}

/**
 * 通用版聚合：把任意 {name, quantity, unit?, sourceDishTitle?} 列表按 canonical
 * 名分组求和，并保留原始 variant 用于 UI 注释。
 *
 * 不和 dishIngredients.aggregateIngredients 共享数据类型 —— 那条是给生产 UI
 * 用的，已经有 ShoppingIngredient/AggregatedIngredient 的成熟字段（dishes /
 * substitutes / weightGrams / category 等）。这里独立一份纯函数是给 node 脚本
 * 真测 + 给未来其他场景（家宴 / 备餐）可能用的轻量入口。
 */
export function aggregateIngredients(
  ingredients: Array<{ name: string; quantity?: number; unit?: string; sourceDishTitle?: string }>
): AggregatedIngredient[] {
  const grouped: Record<string, AggregatedIngredient> = {};
  for (const ing of ingredients) {
    const canonical = normalizeIngredientName(ing.name);
    if (!grouped[canonical]) {
      grouped[canonical] = {
        canonicalName: canonical,
        totalQuantity: 0,
        unit:          ing.unit || '',
        variants:      [],
      };
    }
    grouped[canonical].totalQuantity += (ing.quantity || 1);
    grouped[canonical].variants.push({
      originalName:    ing.name,
      quantity:        ing.quantity || 1,
      unit:            ing.unit,
      sourceDishTitle: ing.sourceDishTitle,
    });
  }
  return Object.values(grouped).sort((a, b) => b.totalQuantity - a.totalQuantity);
}
