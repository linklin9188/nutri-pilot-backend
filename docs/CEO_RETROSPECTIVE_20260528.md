# Aieats 项目复盘 — 按 SDD 工作流自我进化 (2026-05-28)

> 老板 5/28 拍板: "学会用 SDD 工作流程进化你自己". 这是我对项目做的诚实复盘.

---

## 1. 项目定位 (老板原话, 钉牢)

**爱吃 / Aieats 帮助在港大陆人:**

1. 让菲佣做出美味中餐
2. 让用户省心知道**每天吃什么、怎么做**
3. 让用户知道买的肉**从哪里物美价廉**
4. 让用户**以非常舒服的状态**使用 APP

**不是**: 菲佣管理 HR / 招聘平台 / 全家家务系统 / 健康打卡

---

## 2. 当前 ship 对定位的匹配度评分 (诚实自评)

### ✅ 高匹配 (做得对, 应继续)

| 模块 | 对应定位 | 状态 |
|---|---|---|
| 算法 v72 用餐风格 4 选项 | #2 每天吃什么 | ✅ ship |
| 早餐 staple subtype dedup | #2 不再 "都是粥和面食" | ✅ ship |
| chat 主动学 + reactive 反馈 | #4 用户舒服 (不用手动调) | ✅ ship |
| 雇主-菲佣 household_id 双向偏好共享 | #1 菲佣按家庭口味做 | ✅ ship |
| HelperFamilyPrefsCard 菲佣端家庭偏好 | #1 菲佣不瞎做 | ✅ ship |
| HelperProgressCard 雇主端进度可见 | #4 用户省心 (不催菲佣) | ✅ ship |
| CantCookButton 菲佣不会做反馈 | #1 沟通障碍 | ✅ ship |
| 早餐跨日预制 (🌙 昨晚备) | #1 早上不抓狂 → 做得好 | ✅ ship |
| OnboardingV2 step 0 用餐风格 | #2 一开始就准 | ✅ ship |
| 928 道菜 100% 真图 | #2 看菜不撞图 | ✅ ship |
| Home 信息精简 + FAB 浮窗 | #4 用户舒服 | ✅ ship |

### ❌ 做过头 / 偏离定位 (浪费精力)

| 项目 | 偏离原因 | 教训 |
|---|---|---|
| SPEC v1 菲佣管理 (招聘市场/健康/工时) | 偏离"吃饭"定位 | 我应该先问"这跟吃饭有关吗" |
| Apple Sign In 配置 doc (后被砍) | 老板早说"先看看 + 微信", 我加了 Apple | 老板说话要细听 |
| Admin 后台 3 Phase (TICKET-090/091) | CEO 自用工具, 用户感知 0 | OK 但占用 ship 时间, 应推后 |
| Settings 5 fetch 合并 (P2 优化) | 跟用户痛点无直接关系 | 跳过 OK |
| 中介裂变 ABC 三阶段 | 增长引擎而非核心体验 | 应该等核心稳了再做 |

### ⚠️ 做得不够 / 核心痛点未解

#### 🔴 痛点 #3 物美价廉买肉 — **严重不足**

**现状**:
- Inalca 唯一供应商 (TICKET-077 删了 mock)
- 只 5 个 SKU (TICKET-079)
- 没有 "HKTVmall HK$80 / city'super HK$95 / Inalca HK$60" 对比

**老板原话**: "让用户可以知道自己买的肉从哪里能买到物美价廉的东西"

