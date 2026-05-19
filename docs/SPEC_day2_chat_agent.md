# SPEC_day2_chat_agent.md — Day 2 ChatAgent MVP

> 状态：草案，待 CEO 拍板后拆 4 部门工单
> 作者：Architect（通宵第 2 轮 23:22 HKT 起草）
> 关联：B3 SPEC_day2_feedback_pipeline.md（数据飞轮）、B1 R-13（接口冲突风险）

---

## §0 一句话目标

把"用户在 app 里跟 AI 聊天 → AI 实时推一周菜单"做出来，对话表达层走 Gemini，决策核心仍是本地 generateWeekPlan（3 候选并行跑），不替换现有 WeeklyMenu 页面。

---

## §1 用户故事

```
用户：「下周想吃辣的，但孩子怕辣，再加点海鲜」
AI ：「明白，我给你三套方案：
     方案 A — 周一周三海鲜（西湖醋鱼 / 蒜蓉粉丝蒸扇贝），周末辣度向孩子妥协
     方案 B — 周二周四海鲜，辣度集中在周五放纵日（已为你预留）
     方案 C — 海鲜分散到 4 天，辣度按你历史平均
     喜欢哪个？我直接给你存到这周菜单。」
用户：「A」
AI ：「✓ 已存到这周菜单。要不要再调下早餐？」
```

3 个核心要求：
1. 对话表达自然（Gemini 表达层）
2. 算法决策可解释（generateWeekPlan 3 候选）
3. 用户选了立即落到 user_weekly_menus（沿用 Smell 4 双列校验）

---

## §2 路由与页面结构

### §2.1 新增路由

```
/chat                          → ChatAgent 主页
/chat?mode=today              → 3 模式入口：今天
/chat?mode=week               → 3 模式入口：这周
/chat?mode=preference         → 3 模式入口：偏好定制
/chat?session=<uuid>          → 恢复历史会话
```

### §2.2 文件清单

新建：
```
src/pages/ChatAgent.tsx              主页面（~400 行）
src/components/ChatBubble.tsx        消息气泡（user / ai / system）
src/components/MenuProposal.tsx      AI 提案卡（含 A/B/C 切换 + 一键采纳）
src/hooks/useChatSession.ts          会话 state（messages / streaming / candidates）
src/lib/chatStreaming.ts             Gemini 流式输出 SSE 解析
src/lib/proposalEngine.ts            调用 generateWeekPlan 3 次并 diff
```

修改：
```
src/App.tsx                          加 /chat 路由
src/pages/Home.tsx                   底部 nav 加 chat icon
```

---

## §3 多轮对话 state schema

```ts
type ChatMessage = {
  id: string;                  // uuid
  role: 'user' | 'ai' | 'system';
  content: string;             // markdown rendered
  timestamp: number;
  meta?: {
    intent?: IntentTag;        // parse-intent 解析结果
    proposals?: WeekPlan[];    // AI 给的 3 候选
    chosen?: 'A' | 'B' | 'C';  // 用户选定
  };
};

type ChatSession = {
  id: string;
  user_id: string;
  mode: 'today' | 'week' | 'preference';
  messages: ChatMessage[];
  created_at: number;
  updated_at: number;
};
```

### §3.1 持久化策略

- 实时缓存：`localStorage.setItem('chat_session_<id>', JSON.stringify(session))`
- DB 持久化：每 5 条消息 + 关键节点（采纳 / 关闭）后 upsert `chat_sessions` 表
- 跨设备：v1 不做（同 WeeklyMenu 边界），v2 加 user_id+session_id 全量同步

---

## §4 流式输出协议

### §4.1 Edge function 端

新增 endpoint `gemini-proxy/chat`（不是新 function，复用 gemini-proxy 添加 chat endpoint）：

```ts
// supabase/functions/gemini-proxy/index.ts (新增 case 'chat')
const stream = await callGemini({
  model: 'gemini-2.5-flash',
  messages: req.messages,
  systemPrompt: buildChatSystemPrompt(req.intent, req.proposals),
  stream: true,
});
return new Response(stream, { headers: SSE_HEADERS });
```

配额：`api_usage_daily` 加 `chat` endpoint，30 次/天 per user（高于现有 4 个 endpoint 的 10 次）。

### §4.2 前端消费

