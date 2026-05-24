# Integration Audit — 2026-05-25 (TICKET-047 P1 第 5 步整合联调)

**Auditor**: QA + Performance Lead
**Scope**: sprint 11 (20 commits, ALGO_VERSION v66) 全链路 audit + 性能 + 跨语言
**Method**: 代码 audit + vite build 度量（curl 实测被 sandbox 拒，未做 production HTTP probe）
**Baseline**: HEAD `1cf805d` (TICKET-044 ship 后)

---

## TL;DR

- **P0**: 0 个（无功能阻塞）
- **P1**: 2 个（1 个已顺手修，1 个需 follow-up）
- **P2**: 5 个（性能 + 一致性 + i18n 缺失）
- **P3**: 3 个（设计精修类）
- **顺手 fix**: 1 commit（Login + WeChatCallback 路由统一走 RootRedirect）

老板真测前要先看的高风险区：**Login → OnboardingV2 链路**、**Settings 5 个独立 fetch**、**Bundle 1.7 MB 单 chunk**。

---

## P1 — 必修（影响新用户/资金流）

### P1-1 [已顺手修] 新用户登录后绕过 OnboardingV2 走旧 QuickSetup

**症状**: 老板真测 checklist §8 "新用户注册 → 跳 /onboarding-v2" 不会成立。

**Root cause** (2 处独立 bug):

1. `src/pages/Login.tsx:189` — `goAfterLogin()` 用旧判定 `localStorage.getItem("quickPrefs") ? "/" : "/setup"`。新用户没 quickPrefs → 跳 `/setup` (QuickSetup 11 题旧路径)，不走 `RootRedirect` 三态判定，也不走新 `/onboarding-v2`。
2. `src/pages/WeChatCallback.tsx:61-63` — `newUserDest = role === 'helper' ? '/helper' : '/setup'`。真 WeChat OAuth 路径上 isNew=1 直接跳 `/setup`。

新 spec (RootRedirect 第 154 行): `hasQuickPrefs || hasV3Done || hasV2Done` 才 Home，否则 `/onboarding-v2`。Login + WeChatCallback 都绕开了这条判定。

**Fix**: 两处都改为 `navigate('/')`，让 RootRedirect 接管路由（commit included in this audit, see git log）。

**回归风险**: 极低 — RootRedirect 仅多了一次同步路由判定。

---

### P1-2 [未修] WeChat OAuth 真路径不消费 `nutri_pending_ref_code`

**症状**: 老板通过 WeChat 内打开 `/login?ref=AGENCY123` → 输入推荐码 → 登录 → 跳 OAuth → WeChatCallback 落地 → **referred_by_agency_id 不写**。

**Root cause**:

- `src/pages/Login.tsx:278` 写入 `localStorage.setItem('nutri_pending_ref_code', code)` 并注释 TODO ("/auth/wechat/done 消费 nutri_pending_ref_code (TODO)")。
- `src/pages/WeChatCallback.tsx` 没读取也没消费这个 key。

**影响**: 中介裂变 TICKET-043 在真 WeChat 路径 100% 漏 attribution。Dev fallback (desktop 浏览器) 路径正常。

**Fix proposal** (留下一棒): WeChatCallback useEffect 内拿到 userId 后立即:

```ts
const pendingRef = localStorage.getItem('nutri_pending_ref_code');
if (pendingRef) {
  // (复用 Login.tsx 内的 attributeReferralCode 逻辑, 提到 src/lib/agency.ts)
  attributeReferralCode(userId, pendingRef).catch(() => {});
  localStorage.removeItem('nutri_pending_ref_code');
}
```

---

## P2 — 应修（影响体验/性能）

### P2-1 OnboardingV2 完全没有 i18n

- `src/pages/OnboardingV2.tsx` 0 个 `useLanguage()` 调用，~122 行中文字符全硬编码（"哪些菜你家爱吃？" / "食材大类 · 多选" / "近期目标" 等）。
- 045 commit 后默认 zh 风险被缓解（zh-Hant/en/tl/id 用户 session-once 强制 reset 到 zh），但 LanguageSwitcher 切换后 OnboardingV2 仍是中文。
- **影响**: 国际化用户体验破。Onboarding 是新用户第一印象，破坏感大。
- **建议**: 后续 ticket 整理 12 道菜 label + 8 个 chip label + 5 个 goal label 上 t3()。

