# TICKET-101 现代化菜单 500 道 (5/28 老板拍板)

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
- ❌ 不真爬 Foodpanda / 大众点评 (法律风险 + 工程重)
- ❌ 不接外部 API (米其林 / OpenRice 商务合作)
- ❌ 不做菜品图片版权交涉 (Gemini 生图自有)
- ❌ 不修改老菜 (只补新菜)

## 5. 数据生成策略
**用 Claude / Gemini LLM 知识库生成**（不爬, 不抓 UGC）:
- LLM 知道黑珍珠 / 米其林 / 茶餐厅常见菜单
- 一次性出 500 道清单 (name + cuisine + main_ing + prep/cook time)
- 过滤 cook_time > 60 + 非汤
- INSERT 到 dishes 表 source='ticket-101-modern-batch'
- 走现有 pipeline 补 steps + nutrition + image

## 5b. 菜名命名规则 (老板 5/28 拍板, 产品哲学级)
**网红 / 一饭封神风格** — 菜名引发食欲, 理解人类心理:
- ✅ 故事感: "老灶" / "外婆" / "三代传承"
- ✅ 数字 (具体可信): "8 小时慢炖" / "180℃ 黄金脆" / "30 年老卤"
- ✅ 场景: "深夜食堂" / "街角小馆" / "外婆家厨房"
- ✅ 工艺词: "现切" / "现包" / "现剥" / "手撕" / "古法"
- ❌ 避免: "美味的" / "好吃的" (空洞形容词)
- ❌ 避免: 太 cheesy 水军风 ("人间美味" "回味无穷")
- ❌ 避免: 营销夸张 ("绝绝子" "yyds")

**示例对比**:
| 老菜名 | 网红改造 |
|---|---|
| 红烧肉 | 老灶 8 小时慢炖五花 |
| 番茄炒蛋 | 现剥番茄滑蛋 |
| 蒸蛋羹 | 滑嫩冷泉水蒸蛋 |
| 鸡腿 | 古法盐焗手撕鸡 |
| 麻婆豆腐 | 现舂花椒麻婆豆腐 |
| 鱼香肉丝 | 三十年老坛鱼香肉丝 |

**LLM prompt 加 directive**: "请用'外婆家'/'深夜食堂'/'老灶'/'8小时'/'现剥'
这种引发食欲的命名风格, 像一饭封神/小红书爆款菜名". 但每道菜的故事不要重复
(每道有自己独特词), 不能水军风.

## 6. 验收标准
- DB query 验证: source='ticket-101-modern-batch' 行数 ≥ 450 (允许 10% 失败)
- 每道菜都有 image_url (不能 NULL)
- 每道菜都有 nutrition 数据
- 每道菜 prep + cook ≤ 60 min (汤类豁免)
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
