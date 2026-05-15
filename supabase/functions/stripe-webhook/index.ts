// Supabase Edge Function — POST /functions/v1/stripe-webhook
//
// Stripe calls this endpoint after every payment/subscription event. We
// translate those into is_pro flips on user_profiles.
//
// Events we handle:
//   checkout.session.completed       → initial subscription, set is_pro=true
//   customer.subscription.updated    → renewal / plan change → refresh fields
//   customer.subscription.deleted    → cancellation took effect → is_pro=false
//   invoice.payment_failed           → log; no state change yet (Stripe handles
//                                      the dunning flow; subscription will be
//                                      deleted later if it stays unpaid)
//
// Required environment variables (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY        sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET    whsec_... from Stripe → Developers → Webhooks
//   SUPABASE_URL             auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  auto-injected (service role bypasses RLS)
//
// Deploy with:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   (Stripe doesn't send an Authorization header, so JWT verification must be off.)
//
// Configure on Stripe side:
//   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
//   2. URL: https://<PROJECT>.functions.supabase.co/stripe-webhook
//   3. Events: checkout.session.completed,
//              customer.subscription.updated,
//              customer.subscription.deleted,
//              invoice.payment_failed
//   4. Copy the signing secret → set STRIPE_WEBHOOK_SECRET.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// Maps Stripe Price IDs back to our internal plan strings. Keep in sync with
// src/pages/Pricing.tsx STRIPE_PRICE_IDS.
const PRICE_TO_PLAN: Record<string, "pro_monthly" | "pro_halfyear" | "pro_yearly"> = {
  "price_1TXD3dL2TBEx2Gg0TRBnWrE9": "pro_monthly",   // HK$66/月
  "price_1TXDCwL2TBEx2Gg0n6pSJLsJ": "pro_halfyear",  // HK$199/半年
  "price_1TXDDjL2TBEx2Gg05nADOkJb": "pro_yearly",    // HK$365/年
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (e) {
    console.error("Invalid Stripe signature:", (e as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency: if we've already processed this event id, return 200 without
  // doing anything. Stripe retries failed deliveries for up to 3 days.
  const { data: existing } = await supabase
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (existing) {
    return new Response("Already processed", { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        console.warn("Invoice payment failed:", (event.data.object as any).id);
        break;
      default:
        // Unhandled event types are still logged so we have an audit trail.
        break;
    }

    await supabase.from("stripe_events").insert({
      id:              event.id,
      type:            event.type,
      user_id:         extractUserId(event),
      customer_id:     extractCustomerId(event),
      subscription_id: extractSubscriptionId(event),
      payload:         event as any,
    });

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(`stripe-webhook ${event.type} failed:`, e);
    return new Response(`Handler failed: ${(e as Error).message}`, { status: 500 });
  }
});

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn("Checkout session has no client_reference_id:", session.id);
    return;
  }

  // The subscription is created at the same time as the session; fetch it
  // to read the price + period_end fields.
  const subscriptionId = session.subscription as string | null;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscriptionRow(userId, subscription, session.customer as string);
}

async function onSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.warn("Subscription has no user_id metadata:", subscription.id);
    return;
  }
  await syncSubscriptionRow(userId, subscription, subscription.customer as string);
}

async function onSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) return;
  await supabase
    .from("user_profiles")
    .update({
      is_pro: false,
      subscription_plan: null,
      subscription_end_at: new Date(subscription.ended_at! * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function syncSubscriptionRow(
  userId: string,
  subscription: Stripe.Subscription,
  customerId: string,
) {
  const priceId = subscription.items.data[0]?.price.id ?? "";
  const plan = PRICE_TO_PLAN[priceId] ?? "pro_monthly";
  const isPro =
    subscription.status === "active" || subscription.status === "trialing";

  // Use UPSERT so a row gets created when this is the user's first paid
  // checkout (e.g. the test-phase localStorage userId doesn't have a
  // pre-existing user_profiles row yet). Also surfaces errors instead of
  // silently swallowing them.
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        id:                      userId,
        is_pro:                  isPro,
        subscription_plan:       plan,
        subscription_end_at:     new Date(subscription.current_period_end * 1000).toISOString(),
        stripe_customer_id:      customerId,
        stripe_subscription_id:  subscription.id,
        updated_at:              new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select();

  if (error) {
    console.error("syncSubscriptionRow upsert failed:", userId, error);
    throw new Error(`user_profiles upsert failed: ${error.message}`);
  }
  console.log("syncSubscriptionRow OK:", userId, "→", data?.length, "rows touched");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractUserId(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  return (
    obj.client_reference_id ??
    obj.metadata?.user_id ??
    null
  );
}

function extractCustomerId(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  return typeof obj.customer === "string" ? obj.customer : null;
}

function extractSubscriptionId(event: Stripe.Event): string | null {
  const obj = event.data.object as any;
  if (obj.object === "subscription") return obj.id;
  if (typeof obj.subscription === "string") return obj.subscription;
  return null;
}
