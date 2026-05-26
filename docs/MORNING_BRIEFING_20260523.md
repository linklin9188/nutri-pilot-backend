# MORNING BRIEFING — 2026-05-23 (周六) HKT 06:00

> 老板早班 5 分钟读完 + 一次性派单。

---

## §0 一句话状态

老板 5-22 夜定战略：**Stripe 放下，核心 3 件 — 算法 / 数据库 / 登陆流程**。今天 35+ commits / 9 ticket ship。明早派 4 单（一次性手敲 4 个 Warp tab）。

---

## §1 老板今早 1 个动作（5 分钟）

打开 4 个 Warp tab 各敲一次：

```
[UI tab] process telepot           ← UI 027 P0：Q8 chip 单选 hot-fix（10 分钟）
[Algorithm tab] process telepot    ← Algorithm 021：v58 sim 扩档 + NUTRIENT 7 映射 audit
[Database tab] process telepot     ← Database 022：dishes 加 title_zh_hant / title_en 列
[Backend tab] process telepot      ← Backend 022：Gemini 生 Q0 6 图 + Q1 3 图 + 菜名翻译 348×3
```

UI 021 hook 已 setup，老板敲时**会弹桌面通知 + 终端有 additionalContext 提示** — 观察是否真减少打字（如否 → 我立即派 UI 023 fswatch 升级）。

---

## §2 老板新战略 — 3 核心优先级

| 核心 | 当前状态 | 下一步 |
|---|---|---|
| **算法** | v58 已 ship（5-channel + weekStats fetch + slots[].primary 全切）✅ | Algorithm 021 — sim 扩档 10 profile + NUTRIENT_BOOL_FALLBACK audit |
| **数据库** | meal_logs / feedback_rollup_runs / pref_scores GIN / dishes 3 列 全 ship ✅ | Database 022 — title 多列 / Smell 3 B-1（household RLS 重建，老板拍板）|
| **登陆流程** | UI 022 候选+chip / UI 024 meal_log 写入 / UI 025 Q1+Q8+i18n / UI 026 QuickSetup 50 处 i18n 全 ship ✅ | UI 027 P0 Q8 chip 单选 hot-fix + UI 028 Home/WeeklyMenu i18n 45 处 + UI 029 Q0/Q1 真图 swap（等 Backend 022）|

**Stripe 放下** — 所有 Stripe 相关 ticket（促销码失效 / 账户激活 / UI 030 检测）降级到 P3 backlog 末尾。需要时回来看 `docs/STRIPE_BACKLOG.md`。

---

## §3 今日（5-22）9 个 ticket ship 一览

| Ticket | 完工 | 关键交付 |
|---|---|---|
| **Database 018** | 09:30 | migration 070 pref_scores jsonb 列（解锁 Algorithm v54 reader）|
| **Algorithm 018** | 09:55 | v54→v55 5-channel slots[].candidates[] + tagBadges[] |
| **Backend 018** | 09:55 partial | wellness lt=3 fill / rollup --commit 真跑通 / GHA cron / chat-session deprecated v3 |
| **UI 018** | 10:30 | TagBadge.tsx / DishCard 集成 / CandidateGridProto DEV-only |
| **Database 019** | 12:10 | pref_scores GIN + video_url partial index |
| **UI 019** | 11:30 | chat-session e2e 4/4 / onboarding 7/7 / TagBadge i18n 24/24 |
| **Algorithm 019** | 11:55 | v55→v57 jsonb unwrap + Smell 1 phase 2 |
| **Database 020** | 12:35 | feedback_rollup_runs audit 表 + 2 index |
| **Backend 020** | 12:50 partial | weekStats edge fn ACTIVE v1 / audit schema 改 7 列 |
| **UI 021** | 13:45 | FileChanged hook setup（部分零操作）|
| **Algorithm 020** | 14:40 | v57→v58 lunch/dinner 切 slots[].primary + weekStats 真接口接入 |
| **UI 022** | 14:55 | 候选网格 + chip 上 production ⭐ + osascript Warp 主路径验证 |
| **Database 021** | 15:10 | meal_logs 表 + dishes 加 zinc/vitD/omega3 列 |
| **UI 024** | 15:50 | meal_log 写入"我吃了" + 4/4 real Supabase e2e ⭐ |
| **Backend 021** | partial | gemini-proxy micronutrient endpoint + fill-dish-3-micronutrients.ts 写 + audit row 补跑 ✅ commit / 924 dishes Gemini fill 跑中（17:30 已过 2h45m）|
| **UI 025** | 16:35 partial | Q1 改菜 + Q8 chip + WeekendDining 全文 i18n |
| **UI 026** | 17:25 | QuickSetup 50+ 处 i18n（EN + zh / EN 字典）|

**Total**: 35 commits / 39 files / +3440 / -74 lines

---

## §4 明早 P1 派单（4 单详情）

工单已 ready，4 个 telepot_*.md 已写好或 draft 在 docs/。

### UI 027（P0 hot-fix — Q8 chip 单选 auto-advance 卡死）

