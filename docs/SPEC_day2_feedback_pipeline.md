# SPEC_day2_feedback_pipeline.md — Day 2 数据飞轮

> 状态：草案，**user_feedback 表（migration 027）建议立即派出**（Day 1 UI 三件套写入依赖此）
> 作者：Architect（通宵第 2 轮 23:26 HKT 起草）
> 关联：B1 R-08（feedback 表未上线 → 数据零落库）、B2 ChatAgent（消费 prefScores）

---

## §0 一句话目标

把"用户和菲佣给反馈 → 算法/Claude 学习 → 推菜更准"做成自动 pipeline，不需要人工干预。

---

## §1 用户故事

```
雇主：（午饭打开 Home，点 😋 好吃）
菲佣：（做菜时点 🥵 太难了 + 🛒 没材料）
系统：
  - 雇主反馈 → user_preference_scores 加分
  - 菲佣反馈 → 下次该菜 prep_steps_json 生成时附"简化步骤"prompt + 食材替代提示
  - 累积 50 条好评 → prefScores 重训
  - 累积 100 条菲佣"看不懂" → Claude 步骤生成 system prompt 升级 → 隐性 ALGO_VERSION 触发
```

---

## §2 数据库 schema（migration 027）

### §2.1 `user_feedback` 表（UI Day 1 三件套依赖）

```sql
-- 027_user_feedback.sql
CREATE TABLE user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  dish_id uuid REFERENCES dishes(id) ON DELETE SET NULL,
  step_index int,                       -- HelperCook 反馈：第几步
  feedback_type text NOT NULL CHECK (feedback_type IN (
    'cant_understand',     -- 菲佣：看不懂步骤
    'too_hard',            -- 菲佣：太难
    'missing_ingredient',  -- 菲佣：没材料
    'rating_good',         -- 雇主：好吃
    'rating_okay',         -- 雇主：一般
    'rating_bad'           -- 雇主：不喜欢
  )),
  locale text,                          -- HelperCook 反馈方语言 zh/en/tl/id
  meta jsonb,                           -- 扩展字段（未来 ChatAgent 反馈也写这里）
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_feedback_user_dish ON user_feedback(user_id, dish_id);
CREATE INDEX idx_user_feedback_type_time ON user_feedback(feedback_type, created_at DESC);

ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_feedback_anon_insert" ON user_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "user_feedback_anon_read" ON user_feedback FOR SELECT USING (true);
-- 应用层 WHERE user_id=getUserId() 过滤，与 anon-first 模式一致
```

### §2.2 `prefscores_training_log` 表（migration 027 同期）

```sql
CREATE TABLE prefscores_training_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  trained_at timestamptz DEFAULT now(),
  feedback_count int NOT NULL,          -- 本次训练用了多少条 feedback
  prev_top_dishes jsonb,                -- 训练前 top 10 dish_id + score
  next_top_dishes jsonb,                -- 训练后 top 10 dish_id + score
  delta_summary text                    -- "spice +0.12 / cuisine_jiangnan +0.08"
);

CREATE INDEX idx_prefscores_log_user ON prefscores_training_log(user_id, trained_at DESC);
```

---

## §3 反馈数据 → 步骤生成 prompt 回流

### §3.1 菲佣反馈（cant_understand / too_hard / missing_ingredient）

**触发**：每日凌晨 cron `0 4 * * *` 跑 `scripts/feedback-to-prompt.ts`

```ts
// scripts/feedback-to-prompt.ts
async function rollupHelperFeedback() {
  // 按 dish_id 聚合过去 7 天的菲佣反馈
  const rows = await supabase.from('user_feedback')
    .select('dish_id, feedback_type, step_index, count(*)')
    .in('feedback_type', ['cant_understand', 'too_hard', 'missing_ingredient'])
    .gte('created_at', sevenDaysAgo)
    .group('dish_id, feedback_type, step_index');

  // 阈值：单一 dish_id 收集 ≥3 条同类反馈 → 标记重生成
  const dishesToRegen = rows.filter(r => r.count >= 3);

  // 写入 dishes.meta 字段：prep_steps_json_needs_regen = true + reason
  for (const dish of dishesToRegen) {
    await supabase.from('dishes').update({
      meta: { prep_steps_json_needs_regen: true, reason: dish.feedback_type, step_index: dish.step_index }
    }).eq('id', dish.dish_id);
  }
}
```

### §3.2 重生成时的 prompt 增强

```ts
// scripts/gen-dish-steps-claude.ts 增强（已存在脚本，扩展 system prompt）
function buildSystemPrompt(dish, meta) {
  let base = `Generate step-by-step cooking instructions for ${dish.title_zh}. ...`;

  if (meta?.prep_steps_json_needs_regen) {
    const reason = meta.reason;
    if (reason === 'cant_understand') {
      base += `\n\nNOTE: Previous version had 3+ helper feedback "can't understand step ${meta.step_index}".
        Rewrite this step in simpler language, add 1 illustration cue.`;
    } else if (reason === 'too_hard') {
      base += `\n\nNOTE: Previous version had 3+ helper feedback "too hard at step ${meta.step_index}".
        Break this step into 2-3 smaller sub-steps. Add timing hints.`;
    } else if (reason === 'missing_ingredient') {
      base += `\n\nNOTE: Previous version had 3+ helper feedback "missing ingredient at step ${meta.step_index}".
        Suggest 1-2 common alternatives in the ingredients list.`;
    }
  }

  return base;
}
```

### §3.3 触发节奏

- 凌晨 04:00 跑 feedback rollup → 标记 dishes.meta
- 凌晨 04:30 跑 gen-dish-steps-claude.ts --only-needs-regen
- 凌晨 05:00 跑 backfill-dish-nutrition.ts（若步骤改了食材列表）

