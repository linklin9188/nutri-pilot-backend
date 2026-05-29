# TICKET-101 现代化菜单 500 道 (5/28 老板拍板 v3)

## v3 重大修正 (5/28 老板批改)
- ❌ v2 §5b "网红命名规则" (LLM 造 30年老卤/180℃/8小时 前缀) **全废**
- ❌ v2 §4 "不爬 Foodpanda 法律风险" **推翻** → v3.1 又推回 (爬不动)
- ✅ 新铁律 (依然): **不准 LLM 造 marketing 前缀 / 不准虚构工艺词**
- ✅ 新铁律: **菜名 ↔ steps_json 必须 1:1 一致** — 菜名里出现的工艺 / 时间 / 原料必须能在 steps 里找到
- ✅ 已 INSERT 的 20 道伪网红菜全删

## v3.1 工具层撞墙后再调 (5/28 17:00)
- ❌ 大众点评黑珍珠 = 必须登录才看 (302 → login)
- ❌ 米其林指南 = Cloudflare 403 给 WebFetch
- ❌ 餐厅官网 = JS 单页应用 (curl 114 bytes)
- ✅ **务实路径**: LLM 列"真实经典菜名" (不是编 marketing, 而是从 LLM 知识库取 "蜜汁叉烧 / 葱油拌面 / 宫保鸡丁" 这种存在了几十年的真实菜)
- ✅ spot check: 抽 10% 用 WebSearch "<菜名> 餐厅" 反查, 必须能找到真实餐厅在卖
- ✅ 区分 v2 错误 vs v3.1 合规: 
  - v2 错: "180℃ 黄金脆芝士西多" — marketing 前缀 + 虚构温度 = 编
  - v3.1 OK: "芝士西多士" — 茶餐厅真实菜, LLM 知识库可信

## 1. 用户故事
作为在港大陆雇主，我希望菜单里有**现代化中餐**（黑珍珠/茶餐厅级别），不再
"全是老化家常菜"。算法推荐时优先现代菜，让我家菜单"看起来像 2026 年"。

## 2. 痛点对齐 (老板 4 件事)
- [x] #2 每天吃什么 — 菜单老化是首位痛点
- [x] #1 菲佣做美味中餐 — 黑珍珠/茶餐厅级别菜品挑战菲佣手艺
- [ ] #3 物美价廉买肉 — 不涉及
- [x] #4 用户舒服 — 看到新鲜菜单不审美疲劳

## 3. Scope (in)
- 500 道现代化中餐菜，分布:
  - **300 道香港现代**: Foodpanda HK / 茶餐厅 / 港式茶档 / 新派粤菜
  - **200 道大陆黑珍珠**: 黑珍珠前 100 家 × 平均 2 道招牌菜
- 时间约束 (老板拍板):
  - **prep + cook ≤ 60 min** (硬上限)
  - **理想 ≤ 30 min** (优先)
  - **汤类豁免** (可以 > 60 min, 因为汤本来要炖)
- 数据维度: title_zh / title_en / main_ingredient / origin_cuisine / course_type
  + prep_steps_json + cook_time_min + nutrition + image_url
- 走现有 seed pipeline (gen-dish-steps / nutrition / images)
- bump ALGO_VERSION (新菜立刻进 pool)

## 4. Non-scope (out)
- ❌ 不接外部商务 API (米其林 / OpenRice 商务合作)
- ❌ 不做菜品图片版权交涉 (Gemini 生图自有)
- ❌ 不修改老菜 (只补新菜)
- ❌ **LLM 造菜名 / 造工艺前缀** (v3 新增, 5/28 老板拍板)

## 5. 数据生成策略 (v3 改: 爬, 不造)

**核心**: 真实菜单菜名 → LLM 整理结构 → 步骤一致性校验

