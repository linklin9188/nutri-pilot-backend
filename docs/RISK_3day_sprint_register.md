# RISK_3day_sprint_register.md — 3 天 sprint 风险登记册

> 范围：2026-05-19 晚 → 2026-05-22 晚（明早 UI 全新版上线 + Day 2 ChatAgent + Day 3 节庆/库存）
> 作者：Architect（通宵第 2 轮 23:15 HKT 起草）
> 与之并行：B6 PROD_monitor_metrics.md 给出每条风险的可观测指标

---

## §0 风险等级

| 等级 | 含义 |
|------|------|
| 🔴 P1 | 用户可见故障 / 数据丢失 / 上线后必须立即 revert |
| 🟠 P2 | 数据/功能降级，可在 1-2h 内 hotfix |
| 🟡 P3 | 体验微变，无功能影响，可观察期内不修 |
| 🟢 P4 | 已识别但本 sprint 不修，立项后续 |

---

## §1 已上线风险（2026-05-19 晚已落地，明早自动生效）

### R-01 🟠 ALGO_VERSION v37 → v40 触发全用户 user_weekly_menus stale
- **来源**：commit 4a6ae80 (Smell 1 阶段 2)
- **触发条件**：所有现存用户首次刷新 Home / WeeklyMenu
- **后果**：重生成 1-3 秒 spinner，generateWeekPlan 同步计算 + DB upsert × 14 行
- **缓解**：Smell 4 双列校验（algo_version + cache_key）已让 stale 行被识别为重生成而非空白
- **缓解状态**：✅ 已就位（Smell 4 闭环 + v40 同期上线）
- **监控**：用户首屏 spinner 时长 > 5s 触发告警
- **OWNER**：Algorithm

### R-02 🟠 删除 useRecommendDishes / scoreDish 链路 — Home 首屏体验微变
- **来源**：commit 4a6ae80
- **触发条件**：用户在 weeklyMenu 未生成时打开 Home（首次进 app / 缓存失效）
- **后果**：午晚 tab skeleton 1-3s（之前是即时 fallback 到 useRecommendDishes 的当日菜）
- **缓解**：Smell 1 阶段 1 已铺垫（Home 永远从 weeklyMenu 读），阶段 2 仅完成清理
- **缓解状态**：✅ 已就位
- **监控**：weeklyLoading 时长分布，p99 < 3s
- **OWNER**：Algorithm + UI

### R-03 🟡 Smell 1 阶段 2 breakfast / fruit 行缺失被判 stale
- **来源**：commit 4a6ae80（generateWeekPlan 输出新增 breakfastDishes + fruitDish 字段）
- **触发条件**：v37 老 cache 行不含 breakfast/fruit 行 → loadFromDB 判 stale
- **后果**：强制重生成 — 与 R-01 行为一致，预期内副作用
- **缓解**：Algorithm 在 commit message 已标注"v37 老 cache 不会被读出来当 v40 用"
- **缓解状态**：✅ 设计预期
- **OWNER**：Algorithm

### R-04 🟠 Sigmoid 学习曲线改变现有用户偏好权重
- **来源**：commit 56a7e6b
- **触发条件**：每次 scoreForWeek 评分（generateWeekPlan 每次调用）
- **后果**：30 信号阈值老用户 weight 从硬性 1.50 → 平滑 1.34（小幅下降），新用户 weight 从 0.35 起更快攀升（n=15 即 1.07）
- **缓解**：CLAUDE.md SOP 已记录"使用数据 > 画像数据"原则，sigmoid 是这条原则的工程化
- **缓解状态**：✅ 设计预期，行为符合产品方向
- **监控**：菜单生成时用户 prefScores 命中率（B6 详）
- **OWNER**：Algorithm

### R-05 🟡 周五放纵日 cook_method=deep_fry +0.20 可能拉高周五油炸频次
- **来源**：commit d0cebf9
- **触发条件**：周五 generateWeekPlan
- **后果**：周五晚餐有较高概率出现炸物（炸鸡 / 炸鱼 / 锅包肉）
- **缓解**：仅 +0.20，不强制；scoreForWeek 仍有 9 个其他 axis 共同决定
- **缓解状态**：✅ 设计预期
- **OWNER**：Algorithm

