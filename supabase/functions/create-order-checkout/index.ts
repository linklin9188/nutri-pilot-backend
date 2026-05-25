// Supabase Edge Function — POST /functions/v1/create-order-checkout
//
// TICKET TELEPOT-20260525-080-B P0
//
// Creates a Stripe Checkout Session for a one-time PURCHASE-ORDER payment.
// This is **separate from the subscription flow** (`create-checkout-session`).
//
// 老板拍板 (Boss decision):
//   - 模式 = 简单佣金记账 (NOT Stripe Connect)
//   - 钱全进爱吃 Stripe 账户
//   - DB 记 commission, 月底跟 Inalca 对账转账
//
// Input  (JSON): { orderIds: string[], userId: string }
// Output (JSON): { url: <stripe checkout url>, id: <session id> }
//
// Flow:
//   1. SELECT orders WHERE id IN orderIds AND user_id = userId AND status='pending_payment'
//   2. 算总金额 (sum total_hkd)
//   3. 创建 Stripe Checkout Session (mode='payment', currency='hkd')
//      - 每个 order 一行 line_item (custom price, name='订单 #AE...')
//      - metadata.order_ids = orderIds.join(',') → webhook 用这个区分订单付款 vs 订阅
//   4. UPDATE orders SET stripe_session_id = session.id
//   5. 返回 { url }
//
// Required environment variables (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY            sk_test_... or sk_live_...
//   SUPABASE_URL                 auto-injected
//   SUPABASE_SERVICE_ROLE_KEY    auto-injected (service role bypasses RLS)
//
// Deploy with:
//   supabase functions deploy create-order-checkout --no-verify-jwt

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

interface OrderRow {
  id:           string;
  order_number: string;
  total_hkd:    number | string;
  status:       string;
  user_id:      string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds : [];
    const userId:   string   = typeof body?.userId === "string" ? body.userId : "";
    const returnOrigin: string = typeof body?.returnOrigin === "string"
      ? body.returnOrigin
      : "https://nothinkeats.com";

    if (!userId)               return json({ error: "userId required" }, 400);
    if (orderIds.length === 0) return json({ error: "orderIds required" }, 400);
    if (orderIds.length > 20)  return json({ error: "too many orders (>20)" }, 400);

    // §1 SELECT orders — 必须 user_id + status='pending_payment' 双校验, 防止
    // 别人订单 ID 被恶意付款
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, order_number, total_hkd, status, user_id")
      .in("id", orderIds)
      .eq("user_id", userId)
      .eq("status", "pending_payment");

    if (ordersErr) {
      console.error("[create-order-checkout] SELECT orders failed:", ordersErr);
      return json({ error: `DB error: ${ordersErr.message}` }, 500);
    }
    const rows = (orders ?? []) as OrderRow[];
    if (rows.length === 0) {
      return json({ error: "No matching pending_payment orders" }, 404);
    }
    if (rows.length !== orderIds.length) {
      console.warn(
        "[create-order-checkout] partial match:",
        `requested=${orderIds.length} found=${rows.length}`,
      );
    }

    // §2 算总金额 (only for log; Stripe 自己 sum line_items.amount)
    const totalHkd = rows.reduce((sum, o) => sum + Number(o.total_hkd || 0), 0);
    if (totalHkd <= 0) {
      return json({ error: "Total amount must be > 0" }, 400);
    }

    // §3 line_items: 每 order 一行. Stripe HKD 金额单位 = "cents" (×100, 整数)
    const lineItems = rows.map(o => ({
      price_data: {
        currency: "hkd",
        product_data: {
          name: `订单 #${o.order_number}`,
        },
        unit_amount: Math.round(Number(o.total_hkd) * 100),
      },
      quantity: 1,
    }));

    const matchedIds = rows.map(o => o.id);
    const idsParam = encodeURIComponent(matchedIds.join(","));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      // success_url 带 session_id (Stripe 自动替换 {CHECKOUT_SESSION_ID}) → OrderSuccess
      // 用这个参数 + ids 区分"乐观显示已付款" vs "等待付款"
      success_url: `${returnOrigin}/orders/success?ids=${idsParam}&session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${returnOrigin}/cart`,
      // metadata.order_ids → stripe-webhook 用这个识别订单付款 (vs 订阅)
      metadata: {
        order_ids: matchedIds.join(","),
        user_id:   userId,
      },
      // client_reference_id 也填一份方便 webhook 兜底
      client_reference_id: userId,
    });

    // §4 写 stripe_session_id 回订单表 (失败不阻塞, webhook 还能用 metadata 反查)
    const { error: updErr } = await supabase
      .from("orders")
      .update({ stripe_session_id: session.id })
      .in("id", matchedIds);
    if (updErr) {
      console.warn("[create-order-checkout] UPDATE stripe_session_id failed:", updErr);
    }

    console.log(
      "[create-order-checkout] OK:",
      `user=${userId} orders=${matchedIds.length} total_hkd=${totalHkd} session=${session.id}`,
    );

    return json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("[create-order-checkout] exception:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
