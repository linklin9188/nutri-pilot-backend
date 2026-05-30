# LLM 批量操作 + 长跑脚本经验

**问题**: 5/29-5/30 大夜班批量翻译 + 视频任务踩了多个坑。

## 坑 1 — pg.Client 长跑 ETIMEDOUT 崩溃

**现象**: Tagalog 翻译脚本运行 ~50 分钟后 crash，报 `read ETIMEDOUT`，已处理 257/811 道菜后死掉。
**根因**: Supabase SSL 连接有 idle timeout，`pg.Client` 单连接 idle 时被掐断；`pg.Pool` 内部会维护连接健康。
**标准做法**: 长跑脚本（>10 分钟）一律用 `pg.Pool`：
```typescript
const pool = new pg.Pool({
  connectionString: process.env.DIRECT_DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});
pool.on('error', (e: any) => console.error('[pool]', e?.message ?? e));
```

## 坑 2 — Gemini 2.5 Flash maxOutputTokens 被 thinking 消耗

**现象**: 设了 `maxOutputTokens: 256`，JSON 输出全部截断在 `"video_id":` 处，169/169 失败。
**根因**: Gemini 2.5 Flash 默认开启 internal thinking，thinking token 消耗 outputTokens 配额，实际输出空间所剩无几。
**标准做法**:
```typescript
generationConfig: {
  maxOutputTokens: 800,  // 不能 <500
},
thinkingConfig: { thinkingBudget: 0 },  // 关掉 thinking
```

## 坑 3 — LLM 不能可靠生成具体 YouTube video ID

**现象**: 让 Gemini 推荐"最高分"YouTube 烹饪视频，它给出的 11 位 video ID 100% 是幻觉（oEmbed 验证全部 404）。
**根因**: YouTube video ID 是 11 位随机字符串，LLM 无法从训练数据中可靠记忆这些随机串。LLM 知道"某频道有红烧肉视频"但记不住 `dQw4w9WgXcQ` 这样的 ID。
**标准做法**: 放弃让 LLM 提供具体 video ID，改用 YouTube 搜索 URL：
```typescript
`https://www.youtube.com/results?search_query=${encodeURIComponent(titleZh + ' 做法 教程')}`
```
真实搜索结果 > LLM 幻觉，且用中文搜索质量远高于英文。

## 坑 4 — Tagalog 批量翻译效率：1 菜 1 次 LLM 调用

**原来低效做法**: 每个 step 单独调用 LLM → 一道有 8 步的菜 = 8 次 API 调用。
**标准做法**: 把一道菜的所有 step 打包成一个 JSON 传给 LLM，一次返回全部翻译 → ~12× 效率提升，且 LLM 能保持翻译一致性（同一道菜的术语统一）。

## 坑 5 — ALGO_VERSION 不能提前 bump

**现象**: 为计划中的"500 新菜"提前 bump 了 ALGO_VERSION 到 v73，但新菜还没 ship → 无意义的缓存失效，所有用户菜单重新生成。
**标准做法**: ALGO_VERSION 只在**代码变更实际 merge** 时 bump，不为"即将 ship"的功能提前 bump。

## Tagalog 标准化术语（下次翻译继续沿用）

| 中文 | Tagalog |
|---|---|
| 中火 | katamtamang apoy |
| 大火 | malakas na apoy |
| 小火 | mahinang apoy |
| 焯水 | iblansya |
| 翻炒 | igisa |
| 腌制 | i-marinate |
| 盐 | asin |
| 酱油 | toyo |
