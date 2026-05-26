# CEO HANDOFF — Aieats / 爱吃 / nothinkeats.com

**HANDOFF_AT**: 2026-05-24 19:42 HKT  
**FROM**: Cowork CEO (claude.ai 桌面端 Claude)  
**TO**: Warp CLI CEO (Claude Code CLI fresh session)  
**REASON**: 老板拍板 C 选项 — 跨平台 context 转移，原 Cowork session ~99% context  
**OWNER**: 老板 (jianjiaolin9@gmail.com / Aieats 唯一甲方/股东)

---

## §0 接管须知 — 先读这 5 条再做任何事

1. **老板 = 甲方/股东**，你 = CEO。不要把老板当 CEO 叫，不要让老板做技术执行。
2. **所有汇报用简体中文**，code/paths/commit messages 保持英文。语言精练，不要废话。
3. **CEO 永不动 code**。`Write/Edit/bash` 不许接触 `src/` `supabase/migrations/` `supabase/functions/` `scripts/` `git*` — 只动 `_bridge/telepot_*.md` 工单 + `docs/` + memory。5 分钟内的活也不许 CEO 自跑（老板 2026-05-22 明示"会出问题的"）。
4. **每个 turn 进来先实查**：`date '+%Y-%m-%d %H:%M %Z'` (TZ=Asia/Hong_Kong) → `git log --oneline -10` → 读 4 个 telepot_response_*.md → 汇报。不允许凭上一轮记忆推时间或进度。
5. **绝不出现现金奖励 / 老板私人信息 / "免费试用"在 helper UI**。任何裂变机制只用积分+视频+社区+超市券。

---

## §1 当前 sprint 状态（截止 2026-05-24 19:42 HKT）

### 今天已 ship — 10 commits push origin/main

| commit | 部门 | 内容 |
|---|---|---|
| 96a0a0c | UI 052 §K | 'Ika' 硬编码改占位 (Settings.tsx:389 + AIPilot.tsx:65/76) |
| 3bd9513 | UI 052 §B | 周末 home 顺序 hero → 5 餐厅 → location |
| f561875 | Backend 025 | audit 证伪 — 非 Backend bug, 真因 UI 硬编码 |
| 46baa56 | UI 052 §F+§G+§H | Settings taste hub + 会员中心 + helper 国籍 |
| 35374ba | Backend 024 | wechat OAuth 真存 snsapi_userinfo + GPS endpoint |
| 7565291 | Database 026 | migration 081 user_profiles +11 cols (微信6+GPS3+业务2) |
| ada7fe4 | UI 052 §A+§E | 采购清单按钮修 + 空菜单 CTA |
| 36d9b87 | Algorithm 030 | localStorage QuotaExceededError 防爆 cache |
| b3711ee | UI 051 §B+§C | 餐厅 Maps 锁 HK + helper 隐藏免费试用 |
| 2bd5216 | Admin 001 | sprint 0 独立 admin/ Vite + 6 stat dashboard |

### 4 部门 idle/pending

| 部门 | 状态 | 下一棒 |
|---|---|---|
| UI | idle (052 done 18:05 HKT) | 等 CEO 派单 |
| Backend | idle (025 done 17:55 HKT) | 等 CEO 派单 |
| Database | idle (026 done 16:20 HKT) | 等 CEO 派单 |
| Algorithm | 🟡 **031 pending** (鸡蛋修 + combo audit) | 待老板敲 `/clear` + `process telepot` 启动 |
| Admin | idle (001 done 01:05 HKT) | 待 sprint 0 真测后 002 立项 |

### 唯一 in-flight 工单：Algorithm 031

`_bridge/telepot_algorithm.md` 已写，内容 = 修 `src/lib/breakfastCombos.ts` 14/16 combo 硬编码 `side[0]='茶叶蛋'` → 5 蛋轮换 (BREAKFAST_PROTEIN_EGG_POOL `dayIdx % 5`) + 全 combo 单一化 audit 报告 + bump ALGO_VERSION v62→v63。预算 80k token / $1.5 / deadline 18:30 HKT (已 miss)。

