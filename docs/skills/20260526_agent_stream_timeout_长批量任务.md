# Agent stream timeout — 长批量任务必须分批 + 每批 commit (2026-05-26)

## 1. 问题

TICKET-086 要 backfill 175+ 张 NULL image_url 菜图。我派了一个 Agent 跑
`scripts/gen-dish-images.ts`，期望它跑完全部。结果：

- 第一次 Agent 跑了 **25 张就 stream timeout**，工单标 "在跑" 但实际 session 已关
- 续派的 Agent (ab1dc33dd10e5300a) **又跑 25 张又停**
- 老板查 DB 进度从 754/929 (81%) 没动多少
- 每次重派都要花 ~30 秒重启 + Gemini 一次预热

真因：**Claude Agent SDK 的 stream 有隐式 timeout**（约 5-10 分钟无 user-facing output），
长跑脚本 stdout 不更新就被判 dead，session 关闭。`scripts/gen-dish-images.ts` 每张菜
要 ~10 秒（Gemini call + Storage upload + DB update），25 张 = 250 秒就在 timeout 边缘。

而且**Agent 退出前如果没 commit，进度全丢**——下次 Agent 启动得重新跑（虽然脚本有
跳过已有 image_url 的逻辑，但 LLM 调用成本是真实损失）。

## 2. 方法

**长批量任务必须分批 + 每批 commit 的脚本结构**：

```ts
const BATCH = 30;  // ~5 min/batch, 安全留 5min cache window
const COMMIT_EVERY_BATCH = true;

for (let i = 0; i < total; i += BATCH) {
  const chunk = nullDishes.slice(i, i + BATCH);
  for (const dish of chunk) {
    await generateAndUpload(dish);
    console.log(`[${i + chunk.indexOf(dish) + 1}/${total}] ${dish.title_zh}`);  // 持续 stdout 防 timeout
  }
  if (COMMIT_EVERY_BATCH) {
    // git add + commit + push
    execSync(`git add -A && git commit -m "feat(images): batch ${i / BATCH + 1} done" && git push`);
  }
}
```

**Agent 派遣时的额外保险**：

1. `run_in_background: true` — 不阻塞主 session，长跑不算 timeout
2. prompt 里明写 "每 30 张 commit 一次, 不要等全部跑完再 commit"
3. prompt 里要求 "每 5 张打印一次进度"，stdout 保持活跃
4. 派遣前先 query DB 拿当前 NULL 数（不要假设上一个 Agent 的报告），用真值算批次数
5. **不要在 Agent prompt 里写 "跑完所有"——写 "跑 50 张然后 stop"**，
   每次 Agent 跑一段稳定的量，主线 driver 决定何时再派下一个

**为何不直接在本地终端跑**：
- 老板电脑可能锁屏 / 断网 / 关机，长跑断了进度丢
- Agent 跑在云端，进度真实留 git 历史

**进度查询脚本**：
```bash
curl -s "$SUPABASE_URL/rest/v1/dishes?select=count&image_url=is.null" \
  -H "apikey: $SERVICE_ROLE" -H "Prefer: count=exact"
```
不要靠 Agent 自报"还剩 X"，直接查 DB 是唯一真相。

## 3. 标准

**今后所有长批量任务（>50 项 + 单项 >5 秒）的不变量**：

1. **必须分批**：BATCH = 30 左右，单批跑完 < 5 分钟。
2. **每批必须 commit**：宁可多 commit 一些（5-10 个小 commit），不要"全跑完一次 commit"。
   失败就只丢一批，下次脚本跳过已完成。
3. **脚本必须支持 idempotent 重入**：脚本启动先 query 当前进度，跳过已完成，不要从头跑。
4. **stdout 必须持续输出**：每完成一项打一行进度，防 stream timeout。
5. **Agent prompt 写明确边界**：跑 N 个 stop，不要"跑完所有"——SDK timeout 不可控。
6. **进度 verify 走 DB query，不靠 Agent 自报**：Agent 报"在跑"可能 session 已死。
7. **主线 driver 派遣多轮**：每轮一个 Agent + run_in_background，跑 batch 后回报，
   主线决定是否派下一轮。不要假设单个 Agent 能跑完几百项。
8. **任务前先估 cost**：175 张 × $0.04/张 Gemini = $7，老板需要知道总花费。

**TICKET-086 当前状态**：754/929 done，剩 175 张待续。下次派 Agent 用 BATCH=30 + 每批 commit 模式。
