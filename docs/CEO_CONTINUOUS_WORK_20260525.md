# CEO 持续推进工单清单（老板第二次睡前授权 ~02:00 HKT 后）

## 老板授权（2026-05-25 凌晨）

> 你一会自动 compact 我去睡了 然后你继续你的工作推进 明天上午我们上线。如果你发现你的工作结束了，那就做丰富数据库的工作，尽量把我们没有的中餐数据都按照同样的格式要求补充进来。然后把做法那里页补充进去。

**Deadline**：明天上午（约 ~9 AM HKT，7 小时后）

---

## 已 ship（今晚通宵 sprint，22+ commits）

详见 `docs/MORNING_REPORT_20260525.md`。最新 HEAD 在 commit `39e73cc`（qa-047 audit）/ `9a92339`（qa-048 verify hotfix）。

ALGO_VERSION：v66。

---

## 上线前必派工单池（按优先级）

### P0（必须 ship）

1. **TICKET-050 WeChat OAuth referral 消费**（已派 background）
   - qa-047 P1-2 发现：WeChatCallback 不消费 `nutri_pending_ref_code` → 中介 attribution 漏
   - 改 `src/pages/WeChatCallback.tsx` 加 consume + update user_profiles
   - 估 30 分钟

2. **TICKET-051 OnboardingV2 i18n**（待派）
   - qa-047 发现：OnboardingV2 122 行硬编码中文，0 useLanguage 调用
   - 新用户第一印象国际化破，必修
   - 改 `src/pages/OnboardingV2.tsx` 包 t3() 三语言
   - 估 60 分钟

### P1（上线前最好 ship）

3. **TICKET-052 PERF bundle 拆 chunk**（待派）
   - qa-047 发现：Bundle 1.7 MB 单 chunk + useWeeklyMenu static+dynamic 冲突
   - 改 `vite.config.ts` 加 manualChunks + 修 dual import
   - 目标 bundle < 300 KB
   - 估 60-90 分钟

4. **TICKET-053 POLISH Settings 加 avoid_tags chip**（待派）
   - qa-047 P3：Settings 不显示用户 onboarding 选的过敏原
   - 改 `src/pages/Settings.tsx` 加 avoid_tags + excluded_meats 可视化 chip
   - 估 30 分钟

5. **TICKET-054 REFACTOR Settings 5 fetch 合并**（待派）
   - qa-047 P2：Settings 5 个 useEffect 并发拉同一行
   - 改 `src/pages/Settings.tsx` 合并为 1 个 SELECT 18 列
   - 估 30-45 分钟

### 上线后 / 完成主流程后（老板 explicit）

6. **TICKET-055 数据库扩中餐 dishes 数据**
   - 按现有 `dishes` 表 schema（924 行，cuisine_zh / main_ingredient / cook_time / difficulty / prep_steps_json / image_url / etc）
   - 补充**没有的中餐菜**（按地域：粤 / 川 / 北方 / 江南 / 客家 / 西北 / 东北 / 等）
   - 走 `scripts/gen-dish-steps-claude.ts`（已有）或新建 batch 脚本
   - 每条菜含：
     - title_zh + 别名
     - category（main_protein / main_carb / veggie / soup / dessert / etc）
     - cuisine_zh + origin_cuisine
     - main_ingredient（接 swap fix 4 family）
     - flavor_tags + health_benefit_tags
     - cook_time + difficulty
     - image_url（LLM 生成 prompt → 后续 backfill 真图）
     - **prep_steps_json**（做菜步骤，老板 explicit "把做法那里页补充进去"）
     - feature_vector（走 `scripts/compute-dish-feature-vector.ts` 预计算）
   - **小批量 5 行先**，CEO 真测后 scale（CLAUDE.md 硬规）
   - **不破 prefScores / user data**
   - 估：5 行 ~30 分钟（手工 prompt + LLM）；scale 100 行 ~3-5 小时

---

## Compact 后接力指引

如果 conversation auto compact 了，新对话第一件事按顺序读：

1. `MEMORY.md` 索引 + 关键 feedback files（plain_chinese / 先推进后汇报 / context_60pct / skill_sediment）
2. `docs/MORNING_REPORT_20260525.md`（昨晚 sprint 22 commits 完整记录 + 9 自决项）
3. `docs/CEO_CONTINUOUS_WORK_20260525.md`（**本文件**，待派工单 + deadline）
4. `docs/INTEGRATION_AUDIT_20260525.md`（qa-047 audit P0/P1/P2/P3 bug + 性能 + i18n 问题）
5. `docs/PENDING_QUEUE_20260525_凌晨.md`（昨晚自决项汇总）
6. `docs/SPEC_family_members_schema_升级_方案ABC对比.md`（等老板拍板）
7. `git log --oneline -25`（真状态）
8. 检查 background Agent 状态（继续等通知 / 派新单）

---

## 派单原则

- 按 P0 → P1 → 数据库扩 顺序
- 维持 3-4 个 background slot（避免 git race + push 抢车道）
- 同文件冲突的工单串行（不同 Agent 改同一 .tsx 必等前一个 push 完）
- 完工通知 → spawn 下一个独立文件工单
- 每工单完工写 `docs/skills/20260525_<ticket>_<topic>.md`

## 老板规则（永久遵守）

- **大白话**：对老板输出禁工程黑话
- **先推进后汇报**：小决策自决；大方向（改算法范式 / 砍功能 / 改商业模式 / 改主色 / 涉合规 / 现金）永不自决
- **触碰原则先以优先完成再汇报**（老板新加授权）
- **用户能用 + 爱用**为最终目的
- **CEO 永不动 src/ 代码**（用 Agent 干）

## 上线 checklist（明早老板真测前 CEO 必查）

1. git log --oneline -25 看所有 ship
2. production bundle 拉取确认包含所有 P0/P1 关键字符串
3. supabase functions list 确认所有 edge fn 部署
4. 写 `docs/UPLINE_CHECKLIST_20260525.md` 给老板上线前最后过一遍
