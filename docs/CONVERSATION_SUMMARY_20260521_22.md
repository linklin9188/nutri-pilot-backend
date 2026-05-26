# Aieats 对话精华 — 2026-05-21 晚 ~ 5-22 早

> CEO Cowork 端整理。给未来 session / 新接手 Claude 用：读完本文件即可掌握全部上下文，不需读对话历史。

---

## 1. 角色（铁律）

| 角色 | 谁 |
|---|---|
| 老板 / Bobby / 甲方 / 产品 owner | 用户本人 |
| **CEO** | Cowork 端 Claude（我） |
| 4 部门 Lead | warp 4 tab：UI / Backend / Algorithm / Database |

CEO 不睡 / 不"醒来"。CEO 的活 CEO 自己做（Chrome MCP / bash / Write / Edit），不甩回老板。

---

## 2. 老板今日 5 件核心拍板（产品定位铁律）

| # | 拍板 | memory |
|---|---|---|
| 1 | **周菜单 5 天工作日 + 周末餐厅外食模式**（不是周末不推，是周末换 WeekendDiningReport） | `project_5day_workweek.md` |
| 2 | **视频教学范围**：午+晚 × (肉/海鲜/港粤式汤/其他菜系复杂汤)，其他不放（早餐/蔬菜/主食/简单汤/凉菜） | `project_video_tutorial_scope.md` |
| 3 | **5-channel 标签化推荐**：用户偏好为底层 must-have + 4 个显式标签 channel：🌶️ 偏好 / 🌿 应季 / 🎋 节气 / 🎒 学校补 / 💪 周补。**每菜显式打标签让用户看到"为什么推这道"** | （并入 5day）|
| 4 | **每餐多候选让用户自选**（早 3 / 午 5 / 晚 5），数据库不改 | (并入 5day) |
| 5 | **算法接受极端化菜单**：meatlover 单 pmc 偏好 → main slot 强制 protein_main_class === user_wants，一周全红肉是预期 | (并入 5day) |

**Onboarding v4 元规则（老板原话拍板）：**
- **所有题底部加 "✏️ 其他/自定义" chip** — 看用户填不填即可
- Q0 改 6 家庭组合大图（1大1小 / 2大1小 / 2大2小 / 2大3小 / 4大2小 + 自定义双 stepper）
- 禁用 `+/-` 计数器 / number input 作主交互（被老板批"傻"）

---

## 3. 算法演进 v45→v54（5/20 profile 命中率）

| Version | 改动 | pmc_main 命中率 |
|---|---|---|
| v45-v49 | v3 9 axes + UI↔DB 桥接 + axis 32/37 DB 列双轨 | 20% (meatlover) |
| v50 | 5 天工作日 WORKDAYS_PER_WEEK=5 | 同 |
| v52 | axis 30 cold-start early-return + axis 32 pmc 0.15→0.30 | 27% (meatlover) |
| **v54** | **Option δ：单 pmc 偏好 main slot 硬过滤强制 protein_main_class === user_wants** | **96%** mean / 19/20 pass ✅ |

**最新（Algorithm 017 ship 08:09）：** `pass_pmc_main 1/20 → 19/20`，副作用接受极端化（老板拍板）。
**未做：** §H 5-channel 接口大改（generateWeekPlan 返回 slots[].candidates[] 结构）推到 018。

---

## 4. 4 部门完工度 + 4 处遗留

| 部门 | 完工度 | 遗留 |
|---|---|---|
| UI | 70% | §G/§H/§I 候选网格 + 5-channel 标签 blocked（等 Algorithm 018），用降级版"换一个按钮"暂代 |
| Algorithm | 80% | §H 5-channel 接口大改推到 018 |
| Backend | 65% | **7/12 wellness tag 仍 < 30%**（sleep_aid 2.3% / yin_nourish 9.2% / low_sodium 17.9% / blood_tonic 14.4% / qi_tonic 18.5% + 2 个未列）— 弱 channel |
| Database | 80% | **§A Q0 6 张图是 placeholder 复制改名**（不是 Unsplash 真摄影），Lead 自承"无 PIL 能力" |

**今天派的 3 单（待启动）：**
- UI 017: ChatAgent 真 backend 联调 + 节庆 chip + WeeklyMenu 换菜按钮降级版
- Backend 012: video_url 真灌入 600 道 + feedback rollup cron + chat-session 联调 + festival-now 加 festival_tags
- Database 013: festival_tags GIN index + 12 wellness partial index + display_name NOT NULL 收口

**今早老板的核心关注（ChatAgent）：** "chat 作为明天重点优化内容" — UI 017 §A 主线。

---

## 5. PROCESS.md 17 条铁律（关键 5 条）

| § | 内容 |
|---|---|
| §1 | 双向 telepot 文件协议 — Cowork ↔ 4 CLI tab |
| §14 铁律 0 | /compact 前强制 dump SKILLS/LESSONS 再 push |
| §15 | telepot_response 只允许 4 段（完工/verify/token+cost/blocker），**禁 Lead 替 CEO 列待办** |
| §16 | Lead 开工**第一动作** update head 为 `STATUS: in_progress + CURRENT_TICKET + STARTED_AT` |
| §17 | CEO **每 turn 涉及 tab 状态** 必须先 bash `git fetch + head -8 _bridge/telepot_*.md`，不靠记忆 |

