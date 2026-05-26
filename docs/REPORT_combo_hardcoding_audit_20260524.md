# Combo 硬编码 audit — 2026-05-24

**TICKET**: TELEPOT-20260524-031
**SCOPE**: 周菜单生成路径中硬编码单一菜名导致"永远只出同一道菜" bug 排查
**完工 commit**: `54a1259`
**作者**: Algorithm Lead (algo-031-v3 Agent) + CEO 补存

---

## 早餐（本棒已修）

| 文件:行 | 原硬编码 | 修改 |
|---|---|---|
| `src/lib/breakfastCombos.ts` 13 处 combo `side[0]`（line 50, 59, 68, 79, 88, 109, 120, 129, 140, 152, 162, 173, 185） | `'茶叶蛋'` | 改 `EGG_PLACEHOLDER` + `BREAKFAST_PROTEIN_EGG_POOL` 按 `dayIndex % 5` 轮换 5 蛋（茶叶蛋 / 白煮蛋 / 鸡蛋羹 / 煎鸡蛋 / 葱花炒鸡蛋） |
| `src/lib/breakfastCombos.ts:97` hk-tea-restaurant | `'煎蛋'/'炒蛋'/'蛋饼'` 港式 3 蛋 | 保留 + 追加 `EGG_PLACEHOLDER` 接尾（港式 3 蛋优先，miss 才 fallback 5 蛋池） |

实现细节：
- sentinel + pool export：`src/lib/breakfastCombos.ts:39-40`
- `resolveSlot` 加 `dayIndex` 参数 + placeholder 解析：`src/lib/breakfastCombos.ts:325-353`
- `resolveCombo` 透传 `dayIndex`：`src/lib/breakfastCombos.ts:381-382`
- 调用点（已天然传 dayIndex，无需改）：`src/hooks/useWeeklyMenu.ts:3104-3110`

---

## 午餐 / 晚餐 / 主食 / 水果

**Grep 范围**：
- `src/lib/breakfastCombos.ts`
- `src/lib/` 其他文件
- `src/hooks/useSupabaseMenu.ts`
- `src/hooks/useWeeklyMenu.ts`

**结论**：未发现"keyword-template 硬编码单一菜名"问题。

- 午晚餐走 `scoreForWeek` + `weightedRandom` + cuisine/intent filter，无 combo 模板层
- 主食 / 水果同上（fruit slot 走 pool-driven 抽样，非 keyword 串）
- 早餐是唯一一个用 keyword-template 路径的餐段

---

## 建议

无新建议。早餐 5 蛋 bug 修完即闭环。

未来若有类似"用户反馈某菜永远出同一道"反馈，第一时间 grep `src/lib/` 找硬编码菜名。

---

## 关键经验（也写进技能沉淀）

**shuffle ≠ pool 扩容**。TICKET-005 之前加过 `shuffleSeeded`，但 keyword 池只有 1 个蛋时，shuffle 只能打乱顺序救不了。要真正轮换必须扩 pool。
