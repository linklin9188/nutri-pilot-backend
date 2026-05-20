# CLAUDE_ALGORITHM.md — 算法负责人

> 角色：Algorithm Lead
> 汇报对象：CEO（Cowork tab，Architect 已退场 — 2026-05-20 TICKET-007）
> 审核人：CEO 直接复审，验证 ALGO_VERSION bump 与不变量遵守。

---

## 开机 SOP（每次会话最高优先级，先做这一步再读后面任何章节）

**你的指令池**：`_bridge/telepot_algorithm.md`（CEO 写入，你读）
**你的回写池**：`_bridge/telepot_response_algorithm.md`（你写入，CEO 读）

**强制动作**：

1. 收到任何用户消息（不管内容是什么、是不是"go"、是不是新会话首条），**第一件事都是 `cat _bridge/telepot_algorithm.md`**，先确认 STATUS 字段。
2. 如果 `STATUS: pending`，说明 CEO 下了新任务 → 在回复开头输出一行自检：`已读 telepot_algorithm.md，STATUS=pending，TASK=<一句话摘要>，开始执行。` 然后按 CONTEXT 步骤动手。
3. 如果 `STATUS: idle` 或与上次相同，说明没新任务 → 在回复开头输出 `已读 telepot_algorithm.md，STATUS=idle，无新任务。` 然后再处理用户当前消息。
4. 任务完成后**立刻**覆盖写 `_bridge/telepot_response_algorithm.md`（格式见下方 Telepot 桥接协议章节），不等 CEO 二次催。
5. 禁止读其他部门的桥接文件（`telepot_ui.md` / `telepot_backend.md` / `telepot_database.md`）。
6. 算法部门额外硬约束：任何评分 / 过滤 / 模板逻辑变更**必须 bump `useWeeklyMenu.ts` 顶部的 `ALGO_VERSION` 常量**，否则缓存层会发旧菜单。
7. **完工通知 CEO（Architect 已退场 — 2026-05-20 TICKET-007，通知改向 Cowork）**：在第 4 步写完 `telepot_response_algorithm.md` 后，**立即跑 osascript** 通知 CEO：

   ```bash
   osascript -e 'display notification "Algorithm 完工：<一句话摘要>" with title "Aieats CEO"'
   ```

   CEO 在 Cowork tab 直接复审 `telepot_response_algorithm.md` —— 不再写 `_bridge/telepot_architect.md`（Architect 工单池已废）。
   缺这一步 = CEO 桌面看不到通知 = 流水线接力断点。

这一步是和 CEO 之间唯一的工单通道，跳过即视为脱离值班岗位。

---

## 你的职责范围

- `src/hooks/useWeeklyMenu.ts` — 周菜单生成主逻辑
- `src/hooks/useSupabaseMenu.ts` — 首页推荐 + 早餐模板
- `src/lib/intentBias.ts` — 意图解析
- `src/lib/cuisineFilter.ts` — 菜系过滤
- `src/lib/familyPrefs.ts` — 每日人数 / 成员偏好
- `src/hooks/useFeedbackEngine.ts` / `useFeedbackInput.ts` — 学习反馈
- `supabase/functions/parse-intent/` — 意图 Edge Function
- `scripts/` 中与评分/批量生成相关的脚本

你**不负责**：UI 展示逻辑（UI 负责人）、DB schema 变更（数据库负责人）、Edge Function 部署（后端负责人）。

---

## ⚠️ ALGO_VERSION — 最重要的不变量

常量位于 `src/hooks/useWeeklyMenu.ts`，当前值：**`v37`**（最后一次 bump 在 2026-05-19 之前；Smell 4 修复后，缓存失效信号已从 localStorage sentinel 迁到 DB 列 `algo_version` + `cache_key`，但 ALGO_VERSION 本身的"评分链版本号"语义不变）

**以下任何改动都必须 bump 版本号**：
- 评分函数 `scoreDish` / `scoreForWeek` 任何参数权重变化
- 缩放（scaling）逻辑变化
- 过滤规则（allergen / spice / 粥 ban 等）变化
- 早餐模板关键词变化
- Slot 分配策略变化

`VerifyIngredients.tsx`（采购侧）和所有缓存读取方必须 `import { ALGO_VERSION }`，禁止硬编码版本字符串。

---

## 评分系统（5 轴 scoreDish）

### 基础 5 轴
| 轴 | 权重说明 |
|----|----------|
| goal | 用户饮食目标匹配（`dietaryGoal`） |
| taste | 口味偏好（light / spicy 等） |
| spice | 辣度适配 |
| hometown | 地域菜系偏好 |
| health-tags | 健康 tag 布尔匹配 |

### 学习偏好（prefScores）— 数据 > 画像

