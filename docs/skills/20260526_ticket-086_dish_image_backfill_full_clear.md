# TICKET-086 P0 LLM 真图 backfill — 全量清零 (2026-05-26)

## 1. 问题

dishes 表 929 道菜里 209 道 image_url IS NULL，前端只能 fallback 到 23 张 unsplash
公共图池，撞图率 99%（老板真测发现 3 道完全不同的菜共用同一张图）。雇主真测口碑伤。

TICKET-088 临时把 fallback 池扩到 232 张救急把撞图压到 31%，但根本解是给每道菜
LLM 生真图存 Supabase Storage。原 TICKET-086 跑了 5 道试跑 + 启动 scale，但
Agent stream timeout 几次都卡在 25-50 张，迟迟跑不完。

## 2. 方法

**分批 + background bash + DB query verify 闭环**：

1. 不派 Agent — 之前两次派 Agent 都 stream timeout 在 25-30 张就停（参考
   `20260526_agent_stream_timeout_长批量任务.md`）。改用主线直接 `Bash run_in_background`，
   Bash 本身没 SDK 的 stream timeout 限制，能跑满 10+ 分钟一批。
2. 每批 50 张作为 BATCH 大小 — 单张 ~10s（Gemini call 5-8s + Storage upload + DB
   UPDATE + 1.5s rate-limit sleep），50 张约 8-10 分钟，正好一个 cache window。
3. 脚本本身已 idempotent — `scripts/gen-dish-images.ts` 启动时 query `image_url IS NULL`
   并跳过有图的，DB UPDATE 自带进度持久化，不需要 git commit。
4. 每批跑完用 `curl ?image_url=is.null + Prefer: count=exact` query DB 拿真实
   剩余数，不靠 Bash output 自报。
5. 第一批失败的菜（Gemini 高负载短暂 503）下批启动会自动重试 — 不需要手动管。

**实际跑批进度**：

| 批次 | limit | 成功 | 失败 | 跑完后 NULL |
|---|---|---|---|---|
| batch1 | 50 | 47 | 3 (Gemini 高负载) | 128 |
| batch2 | 50 | 49 | 1 (Gemini 高负载) | 79 |
| batch3 | 50 | 50 | 0 | 29 |
| batch4 | 50 (实跑 29) | 29 | 0 | **0** |

失败的 4 张菜在后续批次启动时自动 pick up 重跑 — 最终 NULL = 0。

**成本**：~175 张 × ~$0.04 Gemini = ~$7 总成本，3 次失败重试 0 成本（脚本只在
成功才 UPDATE，失败的菜下批照样 query 到再跑一次）。

**关键决定**：
- **不用 Agent 跑批量** — SDK stream timeout 比 Bash run_in_background 弱很多
- **不 git commit 中间状态** — DB UPDATE 就是持久化，commit 没价值
- **不主动重试失败菜** — 下批自动 pick up，逻辑更简单
- **每批结束 query DB 验真** — 不依赖 Bash output 自报"成功"

## 3. 标准

**今后所有"几百项 × 单项 ~10s"批量任务的不变量**：

1. **首选 Bash run_in_background, 不派 Agent**：SDK stream timeout 在 5-10 分钟，
   而 Bash run_in_background 能跑满 timeout 上限 (600s)。Agent 适合"决策性"任务，
   不适合"重复执行 N 次同样动作"。
2. **脚本必须 idempotent**：启动 query "未完成" + 跳过已完成，从断点继续。
3. **DB UPDATE = 持久化 = 不 commit**：DB 写已经持久，不要为了"备份"加 commit 步骤。
4. **失败的让下批自动重试**：不要写复杂 retry 逻辑，自然循环即可。
5. **每批结束 query DB 验真**：`?col=is.null + Prefer: count=exact`，Bash output
   的"50/50 success"不一定真。
6. **预估 cost 给老板看**：175 张 × $0.04 = $7，提前告知避免事后追问。
7. **rate-limit 间隔写脚本里**：1.5s sleep 防 Gemini 503，不要靠 batch 间隔人为掌控。

**今后避免的反模式**：
- 派 Agent 跑长批量 — 必 stream timeout 停
- 每批 commit — DB UPDATE 已持久，git commit 是噪音
- 主动重试失败 — 下批自动 pick up 更简单
- 信 Bash output "100% success" — DB query 才是真相

**最终结果**：175 张菜全部生图完成，DB NULL = 0，前端 fallback 池可以下线
（待 ALGO_VERSION bump 时回收 dishImageFallback.ts 的 232 张池子）。
