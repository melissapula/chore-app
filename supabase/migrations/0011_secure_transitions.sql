-- ============================================================================
-- Chore App — 0011 secure the RLS write boundary (audit C1 + C2)
--
-- The frontend talks to PostgREST DIRECTLY with the caller's JWT for many
-- mutations, so RLS — not the NestJS service layer — is the real boundary. Two
-- policies were too loose:
--
--   C1. users_update had no WITH CHECK, so a kid updating their own row (which
--       always satisfies id = auth.uid()) could set role='parent' (privilege
--       escalation) or household_id=<other family> (cross-tenant breach).
--
--   C2. instances_update authorized only *household*, not *actor/column/state*.
--       A kid could PATCH chore_instances directly and set
--       value_cents_snapshot huge (→ inflated payout on approve), self-CONFIRM a
--       required chore (→ beat the pay gate), or steal a sibling's claim —
--       bypassing the service-layer state machine entirely.
--
-- Fixes:
--   C1 — split users_update into a self policy (WITH CHECK pins role +
--        household so they can't change) and a parent-manages-members policy.
--   C2 — make instances_update PARENT-ONLY (release/confirm run on the parent's
--        JWT), and move every KID transition into SECURITY DEFINER RPCs that
--        re-authorize the caller and are the only kid write-path. Now a kid has
--        no direct UPDATE on chore_instances at all.
-- ============================================================================

set search_path = chore, public;

-- ---------------------------------------------------------------------------
-- Helper: caller's role, read without triggering RLS (mirrors app_household_id).
-- ---------------------------------------------------------------------------
create or replace function chore.app_role()
returns text language sql stable security definer set search_path = '' as $$
  select role::text from chore.users where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- C1 — users: pin role + household on self-update; parents manage members but
-- can't move a member to another household.
-- ---------------------------------------------------------------------------
drop policy if exists users_update on chore.users;

create policy users_update_self on chore.users
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role::text = chore.app_role()          -- cannot promote self to parent
    and household_id = chore.app_household_id() -- cannot jump households
  );

create policy users_update_parent on chore.users
  for update using (
    household_id = chore.app_household_id() and chore.app_is_parent()
  )
  with check (
    household_id = chore.app_household_id() and chore.app_is_parent()
  );

-- ---------------------------------------------------------------------------
-- C2 — chore_instances: only parents may UPDATE directly (release / confirm run
-- on the parent JWT). Kids transition ONLY through the RPCs below. The cron
-- sweep still runs as the service role (bypasses RLS).
-- ---------------------------------------------------------------------------
drop policy if exists instances_update on chore.chore_instances;

create policy instances_update_parent on chore.chore_instances
  for update using (
    household_id = chore.app_household_id() and chore.app_is_parent()
  )
  with check (
    household_id = chore.app_household_id() and chore.app_is_parent()
  );

-- ---------------------------------------------------------------------------
-- Kid transition RPCs (SECURITY DEFINER). Each locks the row, re-authorizes the
-- caller against the DB (not client input), validates the current state, and
-- computes timers server-side. Illegal jumps / lost races raise, which the
-- service maps to 4xx. These mirror the service-layer logic that used to run on
-- the kid's JWT — now enforced in the DB so a direct PostgREST call can't skip
-- it.
-- ---------------------------------------------------------------------------

-- OPEN → CLAIMED (paid). Atomic sibling race: the row lock serializes claimers;
-- the loser re-reads a non-OPEN state and raises.
create or replace function chore.claim_instance(p_instance_id uuid)
returns chore.chore_instances
language plpgsql security definer set search_path = '' as $$
declare
  inst      chore.chore_instances;
  ch        chore.chores;
  hh        chore.households;
  caller_hh uuid;
  timer_min int;
begin
  select household_id into caller_hh from chore.users where id = auth.uid();
  if caller_hh is null then raise exception 'not a household member'; end if;

  select * into inst from chore.chore_instances
    where id = p_instance_id for update;
  if inst.id is null then raise exception 'instance not found'; end if;
  if inst.household_id <> caller_hh then
    raise exception 'instance belongs to another household';
  end if;

  select * into ch from chore.chores where id = inst.chore_id;
  if ch.chore_type <> 'paid' then
    raise exception 'only paid chores are claimable';
  end if;
  if inst.state <> 'OPEN' then
    raise exception 'someone else just claimed this chore';
  end if;
  -- Eligibility (SPEC §3b): null list = open to all; else caller must be listed.
  if ch.eligible_kid_ids is not null
     and not (auth.uid() = any (ch.eligible_kid_ids)) then
    raise exception 'this chore is not available to you';
  end if;

  select * into hh from chore.households where id = inst.household_id;
  timer_min := coalesce(ch.start_timer_mins, hh.default_start_timer_mins);

  update chore.chore_instances
     set state          = 'CLAIMED',
         claimed_by     = auth.uid(),
         claimed_at     = now(),
         start_deadline = now() + make_interval(mins => timer_min)
   where id = p_instance_id
   returning * into inst;
  return inst;
