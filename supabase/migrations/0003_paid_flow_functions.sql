-- ============================================================================
-- Chore App — 0003 paid-flow functions
-- Approving a paid chore is two writes that must be atomic: flip the instance to
-- APPROVED *and* credit the kid's ledger (SPEC §4 — earnings hit the ledger the
-- moment you approve). A partial success would either pay twice or not at all,
-- so this lives in one SECURITY DEFINER function instead of two client calls.
--
-- The other transitions (claim/start/submit/release) are single-statement
-- compare-and-set updates, so they stay in the NestJS service layer.
-- ============================================================================

set search_path = chore, public;

create or replace function chore.approve_paid_instance(p_instance_id uuid)
returns chore.chore_instances
language plpgsql security definer set search_path = '' as $$
declare
  inst             chore.chore_instances;
  caller_household uuid;
  caller_is_parent boolean;
begin
  -- Who is calling? (SECURITY DEFINER bypasses RLS, so authorize explicitly.)
  select household_id, (role = 'parent')
    into caller_household, caller_is_parent
    from chore.users where id = auth.uid();

  if caller_household is null then
    raise exception 'not a household member';
  end if;
  if not caller_is_parent then
    raise exception 'only a parent can approve';
  end if;

  -- Lock the row so a concurrent approve/release can't interleave.
  select * into inst from chore.chore_instances
    where id = p_instance_id for update;

  if inst.id is null then
    raise exception 'instance not found';
  end if;
  if inst.household_id <> caller_household then
    raise exception 'instance belongs to another household';
  end if;
  if inst.state <> 'SUBMITTED' then
    raise exception 'instance is % , expected SUBMITTED', inst.state;
  end if;

  update chore.chore_instances
    set state = 'APPROVED', approved_at = now(), approved_by = auth.uid()
    where id = p_instance_id
    returning * into inst;

  -- Credit the kid who did the work. value_cents_snapshot was locked at spawn.
  insert into chore.ledger_entries
    (household_id, kid_id, delta_cents, reason, chore_instance_id)
  values
    (inst.household_id, inst.claimed_by, inst.value_cents_snapshot,
     'chore_approved', inst.id);

  return inst;
end;
$$;

grant execute on function chore.approve_paid_instance(uuid)
  to authenticated, service_role;
