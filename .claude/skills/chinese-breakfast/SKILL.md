---
name: chinese-breakfast
description: |
  Generate culturally-authentic Chinese breakfast COMBOS (not random slot
  picks). Each combo is a culturally-paired SET — e.g. 豆浆 + 油条 +
  茶叶蛋, or 港式 皮蛋瘦肉粥 + 油条 + 鸡蛋 — rather than 3 unrelated
  dishes from buckets. Use when:
   - generating a daily breakfast menu for a household
   - auditing whether a planned breakfast is culturally coherent
     ("does this combo make sense to a Chinese family?")
   - filling gaps in the dish DB (which combos are MISSING dishes
     that should be backfilled)
triggers:
  - "中式早餐"
  - "早餐搭配"
  - "Chinese breakfast"
  - "豆浆配什么"
  - "今天早餐吃什么"
---

# 中式早餐 Combo Skill

## 核心规则

Chinese breakfast = **干稀搭配** (dry + wet) + **暖胃** (warm/cooked, no
raw salads). Western "yogurt + granola + cold fruit" is not Chinese
breakfast. Hot food, paired thoughtfully.

A canonical Chinese breakfast has **3 slots**:
1. **喝的** — soy milk / congee / soup / 港式 tea drink
2. **主食** — bun / noodle / fried dough / pancake
3. **配菜** — egg / cold-dressed veggie / pickle / soy/meat side

## 区域偏好

| 菜系 / 地区 | 典型 combo |
|---|---|
| 北方 | 豆浆 + 油条 + 茶叶蛋；小米粥 + 包子 + 凉拌黄瓜 |
| 江南 | 生煎包 + 黑芝麻糊 + 茶叶蛋；小笼包 + 豆浆 |
| 粤式家庭 | 皮蛋瘦肉粥 + 油条 + 鸡蛋；白粥 + 烧麦 + 腌菜 |
| 港式茶餐厅 | 菠萝包 + 港式奶茶 + 火腿通心粉；蛋挞 + 鸳鸯 + 西多士 |
| 川式 | 红油抄手 + 豆浆；煎饼 + 八宝粥 |
| 养生 | 燕麦粥 + 蒸红薯 + 鸡蛋羹；银耳莲子羹 + 蒸南瓜 + 茶叶蛋 |

## Combo 数据结构

See `src/lib/breakfastCombos.ts` for the canonical list. Shape:

```ts
{
  id: 'cantonese-classic',       // unique
  name: '粤式家常',               // 显示给用户
  hometowns: ['cantonese'],       // 哪些家乡偏好可选
  drink:  ['皮蛋瘦肉粥', '白粥', '生滚粥'],   // 至少 1 个匹配 DB
  staple: ['油条', '虾饺', '烧麦'],
  side:   ['茶叶蛋', '鸡蛋羹'],
  avoid:  [],                     // 忌口排除 — 比如 spicy / dairy 都不该走这条 combo
  description: '皮蛋瘦肉粥配油条是港人最熟悉的味道',
}
```

`pickBreakfast(combos, pool, dayIndex, profile)` 算法：
1. Filter combos by profile.hometown overlap
2. Filter combos that don't conflict with profile.avoidIngredients
3. Rotate by dayIndex within the filtered set (so 周一 ≠ 周三)
4. Resolve each slot's keyword list to a DB dish
5. If a slot's DB dish is missing, log a TODO (data backfill needed) and
   fall back to the bucketed slot logic for that one slot

## 已知 DB 缺口（2026-05-16 audit）

| 缺口 | 影响哪些 combo |
|---|---|
| 港式茶饮 (奶茶/咖啡/柠茶/阿华田/好立克) | 港式茶餐厅 combos |
| 港式包点 (菠萝包/鸡尾包/粢饭/脆脆猪/蛋挞) | 港式茶餐厅 combos |
| 奶制品 (牛奶/酸奶) | 任何带 dairy 的 combo |
| 凉拌时蔬 (凉拌黄瓜/凉拌海带/凉拌三丝) | 北方家常 side slot |
| 豆制品/肉 side (豆干/千张/肉松/酱牛肉) | 北方家常 / 江南 side slot |
| 蛋类 (只有 1 道 茶叶蛋) | 几乎所有 combo |
| 北方粥 (只有 八宝粥) | 北方/养生 combos |
| 粉面汤早餐 (只有 葱油拌面) | 港式 / 川式 combos |

Fix: run `scripts/backfill-breakfast-combos.ts` to fill these via
Gemini meta + Claude steps (similar pattern to `seed-michelin-hk.ts`).

## 何时触发

- 用户问 "今天早餐吃什么 / 早餐搭配 / 中式早餐"
- 系统每天凌晨 ROTATE 当日 combo
- 用户切换 hometown 后立即重选 combo
- 审计现有 menu 是否符合中式 combo 规范

## 关键失败模式（应避免）

| 错误 | 为什么不对 |
|---|---|
| 3 个 wet dish (粥 + 豆浆 + 汤) | 缺主食 — 中式干稀搭配规则 |
| 3 个 dry dish (包子 + 馒头 + 油条) | 缺暖胃喝的 |
| 西式酸奶 + 中式油条 | 文化错配 |
| 港式奶茶 + 北方杂粮粥 | 区域混搭，不是无效但不优选 |
| Spicy + 不喝辣家庭 | 算法 hardFilter 必须先剔 |
