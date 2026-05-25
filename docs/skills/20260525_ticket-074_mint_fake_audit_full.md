# TICKET-074 P0 — 前端 mint fake 数据全面审计 + 修

## 问题

老板 TICKET-073 真测发现 `Home.tsx:2671 InviteFamilySheet` 前端 Math.random mint
fake 字母 invite_code 存 localStorage 但从不存 DB → 雇主看到 "APJKJK" / 菲佣输入
查 DB 失败 → 永远绑不上。注释 line 2670 早写明白 "Real households.invite_code DB
sync is Database 部门 backlog"，是长期债。

老板原话："类似这种逻辑错误,我认为你不应该发生,你可以全面的检查一下,是不是还有其他的
mint fake,这是产品业务的逻辑问题,不是什么需要我来决策的问题。"

担心点：开发期 mock data 在 DB 接入后没清掉、前端 mint id 但不 select 真 DB id、
或注释里"backlog/TODO"长期搁置的 fake 数据。

## 方法

四路 grep 配合验真：

1. **mint pattern**: `grep -rn "Math.random\|crypto.randomUUID\|Date.now()" src/`
   找所有 id 生成；逐个看是不是真 server-generated 主键 (合理) vs 前端 mint 后不
   写 DB / 不 select 真 id (bug)。

2. **MOCK 常量**: `grep -rni "MOCK_\|FAKE_\|DEMO_\|SAMPLE_\|Stub"` 找开发期占位
   数组 / 对象。重点查 prod 路由是否真接入 (App.tsx Routes + BottomTabBar +
   menu nav)。__protos__ / DEV-only 路径不算。

3. **注释关键词**: `grep -rni "fake\|mock\|placeholder\|backlog\|TODO.*DB\|未存\|
   client-side\|前端 mint\|deferred"` 找开发者自承的临时方案。注释里写"待接 DB" 
   "占位" "暂时" 都是疑似。

4. **localStorage 写入**: `grep -rn "localStorage.setItem"` 138 处全过一遍, 排除
   常见 session key (isLoggedIn/userId/nutri_role/appLanguage 等), 看哪些是"两端
   共享 / 跨设备 / 多用户"数据但只写 localStorage 不写 DB。

每个 candidate 三问验真:
- **会跨设备/跨用户/跨端共享吗?** 单端 UI state (如 swap quota / 今日勾选) → 不算 bug
- **DB 有对应字段吗?** 有 → 必须 DB 主存; 没有 → 是后端债 (开 follow-up ticket) 或
  先 placeholder UI 不显假数字
- **影响下游 DB ops 吗?** 比如 fake id 被传给 RPC / FK insert → P0 必修

## 标准

今后任何"两端共享 / 跨设备 / 多用户 / 主键关联"字段必须 DB 主存。前端绝不能 mint
后只写 localStorage 不写 DB。

具体红线：

1. **server-generated 主键**: insert 必须 `.select(主键列).single()` 拿真 DB
   uuid 替换 optimistic state 的 tempId。Optimistic 行的临时 id 必须用明显前缀
   (`__pending_xxx`) 防误判真 id。下游所有 RPC / FK insert 必须等真 id 到位。

2. **MOCK_*** 常量在 prod 路由必须替换为 DB 真值 + empty-state UI**。"DB 空就保留
   mock data" 是错误兜底——用户看到永远是假数据，比看到 empty state 更糟。empty
   state 至少诚实告诉用户"还没人发"。

3. **假积分 / 假数字 hardcoded** 必须改 placeholder "--" 直到真数字接入 (参 
   HelperHome:700 pattern), 不传具体数字到 UI props。

4. **注释里写 "backlog" / "TODO 接 DB" 必须开 follow-up ticket 跟进**, 不能让长期
   债自然腐烂。审计是发现这些遗留的最后防线。

5. **insert 失败必须可观察**: console.error + 回滚 optimistic state + 用户可见
   toast / error message。沿 B-2 §A2 "不吞错" pattern, RLS / FK / 网络失败必须
   暴露给 devtools 留 triage 痕迹。

## 关键工具结果

- 4 项 P0 bug 全在 `src/pages/Community.tsx`。同源 root cause: 开发期 Instagram
  风格 mock 数据 (MOCK_STORIES / MOCK_POSTS) + handleNewPost / submitComment 没在
  DB 接入后改成 `.select().single()` 拿真 id, 后续 like/comment 全打 fake id 默
  默失败.

- 不修 14 项: client-generated UUID 主键 (chat session / banquet composerRunId /
  userId / helperId) + sampling/scoring Math.random (useWeeklyMenu / banquet) +
  UI 临时去重 key (dishIngredients) + 已 DB 化 cache (favorites/pantry/subscription/
  family_members via TICKET-072) + 单端 UI state (helper_task_done / 今日勾选) +
  已修 ticket (TICKET-067 helperName / TICKET-073 invite_code) + DEV-only 路径
  (__protos__).