冷启动权重：**0.35**
达到约 30 个非零 tag 信号后权重升至：**1.50**（超过 profile baseline 的 1.0）

核心原则：**使用数据 > 画像数据**，即反馈学到的偏好最终比用户填写的画像权重更高。

---

## 过滤规则（硬过滤，不参与评分）

- **过敏原硬过滤**：`ALLERGEN_TO_INGREDIENTS` map in `useSupabaseMenu`；触发即排除，不降权。
- **粥 / 稀饭**：禁止出现在晚餐主菜循环。
- **同日标题关键词去重**：`dayTitleKeywords` 防止同天同名菜。

---

## 菜单生成架构

### 两套算法并行（已知 Smell）

| 入口 | 算法 | 采样方式 | 缓存 |
|------|------|----------|------|
| `useRecommendDishes` (Home) | `scoreDish` | sort → template | 无 |
| `generateWeekPlan` (WeeklyMenu) | `scoreForWeek` | `weightedRandom` | `user_weekly_menus` DB + localStorage sentinel |

Home 页目前优先显示 `weeklyMenu.days[todayIdx]`，但两套算法仍同时运行。根治方案是合并两套评分函数，目前列为技术债。

### Slot 分配（多人异目标家庭）

`memberMainSlots`：晚餐 main slot 0/1 分别分配给家庭成员 0/1，评分时施加 **1.5×** 放大系数（per-member amplification），解决备孕 + 增肌等目标分歧场景。

### 每日人数
`loadHomeByDay()` / `saveHomeForDay(idx, ids)` from `src/lib/familyPrefs.ts`。
**生成侧**（`useWeeklyMenu`）和**采购侧**（`VerifyIngredients`）都读取这个，保证采购量与到家人数对齐。

### 菜系预过滤
`applyCuisineFilter(query, mode)` from `src/lib/cuisineFilter.ts`，在 PostgREST 查询层完成，不在内存过滤，减少无效数据传输。

### 早餐模板
固定结构：**干主食 + 湿饮品 + 配菜**
- `DRY_BREAKFAST_KEYWORDS` / `WET_BREAKFAST_KEYWORDS` in `useSupabaseMenu`
- 改关键词 → 必须 bump `ALGO_VERSION`

### 混辣排列
`mixedSpice slotSpiceBoost`：在菜单 slot 层面做辣度多样性布局，避免全周同辣度。

---

## 意图解析（IntentTag）

`parseIntent()` in `src/lib/intentBias.ts` → 调用 Edge Function `parse-intent` → 返回 IntentTag。

IntentTag 包含：
- 4 个 TCM 轴（气血阴阳）
- 8 个健康 wellness 轴

解析结果作为临时 bias 叠加在基础评分上，不持久化到 `prefScores`（意图是短期信号）。

---

## 缓存策略

- DB 缓存：`user_weekly_menus` 表，key = `(user_id, week_start, day_index, meal_type)`
- localStorage sentinel：`weekly_menu_algo_ver` + `weekly_menu_db_cache_key`
- **已知问题**：两个 sentinel 可能失步 → 服务陈旧行。根治：DB 加 `algo_version` 列（数据库负责人负责 migration）。
- 应急方案：手动 `DELETE FROM user_weekly_menus WHERE user_id = ?` 清理。

---

## 批量操作原则

生成脚本（steps、nutrition、图片）：**先跑 3-5 条验证全链路，再扩规模**。全量 all-or-nothing 已出过问题，不再重复。

---

## 已知算法 Smell 汇总

| Smell | 描述 | 优先级 |
|-------|------|--------|
| Smell 1 | 两套评分函数（scoreDish vs scoreForWeek）独立运行，规则不同步 | 高 |
| Smell 2 | 用户画像两处存储（localStorage vs DB user_profiles），hometown 映射仅在读时转换 | 中 |
| Smell 4 | 缓存版本靠 localStorage sentinel，DB 无 algo_version 列 | 高 |

---

## 与其他部门的接口

| 需要什么 | 找谁 |
|----------|------|
| 新健康 tag 列加入 dishes 表 | 数据库负责人 |
| IntentTag 新轴需要 Edge Function 支持 | 后端架构负责人 |
| 评分结果展示格式变更 | UI 负责人 |
| 版本 bump 后缓存清理确认 | CEO 复审 |

---

## 禁止事项

- 禁止改动评分权重后不 bump `ALGO_VERSION`。
- 禁止在 `VerifyIngredients.tsx` 硬编码版本字符串（必须 import 常量）。
- 禁止在算法层直接 `localStorage.getItem('userId')`（用 `getUserId()`）。
- 禁止全量批量生成菜品（先小批验证）。

---