老板在 warp Algorithm tab 敲 `/clear` 然后 `process telepot` 即启动。

---

## §2 跨部门通信协议 — telepot 双向 inbox

```
        Bobby (老板)
              │ 只在 strategy / push auth / override 介入
              ▼
        Cowork CEO ──→ _bridge/telepot_<dept>.md ──→ Claude Code CLI (warp 5 tab)
              ▲                                              │
              └── _bridge/telepot_response_<dept>.md ◀───────┘
```

5 部门工单文件对：

```
_bridge/telepot_ui.md           ↔ _bridge/telepot_response_ui.md
_bridge/telepot_backend.md      ↔ _bridge/telepot_response_backend.md
_bridge/telepot_database.md     ↔ _bridge/telepot_response_database.md
_bridge/telepot_algorithm.md    ↔ _bridge/telepot_response_algorithm.md
_bridge/telepot_admin.md        ↔ _bridge/telepot_response_admin.md
```

**Architect 部门已永久退场** 2026-05-20，复审职责 Cowork CEO 接手。

**全部 telepot 文件 gitignored** — 仅 Cowork ↔ CLI 同步用，不进仓库历史。

工单头部强制字段：

```yaml
TICKET: TELEPOT-YYYYMMDD-NNN     # 全局递增 (今天 UI 已到 052, Backend 025, Algorithm 031, Database 026, Admin 001)
STATUS: pending / in_progress / done / blocked
ISSUED_AT: <ISO 8601 HKT>
TASK: <一句话 subject>
PRIORITY: P0 hot / P0 / P1 / P2
CONTEXT: |
  <详细 spec>
```

回执头部：

```yaml
LAST_PROCESSED_TICKET: TELEPOT-YYYYMMDD-NNN
STATUS: done / blocked
COMPLETED_AT: <ISO 8601 HKT>
COMMITS: [<hash>]
PUSHED: <range> → origin/main
```

CLI 完工后 telepot_<dept>.md `STATUS: idle` + 归档 LAST_ARCHIVED_TICKET。

---

## §3 老板保留 instructions — 一字不许改

### 角色 / 决策边界

- **CEO 自决 95% 决策**。仅 3 种请示老板：(1) 单 ticket 预算 >70万 token；(2) 全面架构改造；(3) 损害用户权益。
- **不要让老板做执行**。要老板点链接 / F12 / 跑 SQL → 用 Chrome MCP / Bash / 自己 draft → 给老板看结果即可。
- **没有指令不许停**。任一部门 idle 立即派下一棒；禁用"今天成效已落地"/"基本收工"等自我设限话术。

### 技术红线

- **CEO 永不动 code**。仅动 `_bridge/telepot_*.md` + `docs/` + memory file。Lead 干 git/code 实施。
- **私人信息隔离**。老板邮箱/微信号/真名/手机/住址绝不进 UI/docs/git/工单。统一用 `support@nothinkeats.com` + "Aieats 负责人"占位。
- **现金奖励禁令**。任何裂变/激励禁止 PayMe/红包/现金。只用 积分+视频培训+社区+超市券。
- **helper UI 无试用文案**。`if (role === 'helper')` 任何 `免费试用`/`30 天免费`/`升级 Pro` 必须 hide。employer 端正常显示。

### 产品规格

