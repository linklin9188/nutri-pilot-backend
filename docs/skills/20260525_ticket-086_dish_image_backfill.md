# 20260525 · TICKET-086 · 209 道 dishes NULL image_url 真图 backfill

## 问题

TICKET-085 实查 dishes 表 929 道菜里 209 道 `image_url IS NULL` (22.5%),
前端 fallback 走 11 池 23 张通用占位图, 撞图率 99%. 老板真测看到的
"沙拉碗" 等图重复出现在不同菜上, CEO 拍板 A 方案: LLM 真图 backfill.

复用现有 `scripts/gen-dish-images.ts` 时, 209 道里 195 道
`flavor_tags` 是 NULL → `dish.flavor_tags.includes(...)` 直接 crash,
5/5 试跑全失败. 这暴露出一个隐藏前提: 现有图生成脚本只在 "新菜按完整
schema 入库" 的快乐路径下能跑, 早期老批菜 (flavor_tags 没填) 进 backfill
循环直接炸.

## 方法

1. **不新建脚本, 不改 gemini-proxy** — 现有 `gen-dish-images.ts` 已经
   完整覆盖 (gemini-2.5-flash-image generateContent + Storage upload
   `dish-images/{dish.id}.png` + UPDATE dishes.image_url), 只补一处
   null-safe 兜底.
2. **surgical edit**: `buildPrompt` 入口加
   `const flavorTags = Array.isArray(dish.flavor_tags) ? dish.flavor_tags : []`,
   后续 3 处 `flavor_tags.includes` 全部走兜底数组. type 同步放松成
   `string[] | null`.
3. **小批量先 5 道**: 跑 `--limit=5` 验证, 看 dishes 表 with_img 从
   720 → 725, Storage 5 个 `{uuid}.png` 真存. 抽样 1 张 URL 给老板
   人工目检 (东坡肉视觉应为焦糖红烧肉).
4. **scale 跑 204 道**: 试跑通过后直接 `--limit=204`, 脚本里 1.5s 
   rate limit 控速, 预估 204 × 5s ≈ 17 分钟.

## 标准

- 凡新菜入库 (dishes seed pipeline), `flavor_tags` 必须填非空数组
  (即使 `[]` 也行), 杜绝 NULL — 否则未来任何依赖 flavor_tags 的
  脚本都会重复踩这个坑.
- 凡复用现有 scripts/ 工具做 backfill, 第一步必须先实查目标行的字段
  是否符合脚本对 schema 的 implicit 假设 (NULL / 空数组 / 类型偏移).
  "TS type 标的 `string[]` ≠ 数据库行实际 NOT NULL" 是踩坑常驻原因.
- Storage path 命名规则锁死 `{dish.id}.png`, 永不引入 title-based 路径
  (中文 URL encoding + 重名问题), 这是图生成 + 前端 fallback +
  RLS policy 三处共同依赖的稳定 key.
- 图生成单价 ≈ Gemini flash-image free quota 内, 209 道 backfill
  总成本 0 美元 (本轮跑完未触发付费).
