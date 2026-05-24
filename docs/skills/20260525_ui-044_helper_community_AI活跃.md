# 20260525 UI-044 helper community AI 活跃度（简化版）

## 这棒做了什么

老板要 helper 社区"AI 活跃化"。完整 spec 三件：F (AI 帮 helper 写帖)、C (AI 智能推送)、E (AI 出每日话题)。但完整真 AI 集成 + 协同过滤太大，CEO 拍板简化：

- **F 真做**：发帖 modal 加 "✨ AI 帮我写" 按钮，调 `callGemini({ endpoint: 'recipe' })`（`recipe` 30/day quota 是现有 5 个 endpoint 里最贴近自由文本生成的），prompt 上下文塞 helper origin_country + 最近做的菜 + 今日话题，输出 zh/en/tl 三段让用户选/编辑。Gemini 失败时硬编码 3 段 stub fallback 仍能让用户继续发帖。
- **C 假做 (mock smart push)**：HelperHome §4 社区动态原来是 `created_at desc limit 3`，改成 `like_count desc + 近 7 天 limit 3`。Section header 加 🔥 TRENDING chip 让用户视觉感知到这是"近期热门"不是"最新"。真协同过滤推后续 ticket。
- **E 静态做**：30 题硬编码数组 `DAILY_TOPICS`，`getDate() % 30` 每天轮播一题。HelperCommunity 顶部加 📌 banner + "✏️ 发个帖" 按钮（点击 autofill `#今日话题` hashtag 进发帖 modal）。

## 关键决策 / 坑

1. **helper_posts 列名是 `like_count` 不是 `likes_count`**。Ticket spec 写的 `likes_count` 是错的。`grep migration 079` 确认是 `like_count`（trigger 自维护 denormalized）。
2. **`GeminiEndpoint` type 只列了 4 个**：`vision | michelin | school_balance | recipe`。`chat` / `translate` / `health_tag` 等是 edge fn 内部 endpoint 但 `geminiProxy.ts` type 没列。要扩 type 才能新加 endpoint。我选了 `recipe` 复用 — 不动 type。
3. **HelperCommunity 之前没有任何发帖入口**！只是个 read-only feed。我加了 FAB（右下圆形按钮）+ banner 上的 "发个帖" 按钮，两条都进同一个 Compose Modal。这是隐藏的"小红书化漏掉了 compose UI"的 bug 顺手填上。
4. **AI prompt 三段解析用正则按【中文】【English】【Tagalog】拆**。模型偶尔不按格式 → 整段塞 zh，用户还能改/选。最差情况 catch 走 stub fallback（3 段硬编码示例 + 今日话题字符串内嵌）。
5. **prod vite build 通过** (1,697 kB) — `tsc --noEmit` 报 jsx/module 模式问题是单文件检查的 false positive，CLAUDE.md "Don't fix pre-existing TS errors" 适用。

## 改动文件

- `src/pages/HelperCommunity.tsx` — 加 callGemini import、DAILY_TOPICS 30 题、todayTopic()、POST_BODY_MAX 500、compose state 9 个、AI handlers (openCompose/closeCompose/runAiDraft/pickAiDraft/submitPost)、useEffect 加载 origin_country + recentDishTitle、UI 加今日话题 banner / FAB / Compose Modal。
- `src/pages/HelperHome.tsx` — §4 社区动态查询改 `like_count desc + 7d`，header 加 🔥 TRENDING chip。

## 后续 ticket 建议

1. 真 AI 协同过滤推荐：embed helper origin + dish vec，最近 30 天高赞，每个 helper 个性化 3 帖。
2. 真 AI 每日话题：edge fn `parse-intent` + 历史话题已用集合，避免重复。
3. `GeminiEndpoint` type 扩 `'social_post'` 专属 endpoint + 独立 quota（recipe 30/day 太紧，社区一活就被抢光）。
4. 发帖 modal 加图片上传（小红书化卡片需要图，现在 image_url 永远 null）— 走 supabase storage bucket。
5. AI 三段输出考虑加 hometown_cuisine + dietary_goal 上下文（更个性化）。
