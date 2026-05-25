# TICKET-078 P0: 30 天免费体验硬接

## 问题

老板拍板双收入商业模式 (2026-05-25)：**任何用户免费体验 1 个月，到期没取消就按订阅扣**。

实查现状有"软"trial 但从未真起作用：
- migration 078 admin view 算了 `trial_end_at = created_at + 30 days`，但只是 view 派生字段，前端 `useSubscription` 不读它
- `src/lib/userLifecycle.ts` 的 `isWithinTrial()` 是 localStorage `nutri_first_login_at` 算的，跨设备/重装就丢
- Home 顶部 `TrialExpiredCard` 只在 `!isPro && !isWithinTrial()` 才显示，但 trial 期内 0 提醒，用户根本不知道有"试用期"概念
- Pro 工具 paywall (ProGate) 走 `isPro`，trial 期间 `isPro=true`，过期掉回 `false` —— 但**过期判断完全靠 LS**，不存在真正的 DB 商业化字段

要让 30 天免费体验真生效 + 到期触发 paywall + 给用户友好倒计时提醒。

## 方法

**3 层落地，DB / hook / UI 各 1 层，每层有真真的源**：

### Layer 1 — DB (migration 093)
- `user_profiles.trial_end_at timestamptz` nullable 加列
- 一次性 UPDATE 把所有现存 92 行回填 `created_at + 30 days`（溯及既往）
- `BEFORE INSERT` trigger `fn_set_trial_end_at()` 给新行自动塞 `COALESCE(created_at, now()) + 30 days`
- nullable 不破现有 INSERT；`IF trial_end_at IS NULL` 兜底保留 caller 显式覆盖能力 (e.g. 邀请奖励延长试用)

### Layer 2 — Hook (`src/lib/subscription.ts`)
新增三态枚举 `SubscriptionTier = 'trial' | 'paid' | 'expired'` 不破现有字段：
- `refreshSubscriptionFromSupabase` SELECT 加 `trial_end_at` → 写 LS `nutri_trial_end_at`
- `readLocal` 三态计算：`paidIsPro || helper → 'paid'`；`!paid && trialEndAt > now → 'trial'`；`else 'expired'`
- 同时算 `trialDaysLeft = ceil((trialEndAt - now) / 1 day)`
- `isPro = tier === 'paid' || tier === 'trial'` —— trial 期照旧解锁，**所有现有 ProGate / Banquet / ProWellness 调用方零改动兼容**
- LS 旧 `isWithinTrial()` 作为兜底（DB 列未拉到时） → 一旦 LS mirror 拿到 DB 值就完全切到 DB-truth

### Layer 3 — UI (`src/components/TrialBanner.tsx`)
- 仅 trial 剩 ≤ 7 天 (`TRIAL_WARN_DAYS=7`) 或 expired 显示，paid 永不渲染
- trial 橙底 (`#FF5A1F` 主题) + "免费体验 · 剩 N 天 / 之后 HK$66/月" + 升级按钮
- expired 红底 (`#E53935` 警告) + "免费体验已结束" + 升级按钮
- 三语 `t3` (zh / en / tl) 全覆盖；点 [升级 →] 跳 `/pricing`
- 插在 `Home.tsx:1346`（Hi 昵称 chip 之后，IntentInputBox 之前）

## 标准

**今后凡商业化字段必须 DB 真存 + 前端 hook 读 + UI 真渲染，不能只 admin view。**

- ❌ 反模式：admin view 算 `trial_end_at = created_at + 30d` 但前端 hook 不读 → 用户视角"没有 trial"
- ✅ 正模式：DB 加列 + trigger 兜底 + hook SELECT + LS mirror sync 读 + UI banner 真显示

**回滚策略**：
- 前端：移除 `TrialBanner` 引入 + 撤 `subscription.ts` 新增字段，old `isWithinTrial` LS 兜底自动接管，0 故障
- DB：`trial_end_at` 列保留不破任何东西（nullable + trigger），删 trigger 后回到无效果状态

**测试路径** (老板)：
1. SQL `SELECT id, created_at, trial_end_at, is_pro FROM user_profiles WHERE id='<userId>'` → trial_end_at 应 ≈ created_at + 30d
2. 进 Home：trial 剩 ≤7 天 → 橙 banner；> 7 天 → 不显示；已 paid → 不显示
3. 模拟到期：`UPDATE user_profiles SET trial_end_at = now() - interval '1 hour' WHERE id='<userId>'` → 进 Home 红 banner + ProGate 触发 paywall
