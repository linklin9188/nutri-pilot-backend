# UI-037 §3 HelperCommunity 小红书化 — 技能沉淀

日期: 2026-05-25
文件: `src/pages/HelperCommunity.tsx`
父 ticket: TELEPOT-20260525-037 P1 §3

## 这次干了啥（大白话）

把菲佣社区从原本的"单列长卡片 + inline 展开评论"改成了小红书风的"双列瀑布流 + 卡片点开 modal 详情"。
顶部加了 5 个分类 chip tab（全部 / 做菜技巧 / 美食 / 求助 / 闲聊），点击后 client-side filter posts。
在 'all' tab 顶部新增"今日热门"横滑 section，按当日 likes desc 取 top 3 帖。
真点赞 / 真评论 / RLS 一动没动，只换 UI 壳。

## 学到啥（大白话）

1. **分类用 hashtag 解析，不动表结构**：community_posts 没 category 列时，最轻量的做法是 client-side parse `#xxx` from body，配关键词字典（中英混合容错）落到固定枚举。后端补 category 列前先用这个，省 1 个 migration。改造时已经 100 帖在 DB 里，不能要求历史帖回填，所以兜底必须是"匹配不到 → fallback 到某个常用桶（这里是 chat）"。
2. **双列瀑布流要"真不等高"**：直接 `grid-cols-2` 会强等高（grid 行 align stretch）。用 `flex flex-col gap-3` 两列各装一半数据 + 卡片图片 aspectRatio 随帖 id hash 在 3 种比例（3/4 / 1/1 / 4/5）切换，肉眼上就是瀑布。不要追求复杂 masonry 库。
3. **卡片点开 modal 替代 inline 展开**：双列卡片只有一半宽度，inline 展开会撑炸布局。改成全屏 bottom sheet modal（max-h 85vh 内部 scroll），点赞按钮要 `e.stopPropagation()` 防止冒泡触发 modal 打开。

## 下次注意（大白话）

- 真要后端加 `category` 列时，把 `classifyPost()` 直接换成读 `post.category`，CATEGORIES 字典保留作显示用，零侵入。
- 无图帖也要占瀑布位（用渐变色块 + 🍳 emoji 兜底），不然滚下去会一片空白裂开。
- 今日热门只在 `activeCat === 'all'` 时出现，filter 到具体分类时隐藏。逻辑要简单，不要在分类 tab 上叠"该分类今日热门"——会让用户搞不清在看啥。
