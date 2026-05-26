# Compact 接力 Spec — 2026-05-25 早上（context 70% 老板手动 /compact 触发）

**写给 compact 后的 Cowork CEO（自己）**：你刚被 /compact，需要从这个文件恢复 context 接力推进。

---

## 立即恢复步骤（按顺序读）

1. **本文件**（看当前状态 + 待派 + background）
2. `MEMORY.md` 索引 + 5 条 feedback files（plain_chinese / 先推进后汇报 / context_60pct / skill_sediment / 全 helper UI 永不"试用"）
3. `docs/MORNING_REPORT_20260525.md`（昨晚 + 凌晨 30 commits 全部记录）
4. `docs/CEO_CONTINUOUS_WORK_20260525.md`（PENDING_QUEUE 状态）
5. `docs/PENDING_QUEUE_20260525_凌晨.md`（13 自决项 + PENDING_BOSS_DECISION）
6. `docs/INTEGRATION_AUDIT_20260525.md`（qa-047 audit P0/P1/P2/P3）
7. `docs/SPEC_family_members_schema_升级_方案ABC对比.md`（等老板拍板）
8. `git log --oneline -25`（真状态）

---

## 当前 background 3 个 Agent（compact 时刻）

| Agent | TICKET | 干啥 | 文件域 | 预计完工 |
|---|---|---|---|---|
| hotfix-057 | 057 | #1 头像没显示 + #2 删 Settings 我的口味偏好 整段 | Settings.tsx + 可能 wechat-mp-callback | ~60 分钟 |
| hotfix-058 | 058 | #6 cooking 退出 navigate /helper + 底部 TAB 删 settings | HelperCook.tsx + HelperTabBar.tsx | ~30 分钟 |
| hotfix-059 | 059 | #3 家人加减触发菜单实时变化 + ALGO_VERSION v66→v67 | useWeeklyMenu.ts + Settings.tsx | ~70 分钟 |

---

## 老板早上真测发现 6 个 P0 反馈（截至 compact 时刻）

| # | 反馈 | 状态 |
|---|---|---|
| 1 | 微信登录头像没显示 | ⏳ hotfix-057 在跑 |
| 2 | Settings 我的口味偏好 vs 家庭成员重合 — 老板 explicit 删 | ⏳ hotfix-057 在跑 |
| 3 | 加家庭成员后菜单没变 — 算法没识别 | ⏳ hotfix-059 在跑 |
| 4 | helper 界面右上角没有 en/fil/id 语言切换 | ❌ 待派（等 3 个 in-flight 完）|
| 5 | 菲佣 shopping 界面 spec 错位 — 应是"确认家里有哪些不必要再买"toggle 界面，不是备菜界面 | ❌ 待派 |
| 6 | cooking 退出回到雇主端 + 底部 TAB 重复 settings | ⏳ hotfix-058 在跑 |

---

## 待派工单（compact 后立即处理）

### TICKET-060 P0：Helper 端加语言切换（#4）

**老板 spec**：helper 界面右上角加 en / fil（Tagalog） / id（Indonesian）3 语言切换 chip（雇主端已有，helper 端缺）。

**实施 plan**：
- 抽 `HelperHeader.tsx` 新组件（icon + lang switcher + 国籍 chip）
- 改 `HelperHome.tsx` / `HelperCommunity.tsx` / `HelperSettings.tsx` 用新 header（3 个 helper page，不动 HelperCook / HelperPrep 避免 race）
- 复用现有 `useLanguage` / `t3()` 模式
- 估 60 分钟

**派 prompt 写好**（compact 后用）：

```
你是 Aieats UI Lead. /Users/jianjiao/Desktop/nutri-pilot_测试版.

TICKET TELEPOT-20260525-060 P0: Helper 端加语言切换 (#4 老板真测).

老板真测: helper 界面右上角没有 en/fil/id 语言切换. 雇主端有, helper 端缺.

任务:
1. 抽 src/components/HelperHeader.tsx 新组件 (复用现有 lang switcher chip 模式)
2. 改 HelperHome.tsx / HelperCommunity.tsx / HelperSettings.tsx 用新 header (3 个 helper page, 不动 HelperCook / HelperPrep)
3. 语言: zh / en / fil (Tagalog) / id (Indonesian) 4 选 1 (helper 端跳过繁体)
4. surgical edit, 主色橙保持

commit:
git add src/components/HelperHeader.tsx src/pages/HelperHome.tsx src/pages/HelperCommunity.tsx src/pages/HelperSettings.tsx
git commit -m "feat(helper-ui): TICKET-060 P0 helper 端右上加 4 语言切换 (老板真测 #4)"
git push origin main

技能沉淀 docs/skills/20260525_helper-060_lang_switcher.md.

预算 60k token.
```