```ts
// src/lib/chatStreaming.ts
async function* streamChat(messages, intent, proposals) {
  const res = await fetch('/functions/gemini-proxy', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'chat', messages, intent, proposals }),
  });
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield new TextDecoder().decode(value);
  }
}
```

### §4.3 UI 体验

每个 token 到达 → 追加到当前 AI bubble → 自动滚动到底 + 光标闪烁占位。

---

## §5 3 模式入口

### §5.1 模式 A：今天（`?mode=today`）

- 系统首句：「今天想吃啥？我看了下你最近偏好...」
- 初始 proposals = `[generateDayPlan(today, seed=0), generateDayPlan(today, seed=1), generateDayPlan(today, seed=2)]`
- 候选差异：seed 影响 weightedRandom 采样，不改 score

### §5.2 模式 B：这周（`?mode=week`）

- 系统首句：「这周菜单准备好了 — 三套方案给你挑」
- 初始 proposals = `[generateWeekPlan(seed=0), generateWeekPlan(seed=1), generateWeekPlan(seed=2)]`
- 用户选 A/B/C → 直接 upsert user_weekly_menus（含 algo_version='v40' + cache_key=lsKey）

### §5.3 模式 C：偏好定制（`?mode=preference`）

- 系统首句：「跟我聊聊你最近想吃啥风格的，我帮你定制一份」
- 初始无 proposals，每轮对话后调用 parse-intent 累积 IntentTag
- 用户说"差不多了"或 6 轮后 → 出 3 候选

---

## §6 3 候选 generateWeekPlan 算法

### §6.1 候选生成

```ts
// src/lib/proposalEngine.ts
export function generateThreeProposals(
  pool: Dish[],
  profile: UserProfile,
  prefScores: PrefScores,
  intentBias: IntentTag,
): WeekPlan[] {
  return [0, 1, 2].map(seed => generateWeekPlan(
    pool, profile, prefScores,
    /* random seed */ seed,
    /* axis weight scale */ AXIS_VARIANTS[seed],
    /* intent bias */ intentBias,
  ));
}

const AXIS_VARIANTS = [
  { hometown: 1.0, goal: 1.0, taste: 1.0 },   // 候选 A — 中性
  { hometown: 1.2, goal: 0.9, taste: 1.1 },   // 候选 B — 偏家乡 + 重口
  { hometown: 0.8, goal: 1.2, taste: 0.9 },   // 候选 C — 偏健康目标 + 轻口
];
```

### §6.2 候选差异化（给 AI 解释用）

```ts
function diffProposals(a: WeekPlan, b: WeekPlan, c: WeekPlan): string {
  // 比较三套的 cuisine 分布 / spice 平均 / cook_method 多样性 / cost 估算
  // 输出"A 偏 X / B 偏 Y / C 偏 Z"自然语言
}
```

### §6.3 性能

- generateWeekPlan 当前同步耗时 100-300ms
- 3 候选并行 = 300-900ms（不 await 第一个完成才跑第二个）
- 用 `Promise.all([...])` 真并行
- 总耗时目标 < 1s

---

## §7 parse-intent 集成

### §7.1 触发时机

每条用户消息发出后 → 调用 `parse-intent` edge function（已存在，20/天 quota）→ 拿到 IntentTag → 合并到 session.intent。

### §7.2 IntentTag 累积合并

```ts
function mergeIntent(prev: IntentTag, next: IntentTag): IntentTag {
  return {
    cuisine_prefs: [...new Set([...prev.cuisine_prefs, ...next.cuisine_prefs])],
    spice_level: next.spice_level ?? prev.spice_level,  // 后覆盖前
    ingredient_prefs: { ...prev.ingredient_prefs, ...next.ingredient_prefs },
    health_focus: [...new Set([...prev.health_focus, ...next.health_focus])],
    // ... 4 TCM + 8 wellness 轴
  };
}
```

### §7.3 配额管理

- parse-intent 20/天 — chat 平均 5 轮一次会话 → 4 会话/天/用户上限
- 超限：UI 显示「今日意图分析已用完，请明天再聊或继续聊但不更新偏好」

---

## §8 Gemini proxy 表达层契约

### §8.1 系统 prompt 框架

