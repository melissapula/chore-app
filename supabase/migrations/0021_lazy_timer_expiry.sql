-- ============================================================================
-- Chore App — 0021 lazy start-timer expiry
--
-- The start-timer was only enforced by the backend's per-minute cron sweep. The
-- backend sleeps when idle (Render free tier), so while it slept a lapsed claim
-- stayed CLAIMED: the claimer could still start it late, and siblings couldn't
-- claim it. Timers are stored deadlines (SPEC §4), so the transition RPCs now
-- compare them to now() themselves instead of relying on the sweep:
--
--   - claim_instance: a CLAIMED instance whose start_deadline has passed counts
--     as OPEN and can be claimed (by anyone eligible, including the old claimer).
--   - start_instance: refuses to start once start_deadline has passed.
--
-- The sweep still runs when the backend is awake and tidies lapsed claims back
-- to OPEN; it's now hygiene, not the enforcement point.
-- ============================================================================

-- OPEN (or a lapsed CLAIMED) → CLAIMED (paid). Same as 0011 plus the lapse check.
create or replace function chore.claim_instance(p_instance_id uuid)
returns chore.chore_instances
language plpgsql security definer set search_path = '' as $$
declare
  inst      chore.chore_instances;
  ch        chore.chores;
  hh        chore.households;
  caller_hh uuid;
  timer_min int;
  is_lapsed boolean;
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
  -- coalesce: a null deadline must read as "not lapsed", never as unknown.
  is_lapsed := coalesce(inst.state = 'CLAIMED' and inst.start_deadline <= now(), false);
  if inst.state <> 'OPEN' and not is_lapsed then
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

-- CLAIMED → IN_PROGRESS (paid). Same as 0013 plus the start-deadline check.
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
  if inst.start_deadline <= now() then
    raise exception 'the start timer ran out — claim it again';
  end if;

  select * into ch from chore.chores where id = inst.chore_id;
  select * into hh from chore.households where id = inst.household_id;
  timer_min := coalesce(ch.finish_timer_mins, hh.default_finish_timer_mins);

  update chore.chore_instances
     set state              = 'IN_PROGRESS',
         started_at         = now(),
         finish_deadline    = now() + make_interval(mins => timer_min),
         finish_notified_at = null
   where id = p_instance_id
   returning * into inst;
  return inst;
end;
$$;
