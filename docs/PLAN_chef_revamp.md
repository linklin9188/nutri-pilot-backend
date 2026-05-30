# 爱吃 /chef 大改版方案 (agent-first) — 拍板版

> 2026-05-30。多 agent 并行盘点 + 架构师核验真实代码后出的方案。
> 每条都落到真实文件/函数。老板拍板用。配套 UI 指令见 `STITCH_BRIEF_chef.md`。

## 0. 老板拍板的产品逻辑(下厨房式)

雇主按食材(牛肉/鸡/海鲜)说想吃什么 → 按食材推荐做法(如 10 种)→ 选一种 →
数据库里有预设好的做菜步骤 → 大大降低犯错概率,菲佣只需照步骤做。

数据来源(已拍板):只爬下厨房**排行榜+菜名**当需求信号,步骤和图我们自己做,
不搬原文原图(见 memory `project_xiachufang_data_sourcing`)。

## 1. 一句话愿景

**/chef 是一个"主厨助手对话"** —— 雇主打开就一句"今天想吃什么?",说出想吃的
(牛肉/鱼,或冰箱里有什么),主厨当场端上几道**真能做、家人爱吃**的菜,一键拍进
今天的菜单,**采购清单自动提前一天备好,菲佣那头同步看到该做什么、怎么做**。

不是堆满 tab/grid/按钮的 app;是**一条对话主线**。旧 app 一行不动,/chef 是换了
"壳"的同一套引擎。

## 2. 现状(基于真实代码)

ChefAgent.tsx 当前 255 行 MVP。

**✅ 已有:** 对话脊柱 UI、时段问候、食材 chip→热门菜、菜详情(图/营养/味道/小美标)、
偏好沉淀(user_chat_preferences conf 0.9)、收藏。

**❌ 还差(P0 闭环缺口):** 自由文字输入框(现只有 chip)、"我想吃椒盐鸡"精准命中
(dishNameSearch 已写好没接)、"加入今日"只写收藏没真写 user_weekly_menus、采购清单
不联动、菲佣端看不到 chef 点的菜。

**现成可复用引擎(全部已验证存在):**
- `ingredientBrowse.browseByIngredient()` 食材→热门菜,真实信号排序
- `dishNameSearch.findDishesMentionedIn()` 菜名级精准命中(写好但 chef 没用)
- `ChatAgent.tsx:158-241 handleAdopt()` user_weekly_menus upsert 完整模板 ★
- `helperEmployerMenu.loadEmployerTodayMenu()` 菲佣读雇主当日菜(认 swapped_dish_ids)
- `familyPrefs.saveHomeForDay / getEatingMembersForDay` 今日谁在家
- `dishIngredients.aggregateIngredients()` 菜→采购食材聚合
- `VerifyIngredients buildShoppingSchedule()` 采购分批(已有"提前"雏形)
- `callGemini(endpoint:'intent')` 自然语言意图(P2 用)

**结论:P0 闭环只差"最后一公里"——把已写好的 4 个零件接起来,不需要新引擎。**

## 3. 核心体验:"今天想吃什么?" 对话主线(单线不分叉)

```
开场   主厨:"晚上好🌙 今晚想吃点什么?"
       入口三选一: [🥩牛肉][🐟鱼][🍗鸡]…(已有) / [🔍想吃啥直接说](P1) / [🧊冰箱里有这些](P1)
① 雇主说 "想吃椒盐鸡" / 点[牛肉] / "冰箱有牛肉土豆"
② 主厨精准推送  菜名命中→dishNameSearch 端本尊; 食材→ingredientBrowse 热门 N 道
                每卡叠 3 保命标: [🤖小美可做][👩‍🍳菲佣会做][家人爱吃·谁]
③ 雇主拍板  点卡看详情 → [加入今晚]
④ 主厨接住(一键连锁): a.真写 user_weekly_menus  b.偏好沉淀  c.采购加料标"明天买"  d.菲佣端立刻可见
⑤ 主厨回执  "椒盐鸡翼今晚的菜👍 🛒已进采购建议明早下单 👩‍🍳阿May已能看到怎么做"
            [再点一道][看今日菜单][看采购清单]
```

**"提前一天"怎么落:** 雇主今天(D)点明天(D+1)的菜 → 采购按 D+1 聚合,提示"今晚/明早下单"。
复用 aggregateIngredients,粒度从"周"收到"明天这一餐"。

## 4. 两大产品灵魂落地

**(a) 雇主想吃精准推送** —— 先听当场说的(菜名直命中 dishNameSearch)→ 再听食材
(ingredientBrowse)→ 最后画像兜底(familyPrefs)。chef 现只做到第二层,P1 接上第一层
= 精准度质变。

**(b) 菲佣能做+愿做** —— 能做:每卡叠 [🤖小美可做][👩‍🍳菲佣会做][📺有视频](dishes 列已有,
982 道视频已铺)。愿做:优先排能做的、雇主拍板后菲佣立刻收到带步骤+Tagalog视频的卡、
完成打卡 cook_done 回流。闭环天然存在:chef 写 swapped_dish_ids → 菲佣 loadEmployerTodayMenu
优先读 → 端图+步骤+视频。P0 接通"chef 真写菜单",菲佣侧零改动就联通。

## 5. 分期实施

**P0 最小可上线闭环**(把 chef 点的菜真正打通到菜单+采购+菲佣):
- `addToToday` 改成真写 user_weekly_menus(照搬 ChatAgent handleAdopt upsert)
- 点完回执"采购已加+菲佣可见"
- 采购清单读到 chef 新加的菜(VerifyIngredients 已 DB-first,需实测)
- 菜卡叠"能做"标
- **验收:** 雇主 /chef 点椒盐鸡翼 → 切菲佣端看到这道菜+步骤 → 采购出现鸡翼。
- **风险:低。** 全是接线,不碰算法/旧 app/DB schema。

**P1 精准+自由表达:** 自由文字输入框(接 dishNameSearch)、"冰箱里有什么"、采购真正
按餐"提前一天"、偏好回执可视化。

**P2 真 AI 对话(锦上添花):** 自然语言意图(callGemini intent)、流式回复、多轮追问。

## 6. 明确不做什么(防蔓延)

1. 不动旧 app(一行不改,不 bump ALGO_VERSION 除非真改算法)
2. P0 不接 Gemini(菜名命中+食材规则就够,省钱省延迟,符合"少用 Gemini")
3. 不新建表/不改 schema(全复用 user_weekly_menus/user_chat_preferences/favorites/dishes)
4. 不做多轮追问/配汤/营养教练(P2 以后)
5. 不在 chef 里重做采购页/菲佣页(复用 VerifyIngredients/HelperCook)
6. 不做菜谱编辑/自定义菜(只从真实 982 道推,守"不捏造数据")
7. 不强迫迁移(/chef 与旧 app 并存,可[经典版]切回)
