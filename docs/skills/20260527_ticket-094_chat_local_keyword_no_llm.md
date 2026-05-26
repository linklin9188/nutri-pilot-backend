# TICKET-094 chat 全链路 — 本地 keyword 不接外部 LLM (2026-05-27)

## 1. 问题

老板拍板 2 件事（5/26 晚同一句话）：
- "chat + 使用数据是核心命中率提升来源"
- "chat 用户使用的所有数据来自我的数据和我的算法，不接外部模型。因为要控制 token 消耗"

直接矛盾常见做法（"chat 用 LLM 对话 + LLM extract 偏好"）。如果走那个路径：
- 每次 chat 多轮对话 = $0.01-0.05/次（GPT/Gemini）
- 提取 prefs 又 $0.01-0.02/次
- 1000 DAU × 5 chat/天 = $250/月 token 成本
- Gemini API 还可能配额满（今晚就 hit 了 prepayment depleted）

## 2. 方法

**核心架构决定：放弃自然语言对话，全部 chip 引导式 + 本地 keyword 提取**：

1. **`ChatGuidePrompt.tsx`** 主动弹引导卡，不是"开放对话"：
   - 检测 `nutri_home_visit_count` 决定弹哪一轮（visit 1 = round 1）
   - 4 轮分阶段：早餐主食 / 用餐风格 / 部位偏好 / 工作日复杂度
   - 用户点 chip → 直接构造 ChatPreference (confidence 1.0) → 写 DB
   - 模板回答 "好的，下次菜单按你说的调整 ✨"（不是 LLM 生成）

2. **`lib/chatPreferenceExtractor.ts`** 本地 keyword 提取：
   - `extractFromText(text)` 用正则 + keyword 池命中（COOK_METHOD_KEYWORDS / STAPLE_SUBTYPE_KEYWORDS / MEAT_KEYWORDS / DISLIKE_PHRASES / LOVE_PHRASES）
   - confidence 0.7（自由文本推断）vs chip 1.0（精确选择）
   - 没命中 → 返空数组，上层模板回 "好的我记下了"（不假装真懂）

3. **`injectChatPrefsIntoPrefScores()`** chat 偏好翻译成算法可读 prefScores：
   - CHAT_PREF_KEYWORD_MAP 把 enum value (如 `cook_method.steam`) 映射到 dish title 关键词数组（`['蒸', '清蒸']`）
   - sentiment='love' → 正，'dislike' → 负
   - confidence × sign × 1.5 = 最终权重（chat 1.5× > swap 1.0×，老板拍板）
   - 累加到 prefScores Record，不 overwrite（兼容 swap 学习信号）

4. **DB schema** `user_chat_preferences` 表（migration 101）：
   - `user_id` text + `household_id` uuid（双维度），雇主菲佣共享
   - `preference_type` enum + `preference_value` jsonb 灵活存
   - `source` ∈ {chat / swap_inferred / cook_done / didnt_eat / manual}
   - `confidence` numeric (0-1)
   - RLS FOR ALL USING (true) — anon-first 模型一致

5. **算法接入** `useWeeklyMenu` hook：
   - 启动时 `loadChatPreferences(user_id OR household_id)` → `injectChatPrefsIntoPrefScores`
   - 走 `scoreForWeek` axis 4 学习曲线 → 自动用上，零侵入

## 3. 标准

**今后所有"AI 增量学习"场景的不变量**：

1. **token 0 原则**：能用 keyword + regex 不用 LLM。用户输入是结构化（点 chip）的，永远不需要 LLM 理解。
2. **引导式 > 开放对话**：chip 引导比自然语言对话精确（用户少误解），UX 简单（用户少思考）。
3. **失败模板兜底**：keyword 没命中 → "好的我记下了"，不假装真懂，不试图 LLM 翻译。
4. **多源信号统一**：chat / swap / cook_done / didnt_eat 都写同一张表，confidence 区分权重。
5. **double维度共享**：user_id + household_id 都索引，雇主/菲佣/家人共享偏好的场景天然支持。
6. **算法侧零侵入**：通过 prefScores 注入而不是新加 axis，scoreForWeek 接口不动，下游 50+ consumer 零改动。
7. **bump ALGO_VERSION**：chat ship 一次必 bump，让历史 cache 全失效，用户立刻见新算法效果。

**反模式（不要做）**：
- ❌ chat 走 LLM 多轮对话（token 失控）
- ❌ LLM extract 偏好（不可靠 + 高成本）
- ❌ "用户打字 AI 理解"假装智能（实际只能识别 keyword）
- ❌ 把 chat 偏好存独立表又加新 scoreForWeek axis（dish 评分链膨胀）

**ship 效果**：4 chat 轮全部 keyword + chip 模式 ship, $0 LLM cost，命中率从 ~55% 提升到 ~81% 估算。