### R-06 🟠 026 employer_id uuid → text 迁移可能影响订阅 / Stripe 历史数据
- **来源**：commit 71bfc18
- **触发条件**：任何读 households.employer_id 与 user_profiles.id 关联的代码
- **后果**：cast 后 text uuid 字符串相同，理论无影响；但若有代码硬假设 uuid 类型（如 `.eq('employer_id', someUuidObject)`）会失败
- **缓解**：_archive_households_pre_p6 (85 行) 完整备份，单事务 + dry-run 已过；Architect 复审 §1 PASS
- **缓解状态**：✅ 备份就位，回滚预案在 026 commit
- **监控**：households read/write 错误率
- **OWNER**：Database

### R-07 🔴 helper_reviews.helper_id (uuid) ≠ household_members.helper_id (text) 跨表不一致
- **来源**：026 commit message 自报 + Architect §1 立项 P10
- **触发条件**：任何 JOIN helper_reviews ↔ household_members 的查询
- **后果**：JOIN 失败 → review 列表为空 / 评价提交失败
- **缓解**：当前生产无此 JOIN 调用（grep 待 Backend §B 跑），但 Day 2/3 引入 review 功能时会撞
- **缓解状态**：⏸ P10 立项中，建议 Day 2 之前修
- **OWNER**：Database

### R-08 🔴 user_feedback 表未上线 — UI Day 1 三件套数据零落库
- **来源**：UI commit 5c7fe25 + ff77778 写入但表不存在
- **触发条件**：用户操作 HelperCook 反馈按钮 / Home 菜评分
- **后果**：silent retry 吞错 → UI 显示 ✓ "已记录"，但 DB 实际零数据 → 数据飞轮今晚零起步
- **缓解**：UI silent retry 不暴露错误，用户体验无降级；但**数据飞轮启动延迟到 027 上线**
- **缓解状态**：🔴 阻塞 — **建议 CEO 立刻派 Database 027 工单**（user_feedback 表 schema 在 UI response 已给出）
- **OWNER**：Database (027 派单待 CEO)

### R-09 🟡 西湖醋鱼 + 佛跳墙 加入 dish pool 改变周一周三海鲜规则抽样分布
- **来源**：Database §C 5 道菜（实际新增 2 道）
- **触发条件**：generateWeekPlan slot 1 (main_protein) 抽样
- **后果**：jiangnan origin 海鲜菜池子从 N → N+1（西湖醋鱼），seafood origin 池子从 N → N+1（佛跳墙）
- **缓解**：scoreForWeek 9-axis 评分 + weightedRandom，不会单道菜垄断
- **缓解状态**：✅ 设计预期，新菜进入正常抽样
- **OWNER**：Algorithm（间接）+ Database（直接）

### R-10 🟡 5 道菜中 3 道（麻婆豆腐 / 白切鸡 / 锅包肉）已存在被 Database 跳过
- **来源**：Database §C 自主裁断
- **后果**：CEO 工单字面"5 道全新菜"未严格完成 — 但实际 DB 已有这 3 道，重复 INSERT 反而污染
- **缓解**：Architect 同意决策（详 §1）；Day 2/3 若需要"5 道新菜"应明确指定 spec 差异化
- **缓解状态**：✅ 已与 Architect 沟通
- **OWNER**：Database + Product

### R-11 🟢 麻婆豆腐 DB 重复 2 行
- **来源**：P12 立项
- **后果**：generateWeekPlan 抽样时麻婆豆腐有 2x 概率被选
- **缓解**：本 sprint 内无影响（推菜还是单道），但 Day 3 前修
- **状态**：P12 立项

---

## §2 待上线风险（5/20-22）

### R-12 🟠 Backend §A B-2 未启动 — Home.tsx:494 PostgREST 嵌入仍报 400
- **来源**：Backend response 21:45 仍是阻塞旧版
- **触发条件**：每次 Home mount
- **后果**：4 个 PostgREST 400 持续出现（家庭成员 widget 显示空 — 用户可见缺陷）
- **缓解**：B-1 + B-2 已上线后即可，Backend tab 应被唤起做嵌入语法 hint 修复 `user_profiles!helper_id(display_name)`
- **缓解状态**：⏸ 待 Backend 第 2 轮
- **OWNER**：Backend

