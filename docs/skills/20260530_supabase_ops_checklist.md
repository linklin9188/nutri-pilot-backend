# Supabase 操作前必查清单

**问题**: 今天问老板要微信 AppSecret，实际上早已存在 Supabase secrets 里了。重复劳动，浪费老板时间。

## 规则：拿到任务先跑 3 条命令

```bash
# 1. 看已有 secrets（避免重复要）
supabase secrets list

# 2. 看已部署的 edge functions（避免以为缺失）
supabase functions list

# 3. 看 DB 迁移状态（避免重复建表/列）
supabase migration list
```

## secrets key 命名惯例（本项目）

| 用途 | Key 名 |
|---|---|
| 微信公众号 AppID | `WECHAT_APPID` |
| 微信公众号 AppSecret | `WECHAT_APPSECRET` |
| Gemini API Key | `GEMINI_API_KEY` |
| Stripe Secret Key | `STRIPE_SECRET_KEY` |
| Stripe Webhook Secret | `STRIPE_WEBHOOK_SECRET` |
| Supabase DB URL | `SUPABASE_DB_URL` |
| Supabase Service Role Key | `SUPABASE_SERVICE_ROLE_KEY` |

## 常见错误

- `WECHAT_APP_SECRET` ❌ → 正确是 `WECHAT_APPSECRET` ✓（下划线位置不同）
- edge function 读取时用 `Deno.env.get('WECHAT_APPSECRET')` 不是 `WECHAT_APP_SECRET`

## 新增 secret 的标准流程

```bash
# 不要问老板运行命令，自己跑
supabase secrets set KEY_NAME=value
supabase functions deploy function-name --no-verify-jwt
```