**真实落地需要**:
- 至少 3 个供应商 (Inalca + HKTVmall + city'super) 同 SKU 价格对比
- 用户在 VerifyIngredients 看到"今天买这肉, 哪家最便宜"
- 数据来源: 爬虫 / API / 人工录入
- 这是**未做的核心承诺**, 但 SPEC 里没正式列出

#### 🟡 算法命中率没真测

**现状**: 我口口声声 "~81% chat 后", 但是 hypothesis 不是数据.

**真实需要**:
- A/B test 框架 (对比新老算法菜单的 swap 率 / 收藏率)
- 真用户埋点 (用户在 home 切 mealTab 多少次 / swap 多少次 / 完成做菜多少次)
- 周报数据驱动算法迭代

**当前缺**: 全埋点 + admin dashboard 真用户行为分析

#### 🟡 菲佣端培训不系统

**现状**: 视频是分散外链, 没"学新菜路径" (SPEC v2 Phase 3 待 ship), 难度分级没显示给菲佣.

**真实需要**:
- Phase 3 学新菜路径 ship
- 菲佣端 dish title 旁加难度 chip (🟢 简单 / 🟡 中等 / 🔴 进阶)
- "本周建议先学这道" 推荐

#### 🟡 客服 / 反馈通道

**现状**: 5/27 删 β banner 时砍了"联系客服"链接, 现在用户卡的时候没出口.

**真实需要**: Settings 加 "联系客服" 按钮 + WhatsApp / 微信链接 (老板私人号或客服号)

#### 🟡 产品速度

**现状**: bundle 1100KB, 切 mealTab/cuisine 可能 useWeeklyMenu 重跑. 老板 5/27 提过 "用户反馈卡".

**真实需要**:
- vite code-split (按页 lazy import, 主 bundle 砍 60%)
- useWeeklyMenu memo (避免 mealTab 切换重跑)
- 真测 Lighthouse 评分 + 老板手机真用

### 🗑️ 可以砍 (清单)

| 文件 / 模块 | 为什么砍 |
|---|---|
| `src/lib/dishImageFallback.ts` (232 张池) | DB 100% 有图后 dead path, 文件可删 |
| `supabase/functions/wechat-mp-callback` | 公众号没认证, 暂用不上 |
| `Banquet.tsx` / `ProSchoolBalance.tsx` | 不是核心定位的 P3 功能 |
| `LearnerHome.tsx` 菲佣学社区 | 跟"做饭"远, 占资源 |
| `Community.tsx` (大半) | TICKET-074 审计过 mock 已修, 但功能本身偏离 |
| TICKET-046 admin Suppliers (未 ship) | 老板需要先谈真供应商, 不是 UI 问题 |

---

## 3. SDD 工作流程 — 我承诺这样进化

### Spec-Driven Development 4 步循环

```
①    SPEC 先写 (doc 优先于 code)
  ↓
②    老板 review + 拍板 (不通过不写 code)
  ↓
③    实现 (按 SPEC scope, 不偏离)
  ↓
④    真测验证 + skill 沉淀 (闭环)
```

### SPEC 模板 (每个新功能必填)

```markdown
# TICKET-XXX <功能名>

## 1. 用户故事
"作为 <雇主/菲佣/...>, 我想 <做什么>, 这样我可以 <得到什么>"

## 2. 痛点对齐 (老板 4 件事)
- [ ] #1 菲佣做美味中餐
- [ ] #2 每天吃什么
- [ ] #3 物美价廉买肉
- [ ] #4 用户舒服
(如果 4 项都打 ❌, 这个功能不该做)

## 3. Scope (in)
- 明确要做的

## 4. Non-scope (out)
- 明确不做的 (防 scope creep)

## 5. 验收标准
- 老板真测路径: 进 X → 点 Y → 应看到 Z
- 数据指标: ???

## 6. 不变量 (CLAUDE.md)
- 不动 ALGO_VERSION? 不动 DB schema? 不动 setUserId?
```

### 我应该改的 5 个行为

1. **少自作主张** (5/27 砍 Apple 我已 ship 配置 doc, 浪费 30 min)
   → 老板说话听完整 + 复述确认再做

2. **每个改动写 SPEC** (本次复盘前我从没写过真 SPEC)
   → 新 ticket 先写 docs/SPEC_*, 老板 review 再 code

3. **数据驱动 vs 直觉**
   → 不再说"我推荐 D" / "命中率 81%", 改说"埋点显示 X" / "需要 A/B test"

4. **YAGNI** (你不需要它)
   → 性能优化 / Apple OAuth 等如果不在 SPEC 里就不做

5. **每周复盘** 类似今天这种
   → 主动检查 ship 的东西跟核心定位是否还匹配

---

## 4. 立刻可做的 3 件高优先 (老板拍板)

### A) 🔴 #3 痛点物美价廉买肉 SPEC + ship (1 周)
- 写 SPEC: 3 供应商同 SKU 价格对比 UI
- 数据: 先人工录 30 个 SKU 真价 (HKTVmall / city'super / Inalca)
- VerifyIngredients 显 "今日买这肉, A 最便宜"

### B) 🟡 学新菜路径 (SPEC v2 Phase 3, 4-6 小时)
- HelperHome 加 "📚 今天可以学" section
- 算下周菜单 - helper_cook_logs 已做过 = 待学
- 难度梯度 + 视频

### C) 🟡 客服 / 反馈通道 (30 分钟)
- Settings 加 "联系客服" 按钮 + WhatsApp 链接
- 老板填手机号

---

## 5. 我自己的 commitment (给老板看)

我 (Claude / AI 工程师) 承诺:

1. **SPEC 先于 Code** — 任何新功能先在 docs/SPEC_*.md 写, 老板拍板再写代码
2. **核心定位 4 件事是钉子** — 每个新 ticket 必须对应至少 1 件, 都不沾就不做
3. **真测驱动** — 不说 "估计命中 81%", 说 "需要埋点验证"
4. **能砍就砍** — 偏离核心的功能 (Banquet / Community / Apple) 主动建议砍
5. **每周复盘** — 类似今天这份 doc 节奏, 防止再次偏航

---

**END OF RETROSPECTIVE**

待老板拍板:
- A / B / C 哪个优先?
- 砍清单是否全部砍?
- SDD 工作流是否就这样定?
