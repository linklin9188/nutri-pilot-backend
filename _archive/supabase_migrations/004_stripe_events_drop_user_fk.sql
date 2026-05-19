-- stripe_events.user_id originally referenced auth.users(id). The app uses a
-- custom localStorage user id rather than Supabase Auth, so the FK rejected
-- every webhook insert (silently — the webhook swallowed the error and Stripe
-- saw a 200). Drop it so audit/idempotency rows can land.
ALTER TABLE public.stripe_events
  DROP CONSTRAINT IF EXISTS stripe_events_user_id_fkey;