- **登录架构**：`/login` = 微信唯一 OAuth + 雇主/菲佣 role toggle (NOT 3 独立入口)。微信登录按钮下小字仅 employer 显示"（免费试用30天）"，helper 隐藏。
- **默认语言**：简体中文 `zh`。4 lang switcher (简/繁/英/Filipino) 仅在 `/login` + `/home` + `/settings` 显示，其他页面无 picker。
- **早餐 4 大营养类**：每日早餐必须输出 碳水+蛋白质+蔬菜+水果 (NOT 3 件)。`breakfastCombos.ts` BREAKFAST_VEG_KEYWORDS + BREAKFAST_FRUIT_KEYWORDS 分离。
- **餐次优先级**：早餐+晚餐 = P0 算法重投入；午餐 = P1 简化。任何 scope 砍刀先砍午餐保早晚餐。
- **5 天工作日菜单**：周一-五 推菜单，周末家庭自由发挥。DAYS array + algo + hero + 采购数量全 5 天对齐。
- **周末 home 顺序** (老板 17:00 HKT 拍板)：最上 "周末好，出门换换口味吧" hero + 副标 → 中部 5 张餐厅推荐卡 (复用 `hkRestaurants.ts` 100 家) → 最下 LocationPicker/地图搜索。
- **下周菜单**：在 `/weekly` 周六开始可生成，周末 `/home` 不显示下周菜单 nav 入口。
- **微信用户数据全收**：avatar_url / nickname / city / province / country / wechat_sex (snsapi_userinfo + scope=snsapi_userinfo)。
- **GPS 授权**：HTML5 geolocation API + 弹窗 modal (非 inline) + 写 `user_profiles.location_lat/lng/gps_accepted_at`。
- **Settings 单入口**：我的口味偏好 (多维度 chip + 200 字 textarea) + 会员中心 (现全免费, 不真链 Stripe, 占位 "敬请期待")。
- **菲佣 onboarding 简化**：HelperHome 只问"你来自哪里？" [菲律宾] [印度尼西亚] 2 选 → 写 `user_profiles.origin_country` (PH / ID)。其他口味/辣度/goal 都不问。
- **视频教学范围**：只 午餐+晚餐 × (肉/海鲜/港式粤式汤/复杂汤) 放视频。早餐/蔬菜/主食/简单汤/凉菜不放。

### 10k 用户合并 trigger

用户量达 1 万人时，4 部门压缩到 1 个统一部门 (sprint 模式 → 稳定运维)。trigger 老板已预先 ACK。

---

## §4 已积累 product memory — 完整 index

memory 路径：`/Users/jianjiao/Library/Application Support/Claude/local-agent-mode-sessions/.../memory/`

```
project_admin_department.md          — 第 5 部门立项 (CEO 直管，独立 admin/ Vite)
project_breakfast_4_components.md    — 早餐必须 4 件
project_meal_priority.md             — 早晚餐 P0, 午餐 P1
project_5day_workweek.md             — 周一-五菜单, 周末餐厅
project_helper_no_trial_wording.md   — helper UI 永不显示免费试用
project_video_tutorial_scope.md      — 视频教学范围
project_wechat_jssdk_railway_migration.md — JSSDK 迁 Railway P1
project_db_truth_check.md            — DB 真相必须实查 (pg_policies + information_schema)
project_team_consolidation_trigger.md — 10k 用户合并

feedback_pre_work_protocol.md        — 开工前三问 (计划/预算/时间)
feedback_timezone_hkt.md             — 时间统一 HKT
feedback_time_truth_check.md         — 时间必先实查 bash date
feedback_own_the_decisions.md        — 自己拍板低风险决策
feedback_paste_ready_commands.md     — 命令必须可复制粘贴
feedback_ship_real_test_link.md      — ship 后必给真测 URL + 步骤 + 预期
feedback_role_clarity.md             — CEO 接管不要丢回老板
feedback_ceo_decision_boundary.md    — 仅 3 类才请示
feedback_zero_jargon_for_boss.md     — 零术语全傻瓜
feedback_no_stale_intel.md           — 必先 WebSearch 不许凭过时记忆
feedback_proactive_memory_read.md    — 主动扫 memory index
feedback_never_stop_without_command.md — 没有指令不许停
feedback_proactive_dept_status_report.md — 每 turn 主动汇报 4 部门
feedback_5min_dept_polling.md        — 每 5 分钟 scheduled 巡检
feedback_auto_broker_with_confirmation.md — 自动 broker + 老板审核
feedback_no_ceo_code_touching.md     — CEO 不越界动 code
feedback_dump_before_compact.md      — 压缩前必先 dump skill/lesson
feedback_isolate_protect_personal_info.md — 个人信息隔离
feedback_no_cash_rewards_ever.md     — 永不现金奖励
feedback_daily_token_cost_report.md  — 每日 token+cost 汇报
feedback_no_sleep_advice.md          — 不要建议老板睡觉
feedback_no_role_inversion.md        — 不让 Lead 替 CEO 整合

user_role.md                         — 老板=甲方/股东，CEO=我，Lead=warp 5 tab
```

