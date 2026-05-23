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
Constant in `src/hooks/useWeeklyMenu.ts`. Currently **`v61`** (bumped 2026-05-23 by TICKET-025: reader 把 0 IU / 0 mg 视为有效真值参与, 显式分离 null/undefined skip vs 0 不命中 — Backend 023 ship vitamin_d_iu fill 100% 后 0 是物理真值不是缺失; v60 by TICKET-024: dynamic K — `computeUserDiversity(imagePrefs, familyPrefs)` + `dynamicK(slotType, diversity)` 在 SLOT_BASE_K 基础上动态调 topK/pick, 单一偏好缩 (max(2, baseK-2)) / 多样偏好扩 (min(7, baseK+2)), 5 处硬编码替换; v59 by TICKET-022 P0 hot-fix: 💪 channel column shape mismatch — NUTRIENT_COLUMN_MAP 独立列 reader (iron→iron_mg / vitamin_d→vitamin_d_iu / omega3→omega3_mg / zinc→zinc_mg / fiber→fiber_g / vitamin_c→vitamin_c_mg / protein→protein_g / calcium→calcium_mg), DISH_FIELDS SELECT 同步加 7 列, 删 NUTRIENT_BOOL_FALLBACK + qi_tonic/mood_boost/anti_aging placeholder (wellness bool 列 dead schema 0% 填充); v58 by TICKET-020: lunch/dinner slots[] + weekStats edge fn; v57 by TICKET-019: jsonb unwrap; v55 by TICKET-018: 5-channel slots[].candidates[]; previous bumps v51→v52→v54 on TICKET-016/017; Smell 4 fix 2026-05-19 retired the two localStorage sentinels in favor of DB columns `user_weekly_menus.algo_version` + `cache_key`).

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

- **5-axis `scoreDish`**: goal / taste / spice / hometown / health-tags + learned `prefScores` (confidence-scaled: cold-start weight 0.35, after ~30 non-zero tag signals → 1.50, which outranks the 1.0 profile baseline. Per product principle: 使用数据 > 画像数据)
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
- `user_profiles.display_name` —— 应用层假设非空 (many sites read it directly without null-check)，**但生产 DB 实际是 nullable**（Database 部门 2026-05-19 P3 核查证实 `information_schema.columns` is_nullable=YES）。这是 schema 与代码假设的偏离，未来要么把 DB 改成 `NOT NULL` 配 default、要么前端全面 null-safe。本轮（Smell 4 + Smell 1 阶段 1）不动它，遇到 NULL 行会 fallback 到 `userId.slice(0,8)` 之类的兜底。
- `user_profiles` 主键叫 **`id text`**（**text 不是 uuid**；Database 2026-05-19 P3 实查 `information_schema` 证实）。**没有单独的 `user_id` 列**——`getUserId()` 返回的 string 就直接对应 `user_profiles.id`。FK 目标必须写 `user_profiles(id)`，不要写 `user_profiles(user_id)`（不存在）。注意：`household_members.helper_id` 是 `uuid` 类型，要 JOIN `user_profiles.id` 需要 cast：`hm.helper_id::text = up.id`。这一不一致也意味着 B-1 migration 在加 FK 前必须先把 `helper_id` `ALTER COLUMN TYPE text USING helper_id::text`。
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

---

## Known Architectural Smells (待整理)

Bugs we tripped over 2026-05-18. Not proposing fixes here — just so the
next session doesn't burn time re-deriving them.

### Smell 1 — Home and WeeklyMenu run two independent menu algorithms

Home renders via `useRecommendDishes` (in `src/hooks/useSupabaseMenu.ts`),
WeeklyMenu page renders via `useWeeklyMenu/generateWeekPlan` (in
`src/hooks/useWeeklyMenu.ts`). Different scoring functions
(`scoreDish` vs `scoreForWeek`), different sampling (sort-then-template
vs weightedRandom), different cache layers, different 粥 strip behavior.

**Phase 1 fix shipped 2026-05-19** (see `docs/DIAG_smell1_two_algos.md`,
direction A phase 1): Home 午/晚 tab now permanently renders
`weeklyMenu.days[todayIdx]` with skeleton during load — no longer falls back to
`useRecommendDishes`. The fallback hook is retained for fruit slot + breakfast
path only. Two scoring pipelines still both run; **phase 2** (merge `scoreDish`
into `scoreForWeek`, drop `useRecommendDishes` entirely, bump ALGO_VERSION to
v40) is the root fix and is pending CEO scheduling.

**3 hidden dimensions** not in the original write-up (discovered by Algorithm
2026-05-19, see `docs/DIAG_smell1_two_algos.md` §1):

