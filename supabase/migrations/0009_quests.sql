-- ============================================================================
-- Chore App — 0009 quests + XP (SPEC §4d, build step 8)
-- Personal reward quests: a kid sets an XP-priced reward target and, once their
-- spendable XP (ledger balance) reaches it, a parent "grants" it in real life —
-- the app writes a negative `quest_redeemed` ledger entry and closes the quest.
-- No envelope allocation: it's a store against the single balance, so two quests
-- can both read "ready" and redeeming one may un-ready the other.
--
-- Lifetime level is derived (sum of positive deltas), computed client-side — no
-- table here. Guild quests share this table (scope='guild') but land in step 9.
-- ============================================================================

set search_path = chore, public;

create type quest_scope  as enum ('personal', 'guild');
create type quest_status as enum ('active', 'redeemed', 'archived');

-- Redemptions are a new ledger reason (negative delta). Safe to add in this txn
-- since we only reference it inside a function body (executed later, not now).
alter type chore.ledger_reason add value if not exists 'quest_redeemed';

create table chore.quests (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references chore.households (id) on delete cascade,
  scope        quest_scope  not null default 'personal',
  kid_id       uuid references chore.users (id) on delete cascade,  -- null for guild
  title        text not null,
  reward       text,
  target_xp    int  not null check (target_xp > 0),   -- cents; 1 XP = 1¢
  status       quest_status not null default 'active',
  started_at   timestamptz  not null default now(),   -- guild counts XP from here
  deadline     date,
  redeemed_at  timestamptz,
  created_at   timestamptz  not null default now(),

  constraint personal_has_kid  check (scope <> 'personal' or kid_id is not null),
  constraint guild_has_no_kid  check (scope <> 'guild'    or kid_id is null)
);
create index quests_household_idx on chore.quests (household_id);
create index quests_kid_idx       on chore.quests (kid_id);

-- Link a redemption entry back to its quest (nullable; other reasons don't use it).
alter table chore.ledger_entries
  add column quest_id uuid references chore.quests (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS: kids manage their own personal quests; everyone sees guild quests;
-- parents manage all. Mirrors the goals policies (SPEC §7).
-- ---------------------------------------------------------------------------
alter table chore.quests enable row level security;

create policy quests_select on chore.quests
  for select using (
    household_id = chore.app_household_id()
    and (chore.app_is_parent() or kid_id = auth.uid() or scope = 'guild')
  );

create policy quests_kid_own on chore.quests
  for all
  using (
    household_id = chore.app_household_id()
    and kid_id = auth.uid()
    and scope = 'personal'
  )
  with check (
    household_id = chore.app_household_id()
    and kid_id = auth.uid()
    and scope = 'personal'
  );

create policy quests_parent_all on chore.quests
  for all
  using (household_id = chore.app_household_id() and chore.app_is_parent())
  with check (household_id = chore.app_household_id() and chore.app_is_parent());

grant all on chore.quests to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Redeem a personal quest (parent): verify spendable XP ≥ target, write the
-- negative ledger entry, and close the quest — atomically.
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

grant execute on function chore.redeem_quest(uuid) to authenticated, service_role;
