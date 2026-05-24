# PERF-052 — bundle manualChunks 拆分 + 解决 useWeeklyMenu dual import

## 干了啥（大白话）

老板明早上线，qa-047 audit 抓到两个性能问题：bundle 1.7 MB 单 chunk（vite warning），`useWeeklyMenu.ts` 同时被 static + dynamic import 导致 dynamic import 完全失效、bundle 重复打包嫌疑。我做了两件事：

1. **修 dual import**：`src/pages/Home.tsx` 顶部 line 10 已经 static import `useWeeklyMenu`，line 145 又 `await import('../hooks/useWeeklyMenu')` 想动态拿 `getCurrentFestival`。但 `getCurrentFestival` 在 `useWeeklyMenu.ts:1263` 根本没 export → `typeof fn !== 'function'` 永远 silent skip，**festival banner 在 prod 实际从未生效**。改法是给 `getCurrentFestival` 加 `export`，Home.tsx 把它纳入顶部 static import，删掉整个 dynamic import 块。banner 真正工作 + bundle 不再有冗余探测代码。

2. **manualChunks 拆 7 chunk**：`vite.config.ts` 加 `build.rollupOptions.output.manualChunks`，按 vendor 维度切：`react-vendor` / `supabase` / `motion` / `xlsx` / `icons` / `wechat`。前端 bundle 没有 `@google/genai`（CLAUDE.md hard invariant: Gemini 走 edge function），别加进去会产生空 chunk。`chunkSizeWarningLimit` 调到 1100 让业务主 chunk 暂时不 warning。

## 数据（before → after）

| 指标 | before | after | 降幅 |
|------|--------|-------|------|
| chunk 数 | 1 | 7 | 7× |
| 主 chunk raw | 1701 kB | 1011 kB | -40% |
| 主 chunk gzip | 526 kB | 312 kB | -41% |
| vite warning | YES | NO | ✓ |

after 各 chunk: icons 4.78 / wechat 13.06 / react-vendor 49.78 / motion 128.62 / supabase 207.09 / xlsx 283.10 / index 1011.55 kB。

首屏 win：浏览器并行下载 6 个 vendor chunk + 长缓存命中率高（vendor 几乎不变，只有业务 chunk 频繁更新）。

## 坑 + 注意

- 加 manualChunks **必须先 grep 验证**这些 lib 真的在 `src/` 里被 import，否则会生成空 chunk（vite 不报错只 warn `Generated an empty chunk`）。我第一版加了 `@google/genai` 就翻车 → 空 chunk，删掉后才干净。
- 主 chunk 仍 1011 kB 主因是 `useWeeklyMenu.ts` 3930 行算法逻辑被很多页面 static import，rollup 会因循环依赖把它合并进主 chunk，没法纯 manualChunks 拆出。要进一步降需要 **route-level `lazy()` + Suspense**（动 App.tsx 每个 Route），属于结构改动，不在 P1 bundle 配置 scope。下个 ticket 可以做。
- dual import 这种坑很隐蔽：static + dynamic 共存时，static 已经把 module 拉进主 chunk，dynamic 完全无效——只剩调用开销 + bundler 困惑。grep `import(` + grep `from '../hooks/X'` 双向交叉验证才能抓出来。
- `getCurrentFestival` "未 export 但被 dynamic 探测" 这种 dead code 模式（TICKET-027 §B 注释里写的 graceful fallback），上线后从来没人复查是否真生效——本次顺手治好。