---

## §4 prefScores 自动重训

### §4.1 触发条件

- 单用户累积 ≥30 条 rating_* feedback → 触发重训
- 或自上次重训后 ≥7 天 + 累积 ≥10 条 feedback

### §4.2 重训算法（参考 useFeedbackEngine 现有实现）

```ts
// scripts/retrain-prefscores.ts
async function retrainUserPrefScores(userId: string) {
  const feedbacks = await supabase.from('user_feedback')
    .select('dish_id, feedback_type, created_at')
    .eq('user_id', userId)
    .in('feedback_type', ['rating_good', 'rating_okay', 'rating_bad'])
    .order('created_at', { ascending: true });

  // 反馈权重：good +1 / okay +0 / bad -1
  // 时间衰减：每 7 天衰减 0.85
  const dishWeights = computeWeightedDishScores(feedbacks);

  // 反推到 tag 级（flavor / health / cuisine）
  const tagScores = await aggregateToTags(dishWeights);

  // 写回 user_preference_scores
  await upsertPrefScores(userId, tagScores);

  // 训练日志
  await insertTrainingLog(userId, feedbacks.length, prev, next);
}
```

### §4.3 调度

- 凌晨 03:00 跑 `scripts/retrain-prefscores.ts --all-users-needing-retrain`
- 每用户独立事务，单用户失败不阻塞其他用户

---

## §5 ALGO_VERSION 自动 bump 触发条件

### §5.1 条件清单（任一满足 → bump）

| 条件 | 触发版本号增量 | 影响范围 |
|------|----------------|----------|
| `dishes` 表新增 ≥10 行（curated source） | v40 → v40.1 | 全用户菜单 stale，重生成抽到新菜池 |
| `prefscores_training_log` 全用户累积 ≥500 行 | v40.x → v41 | 全用户重生成（评分曲线被新数据形成） |
| `scoreForWeek` 新增 axis | v40 → v41+ | 手动 bump（Algorithm 部门 commit 时） |
| 节庆周（春节/中秋等）前 7 天 | 临时 +festival_bias | 不 bump ALGO_VERSION，festival 单独失效维度 |

### §5.2 实施

**v1（本 SPEC 范围）**：手动 bump（Algorithm commit 时改 useWeeklyMenu.ts:60）

**v2（远期）**：scripts/auto-bump-algo-version.ts 跑在 retrain-prefscores 之后，检查条件自动 bump + push commit

---

## §6 边界与不在范围

- 不做 cross-user 协同推荐（"和你口味相似的人喜欢..."）— v3+
- 不做实时反馈训练（feedback 入 DB 立即影响下次推菜）— 当前批量训练即可
- 不做 LLM-based feedback 解析（用户写自由文本评论）— 当前只取 enum feedback_type
- 不做 A/B test 框架（同时跑两套评分版本看哪个 feedback 好）— v2+

---

## §7 实施工单拆分

### §7.1 Database 工单（最紧急 — UI 三件套等）

- **migration 027 user_feedback + prefscores_training_log**
- 备份：首次建表无需备份
- 验证：INSERT 一条测试行成功 + RLS policy 生效
- 工作量：单 migration / 1.5h

### §7.2 Backend 工单

- scripts/feedback-to-prompt.ts 新建
- scripts/retrain-prefscores.ts 新建
- gen-dish-steps-claude.ts 扩展（条件 system prompt）
- 工作量：3 文件 / ~300 行 / 6h

### §7.3 Algorithm 工单

- useFeedbackEngine.ts 扩展（feedback meta 字段 + 训练触发条件）
- scoreForWeek 不动（v40 已经支持 prefScores 消费）
- 工作量：1 文件 / ~80 行 / 2h

### §7.4 UI 工单（轻）

- HelperCook + Home rating 已上线，本 SPEC 仅做 schema 后端
- UI 仅在 chat 模式中显示训练状态 chip "已学习 X 道菜偏好"
- 工作量：1 hook + 1 component / 2h

### §7.5 总工时

Database 1.5h + Backend 6h + Algorithm 2h + UI 2h = 11.5h
并行 = 实际 7h（Backend 最长）

---

## §8 风险

- **R-A**：cron 04:00 跑 feedback rollup 撞上 Railway 部署窗口 → 加 lock 文件防并行
- **R-B**：retrain-prefscores 单用户失败影响所有用户 → 强制 try/catch 每用户独立事务
- **R-C**：gen-dish-steps-claude.ts 重生成成本（Claude API） → 单日上限 50 道
- **R-D**：菲佣反馈的 step_index 可能错位（步骤更新后 index 失效） → 反馈写入时同时记录 prep_steps_json 版本 hash

---

## §9 测试清单

实施后：
- [ ] UI HelperCook 点反馈按钮 → user_feedback 1 行 INSERT 成功
- [ ] UI Home 菜评分 → user_feedback 1 行 INSERT 成功
- [ ] 同一菜同一用户同一天重复评 → 防重复（UI 已实现 localStorage 防重复）
- [ ] 凌晨 cron 跑 feedback rollup → 阈值 ≥3 的 dish 被标记
- [ ] gen-dish-steps-claude.ts --only-needs-regen → 仅重生成标记的菜
- [ ] retrain-prefscores 单用户 30 条 feedback 后触发 → 训练日志 1 行
- [ ] dishes 表新增 10 行 curated → ALGO_VERSION bump 提示（v1 手动）
- [ ] user_feedback 表 INSERT 10000 行后 query 性能 < 100ms（索引验证）

---

## §10 不在本 SPEC（Day 3+）

- AI 自动总结用户反馈生成"你最近偏好"卡片
- 菲佣反馈聚合给雇主看（"你家菲佣最常报告 X"）
- 反馈数据反哺 ChatAgent 系统 prompt