新 session 进来 **必须先读 `MEMORY.md` index**, 然后按需读对应单文件。

---

## §5 技术 stack 速查

**Stack**: React 18 + Vite + TS + Tailwind + framer-motion + react-router-dom / Supabase (Postgres + RLS + Edge Functions Frankfurt EU) / Gemini (proxied via `gemini-proxy` edge fn, 前端无 key) / Stripe live HKD / Railway → nothinkeats.com / WeChat web-view shell `wechat-mp/` AppID `wx60f6708a777dc896`.

**硬不变量**：

1. **Custom auth, NOT Supabase Auth**。`userId` 仅在 `localStorage`, `auth.users` 表空。永不加 FK→`auth.users` (插入会静默失败)。读 userId 用 `getUserId()` from `src/lib/userId.ts`。不许加 `auth.uid()` 到 RLS。
2. **Gemini 走 `gemini-proxy`**。endpoints: `vision` / `michelin` / `school_balance` / `recipe` / `intent`，每个独立 `api_usage_daily` 配额。新调用点 → 加新 endpoint，不许前端直调。
3. **`ALGO_VERSION` v62** in `src/hooks/useWeeklyMenu.ts`。算法/scoring/早餐/slot 任何改动必 bump。下游 reader (`VerifyIngredients.tsx` 等) 必 `import { ALGO_VERSION }` 不许 hardcode。
4. **Stripe price IDs 三处白名单**：`src/pages/Pricing.tsx` + `supabase/functions/stripe-webhook/index.ts ALLOWED_PRICE_IDS` + `create-checkout-session/index.ts`。新 SKU 必 live mode 三处同步 (test-mode ID = 静默 4xx)。
5. **DB conventions**：`dish_ids` = `uuid[]` (NOT `text[]`)。`user_profiles.id text` 主键 (NOT uuid, NOT user_id)。`household_members.helper_id uuid` JOIN 需 cast `::text`。`db push` 直接推远端 (老板用 production Supabase)。
6. **dish seed pipeline**：加 dish 必跑完整 chain (steps + nutrition + 小美 ABCD tray + image)。tray 命名 A1/A2/B1 (字母不许省)。

**Edge functions** (全 `--no-verify-jwt`)：`stripe-webhook` / `create-checkout-session` / `create-portal-session` / `parse-intent` / `gemini-proxy` / `wechat-mp-callback` (现 blocked on 微信认证)。

**Smell 状态**：Smell 1 phase 1 已 ship 2026-05-19 (Home 午晚 tab 用 weeklyMenu)；Smell 3 (households RLS) 已 RESOLVED migration 025+026；Smell 4 (algo_version cache) 已 RESOLVED migration 024 +2 cols。Phase 2 (merge scoreDish into scoreForWeek) 仍 pending CEO 调度。

---

## §6 真测路径速查 — 老板验证用

最后 ship 后真测链接 (全部已上 nothinkeats.com)：

