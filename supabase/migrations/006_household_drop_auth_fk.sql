-- Drop FK constraints from household tables to auth.users.
--
-- Why: This app uses a custom-auth model. Anonymous users come through
-- QuickSetup (no Supabase Auth row, only a localStorage UUID) and need to
-- be able to bind as a household helper. The existing FK
-- household_members.helper_id → auth.users(id) made every anonymous bind
-- attempt fail with constraint violation 23503, silently breaking the
-- helper invite flow for the majority of users.
--
-- households.employer_id had the same FK and the same problem — an
-- anonymous employer creating a household at first login would also fail.
--
-- The id columns stay UUID so a real Supabase Auth session can still
-- write its session.user.id when one exists; we just don't *require* it.
-- Matches the same pattern as migration 004_stripe_events_drop_user_fk.sql.

ALTER TABLE IF EXISTS household_members
  DROP CONSTRAINT IF EXISTS household_members_helper_id_fkey;

ALTER TABLE IF EXISTS households
  DROP CONSTRAINT IF EXISTS households_employer_id_fkey;
