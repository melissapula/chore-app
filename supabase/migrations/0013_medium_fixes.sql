-- ============================================================================
-- Chore App — 0013 audit Medium fixes (DB parts)
--
-- • Finish-timer notify was windowed on the wall clock (only fired if the
--   deadline fell in the last 60s), so a >60s backend restart dropped the
--   parent notification forever. Add a persisted marker so the sweep can notify
--   exactly once via an atomic UPDATE … RETURNING (see timers.service).
-- • No non-negative guard on chore values — a negative value_cents would post a
--   negative credit on approve. Add CHECKs (matches quests.target_xp > 0).
-- ============================================================================

set search_path = chore, public;

-- One-shot "parent has been told this finish-timer expired" marker.
alter table chore.chore_instances
  add column if not exists finish_notified_at timestamptz;

-- Values can't be negative (defends the ledger credit in approve_paid_instance).
alter table chore.chores
  add constraint chores_value_nonneg check (value_cents >= 0);
alter table chore.chore_instances
  add constraint instances_value_nonneg check (value_cents_snapshot >= 0);

-- start_instance() now also clears finish_notified_at, so a fresh IN_PROGRESS
-- cycle (after a release + re-claim) is eligible to notify again.
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
     set state             = 'IN_PROGRESS',
         started_at        = now(),
         finish_deadline   = now() + make_interval(mins => timer_min),
         finish_notified_at = null
   where id = p_instance_id
   returning * into inst;
  return inst;
end;
$$;
