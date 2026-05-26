# TICKET-088 fallback 图池扩展 23 → 232 张

## 问题
TICKET-085 实查 209 道菜 image_url=NULL → 走 `src/lib/dishImageFallback.ts` 的 11 类 23 张图 → `hashId(dish.id) % 23` 撞图率 **99%** (207/209 共享 1 张图). TICKET-086 LLM 图生成在 background 跑 ~30 分钟, 老板真测窗口仍会撞图, 必须临时扩池兜底.

执行时 DB 实查 NULL image_url 已降到 176 道 (086 在跑), 关键发现: **161/176 (91%) 的 `main_ingredient` 是 'other'** — 原 ticket 设计按 main_ingredient 分池的方案完全失效, 必须改成按 **title_zh 关键词扫描** 主线 + cuisine / cook_method 兜底.

## 方法
1. **Phase 1 实查**: 跑 `scripts/check-null-image-dist.ts` 拉所有 176 道 NULL title + ing + cui + cm, 输出全量列表手工归类 18 个池.
2. **Phase 2 设计 18 池**: beef/pork/chicken/duck/lamb/fish/shrimp/crab_shellfish/tofu_egg/veggie_green/veggie_root/veggie_misc/noodle/rice_carb/soup/dessert_fruit/cold_dish/default. 池数按命中分布加权 (chicken 池给 25 张因为是最热的 35 道).
3. **Phase 3 改 schema**: 用 `https://source.unsplash.com/featured/?<keywords>&sig=<n>` 动态 URL — Unsplash 按 keywords 随机返图, sig 不同保证池内多样性. 跳过手动找 photo_id 的工作量, 牺牲 ~200ms 首次加载延迟.
4. **Phase 4 keyword rules**: 写了一个 `TITLE_RULES: Array<[RegExp, PoolId]>`, 按 4 层优先级扫:
   - 凉菜前缀 (拍/凉/醉/老醋) 最高优先, 否则 "拍黄瓜" 会跑去 veggie
   - 汤/羹/煲 在 protein 关键词之前 (鱼汤 → soup 而非 fish)
   - 具体食材在通用食材之前 (羊排 → 羊, 牛腩 → 牛, 三文鱼 → 鱼)
   - cuisine 兜底 (northwest → lamb)
5. **Phase 5 验证**: `scripts/test-fallback-pool.ts` 跑全部 176 道菜, 撞图率从 **99% → 31.3%** (121 张不同图), chicken 池 35 道分 25 张已经接近 hash 分布物理下限.

## 标准
- **fallback 池设计原则**: 池数 ≥ 主要 ingredient 类别数 (本项目 18 个), 每池 ≥ 8 张, 热池按命中分布加权扩到 25 张, hash 分布保证均匀.
- **当 main_ingredient 大量 'other' 时**: 必须 title 关键词扫优先, 不能依赖 ing 列. 91% 'other' 是 dish 录入时没填食材列的 schema debt, 但 fallback 不能等 DB 补.
- **keyword rules 排序铁律**: 最具体的食材规则在前 (羊排 > 羊), 烹饪法上下文在 protein 之前 (鱼汤 > 鱼), 凉菜前缀压一切 (拍黄瓜 ≠ 黄瓜).
- **source.unsplash.com 动态 URL**: 适合 fallback 救急场景, 不适合长期方案 (有 ~200ms 跳转延迟, Unsplash 限流风险). 长期靠 TICKET-086 真实图填 dishes.image_url.
- **撞图率下限**: 受池命中分布制约. chicken 35 道分 25 张 → ⌊35/25⌋+1=2 平均共享, 已是 hash 下限. 要再压必须按 (cuisine, ingredient) 双轴拆 chicken 池 (e.g. korean_chicken / sichuan_chicken / western_chicken), 但本轮不做.
