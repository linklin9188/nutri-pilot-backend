# 前端 mint fake 数据审计 (2026-05-25 TICKET-074)

## 背景

老板真测 TICKET-073 揭出 `Home.tsx:2671 InviteFamilySheet` 前端 Math.random mint
fake 字母 invite_code 存 localStorage 但不存 DB → 雇主看到 "APJKJK", 菲佣输入查 DB
失败永远绑不上。老板担心还有类似 bug, explicit 授权 Agent 自决全修。

## 审计方法

1. `grep Math.random / crypto.randomUUID / Date.now()` 全 src/
2. `grep MOCK_/FAKE_/DEMO_/Stub` 常量 + hardcoded 假数据
3. `grep 注释 fake/mock/placeholder/backlog/TODO/未存/前端 mint`
4. 逐个 candidate 验证: (a) 是否两端共享/跨设备; (b) DB 是否有对应字段; (c) 是否影响下游 DB ops

## 发现 4 项 P0 真 bug + 多项不修候选

---

## P0 Bug 1: Community.tsx — MOCK_STORIES (5 个假菲佣 Story 头像 + 假积分)

- **文件**: `src/pages/Community.tsx:75-81` (MOCK_STORIES) + 170 (StoriesRow render)
- **mint 方式**: 写死 5 个对象数组 "Ana M. / Joy R. / Ika / Grace T. / Rose A." +
  unsplash 图床假头像 + 假 pts (160 / 118 / 66 / 44 / 38)
- **DB 字段**: 无对应表 (helper_posts 有, 但 story 概念不存在; community_posts ranking
  应实时聚合)
- **真实场景**: /community 是 prod 路由 (App.tsx:291 + HelperBottomTabBar.tsx:30 +
  LearnerHome.tsx:252), 雇主 + 菲佣 + Learner 都能看到，永远展示 5 个不存在的菲佣
- **严重度**: P0 (用户直接看假数据, 老板原话"产品业务逻辑问题")
- **修法**: Stories 行直接删 (Phase 1 没真 story 功能, "0 story" 比 5 个假人好);
  或退化为只 helper 显 "Your story" 入口, 不渲染 fake users
- **修后验证**: /community 顶部不再出现 "Ana M." / "Ika" 假头像

## P0 Bug 2: Community.tsx — MOCK_POSTS (3 篇假菲佣 post)

- **文件**: `src/pages/Community.tsx:83-120` (MOCK_POSTS) + 904 (`useState(MOCK_POSTS)`)
  + 916 (`if (error || !data || data.length === 0) return; // keep mock data`)
- **mint 方式**: 写死 3 个 Post 对象 "清蒸鱼/红烧排骨/蒜蓉蒸虾" + 假 likes + 假评论
- **DB 字段**: `community_posts` 表存在 + 接 supabase 已 load (line 910-916)，但 DB 空时
  显式 `return` 保留 MOCK_POSTS
- **真实场景**: 同上, prod 用户进去就看到 "Ana M. Steamed Fish 清蒸鱼" + 7 employer
  likes + 45 peer likes + 8 comments — 全假的
- **严重度**: P0
- **修法**: 初始 state 改 `[]`; line 916 删 "keep mock data" return, 让 DB 空就显空状态;
  加 empty-state UI ("No posts yet — be first to share!")
- **修后验证**: /community feed 在 DB 空时显 "No posts yet", 不再显 3 篇假 post

## P0 Bug 3: Community.tsx — handleNewPost 用 Date.now 给真 post mint fake id

- **文件**: `src/pages/Community.tsx:964-991`
- **mint 方式**: `id: Date.now().toString()` 给 optimistic UI 新 post; supabase
  insert 不 select + 不 update local state
- **DB 字段**: community_posts.id (uuid, server-generated)
- **真实场景**: 用户发新 post → 拿到 fake id "1716625200000" → 后续点赞 (handleLike line 956
  `supabase.rpc("increment_post_likes", { post_id: postId })`) 把 fake id 发给 DB →
  RPC 找不到 row 静默失败 → 雇主点 👑 后台没记录积分丢失
- **严重度**: P0 (核心激励 loop 断, 雇主点 👑 但 helper 拿不到 pts)
- **修法**: `supabase.from('community_posts').insert(…).select().single()` 拿真 DB id,
  insert 成功后用真 id 替换 optimistic state 的 fake id; insert 失败 → 回滚 optimistic state + toast
- **修后验证**: 发新 post 后 like / comment / 跳详情都用真 DB id, RPC 真 increment 成功

## P0 Bug 4: Community.tsx — submitComment 用 Date.now mint fake comment id + 提交 race

- **文件**: `src/pages/Community.tsx:234-248`
- **mint 方式**: `id: Date.now().toString()`; supabase insert 不 select
- **DB 字段**: `post_comments.id` (uuid 主键, server-generated)
- **真实场景**: comment 显示用 fake id 做 React key — 单 session 内重复 key 风险;
  更严重: line 247 `supabase.from("post_comments").insert({ post_id: post.id, ... })`
  里的 post.id 如果是 Bug 3 mint 的 fake `Date.now()`, 整条 insert 就插到不存在的 post_id, RLS
  / FK 默默 reject (post_comments.post_id → community_posts.id FK)
