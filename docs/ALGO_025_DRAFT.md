# Algorithm 025 DRAFT — vitamin_d 0 IU 视为有效 deficit 参与

> CEO 自决 draft，Algorithm 024 ship 后覆盖 telepot_algorithm.md 派出。

---

## 触发

Backend 023 ship vitamin_d_iu fill 100%（NULL 全清，0 IU 显式 712 行）。Backend 给 Algorithm 的洞见：

> "中餐 dish 物理含 vitD 食材有限（仅 fish/egg/mushroom/强化食品），non-zero 22.9% 是天花板。算法侧应把 0 IU 视为'无 vitD 贡献'参与 weekly deficit，不再视为'未填充'。"

意思：当前 Algorithm v59 deriveBadges 💪 channel 可能把 `dish.vitamin_d_iu === null` 和 `=== 0` 都跳过。但 fill 后是 712 dishes 显式 0 IU + 212 dishes >0 IU。0 应该真参与计算（吃了这道 dish 给 user 加 0 vitD），不是"跳过"。

---

## TICKET-025 工单（draft）

TICKET: TELEPOT-20260523-025
PRIORITY: normal
TASK: Algorithm reader 把 0 IU / 0 mg 视为有效 deficit 参与值（不再 nullish skip）

§A reader 路径修：
```ts
// OLD: const v = dish[NUTRIENT_COLUMN_MAP[nut]]; if (!v) continue;  // 0 也 skip
// NEW: const v = dish[NUTRIENT_COLUMN_MAP[nut]]; if (v == null) continue;  // 仅 null 跳过
```

deriveBadges 💪 channel 同样：weekStats 端聚合 deficit 时 0 加进 sum（不增不减），仍计算 deficit_pct = 1 - sum/target。

§B sim verify 22 profile 不回归 + 新 unit test：
- mock dish iron_mg=0 vitamin_d_iu=0 → reader 不 skip ✅
- mock dish iron_mg=null → reader skip ✅

§C bump v59 → v60（reader 语义微改，缓存保险失效）

预算 ~50-70k token / ~$1
