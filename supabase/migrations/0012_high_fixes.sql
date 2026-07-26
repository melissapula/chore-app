-- ============================================================================
-- Chore App — 0012 audit High fixes (H1, H2, H3)
--
-- H1. redeem_quest() double-spend race. It locked the QUEST row, but two
--     DIFFERENT ready quests for the same kid lock different rows and don't
--     serialize — both read the same pre-debit balance and both post a negative
--     entry (→ balance can go negative). Fix: take a per-kid advisory lock after
--     identifying the kid, so a concurrent redeem for that kid waits and then
--     sees the first debit.
--
-- H2. approve_paid_instance() only checked state = 'SUBMITTED', so it would
--     APPROVE a *required* chore that reached SUBMITTED — writing a phantom $0
--     ledger row and an invalid APPROVED state that the weekly gate counts in
--     required_total but never in required_done → the week is held forever.
--     Fix: guard chore_type = 'paid'. (release() gets the matching guard in the
--     NestJS service.)
--
-- H3. "One active guild quest per household" (SPEC §4d) was app-enforced only
--     (guild.service archives before inserting). A race can leave two active,
--     and the read side's .maybeSingle() then 500s the whole /guild view. Fix:
--     a partial unique index makes two active guild quests impossible.
-- ============================================================================

set search_path = chore, public;

-- ---------------------------------------------------------------------------
-- H1 — serialize personal-quest redemption per kid.
-- ---------------------------------------------------------------------------
create or replace function chore.redeem_quest(p_quest_id uuid)
returns chore.quests
language plpgsql security definer set search_path = '' as $$
declare
  q                chore.quests;
  spendable        int;
  caller_household uuid;
  caller_is_parent boolean;
begin
  select household_id, (role = 'parent')
    into caller_household, caller_is_parent
    from chore.users where id = auth.uid();
  if caller_household is null then
    raise exception 'not a household member';
  end if;
  if not caller_is_parent then
    raise exception 'only a parent can redeem a quest';
  end if;

  select * into q from chore.quests where id = p_quest_id for update;
  if q.id is null then
    raise exception 'quest not found';
  end if;
  if q.household_id <> caller_household then
    raise exception 'quest belongs to another household';
  end if;
  if q.scope <> 'personal' then
    raise exception 'only personal quests are redeemable';
  end if;
  if q.status <> 'active' then
    raise exception 'quest is %', q.status;
  end if;

  -- Serialize all redemptions for THIS kid: two ready quests can both read
  -- "affordable" against the same balance, so hold a per-kid lock (until commit)
  -- while we read spendable and post the debit. A concurrent redeem for the same
  -- kid blocks here, then sees this transaction's committed debit.
  perform pg_advisory_xact_lock(hashtextextended(q.kid_id::text, 0));

  select coalesce(sum(delta_cents), 0) into spendable
    from chore.ledger_entries where kid_id = q.kid_id;
  if spendable < q.target_xp then
    raise exception 'not enough XP (% of %)', spendable, q.target_xp;
  end if;

  insert into chore.ledger_entries
    (household_id, kid_id, delta_cents, reason, quest_id, note)
  values
    (q.household_id, q.kid_id, -q.target_xp, 'quest_redeemed', q.id, q.title);

  update chore.quests
     set status = 'redeemed', redeemed_at = now()
   where id = q.id
   returning * into q;

  return q;
end;
$$;

-- ---------------------------------------------------------------------------
-- H2 — approve is paid-only. Guard chore_type so a required chore that reached
-- SUBMITTED can't be approved into a bogus APPROVED + $0 ledger row.
-- ---------------------------------------------------------------------------
create or replace function chore.approve_paid_instance(p_instance_id uuid)
returns chore.chore_instances
language plpgsql security definer set search_path = '' as $$
declare
  inst             chore.chore_instances;
  caller_household uuid;
  caller_is_parent boolean;
begin
  select household_id, (role = 'parent')
    into caller_household, caller_is_parent
    from chore.users where id = auth.uid();

  if caller_household is null then
    raise exception 'not a household member';
  end if;
  if not caller_is_parent then
    raise exception 'only a parent can approve';
  end if;

  select * into inst from chore.chore_instances
    where id = p_instance_id for update;

  if inst.id is null then
    raise exception 'instance not found';
  end if;
  if inst.household_id <> caller_household then
    raise exception 'instance belongs to another household';
  end if;
  if (select chore_type from chore.chores where id = inst.chore_id) <> 'paid' then
    raise exception 'approve is for paid chores; use confirm for required chores';
  end if;
  if inst.state <> 'SUBMITTED' then
    raise exception 'instance is % , expected SUBMITTED', inst.state;
  end if;

  update chore.chore_instances
    set state = 'APPROVED', approved_at = now(), approved_by = auth.uid()
    where id = p_instance_id
    returning * into inst;

  insert into chore.ledger_entries
    (household_id, kid_id, delta_cents, reason, chore_instance_id)
  values
    (inst.household_id, inst.claimed_by, inst.value_cents_snapshot,
     'chore_approved', inst.id);

  return inst;
end;
$$;

-- ---------------------------------------------------------------------------
-- H3 — at most one active guild quest per household, enforced by the DB.
-- (Safe to create: a household has 0–1 active guild quests today. If this ever
-- fails on apply, dedupe the extra active guild quest first.)
-- ---------------------------------------------------------------------------
create unique index if not exists quests_one_active_guild
  on chore.quests (household_id)
  where scope = 'guild' and status = 'active';