- **严重度**: P0 (评论永久丢)
- **修法**: insert(...).select() 拿真 comment.id 替 fake id; insert 失败回滚 + toast
- **修后验证**: comment 真存 DB, 刷新页能拉回; 配合 Bug 3 一起修后, 新 post 上评论也成功

---

## 不修 N 项 (理由)

### 不修 1: Math.random sampling/scoring 全场
- 文件: useWeeklyMenu.ts (rng 默认), useSupabaseMenu.ts (weightedSample / sameIng sort),
  banquet.ts (weightedSample), michelinFromDb.ts (rankCandidates tiebreak),
  WeeklyMenu.tsx:590 (查询结果里 random pick swap candidate)
- 理由: 这些是算法 sampling, 不 mint id, 不存 fake 数据。

### 不修 2: dishIngredients.ts dishId Math.random fallback (line 223, 305)
- 理由: 临时 UI 去重 key, 仅 shopping list 内部 group by ingredient 用, 不写 DB 不跨设备。

### 不修 3: chat session id / message id (useChatSession.ts:70)
- 理由: client-generated UUID 主键, dbUpsert 用同一个 id 写 chat_sessions, URL share
  能 resume。这是合理设计, 不是 fake mint。

### 不修 4: userId / helperId crypto.randomUUID (Login.tsx, Onboarding.tsx, OnboardingV2.tsx, QuickSetup.tsx, Settings.tsx state token)
- 理由: 用户主键 anon-first 架构, getUserId() 返回值用同一个 id upsert user_profiles。
  不是 fake mint, 是 client-generated primary key + sessionStorage OAuth state nonce。

### 不修 5: banquet composerRunId (banquet.ts:500)
- 理由: 写 menu_evals DB row 的 trace id, client-generated UUID 合理。

### 不修 6: Settings.tsx:1008 family member addMember Date.now fallback id
- 理由: TICKET-072 P0 已 ship — 先尝试 DB INSERT 拿真 uuid, 失败时才本地临时 id;
  saveMember 时还会再 upsert。已是正确逻辑。

### 不修 7: Settings.tsx helperName / helperLang (line 658-659 / 1066-1075)
- 理由: TICKET-067 P0 已 explicit fix — 雇主在 Settings 给菲佣起的"称呼", 不应污染
  user_profiles.display_name (会与微信 OAuth 真名冲突)。一旦菲佣登录绑 household_members,
  Home.tsx:786 优先用真 display_name。这是正确的 UI label vs DB identity 分层。

### 不修 8: useFeedbackEngine.ts + swapFeedback.ts user_keyword_prefs
- 理由: 17 keyword 子集 (排骨/鸡腿等), 每个设备各自学合理; 真用户偏好已 DB 化 (user_preference_scores)。
  跨设备同步价值小于实现复杂度。归 P3 backlog, 不修。

### 不修 9: HelperHome.tsx:317 helper_task_done localStorage (单端 cache)
- 理由: 雇主端无消费侧 (grep 仅 HelperHome 自身读写)。注释明确"后续 ticket 接 user_cook_logs",
  目前不是显示假数据, 只是单端 cache 重启清零。算 P2 不修。

### 不修 10: localStorage 各种 cache (favorites, pantry, subscription, eating_today, family_members)
- 理由: 已是"DB 主存 + LS cache"双写模式 (favorites/pantry/subscription) 或"DB 主存 + LS fast cache"
  (family_members via TICKET-072)。算法 fast read 需要 sync API, LS 不可替代。

### 不修 11: HelperHome.tsx:699-700 "--" 积分占位
- 理由: 注释 "TODO: 1000 用户后 enable 真数字, 现在隐", 显示 "--" 不是假数字。正确的 placeholder。

### 不修 12: CandidateGridProto.tsx MOCK_CANDIDATES
- 理由: __protos__ 目录 + App.tsx 305 行 `import.meta.env.DEV && ...` 守卫, prod build 不挂载。

### 不修 13: AIPilot.tsx mock demo
- 理由: TICKET-066 已废, App.tsx:281 `/ai-pilot` redirect 到首页, 文件保留只为历史参考。

### 不修 14: Community.tsx weekPts(48) + PointsPill pts={138}
- 理由: 与 Bug 1/2 同源 — Community 整页 mock 化已在 Bug 1/2 收口范围内。修 Bug 1/2 时一并清理 hardcoded 数字。

---

## 总结

发现 4 项 P0 真 bug, 全在 `src/pages/Community.tsx` 这一个文件。其余 grep 命中均为合理设计或已修 ticket。

老板原观察"是不是还有其他的 mint fake" — 答: 有, Community.tsx 是仅次于 TICKET-073 的另一个集中点,
4 个 bug 都是同一个文件的同一个误区 (开发期 mock data 没在 DB 接入后清掉)。修这一处即可。