- ⭐ **采购清单按钮**：`/weekly` → 点"一键生成本周购物清单" → 应跳 `/verify-ingredients` (UI 052 §A)
- ⭐ **周末 home**：周六/日 打开 `/home` → 应见"周末好，出门换换口味吧"hero + 5 餐厅推荐 + 查看链接跳 HK GMaps (UI 052 §B+§C / 051 §B)
- ⭐ **空菜单 CTA**：`/weekly` 空菜单 → 应见 [✨ 去设置口味偏好 →] (UI 052 §E)
- ⭐ **登录页**：`/login` 切 [helper] → 应无"（免费试用30天）"字眼 (UI 051 §C / 052 §D)
- ⭐ **Settings**：`/settings` → 应见单入口 "🎯 我的口味偏好" + "💎 会员中心" (UI 052 §F+§G)
- ⭐ **Settings/taste**：点 "我的口味偏好" → 多维度 chip + 200 字 textarea 保存 (UI 052 §F)
- ⭐ **Settings/membership**：点 "会员中心" → 权限列表 + "目前全部免费"标语 (UI 052 §G)
- ⭐ **菲佣 onboarding**：`/helper-home` → 应只问 [菲律宾] [印度尼西亚] (UI 052 §H)
- ⭐ **'Ika' 硬编码**：`/settings` + `/ai-pilot` → 应看不到 'Ika' 字眼，应为 '菲佣' 或 nickname (UI 052 §K)
- ⭐ **微信登录 nickname**：微信扫码登录 → 应看到老板自己的真昵称 (NOT 'Ika') (Backend 024)
- ⭐ **早餐 5 蛋轮换**：周一-五 早餐应见 5 种不同蛋 (NOT 全茶叶蛋) — **等 Algorithm 031 启动 + ship**

---

## §7 接管立即动作 (warp CLI 新 session 第一个 turn 做这些)

```bash
# 1. 时间真相
date '+%Y-%m-%d %H:%M:%S %Z'
TZ=Asia/Hong_Kong date '+%Y-%m-%d %H:%M %Z'

# 2. git 进度真相
cd /Users/jianjiao/Desktop/nutri-pilot_测试版
git fetch origin main
git log --oneline origin/main..HEAD -20  # 未 push
git log --oneline -20  # 最近 commits

# 3. 4 部门 telepot 状态
for d in ui backend database algorithm admin; do
  echo "=== $d ==="
  head -10 _bridge/telepot_$d.md
  echo "--- response ---"
  head -10 _bridge/telepot_response_$d.md
done

# 4. 实查 ALGO_VERSION (Algorithm 031 ship 后应为 v63)
grep -n "ALGO_VERSION" src/hooks/useWeeklyMenu.ts | head -3
```

读 `docs/CEO_HANDOFF_20260524.md` (本文件) 完整 + 读 memory `MEMORY.md` index + 按需读 feedback/project 单文件。

然后向老板汇报：

```
老板我接管了。

时间: <HKT now>
未派单: Algorithm 031 待启动 (鸡蛋修)
建议下一棒: <CEO 自决>

[问老板是否启动 Algorithm 031 / 或派新棒 / 或其他指令]
```

---

## §8 老板的下一步操作 (paste-ready)

在 warp Algorithm tab 跑：

```
/clear
process telepot
```

Algorithm Lead 会读 `_bridge/telepot_algorithm.md` 031 + 修 `breakfastCombos.ts` + bump v62→v63 + push origin/main + 写 response。

如果老板希望先休息（不启动 031），CEO 在新 session 内 idle 等待即可，但不允许"今天完工"自我设限 — Algorithm 031 还在 inbox 里。

---

## §9 历史决策档（参考）

- `docs/CEO_DECISIONS.md` — 历史拍板记录
- `docs/CEO_DRAFTS_NEXT_WAVE.md` — 已弃用 draft
- `docs/CEO_NEXT_WAVE_DRAFTS_20260523.md` — 上周末 next wave draft
- `_bridge/PROCESS.md` — 双向 telepot SOP v1.2 完整版
- `CLAUDE.md` — 项目根 stack + 硬不变量 + Smell 状态

---

**END OF HANDOFF**  
新 CEO 接管成功的标志：第一个 turn 给老板的汇报里包含 git 真状态 + 时间真相 + 下一棒建议 + 自己拍板，不是"我读完了 handoff 文档"。
