# BETA_READINESS_RUNBOOK.md

> One-shot β-launch self-test endpoint. CEO can `curl` any time and see all 7
> critical dependencies' health in one JSON. Ticket: TELEPOT-20260520-065.

---

## Quick-start

```bash
curl -sS "https://qoyuafqqkfyrqlthsvws.supabase.co/functions/v1/beta-readiness-check" | jq
```

No auth required (deploy `--no-verify-jwt`; read-only endpoint, no sensitive data).

## What gets checked

| # | check | what | severity if ko |
|---|---|---|---|
| 1 | `stripe_price_whitelist` | 3 ALLOWED_PRICE_IDS resolve to active Stripe prices | YELLOW |
| 2 | `gemini_quota_remaining` | each gemini-proxy endpoint has ≥ 10% daily quota left | YELLOW |
| 3 | `tables_exist` | 8 critical tables/views all present | **RED** |
| 4 | `user_weekly_menus_stale` | 0 rows with NULL algo_version (Smell 4 收口) | **RED** |
| 5 | `ingredient_seasonality_count` | ≥ 60 rows (Database 065 baseline) | **RED** |
| 6 | `data_health_history_recent` | latest snapshot < 26h ago (cron 02:30 HKT runs daily) | YELLOW |
| 7 | `dau_snapshot_callable` | dau-snapshot endpoint returns 200 + 6 fields | YELLOW |

`overall` aggregates:
- **RED** — any of #3 / #4 / #5 failed → β cannot launch
- **YELLOW** — any other check failed → review but launch OK
- **GREEN** — all 7 ok

## Expected first-run sample (2026-05-20T15:06 UTC)

```json
{
  "ts": "2026-05-20T15:06:22.732Z",
  "checks": {
    "stripe_price_whitelist": { "ok": true,  "count": 3, "ids": [3 IDs], "missing": [] },
    "gemini_quota_remaining": { "ok": false, "endpoints": { ... translate 50/50 used ... } },
    "tables_exist":           { "ok": true,  "missing": [], "found": [8 tables] },
    "user_weekly_menus_stale":{ "ok": true,  "distribution": { "NULL": 0, "legacy_pre_v44": 337, "v43": 20, "v44": 20 } },
    "ingredient_seasonality_count": { "ok": true, "count": 63 },
    "data_health_history_recent":   { "ok": true, "latest_snapshot_age_hours": 2.1 },
    "dau_snapshot_callable":  { "ok": true, "status": 200, "has_required_fields": true }
  },
  "overall": "YELLOW"
}
```

YELLOW caused by `gemini_quota_remaining` translate endpoint exhausted from
the TICKET-029/035/050 batch runs (legacy `v2:003979ef` quota namespace burned).
This rolls over at UTC midnight; if YELLOW persists after that, investigate.

## Common failures & remediation

| symptom | likely cause | fix |
|---|---|---|
| `tables_exist.missing` includes any table | a migration didn't apply | `supabase db push --linked` |
| `user_weekly_menus_stale.distribution.NULL > 0` | Smell 4 NULL backfill incomplete | Algorithm dept ticket to backfill `algo_version` |
| `ingredient_seasonality_count < 60` | Database 065 backfill incomplete | Database dept ticket |
| `data_health_history_recent.latest_snapshot_age_hours > 26` | snapshot cron didn't run | check GitHub Actions "Daily Data Health Snapshot" workflow |
| `dau_snapshot_callable.status != 200` | dau-snapshot edge function down / SERVICE_ROLE_KEY missing | redeploy dau-snapshot |
| `stripe_price_whitelist.missing` non-empty | a price was deactivated in Stripe | revert in Stripe Dashboard OR update ALLOWED_PRICE_IDS in 3 places (Pricing.tsx / stripe-webhook / create-checkout-session / beta-readiness-check) |

## Deploy / redeploy

```bash
supabase functions deploy beta-readiness-check --no-verify-jwt
```

## Source

`supabase/functions/beta-readiness-check/index.ts` — read-only, no DB writes.
Updated alongside any new "critical dependency" (add to `REQUIRED_TABLES` /
`GEMINI_ENDPOINT_LIMITS` / `ALLOWED_PRICE_IDS` constants when those change).
