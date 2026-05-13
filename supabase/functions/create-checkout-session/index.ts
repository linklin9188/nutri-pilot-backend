// Supabase Edge Function — POST /functions/v1/create-checkout-session
//
// Creates a Stripe Checkout Session for a recurring subscription. The
// frontend (`src/pages/Pricing.tsx`) posts { user_id, price_id, return_url }
// and we redirect the browser to the `url` returned from Stripe.
//
// Why a server fn? The Stripe Secret Key must never reach the browser, and
// the `client_reference_id` we set here is what the webhook uses to map a
// payment back to a Supabase user.
//
// Required environment variables (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   sk_test_... or sk_live_...
//
// Deploy with: supabase functions deploy create-checkout-session
//
// Test locally: supabase functions serve create-checkout-session --no-verify-jwt

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { user_id, price_id, return_url } = await req.json();

    if (!user_id || !price_id) {
      return json({ error: "user_id and price_id are required" }, 400);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: price_id, quantity: 1 }],

      // The Stripe webhook reads this to map the payment back to a user_profile row.
      client_reference_id: user_id,
      // Mirror it in metadata so it shows up on subscription/invoice objects too.
      subscription_data: { metadata: { user_id } },

      success_url: `${return_url}?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${return_url}?status=canceled`,

      // Let Stripe collect the user's email if not provided.
      // (We don't pre-fill, since the test-phase login flow uses fake emails.)
      allow_promotion_codes: true,
    });

    return json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("create-checkout-session failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