### P2-2 Settings.tsx 5 个独立 useEffect 各拉 user_profiles 一次

- L443 `taste_pref_free_text`
- L503 `hometown_cuisine, cuisine_preference, spice_tolerance, taste_intensity, cooking_methods_pref, excluded_meats, excluded_ingredients, cooking_frequency_per_week, budget_level` (9 列)
- L553 `households` (不是 user_profiles，但是同时启动)
- L632 `referred_by_agency_id`
- L657 `display_name, avatar_b64, avatar_url, nickname` (4 列)

进入 Settings 触发 4-5 个并发 SELECT 同一行。**应合并为 1 个 SELECT 18 列**。
节省的不只是 HTTP round-trip — Supabase PostgREST 每次 SELECT 都过一遍 RLS 检查。

### P2-3 Bundle 1.7 MB 单 chunk (gzip 525 KB)

`vite build` 输出:
```
dist/assets/index-BWhyOD-4.js   1,697.06 kB │ gzip: 525.00 kB
(!) Some chunks are larger than 500 kB after minification.
```

中低端手机 3G 网络 ~5s 才能下载完，Time-to-Interactive 显著推后。

**应做**:
- Pricing / Banquet / ProSchoolBalance / ProWellness / WeChatCallback 这些不常用页面用 `lazy()` 切 chunk
- `motion/react` 已是大头，可以 deferred
- admin/ 子项目独立构建，不应进入主 bundle（建议确认 admin 是 separate vite project）

### P2-4 `useWeeklyMenu.ts` static + dynamic import 冲突

vite 警告原文:
```
useWeeklyMenu.ts is dynamically imported by Home.tsx but also statically imported by
banquet.ts, weeklyDiarySummary.ts, ChatAgent.tsx, Home.tsx, VerifyIngredients.tsx,
WeeklyMenu.tsx, dynamic import will not move module into another chunk.
```

Home.tsx:145 试图用 `await import('../hooks/useWeeklyMenu')` 但已经在文件顶部 `import { useWeeklyMenu, ... }` static 引入了 — dynamic 完全无效。

**Fix**: 要么去掉 Home.tsx 顶部 static import，要么去掉 dynamic import（前者实际不可行，因 useWeeklyMenu hook 必须 top-level 调用）。建议**去掉 dynamic import**，因为 hook 已 hard dependency。

### P2-5 Home.tsx 745 行 useEffect 拉 households 嵌入 user_profiles 强耦合 helper_id FK

`select("id, invite_code, household_members(helper_id, user_profiles!helper_id(display_name))")`

- Smell 3 CLAUDE.md 写 B-1 已修（migration 025 helper_id text + FK）。但 Settings.tsx:680 同样 pattern 二次 fetch。
- 这是 N+1 select 风险。如果 `household_members` 多行（多 helper 家庭），单次嵌入 JSON 会比并查更慢。
- **影响**: 当前小，未来双 helper 家庭会显眼。
- **建议**: 拆 2 个 select（households → ids → user_profiles in()）。

---

## P3 — 设计精修类（不阻塞内测）

### P3-1 Settings 不显示 OnboardingV2 写入的 `avoid_tags`

OnboardingV2.tsx:287 把 5 过敏原 (seafood/nuts/gluten/milk/eggs) 写 `user_profiles.avoid_tags`。Settings.tsx:510 SELECT 只取 `excluded_meats`，**不显示 avoid_tags**。

新用户做完 onboarding 进 Settings 找不到自己刚才选的过敏原，会有"是不是没保存"困惑。

**建议**: Settings 加 avoid_tags chip group 显示 + 可改。

### P3-2 Swap candidate 不走 vector recommendation

`fetchSwapOptions` (useSupabaseMenu.ts:737) 只做 protein family 硬过滤 + course_type 过滤，不用 `preference_vector` 排序。

主推路径走 vector cosine，swap 路径不走 — 算法一致性偏弱（user "换一道" 时按 family + random，不按个人偏好相似度）。

**建议**: swap 也走 vector top K (传 userVec + family-filtered pool)。

### P3-3 images 无 `loading="lazy"`