### TICKET-061 P0：菲佣 Shopping 改成"我家有"toggle 界面（#5）

**老板 spec**：菲佣 shopping 应是"**确认家里有哪些不必要再买**"的界面（类似雇主 VerifyIngredients "我家有" toggle），不是 HelperPrep 现在的备菜界面。

**CEO 自决 spec**：
- 改 `HelperPrep.tsx` 替换/扩展现有备菜功能 → shopping list 界面
- 显示采购清单（复用 TICKET-049 食材聚合 + TICKET-038 supplier chip）
- 每行加 "🏠 我家有" toggle
- toggle 后 → 移到"已有"区灰掉
- 没 toggle 的 = 真正要买的
- 顶部 hero: "确认家里有哪些不需要再买"

**派 prompt 写好**（compact 后用）：

```
你是 Aieats UI Lead. /Users/jianjiao/Desktop/nutri-pilot_测试版.

TICKET TELEPOT-20260525-061 P0: 菲佣 Shopping (HelperPrep) 改成"我家有"toggle 界面 (#5).

老板真测: 菲佣 shopping 应是"确认家里有哪些不必要再买"toggle 界面 (类似雇主 VerifyIngredients), 不是现在 HelperPrep 的备菜界面.

任务:
1. Read src/pages/HelperPrep.tsx 现状
2. Read src/pages/VerifyIngredients.tsx (commit 9a92339 / bb08f93) 看 "我家有" toggle 模式参考
3. 改 HelperPrep:
   - 顶部 hero "确认家里有哪些不需要再买"
   - 列食材清单 (复用 aggregateIngredients from TICKET-049)
   - 每行 "🏠 我家有" toggle
   - 状态分: 待采购 / 已有 (2 区)
   - 已有的灰掉 + 移到"已有"区
4. 保留现有备菜功能? 老板 spec 暗示不要 — 完全替换. 如有 cooking prep 入口, 加按钮跳 /helper-cook.

commit:
git add src/pages/HelperPrep.tsx
git commit -m "feat(helper-ui): TICKET-061 P0 HelperPrep 改成 shopping (我家有 toggle, 老板真测 #5)"
git push origin main

技能沉淀 docs/skills/20260525_helper-061_shopping_我家有.md.

预算 70k token.
```

---

## Compact 后接力 plan（按 wake 触发）

1. 3 个 in-flight Agent 完工通知 → 自动 trigger wake
2. 每个通知后:
   - update morning report 标 ship
   - 看是否 spawn slot 空 → 派下一个待派 (TICKET-060 / TICKET-061)
3. 全 6 个 hot-fix 完工后:
   - 写 finalize morning report 续集 2
   - 等老板下一波反馈或 idle

---

## 老板规则（永久遵守，compact 后仍生效，memory 会自动 load）

- **大白话**对老板（禁工程黑话）
- **先推进后汇报**（小决策自决，大方向永不自决）
- **触碰原则先以优先完成再汇报**（老板加强授权）
- **用户能用 + 爱用**为最终目的
- **CEO 永不动 src/ 代码**（用 Agent 干）
- **明早上线 deadline**（老板已在真测中）

---

## 🔴 PENDING_BOSS_DECISION（仍未拍板）

1. **TICKET-056 RLS 安全 fix**（anon DELETE dishes，🔴 P0 上线前必修）
2. **家人 schema 升级方案 A/B/C**（CEO 推荐 B 新建 family_members 表）
3. **TICKET-054 P2** Settings 5 fetch 合并（现做 vs 上线后）
4. **TICKET-055 scale plan** batch2-3 菜系（CEO 推荐粤点 / 川凉菜 / 江南 / 北方面食）

---

**END OF COMPACT HANDOFF**

Compact 后第一个 turn 应该是：「老板，compact 接住了。当前 3 个 hot-fix 在 background（057/058/059），剩 #4 #5 待派。等通知或你新指令。」
