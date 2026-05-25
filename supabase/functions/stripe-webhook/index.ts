// Supabase Edge Function — POST /functions/v1/stripe-webhook
//
// Stripe calls this endpoint after every payment/subscription event. We
// translate those into is_pro flips on user_profiles, or for one-time
// purchase orders (TICKET-080-B), flip order status to 'paid'.
//
// Events we handle:
//   checkout.session.completed       → 2 paths (区分逻辑见 onCheckoutCompleted):
//                                       (a) 订阅: subscription → set is_pro=true
//                                       (b) 订单 (080-B): metadata.order_ids 存在
//                                           → UPDATE orders status='paid'
//   customer.subscription.updated    → renewal / plan change → refresh fields
//   customer.subscription.deleted    → cancellation took effect → is_pro=false
//   invoice.payment_failed           → log; no state change yet (Stripe handles
//                                      the dunning flow; subscription will be
//                                      deleted later if it stays unpaid)
//   checkout.session.expired         → 订单付款会话过期 → orders status='cancelled' (080-B)
//   payment_intent.payment_failed    → 订单付款失败 → orders status='cancelled' (080-B)
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
//              invoice.payment_failed,
//              checkout.session.expired,            (080-B 订单付款过期)
//              payment_intent.payment_failed       (080-B 订单付款失败)
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
      case "checkout.session.expired":
        // TICKET-080-B: 订单付款会话超时, 反推订单 cancelled
        await onCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.payment_failed":
        // TICKET-080-B: 卡被拒等支付失败, 反推订单 cancelled
        await onPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
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
  // TICKET-080-B: 分流 — metadata.order_ids 存在 → 订单付款; 否则走旧订阅路径.
  // session.mode 也能区分 ("payment" vs "subscription") 但 metadata 是显式契约, 更稳.
  const orderIdsRaw = session.metadata?.order_ids ?? "";
  if (orderIdsRaw) {
    await onOrderCheckoutCompleted(session, orderIdsRaw);
    return;
  }

  // 订阅路径 (原逻辑)
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

// ── TICKET-080-B 订单付款分支 ─────────────────────────────────────────────────
async function onOrderCheckoutCompleted(
  session: Stripe.Checkout.Session,
  orderIdsRaw: string,
) {
  const orderIds = orderIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (orderIds.length === 0) {
    console.warn("[order-checkout.completed] empty order_ids:", session.id);
    return;
  }
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : null;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status:                   "paid",
      stripe_payment_intent_id: paymentIntentId,
      paid_at:                  nowIso,
    })
    .in("id", orderIds)
    .select("id");
  if (error) {
    console.error("[order-checkout.completed] orders UPDATE failed:", error);
    throw new Error(`orders UPDATE failed: ${error.message}`);
  }
  const updatedIds = ((data ?? []) as { id: string }[]).map(r => r.id);
  console.log(
    "[order-checkout.completed] OK:",
    `session=${session.id} requested=${orderIds.length} updated=${updatedIds.length}`,
  );

  // 写历史 (每订单一行). 失败不阻塞主流程.
  if (updatedIds.length > 0) {
    const historyRows = updatedIds.map(orderId => ({
      order_id: orderId,
      status:   "paid",
      note:     `Stripe checkout session completed (${session.id})`,
    }));
    const { error: histErr } = await supabase
      .from("order_status_history")
      .insert(historyRows);
    if (histErr) {
      console.warn("[order-checkout.completed] history INSERT failed:", histErr);
    }
  }
}

async function onCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  const orderIdsRaw = session.metadata?.order_ids ?? "";
  if (!orderIdsRaw) return;  // 订阅 session 过期 → 不动 (Stripe 自己有 dunning)
  await cancelOrders(orderIdsRaw, `Stripe checkout session expired (${session.id})`);
}

async function onPaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const orderIdsRaw = pi.metadata?.order_ids ?? "";
  if (!orderIdsRaw) return;  // 非订单付款的 PI 跳过
  await cancelOrders(orderIdsRaw, `Stripe payment_intent failed (${pi.id})`);
}

async function cancelOrders(orderIdsRaw: string, note: string) {
  const orderIds = orderIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (orderIds.length === 0) return;
  // 只 cancel 仍在 pending_payment 的, 已 paid 的别覆盖 (race condition 保护)
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .in("id", orderIds)
    .eq("status", "pending_payment")
    .select("id");
  if (error) {
    console.error("[order-cancel] orders UPDATE failed:", error);
    return;
  }
  const ids = ((data ?? []) as { id: string }[]).map(r => r.id);
  console.log("[order-cancel] cancelled:", ids.length, "of", orderIds.length);
  if (ids.length > 0) {
    await supabase.from("order_status_history").insert(
      ids.map(orderId => ({ order_id: orderId, status: "cancelled", note })),
    );
  }
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
