# 20260525 TICKET-065 — IntentBias 加 cuisineBoosts 菜系维度

## 问题

老板真测 #11: "我说我想吃西北菜, 结果出来腊味合蒸 (广东菜)."

实查真因不是 Gemini 识别问题, 是 schema 设计缺陷:

- `src/lib/intentBias.ts` 的 `IntentBias` 只有 `categoryBoosts` (6 大食材类: seafood/pork/beef/poultry/plant/carb) + `tagBoosts` (flavor + health). **完全没 cuisine 维度.**
- "西北菜" 被 Gemini 强行往现有 axis 转 → categoryBoosts/tagBoosts 都无法表达"想要 origin_cuisine=northwest"这件事 → 等价于无 bias.
- `scoreForWeek` 回退按 hometown (粤) + prefScores 排, 腊味合蒸 (cantonese) 命中.

直接表现: 用户的自然语言菜系偏好**到不了算法**.

## 方法

扩 schema 加第三轴, 不动现有 2 轴:

1. **实查 dishes.origin_cuisine 真值** — 不要发明菜系 code. grep `scripts/` + `supabase/migrations/` 实查出 12 个真值: `cantonese / sichuan / jiangnan / northern / western / japanese_korean / southeast_asian / hunan / northwest / fujian / hakka / northeast`. 注意 `hunan` 和 `northwest` 是独立值, 不是 sichuan/northern 子集 (migration 088 batch1 加的). 跟 hometownBuckets 的归并桶**物理分离** — hometownBuckets 是用户偏好 → DB bucket 的归并, 这里是 DB 真值集合.

2. **改 4 处同步上线** (这是关键标准):
   - `src/lib/intentBias.ts` — `CuisineCode` type + `IntentBias.cuisineBoosts` field + `applyIntentBias` 加 `dish.origin_cuisine` 命中分支 + `getIntentHash` 把 cuisineBoosts 纳入 hash (cache buster) + `loadIntentBias` 兜底旧 LS 没该字段.
   - `supabase/functions/parse-intent/index.ts` — Gemini PROMPT 加 cuisineBoosts schema + cuisine mapping cheat sheet ("粤菜/广东/港式→cantonese, 川菜/麻辣→sichuan, 西北/陕西/兰州/新疆/大盘鸡/羊肉泡馍→northwest, ..."). 不需要 server-side clamp — 前端 parseIntent 用 clampObj 已经 generic 处理.
   - `src/hooks/useWeeklyMenu.ts` — ALGO_VERSION bump v67→v68 (改动**影响推荐结果**, 必须 bump). 调用点 `applyIntentBias(score, dish, ...)` 在 scoreForWeek 内, dish 来自 DB DISH_FIELDS SELECT (含 origin_cuisine, v59 起), **无需改 caller**.
   - dish 参数接口 — `applyIntentBias` 函数签名加 `origin_cuisine?: string`.

3. **部署 edge fn** — `supabase functions deploy parse-intent --no-verify-jwt`. 只 commit 不 deploy → 前端调的还是老 prompt → Gemini 不知道有 cuisineBoosts → 老用户 24 小时内会一直命中老菜单.

## 标准

**今后凡新增算法维度**, 必须同步 **4 处** 才算完工:

1. **Schema** — TS type (`CuisineCode`) + Interface 字段 (`IntentBias.cuisineBoosts`).
2. **Gemini prompt (server-side)** — 让 LLM 知道有这个 axis + 给 cheat sheet mapping (用户自然语言 → enum value).
3. **`applyXxx` 命中函数** — 读 dish 字段 → 查 bias map → 累加 score. 同时**接口里加 dish 字段**.
4. **dish DB 字段流转** — `DISH_FIELDS` SELECT 必须含此字段; 如果是新算法维度还涉及 `cache_key` / `getIntentHash` 必须把新字段纳入 hash 做 cache buster.

**额外标准**: 加 axis 必须 bump ALGO_VERSION (改了推荐结果). loadXxx 必须兜底旧 LS 格式 (不破老用户).

**实查 first 教训**: 菜系 code 不要凭印象写. 比如直觉以为"西北菜"会归到 `northern`, 实查发现 dishes 表里 `northwest` 是独立值. 凭直觉发明 enum → 跟 DB 永远对不上.
