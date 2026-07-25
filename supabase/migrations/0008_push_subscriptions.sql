-- ============================================================================
-- Chore App — 0008 web push subscriptions (SPEC §7, build step 7)
-- Stores each device's Web Push endpoint so the backend can notify a user:
-- parents when a chore is submitted / a timer expires, kids when approved.
--
-- One row per browser/device (endpoint is unique). A user owns their own rows;
-- the backend SENDS via the service role (reads across the household).
-- ============================================================================

set search_path = chore, public;

create table chore.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references chore.users (id) on delete cascade,
  household_id uuid not null references chore.households (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,   -- client public key (from the PushSubscription)
  auth         text not null,   -- client auth secret
  created_at   timestamptz not null default now()
);
create index push_subscriptions_user_idx on chore.push_subscriptions (user_id);
create index push_subscriptions_household_idx
  on chore.push_subscriptions (household_id);

alter table chore.push_subscriptions enable row level security;

-- A user manages only their own device subscriptions. Sending uses the service
-- role (bypasses RLS), like the cron sweep.
create policy push_subscriptions_own on chore.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant all on chore.push_subscriptions to anon, authenticated, service_role;
