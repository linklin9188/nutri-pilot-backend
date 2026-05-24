# Skill: 第 5 步整合联调 audit (TICKET-047)

**沉淀日期**: 2026-05-25
**适用场景**: 大 sprint 落地后内测前 polish，需要跨模块发现 bug + 性能问题 + 一致性问题。

---

## 一、这次 audit 找到了啥（成果）

跑了 ~80k token 的代码 audit + vite build 度量，**2 个 P1 + 5 个 P2 + 3 个 P3**：

**P1 — 必修**:
1. 新用户登录后绕过 OnboardingV2 走旧 QuickSetup（Login.tsx + WeChatCallback.tsx 两处都把 `/setup` 硬编码，绕开 RootRedirect 三态判定）— **已顺手修 5 行**
2. WeChat 真 OAuth 路径不消费 `nutri_pending_ref_code` → 中介裂变 attribution 漏（Login 自己 TODO 都写了）

**P2 — 应修**:
- OnboardingV2 完全无 i18n（0 useLanguage 调用）
- Settings 5 个 useEffect 并发拉 user_profiles 同一行
- Bundle 1.7 MB / gzip 525 KB 单 chunk
- vite 警告 useWeeklyMenu static + dynamic import 冲突
- Home 嵌入查询强耦合 helper_id FK，N+1 select 风险

**P3 — 设计精修**:
- Settings 不显示 OnboardingV2 写的 `avoid_tags`
- swap candidate 不走 vector recommendation（算法一致性弱）
- `<img>` 无 `loading="lazy"`

---

## 二、方法论（怎么找的）

### 1. 先读"成绩单"摸底
读 `docs/MORNING_REPORT_20260525.md` 了解 sprint 11 ship 了啥、有哪些自决项、哪些路径"看似 OK 但其实绕了 spec"。
**关键点**: CEO 自决项里写"navigate('/') 不是 navigate('/home')" 这类妥协 — 顺着这种妥协找绕过路径的 bug。

### 2. 跨模块全链路 trace（不真跑 Playwright）
- **新用户链路**: `/login` → 登录 → 应路由 → OnboardingV2 → DB 写入 → RootRedirect → Home → 拉 weekly menu → vector cascade
- **每一步 grep 实际 navigate target**: Login.tsx 内 `grep navigate` / WeChatCallback 内 `grep navigate` / OnboardingV2 finish 内 `grep navigate`
- **逐个对照 spec**: RootRedirect 三态判定 (`hasQuickPrefs || hasV3Done || hasV2Done`) 是 spec，那 Login/WeChatCallback 是否也用同样判定？否 → bug。

### 3. 性能 audit 三板斧
- `npx vite build` 看 bundle + 警告
- `grep -c "useEffect" src/pages/*.tsx` 看 useEffect 密度
- `grep "from('user_profiles'" src/pages/Foo.tsx` 看是否重复 fetch 同一表

### 4. i18n 抽样
- `grep -cn "[一-龥]" src/pages/*.tsx` 数中文字符行数 → 粗略 i18n 缺失指标
- `grep -n "useLanguage\|t3\|t4" src/pages/Foo.tsx` 看是否有 i18n hook

### 5. 红线: audit 不修 bug
只发现 + 报告 + 老板/下一棒 fix。但**极简单 typo / 漏 fallback < 5 行**可以顺手修（本次修了 Login + WeChatCallback 路由）。

---

## 三、下次同类任务的标准

### MUST DO (按顺序)
1. **读 morning report / sprint 总结** — 别一头扎进代码
2. **画跨模块链路图** — 用户视角，从入口到出口，每一步 grep 实际路由
3. **跑 vite build** — bundle warning 是免费 P2
4. **i18n 抽样** — 5 关键页 useLanguage 计数
5. **写报告分 P0/P1/P2/P3** — 老板要 prioritization，别只列 bug
6. **每个 finding 都有 root cause + 影响 + fix 建议** — 报告才有用

### MUST NOT DO
- 不要真改业务逻辑（fix 留下一棒）
- 不要打 Playwright（设置成本太高，代码 audit 已够）
- 不要 build 大段 mock 数据测 prod（curl 实测就好）
- 不要碰 auth.users / RLS / 任何 ALGO_VERSION

### 预算时间分配
80k token 大致：
- 30% 跨模块链路 audit（最重要，找 P0/P1）
- 20% 性能 audit (bundle / useEffect / 重复 fetch)
- 15% i18n 抽样
- 30% 写报告 + 沉淀
- 5% 顺手 fix + commit

---

## 四、复用模板

下次类似 ticket 直接复用 `docs/INTEGRATION_AUDIT_20260525.md` 模板:

```
## TL;DR
[P0/P1/P2/P3 各 N 个，老板真测高风险区清单]

## P1 — 必修
### P1-X [已修/未修] <简短描述>
**症状**: <用户视角>
**Root cause**: <代码 file:line + 一两句话>
**影响**: <谁会遇到 / 多少用户>
**Fix**: <已修 commit / 未修 proposal>

## P2 — 应修
[同上格式]

## 性能 audit summary
[表格: 指标 / 当前 / 目标 / 优先级]

## 跨语言抽样
[表格: 5 关键页 / useLanguage / i18n 覆盖率]

## 老板真测重点区域
[基于 audit 排出的高风险测试清单]

## 顺手修 commit
[< 5 行 / commit 的 typo / fallback]

## 下一棒建议
[按 P1 → P2 顺序排的 ticket 标题]
```