1. **Same-day title-keyword hard dedup** lives only in `useWeeklyMenu`
   (`dayTitleKeywords` + `extractTitleKeyword` at `useWeeklyMenu.ts:870-916`).
   `useSupabaseMenu` only has cross-meal ID dedup — different dedup dimension
   entirely. Rules touching one don't reach the other.
2. **Fruit fallback slot** lives only in `useRecommendDishes`
   (`useSupabaseMenu.ts:1690-1716`). WeeklyMenu's `day.dishes` carries no fruit
   — Home stitches it back from `recommendedDishes` (`Home.tsx:524, 551, 560`)
   even when reading from `weeklyMenu`.
3. **Breakfast is a third independent path**: page-level
   `src/pages/WeeklyMenu.tsx:70-88` and `src/pages/Home.tsx:489-519` both run
   their own `pickBreakfastCombo` directly — not via either hook. So Smell 1
   is actually "three menus, not two" for breakfast specifically.

### Smell 2 — User profile stored in two places with no sync layer

localStorage: `userHometown` (values like `east` / `southwest` from the
new 地域大区 ids, or legacy `guangdong` / `sichuan`); `dietaryGoal`
(`growth` / `muscle` / etc. — see `userPrefs.ts`); `taste_pref` /
`quickPrefs.taste`. DB `user_profiles`: `hometown_cuisine` (DB-bucket
values like `jiangnan` / `cantonese`), `dietary_goal` (`muscle_gain` /
etc.), `taste_pref` (`light` / `spicy`). Mapping happens at read time
via `HOMETOWN_TO_DB_BUCKETS` but writes don't symmetrically propagate.
Result: hometown shown in UI ≠ hometown used in scoring on edge cases,
and any new field added to one side won't reach the other.

### Smell 3 — `households`/`household_members` 嵌入查询与 RLS 与匿名 Auth 三方冲突 (B-1 RESOLVED 2026-05-19; verify 2026-05-23)

**B-1 已修复 2026-05-19**（migration 025 `b0458eb` + 026 `71bfc18`）。Database 2026-05-23
工单 024 在 migration 077 跑 information_schema DO block verify 留证据，4 项全过：

- `household_members.helper_id` type = **text**（025 §3 ALTER COLUMN TYPE 已生效）
- FK `household_members_helper_id_fkey` count = **1**（025 §4 ADD CONSTRAINT 已生效）
- `households` + `household_members` 当前 policy = **2 条 anon-first FOR ALL `USING (true)`**
  （`households_anon_full` + `household_members_anon_full`，025 §2 DROP 5 旧 auth.uid() policy
  + §5 CREATE 2 条 FOR ALL 等价覆盖原 5 cmd 维度）
- 残留孤儿 helper_id = **0 行**（025 §1 DELETE + FK CASCADE 保证）

原 root-cause（保留历史参考）：
- (a) 嵌入资源关系不存在 — `Home.tsx:425` PostgREST 嵌入依赖
  `household_members.helper_id → user_profiles` FK，025 已补
- (b) RLS 依赖 `auth.uid()` 与匿名 Auth 冲突，INSERT 静默失败 — 025 已替换为 USING (true)

**B-2 待办（Backend 部门，独立 ticket）**：`Home.tsx:425` 嵌入语法加 `!helper_id`
alias hint；3 处 INSERT 加 error 兜底（不要 try/catch 吞错，让 PostgREST 真相露出）。

⚠️ 残留收紧建议（未来 ticket）：原 migration 001 "helper can read household by invite code"
USING (true) 等于 households 全表对匿名读者开放；当前 anon-first FOR ALL 沿用此模型，
真要做 RLS 收紧需要等 JWT 接入或 PostgREST RPC。

### Smell 4 — weekly_menu cache has no algo_version column (RESOLVED 2026-05-19)

**已修复 2026-05-19**。migration `024_add_algo_version.sql` 给
`user_weekly_menus` 加了两列 `algo_version text` + `cache_key text`（均 nullable）。
前端 `useWeeklyMenu.ts` 改为：

- SELECT 取回这两列，任一 ≠ 当前 bundle 的 ALGO_VERSION / lsKey → 判 stale，重新生成；
- INSERT / UPSERT / swapDish 时同时写入这两列；
- 两个 localStorage sentinel（`weekly_menu_algo_ver` + `weekly_menu_db_cache_key`）
  路径已彻底删除，`grep -rn` 在 `src/` 下零残留。

**为什么是两列而非一列**：`algo_version` 解决算法版本失步（原 Smell 4 主因），
`cache_key` 解决 cuisine / eating / intent / dpd 等非算法维度变动时旧菜单仍被命中
的副作用（UI 实施 SPEC 时发现的 R3 漏洞）。两列同表、同 nullable text、同
"缓存失效信号"语义，物理上一起加更简洁，回滚也整体回滚。

详 `docs/SPEC_algo_version_migration.md` + Architect 26 项复审通过记录。

