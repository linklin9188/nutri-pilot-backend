# CLAUDE.md — Aieats / 爱吃 / nothinkeats.com

Loaded on every Claude Code session. Read top-to-bottom before any non-trivial change.

## Stack
- Frontend: React 18 + Vite + TypeScript + Tailwind + motion + react-router-dom
- Backend: Supabase (Postgres + RLS + Edge Functions on Deno) — Frankfurt EU region
- AI: Gemini (proxied via edge function; frontend has NO direct key)
- Payments: Stripe (live mode, HKD)
- Hosting: Railway → `nothinkeats.com`
- WeChat: `wechat-mp/` web-view shell (AppID `wx60f6708a777dc896`)

---

## ⚠️ Hard invariants — break these and the app breaks

### Custom auth, not Supabase Auth
`userId` lives in `localStorage` only; `auth.users` table is empty.

- **Never** add FK→`auth.users` on any table — inserts will silently fail (this has bitten before; migration 004 had to drop `stripe_events` FK).
- Read userId via `getUserId()` from `src/lib/userId.ts` (handles legacy `userId` ↔ `nutri_user_id` key migration). Don't `localStorage.getItem('userId')` directly anywhere new.
- `setUserId(id)` writes both keys.
- Don't add `auth.uid()` to RLS policies.

### Gemini calls go through `gemini-proxy` edge function
Frontend bundle has NO Gemini key. `VITE_GEMINI_API_KEY` is removed.

- Use `callGemini({ endpoint, contents, generationConfig?, model? })` from `src/lib/geminiProxy.ts`.
- Endpoints: `vision`, `michelin`, `school_balance`, `recipe`, `intent`. Each has its own daily quota in `api_usage_daily`.
- New Gemini call site → add a new `endpoint` to `supabase/functions/gemini-proxy/index.ts`, never reintroduce direct frontend calls.

### `ALGO_VERSION` cache busting
Constant in `src/hooks/useWeeklyMenu.ts`. Currently **`v24`**.

- ANY change to scoring / scaling / filter / breakfast template / slot allocation → **bump** it.
- Downstream cache readers (`VerifyIngredients.tsx` for procurement etc.) MUST `import { ALGO_VERSION }`, never hardcode the version string.

### Stripe price IDs are whitelisted (live mode)
Live-mode IDs live in TWO places — both must update together:
- `src/pages/Pricing.tsx`
- `supabase/functions/stripe-webhook/index.ts` → `ALLOWED_PRICE_IDS`
- Plus the same whitelist in `create-checkout-session/index.ts`

Adding a SKU: confirm the price exists in **live** Stripe (test-mode IDs = silent 4xx).

---

## Algorithm (live in `useWeeklyMenu.ts` + `useSupabaseMenu.ts`)

- **5-axis `scoreDish`**: goal / taste / spice / hometown / health-tags + learned `prefScores`
- **Allergen hard filter** (NOT score) — `ALLERGEN_TO_INGREDIENTS` map in `useSupabaseMenu`
- **Per-member slot allocation** (`memberMainSlots`) — for divergent-goal households (e.g. 备孕 wife + 增肌 husband), dinner main slots 0/1 are assigned to home members 0/1 with 1.5× amplified per-member scoring
- **Per-day headcount**: `loadHomeByDay()` / `saveHomeForDay(idx, ids)` in `familyPrefs.ts`. Both WeeklyMenu (generation) and VerifyIngredients (procurement scaling) read this
- **Cuisine pre-filter** pushed into PostgREST: `applyCuisineFilter(query, mode)` from `src/lib/cuisineFilter.ts`
- **Breakfast template**: dry staple + wet drink + side (`WET_BREAKFAST_KEYWORDS` / `DRY_BREAKFAST_KEYWORDS` in `useSupabaseMenu`)
- **Same-day title-keyword hard dedup** (`dayTitleKeywords`)
- **粥 / 稀饭 banned from dinner main loop**
- **Mixed-spice arrangement** (`mixedSpice slotSpiceBoost`)
- **Intent parsing**: `parseIntent()` in `src/lib/intentBias.ts` → edge function `parse-intent` → IntentTag (incl. 4 TCM + 8 wellness axes)

---

## DB conventions

- `dish_ids` columns are **`uuid[]`**, NOT `text[]`. Manual SQL must cast `::uuid[]`.
- `user_profiles.display_name` is **required** — many sites assume non-null.
- Health-tag boolean columns: `is_low_sodium` / `is_low_sugar` / `is_low_purine` / `is_blood_tonic` / `is_sleep_aid` / `is_yin_nourish` / `is_qi_tonic` / `is_mood_boost` / `is_anti_aging` / `is_beauty` / `is_anti_inflammation` / `is_eye_care`.
- Apply migrations to remote with `supabase db push` (the user uses production Supabase; local DB is rarely truth).
- Don't run destructive DB operations (`db reset`, dropping columns, `truncate`) without explicit ack.

---

## Edge functions

All deployed with `--no-verify-jwt` (anonymous-first app):
- `stripe-webhook` — 4 events, price whitelist
- `create-checkout-session` — price whitelist + 10/day quota
- `create-portal-session`
- `parse-intent` — Gemini relay for IntentTag, 20/day quota
- `gemini-proxy` — generic Gemini relay, per-endpoint quotas
- `wechat-mp-callback` — 公众号网页授权 (currently unused; blocked on 微信认证)

Deploy: `supabase functions deploy <name> --no-verify-jwt`

---

## Dish seed pipeline (required for every new dish)

Adding a `dishes` row is NOT enough. Always run the full chain or **shopping list / prep board / nutrition strip all break**:
1. Steps generation — `scripts/gen-dish-steps-claude.ts`
2. Nutrition fill
3. 小美 ABCD tray tagging
4. Image generation

**Tray convention**: A/B/C/D = 主料 / 配菜 / 配料 / 调料 (physical trays). Within each tray: A1/A2/B1/B2/… Never abbreviate without the letter.

---

## Bulk-operation strategy

Imports, AI generation, migrations: **small batch (3–5 rows) first**, verify end-to-end, then scale. The user has been bitten by all-or-nothing failures; small-batch first is non-negotiable.

Don't kill the user's background scripts without asking — instruction interleaving is intentional, new tasks don't auto-supersede old ones.

---

## WeChat 小程序 (`wechat-mp/`)

- Web-view shell that loads `nothinkeats.com?source=wx_mp&wx_code=<code>`.
- Login.tsx reads `?source=wx_mp`, persists to `nutri_source` localStorage, hides FB/IG buttons (审核拒因).
- `/privacy` + `/terms` pages exist for 提审 review.
- Deployment blockers (user action): 业务域名 white-list + `MP_verify_*.txt` host + 服务器域名 white-list. See `wechat-mp/README.md`.
- WeChat 支付 is NOT implemented; Stripe doesn't work inside mini-programs — defer until 公众号 认证 + native pay page.

---

## What NOT to do

- Don't fix pre-existing TypeScript errors in `scripts/`, `supabase/functions/` (Deno), or unrelated files unless asked. Prod build is `vite build`, not `tsc`. The pre-existing error list is long and known.
- Don't auto-commit; ask first.
- Don't add features beyond the user's request.
- Don't write extra docs / markdown unless asked.
- Don't use emoji in code or output unless the user explicitly does first.
- Don't refactor adjacent code while fixing a bug. Surgical edits only.
- Always respond to the user in Simplified Chinese; code / paths / commit messages stay English.