老板 5-22 ~16:55 报 bug：onboarding 走到 Q8 口味清淡浓 点选无反应。CEO 实查源头：UI 025 §B 改 Q8 成 `chips: true + multi: false` 历史首次组合，ImageGrid 没接此组合的 auto-advance handler。

draft 在 `docs/HOTFIX_UI_027_Q8_DRAFT.md`，3 方案（CEO 推方案 1：让 ImageGrid chip 模式支持 multi: false auto-advance），10 分钟可修。

### Algorithm 021（v58 优化 — sim 扩档 + audit）

- §A: scripts/algo-quality-sim.ts 扩到 10 profile（当前 5）— 覆盖更多家庭组合 / wellness goal 组合
- §B: NUTRIENT_BOOL_FALLBACK 7 映射 audit（atomic 真数据 Backend 021 ship 后）— 让 💪 channel atomic-first，bool fallback 用率最小化
- §C: 待 Backend 021 ship 真 micronutrient 数据，跑回归 sim 看 mean pmc_main 是否仍 ≥90%

预算 ~80-100k token / ~$1.5

### Database 022（小活 — title 多列 / Smell 3 B-1 拍板）

- §A: migration 076 dishes 加 title_zh_hant + title_en 列（前置 Backend 022 翻译）
- §B（**老板拍板**）：是否本波做 Smell 3 B-1（household_members helper_id 类型迁移 + FK + RLS 重建）— 风险大但 5/19 立的项目已积压 4 天。CEO 推**本波做**（dish chip 体验已上 production，Home tab 切到 helper 后会撞 RLS bug，老用户已经报过几次 console 400）

预算 §A 5 分钟 / §B 30-45 分钟

### Backend 022（最大活 — Gemini 生图 + 翻译）

- §A: Gemini imagen 2.5 / nano-banana 实查能力（5-22 还没实查过）
- §B: 生 Q0 6 张家庭组合简笔画 + Q1 3 张菜图（炖牛腩 / 白切鸡 / 虾）
- §C: 菜名翻译 348 dishes × 3 语言（zh-Hant + en，Database 022 ship 后写入）
- §D: 等 Backend 021 ship 后补完 zinc/vitD/omega3 fill verify

预算 ~250-350k token + Gemini 调用 / ~$8-12（生图较贵）

---

## §5 P2 派单（明天下午或后天）

| 单 | 内容 | 依赖 |
|---|---|---|
| UI 028 | Home + WeeklyMenu i18n 45 处（UI 026 同模式 EN 字典）| 独立 |
| UI 029 | Q0 6 图 swap + Q1 3 图 swap（5 分钟）| Backend 022 ship |
| UI 030 | dish.title 多列接（"红烧牛肉" / "Red-Braised Beef"）| Database 022 + Backend 022 ship |
| Algorithm 022 | dynamic K（早 3/午 5/晚 5 现固定，按 user pref 多样性动态调）| Algorithm 021 ship |
| Backend 023 | 用户量 < 100 时跑一次 manual feedback rollup（验证 cron 长期工作）| 独立 |

---

## §6 P3 backlog（不急，CEO 自决推进时机）

- UI 023 fswatch + osascript 真零操作 hook 升级（消除老板手敲）
- Wechat JSSDK Railway migration P1（5-21 立项，IP 漂移风险）
- WeeklyDayMenu 旧字段下线（Smell 1 phase 3）
- 7 wellness tag 5 个 <25% 三轮 fill（接受现状还是再试）
- **Stripe 相关全降级**（促销码失效 / 账户激活 / 前端检测）— `docs/STRIPE_BACKLOG.md`

---

## §7 风险 flag

1. **Backend 021 跑 2h45m+ 偏长** — git log 显示 50 分钟前 push 3 commits，之后无动作。老板早起来如 STATUS 仍 in_progress 且 git log 仍是 6239ce7 → Lead 卡死，CEO 派"hot-fix verify"让 Lead 重启
2. **UI 021 FileChanged hook 实测未知** — 老板 5-22 敲了几次 process telepot，hook 弹通知体验如何（减打字了？）老板早上验证 1 次告诉 CEO，决定 UI 023 fswatch 升级时机
3. **promo code 失效在 Stripe 端**（5-22 ~16:50 报）— 老板放下 Stripe → 默认接受现状（用户暂时无法用 AIEATS_BETA），不影响核心 3 优先级
4. **Q0 6 张图仍 placeholder** — Backend 022 ship 后 UI 029 swap，今天没解决

---

## §8 CEO 半夜不工作（PROCESS.md §8 反弹窗铁律）

老板睡时 CEO **不写新 telepot in_progress 工单**避免半夜 Lead 跑活弹 osascript 通知吵到老板。所有 backlog 都是 docs/ 形式 draft，老板早起一次性触发。

5-22 disable 的 `aieats-5min-dept-poll` scheduled task 保持 disabled。

---

**HKT 06:00 状态：4 部门 1 in_progress (Backend 021) + 3 idle。老板早起 1 件事 = 敲 4 次 process telepot。半小时后 4 部门一波 ship。**
