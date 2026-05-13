#!/usr/bin/env bash
# Deploy all three Edge Functions in one go.
#
# Pre-reqs:
#   1. `brew install supabase/tap/supabase` (or equivalent)
#   2. `supabase login`
#   3. `supabase link --project-ref <your-project-ref>`
#   4. Set the secrets BEFORE running deploy:
#      supabase secrets set \
#        STRIPE_SECRET_KEY=sk_test_... \
#        STRIPE_WEBHOOK_SECRET=whsec_...
#
# The webhook function needs --no-verify-jwt because Stripe doesn't send
# an Authorization header; we authenticate via signature instead.

set -euo pipefail
cd "$(dirname "$0")"

echo "→ Deploying create-checkout-session …"
supabase functions deploy create-checkout-session

echo "→ Deploying create-portal-session …"
supabase functions deploy create-portal-session

echo "→ Deploying stripe-webhook (no JWT verification) …"
supabase functions deploy stripe-webhook --no-verify-jwt

echo
echo "✅ All three functions deployed."
echo "Next:"
echo "  1. Copy the stripe-webhook URL printed above."
echo "  2. In Stripe Dashboard → Developers → Webhooks → Add endpoint,"
echo "     point it at that URL and listen for:"
echo "     - checkout.session.completed"
echo "     - customer.subscription.updated"
echo "     - customer.subscription.deleted"
echo "     - invoice.payment_failed"
echo "  3. Copy the Signing Secret (whsec_…) into supabase secrets."
echo "  4. Set the price_id strings in:"
echo "     - src/pages/Pricing.tsx → STRIPE_PRICE_IDS"
echo "     - supabase/functions/stripe-webhook/index.ts → PRICE_TO_PLAN"
