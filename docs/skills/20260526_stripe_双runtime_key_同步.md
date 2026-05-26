# Stripe key 双 runtime 同步 — Railway + Supabase 都要配 (2026-05-26)

## 1. 问题

老板拿到 HK Stripe live `sk_live_*` 和 `whsec_*` 后，自然反应是"配在 Railway 上就行"。
但 Aieats 是**双 runtime 架构**：
- Railway 跑 `server.js`（Node Express，处理 SSR + 通用 API）
- Supabase 跑 Edge Functions（Deno，处理 `stripe-webhook` + `create-checkout-session` 等）

两个 runtime 各自有独立的 secret 存储——只在 Railway 配，Supabase Edge Function 拿不到，
webhook 来了直接 silent fail；只在 Supabase 配，Railway 的 server.js 调 Stripe API 也挂。

老板这次踩了 admin 后台报 `supabase not configured` 503——同理是 Railway 没拿到 Supabase
service_role key。一摸一样的双环境分歧问题。

## 2. 方法

**Stripe live key 同步矩阵**：

| 变量 | Railway server.js | Supabase Edge Functions | 用途 |
|---|---|---|---|
| `STRIPE_SECRET_KEY` (sk_live_*) | ✅ 配 | ✅ 配 | 调 Stripe API |
| `STRIPE_WEBHOOK_SECRET` (whsec_*) | ❌ 不用 | ✅ 配 | 验 webhook 签名 |
| `STRIPE_PUBLISHABLE_KEY` (pk_live_*) | ❌ | ❌ | 前端 build-time 注入，写 `.env` `VITE_STRIPE_PUBLISHABLE_KEY=` |
| `SUPABASE_URL` | ✅ admin 后台需要 | (自身就是) | server.js 调 supabase REST |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ admin 后台需要 | (自身就是) | server.js bypass RLS 查 admin 数据 |

**Supabase service_role key 找哪**：
- Dashboard → Settings → API → **Legacy tab**（不是新的 Publishable/Secret tab）
- "Legacy anon, service_role keys" 区域，service_role 是带 `eyJ...` 的长 JWT
- 新 Publishable tab 给的是新格式 key（pk_ / sk_），目前 server.js 走的老协议，
  必须用 Legacy tab 那个 service_role JWT

**配完立刻 verify**：
1. Railway: `curl https://nothinkeats.com/api/admin/orders -H 'authorization: Basic ...'`
   返 200 + JSON 才算配对；返 503 "supabase not configured" 表示环境变量没生效。
2. Supabase webhook：`curl -X POST https://<project>.supabase.co/functions/v1/stripe-webhook`
   返 `Invalid signature` 表示在跑（签名失败正常，因为不是真 webhook）；
   返 `function not found` 才是没部署。
3. Supabase create-checkout-session: 试一个不存在的 price_id 应返 "unknown price_id"
   而不是 "stripe key missing"。

**Railway 改 env 后必须重启 service**——Railway 不会自动 reload，老板可能以为加了就生效。
方法：Dashboard → Service → Settings → Restart，或者新 push 触发 redeploy。

## 3. 标准

**新接入第三方服务 secret 的不变量**：

1. **先列环境清单**：每个 secret 必填到哪些 runtime——Railway / Supabase / 前端 build-time（.env）/
   GitHub Actions / 本地 dev。漏一处必出 silent fail。
2. **每个 runtime verify 一遍**：不要靠"我配过了"，必须 curl / 真测一次。
3. **secret 命名一致**：`STRIPE_SECRET_KEY` 在 Railway 和 Supabase 都用同名，
   不要起 `STRIPE_SK` / `STRIPE_API_KEY` 等混名，code 里 fallback `process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SK` 是反模式。
4. **service_role key 是核武器**：bypass 全部 RLS，泄露 = DB 全开。只配在 server.js / Edge Function，
   绝不暴露给前端 `.env`（VITE_ 前缀会进 bundle）。
5. **Railway env 改完立刻 Restart**：Settings → Restart 后再 curl verify，不要假设自动 reload。