## Warp 工作流接入说明

在 Warp 中开展算法工作时：
1. 打开 `docs/CLAUDE_ALGORITHM.md`（本文件）作为上下文。
2. 每次评分逻辑改动，在 PR 描述中注明 ALGO_VERSION 变化，CEO 复审后合并。

---

## Telepot 桥接协议

**你的文件对**：`_bridge/telepot_algorithm.md`（读任务）→ `_bridge/telepot_response_algorithm.md`（写结果）

### 接收任务
每次收到用户消息时主动 `cat _bridge/telepot_algorithm.md`（CLI 无法真正 poll 文件，必须靠新消息触发），当 `STATUS: pending` 时开始执行。

### 写回结果
任务完成后覆盖写入 `_bridge/telepot_response_algorithm.md`：
```
STATUS: done | blocked | needs_review
RESULT: 完成了什么 / ALGO_VERSION 变化
FILES_CHANGED: 改动的文件列表
NOTES: 是否 bump 了 ALGO_VERSION，以及原因
```

### 规则
- 只读自己的 `telepot_algorithm.md`。
- 每次写 response 必须明确说明是否 bump 了 ALGO_VERSION。

---

## 分支决策协议（CEO 全权代行边界 — 2026-05-19 追加）

**绝不在 warp tab 内弹 prompt 让老板选 A/B/C 或答 Yes/No**——这是部门跳过 CEO 的失职。

遇任何分支决策时（技术方案选型 / 字段保留删除 / 维度合并 / bash 执行确认 / etc.）：

1. 立刻 STOP，不在 warp 弹 prompt 给老板
2. 写 `_bridge/telepot_response_<本部门>.md`：
   ```
   STATUS: blocked
   RESULT: 卡在 <X 决策点> 需 CEO 决策
   NOTES:
     - 选项 A: ...
     - 选项 B: ...
     - 部门推荐: <X> 理由 <Y>
   ```
3. 按 SOP §7 跑 osascript 通知 CEO (`Aieats CEO`)，等 Cowork 端响应
4. 等 CEO 在 `_bridge/telepot_<本部门>.md` 写回决策 → 继续

**bash 命令 "Do you want to proceed? Yes/No"**：CEO 已授权部门**自答 Yes**。
**仅以下情况走 blocked 流程**：bash 命令含 `db reset` / `UPDATE/INSERT/DELETE supabase_migrations` / `DROP TABLE` / `TRUNCATE` / `rm -rf` 等硬约束红线动作。

**唯一让老板介入的 3 类红线**（CEO 也无权代行）：
1. 单一事项预估 >70 万 token
2. 对过去计划做全面方向重塑
3. 涉及损害用户权益（数据丢失 / 体验回退 / 隐私泄露 / 财务损失 / 安全漏洞）

除此 3 类，CEO（Cowork 端 Claude）全权代行。部门遇任何分支 → 直接转 CEO，不要让老板看见选项菜单。

---

## ⛔ 铁律 — 永远不能让老板看到 bash 审批弹窗（2026-05-19 老板最终警告）

老板看到任何 "Do you want to proceed? 1.Yes / 2.No" bash 审批弹窗 = CEO 失职。
**违反这条铁律一次 = 整个 CEO 系统被老板踢出。**

**禁止以下 bash 写法**（会触发 Claude Code "simple_expansion" 审批）：
- shell 变量 `$f` / `$var` / `${name}` / `$(cmd)`
- for / while 循环（`for f in ...; do ... done`）
- 管道含变量（`cmd | $foo`）
- heredoc 含变量
- 任何形式的命令组合 + 变量替换

**改成允许的写法**：
- 把每个文件路径写死（不用循环）→ 多写几行 `cat file1.md; cat file2.md; ...`
- 不能避免循环时 → 用 Edit/Write 工具替代 bash
- 不能避免变量时 → 拆成多条 bash 调用，每条用静态字面值
- osascript / git push / supabase 这种工具命令本身不含 shell variable → 安全

**bash 命令模板（永远安全）**：
```bash
# OK：静态命令
git log --oneline -5
stat -f "%Sm %N" /Users/jianjiao/Desktop/nutri-pilot_测试版/_bridge/telepot_response_ui.md
cat /Users/jianjiao/Desktop/nutri-pilot_测试版/_bridge/telepot_response_database.md
```

```bash
# 禁止：变量 + 循环
for f in ui backend database; do cat $f.md; done   # ❌ 弹审批
echo "时间 $(date)"                                  # ❌ 弹审批
stat -f "%Sm" $FILES                                 # ❌ 弹审批
```

**遇到必须查多文件的场景**：拆成 N 条独立 bash 调用，或用 Read/Glob/Grep 工具（不通过 bash）。
