# SPEC — v3 Phase 2: 菜单数据库扩容 + 全字段填充

> Phase 1（v3 onboarding 重设计 — UI 079 / Algorithm 073 / Database 069）完工后立即派。
> 老板原话："优化完这个 onboarding 然后同步优化菜单数据库和算法。"

## 背景

v3 onboarding ship 后，9 个新 axes 驱动 scoreDish。但配套需要：
1. **dish 池子足够大** — 9 axes 组合空间巨大（4×4×5×4×4×4×4×3×4 = 千万级组合），需 1000+ 道 dishes 才能让每个组合都有 ≥5 道推荐
2. **dish metadata 完整** — protein_main_class / oil_level / cooking_method / beef_style 等字段必须**每道菜**都填，不是 grep 兜底
3. **image_url 覆盖率** — onboarding 用菜品图，dishes 表 image_url 必须 100% 覆盖

## 当前现状（Algorithm 071 实查）

- dishes 总数：~1000+ 道（估）
- image_url 覆盖：~50%（071 报告）
- 早餐池：117 道（充足）
- 午晚池：未实查（Phase 2 §A 先 SQL）
- v3 metadata（protein_main_class / oil_level / cooking_method）：Database 069 §D backfill 后 100% 覆盖（grep 兜底）

## Phase 2 派单清单（4 棒并行）

### Database 070 — dishes 扩容到 1500+ + metadata 精细化

1. 实查 dishes 总数 + 各 cuisine 分布 + image 缺口
2. INSERT 经典菜补足：
   - 川菜 +50（小炒黄牛肉 / 麻婆豆腐 / 水煮鱼 / 干煸豆角 etc.）
   - 粤菜 +50（白切鸡 / 蜜汁叉烧 / 清蒸鲈鱼 / 例汤系列 etc.）
   - 江浙 +30（红烧肉 / 西湖醋鱼 / 龙井虾仁 etc.）
   - 北方 +30（手抓羊肉 / 锅包肉 / 拍黄瓜 etc.）
   - 西餐 +30（牛排 / 沙拉 / 意面 / 三明治 / brunch 配套）
   - 港式 +20（菠萝包 / 蛋挞 / 杨枝甘露 / 港式奶茶餐 etc.)
3. INSERT 仅核心字段（title_zh/en / origin_cuisine / meal_type / course_type / protein_main_class / oil_level / cooking_method）
4. image_url 留 Backend pipeline 跑生成

### Backend 070 — dish seed pipeline 完整跑

CLAUDE.md "Dish seed pipeline" 4 步：
1. scripts/gen-dish-steps-claude.ts — 给所有新 dishes 生成 cook steps
2. nutrition fill — Gemini 推断 protein_g / calcium_mg / iron_mg / etc.
3. 小美 ABCD tray tagging — Algorithm 给每道菜分 A/B/C/D tray
4. image_url generation — AI 生成或 stock photo curate

Backend long-running 跑 24h 完成。

### Algorithm 074 — scoreDish 二次精调（v46）

基于 Phase 1 v45 真用户数据反馈：
1. 调权各 axes（如果某 axis 实际预测力弱 → 降权）
2. 加 collaborative filtering 信号（其他相似用户喜欢的菜）
3. 多目标 goal 评分（之前 goal[0] 单值，扩到 goal[] 数组广度求和）
4. 多 hometown 评分（同上）
5. bump ALGO_VERSION v45 → v46

### CEO — 真用户 A/B 数据分析

Phase 1 v3 ship 后给 5-10 朋友试 1 周：
- 收集 weeklyMenu 推荐 vs 实际选择（哪些菜被换 / 被踢）
- 哪些 axis 真正驱动选择，哪些 axis 无效
- 数据驱动 Algorithm 074 调权方向

## ship 顺序

1. Phase 1（v3 onboarding 11 题 + 9 axes + schema）→ 完工
2. β 内部 1 天测试（CEO + 老板真测 2 用户对比）
3. Phase 2 Database 070 + Backend 070 并行（24h pipeline）
4. β 公开 5-10 朋友测 1 周
5. Phase 2 Algorithm 074 数据驱动调权
6. Phase 3（未来）：collaborative filtering + 用户 feedback 主动学习

## 不动事项

- 不删 v45 ALGO_VERSION（v46 可回退到 v45 通过 git revert）
- 不删 onboarding v3（v4 升级时保留 v3 fallback）
- 不动 wechat-jssdk / Cloudflare Email Routing / OG 卡片基础设施