end;
$$;

-- CLAIMED → IN_PROGRESS (paid). Only the claimer; starts the finish-timer.
create or replace function chore.start_instance(p_instance_id uuid)
returns chore.chore_instances
language plpgsql security definer set search_path = '' as $$
declare
  inst      chore.chore_instances;
  ch        chore.chores;
  hh        chore.households;
  caller_hh uuid;
  timer_min int;
begin
  select household_id into caller_hh from chore.users where id = auth.uid();
  if caller_hh is null then raise exception 'not a household member'; end if;

  select * into inst from chore.chore_instances
    where id = p_instance_id for update;
  if inst.id is null then raise exception 'instance not found'; end if;
  if inst.household_id <> caller_hh then
    raise exception 'instance belongs to another household';
  end if;
  if inst.state <> 'CLAIMED' then
    raise exception 'instance is %, expected CLAIMED', inst.state;
  end if;
  if inst.claimed_by is distinct from auth.uid() then
    raise exception 'only the kid who claimed it can start it';
  end if;

  select * into ch from chore.chores where id = inst.chore_id;
  select * into hh from chore.households where id = inst.household_id;
  timer_min := coalesce(ch.finish_timer_mins, hh.default_finish_timer_mins);

  update chore.chore_instances
     set state           = 'IN_PROGRESS',
         started_at      = now(),
         finish_deadline = now() + make_interval(mins => timer_min)
   where id = p_instance_id
   returning * into inst;
  return inst;
end;
$$;

-- IN_PROGRESS → SUBMITTED (paid). Only the claimer.
create or replace function chore.submit_instance(p_instance_id uuid)
returns chore.chore_instances
language plpgsql security definer set search_path = '' as $$
declare
  inst      chore.chore_instances;
  caller_hh uuid;
begin
  select household_id into caller_hh from chore.users where id = auth.uid();
  if caller_hh is null then raise exception 'not a household member'; end if;

  select * into inst from chore.chore_instances
    where id = p_instance_id for update;
  if inst.id is null then raise exception 'instance not found'; end if;
  if inst.household_id <> caller_hh then
    raise exception 'instance belongs to another household';
  end if;
  if inst.state <> 'IN_PROGRESS' then
    raise exception 'instance is %, expected IN_PROGRESS', inst.state;
  end if;
  if inst.claimed_by is distinct from auth.uid() then
    raise exception 'only the kid working on it can submit it';
  end if;

  update chore.chore_instances
     set state = 'SUBMITTED', submitted_at = now()
   where id = p_instance_id
   returning * into inst;
  return inst;
end;
$$;

-- ASSIGNED → SUBMITTED (required). Only the assigned kid; no timers.
create or replace function chore.mark_done_instance(p_instance_id uuid)
returns chore.chore_instances
language plpgsql security definer set search_path = '' as $$
declare
  inst      chore.chore_instances;
  ch        chore.chores;
  caller_hh uuid;
begin
  select household_id into caller_hh from chore.users where id = auth.uid();
  if caller_hh is null then raise exception 'not a household member'; end if;

  select * into inst from chore.chore_instances
    where id = p_instance_id for update;
  if inst.id is null then raise exception 'instance not found'; end if;
  if inst.household_id <> caller_hh then
    raise exception 'instance belongs to another household';
  end if;

  select * into ch from chore.chores where id = inst.chore_id;
  if ch.chore_type <> 'required' then
    raise exception 'not a required chore';
  end if;
  if inst.state <> 'ASSIGNED' then
    raise exception 'instance is %, expected ASSIGNED', inst.state;
  end if;
  if inst.assigned_to is distinct from auth.uid() then
    raise exception 'this chore is assigned to someone else';
  end if;

  update chore.chore_instances
     set state = 'SUBMITTED', submitted_at = now()
   where id = p_instance_id
   returning * into inst;
  return inst;
end;
$$;

grant execute on function chore.app_role()                     to authenticated, service_role;
grant execute on function chore.claim_instance(uuid)           to authenticated, service_role;
grant execute on function chore.start_instance(uuid)           to authenticated, service_role;
grant execute on function chore.submit_instance(uuid)          to authenticated, service_role;
grant execute on function chore.mark_done_instance(uuid)       to authenticated, service_role;