- Home.tsx:1545 / 2134 / 2289 / 2360 — 4 处 `<img>` 无 lazy attribute
- OnboardingV2.tsx:406 — 12 张 onboarding 图无 lazy（onboarding 全部即看可接受）
- WeeklyMenu.tsx 多处 dish image 无 lazy

中低端 Android Chrome 默认 viewport 之外 5 屏会预拉 img — 浪费数据。

**建议**: 列表型 `<img>` 加 `loading="lazy" decoding="async"`。

---

## 性能 audit summary

| 指标 | 当前 | 建议目标 | 优先级 |
|---|---|---|---|
| Bundle (gzip) | 525 KB | < 250 KB | P2 |
| Chunks | 1 | ≥ 5 (route-based) | P2 |
| Home useEffect | 10 个 | < 6 (合并 / lift to hook) | P3 |
| Settings useEffect 拉 user_profiles | 5 处 | 1 处 | P2 |
| image lazy | 0% | 100% (列表) | P3 |
| Vite warning | 1 (useWeeklyMenu) | 0 | P2 |

---

## 跨语言抽样 (5 关键页)

| 页面 | useLanguage | 中文行数 | i18n 覆盖率 | 状态 |
|---|---|---|---|---|
| Login | ✓ (t) | 118 | 中 | OK (有 t() 函数大量调用) |
| OnboardingV2 | ✗ | 122 | 0% | **P2 - 0 i18n** |
| Settings | ✓ (t4, isChinese 仅 3 处) | 401 | 低 | P2 - 大量硬编码 |
| HelperHome | ✓ (t3) | 88 | 高 | OK |
| HelperSettings | ✓ (t3) | 43 | 高 | OK |
| HelperCommunity | ✓ (t3) | (未数) | 高 | OK |

**结论**: helper 端 i18n 良好（菲佣/印佣 native lang 必需），雇主端 Settings + OnboardingV2 大量硬编码中文。**老板 045 锁默认 zh 简体后** 这是低优先 — 但国际化 + zh-Hant HK 用户体验会差。

---

## 老板真测重点区域 (基于本 audit)

按风险从高到低排：

1. **新用户全链路 (P1-1 已修)** — 内测前最高优先级再真测一遍：清 localStorage → /login → 微信/dev 登录 → 应跳 `/onboarding-v2`（不是 `/setup`）。
2. **WeChat 真路径 + 推荐码 (P1-2 未修)** — 老板找朋友 WeChat 内打开 `/login?ref=XXX` → 输入码 → 真 OAuth → 看 user_profiles.referred_by_agency_id 是否写入（应该没写，符合 P1-2）。
3. **Settings 全链路** — 进 Settings 页观察 5 个并发 fetch (Network tab)。功能应正常但性能感差。
4. **Helper 端切换流程** — /helper → /helper-settings → /prep → 各 tab 切换无白屏 + 底部 5-tab bar 不消失。
5. **VerifyIngredients SKU chip** — Supplier 全是 pending，所以**不应显示** "X 直供" chip。要测显示，跑 SQL `UPDATE suppliers SET status='active' WHERE name LIKE 'Aieats Italian%'` 后刷新。
6. **多语言** — OnboardingV2 + Settings 切到 en/tl/id 看是否大量中文残留（预期 P2-1 / P2 状态）。

---

## 顺手修 commit

本 audit 内一次顺手修（5 行内，符合红线）：

- `src/pages/Login.tsx:187-190` — goAfterLogin 改 navigate('/')
- `src/pages/WeChatCallback.tsx:56-63` — dest 改不区分 isNew，永远 '/'

让 RootRedirect 接管三态路由，新用户能进 OnboardingV2。

---

## 下一棒建议

按 P1 → P2 顺序派单：

1. **HOTFIX-048 (P1-2)**: WeChatCallback 消费 nutri_pending_ref_code → 中介裂变真 OAuth 路径 attribution 闭环
2. **PERF-049 (P2-3+4)**: vite manualChunks 拆 5+ chunk + 解决 useWeeklyMenu static/dynamic 冲突 → bundle < 300 KB
3. **REFACTOR-050 (P2-2)**: Settings 5 fetch → 1 fetch user_profiles 18 列
4. **I18N-051 (P2-1)**: OnboardingV2 12 dish label + 8 chip + 5 goal label 上 t3()
5. **POLISH-052 (P3-1)**: Settings 加 avoid_tags chip group