**数据源** (按可信度排序):
1. **黑珍珠官网** (https://www.dianping.com/diamond/) — 大陆 100 家招牌菜公开页, 信息密度最高
2. **米其林指南公开页** (guide.michelin.com/hk-mo) — 香港米其林 / 必比登推介, 公开介绍
3. **OpenRice 香港** — 港式茶餐厅 / 大排档 / 港式酒家公开菜单页
4. **餐厅官网** — 翠华 / 太兴 / 大家乐 等连锁公开 menu PDF
5. **Foodpanda HK** 公开 listing 页 (用 WebFetch, 不绕反爬)

**Pipeline**:
1. **爬** (WebFetch / WebSearch) → 拿到真实 (餐厅, 菜名, 简介) 数据 → 存原始 raw JSON
2. **LLM 结构化** (Gemini): 给 LLM 真实菜名 + 餐厅, 让它 **只做** translate / 推断 main_ingredient / 推断 origin_cuisine / 估算 prep+cook time
3. **过滤** cook_time > 60 + 非汤
4. **写 steps_json** (Claude): input = 真实菜名, 要求 steps 必须 cover 菜名里所有工艺 / 时间 / 原料词
5. **一致性自检**: 菜名里每个修饰词 (如 '蜜汁' / '现剥' / '葱油') 都在 steps 文本里 grep 命中, 不命中即 reject 重写
6. INSERT 到 dishes 表 source='ticket-101-modern-batch-v3'
7. 走 nutrition + image pipeline

## 5b. 菜名规则 (v3 重写, 5/28 老板拍板)

**铁律**: 用爬来的**真实菜单菜名**, 不许 LLM 造词 / 贴形容词前缀.

**允许**:
- 直接用真实菜单上的菜名 (如菜单写"蜜汁叉烧"就是"蜜汁叉烧")
- 必要时 LLM 翻译 zh ↔ en (但不允许加营销词)
- 如果真实菜名本身就有故事感词 (如菜单上真叫"外婆红烧肉"或"深井烧鹅") → 保留原样

**禁止**:
- ❌ LLM 自加前缀: "180℃" / "30 年老卤" / "8 小时慢炖" / "三代传承"
- ❌ LLM 自加工艺词: 菜单不写"现剥" 不许 LLM 加"现剥"
- ❌ "网红改造" — v2 表里的所有改造都是错的, 全废

**一致性硬规则** (steps_json 写完后必须自检):
- 菜名里每个名词 / 工艺词 / 时间词 → 必须在 steps 文本中能 grep 到对应步骤
- 例: 菜名 "蜜汁叉烧" → steps 必须有"刷蜜汁"或"涂蜜汁"动作; 菜名 "葱油拌面" → steps 必须有"葱油" + "拌面"
- 不一致 → reject 重写 (最多 2 轮重试, 否则该菜 skip + log)

## 6. 验收标准 (v3 加一致性)
- DB query 验证: source='ticket-101-modern-batch-v3' 行数 ≥ 450 (允许 10% 失败)
- 每道菜都有 image_url (不能 NULL)
- 每道菜都有 nutrition 数据
- 每道菜 prep + cook ≤ 60 min (汤类豁免)
- **菜名 ↔ steps_json 一致性 100%** — 抽 20 道随机 grep 验证, 菜名里所有名词/工艺词必须在 steps 中命中
- **真实性 spot check** — 抽 10 道在 Google / 大众点评搜菜名, 必须能找到至少 3 家餐厅在卖
- 雇主真测: 进 /weekly 看一周菜单, 应看到 30%+ 是新菜 (跟旧菜对比)
- ALGO_VERSION bump 后, 用户进 Home 自动重新生成菜单

## 7. 不变量
- 不动 user-facing schema (dishes 表加行不加列)
- 不动 RLS
- 失败菜不阻塞 (skip + log)
- Gemini quota 耗尽时 graceful degrade (能 ship 多少算多少)

## 8. 预算
- LLM cost: ~$25 (500 道 × $0.05 全 pipeline)
- 时间: 3-5 小时 (并行跑)
- 失败重试预算: 2 轮 (handle Gemini high-demand)

## 9. 立刻派 Agent 执行
派 background Agent (general-purpose) 跑全 pipeline. 老板可随时 abort.
