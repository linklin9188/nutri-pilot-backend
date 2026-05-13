# Stripe 订阅接入

完整流程图：

```
[user] → /pricing → 点"升级到 Pro"
              ↓
        POST /functions/v1/create-checkout-session
              ↓ (creates Stripe Checkout Session)
        Stripe → 用户填卡完成支付
              ↓
        Stripe redirect → /pricing?status=success
              ↓ (frontend calls refreshSubscriptionFromSupabase)
        UI 显示 "Pro 已开通"
              ↓
        Stripe webhook → /functions/v1/stripe-webhook
              ↓ (service-role updates user_profiles.is_pro = true)
        所有客户端下次刷新都看到 Pro 状态
```

## 一次性配置

### 1. Stripe 侧（仪表盘）

1. 注册账号 https://dashboard.stripe.com (test mode 即可上线测试)
2. **Products → + Add product**：
   - 名称：爱吃 Pro
   - 货币：**HKD（港币）**
   - 添加三个价格（都是 recurring）：
     - HK$66 / 月
     - HK$199 / 半年（Billing period = 6 months）
     - HK$365 / 年
3. **早鸟价（月度前 3 个月 HK$30）** — 用 Stripe Coupon 实现：
   - **Products → Coupons → + New**：
     - Type: Percentage off → 54.5%（66 → 30）
     - Duration: Repeating
     - Number of months: 3
   - 在月度 Price 配置或 Promotion Code 中关联此 Coupon；Checkout 时通过 promotion code
     输入。`allow_promotion_codes: true` 已在 `create-checkout-session` 打开。
4. 复制三个价格的 `price_xxx` ID，填到：
   - `src/pages/Pricing.tsx` 的 `STRIPE_PRICE_IDS`
   - `supabase/functions/stripe-webhook/index.ts` 的 `PRICE_TO_PLAN`
5. **Developers → Webhooks → Add endpoint**：
   - URL：`https://<你的-supabase-project>.functions.supabase.co/stripe-webhook`
   - 监听事件：
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - 复制 Signing Secret (`whsec_...`)。

### 2. Supabase 侧

1. **SQL Editor** → 跑 `supabase/migrations/002_subscriptions.sql`
2. **Edge Functions → Secrets** 设置：
   - `STRIPE_SECRET_KEY` = `sk_test_...`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
   - （`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 是自动注入的，不用手动加）
3. 部署三个函数（用脚本一把梭）：
   ```bash
   cd supabase/functions
   ./deploy.sh
   ```
   或者手动：
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy create-portal-session
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   `stripe-webhook` 必须 `--no-verify-jwt`，因为 Stripe 不发 Authorization header；我们通过签名校验做认证。
4. **Customer Portal**（让用户自助换卡 / 取消 / 下载发票）：
   Stripe Dashboard → Settings → Billing → Customer portal → 打开开关，
   开启 payment methods / cancel subscription / plan switch 等功能。
   前端 `Pricing` 页右上"管理订阅"按钮调 `create-portal-session` 拿到
   一次性 URL 跳过去。

### 3. 前端环境变量

`.env.local`（git 不收）：

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 上线前测试

1. `npm run dev`，登录任意账号，进入 `/pricing`。
2. 点 **"升级到 Pro · HK$348"** → 应跳到 Stripe Checkout 页。
3. 用 Stripe 测试卡 `4242 4242 4242 4242`，任意未来到期日 + 任意 CVC。
4. 完成后回到 `/pricing?status=success`，应显示"订阅成功"。
5. Supabase Table Editor → `user_profiles` → 自己那行 `is_pro = true`、`subscription_end_at` 有值。
6. WeeklyMenu 页右上角 chip 从"升级米其林"变为可点的"AI 规划 / 米其林"切换。

## 本地无 Stripe 配置时

`Pricing.tsx` 提供了一个 **Skip payment (dev only)** 按钮：
- 直接走 `devActivatePro()`，本地标记为 Pro。
- 不调任何远端，方便测试 Pro 状态下的 UI。
- 上线前请把按钮删掉（在 `Pricing.tsx` 搜 `devActivatePro` 删除该 JSX 块）。

## 已知 TODO

- Customer Portal（用户自助取消/管理订阅）：用 `stripe.billingPortal.sessions.create()`
  加一个 `create-portal-session` Edge Function，在 Pricing.tsx 上加"管理订阅"按钮。
- 退款 / 失败处理：现在 `invoice.payment_failed` 只是 log；可加邮件通知或在 UI 显示"支付失败"提示。
- 试用期：在 Checkout Session 加 `subscription_data.trial_period_days`。