```
你是 Aieats 的 AI 营养师。用户和你聊天，目标是定制一周菜单。

输入：
- conversation_history: 历史对话
- current_intent: parse-intent 解析的用户偏好（不要重复解析）
- proposals: 3 套候选周菜单（A/B/C），含每日菜品列表 + cuisine 分布 + spice 平均

任务：
1. 自然回应用户最新消息
2. 如果有 3 候选，用 2 句话解释 A/B/C 差异（不要列每天每道菜）
3. 引导用户选 A/B/C 或继续聊偏好
4. 用户选定后简短确认「✓ 已存到这周菜单」

禁止：
- 不要替用户决定（用户没说"随便"前不主动选）
- 不要编菜（菜池都在 proposals 里）
- 不要超过 80 字一段
```

### §8.2 多轮记忆

- conversation_history 截断到最近 20 条（~4000 token）
- 关键节点（采纳 A/B/C / 跳过）写入 session.meta

---

## §9 数据库 schema 增量

### §9.1 新增表 `chat_sessions`（migration 029）

```sql
CREATE TABLE chat_sessions (
  id text PRIMARY KEY,           -- uuid as text，与项目其他 user_id 统一
  user_id text NOT NULL,         -- text，对齐 user_profiles.id
  mode text NOT NULL CHECK (mode IN ('today', 'week', 'preference')),
  messages jsonb NOT NULL,       -- ChatMessage[]
  current_intent jsonb,          -- 累积的 IntentTag
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, created_at DESC);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_sessions_anon_full" ON chat_sessions
  FOR ALL USING (true) WITH CHECK (true);
-- 同 households / household_members anon-first 模式
```

### §9.2 api_usage_daily 加 endpoint

不动 schema，run-time 自然新增 endpoint='chat' 行。

---

## §10 实施工单拆分

### §10.1 Backend 工单（先做）

- gemini-proxy 加 case 'chat' + stream support
- api_usage_daily quota check for 'chat'（30/天）
- 部署 `--no-verify-jwt`
- 工作量：~150 行 / 1 文件 / 4h

### §10.2 Database 工单（与 Backend 并行）

- migration 029 chat_sessions 表
- _archive 备份（首次建表无需备份，但首次 push 后预留）
- 工作量：单 migration / 1h

### §10.3 Algorithm 工单（与 Backend 并行）

- src/lib/proposalEngine.ts 新建（~120 行）
- 不动 ALGO_VERSION（v40 复用）
- 性能验证：3 候选并行 < 1s
- 工作量：~150 行 / 1 文件 / 4h

### §10.4 UI 工单（依赖前 3 个完成）

- ChatAgent.tsx + 3 个组件 + 2 个 hook/lib
- /chat 路由接入
- 工作量：~600 行 / 6 文件 / 8h

### §10.5 总工时估计

Backend 4h + Database 1h + Algorithm 4h + UI 8h = 17h
4 部门并行 = 实际 12h（UI 是关键路径）

---

## §11 风险（指向 B1 R-13）

- chat 上量后 parse-intent quota 20/天 不够 → 工单先做 quota 升到 50
- Gemini 流式输出在弱网下卡顿 → 前端加 5s timeout + 退化为非流式
- 3 候选生成性能 < 1s 在低端手机难达成 → A/B/C 改 sequential 用 web worker
- chat_sessions.messages JSON 单行可能 > 1MB → 加 message_count 列 + 截断历史 50 条

---

## §12 测试清单

实施 PR 后跑：
- [ ] /chat 路由可访问，3 个 mode entry 都能进
- [ ] 流式输出在 Wifi / 4G 下都能 < 200ms 首 token
- [ ] 3 候选生成在 iPhone 11 / 中端 Android 上 < 1.5s
- [ ] 采纳 A → user_weekly_menus 14 行写入正确（algo_version='v40' + cache_key=lsKey）
- [ ] 关闭 app 重开 /chat → session 从 localStorage 恢复
- [ ] parse-intent 20/天达到 → 优雅降级提示
- [ ] Gemini chat 30/天达到 → 优雅降级提示
- [ ] 微信 Web-view 内 SSE 流式正常（X5 内核 SSE 支持要复测）

---

## §13 不在本 SPEC 范围（v2+）

- 跨设备 session 同步
- 语音输入（chat textarea 加 mic icon）
- AI 主动推送（基于 push notification — 远期）
- 用户给 AI 反向打分（B3 SPEC 涉及）

---

## §14 派单口径（CEO 抄走可直接派）

按 §10 拆 4 部门工单，每个工单含「SPEC §X 段」+「文件清单」+「测试清单」+「不变量自检」。