### R-13 🟠 Day 2 ChatAgent MVP 引入新接口冲突
- **来源**：B2 SPEC 待起草
- **风险**：3 候选 generateWeekPlan 调用 + parse-intent 上量 + Gemini proxy 流式输出
- **缓解**：B2 SPEC §0 提前列接口契约
- **状态**：⏸ B2 起草中（本轮通宵）

### R-14 🟠 Day 2 user_feedback → 步骤生成 prompt 回流 pipeline
- **来源**：B3 SPEC 待起草
- **风险**：feedback 数据回流到 Gemini system prompt 增加 token 消耗 + 隐私边界
- **缓解**：B3 SPEC 详
- **状态**：⏸ B3 起草中

### R-15 🟡 Day 2 家庭食材库存 vs 推菜算法 inventory bias
- **来源**：B4 SPEC 待起草
- **风险**：用户标记"我家有"的食材进入 scoreForWeek 加分维度，可能让用户每天看到同样菜
- **缓解**：B4 SPEC 给出 bias 上限 (+0.30) + 防垄断逻辑
- **状态**：⏸ B4 起草中

### R-16 🟡 Day 2 7 节庆 028 migration 需 5-15 道节庆菜
- **来源**：B5 SPEC 待起草
- **风险**：批量 INSERT dishes 时若有失败需小批量原则
- **缓解**：B5 SPEC 强制 3-5 道分批
- **状态**：⏸ B5 起草中

---

## §3 跨 cutover 风险（多个 commit 联动副作用）

### R-17 🔴 Algorithm v40 + UI 5 commits + Database 025/026 同期上线复合效应
- **触发**：5/20 凌晨 Railway 部署完成后
- **复合后果**：
  - 所有 user_weekly_menus 行被判 stale（v40 + cache_key 不匹配）
  - 同时 households + household_members 类型迁移生效
  - 同时 Home.tsx 5 处视觉改动生效
  - 同时 HelperCook + VerifyIngredients 改动生效
  - 一个用户首次访问会触发全套副作用串行
- **缓解**：Smell 4 双列校验 + 各 commit 独立 push + Architect 每个 commit 已实测 invariant
- **状态**：✅ 但建议 CEO 上线后第一小时高频抽测（5 个 P-条 + 三件套 + 菜单生成）
- **OWNER**：CEO（手工抽测）

### R-18 🟠 整夜 Railway 部署窗口可能撞上凌晨用户访问
- **触发**：每个 commit 触发一次 Railway 滚动部署
- **后果**：用户可能在部署期间访问命中部分新部分旧
- **缓解**：Railway 滚动部署有 health check，撞期概率低
- **状态**：✅ 默认信任 Railway
- **OWNER**：CEO（监控 Railway 部署状态）

---

## §4 立项清单（已上报，本 sprint 不修）

| ID | 描述 | 优先级 | 建议时机 |
|----|------|--------|----------|
| P10 | helper_reviews.helper_id 跨表类型不一致 | 🔴 P1 | Day 2 之前 |
| P11 | dishes 表 health-tag 列缺失 vs CLAUDE.md | 🟠 P2 | Day 3 之前 |
| P12 | 麻婆豆腐 DB 重复 2 行 | 🟢 P4 | 本 sprint 后 |
| P13 | xiaomei_compatible 字段一致性 | 🟢 P4 | 本 sprint 后 |
| P14 | Gemini retry exponential backoff | 🟢 P4 | 见 Backend §B-3c |
| P15 | Stripe webhook Dashboard 状态核对 | 🟠 P2 | CEO 手动 |
| P16 | CLAUDE.md / CLAUDE_BACKEND.md 4 处描述与生产不符 | 🟡 P3 | Day 1 收口 |

---

## §5 监控指标 → 见 B6 PROD_monitor_metrics.md

每条风险的可观测指标 + 阈值 + 告警机制在 B6 详细给出。本登记册仅列风险点，B6 给观测层。

---

## §6 给 CEO 的紧急建议（按风险 P1 排序）

1. **R-08 (027 表)** — 立即派 Database 工单建 user_feedback schema，UI Day 1 数据飞轮明早才能起步
2. **R-12 (Backend §A)** — 切到 Warp Backend tab 看是否已读到 B-1 上线信号，未读则手动唤起
3. **R-07 (P10)** — Day 2 启动前修，否则 review 功能撞墙
4. **R-17 (复合上线)** — 明早 Railway 部署完成后第一小时抽测全套
