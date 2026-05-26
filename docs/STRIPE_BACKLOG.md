# STRIPE 相关 backlog（老板 2026-05-22 ~17:30 拍板放下，待后续回来再看）

> 老板原话："stripe先放下，优化好算法、数据库、登陆流程。这是核心"

---

## 当前问题快照（5-22 ~16:50 报）

1. **AIEATS_BETA 促销码输入后失效** — 用户在 Stripe Checkout 输入 AIEATS_BETA 报失效
2. **Stripe 账户激活流程未完成** — Dashboard 显示"激活您的账户"流程在"个人详情"步骤停留
3. **老板自查记得已激活，但实际看到激活流程未完** — 需老板亲自看 Dashboard 顶部横幅 / 账户名 / Settings → 账户状态 3 个标志

---

## 老板回来后做（30 秒确认）

去 Stripe Dashboard `dashboard.stripe.com` 切到**真实账户**（右上角紫色"切换到真实账户"按钮消失），看 3 个标志：

1. Dashboard 顶部横幅 — 有"激活您的账户"？= ❌ 没激活
2. 左上角账户名 — 写"沙盒"灰色 = ❌ 沙盒模式 / 写公司名 + Live = ✅ 已激活
3. Settings → 账户状态 — "已启用" / "Account fully enabled" = ✅

3 个标志全 ✅ = 真激活 → 重建 AIEATS_BETA 即可
任一 ❌ = 把激活流程跑完（5 步：商家类型 / 个人详情 / 公司详情 / 产品服务 / 公开详情 / 提交审核）

---

## 后续 ticket（待派）

### UI 030（前端促销码检测）
- src/pages/Pricing.tsx 加 fetch Stripe API 看 AIEATS_BETA 是否有效
- 失效自动 fallback UI："促销已结束 · 联系客服领新码"
- 避免用户复制后输入失败的尴尬体验
- 预算 ~40k token / ~$0.6

### Backend 023（Stripe webhook 监听 promotion_code 配额）
- supabase/functions/stripe-webhook 加 promotion_code 监听
- 写一行 stripe_events 当 AIEATS_BETA 用满
- 触发桌面通知 + Algorithm 端 sessionStorage cache 清掉
- 预算 ~50k token / ~$0.8

### CEO 协助（待老板 Stripe 操作完成后）
- 帮老板验证 STRIPE_SECRET_KEY 是 sk_test 还是 sk_live
- 帮老板在 live mode 创建 AIEATS_BETA 新 promo code（max_redemptions 设 1000）
- 验证用户在 nothinkeats.com 真能用

---

## 实查代码（CEO 5-22 实查记录）

- `supabase/functions/create-checkout-session/index.ts` 用 env `STRIPE_SECRET_KEY`
- ALLOWED_PRICE_IDS 写死 3 个：`price_1TXD3dL2TBEx2Gg0TRBnWrE9` / `price_1TXDCwL2TBEx2Gg0n6pSJLsJ` / `price_1TXDDjL2TBEx2Gg05nADOkJb`
- 这 3 个 price ID 在 test 还是 live mode 看名字看不出，需老板在 Dashboard 验证
- `src/lib/promo.ts` 注释明确"promo permanently off" — 业务侧促销机制 2026-05-16 已下线，Stripe Dashboard 那边的 AIEATS_BETA 是独立配置

---

老板回来想优先 Stripe 时打开此文档 + 跑 30 秒确认。
