// Supabase Edge Function — POST /functions/v1/create-portal-session
//
// Returns a one-time URL into Stripe's hosted Customer Portal so an existing
// Pro user can update their card, switch plans, cancel, or download invoices
// without us having to build those screens.
//
// Frontend usage:
//   POST { user_id, return_url }
//   →  { url: "https://billing.stripe.com/p/session/..." }
//   then  window.location.href = url
//
// Required environment variables (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY        sk_test_... or sk_live_...
//   SUPABASE_URL             auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  auto-injected (looks up the customer id)
//
// Deploy:
//   supabase functions deploy create-portal-session
//
// Stripe side, one-time setup (Dashboard → Settings → Billing → Customer Portal):
//   1. Toggle "Customer portal" → On.
//   2. Enable the features you want: payment methods, cancel, plan switch.
//   3. Save.

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { user_id, return_url } = await req.json();
    if (!user_id) return json({ error: "user_id required" }, 400);

    // Look up the Stripe customer id we stored on first checkout.
    const { data, error } = await supabase
      .from("user_profiles")
      .select("stripe_customer_id")
      .eq("id", user_id)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    const customerId = (data as any)?.stripe_customer_id;
    if (!customerId) {
      return json({ error: "No Stripe customer for this user (have they ever subscribed?)" }, 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: return_url ?? "https://example.com",
    });

    return json({ url: session.url });
  } catch (e) {
    console.error("create-portal-session failed:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