---

## 6. CEO 沟通 4 bug 今日（已修）

1. UI 013 早 20:25 ship CEO 仍报 pending → §17 立
2. 让老板 compact 一个 in-flight 跑 924 dishes Gemini fill 的 Backend tab → §16 立
3. 口误"CEO 醒来后核查" → 角色定位强化
4. UI 014 早 22:35 ship CEO 仍报 pending（§17 反复违反）→ 升级"每 turn bash 强制"

---

## 7. memory 索引 24 条（关键 10 条）

- `user_role.md` — 老板 = 甲方 / CEO = Cowork 端 / 4 tab = Lead
- `feedback_role_clarity.md` — CEO 不让老板干自己活
- `feedback_ceo_decision_boundary.md` — 仅 3 类请示老板（>70万 token / 计划全面改造 / 损害用户权益）
- `feedback_paste_ready_commands.md` — 给老板命令必 paste-ready 带 tab 标签
- `feedback_zero_jargon_for_boss.md` — 老板不是码农，不用技术术语
- `feedback_no_role_inversion.md` — 不让 Lead 替 CEO 整合
- `feedback_no_sleep_advice.md` — 不主动提"老板该睡了"
- `feedback_isolate_protect_personal_info.md` — PII 全面隔离（不暴露真名/邮箱/手机）
- `feedback_no_cash_rewards_ever.md` — 永不出现现金奖励（只积分+视频+社区+超市券）
- `project_5day_workweek.md` + `project_video_tutorial_scope.md` — 今日新立

---

## 8. CLAUDE.md 硬不变量（4 条永不可破）

1. 不加 FK→auth.users（custom auth，userId 在 localStorage）
2. Gemini 全走 gemini-proxy edge function，不直连前端
3. Stripe price IDs 白名单 3 处同步（Pricing.tsx + stripe-webhook + create-checkout-session）
4. ALGO_VERSION 改算法必 bump（cache 失效）

---

## 9. 今日 30+ commits 关键（origin/main）

- `7a72649` Q0 二改 6 家庭组合 + custom stepper
- `0eefe73` 全 9 题 ✏️ 其他/自定义 兜底
- `abff675` 新 Q5 健康目标 8 chip
- `b554b7f` Q6 toast 预览
- `a9d37d2` 全题 ⏭️ 跳过 chip
- `c14c918` migration 066 dishes.video_url/lang/platform
- `0963d32` axis 30 early-return + axis 32 ×2 v50→v52
- `7cde165` dish 详情页 Watch tutorial 按钮
- `b20481b` + `eb38a46` wellness fill 二轮
- `292c6eb` **Option δ + festival API + DB pref_scores v52→v54** (今早 08:09 ship)

---

## 10. 当下决策点（老板拍 A/B/C）

- **A** 接受 4 处遗留启动今天 3 单（UI 017 + Backend 012 + Database 013）→ ① UI 候选网格 + ④ video_url 自动解，② Backend wellness 7 tag + ③ Database 假图 后续派
- **B** 先派补丁修 ② + ③ 再启主线
- **C** ③ Q0 假图 CEO 自跑（Chrome MCP + WebSearch Unsplash 下载）

**CEO 推荐：A + ③ CEO 自跑**

启动 paste-ready：
```
[UI tab]       /compact → process telepot   # ChatAgent 真 backend (老板"重点")
[Backend tab]  /compact → process telepot   # video 灌入 + rollup + chat-session + festival_tags
[Database tab] /compact → process telepot   # GIN index + wellness partial + display_name NOT NULL
[Algorithm]    idle — 017 已 ship 08:09
```

---

## 11. 关键 docs 文件清单

| 文件 | 用途 |
|---|---|
| `docs/DAY_REPORT_20260521.md` | 今日全天工作详细复盘 |
| `docs/MORNING_BRIEFING_20260522.md` | 老板早上 5 分钟读完晨报 |
| `docs/ALGO_AUDIT_20260521.md` | 算法 5 profile + 13 axes 量级 audit |
| `docs/AI_DATA_QUALITY_20260521.md` | Backend wellness 12 tag 填充率 |
| `docs/SCHEMA_AUDIT_20260521.md` | 全表 audit 310 行 |
| `docs/SKILLS.md` | 全部门 LEARNED 复用技能 (~425 行) |
| `docs/LESSONS.md` | 全部门踩坑教训 (~280 行) |
| `_bridge/PROCESS.md` | 17 条 telepot 协作铁律 |
| `_bridge/telepot_*.md` × 4 | 当前工单 / response 文件 |

---

**对话压缩到此为止。读完本文件 + `docs/MORNING_BRIEFING_20260522.md` + 4 部门当前 telepot head 即可接管。**

`/compact` 命令老板自己敲。CEO 端不能主动 compact 老板对话。
