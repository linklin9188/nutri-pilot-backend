# Handoff — 2026-05-17 (开新窗口必读)

新 session 第一句话: **读 CLAUDE.md + docs/SESSION-2026-05-17.md + 本文件。**

## 仓库状态
- 分支 `main` · 工作树 clean · 所有改动已 push origin/main
- HEAD: `ffda7c5` (docs digest)
- Latest commits: see `git log --oneline -25`

## Supabase migrations 全清单

仓库 `supabase/migrations/` 20 个文件，远端 `supabase_migrations.schema_migrations` 17 个 version。差的 3 个是**重复编号文件**（同前缀已被另一个 version 占用），它们的内容已通过 node + pg.Client 直跑应用，DB 状态正确，仅 tracker 表没收录。

```
✅ 001  household_and_engagement
✅ 002  subscriptions
✅ 003  swap_feedback
✅ 004  michelin_and_chef
   004_stripe_events_drop_user_fk.sql       ← repo 有，applied via psql (tracker 不收)
✅ 005  user_profiles_wechat
✅ 006  health_tags_batch
   006_household_drop_auth_fk.sql            ← 同上
✅ 007  dishes_xiaomei_compat
✅ 008  dishes_nutrition_p1
   008_user_favorite_dishes.sql              ← 同上
✅ 009  fix_dirty_vegan_flags
✅ 010  user_profiles_display_name
✅ 011  tcm_health_tags
✅ 012  tcm_seed_dishes
✅ 013  wellness_tags
✅ 014  api_usage_daily
✅ 015  dishes_cultural_note          (本周加)
✅ 016  restaurant_places             (本周加)
✅ 017  dishes_kid_friendly           (本周加)
```

**应用新 migration 的模式**（绕开 Supabase CLI drift）：

```ts
// scripts/apply-N.ts (一次性 throwaway)
import { Client } from "pg"; import fs from "fs"; import "dotenv/config";
(async () => {
  const pg = new Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  await pg.query(fs.readFileSync("supabase/migrations/NNN_xxx.sql", "utf-8"));
  await pg.query(`INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`, ['NNN', 'name']);
  await pg.end();
})();
```

## ALGO_VERSION
`v30` — `src/hooks/useWeeklyMenu.ts:59`. 下游必须 import，下次改算法 bump 到 v31。

## Secrets / Env

**Supabase secrets** (set via `supabase secrets set`):
- `WECHAT_APPID` `WECHAT_APPSECRET` `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET`
- (SUPABASE_URL + SERVICE_ROLE_KEY 自动注入)

**Railway env vars** (用 `railway variables`):
- `VITE_SUPABASE_URL` `VITE_SUPABASE_ANON_KEY`
- `VITE_WECHAT_APPID` `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_PLACES_KEY` ← **可清**（Places API 已 backfill 完，前端不再调）

**本地 .env** (gitignored):
- `DATABASE_URL` `DIRECT_DATABASE_URL` (pg client)
- `GEMINI_API_KEY` `ANTHROPIC_API_KEY` (scripts)
- `GOOGLE_PLACES_KEY` ← **可清**

## DB 关键表 (新增)

```
public.restaurant_places       (migration 016 · 102 行 · 87 with photo)
  · restaurant_id (PK, matches hkRestaurants.ts id)
  · place_id · address · rating · phone · maps_url · image_url
storage.buckets/restaurant-photos    (102 jpg · 公网可读)

public.dishes
  · cultural_note      (015 · 353/713 填了)
  · is_kid_friendly    (017 · 387/713 = true)
```

## 待办（按优先级）

1. **WeChat OAuth 实测** — bouncer + guard 已 push (`5bd4c16`)，等真机测
2. **`/signin?source=wx` 优化** — WeChat 首屏体验调优（藏 IG/FB、自动 employer role、文案）
3. **删 Google Places API key** — 已用完，去 Google Cloud Console 删除
4. **Facebook OAuth credentials** — 等朋友 Meta App
5. **4D backfill 残留 19%** — 验证失败的菜手动 spot fix
6. **微信支付** — 等公众号开通 (现在已认证) → 申请 微信支付商户号

## 在做但没完的

- 周末 dining 100 家测试覆盖
- 家庭成员 nudge 真机点击体验

## 当前 Memory Index

`~/.claude/projects/-Users-jianjiao-Desktop-nutri-pilot/memory/MEMORY.md` 列了 12 条规则；最新加的 `no_political_imagery` 和 `execution_style` 必须遵守。
