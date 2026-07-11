-- ============================================================================
-- Chore App — 0002 Row-Level Security (chore schema)
-- Tenant isolation + role rules (SPEC §7). RLS is the real security boundary,
-- not the API. Every table is keyed on household_id.
--
-- Security model:
--   * Helper fns are SECURITY DEFINER with search_path='' and fully-qualified
--     names (Supabase best practice) so they read chore.users WITHOUT triggering
--     RLS — avoids infinite recursion in policies that reference the current
--     user's household/role.
--   * The cron timer sweep and parent-creates-kid onboarding run with the
--     SERVICE ROLE, which bypasses RLS. Everything a kid/parent does
--     interactively goes through their JWT, so these policies apply.
--   * Fine-grained state-machine validation (legal transitions) lives in the
--     NestJS service layer. RLS enforces WHO can touch a household's rows.
-- ============================================================================

set search_path = chore, public;

-- ---------------------------------------------------------------------------
-- Helper functions (bypass RLS by design)
-- ---------------------------------------------------------------------------
create or replace function chore.app_household_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select household_id from chore.users where id = auth.uid()
$$;

create or replace function chore.app_is_parent()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from chore.users where id = auth.uid() and role = 'parent'
  )
$$;

-- ---------------------------------------------------------------------------
-- Onboarding: create a household and the caller's parent row atomically.
-- Sidesteps the chicken-and-egg (no chore.users row exists yet at signup).
-- Call from the client right after sign-up:
--   supabase.schema('chore').rpc('bootstrap_household', { ... })
-- ---------------------------------------------------------------------------
create or replace function chore.bootstrap_household(
  household_name text,
  display_name   text,
  avatar_emoji   text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_household uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;
  if exists (select 1 from chore.users where id = auth.uid()) then
    raise exception 'user already belongs to a household';
  end if;

  insert into chore.households (name) values (household_name)
  returning id into new_household;

  insert into chore.users (id, household_id, display_name, role, avatar_emoji)
  values (auth.uid(), new_household, display_name, 'parent', avatar_emoji);

  return new_household;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table households      enable row level security;
alter table users           enable row level security;
alter table chores          enable row level security;
alter table chore_instances enable row level security;
alter table ledger_entries  enable row level security;
alter table weekly_gates    enable row level security;
alter table goals           enable row level security;
alter table notes           enable row level security;

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
create policy households_select on households
  for select using (id = chore.app_household_id());

create policy households_update on households
  for update using (id = chore.app_household_id() and chore.app_is_parent());

-- ---------------------------------------------------------------------------
-- users — sees household members; self-onboard; parent manages members
-- (parent-creates-kid with a fresh auth id runs via service role)
-- ---------------------------------------------------------------------------
create policy users_select on users
  for select using (household_id = chore.app_household_id());

create policy users_insert_self on users
  for insert with check (id = auth.uid());

create policy users_update on users
  for update using (
    id = auth.uid()
    or (household_id = chore.app_household_id() and chore.app_is_parent())
  );

-- ---------------------------------------------------------------------------
-- chores (templates) — all members read the pool; parents author
-- ---------------------------------------------------------------------------
create policy chores_select on chores
  for select using (household_id = chore.app_household_id());

create policy chores_write_parent on chores
  for all using (household_id = chore.app_household_id() and chore.app_is_parent())
  with check (household_id = chore.app_household_id() and chore.app_is_parent());

-- ---------------------------------------------------------------------------
-- chore_instances — all members see the household pool (kids need OPEN chores).
-- Members may update (claim/start/submit); the service validates transitions.
-- Parents create/delete instances (recurring spawns run via service role).
-- ---------------------------------------------------------------------------
create policy instances_select on chore_instances
  for select using (household_id = chore.app_household_id());

create policy instances_update on chore_instances
  for update using (household_id = chore.app_household_id())
  with check (household_id = chore.app_household_id());

create policy instances_write_parent on chore_instances
  for insert with check (household_id = chore.app_household_id() and chore.app_is_parent());

create policy instances_delete_parent on chore_instances
  for delete using (household_id = chore.app_household_id() and chore.app_is_parent());

-- ---------------------------------------------------------------------------
-- ledger_entries — append-only. Kid sees own; parent sees all.
-- Kids may ONLY insert their own goal allocations (non-positive delta);
-- earnings/adjustments/payouts are parent- or service-only. No update/delete.
-- ---------------------------------------------------------------------------
create policy ledger_select on ledger_entries
  for select using (
    household_id = chore.app_household_id()
    and (chore.app_is_parent() or kid_id = auth.uid())
  );

create policy ledger_insert_parent on ledger_entries
  for insert with check (household_id = chore.app_household_id() and chore.app_is_parent());

create policy ledger_insert_kid_allocation on ledger_entries
  for insert with check (
    household_id = chore.app_household_id()
    and kid_id = auth.uid()
    and reason = 'goal_allocation'
    and delta_cents <= 0
  );

-- ---------------------------------------------------------------------------
-- weekly_gates — kid sees own; parent sees all & decides release/hold.
-- The cron sweep fills these via service role.
-- ---------------------------------------------------------------------------
create policy weekly_gates_select on weekly_gates
  for select using (
    household_id = chore.app_household_id()
    and (chore.app_is_parent() or kid_id = auth.uid())
  );

create policy weekly_gates_update_parent on weekly_gates
  for update using (household_id = chore.app_household_id() and chore.app_is_parent())
  with check (household_id = chore.app_household_id() and chore.app_is_parent());

-- ---------------------------------------------------------------------------
-- goals — kid manages own; parent views all (SPEC §7).
-- ---------------------------------------------------------------------------
create policy goals_select on goals
  for select using (
    household_id = chore.app_household_id()
    and (chore.app_is_parent() or kid_id = auth.uid())
  );

create policy goals_write_own on goals
  for all using (household_id = chore.app_household_id() and kid_id = auth.uid())
  with check (household_id = chore.app_household_id() and kid_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notes — author or recipient can read; parents read all in household.
-- Any member may post as themselves.
-- ---------------------------------------------------------------------------
create policy notes_select on notes
  for select using (
    household_id = chore.app_household_id()
    and (chore.app_is_parent() or author_id = auth.uid() or recipient_id = auth.uid())
  );

create policy notes_insert on notes
  for insert with check (
    household_id = chore.app_household_id() and author_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Grants — let the Supabase API roles reach the schema. RLS still gates rows;
-- these grants only allow the roles to attempt access at all.
-- ---------------------------------------------------------------------------
grant usage on schema chore to anon, authenticated, service_role;
grant all on all tables    in schema chore to anon, authenticated, service_role;
grant all on all routines  in schema chore to anon, authenticated, service_role;
grant all on all sequences in schema chore to anon, authenticated, service_role;

alter default privileges in schema chore
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema chore
  grant all on routines to anon, authenticated, service_role;
alter default privileges in schema chore
  grant all on sequences to anon, authenticated, service_role;
